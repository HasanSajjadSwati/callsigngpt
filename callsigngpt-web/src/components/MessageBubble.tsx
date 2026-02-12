'use client';

import { useCallback, useMemo, useState, type ReactNode, type CSSProperties } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import rehypeRaw from 'rehype-raw';
import { UIMsg } from '@/lib/chat';

/* ─── Icons ──────────────────────────────────────────────────────────── */

function CopyIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function CheckIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

/* ─── Helpers ────────────────────────────────────────────────────────── */

export type Role = UIMsg['role'];
export type Message = UIMsg;

const formatBytes = (size: number) => {
  if (!size) return '0 B';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
};

/** Extract text content from React children (for copy-to-clipboard). */
function extractText(node: ReactNode): string {
  if (typeof node === 'string') return node;
  if (typeof node === 'number') return String(node);
  if (!node) return '';
  if (Array.isArray(node)) return node.map(extractText).join('');
  if (typeof node === 'object' && 'props' in node) {
    return extractText((node as React.ReactElement<{ children?: ReactNode }>).props.children);
  }
  return '';
}

/* ─── CodeBlock sub-component ────────────────────────────────────────── */

function CodeBlock({
  lang,
  children,
}: {
  lang: string | undefined;
  children: ReactNode;
}) {
  const [copied, setCopied] = useState(false);
  const code = extractText(children).replace(/\n$/, '');

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* noop */ }
  }, [code]);

  return (
    <div className="code-block-wrapper group relative my-3 first:mt-0 last:mb-0 rounded-xl overflow-hidden border border-[var(--ui-border)] shadow-lg">
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-[#1a1b26] border-b border-[var(--ui-border)]">
        <span className="text-xs font-medium text-[var(--ui-text-muted)] tracking-wide">
          {lang || 'plaintext'}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-medium transition-all duration-150 text-[var(--ui-text-muted)] hover:text-white hover:bg-white/10"
        >
          {copied ? (
            <>
              <CheckIcon className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-emerald-400">Copied!</span>
            </>
          ) : (
            <>
              <CopyIcon className="w-3.5 h-3.5" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
      {/* Code body */}
      <div className="scroll-area overflow-x-auto bg-[#0d1117]">
        <pre className="px-4 py-4 text-[13px] leading-[1.7] m-0">
          <code className={`hljs ${lang ? `language-${lang}` : ''} whitespace-pre font-mono`}>
            {children}
          </code>
        </pre>
      </div>
    </div>
  );
}

/* ─── Main component ─────────────────────────────────────────────────── */

export default function MessageBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === 'user';
  const isSystem = msg.role === 'system';
  const [msgCopied, setMsgCopied] = useState(false);

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

  const handleCopyMessage = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(msg.content);
      setMsgCopied(true);
      setTimeout(() => setMsgCopied(false), 2000);
    } catch { /* noop */ }
  }, [msg.content]);

  const baseStyle = useMemo<CSSProperties>(
    () => ({
      overflowWrap: 'anywhere',
      wordBreak: 'break-word',
    }),
    [],
  );

  const hasCode = /```/.test(msg.content);

  const bubbleWrapper = hasCode
    ? 'w-full min-w-0 max-w-[98%] lg:max-w-[100ch]'
    : 'w-fit min-w-0 max-w-[96%] lg:max-w-[100ch]';

  /* ─── Render ─────────────────────────────────────────── */

  return (
    <div className={`group/msg w-full flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={bubbleWrapper}>
        <div
          className={[
            'relative inline-block max-w-full rounded-2xl text-[15px] leading-relaxed break-words border px-4 py-2.5',
            isSystem
              ? 'bg-[var(--ui-surface-alt)] text-[var(--ui-text-muted)] italic border-[var(--ui-border)] shadow-sm'
              : isUser
                ? 'bg-[var(--ui-surface)] text-white border-[var(--ui-border-strong)] shadow-md whitespace-pre-wrap'
                : 'bg-[var(--ui-surface)] text-[var(--ui-text)] border-[var(--ui-border)] shadow-md',
            isUser ? 'break-all' : '',
            hasCode ? 'w-full' : '',
          ].join(' ')}
          style={baseStyle}
        >
          {/* ── Markdown content ── */}
          <div className={`markdown-body ${isUser ? '' : 'assistant'}`}>
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[rehypeRaw, rehypeHighlight]}
              components={{
                /* ── Paragraphs ── */
                p: ({ children }) => (
                  <p className="mb-2 last:mb-0 leading-[1.55] text-[15px]">{children}</p>
                ),

                /* ── Headings ── */
                h1: ({ children }) => (
                  <h1 className="text-xl font-bold mb-2 mt-4 first:mt-0 pb-1.5 border-b border-[var(--ui-border)] text-white leading-tight">{children}</h1>
                ),
                h2: ({ children }) => (
                  <h2 className="text-lg font-bold mb-2 mt-3 first:mt-0 pb-1 border-b border-[var(--ui-border)] text-white leading-tight">{children}</h2>
                ),
                h3: ({ children }) => (
                  <h3 className="text-base font-semibold mb-1.5 mt-3 first:mt-0 text-white leading-snug">{children}</h3>
                ),
                h4: ({ children }) => (
                  <h4 className="text-[15px] font-semibold mb-1 mt-2 first:mt-0 text-white leading-snug">{children}</h4>
                ),

                /* ── Lists ── */
                ul: ({ children }) => (
                  <ul className="list-disc list-outside ml-5 mb-2 last:mb-0 mt-0.5 space-y-0.5 marker:text-[var(--ui-text-subtle)]">{children}</ul>
                ),
                ol: ({ children }) => (
                  <ol className="list-decimal list-outside ml-5 mb-2 last:mb-0 mt-0.5 space-y-0.5 marker:text-[var(--ui-text-subtle)] marker:font-medium">{children}</ol>
                ),
                li: ({ children }) => (
                  <li className="leading-[1.55] pl-1">{children}</li>
                ),

                /* ── Links ── */
                a: ({ href, children }) => (
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[var(--ui-accent)] hover:text-[var(--ui-accent-strong)] underline underline-offset-[3px] decoration-[var(--ui-accent)]/40 hover:decoration-[var(--ui-accent)] transition-colors duration-150"
                  >
                    {children}
                  </a>
                ),

                /* ── Inline formatting ── */
                strong: ({ children }) => <strong className="font-semibold text-white">{children}</strong>,
                em: ({ children }) => <em className="italic text-[var(--ui-text)]">{children}</em>,
                del: ({ children }) => <del className="line-through opacity-60">{children}</del>,

                /* ── Blockquotes ── */
                blockquote: ({ children }) => (
                  <blockquote className="border-l-[3px] border-[var(--ui-accent)]/50 bg-[var(--ui-accent-soft)] rounded-r-lg pl-4 pr-4 py-2 my-3 first:mt-0 last:mb-0 text-[var(--ui-text)]">
                    {children}
                  </blockquote>
                ),

                /* ── Horizontal rule ── */
                hr: () => <hr className="my-4 border-t border-[var(--ui-border)]" />,

                /* ── Tables ── */
                table: ({ children }) => (
                  <div className="scroll-area overflow-x-auto my-3 first:mt-0 last:mb-0 rounded-xl border border-[var(--ui-border)] shadow-sm">
                    <table className="min-w-full border-collapse text-sm">{children}</table>
                  </div>
                ),
                thead: ({ children }) => <thead className="bg-[#1a1b26]">{children}</thead>,
                tbody: ({ children }) => <tbody className="bg-[#0d1117]/50">{children}</tbody>,
                tr: ({ children }) => <tr className="border-b border-[var(--ui-border)] last:border-0">{children}</tr>,
                th: ({ children }) => (
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-white uppercase tracking-wider">{children}</th>
                ),
                td: ({ children }) => (
                  <td className="px-4 py-2.5 text-sm">{children}</td>
                ),

                /* ── Code: fenced blocks + inline ── */
                pre: ({ children }) => {
                  // unwrap the <code> from react-markdown's <pre><code>...</code></pre>
                  return <>{children}</>;
                },
                code: ({ children, className }) => {
                  const langMatch = className?.match(/language-(\w+)/);
                  const lang = langMatch?.[1];

                  // Fenced code block (has language- class from rehype-highlight)
                  if (className?.includes('hljs') || className?.includes('language-')) {
                    return (
                      <CodeBlock lang={lang}>{children}</CodeBlock>
                    );
                  }

                  // Inline code
                  return (
                    <code className="inline-code bg-[#1a1b26] text-[#e6db74] px-[7px] py-[3px] rounded-md text-[13px] font-mono border border-[var(--ui-border)] break-words whitespace-normal">
                      {children}
                    </code>
                  );
                },
              }}
            >
              {msg.content}
            </ReactMarkdown>
          </div>

          {/* ── Attachment ── */}
          {msg.attachment && (
            <div className="mt-4 rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface-alt)] p-3">
              {msg.attachment.type === 'image' ? (
                <>
                  <img
                    src={msg.attachment.src}
                    alt={msg.attachment.name}
                    className="w-full max-h-48 rounded-lg object-contain"
                  />
                  <p className="mt-2 text-xs text-[var(--ui-text-muted)]">
                    {msg.attachment.name} — {msg.attachment.mime}
                  </p>
                </>
              ) : (
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--ui-surface)]">
                      <svg viewBox="0 0 24 24" className="h-5 w-5 text-[var(--ui-text-muted)]" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M6 3h9l6 6v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" />
                        <path d="M14 3v6h6" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-white">{msg.attachment.name}</p>
                      <p className="text-xs text-[var(--ui-text-muted)]">
                        {msg.attachment.mime} — {formatBytes(msg.attachment.size)}
                      </p>
                    </div>
                  </div>
                  {msg.attachment.src && (
                    <a
                      href={msg.attachment.src}
                      download={msg.attachment.name}
                      className="rounded-lg border border-[var(--ui-border)] bg-[var(--ui-surface)] hover:bg-[var(--ui-surface-alt)] px-3 py-1.5 text-xs font-medium text-white transition-colors duration-150"
                    >
                      Download
                    </a>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Footer: timestamp + copy message button ── */}
        <div
          className={`mt-1.5 flex items-center gap-2 text-[10.5px] text-[var(--ui-text-subtle)] ${
            isUser ? 'justify-end' : 'justify-start'
          }`}
        >
          {timestampLabel && (
            <span className="inline-flex items-center gap-1 px-1">
              <svg viewBox="0 0 24 24" className="h-3 w-3 opacity-50" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 7v5.2l3 1.8" />
              </svg>
              <span className="font-medium tracking-tight opacity-70">{timestampLabel}</span>
            </span>
          )}
          {!isUser && !isSystem && (
            <button
              type="button"
              onClick={handleCopyMessage}
              className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 opacity-0 group-hover/msg:opacity-100 transition-opacity duration-200 hover:bg-white/5 text-[var(--ui-text-subtle)] hover:text-[var(--ui-text-muted)]"
              title="Copy message"
            >
              {msgCopied ? (
                <>
                  <CheckIcon className="w-3 h-3 text-emerald-400" />
                  <span className="text-emerald-400 font-medium">Copied</span>
                </>
              ) : (
                <>
                  <CopyIcon className="w-3 h-3" />
                  <span>Copy</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
