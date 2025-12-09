export async function api<T = any>(
  url: string,
  opts: RequestInit & { token?: string } = {},
): Promise<T> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL!;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(opts.headers as any),
  };
  if (opts.token) headers['Authorization'] = `Bearer ${opts.token}`;

  const res = await fetch(`${apiUrl}${url}`, {
    ...opts,
    headers,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status}: ${text || res.statusText}`);
  }
  return res.json() as Promise<T>;
}
