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

const variantStyles: Record<StatusVariant, { gradient: string; text: string }> = {
  error: {
    gradient: 'from-rose-500/70 via-red-500/50 to-orange-400/40',
    text: 'text-rose-100',
  },
  success: {
    gradient: 'from-emerald-500/70 via-green-500/50 to-teal-400/40',
    text: 'text-emerald-100',
  },
  info: {
    gradient: 'from-sky-500/70 via-cyan-500/50 to-indigo-400/40',
    text: 'text-sky-100',
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
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="status-dialog-title"
      aria-describedby="status-dialog-message"
    >
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-xl"
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        className="relative z-10 w-full max-w-lg overflow-hidden rounded-[28px] border border-white/10 bg-gradient-to-br from-zinc-950/95 via-zinc-950/80 to-black/80 shadow-[0_25px_120px_rgba(0,0,0,0.4)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="absolute inset-x-8 top-0 h-32 bg-gradient-to-r from-white/5 via-transparent to-white/5 blur-3xl opacity-60 pointer-events-none" />
        <div className="relative p-8">
          <div
            className={`mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl border border-white/20 bg-gradient-to-br ${styles.gradient} ${styles.text} shadow-lg`}
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

          <h2 id="status-dialog-title" className="mb-3 text-center text-2xl font-semibold text-white">
            {title}
          </h2>
          <p id="status-dialog-message" className="text-center text-sm text-zinc-300">
            {message}
          </p>

          <div className="mt-8 flex justify-center">
            <button
              ref={buttonRef}
              onClick={onClose}
              className="w-full rounded-2xl accent-button px-4 py-3 text-sm font-semibold"
            >
              {primaryText}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
