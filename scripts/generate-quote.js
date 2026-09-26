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

  // Skip anything that's clearly not a general text chat model.
  const excluded = /whisper|tts|guard|vision|prompt-guard/i;
  const candidates = ids.filter((id) => !excluded.test(id));

  // Prefer a well-known "versatile" large Llama model if one exists,
  // otherwise fall back to any remaining candidate.
  const preferred =
    candidates.find((id) => /llama.*70b.*versatile/i.test(id)) ||
    candidates.find((id) => /llama/i.test(id)) ||
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
  return text.trim().replace(/^["“]+|["”]+$/g, "");
}

async function saveQuestion(question) {
  const today = new Date().toISOString().slice(0, 10); // UTC date, matches the cron's UTC schedule

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
