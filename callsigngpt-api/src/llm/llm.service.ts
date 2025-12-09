import { BadRequestException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { ModelConfigService } from './model-config.service';
import { SecretsService } from '../secrets/secrets.service';

type ChatContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string | ChatContentPart[] };

function extractInlineData(content: string): string {
  // Replace data URLs with decoded text when possible, otherwise a placeholder
  return content.replace(/data:([a-z0-9+/.-]+);base64,([A-Za-z0-9+/=]+)/gi, (_m, mime, b64) => {
    const isTextLike = /^text\/|json$|xml$|csv$|markdown$/i.test(mime || '');
    const isDocLike = /(pdf|msword|officedocument|spreadsheet|presentation|excel|powerpoint)/i.test(
      mime || '',
    );
    try {
      const buf = Buffer.from(String(b64), 'base64');
      const MAX_TEXT = 200_000;
      if (isTextLike) {
        const text = buf.toString('utf-8');
        return text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT)}... [truncated text from ${mime}]` : text;
      }
      if (isDocLike) {
        const MAX_BIN = 120_000; // keep payload manageable for LLM
        const preview = b64.length > MAX_BIN ? `${b64.slice(0, MAX_BIN)}... [truncated base64 from ${mime}]` : b64;
        return `[document ${mime} base64 preview]\n${preview}`;
      }
      return `[embedded file: ${mime}]`;
    } catch {
      return `[embedded file: ${mime}]`;
    }
  });
}

type ChatBody = {
  model: string; // e.g. "basic:gpt-4o-mini"
  messages: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
};

@Injectable()
export class LlmService {
  constructor(
    private readonly modelConfig: ModelConfigService,
    private readonly secrets: SecretsService,
  ) {}

  /**
   * Main entry called by ChatController. Routes by provider.
   * Now filters out empty messages globally to prevent 400 errors.
   */
  async *stream(body: ChatBody, user?: { id: string }) {
    const friendly = body.model;

    // ✅ Filter out empty or whitespace-only messages (supports string or multimodal content)
    const cleaned = (body.messages || []).filter((m) => {
      if (Array.isArray(m?.content)) return m.content.length > 0;
      return typeof m?.content === 'string' && m.content.trim().length > 0;
    });

    // Normalize file/text content to keep payload sizes manageable and readable
    const normalized = cleaned.map((m) => {
      if (Array.isArray(m.content)) {
        const parts = m.content.map((p) =>
          p.type === 'text' ? { ...p, text: extractInlineData(p.text) } : p,
        );
        return { ...m, content: parts };
      }
      return { ...m, content: extractInlineData(m.content) };
    });

    const entry = await this.modelConfig.getModel(friendly);

    // Some models (e.g., GPT-5 Nano) only accept default temperature.
    const temperatureOverride =
      /gpt-5/i.test(entry.providerModel) ? undefined : body.temperature ?? entry.temperatureDefault ?? 0.7;
    const maxTokensOverride = body.max_tokens ?? entry.maxTokensDefault ?? undefined;

    switch (entry.provider) {
      case 'openai': {
        for await (const piece of this.streamOpenAI({
          model: entry.providerModel,
          messages: normalized,
          temperature: temperatureOverride ?? 1,
          max_tokens: maxTokensOverride,
        }))
          yield piece;
        return;
      }

      case 'google': {
        for await (const piece of this.streamGoogleGemini({
          model: entry.providerModel,
          messages: normalized.map((msg) => ({
            ...msg,
            // Gemini doesn't take OpenAI-style image_url; flatten to text notice
            content: Array.isArray(msg.content)
              ? msg.content
                  .map((part) =>
                    part.type === 'text' ? part.text : '[image attached]'
                  )
                  .join('\n\n')
              : msg.content,
          })),
          temperature: temperatureOverride ?? 0.7,
          max_tokens: maxTokensOverride,
        }))
          yield piece;
        return;
      }

      case 'anthropic': {
        for await (const piece of this.streamAnthropic({
          model: entry.providerModel,
          messages: normalized.map((msg) => ({
            ...msg,
            content: Array.isArray(msg.content)
              ? msg.content
                  .map((part) =>
                    part.type === 'text' ? part.text : '[image attached]'
                  )
                  .join('\n\n')
              : msg.content,
          })),
          temperature: temperatureOverride ?? 0.7,
          max_tokens: maxTokensOverride ?? 1024,
        }))
          yield piece;
        return;
      }

      case 'mistral': {
        for await (const piece of this.streamMistral({
          model: entry.providerModel,
          messages: normalized.map((msg) => ({
            ...msg,
            content: Array.isArray(msg.content)
              ? msg.content
                  .map((part) =>
                    part.type === 'text' ? part.text : '[image attached]'
                  )
                  .join('\n\n')
              : msg.content,
          })),
          temperature: temperatureOverride ?? 0.7,
          max_tokens: maxTokensOverride,
        }))
          yield piece;
        return;
      }

      case 'deepseek': {
        for await (const piece of this.streamDeepSeek({
          model: entry.providerModel,
          messages: normalized.map((msg) => ({
            ...msg,
            content: Array.isArray(msg.content)
              ? msg.content
                  .map((part) =>
                    part.type === 'text' ? part.text : '[image attached]'
                  )
                  .join('\n\n')
              : msg.content,
          })),
          temperature: temperatureOverride ?? 0.7,
          max_tokens: maxTokensOverride,
        }))
          yield piece;
        return;
      }

      case 'together': {
        for await (const piece of this.streamTogether({
          model: entry.providerModel,
          messages: normalized.map((msg) => ({
            ...msg,
            content: Array.isArray(msg.content)
              ? msg.content
                  .map((part) =>
                    part.type === 'text' ? part.text : '[image attached]'
                  )
                  .join('\n\n')
              : msg.content,
          })),
          temperature: temperatureOverride ?? 0.7,
          max_tokens: maxTokensOverride,
        }))
          yield piece;
        return;
      }

      default: {
        yield `[router] Unsupported provider: ${(entry as any).provider}`;
        return;
      }
    }
  }

  // ---------------------------
  // OpenAI (SSE chat.completions)
  // ---------------------------
  private async *streamOpenAI(opts: {
    model: string;
    messages: ChatMessage[];
    temperature: number;
    max_tokens?: number;
  }) {
    const apiKey = await this.secrets.require('OPENAI_API_KEY');

    // Truncate/guard image sizes to reduce request size
    // Allow large images; default ~50MB base64 unless overridden
    const MAX_IMAGE_CHARS = Math.max(
      10_000,
      Number(process.env.MAX_IMAGE_DATA_CHARS ?? 50_000_000),
    );
    const trimImage = (url: string) => {
      if (url.length > MAX_IMAGE_CHARS) {
        // hard fail before hitting provider limits
        throw new BadRequestException(
          `Image is too large for this model. Max size is ~${Math.floor(MAX_IMAGE_CHARS / 1024)}KB base64.`
        );
      }
      return url;
    };

    const normalizedMessages = opts.messages.map((m) => {
      if (!Array.isArray(m.content)) return m;
      const parts = m.content.map((p) =>
        p.type === 'image_url' ? { ...p, image_url: { url: trimImage(p.image_url.url) } } : p
      );
      return { ...m, content: parts };
    });

    const hasImage = opts.messages.some(
      (m) => Array.isArray(m.content) && m.content.some((p) => (p as any)?.type === 'image_url')
    );

    // If images are present, avoid sending temperature for models that disallow it
    const payload: any = {
      model: opts.model,
      messages: normalizedMessages,
      stream: true,
    };
    if (!hasImage) {
      payload.temperature = opts.temperature;
    }
    if (opts.max_tokens) payload.max_tokens = opts.max_tokens;

    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!resp.ok || !resp.body) {
      const txt = await resp.text().catch(() => '');
      throw new InternalServerErrorException(
        `OpenAI error ${resp.status}: ${txt || resp.statusText}`,
      );
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let idx: number;
      while ((idx = buffer.indexOf('\n\n')) !== -1) {
        const raw = buffer.slice(0, idx).trim();
        buffer = buffer.slice(idx + 2);
        const line = raw.startsWith('data:') ? raw.slice(5).trim() : raw;

        if (!line || line === '[DONE]') {
          if (line === '[DONE]') return;
          continue;
        }

        try {
          const obj = JSON.parse(line);
          const piece = obj?.choices?.[0]?.delta?.content;
          if (typeof piece === 'string' && piece.length > 0) yield piece;
        } catch {
          // ignore
        }
      }
    }
  }

// -------------------------------------------
// Google Gemini (NDJSON or Chunked JSON) — robust streaming (no logs)
// -------------------------------------------
private async *streamGoogleGemini(opts: {
  model: string;
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[];
  temperature: number;
  max_tokens?: number;
}) {
  const apiKey = await this.secrets.require('GOOGLE_API_KEY');

  const { system, contents } = this.toGeminiContents(opts.messages);

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    opts.model,
  )}:streamGenerateContent?key=${encodeURIComponent(apiKey)}`;

  const payload: any = {
    contents,
    generationConfig: {
      temperature: opts.temperature,
      ...(opts.max_tokens ? { maxOutputTokens: opts.max_tokens } : {}),
    },
  };
  if (system) payload.systemInstruction = system;

  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!resp.ok || !resp.body) {
    const txt = await resp.text().catch(() => '');
    throw new InternalServerErrorException(
      `Gemini error ${resp.status}: ${txt || resp.statusText}`,
    );
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let rawFull = '';
  let totalYielded = 0;

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value, { stream: true });
    buffer += chunk;
    rawFull += chunk;

    // Try NDJSON mode first (one JSON per line)
    let nl: number;
    while ((nl = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line) continue;

      try {
        const obj = JSON.parse(line);
        const text =
          obj?.candidates?.[0]?.content?.parts?.[0]?.text ??
          obj?.candidates?.[0]?.content?.parts
            ?.map((p: any) => p?.text)
            .filter(Boolean)
            .join('');
        if (typeof text === 'string' && text.length > 0) {
          totalYielded += text.length;
          yield text;
        }
      } catch {
        // Ignore invalid JSON fragments (multi-line objects)
      }
    }
  }

  // Fallback: The API sent one full JSON instead of NDJSON lines
  if (totalYielded === 0) {
    const all = rawFull.trim();
    try {
      const parsed = JSON.parse(all);
      const frames = Array.isArray(parsed) ? parsed : [parsed];

      for (const obj of frames) {
        const text =
          obj?.candidates?.[0]?.content?.parts?.[0]?.text ??
          obj?.candidates?.[0]?.content?.parts
            ?.map((p: any) => p?.text)
            .filter(Boolean)
            .join('');
        if (typeof text === 'string' && text.length > 0) {
          totalYielded += text.length;
          yield text;
        }
      }
    } catch {
      throw new InternalServerErrorException('Gemini stream parse failed');
    }
  }
}



  private toGeminiContents(messages: ChatMessage[]): {
    system?: { role: 'system'; parts: { text: string }[] };
    contents: Array<{ role: 'user' | 'model'; parts: { text: string }[] }>;
  } {
    let systemText = '';
    const contents: Array<{ role: 'user' | 'model'; parts: { text: string }[] }> = [];

    const toText = (content: ChatMessage['content']) => {
      if (Array.isArray(content)) {
        return content
          .map((p) => (p.type === 'text' ? p.text : '[image attached]'))
          .join('\n\n');
      }
      return content ?? '';
    };

    for (const m of messages) {
      if (m.role === 'system') {
        systemText += (systemText ? '\n\n' : '') + toText(m.content);
      } else if (m.role === 'user') {
        contents.push({ role: 'user', parts: [{ text: toText(m.content) }] });
      } else if (m.role === 'assistant') {
        contents.push({ role: 'model', parts: [{ text: toText(m.content) }] });
      }
    }

    // ✅ Explicitly cast role as the literal 'system' to satisfy TypeScript
    const system = systemText
      ? ({ role: 'system' as const, parts: [{ text: systemText }] })
      : undefined;

    return { system, contents };
  }


  // -----------------------------
  // Anthropic (Messages streaming)
  // -----------------------------
  private async *streamAnthropic(opts: {
    model: string;
    messages: ChatMessage[];
    temperature: number;
    max_tokens: number;
  }) {
    const apiKey = await this.secrets.require('ANTHROPIC_API_KEY');

    const { system, messages } = this.toAnthropicMessages(opts.messages);

    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: opts.model,
        system,
        messages,
        temperature: opts.temperature,
        max_tokens: opts.max_tokens,
        stream: true,
      }),
    });

    if (!resp.ok || !resp.body) {
      const txt = await resp.text().catch(() => '');
      throw new InternalServerErrorException(
        `Anthropic error ${resp.status}: ${txt || resp.statusText}`,
      );
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let idx: number;
      while ((idx = buffer.indexOf('\n\n')) !== -1) {
        const frame = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        const lines = frame.split('\n');
        let dataLine = '';
        for (const l of lines) if (l.startsWith('data:')) dataLine = l.slice(5).trim();
        if (!dataLine || dataLine === '[DONE]') continue;

        try {
          const obj = JSON.parse(dataLine);
          if (obj?.type === 'content_block_delta' && obj?.delta?.type === 'text_delta') {
            const text = obj.delta.text;
            if (typeof text === 'string' && text.length > 0) yield text;
          }
        } catch { }
      }
    }
  }

  private toAnthropicMessages(messages: ChatMessage[]): {
    system?: string;
    messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  } {
    let system = '';
    const out: Array<{ role: 'user' | 'assistant'; content: string }> = [];
    const toText = (content: ChatMessage['content']) => {
      if (Array.isArray(content)) {
        return content
          .map((p) => (p.type === 'text' ? p.text : '[image attached]'))
          .join('\n\n');
      }
      return content ?? '';
    };

    for (const m of messages) {
      if (m.role === 'system') system += (system ? '\n\n' : '') + toText(m.content);
      else if (m.role === 'user') out.push({ role: 'user', content: toText(m.content) });
      else if (m.role === 'assistant') out.push({ role: 'assistant', content: toText(m.content) });
    }
    return { system: system || undefined, messages: out };
  }

  // -----------------------------
  // Mistral (OpenAI-compatible SSE)
  // -----------------------------
  private async *streamMistral(opts: {
    model: string;
    messages: ChatMessage[];
    temperature: number;
    max_tokens?: number;
  }) {
    const apiKey = await this.secrets.require('MISTRAL_API_KEY');
    const base = (await this.secrets.get('MISTRAL_BASE_URL')) || 'https://api.mistral.ai/v1';

    const url = `${base.replace(/\/+$/, '')}/chat/completions`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: opts.model,
        messages: opts.messages,
        temperature: opts.temperature,
        max_tokens: opts.max_tokens,
        stream: true,
      }),
    });

    if (!resp.ok || !resp.body) {
      const txt = await resp.text().catch(() => '');
      throw new InternalServerErrorException(
        `Mistral error ${resp.status}: ${txt || resp.statusText}`,
      );
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let idx: number;
      while ((idx = buffer.indexOf('\n\n')) !== -1) {
        const raw = buffer.slice(0, idx).trim();
        buffer = buffer.slice(idx + 2);
        const line = raw.startsWith('data:') ? raw.slice(5).trim() : raw;
        if (!line || line === '[DONE]') {
          if (line === '[DONE]') return;
          continue;
        }
        try {
          const obj = JSON.parse(line);
          const piece = obj?.choices?.[0]?.delta?.content;
          if (typeof piece === 'string' && piece.length > 0) yield piece;
        } catch { }
      }
    }
  }

  // -----------------------------
  // DeepSeek (OpenAI-compatible SSE)
  // -----------------------------
  private async *streamDeepSeek(opts: {
    model: string;
    messages: ChatMessage[];
    temperature: number;
    max_tokens?: number;
  }) {
    const apiKey = await this.secrets.require('DEEPSEEK_API_KEY');
    const base = (await this.secrets.get('DEEPSEEK_BASE_URL')) || 'https://api.deepseek.com/v1';

    const url = `${base.replace(/\/+$/, '')}/chat/completions`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: opts.model,
        messages: opts.messages,
        temperature: opts.temperature,
        max_tokens: opts.max_tokens,
        stream: true,
      }),
    });

    if (!resp.ok || !resp.body) {
      const txt = await resp.text().catch(() => '');
      throw new InternalServerErrorException(
        `DeepSeek error ${resp.status}: ${txt || resp.statusText}`,
      );
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let idx: number;
      while ((idx = buffer.indexOf('\n\n')) !== -1) {
        const raw = buffer.slice(0, idx).trim();
        buffer = buffer.slice(idx + 2);
        const line = raw.startsWith('data:') ? raw.slice(5).trim() : raw;
        if (!line || line === '[DONE]') {
          if (line === '[DONE]') return;
          continue;
        }
        try {
          const obj = JSON.parse(line);
          const piece = obj?.choices?.[0]?.delta?.content;
          if (typeof piece === 'string' && piece.length > 0) yield piece;
        } catch { }
      }
    }
  }

  // -----------------------------
  // Together (OpenAI-compatible SSE)
  // -----------------------------
  private async *streamTogether(opts: {
    model: string;
    messages: ChatMessage[];
    temperature: number;
    max_tokens?: number;
  }) {
    const apiKey = await this.secrets.require('TOGETHER_API_KEY');
    const base = (await this.secrets.get('TOGETHER_BASE_URL')) || 'https://api.together.xyz/v1';

    const url = `${base.replace(/\/+$/, '')}/chat/completions`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: opts.model,
        messages: opts.messages,
        temperature: opts.temperature,
        max_tokens: opts.max_tokens,
        stream: true,
      }),
    });

    if (!resp.ok || !resp.body) {
      const txt = await resp.text().catch(() => '');
      throw new InternalServerErrorException(
        `Together error ${resp.status}: ${txt || resp.statusText}`,
      );
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let idx: number;
      while ((idx = buffer.indexOf('\n\n')) !== -1) {
        const raw = buffer.slice(0, idx).trim();
        buffer = buffer.slice(idx + 2);
        const line = raw.startsWith('data:') ? raw.slice(5).trim() : raw;
        if (!line || line === '[DONE]') {
          if (line === '[DONE]') return;
          continue;
        }
        try {
          const obj = JSON.parse(line);
          const piece = obj?.choices?.[0]?.delta?.content;
          if (typeof piece === 'string' && piece.length > 0) yield piece;
        } catch { }
      }
    }
  }
}
