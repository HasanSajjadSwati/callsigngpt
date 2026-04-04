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

function DownloadIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v13M8 12l4 4 4-4" />
      <path d="M3 19h18" />
    </svg>
  );
}

/* ─── Language → file extension map ─────────────────────────────────── */

const LANG_EXT: Record<string, string> = {
  javascript: '.js', js: '.js',
  typescript: '.ts', ts: '.ts',
  jsx: '.jsx', tsx: '.tsx',
  python: '.py', py: '.py',
  ruby: '.rb', rb: '.rb',
  java: '.java',
  kotlin: '.kt',
  swift: '.swift',
  go: '.go', golang: '.go',
  rust: '.rs',
  c: '.c',
  cpp: '.cpp', 'c++': '.cpp',
  csharp: '.cs', cs: '.cs',
  php: '.php',
  html: '.html',
  css: '.css',
  scss: '.scss', sass: '.sass',
  less: '.less',
  json: '.json',
  yaml: '.yaml', yml: '.yaml',
  xml: '.xml',
  toml: '.toml',
  ini: '.ini',
  env: '.env',
  sql: '.sql',
  graphql: '.graphql', gql: '.graphql',
  bash: '.sh', sh: '.sh', shell: '.sh', zsh: '.sh', fish: '.sh',
  powershell: '.ps1', ps1: '.ps1',
  dockerfile: '.dockerfile',
  makefile: '.makefile',
  cmake: '.cmake',
  markdown: '.md', md: '.md',
  mdx: '.mdx',
  csv: '.csv',
  log: '.log', logs: '.log',
  nginx: '.conf', apache: '.conf',
  lua: '.lua',
  perl: '.pl',
  r: '.r',
  scala: '.scala',
  dart: '.dart',
  elixir: '.ex',
  clojure: '.clj',
  haskell: '.hs',
  tex: '.tex', latex: '.tex',
  diff: '.diff', patch: '.patch',
  svelte: '.svelte',
  vue: '.vue',
  astro: '.astro',
  proto: '.proto',
  plaintext: '.txt', text: '.txt',
};

