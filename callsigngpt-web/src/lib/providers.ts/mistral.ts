export async function callMistral(model: string, messages: any[], temperature = 0.2): Promise<string> {
  const key = process.env.MISTRAL_API_KEY;
  if (!key) throw new Error('Missing MISTRAL_API_KEY');
  const r = await fetch('https://api.mistral.ai/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model, messages, temperature }),
  });
  if (!r.ok) throw new Error(`Mistral ${r.status}: ${await r.text()}`);
  const json = await r.json();
  return json.choices?.[0]?.message?.content ?? '';
}
