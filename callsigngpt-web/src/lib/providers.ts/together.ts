export async function callTogether(model: string, messages: any[], temperature = 0.2): Promise<string> {
  const key = process.env.TOGETHER_API_KEY;
  if (!key) throw new Error('Missing TOGETHER_API_KEY');
  const r = await fetch('https://api.together.xyz/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model, messages, temperature }),
  });
  if (!r.ok) throw new Error(`Together ${r.status}: ${await r.text()}`);
  const json = await r.json();
  return json.choices?.[0]?.message?.content ?? '';
}
