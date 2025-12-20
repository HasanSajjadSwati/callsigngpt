import { getApiBase } from './apiBase';

const DEFAULT_TIMEOUT_MS = Number(process.env.NEXT_PUBLIC_API_TIMEOUT_MS || 15_000);

export class HttpClient {
  private readonly base: string;
  private readonly defaultHeaders: Record<string, string>;
  private readonly timeoutMs: number;

  constructor(opts?: { baseUrl?: string; headers?: Record<string, string>; timeoutMs?: number }) {
    this.base = (opts?.baseUrl ?? getApiBase()).replace(/\/$/, '');
    this.defaultHeaders = opts?.headers ?? {};
    this.timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  withHeaders(headers: Record<string, string>): HttpClient {
    return new HttpClient({
      baseUrl: this.base,
      headers: { ...this.defaultHeaders, ...headers },
      timeoutMs: this.timeoutMs,
    });
  }

  async get<T = any>(path: string, init?: RequestInit): Promise<T> {
    return this.request<T>('GET', path, undefined, init);
  }

  async post<T = any>(path: string, body?: unknown, init?: RequestInit): Promise<T> {
    return this.request<T>('POST', path, body, init);
  }

  async patch<T = any>(path: string, body?: unknown, init?: RequestInit): Promise<T> {
    return this.request<T>('PATCH', path, body, init);
  }

  async delete<T = any>(path: string, body?: unknown, init?: RequestInit): Promise<T> {
    return this.request<T>('DELETE', path, body, init);
  }

  private buildUrl(path: string): string {
    if (!this.base) return path; // same-origin fallback
    return `${this.base}${path.startsWith('/') ? '' : '/'}${path}`;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    init?: RequestInit,
  ): Promise<T> {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(this.buildUrl(path), {
        ...init,
        method,
        headers: {
          'Content-Type': 'application/json',
          ...this.defaultHeaders,
          ...(init?.headers as Record<string, string>),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status}: ${text || res.statusText}`);
      }

      const ct = res.headers.get('content-type') || '';
      if (ct.includes('application/json')) return (await res.json()) as T;
      return (await res.text()) as unknown as T;
    } finally {
      clearTimeout(id);
    }
  }
}
