'use client';

import { useCallback, useMemo, useState, type CSSProperties } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
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
    'inline-block max-w-full rounded-2xl px-4 py-2.5 text-[15px] leading-[1.4] whitespace-pre-wrap break-words',
    'border',
  ].join(' ');

  const bubbleWrapper = hasCode
    ? 'w-full min-w-0 max-w-[98%] lg:max-w-[100ch]'
    : 'w-fit min-w-0 max-w-[96%] lg:max-w-[100ch]';

  const bubbleUser =
    'bg-[#343541] text-white border-[#4a4a5e] shadow-md';
  const bubbleAsst =
    'bg-[#2b2c33] text-[#ececf1] border-[#3a3b43] shadow-md';
  const bubbleSystem =
    'bg-[#2d2d38] text-[#b4b4ba] italic border-[#3e3e4a] shadow-sm';

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
          <div className="space-y-0">
            {segments.map((segment, idx) =>
              segment.type === 'code' ? (
                <div
                  key={`code-${idx}`}
                  className="relative max-w-full rounded-lg overflow-hidden border border-[#565869]/30 bg-[#1e1e28] text-[#ececf1] shadow-lg"
                >
                  <div className="flex items-center justify-between px-4 py-2.5 bg-[#2d2d38]/60 border-b border-[#565869]/20">
                    <span className="text-xs font-medium text-[#b4b4ba] uppercase tracking-wider">{segment.lang || 'plaintext'}</span>
                    <button
                      type="button"
                      onClick={() => handleCopy(segment.value, idx)}
                      className="rounded-md bg-[#343541] hover:bg-[#40414f] px-3 py-1.5 text-[11px] font-medium text-[#ececf1] transition-all duration-150 border border-[#565869]/30 hover:border-[#565869]/50"
                    >
                      {copiedIdx === idx ? '✓ Copied!' : 'Copy code'}
                    </button>
                  </div>
                  <pre
                    className="scroll-area overflow-x-auto overscroll-x-contain px-4 py-4 text-[13.5px] leading-[1.6]"
                    style={{ WebkitOverflowScrolling: 'touch', touchAction: 'pan-x' }}
                  >
                    <code className="whitespace-pre font-mono text-[#ececf1]">{segment.value}</code>
                  </pre>
                </div>
              ) : (
                <div
                  key={`text-${idx}`}
                  className="markdown-content prose prose-invert max-w-none"
                >
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      // Paragraphs
                      p: ({ children }) => <p className="mb-0 last:mb-0 leading-[1.3] text-[15px]">{children}</p>,
                      // Headers
                      h1: ({ children }) => <h1 className="text-xl font-bold mb-0 mt-0 first:mt-0 leading-[1.1] text-white">{children}</h1>,
                      h2: ({ children }) => <h2 className="text-lg font-bold mb-0 mt-0 first:mt-0 leading-[1.1] text-white">{children}</h2>,
                      h3: ({ children }) => <h3 className="text-base font-semibold mb-0 mt-0 first:mt-0 leading-[1.1] text-white">{children}</h3>,
                      h4: ({ children }) => <h4 className="text-[15px] font-semibold mb-0 mt-0 first:mt-0 leading-[1.1] text-white">{children}</h4>,
                      // Lists
                      ul: ({ children }) => <ul className="list-disc list-outside ml-5 mb-0 mt-0 space-y-0 marker:text-[#b4b4ba]">{children}</ul>,
                      ol: ({ children }) => <ol className="list-decimal list-outside ml-5 mb-0 mt-0 space-y-0 marker:text-[#b4b4ba] marker:font-medium">{children}</ol>,
                      li: ({ children }) => <li className="leading-[1.3] pl-1 my-0 py-0">{children}</li>,
                      // Links
                      a: ({ href, children }) => (
                        <a
                          href={href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[#10a37f] hover:text-[#0e8f6f] underline underline-offset-[3px] decoration-1 hover:decoration-2 transition-all duration-150 font-normal"
                        >
                          {children}
                        </a>
                      ),
                      // Bold, italic, strikethrough
                      strong: ({ children }) => <strong className="font-semibold text-white">{children}</strong>,
                      em: ({ children }) => <em className="italic">{children}</em>,
                      del: ({ children }) => <del className="line-through opacity-80">{children}</del>,
                      // Blockquotes
                      blockquote: ({ children }) => (
                        <blockquote className="border-l-[3px] border-[#565869] bg-[#2d2d38]/40 rounded-r-md pl-4 pr-4 py-1 my-0 text-[#d1d1d6]">
                          {children}
                        </blockquote>
                      ),
                      // Horizontal rule
                      hr: () => <hr className="my-0 border-t border-[#565869]/30" />,
                      // Tables
                      table: ({ children }) => (
                        <div className="overflow-x-auto my-0 rounded-lg border border-[#565869]/40">
                          <table className="min-w-full border-collapse">
                            {children}
                          </table>
                        </div>
                      ),
                      thead: ({ children }) => <thead className="bg-[#2d2d38]">{children}</thead>,
                      tbody: ({ children }) => <tbody className="bg-[#1e1e28]">{children}</tbody>,
                      tr: ({ children }) => <tr className="border-b border-[#565869]/20 last:border-0">{children}</tr>,
                      th: ({ children }) => (
                        <th className="px-4 py-3 text-left text-sm font-semibold text-white">
                          {children}
                        </th>
                      ),
                      td: ({ children }) => (
                        <td className="px-4 py-3 text-sm">{children}</td>
                      ),
                      // Code inline (not fenced blocks)
                      code: ({ children, className }) => {
                        // If it has a language class, it's a code block (already handled by our fence parser)
                        if (className?.includes('language-')) {
                          return <code className={className}>{children}</code>;
                        }
                        // Inline code
                        return (
                          <code className="bg-[#1e1e28] text-[#ececf1] px-[6px] py-[2px] rounded-md text-[13.5px] font-mono border border-[#565869]/30 whitespace-nowrap">
                            {children}
                          </code>
                        );
                      },
                    }}
                  >
                    {segment.value}
                  </ReactMarkdown>
                </div>
              ),
            )}
          </div>

          {msg.attachment && (
            <div className="mt-4 rounded-lg border border-[#565869]/30 bg-[#2d2d38]/40 p-3">
              {msg.attachment.type === 'image' ? (
                <>
                  <img
                    src={msg.attachment.src}
                    alt={msg.attachment.name}
                    className="w-full max-h-48 rounded-md object-contain"
                  />
                  <p className="mt-2 text-xs text-[#b4b4ba]">
                    {msg.attachment.name} - {msg.attachment.mime}
                  </p>
                </>
              ) : (
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#343541]">
                        <svg
                          viewBox="0 0 24 24"
                          className="h-5 w-5 text-[#b4b4ba]"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                        >
                          <path d="M6 3h9l6 6v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" />
                          <path d="M14 3v6h6" />
                        </svg>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-white">
                          {msg.attachment.name}
                        </p>
                        <p className="text-xs text-[#b4b4ba]">
                          {msg.attachment.mime} - {formatBytes(msg.attachment.size)}
                        </p>
                      </div>
                    </div>
                    {msg.attachment.src && (
                      <a
                        href={msg.attachment.src}
                        download={msg.attachment.name}
                        className="rounded-md border border-[#565869]/40 bg-[#343541] hover:bg-[#40414f] px-3 py-1.5 text-xs font-medium text-white transition-all duration-150"
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
            className={`mt-2 flex text-[10.5px] text-[#8e8ea0] ${
              isUser ? 'justify-end' : 'justify-start'
            }`}
          >
            <span className="inline-flex items-center gap-1.5 px-1">
              <svg
                viewBox="0 0 24 24"
                className="h-3.5 w-3.5 opacity-60"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <circle cx="12" cy="12" r="9" />
                <path d="M12 7v5.2l3 1.8" />
              </svg>
              <span className="font-medium tracking-tight opacity-80">{timestampLabel}</span>
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
