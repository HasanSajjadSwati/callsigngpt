export type ChatContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

export type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string | ChatContentPart[];
};

type StreamChatArgs = {
  /** Base URL of your API. Leave '' to call your Next app (same-origin). */
  apiUrl?: string;
  /** Optional bearer token for external APIs. */
  token?: string;
  /** Request body you send to the server (model, messages, etc.). */
  payload: any;
  /** Abort controller signal (used to stop streaming). */
  signal?: AbortSignal;
  /**
   * Path of the endpoint.
   * If apiUrl === '', pass either '/api/chat' (recommended)
   * or '/chat' and we'll prefix '/api' automatically.
   * If apiUrl !== '', we call `${apiUrl}${path}` as-is (no '/api' prefix).
   */
  path?: string;
};

/**
 * Stream chat completions as an async generator of string chunks.
 *
 * Same-origin (Next route):
 *   for await (const chunk of streamChat({
 *     apiUrl: '',
 *     payload,
 *     path: '/api/chat',   // or omit to use default '/chat' → auto becomes '/api/chat'
 *   })) { ... }
 *
 * External API:
 *   for await (const chunk of streamChat({
 *     apiUrl: process.env.NEXT_PUBLIC_API_URL!,
 *     payload,
 *     path: '/chat',
 *     token: accessToken,
 *   })) { ... }
 */
export async function* streamChat({
  apiUrl = '',
  token,
  payload,
  signal,
  path = '/chat', // <-- DEFAULT now matches your backend route
}: StreamChatArgs): AsyncGenerator<string, void, unknown> {
  // Build the URL
  const isSameOrigin = !apiUrl;
  const cleanedBase = apiUrl ? apiUrl.replace(/\/$/, '') : '';
  let finalPath = path;

  if (isSameOrigin) {
    // If caller passed '/chat', convert to '/api/chat'
    if (!finalPath.startsWith('/api/')) {
      finalPath = `/api${finalPath.startsWith('/') ? '' : '/'}${finalPath}`;
    }
  }
  const url = isSameOrigin ? finalPath : `${cleanedBase}${finalPath}`;

  // Prepare request
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
    signal,
  });

  // Non-OK: throw with useful info
  if (!res.ok) {
    const bodyText = await safeReadText(res).catch(() => '');
    throw new Error(`HTTP ${res.status} ${res.statusText}: ${bodyText || '<no body>'}`);
  }

  // If no body (non-stream JSON, etc.), try to parse JSON and yield once.
  if (!res.body) {
    const text = await safeReadText(res);
    try {
      const json = JSON.parse(text);
      const out = json?.text ?? json?.data ?? (typeof json === 'string' ? json : JSON.stringify(json));
      if (out) yield String(out);
    } catch {
      if (text) yield text;
    }
    return;
  }

  // Choose decoding mode from headers
  const ct = (res.headers.get('content-type') || '').toLowerCase();
  const isJson = ct.includes('application/json');
  const isEventStream = ct.includes('text/event-stream');
  const isPlainText = !isEventStream && (ct.includes('text/') || ct.includes('application/octet-stream'));

  // Non-stream JSON: yield once
  if (isJson) {
    const text = await safeReadText(res);
    try {
      const json = JSON.parse(text);
      const out = json?.text ?? json?.data ?? (typeof json === 'string' ? json : JSON.stringify(json));
      if (out) yield String(out);
    } catch {
      if (text) yield text;
    }
    return;
  }

  // Stream mode
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let carry = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value, { stream: true });

    if (isEventStream) {
      // Parse SSE "data:" lines
      carry += chunk;
      let nl: number;
      while ((nl = carry.indexOf('\n')) !== -1) {
        const line = carry.slice(0, nl).trim();
        carry = carry.slice(nl + 1);
        if (!line) continue;

        if (line.startsWith('data:')) {
          const payloadStr = line.slice('data:'.length).trim();
          if (!payloadStr || payloadStr === '[DONE]') continue;

          try {
            const obj = JSON.parse(payloadStr);
            // OpenAI-style deltas, generic text, etc.
            const text =
              obj?.choices?.[0]?.delta?.content ??
              obj?.text ??
              obj?.delta ??
              obj?.content ??
              (typeof obj === 'string' ? obj : '');
            if (text) yield String(text);
          } catch {
            // not JSON; yield raw
            yield payloadStr;
          }
        }
      }
      continue;
    }

    // Plain text streaming (non-SSE)
    if (isPlainText) {
      if (chunk) yield chunk;
      continue;
    }

    // Fallback: detect SSE by content if headers are wrong
    if (looksLikeSSE(chunk)) {
      carry += chunk;
      let nl: number;
      while ((nl = carry.indexOf('\n')) !== -1) {
        const line = carry.slice(0, nl).trim();
        carry = carry.slice(nl + 1);
        if (!line) continue;
        if (line.startsWith('data:')) {
          const payloadStr = line.slice('data:'.length).trim();
          if (!payloadStr || payloadStr === '[DONE]') continue;
          try {
            const obj = JSON.parse(payloadStr);
            const text =
              obj?.choices?.[0]?.delta?.content ??
              obj?.text ??
              obj?.delta ??
              obj?.content ??
              (typeof obj === 'string' ? obj : '');
            if (text) yield String(text);
          } catch {
            yield payloadStr;
          }
        }
      }
      continue;
    }

    // Otherwise yield raw chunk
    if (chunk) yield chunk;
  }

  // Flush remaining carry (for non-SSE text)
  if (!isEventStream && carry) {
    yield carry;
  }
}

/* ------------------------- helpers ------------------------- */

function looksLikeSSE(sample: string): boolean {
  // naive check: if we see "data:" at start of a line, treat as SSE-ish
  return /^data:/m.test(sample);
}

async function safeReadText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return '';
  }
}
