// FINBIQ AI via Google Gemini — server-side only. Reads GEMINI_API_KEY from
// environment (local .env, gitignored). Key is never logged, never committed,
// never sent to the browser. Without a key, callers must use rule-based fallback.
const MODEL = process.env.GEMINI_MODEL ?? "gemini-3.5-flash";

export function geminiConfigured() {
  return Boolean(process.env.GEMINI_API_KEY);
}

export async function geminiAsk(system: string, user: string): Promise<string> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY not set");
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
    {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: system }] },
        contents: [{ parts: [{ text: user }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 512 },
      }),
      signal: AbortSignal.timeout(25000),
    }
  );
  if (!r.ok) throw new Error(`gemini ${r.status}`);
  const j = (await r.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text = j.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  if (!text) throw new Error("empty gemini response");
  return text;
}

const ADVISOR_RULES = `You are FINBIQ AI, a friendly financial guide. Rules:
- Answer ONLY from the financial snapshot provided. Never invent figures.
- Quote exact numbers from the snapshot when making claims.
- Distinguish information from advice; end with one concrete next step.
- Keep answers under 120 words. Write Naira amounts as plain numbers with NGN (never use the ₦ symbol, it corrupts encoding).`;

export async function groundedAnswer(snapshot: string, question: string): Promise<string> {
  return geminiAsk(
    ADVISOR_RULES,
    `User financial snapshot (verified from ledger):\n${snapshot}\n\nUser question: ${question}`
  );
}
