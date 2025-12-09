import { HttpClient } from './httpClient';
import { getApiBase } from './apiBase';

type ApiOpts = RequestInit & { token?: string };

/**
 * Thin wrapper over HttpClient that respects the provided HTTP method.
 * Defaults to GET when no method/body is supplied.
 */
export async function api<T = any>(url: string, opts: ApiOpts = {}): Promise<T> {
  const client = new HttpClient({
    baseUrl: getApiBase(),
    headers: opts.token ? { Authorization: `Bearer ${opts.token}` } : undefined,
  });

  const method = (opts.method || (opts.body ? 'POST' : 'GET')).toUpperCase();
  const parsedBody =
    typeof opts.body === 'string'
      ? (() => {
          try {
            return JSON.parse(opts.body);
          } catch {
            return opts.body;
          }
        })()
      : (opts.body as any);

  if (method === 'GET') return client.get<T>(url, opts);
  if (method === 'DELETE') return client.delete<T>(url, parsedBody, opts);
  return client.post<T>(url, parsedBody, opts);
}
