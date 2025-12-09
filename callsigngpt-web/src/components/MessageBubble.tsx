'use client';

import { useCallback, useMemo, useState } from 'react';
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
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const baseStyle = useMemo(
    () => ({
      overflowWrap: 'anywhere', // allow wrap anywhere inside long tokens
      wordBreak: 'break-word', // prefer breaking at boundaries
    }),
    [],
  );
  const userStyle = useMemo(
    () => ({
      backgroundImage: 'linear-gradient(125deg, var(--accent-1), var(--accent-2), var(--accent-3))',
      borderColor: 'color-mix(in srgb, var(--accent-2) 38%, transparent)',
      boxShadow: '0 18px 42px color-mix(in srgb, var(--accent-2) 45%, transparent)',
      color: '#f8fafc',
    }),
    [],
  );
  const assistantStyle = useMemo(
    () => ({
      borderColor: 'color-mix(in srgb, var(--accent-2) 22%, transparent)',
      boxShadow: '0 18px 42px color-mix(in srgb, var(--accent-2) 28%, transparent)',
    }),
    [],
  );

  const bubbleBase = [
    'inline-block rounded-3xl px-5 py-4 text-[15px] leading-6 whitespace-pre-wrap break-words overflow-x-hidden',
    'border border-white/5 shadow-[0_15px_40px_rgba(2,6,23,.45)] transition-all duration-300',
    'hover:-translate-y-0.5 hover:shadow-[0_25px_70px_rgba(2,6,23,.55)]',
  ].join(' ');

  const bubbleUser = 'border-transparent';
  const bubbleAsst = 'bg-white/10 text-zinc-100 backdrop-blur-sm';
  const bubbleSystem = 'bg-white/5 text-emerald-200 italic';

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
      <div className="w-fit" style={{ maxWidth: 'min(110ch, 92%)' }}>
        <div
          className={`${bubbleBase} ${
            isSystem ? bubbleSystem : isUser ? bubbleUser : bubbleAsst
          } ${isUser ? 'break-all' : ''}`}
          // Hard guarantees for stubborn browsers / older Tailwind
          style={{
            ...baseStyle,
            ...(isUser ? userStyle : {}),
            ...(!isUser && !isSystem ? assistantStyle : {}),
          }}
        >
          <div className="space-y-4">
            {segments.map((segment, idx) =>
              segment.type === 'code' ? (
                <div
                  key={`code-${idx}`}
                  className="relative overflow-hidden rounded-xl border border-white/15 bg-slate-950/80 text-slate-100"
                >
                  <div className="flex items-center justify-between px-3 py-2 text-xs uppercase tracking-wide text-white/70">
                    <span className="font-semibold">{segment.lang || 'code'}</span>
                    <button
                      type="button"
                      onClick={() => handleCopy(segment.value, idx)}
                      className="rounded-full border border-white/30 bg-white/10 px-3 py-1 text-[11px] font-semibold text-white transition hover:border-white/60 hover:bg-white/20"
                    >
                      {copiedIdx === idx ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                  <pre className="overflow-x-auto px-4 pb-4 text-[13px] leading-6">
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
            <div className="mt-4 rounded-2xl border border-white/20 bg-black/60 p-2">
              {msg.attachment.type === "image" ? (
                <>
                  <img
                    src={msg.attachment.src}
                    alt={msg.attachment.name}
                    className="w-full max-h-48 rounded-xl object-contain"
                  />
                  <p className="mt-2 text-xs text-white/70">
                    {msg.attachment.name} · {msg.attachment.mime}
                  </p>
                </>
              ) : (
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/10">
                        <svg
                          viewBox="0 0 24 24"
                          className="h-6 w-6 text-white/70"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                        >
                          <path d="M6 3h9l6 6v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" />
                          <path d="M14 3v6h6" />
                        </svg>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-white">{msg.attachment.name}</p>
                        <p className="text-xs text-white/60">
                          {msg.attachment.mime} · {formatBytes(msg.attachment.size)}
                        </p>
                      </div>
                    </div>
                    {msg.attachment.src && (
                      <a
                        href={msg.attachment.src}
                        download={msg.attachment.name}
                        className="rounded-full border border-white/30 bg-white/5 px-3 py-1 text-xs font-medium text-white transition hover:border-white/60 hover:bg-white/10"
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
      </div>
    </div>
  );
}
