// Asks Gemini for one deep, "would you still do it" style question,
// then inserts it into the Supabase `quotes` table for today's (UTC) date.
//
// Requires these environment variables (set as GitHub Actions secrets):
//   GEMINI_API_KEY
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY   <- the "service_role" key, NOT the anon key

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!GEMINI_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing one of GEMINI_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY");
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

async function getQuestion() {
  const url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent";
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "x-goog-api-key": GEMINI_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      contents: [{ parts: [{ text: PROMPT }] }],
    }),
  });

  if (!res.ok) {
    throw new Error(`Gemini API error: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error("Gemini response had no text: " + JSON.stringify(data));
  }

  // Strip stray quote marks / whitespace Gemini sometimes adds anyway.
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
