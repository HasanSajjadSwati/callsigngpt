// /components/Composer.tsx
'use client';

import { useRef, useState, type ChangeEvent, type ClipboardEvent } from "react";
import { useAutosizeTextarea } from "@/hooks/useAutosizeTextarea";
import { UI_TEXT } from "@/config/uiText";
import { Attachment } from "@/lib/chat";

const MAX_ATTACHMENT_BYTES = Number(process.env.NEXT_PUBLIC_MAX_ATTACHMENT_MB || 5) * 1024 * 1024; // client-side guard

type SearchMode = 'auto' | 'always' | 'off';

type SendPayload = {
  text?: string;
  attachment?: Attachment;
  searchMode?: SearchMode;
};

type Props = {
  disabled?: boolean;
  onSend: (payload: SendPayload) => Promise<void> | void;
  onStop?: () => void;
  showStop?: boolean;
  searchMode?: SearchMode;
  onSearchModeChange?: (next: SearchMode) => void;
};

const formatSize = (size: number) => {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
};

const PARSEABLE_DOC_RE =
  /pdf|msword|officedocument\.wordprocessingml|^text\/|json$|xml$|csv$|yaml$|yml$|markdown$|javascript$|x-javascript$|typescript$|x-typescript$|x-python$|x-ruby$|x-perl$|x-php$|x-sh$|x-shell$|x-shellscript$|x-sql$|x-c$|x-c\+\+$|x-java$|x-kotlin$|x-swift$|x-go$|x-rust$|x-lua$|x-scala$|x-r$|x-toml$|x-ini$|x-properties$|x-log$|x-diff$|x-patch$|graphql$|proto$|x-dotenv$|svelte$|vue$/i;

/**
 * Many browsers return an empty or generic 'application/octet-stream' type for
 * office documents and other well-known file types (especially on systems without
 * the relevant app installed). This map lets us recover the correct MIME from the
 * file extension so the server-side document parser can extract the content.
 */
const MIME_FROM_EXT: Record<string, string> = {
  // Documents
  '.pdf':  'application/pdf',
  '.doc':  'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls':  'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.ppt':  'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.odt':  'application/vnd.oasis.opendocument.text',
  '.ods':  'application/vnd.oasis.opendocument.spreadsheet',
  '.odp':  'application/vnd.oasis.opendocument.presentation',
  '.rtf':  'application/rtf',
  // Plain text / data
  '.txt':  'text/plain',
  '.md':   'text/markdown',
  '.mdx':  'text/markdown',
  '.csv':  'text/csv',
  '.tsv':  'text/tab-separated-values',
  '.json': 'application/json',
  '.jsonc': 'application/json',
  '.yaml': 'application/x-yaml',
  '.yml':  'application/x-yaml',
  '.toml': 'application/x-toml',
  '.xml':  'application/xml',
  '.html': 'text/html',
  '.htm':  'text/html',
  '.svg':  'image/svg+xml',
  '.ini':  'text/x-ini',
  '.env':  'text/x-dotenv',
  '.log':  'text/x-log',
  '.diff': 'text/x-diff',
  '.patch':'text/x-patch',
  // Code
  '.js':   'text/javascript',
  '.mjs':  'text/javascript',
  '.cjs':  'text/javascript',
  '.jsx':  'text/javascript',
  '.ts':   'text/x-typescript',
  '.tsx':  'text/x-typescript',
  '.py':   'text/x-python',
  '.rb':   'text/x-ruby',
  '.java': 'text/x-java',
  '.kt':   'text/x-kotlin',
  '.swift':'text/x-swift',
  '.go':   'text/x-go',
  '.rs':   'text/x-rust',
  '.c':    'text/x-c',
  '.cpp':  'text/x-c++',
  '.h':    'text/x-c',
  '.hpp':  'text/x-c++',
  '.cs':   'text/x-csharp',
  '.php':  'text/x-php',
  '.sh':   'text/x-shellscript',
  '.bash': 'text/x-shellscript',
  '.zsh':  'text/x-shellscript',
  '.ps1':  'text/x-powershell',
  '.lua':  'text/x-lua',
  '.r':    'text/x-r',
  '.scala':'text/x-scala',
  '.dart': 'text/x-dart',
  '.sql':  'text/x-sql',
  '.graphql': 'application/graphql',
  '.gql':  'application/graphql',
  '.proto':'text/x-protobuf',
  '.vue':  'text/x-vue',
  '.svelte':'text/x-svelte',
  '.astro':'text/x-astro',
  '.tf':   'text/x-terraform',
  '.dockerfile': 'text/x-dockerfile',
};

/** Return the most specific MIME for a file, falling back to extension lookup. */
function resolveFileMime(file: File): string {
  if (file.type && file.type !== 'application/octet-stream') return file.type;
  const dotIdx = file.name.lastIndexOf('.');
  if (dotIdx !== -1) {
    const ext = file.name.slice(dotIdx).toLowerCase();
    if (MIME_FROM_EXT[ext]) return MIME_FROM_EXT[ext];
  }
  return file.type || 'application/octet-stream';
}

