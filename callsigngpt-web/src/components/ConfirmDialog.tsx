'use client';

import { useEffect, useRef } from 'react';

type ConfirmDialogProps = {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
  variant?: 'danger' | 'default';
};

export default function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  onConfirm,
  onCancel,
  variant = 'default',
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);

  // Handle ESC key
  useEffect(() => {
    if (!isOpen) return;

    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel();
      }
    };

    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [isOpen, onCancel]);

  // Focus confirm button when opened
  useEffect(() => {
    if (isOpen && confirmButtonRef.current) {
      // Small delay to ensure dialog is rendered
      setTimeout(() => {
        confirmButtonRef.current?.focus();
      }, 0);
    }
  }, [isOpen]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const isDanger = variant === 'danger';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      aria-describedby="confirm-dialog-message"
    >
      <div
        className="absolute inset-0 bg-black/60"
        onClick={onCancel}
        aria-hidden="true"
      />

      <div
        ref={dialogRef}
        className="glass-panel relative z-10 w-full max-w-md overflow-hidden rounded-2xl p-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative">
          <div
            className={`mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full border border-[color:var(--ui-border)] bg-[color:var(--ui-surface-alt)] ${
              isDanger ? 'text-red-300' : 'text-[color:var(--ui-accent)]'
            }`}
          >
            {isDanger ? (
              <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            ) : (
              <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            )}
          </div>

          <h2 id="confirm-dialog-title" className="mb-2 text-center text-xl font-semibold text-[color:var(--ui-text)]">
            {title}
          </h2>
          <p id="confirm-dialog-message" className="text-center text-sm text-zinc-400">
            {message}
          </p>

          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <button
              onClick={onCancel}
              className="flex-1 rounded-xl border border-[color:var(--ui-border)] bg-transparent px-3 py-2 text-sm font-medium text-[color:var(--ui-text)] transition hover:bg-white/5"
            >
              {cancelText}
            </button>
            <button
              ref={confirmButtonRef}
              onClick={onConfirm}
              className={`flex-1 rounded-xl px-3 py-2 text-sm font-semibold ${
                isDanger
                  ? 'border border-red-500/40 bg-red-500/15 text-red-100 hover:bg-red-500/25'
                  : 'accent-button'
              }`}
            >
              {confirmText}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