function langToExt(lang: string | undefined): string {
  if (!lang) return '.txt';
  return LANG_EXT[lang.toLowerCase()] ?? `.${lang.toLowerCase()}`;
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
  const [downloaded, setDownloaded] = useState(false);
  const code = extractText(children).replace(/\n$/, '');

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* noop */ }
  }, [code]);

  const handleDownload = useCallback(() => {
    try {
      const ext = langToExt(lang);
      const filename = `file${ext}`;
      const blob = new Blob([code], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setDownloaded(true);
      setTimeout(() => setDownloaded(false), 2000);
    } catch { /* noop */ }
  }, [code, lang]);

  return (
    <div className="code-block-wrapper group relative my-3 first:mt-0 last:mb-0 rounded-xl overflow-hidden border border-[var(--ui-border)] shadow-lg">
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-[#1a1b26] border-b border-[var(--ui-border)]">
        <span className="text-xs font-medium text-[var(--ui-text-muted)] tracking-wide">
          {lang || 'plaintext'}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleDownload}
            className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-medium transition-all duration-150 text-[var(--ui-text-muted)] hover:text-white hover:bg-white/10"
            title={`Download as file${langToExt(lang)}`}
          >
            {downloaded ? (
              <>
                <CheckIcon className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-emerald-400">Saved!</span>
              </>
            ) : (
              <>
                <DownloadIcon className="w-3.5 h-3.5" />
                <span>Save file</span>
              </>
            )}
          </button>
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

/* ─── File delivery card ─────────────────────────────────────────────── */

/* ─── Detect document extensions that use export conversion ─────────── */
const DOCX_EXPORT_EXTS = new Set(['docx', 'doc', 'odt', 'rtf']);
const PDF_EXPORT_EXTS = new Set(['pdf']);

function getFileExt(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot !== -1 ? name.slice(dot + 1).toLowerCase() : '';
}

/** Download a blob object URL, triggering a save-file dialog. */
function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function FileCard({
  filename,
  content,
}: {
  filename: string;
  content: string;
}) {
  const ext = getFileExt(filename);
  const outputFmt: 'docx' | 'pdf' | 'txt' = PDF_EXPORT_EXTS.has(ext)
    ? 'pdf'
    : DOCX_EXPORT_EXTS.has(ext)
      ? 'docx'
      : 'txt';
  const useExportApi = outputFmt === 'docx' || outputFmt === 'pdf';
  const [downloading, setDownloading] = useState(false);
  const [downloaded, setDownloaded] = useState(false);

  const displayFilename = useExportApi
    ? outputFmt === 'docx'
      ? filename.replace(/\.[^.]+$/, '.docx')
      : filename.replace(/\.[^.]+$/, '.pdf')
    : filename;

  const size = useMemo(() => new Blob([content]).size, [content]);

  const handleDownload = useCallback(async () => {
    if (downloading) return;
    setDownloading(true);
    try {
      if (useExportApi) {
        // Call the export API to generate a real Word/PDF document
        const res = await fetch('/api/documents/export', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content, filename: displayFilename, format: outputFmt }),
        });
        if (!res.ok) throw new Error(`Export failed: ${res.status}`);
        const blob = await res.blob();
        triggerBlobDownload(blob, displayFilename);
      } else {
        // Plain text download
        const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
        triggerBlobDownload(blob, displayFilename);
      }
      setDownloaded(true);
      setTimeout(() => setDownloaded(false), 2500);
    } catch (err) {
      console.error('[FileCard] Download failed:', err);
    } finally {
      setDownloading(false);
    }
  }, [content, displayFilename, downloading, outputFmt, useExportApi]);

  return (
    <div className="my-3 first:mt-0 last:mb-0 rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface-alt)] overflow-hidden">
      <div className="flex flex-col gap-3 p-4">
        {/* File info row */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-[var(--ui-surface)] border border-[var(--ui-border)]">
            <svg viewBox="0 0 24 24" className="h-6 w-6 text-[var(--ui-accent)]" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M6 3h9l6 6v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" />
              <path d="M14 3v6h6" />
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-white truncate">{displayFilename}</p>
            <p className="text-xs text-[var(--ui-text-muted)]">{formatBytes(size)}</p>
          </div>
        </div>

        {/* Download row */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={handleDownload}
            disabled={downloading}
            className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-[var(--ui-border)] bg-[var(--ui-surface)] hover:bg-[var(--ui-accent-soft)] px-4 py-2 text-sm font-medium text-white transition-colors duration-150 disabled:opacity-50"
          >
            {downloaded ? (
              <>
                <CheckIcon className="w-4 h-4 text-emerald-400" />
                <span className="text-emerald-400">Downloaded!</span>
              </>
            ) : downloading ? (
              <>
                <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="9" strokeOpacity="0.25" />
                  <path d="M12 3a9 9 0 0 1 9 9" />
                </svg>
                <span>Generating…</span>
              </>
            ) : (
              <>
                <DownloadIcon className="w-4 h-4" />
                <span>Download</span>
              </>
            )}
          </button>
        </div>

        {/* Note for rich-format outputs */}
        {useExportApi && (
          <p className="text-[11px] text-[var(--ui-text-muted)] leading-snug">
            Delivered with basic formatting from markdown/text. Complex original layout (tables, images) may be simplified.
          </p>
        )}
      </div>
    </div>
  );
}

/* ─── Content segment parsing for file delivery ──────────────────────── */

type ContentSegment =
  | { type: 'markdown'; content: string }
  | { type: 'file'; filename: string; content: string };

/**
 * Split message content into markdown segments and file delivery blocks.
 * File blocks use the convention: ```lang:filename.ext\ncontent\n```
 */
function parseContentSegments(content: string): ContentSegment[] {
  const FILE_BLOCK_RE = /```\w+:([^\n]+)\n([\s\S]*?)```/g;
  const segments: ContentSegment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = FILE_BLOCK_RE.exec(content)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: 'markdown', content: content.slice(lastIndex, match.index) });
    }
    segments.push({
      type: 'file',
      filename: match[1].trim(),
      content: match[2].replace(/\n$/, ''),
    });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < content.length) {
    segments.push({ type: 'markdown', content: content.slice(lastIndex) });
  }

  return segments.length > 0 ? segments : [{ type: 'markdown', content }];
}

/* ─── Shared markdown config ─────────────────────────────────────────── */

