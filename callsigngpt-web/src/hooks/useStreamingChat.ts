'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { streamChat, type ChatMessage, type ChatContentPart } from '@/lib/streamChat';
import { UIMsg, Attachment } from '@/lib/chat';
import { getApiBase } from '@/lib/apiBase';
import { modelCache } from '@/lib/modelCache';

type UseStreamingChatArgs = {
  accessToken?: string;
  model: string;
  msgs: UIMsg[];
  setMsgs: React.Dispatch<React.SetStateAction<UIMsg[]>>;
  ensureConversation: () => Promise<void> | void;
  appendMessages: (...m: UIMsg[]) => Promise<void> | void;
  conversationId?: string | null;
  /** Optional: if you want to refresh sidebar after first assistant token etc. */
  onSidebarDirty?: () => void;
  /** Optional: surface errors (e.g., quota exceeded) to the UI */
  onError?: (message: string) => void;
  /** Optional: called when backend falls back to a different model mid-call */
  onModelFallback?: (fallbackKey: string, reason?: string) => void;
};

type SendPayload = {
  text?: string;
  attachment?: Attachment;
  forceSearch?: boolean;
};

const formatBytes = (size: number) => {
  if (size < 1024) return `${size} B`;
  const units = ['KB', 'MB', 'GB'];
  let measured = size / 1024;
  let index = 0;
  while (measured >= 1024 && index < units.length - 1) {
    measured /= 1024;
    index += 1;
  }
  return `${measured.toFixed(1)} ${units[index]}`;
};

const describeAttachment = (attachment: Attachment) =>
  `${attachment.type === 'image' ? 'Image' : 'File'} attached: ${attachment.name} (${attachment.mime}, ${formatBytes(attachment.size)}).`;

const truncateData = (data: string, max = 1_000_000) =>
  data.length > max ? `${data.slice(0, max)}... [truncated]` : data;

const parseDataUrl = (src: string) => {
  const match = /^data:(.*?);base64,(.*)$/i.exec(src);
  if (!match) return null;
  return { mime: match[1] || 'application/octet-stream', base64: match[2] || '' };
};

const maybeDecodeText = (src: string) => {
  const parsed = parseDataUrl(src);
  if (!parsed) return null;
  const isTextLike = /^text\/|json$|xml$|csv$|markdown$/i.test(parsed.mime);
  if (!isTextLike) return null;
  try {
    const decoded = typeof atob === 'function' ? atob(parsed.base64) : Buffer.from(parsed.base64, 'base64').toString('utf-8');
    return truncateData(decoded, 200_000);
  } catch {
    return null;
  }
};

const readInt = (
  value: string | undefined,
  fallback: number,
  opts: { min?: number; max?: number } = {},
) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  const int = Math.floor(n);
  const min = typeof opts.min === 'number' ? opts.min : 0;
  if (int < min) return fallback;
  if (typeof opts.max === 'number') return Math.min(int, opts.max);
  return int;
};

const readFloat = (
  value: string | undefined,
  fallback: number,
  opts: { min?: number; max?: number } = {},
) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  if (typeof opts.min === 'number' && n < opts.min) return fallback;
  if (typeof opts.max === 'number' && n > opts.max) return fallback;
  return n;
};

const MAX_HISTORY = readInt(process.env.NEXT_PUBLIC_CHAT_MAX_HISTORY, 60, { min: 1 });
const MAX_CONTEXT_CHARS = readInt(process.env.NEXT_PUBLIC_CHAT_MAX_CONTEXT_CHARS, 12_000, { min: 1 });
const MAX_RESPONSE_TOKENS = readInt(process.env.NEXT_PUBLIC_CHAT_MAX_RESPONSE_TOKENS, 20_000, { min: 1 });
const DEFAULT_RESPONSE_TOKENS = readInt(
  process.env.NEXT_PUBLIC_CHAT_DEFAULT_RESPONSE_TOKENS,
  1024,
  { min: 0 },
);
const DEFAULT_TEMPERATURE = readFloat(process.env.NEXT_PUBLIC_CHAT_TEMPERATURE, 0.7, {
  min: 0,
  max: 2,
});
const SYSTEM_PROMPT_TEMPLATE = (process.env.NEXT_PUBLIC_CHAT_SYSTEM_PROMPT || '').trim();
const SEARCH_STATUS_PREFIX = '[[[SEARCH_STATUS]]]';

