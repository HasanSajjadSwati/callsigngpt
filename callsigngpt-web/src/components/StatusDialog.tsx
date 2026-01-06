'use client';

import { useEffect, useRef } from 'react';

type StatusVariant = 'error' | 'success' | 'info';

type StatusDialogProps = {
  open: boolean;
  title: string;
  message: string;
  variant?: StatusVariant;
  primaryText?: string;
  onClose: () => void;
};

const variantStyles: Record<StatusVariant, { tone: string }> = {
  error: {
    tone: 'text-red-300',
  },
  success: {
    tone: 'text-emerald-300',
  },
  info: {
    tone: 'text-[color:var(--ui-accent)]',
  },
};

export default function StatusDialog({
  open,
  title,
  message,
  variant = 'info',
  primaryText = 'Close',
  onClose,
}: StatusDialogProps) {
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Focus the primary action when opened
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => buttonRef.current?.focus(), 0);
    return () => clearTimeout(t);
  }, [open]);

  // Close on ESC
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Prevent body scroll
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  const styles = variantStyles[variant];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3"
      role="dialog"
      aria-modal="true"
      aria-labelledby="status-dialog-title"
      aria-describedby="status-dialog-message"
    >
      <div
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        className="glass-panel relative z-10 w-full max-w-md overflow-hidden rounded-2xl p-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative">
          <div
            className={`mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full border border-[color:var(--ui-border)] bg-[color:var(--ui-surface-alt)] ${styles.tone}`}
          >
            {variant === 'error' && (
              <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            )}
            {variant === 'success' && (
              <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            )}
            {variant === 'info' && (
              <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 16h-1v-4h-1m1-4h.01M12 2a10 10 0 100 20 10 10 0 000-20z"
                />
              </svg>
            )}
          </div>

          <h2 id="status-dialog-title" className="mb-2 text-center text-xl font-semibold text-[color:var(--ui-text)]">
            {title}
          </h2>
          <p id="status-dialog-message" className="text-center text-sm text-zinc-300">
            {message}
          </p>

          <div className="mt-3 flex justify-center">
            <button
              ref={buttonRef}
              onClick={onClose}
              className="w-full rounded-xl accent-button px-3 py-2 text-sm font-semibold"
            >
              {primaryText}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
