'use client';

import { useCallback, useMemo, useState, type CSSProperties } from 'react';
import { UIMsg } from '@/lib/chat';

export type Role = UIMsg['role'];
export type Message = UIMsg;

const formatBytes = (size: number) => {
  if (!size) return '0 B';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
};

type Segment =
  | { type: 'text'; value: string }
  | { type: 'code'; value: string; lang?: string };

// Minimal fenced-code parser so we can render copyable blocks like ChatGPT.
const parseSegments = (content: string): Segment[] => {
  const segments: Segment[] = [];
  const fence = /```(\w+)?\n?([\s\S]*?)```/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = fence.exec(content)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: 'text', value: content.slice(lastIndex, match.index) });
    }
    segments.push({
      type: 'code',
      lang: match[1]?.trim() || undefined,
      value: match[2] ?? '',
    });
    lastIndex = fence.lastIndex;
  }

  if (lastIndex < content.length) {
    segments.push({ type: 'text', value: content.slice(lastIndex) });
  }

  return segments.length ? segments : [{ type: 'text', value: content }];
};

export default function MessageBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === 'user';
  const isSystem = msg.role === 'system';
  const segments = useMemo(() => parseSegments(msg.content), [msg.content]);
  const hasCode = segments.some((segment) => segment.type === 'code');
  const timestampLabel = useMemo(() => {
    const raw = typeof msg.createdAt === 'string' ? Date.parse(msg.createdAt) : msg.createdAt;
    if (typeof raw !== 'number' || Number.isNaN(raw)) return null;
    try {
      return new Intl.DateTimeFormat(undefined, {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      }).format(new Date(raw));
    } catch {
      return null;
    }
  }, [msg.createdAt]);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  const baseStyle = useMemo<CSSProperties>(
    () => ({
      overflowWrap: 'anywhere', // allow wrap anywhere inside long tokens
      wordBreak: 'break-word', // prefer breaking at boundaries
    }),
    [],
  );

  const bubbleBase = [
    'inline-block max-w-full rounded-2xl px-3 py-2 text-[15px] leading-6 whitespace-pre-wrap break-words',
    'border border-transparent',
  ].join(' ');

  const bubbleWrapper = hasCode
    ? 'w-full min-w-0 max-w-[88%] lg:max-w-[90ch]'
    : 'w-fit min-w-0 max-w-[88%] lg:max-w-[90ch]';

  const bubbleUser =
    'bg-[color:var(--ui-input)] text-[color:var(--ui-text)] border-[color:var(--ui-border-strong)]';
  const bubbleAsst =
    'bg-[color:var(--ui-surface)] text-[color:var(--ui-text)] border-[color:var(--ui-border)]';
  const bubbleSystem =
    'bg-[color:var(--ui-surface)] text-[color:var(--ui-text-muted)] italic border-[color:var(--ui-border)]';

  const handleCopy = useCallback(async (text: string, idx: number) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIdx(idx);
      setTimeout(() => setCopiedIdx(null), 2000);
    } catch {
      setCopiedIdx(null);
    }
  }, []);

  return (
    <div className={`w-full flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={bubbleWrapper}>
        <div
          className={`${bubbleBase} ${
            isSystem ? bubbleSystem : isUser ? bubbleUser : bubbleAsst
          } ${isUser ? 'break-all' : ''} ${hasCode ? 'w-full' : ''}`}
          // Hard guarantees for stubborn browsers / older Tailwind
          style={{
            ...baseStyle,
          }}
        >
          <div className="space-y-3">
            {segments.map((segment, idx) =>
              segment.type === 'code' ? (
                <div
                  key={`code-${idx}`}
                  className="relative max-w-full rounded-xl border border-[color:var(--ui-code-border)] bg-[color:var(--ui-code-bg)] text-zinc-100"
                >
                  <div className="flex items-center justify-between px-3 py-2 text-xs uppercase tracking-wide text-zinc-400">
                    <span className="font-semibold">{segment.lang || 'code'}</span>
                    <button
                      type="button"
                      onClick={() => handleCopy(segment.value, idx)}
                      className="rounded-full border border-[color:var(--ui-border)] bg-transparent px-3 py-1 text-[11px] font-semibold text-zinc-300 transition hover:bg-white/10"
                    >
                      {copiedIdx === idx ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                  <pre
                    className="scroll-area overflow-x-auto overscroll-x-contain px-3 pb-3 text-[13px] leading-6"
                    style={{ WebkitOverflowScrolling: 'touch', touchAction: 'pan-x' }}
                  >
                    <code className="whitespace-pre font-mono">{segment.value}</code>
                  </pre>
                </div>
              ) : (
                <div
                  key={`text-${idx}`}
                  className="whitespace-pre-wrap leading-6 text-[15px]"
                >
                  {segment.value}
                </div>
              ),
            )}
          </div>

          {msg.attachment && (
            <div className="mt-3 rounded-2xl border border-[color:var(--ui-border)] bg-[color:var(--ui-surface)] p-2">
              {msg.attachment.type === 'image' ? (
                <>
                  <img
                    src={msg.attachment.src}
                    alt={msg.attachment.name}
                    className="w-full max-h-48 rounded-xl object-contain"
                  />
                  <p className="mt-2 text-xs text-zinc-400">
                    {msg.attachment.name} - {msg.attachment.mime}
                  </p>
                </>
              ) : (
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[color:var(--ui-surface-alt)]">
                        <svg
                          viewBox="0 0 24 24"
                          className="h-6 w-6 text-zinc-400"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                        >
                          <path d="M6 3h9l6 6v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" />
                          <path d="M14 3v6h6" />
                        </svg>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-[color:var(--ui-text)]">
                          {msg.attachment.name}
                        </p>
                        <p className="text-xs text-zinc-400">
                          {msg.attachment.mime} - {formatBytes(msg.attachment.size)}
                        </p>
                      </div>
                    </div>
                    {msg.attachment.src && (
                      <a
                        href={msg.attachment.src}
                        download={msg.attachment.name}
                        className="rounded-full border border-[color:var(--ui-border)] bg-transparent px-3 py-1 text-xs font-medium text-zinc-200 transition hover:bg-white/5"
                      >
                        Download
                      </a>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {timestampLabel && (
          <div
            className={`mt-1.5 flex text-[11px] text-zinc-500 ${
              isUser ? 'justify-end' : 'justify-start'
            }`}
          >
            <span className="inline-flex items-center gap-1.5">
              <svg
                viewBox="0 0 24 24"
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
              >
                <circle cx="12" cy="12" r="9" />
                <path d="M12 7v5.2l3 1.8" />
              </svg>
              <span className="font-medium tracking-tight">{timestampLabel}</span>
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
