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
  const ctrlRef = useRef<AbortController | null>(null);

  const msgsRef = useRef<UIMsg[]>(msgs);
  useEffect(() => {
    msgsRef.current = msgs;
  }, [msgs]);

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
    setLoading(false);
  }, []);

  useEffect(() => {
    return () => {
      try {
        ctrlRef.current?.abort();
      } catch {
        // ignore
      }
      ctrlRef.current = null;
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
    }
  }, [model]);

  const send = useCallback(
    async ({ text, attachment }: SendPayload) => {
      const userText = (text ?? '').trim();
      if (!userText && !attachment) return;
      if (loading) return;

      const userMsg: UIMsg = {
        id: genId(),
        role: 'user',
        content: userText,
        attachment,
      };
      const assistantMsg: UIMsg = { id: genId(), role: 'assistant', content: '' };

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

      try {
        const apiUrl = getApiBase();
        if (!apiUrl) throw new Error('API base URL not configured');
        const endpointPath = '/chat';

        const baseHistory = (() => {
          const identityName = modelLabels[modelRef.current] ?? modelRef.current;
          const identity = `You are ${identityName}. Respond helpfully and concisely using that model's capabilities. Do not mention your model name unless explicitly asked.`;
          const history = [...msgsRef.current];
          const systemIndex = history.findIndex((m) => m.role === 'system');
          if (systemIndex >= 0) {
            history[systemIndex] = { ...history[systemIndex], content: identity };
          } else {
            history.unshift({ id: genId(), role: 'system', content: identity });
          }
          return history;
        })();

        const MAX_HISTORY = 60;
        const historyWindow = baseHistory.length > MAX_HISTORY ? baseHistory.slice(-MAX_HISTORY) : baseHistory;

        const fullHistory: ChatMessage[] = [...historyWindow, userMsg]
          .map((msg) => {
            const content = buildMessageContent(msg);
            if (Array.isArray(content) && !content.length) return null;
            if (!content) return null;
            return { role: msg.role, content };
          })
          .filter((entry): entry is ChatMessage => Boolean(entry));

        const payload = {
          model: modelRef.current,
          conversationId: conversationId ?? undefined,
          messages: fullHistory,
          temperature: 0.7,
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
          if (chunk) {
            finalAssistantText += chunk;
            // Detect server-side fallback notice for GPT-5 quota and notify UI to switch picker
            if (!fallbackNotified && /gpt-5 daily limit reached/i.test(chunk)) {
              fallbackNotified = true;
              onModelFallback?.('basic:gpt-4o-mini', 'quota-exceeded-gpt5');
            }
            setMsgs((prev) => {
              if (!prev.length) return prev;
              const out = prev.slice();
              const last = out[out.length - 1];
              if (last?.id === assistantMsg.id) {
                out[out.length - 1] = { ...last, content: last.content + chunk };
              }
              return out;
            });
            onSidebarDirty?.();
          }
        }

        await appendMessages?.(
          userMsg,
          { ...assistantMsg, content: finalAssistantText },
        );
      } catch (err: any) {
        const msg = typeof err?.message === 'string' ? err.message : 'Request failed';
        onError?.(msg);
        setMsgs((prev) => {
          if (!prev.length) return prev;
          const out = prev.slice();
          const last = out[out.length - 1];
          if (last?.id === assistantMsg.id) {
            out[out.length - 1] = {
              ...last,
              content: last.content + `\n[error] ${msg}`,
            };
          }
          return out;
        });
      } finally {
        if (ctrlRef.current === controller) ctrlRef.current = null;
        setLoading(false);
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

  return { send, stop, loading };
}