/**
 * Patch the MIME in a data URL if the browser embedded the wrong one.
 * If the data URL has an empty or generic 'application/octet-stream' MIME but
 * we know the correct one, replace it so the server parser gets the right type.
 */
function patchDataUrlMime(dataUrl: string, correctMime: string): string {
  if (!dataUrl.startsWith('data:')) return dataUrl;
  const semi = dataUrl.indexOf(';base64,');
  if (semi === -1) return dataUrl;
  const embeddedMime = dataUrl.slice(5, semi); // "data:" is 5 chars
  if (embeddedMime === correctMime) return dataUrl; // already correct
  if (embeddedMime && embeddedMime !== 'application/octet-stream') return dataUrl; // browser already set something specific
  return `data:${correctMime};base64,${dataUrl.slice(semi + 8)}`;
}

const readFileAsDataUrl = (file: File | Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });

export default function Composer({
  disabled,
  onSend,
  onStop,
  showStop,
  searchMode = 'auto',
  onSearchModeChange,
}: Props) {
  const [input, setInput] = useState("");
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  useAutosizeTextarea(inputRef, input);
  const showSearchToggle = typeof onSearchModeChange === "function";

  const cycleSearchMode = () => {
    const next: SearchMode = searchMode === 'auto' ? 'always' : searchMode === 'always' ? 'off' : 'auto';
    onSearchModeChange?.(next);
  };

  const searchToggleClasses =
    searchMode === 'always'
      ? "border-[color:var(--ui-accent)] bg-[color:var(--ui-accent-soft)] text-[color:var(--ui-text)]"
      : searchMode === 'off'
        ? "border-red-500/40 bg-red-500/10 text-[color:var(--ui-text-muted)]"
        : "border-[color:var(--ui-border)] bg-[color:var(--ui-surface-alt)] text-[color:var(--ui-text-muted)]";

  const clearAttachment = () => {
    setAttachment(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_ATTACHMENT_BYTES) {
      setError(`Attachments are limited to ${formatSize(MAX_ATTACHMENT_BYTES)}.`);
      event.target.value = "";
      return;
    }
    try {
      const rawSrc = await readFileAsDataUrl(file);
      const isImage = file.type.startsWith("image/");
      if (isImage) {
        setAttachment({
          type: "image",
          src: rawSrc,
          name: file.name || "pasted-image",
          mime: file.type,
          size: file.size,
        });
      } else {
        // Resolve the correct MIME (browser may miss it for Office docs etc.)
        const mime = resolveFileMime(file);
        // Patch the data URL to carry the correct MIME (server parser uses this)
        const src = patchDataUrlMime(rawSrc, mime);
        setAttachment({
          type: "file",
          src,
          name: file.name || "file",
          mime,
          size: file.size,
        });
      }
    } catch (err) {
      console.error("Failed to load attachment", err);
    } finally {
      event.target.value = "";
    }
  };

  const handlePaste = async (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const items = Array.from(event.clipboardData?.items ?? []);
    const imageItem = items.find((item) => item.type.startsWith("image/"));
    if (!imageItem) return;
    event.preventDefault();
    const file = imageItem.getAsFile();
    if (!file) return;
    if (file.size > MAX_ATTACHMENT_BYTES) {
      setError(`Attachments are limited to ${formatSize(MAX_ATTACHMENT_BYTES)}.`);
      return;
    }
    try {
      const src = await readFileAsDataUrl(file);
      setAttachment({
        type: "image",
        src,
        name: file.name || "pasted-image",
        mime: file.type || "image/png",
        size: file.size,
      });
    } catch (err) {
      console.error("Failed to load attachment from clipboard", err);
    }
  };

  const handleSend = async () => {
    if (disabled) return;
    const trimmed = input.trim();
    if (!trimmed && !attachment) return;

    setError(null);
    const payload: SendPayload = {
      text: trimmed || undefined,
      attachment: attachment ?? undefined,
      searchMode,
    };

    // Clear immediately so the just-sent text doesn't linger while the reply streams
    setInput("");
    clearAttachment();

    await onSend(payload);
  };

  return (
    <div className="shrink-0 pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto w-full max-w-none px-1.5 sm:px-2">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleSend();
          }}
          className="flex flex-col gap-2 rounded-2xl border border-[color:var(--ui-border)] bg-[color:var(--ui-input)] px-3 py-2 shadow-sm transition focus-within:border-[color:var(--ui-accent)]"
        >
          {error && (
            <div className="rounded-2xl border border-red-500/40 bg-red-500/10 px-2.5 py-1.5 text-sm text-red-100">
              {error}
            </div>
          )}
          {attachment && (
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-[color:var(--ui-border)] bg-[color:var(--ui-surface-alt)] px-2.5 py-1.5">
              <div className="flex flex-1 items-center gap-3">
                {attachment.type === "image" ? (
                  <img
                    src={attachment.src}
                    alt={attachment.name}
                    className="h-14 w-14 rounded-xl object-contain"
                  />
                ) : (
                  <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-[color:var(--ui-surface-alt)]">
                    <svg viewBox="0 0 24 24" className="h-8 w-8 text-zinc-400" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M6 3h9l6 6v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" />
                      <path d="M14 3v6h6" />
                    </svg>
                  </div>
                )}
                <div className="flex flex-col gap-1">
                  <p className="text-sm font-medium text-[color:var(--ui-text)]">{attachment.name}</p>
                  <p className="text-xs text-zinc-400">
                    {attachment.mime} - {formatSize(attachment.size)}
                  </p>
                  {attachment.type === 'file' && PARSEABLE_DOC_RE.test(attachment.mime) && (
                    <p className="text-[10px] font-medium text-emerald-400">Content will be extracted</p>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={clearAttachment}
                className="rounded-full border border-[color:var(--ui-border)] bg-transparent p-2 text-[color:var(--ui-text)] transition hover:bg-white/5"
                aria-label="Remove attachment"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>
          )}

          {showSearchToggle && (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={cycleSearchMode}
                disabled={disabled}
                title={
                  searchMode === 'auto'
                    ? 'Auto: searches when the query needs it'
                    : searchMode === 'always'
                      ? 'Always: every message triggers web search'
                      : 'Off: web search disabled'
                }
                className={[
                  "inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-medium transition",
                  searchToggleClasses,
                  disabled ? "opacity-60 cursor-not-allowed" : "hover:bg-white/5",
                ].join(" ")}
              >
                {searchMode === 'off' ? (
                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.6">
                    <path d="M2 2l20 20" />
                    <path d="M12 3a9 9 0 0 1 8.5 12M3.5 9A9 9 0 0 0 12 21" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.6">
                    <path d="M12 3a9 9 0 1 0 0 18" />
                    <path d="M3 12h18" />
                    <path d="M12 3a15 15 0 0 1 0 18" />
                  </svg>
                )}
                <span>Search the web</span>
                <span className="text-[10px] uppercase tracking-[0.2em] text-[color:var(--ui-text-subtle)]">
                  {searchMode === 'always' ? 'Always' : searchMode === 'off' ? 'Off' : 'Auto'}
                </span>
              </button>
            </div>
          )}

          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              className="
                composer-input scroll-area
                flex-1 min-h-[42px] max-h-[200px]
                rounded-2xl bg-transparent text-[color:var(--ui-text)]
                px-2.5 py-2 leading-6 text-[16px] sm:text-base
                outline-none resize-none
                placeholder:text-[color:var(--ui-text-subtle)]
                overflow-x-hidden
              "
              placeholder={UI_TEXT.composer.placeholder}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onPaste={handlePaste}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void handleSend();
                }
              }}
              rows={1}
              aria-label={UI_TEXT.composer.ariaLabel}
            />

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={disabled}
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-[color:var(--ui-border)] bg-transparent text-[color:var(--ui-text)] transition hover:bg-white/5"
                aria-label="Attach file — PDF, DOCX, images, text"
                title="Attach file — PDF, DOCX, images, text files supported"
              >
              <span aria-hidden="true" className="flex h-6 w-6 items-center justify-center">
                <img
                  src="/icons8-attach-96.svg"
                  alt=""
                  aria-hidden="true"
                  className="h-5 w-5"
                />
              </span>
                <span className="sr-only">Attach file — PDF, DOCX, images, text</span>
              </button>

              {showStop && (
                <button
                  type="button"
                  onClick={onStop}
                  className="flex h-10 w-10 items-center justify-center rounded-xl border border-[color:var(--ui-border)] text-[color:var(--ui-text)] transition hover:bg-white/5"
                  aria-label={UI_TEXT.composer.stopTitle}
                  title={UI_TEXT.composer.stopTitle}
                >
                  <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
                    <rect x="6" y="6" width="12" height="12" rx="2" />
                  </svg>
                </button>
              )}

              <button
                type="submit"
                className="flex h-10 w-10 items-center justify-center rounded-xl accent-button disabled:opacity-60 disabled:cursor-not-allowed"
                aria-label={UI_TEXT.composer.sendTitle}
                title={UI_TEXT.composer.sendTitle}
                disabled={disabled}
              >
                <img
                  src="/icons8-send-50.svg"
                  alt=""
                  aria-hidden="true"
                  className="h-5 w-5"
                />
              </button>
            </div>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,.pdf,.doc,.docx,.txt,.csv,.json,.xml,.md,.yaml,.yml"
            className="hidden"
            onChange={handleFileChange}
          />
        </form>
      </div>
    </div>
  );
}
