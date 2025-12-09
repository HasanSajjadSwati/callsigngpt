// /components/Composer.tsx
'use client';

import { useRef, useState, type ChangeEvent, type ClipboardEvent } from "react";
import { useAutosizeTextarea } from "@/hooks/useAutosizeTextarea";
import { UI_TEXT } from "@/config/uiText";
import { Attachment } from "@/lib/chat";

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

    const payload: SendPayload = { text: trimmed || undefined, attachment: attachment ?? undefined };

    // Clear immediately so the just-sent text doesn't linger while the reply streams
    setInput("");
    clearAttachment();

    await onSend(payload);
  };

  return (
    <div className="shrink-0 pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto w-full max-w-none px-2 sm:px-3 lg:px-4">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleSend();
          }}
          className="flex flex-col gap-3 rounded-[28px] border border-white/10 bg-black/60 px-4 py-4 shadow-[0_25px_80px_rgba(2,6,23,.65)] backdrop-blur-xl transition-all duration-200 focus-within:border-white/30 focus-within:shadow-[0_30px_90px_rgba(2,6,23,.8)]"
        >
          {attachment && (
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/20 bg-white/5 px-3 py-2">
              <div className="flex flex-1 items-center gap-3">
                {attachment.type === "image" ? (
                  <img
                    src={attachment.src}
                    alt={attachment.name}
                    className="h-16 w-16 rounded-xl object-contain"
                  />
                ) : (
                  <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-white/10">
                    <svg viewBox="0 0 24 24" className="h-8 w-8 text-white/70" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M6 3h9l6 6v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" />
                      <path d="M14 3v6h6" />
                    </svg>
                  </div>
                )}
                <div className="flex flex-col gap-1">
                  <p className="text-sm font-medium text-white">{attachment.name}</p>
                  <p className="text-xs text-zinc-400">
                    {attachment.mime} · {formatSize(attachment.size)}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={clearAttachment}
                className="rounded-full border border-white/30 bg-white/5 p-2 text-white transition hover:border-white/60 hover:bg-white/10"
                aria-label="Remove attachment"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>
          )}

          <div className="flex items-end gap-3">
            <textarea
              ref={inputRef}
              className="
                composer-input scroll-area
                flex-1 min-h-[48px] max-h-[200px]
                rounded-2xl bg-transparent text-white
                px-3 py-3 leading-5 sm:leading-6 text-sm sm:text-base
                outline-none resize-none
                placeholder:text-zinc-500
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
                className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/20 text-white transition-all duration-200 hover:border-white/40 hover:bg-white/10 hover:-translate-y-0.5"
                aria-label="Attach file"
                title="Attach file"
              >
              <span aria-hidden="true" className="flex h-6 w-6 items-center justify-center">
                <svg viewBox="0 0 24 24" className="h-5 w-5" stroke="currentColor" strokeWidth="1.5" fill="none">
                  <path d="M8 2a5 5 0 0 0-5 5v8a5 5 0 0 0 5 5h8a5 5 0 0 0 5-5v-6a3 3 0 0 0-3-3h-5a2 2 0 0 0-2 2v5" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M7 7l5 5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </span>
                <span className="sr-only">Attach file</span>
              </button>

              {showStop && (
                <button
                  type="button"
                  onClick={onStop}
                  className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/20 text-white transition-all duration-200 hover:border-white/40 hover:bg-white/10 hover:-translate-y-0.5"
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
                className="flex h-12 w-12 items-center justify-center rounded-2xl accent-button disabled:opacity-60 disabled:cursor-not-allowed"
                aria-label={UI_TEXT.composer.sendTitle}
                title={UI_TEXT.composer.sendTitle}
                disabled={disabled}
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
                  <path d="M2.99 12.69c-.61-.26-.62-1.12-.01-1.39l16.5-7.22c.68-.3 1.38.4 1.08 1.08l-7.22 16.5c-.27.61-1.13.6-1.39-.01l-2.25-5.29a1 1 0 0 0-.51-.51l-5.29-2.25zM9.7 13.3l2.23 5.25 6.03-13.77-13.77 6.03 5.25 2.23c.64.27 1.15.78 1.51 1.26.36-.48.87-.99 1.25-1.26z" />
                </svg>
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
