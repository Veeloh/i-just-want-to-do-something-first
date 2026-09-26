// Asks Groq for one deep, "would you still do it" style question,
// then inserts it into the Supabase `quotes` table for today's (UTC) date.
//
// Requires these environment variables (set as GitHub Actions secrets):
//   GROQ_API_KEY
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY   <- the "service_role" key, NOT the anon key

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!GROQ_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing one of GROQ_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const PROMPT = `Write exactly ONE emotionally deep, thought-provoking question, in the same style as this example:

"If you could spend 5 more minutes with someone you lost, but they wouldn't remember you, would you still do it?"

Rules:
- Present a specific, vivid hypothetical scenario, not a generic prompt.
- Force a real trade-off or impossible choice, with an emotional cost either way.
- Touch on themes like loss, memory, regret, love, mortality, identity, or connection.
- Answerable in a few sentences, not an essay.
- One to three sentences long.
- Must end with a question mark.
- Avoid clichés like "one superpower" or "biggest fear."

Respond with ONLY the question itself. No quotation marks, no preamble, no explanation, no extra commentary.`;

// Groq periodically retires/renames model ids. Rather than hardcode one that
// can go stale, ask Groq what's currently available and pick a sensible
// general-purpose chat model from the list. Set the GROQ_MODEL secret to
// force a specific model id instead, if you ever want to.
async function pickModel() {
  if (process.env.GROQ_MODEL) return process.env.GROQ_MODEL;

  const res = await fetch("https://api.groq.com/openai/v1/models", {
    headers: { Authorization: `Bearer ${GROQ_API_KEY}` },
  });
  if (!res.ok) {
    throw new Error(`Groq models list error: ${res.status} ${await res.text()}`);
  }
  const { data } = await res.json();
  const ids = data.map((m) => m.id);

  // Only consider ids from known general-purpose text chat model families.
  // (An allowlist, rather than trying to blocklist every audio/vision/TTS
  // model Groq might add, since new non-text models show up over time.)
  const allowed = /llama|mixtral|gemma|qwen|deepseek|gpt-oss/i;
  // Some allowed-looking ids are still not plain text chat models
  // (e.g. Llama Guard is a moderation classifier, not a chat model).
  const excluded = /guard|vision|instruct-audio/i;

  const candidates = ids.filter((id) => allowed.test(id) && !excluded.test(id));

  const preferred =
    candidates.find((id) => /llama.*70b.*versatile/i.test(id)) ||
    candidates.find((id) => /llama.*70b/i.test(id)) ||
    candidates[0];

  if (!preferred) {
    throw new Error("No usable chat model found in Groq's model list: " + JSON.stringify(ids));
  }
  return preferred;
}

async function getQuestion() {
  const model = await pickModel();
  console.log("Using Groq model:", model);

  const url = "https://api.groq.com/openai/v1/chat/completions";
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${GROQ_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: PROMPT }],
      temperature: 1,
      max_tokens: 200,
    }),
  });

  if (!res.ok) {
    throw new Error(`Groq API error: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  const text = data.choices?.[0]?.message?.content;
  if (!text) {
    throw new Error("Groq response had no text: " + JSON.stringify(data));
  }

  // Strip stray quote marks / whitespace the model sometimes adds anyway.
  let cleaned = text.trim().replace(/^["“]+|["”]+$/g, "");

  // Belt-and-suspenders: make sure it ends in a question mark even if the
  // model forgets, so the prompt above is a guarantee, not just a request.
  if (!cleaned.endsWith("?")) {
    cleaned = cleaned.replace(/[.!]+$/, "") + "?";
  }

  return cleaned;
}

async function saveQuestion(question) {
  // Use Calgary's local calendar date, not UTC — otherwise a run that fires
  // at UTC midnight (6pm the evening before in Calgary) tags the question
  // with tomorrow's date. Handles the MDT/MST switch automatically.
  // Change the timeZone value below if you want a different reference city.
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Edmonton" });

  const res = await fetch(`${SUPABASE_URL}/rest/v1/quotes`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates", // overwrite if today's row somehow already exists
    },
    body: JSON.stringify({ date: today, text: question }),
  });

  if (!res.ok) {
    throw new Error(`Supabase insert error: ${res.status} ${await res.text()}`);
  }

  console.log(`Inserted quote for ${today}: ${question}`);
}

getQuestion()
  .then(saveQuestion)
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