const parseSearchStatus = (chunk: string): { state: string; query?: string } | null => {
  if (!chunk || !chunk.startsWith(SEARCH_STATUS_PREFIX)) return null;
  const payload = chunk.slice(SEARCH_STATUS_PREFIX.length);
  try {
    const parsed = JSON.parse(payload);
    if (parsed && typeof parsed === 'object' && typeof parsed.state === 'string') {
      return parsed;
    }
  } catch {
    // ignore parse errors
  }
  return { state: 'start' };
};

const estimateContentChars = (content: ChatMessage['content']) => {
  if (Array.isArray(content)) {
    return content.reduce((total, part) => {
      if (part.type === 'text') return total + (part.text?.length ?? 0);
      // Treat images as a fixed small cost so they don't evict all text context
      const urlLen = part.image_url?.url?.length ?? 0;
      return total + Math.min(urlLen || 0, 2_000);
    }, 0);
  }
  return (content || '').length;
};

const trimByCharBudget = (messages: ChatMessage[], budget: number) => {
  if (budget <= 0) return messages;
  let remaining = budget;
  const kept: ChatMessage[] = [];

  // Walk from newest to oldest to keep recent context
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const msg = messages[i];
    const cost = Math.max(estimateContentChars(msg.content), 0);
    const mustKeep = kept.length === 0 || msg.role === 'system';
    if (!mustKeep && remaining - cost < 0) continue;
    kept.push(msg);
    remaining -= cost;
  }

  const out = kept.reverse();

  // Ensure we keep at least one system prompt if it exists
  if (!out.some((m) => m.role === 'system')) {
    const latestSystem = [...messages].reverse().find((m) => m.role === 'system');
    if (latestSystem) out.unshift(latestSystem);
  }

  return out;
};

const pickMaxTokens = (messages: ChatMessage[]) => {
  const promptTokens = messages.reduce(
    (sum, msg) => sum + Math.ceil(estimateContentChars(msg.content) / 4),
    0,
  );
  if (!promptTokens) return undefined;

  // If we're nowhere near our trimmed prompt budget, give a reasonable default cap
  // so short prompts can still produce fuller answers.
  const approxPromptChars = promptTokens * 4;
  const defaultCap =
    DEFAULT_RESPONSE_TOKENS > 0
      ? Math.min(DEFAULT_RESPONSE_TOKENS, MAX_RESPONSE_TOKENS)
      : undefined;
  if (approxPromptChars < MAX_CONTEXT_CHARS * 0.9) {
    return defaultCap;
  }

  // When the prompt is already huge, keep a ceiling so we don't exceed provider limits.
  return Math.min(MAX_RESPONSE_TOKENS, Math.floor(promptTokens * 0.5));
};

const buildMessageContent = (message: UIMsg): ChatMessage['content'] => {
  const trimmed = message.content?.trim();

  // If the message has an image attachment, return multimodal content for OpenAI vision-capable models
  if (message.attachment?.type === 'image' && message.attachment.src) {
    const content: ChatContentPart[] = [];
    if (trimmed) content.push({ type: 'text', text: trimmed });
    content.push({ type: 'image_url', image_url: { url: message.attachment.src } });
    return content;
  }

  // File attachments: include metadata + (truncated) base64 data inline as text
  if (message.attachment?.type === 'file') {
    const parts: string[] = [];
    if (trimmed) parts.push(trimmed);
    const meta = describeAttachment(message.attachment);
    const decoded = message.attachment.src ? maybeDecodeText(message.attachment.src) : null;
    const data = message.attachment.src ? truncateData(message.attachment.src, 200_000) : '';
    parts.push(
      [
        meta,
        decoded ? `Content preview:\n${decoded}` : '',
        data && !decoded ? `Data (base64, may be truncated): ${data}` : '',
      ]
        .filter(Boolean)
        .join('\n\n'),
    );
    return parts.join('\n\n');
  }

  const parts: string[] = [];
  if (trimmed) parts.push(trimmed);
  if (message.attachment) parts.push(describeAttachment(message.attachment));
  return parts.join('\n\n');
};

