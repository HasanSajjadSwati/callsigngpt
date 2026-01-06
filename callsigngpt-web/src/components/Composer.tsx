// /components/Composer.tsx
'use client';

import { useRef, useState, type ChangeEvent, type ClipboardEvent } from "react";
import { useAutosizeTextarea } from "@/hooks/useAutosizeTextarea";
import { UI_TEXT } from "@/config/uiText";
import { Attachment } from "@/lib/chat";

const MAX_ATTACHMENT_BYTES = Number(process.env.NEXT_PUBLIC_MAX_ATTACHMENT_MB || 5) * 1024 * 1024; // client-side guard

type SendPayload = {
  text?: string;
  attachment?: Attachment;
};

type Props = {
  disabled?: boolean;
  onSend: (payload: SendPayload) => Promise<void> | void;
  onStop?: () => void;
  showStop?: boolean;
};

const formatSize = (size: number) => {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
};

const readFileAsDataUrl = (file: File | Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });

export default function Composer({ disabled, onSend, onStop, showStop }: Props) {
  const [input, setInput] = useState("");
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  useAutosizeTextarea(inputRef, input);

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
      const src = await readFileAsDataUrl(file);
      const isImage = file.type.startsWith("image/");
      setAttachment({
        type: isImage ? "image" : "file",
        src,
        name: file.name || (isImage ? "pasted-image" : "file"),
        mime: file.type || "application/octet-stream",
        size: file.size,
      });
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
    const payload: SendPayload = { text: trimmed || undefined, attachment: attachment ?? undefined };

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
                aria-label="Attach file (images/files supported on select models)"
                title="Attach file (images/files supported on select models)"
              >
              <span aria-hidden="true" className="flex h-6 w-6 items-center justify-center">
                <img
                  src="/icons8-attach-96.svg"
                  alt=""
                  aria-hidden="true"
                  className="h-5 w-5"
                />
              </span>
                <span className="sr-only">Attach file (images/files supported on select models)</span>
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
            accept="*/*"
            className="hidden"
            onChange={handleFileChange}
          />
        </form>
      </div>
    </div>
  );
}
