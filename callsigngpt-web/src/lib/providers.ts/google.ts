export async function callGoogleGemini(model: string, messages: any[], temperature = 0.2): Promise<string> {
  const key = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
  if (!key) throw new Error('Missing GOOGLE_API_KEY (or GEMINI_API_KEY)');

  // Simple text join for chat-style inputs; adapt if you support tools/multimodal
  const text = messages.map((m: any) => `${m.role}: ${m.content}`).join('\n');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text }] }],
      generationConfig: { temperature },
    }),
  });
  if (!r.ok) throw new Error(`Gemini ${r.status}: ${await r.text()}`);
  const json = await r.json();
  const out =
    json?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join('') ??
    json?.candidates?.[0]?.content?.parts?.[0]?.text ??
    '';
  return out;
}