export function useStreamingChat({
  accessToken,
  model,
  msgs,
  setMsgs,
  ensureConversation,
  appendMessages,
  conversationId,
  onSidebarDirty,
  onError,
  onModelFallback,
}: UseStreamingChatArgs) {
  const [loading, setLoading] = useState(false);
  const [interrupted, setInterrupted] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searchQuery, setSearchQuery] = useState<string | null>(null);
  const ctrlRef = useRef<AbortController | null>(null);

  const msgsRef = useRef<UIMsg[]>(msgs);
  useEffect(() => {
    msgsRef.current = msgs;
  }, [msgs]);

  const typingBufferRef = useRef<string>('');
  const typingTimerRef = useRef<NodeJS.Timeout | null>(null);

  const modelRef = useRef<string>(model);
  modelRef.current = model;

  // Load model labels from API for nicer system identity
  const [modelLabels, setModelLabels] = useState<Record<string, string>>({});
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await modelCache.list();
        if (cancelled) return;
        const map: Record<string, string> = {};
        for (const m of data || []) {
          map[m.modelKey] = m.displayName || m.modelKey;
        }
        setModelLabels(map);
      } catch (err) {
        console.warn('useStreamingChat: failed to load model labels', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const genId = () =>
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);

  const stop = useCallback(() => {
    try {
      ctrlRef.current?.abort();
    } catch {
      // swallow
    }
    ctrlRef.current = null;
    setInterrupted(true);
    setLoading(false);
    setSearching(false);
    setSearchQuery(null);
  }, []);

  useEffect(() => {
    return () => {
      try {
        ctrlRef.current?.abort();
      } catch {
        // ignore
      }
      ctrlRef.current = null;
      if (typingTimerRef.current) {
        clearInterval(typingTimerRef.current);
        typingTimerRef.current = null;
      }
      typingBufferRef.current = '';
    };
  }, []);

  useEffect(() => {
    if (loading && ctrlRef.current) {
      try {
        ctrlRef.current.abort();
      } catch {
        // ignore
      }
      ctrlRef.current = null;
      setLoading(false);
      setSearching(false);
      setSearchQuery(null);
    }
  }, [model]);

  const startTypingFlush = useCallback(
    (assistantId: string) => {
      if (typingTimerRef.current) return;
      typingTimerRef.current = setInterval(() => {
        const buffer = typingBufferRef.current;
        if (!buffer.length) {
          clearInterval(typingTimerRef.current as NodeJS.Timeout);
          typingTimerRef.current = null;
          return;
        }
        const takeLen = Math.min(buffer.length, 12);
        const take = buffer.slice(0, takeLen);
        typingBufferRef.current = buffer.slice(takeLen);
        setMsgs((prev) => {
          if (!prev.length) return prev;
          const out = prev.slice();
          const last = out[out.length - 1];
          if (last?.id === assistantId) {
            out[out.length - 1] = { ...last, content: last.content + take };
          }
          return out;
        });
      }, 30);
    },
    [setMsgs],
  );

  const drainTypingBuffer = useCallback(
    (assistantId: string) => {
      const remaining = typingBufferRef.current;
      typingBufferRef.current = '';
      if (typingTimerRef.current) {
        clearInterval(typingTimerRef.current);
        typingTimerRef.current = null;
      }
      if (!remaining) return;
      setMsgs((prev) => {
        if (!prev.length) return prev;
        const out = prev.slice();
        const last = out[out.length - 1];
        if (last?.id === assistantId) {
          out[out.length - 1] = { ...last, content: last.content + remaining };
        }
        return out;
      });
    },
    [setMsgs],
  );

  const send = useCallback(
    async ({ text, attachment, forceSearch }: SendPayload) => {
      const userText = (text ?? '').trim();
      if (!userText && !attachment) return;
      if (loading) return;

      const now = Date.now();

      const userMsg: UIMsg = {
        id: genId(),
        role: 'user',
        content: userText,
        attachment,
        createdAt: now,
      };
      const assistantMsg: UIMsg = { id: genId(), role: 'assistant', content: '', createdAt: now };
      const useTypewriter = /nano/i.test(modelRef.current);

      setMsgs((prev) => {
        const lastMsg = prev[prev.length - 1];
        if (lastMsg?.id === userMsg.id) {
          return prev;
        }
        return [...prev, userMsg, assistantMsg];
      });

      await ensureConversation?.();

      const controller = new AbortController();
      ctrlRef.current = controller;
      setLoading(true);
      setInterrupted(false);
      setSearching(false);
      setSearchQuery(null);

      try {
        const apiUrl = getApiBase();
        if (!apiUrl) throw new Error('API base URL not configured');
        const endpointPath = '/chat';

        const baseHistory = (() => {
          const identityName = modelLabels[modelRef.current] ?? modelRef.current;
          const defaultIdentity = `You are ${identityName}. Respond helpfully and thoroughly, using as much detail as the user's question warrants. Be concise only when the user asks for brevity or the question is simple. Do not mention your model name unless explicitly asked.`;
          const identity = SYSTEM_PROMPT_TEMPLATE
            ? SYSTEM_PROMPT_TEMPLATE.split('{model}').join(identityName)
            : defaultIdentity;
          const history = [...msgsRef.current];
          const systemIndex = history.findIndex((m) => m.role === 'system');
          if (systemIndex >= 0) {
            history[systemIndex] = { ...history[systemIndex], content: identity };
          } else {
            history.unshift({ id: genId(), role: 'system', content: identity });
          }
          return history;
        })();

        const historyWindow = baseHistory.length > MAX_HISTORY ? baseHistory.slice(-MAX_HISTORY) : baseHistory;

        const normalizedHistory: ChatMessage[] = [...historyWindow, userMsg]
          .map((msg) => {
            const content = buildMessageContent(msg);
            if (Array.isArray(content) && !content.length) return null;
            if (!content) return null;
            return { role: msg.role, content };
          })
          .filter((entry): entry is ChatMessage => Boolean(entry));

        const boundedHistory = trimByCharBudget(normalizedHistory, MAX_CONTEXT_CHARS);
        const responseMaxTokens = pickMaxTokens(boundedHistory);

        const payload = {
          model: modelRef.current,
          conversationId: conversationId ?? undefined,
          messages: boundedHistory,
          temperature: DEFAULT_TEMPERATURE,
          ...(responseMaxTokens ? { max_tokens: responseMaxTokens } : {}),
          ...(forceSearch ? { search: { mode: 'always' } } : {}),
        };

        let finalAssistantText = '';
        let fallbackNotified = false;

        for await (const chunk of streamChat({
          apiUrl,
          token: accessToken,
          payload,
          signal: controller.signal,
          path: endpointPath,
        })) {
          const status = parseSearchStatus(chunk);
          if (status) {
            if (status.state === 'start') {
              setSearching(true);
              setSearchQuery(typeof status.query === 'string' ? status.query : null);
            }
            continue;
          }
          if (chunk) {
            setSearching(false);
            setSearchQuery(null);
            finalAssistantText += chunk;
            // Detect server-side fallback notice for GPT-5 quota and notify UI to switch picker
            if (!fallbackNotified && /gpt-5 daily limit reached/i.test(chunk)) {
              fallbackNotified = true;
              onModelFallback?.('basic:gpt-4o-mini', 'quota-exceeded-gpt5');
            }
            if (useTypewriter) {
              typingBufferRef.current += chunk;
              startTypingFlush(assistantMsg.id);
            } else {
              setMsgs((prev) => {
                if (!prev.length) return prev;
                const out = prev.slice();
                const last = out[out.length - 1];
                if (last?.id === assistantMsg.id) {
                  out[out.length - 1] = { ...last, content: last.content + chunk };
                }
                return out;
              });
            }
            onSidebarDirty?.();
          }
        }

        if (useTypewriter) {
          drainTypingBuffer(assistantMsg.id);
        }

        await appendMessages?.(
          userMsg,
          { ...assistantMsg, content: finalAssistantText },
        );
      } catch (err: any) {
        if (/nano/i.test(modelRef.current)) {
          drainTypingBuffer(assistantMsg.id);
        }
        const msg = typeof err?.message === 'string' ? err.message : 'Request failed';
        setInterrupted(true);
        onError?.(msg);
        setSearching(false);
        setSearchQuery(null);
        // Keep chat clean: errors are surfaced via popup only.
      } finally {
        if (ctrlRef.current === controller) ctrlRef.current = null;
        setLoading(false);
        setSearching(false);
        setSearchQuery(null);
      }
    },
    [
      accessToken,
      appendMessages,
      ensureConversation,
      conversationId,
      onSidebarDirty,
      onError,
      setMsgs,
      loading,
      modelLabels,
    ],
  );

  return { send, stop, loading, interrupted, searching, searchQuery };
}