const REMARK_PLUGINS = [remarkGfm];
const REHYPE_PLUGINS = [rehypeRaw, rehypeHighlight];
const MARKDOWN_COMPONENTS = {
  p: ({ children }: { children?: ReactNode }) => (
    <p className="mb-2 last:mb-0 leading-[1.55] text-[15px]">{children}</p>
  ),
  h1: ({ children }: { children?: ReactNode }) => (
    <h1 className="text-xl font-bold mb-2 mt-4 first:mt-0 pb-1.5 border-b border-[var(--ui-border)] text-white leading-tight">{children}</h1>
  ),
  h2: ({ children }: { children?: ReactNode }) => (
    <h2 className="text-lg font-bold mb-2 mt-3 first:mt-0 pb-1 border-b border-[var(--ui-border)] text-white leading-tight">{children}</h2>
  ),
  h3: ({ children }: { children?: ReactNode }) => (
    <h3 className="text-base font-semibold mb-1.5 mt-3 first:mt-0 text-white leading-snug">{children}</h3>
  ),
  h4: ({ children }: { children?: ReactNode }) => (
    <h4 className="text-[15px] font-semibold mb-1 mt-2 first:mt-0 text-white leading-snug">{children}</h4>
  ),
  ul: ({ children }: { children?: ReactNode }) => (
    <ul className="list-disc list-outside ml-5 mb-2 last:mb-0 mt-0.5 space-y-0.5 marker:text-[var(--ui-text-subtle)]">{children}</ul>
  ),
  ol: ({ children }: { children?: ReactNode }) => (
    <ol className="list-decimal list-outside ml-5 mb-2 last:mb-0 mt-0.5 space-y-0.5 marker:text-[var(--ui-text-subtle)] marker:font-medium">{children}</ol>
  ),
  li: ({ children }: { children?: ReactNode }) => (
    <li className="leading-[1.55] pl-1">{children}</li>
  ),
  a: ({ href, children }: { href?: string; children?: ReactNode }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-[var(--ui-accent)] hover:text-[var(--ui-accent-strong)] underline underline-offset-[3px] decoration-[var(--ui-accent)]/40 hover:decoration-[var(--ui-accent)] transition-colors duration-150"
    >
      {children}
    </a>
  ),
  strong: ({ children }: { children?: ReactNode }) => <strong className="font-semibold text-white">{children}</strong>,
  em: ({ children }: { children?: ReactNode }) => <em className="italic text-[var(--ui-text)]">{children}</em>,
  del: ({ children }: { children?: ReactNode }) => <del className="line-through opacity-60">{children}</del>,
  blockquote: ({ children }: { children?: ReactNode }) => (
    <blockquote className="border-l-[3px] border-[var(--ui-accent)]/50 bg-[var(--ui-accent-soft)] rounded-r-lg pl-4 pr-4 py-2 my-3 first:mt-0 last:mb-0 text-[var(--ui-text)]">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-4 border-t border-[var(--ui-border)]" />,
  table: ({ children }: { children?: ReactNode }) => (
    <div className="scroll-area overflow-x-auto my-3 first:mt-0 last:mb-0 rounded-xl border border-[var(--ui-border)] shadow-sm">
      <table className="min-w-full border-collapse text-sm">{children}</table>
    </div>
  ),
  thead: ({ children }: { children?: ReactNode }) => <thead className="bg-[#1a1b26]">{children}</thead>,
  tbody: ({ children }: { children?: ReactNode }) => <tbody className="bg-[#0d1117]/50">{children}</tbody>,
  tr: ({ children }: { children?: ReactNode }) => <tr className="border-b border-[var(--ui-border)] last:border-0">{children}</tr>,
  th: ({ children }: { children?: ReactNode }) => (
    <th className="px-4 py-2.5 text-left text-xs font-semibold text-white uppercase tracking-wider">{children}</th>
  ),
  td: ({ children }: { children?: ReactNode }) => (
    <td className="px-4 py-2.5 text-sm">{children}</td>
  ),
  pre: ({ children }: { children?: ReactNode }) => <>{children}</>,
  code: ({ children, className }: { children?: ReactNode; className?: string }) => {
    const langMatch = className?.match(/language-(\w+)/);
    const lang = langMatch?.[1];

    if (className?.includes('hljs') || className?.includes('language-')) {
      return <CodeBlock lang={lang}>{children}</CodeBlock>;
    }

    return (
      <code className="inline-code bg-[#1a1b26] text-[#e6db74] px-[7px] py-[3px] rounded-md text-[13px] font-mono border border-[var(--ui-border)] break-words whitespace-normal">
        {children}
      </code>
    );
  },
};

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
  const hasFile = /```\w+:[^\n]+\n/.test(msg.content);

  const bubbleWrapper = hasCode || hasFile
    ? 'w-full min-w-0 max-w-[98%] lg:max-w-[100ch]'
    : 'w-fit min-w-0 max-w-[96%] lg:max-w-[100ch]';

  const segments = useMemo(() => parseContentSegments(msg.content), [msg.content]);

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
            {segments.map((seg, i) =>
              seg.type === 'file' ? (
                <FileCard key={i} filename={seg.filename} content={seg.content} />
              ) : (
                <ReactMarkdown
                  key={i}
                  remarkPlugins={REMARK_PLUGINS}
                  rehypePlugins={REHYPE_PLUGINS}
                  components={MARKDOWN_COMPONENTS}
                >
                  {seg.content}
                </ReactMarkdown>
              ),
            )}
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
