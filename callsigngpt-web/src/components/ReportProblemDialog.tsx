'use client';

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import ConfirmDialog from './ConfirmDialog';
import StatusDialog from './StatusDialog';

type ReportProblemDialogProps = {
  open: boolean;
  onClose: () => void;
  email?: string;
  name?: string;
};

const MAX_FILES = 5;
const MAX_FILE_SIZE_MB = 5;

export default function ReportProblemDialog({ open, onClose, email = '', name = '' }: ReportProblemDialogProps) {
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [reporterEmail, setReporterEmail] = useState(email);
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [successOpen, setSuccessOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const wasOpenRef = useRef(open);

  const resetForm = useCallback(() => {
    setSubject('');
    setDescription('');
    setReporterEmail(email);
    setFiles([]);
    setError('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [email]);

  const hasChanges =
    subject.trim() !== '' ||
    description.trim() !== '' ||
    files.length > 0 ||
    reporterEmail.trim() !== email.trim();

  const closeAndReset = useCallback(() => {
    resetForm();
    setConfirmOpen(false);
    onClose();
  }, [onClose, resetForm]);

  const requestClose = useCallback(() => {
    if (hasChanges) {
      setConfirmOpen(true);
      return;
    }
    closeAndReset();
  }, [closeAndReset, hasChanges]);

  // Keep email in sync with auth changes
  useEffect(() => {
    setReporterEmail(email);
  }, [email]);

  // Track client mount so we can safely portal outside transformed parents
  useEffect(() => {
    setMounted(true);
  }, []);

  // Close on ESC
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (confirmOpen) return;
        requestClose();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, confirmOpen, requestClose]);

  // Prevent body scroll when open
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (wasOpenRef.current && !open) {
      resetForm();
      setConfirmOpen(false);
    }
    wasOpenRef.current = open;
  }, [open, resetForm]);

  const handleFiles = (fileList: FileList | null) => {
    if (!fileList) return;
    const incoming = Array.from(fileList);
    const next: File[] = [];
    let warning = '';

    for (const file of incoming) {
      if (next.length + files.length >= MAX_FILES) {
        warning = `You can attach up to ${MAX_FILES} files.`;
        break;
      }
      if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
        warning = `Each file must be under ${MAX_FILE_SIZE_MB}MB.`;
        continue;
      }
      next.push(file);
    }

    if (next.length) {
      setFiles((prev) => [...prev, ...next]);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    if (warning) setError(warning);
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmedDescription = description.trim();
    const trimmedSubject = subject.trim();
    const trimmedEmail = reporterEmail.trim();

    if (!trimmedDescription) {
      setError('Please describe the issue so we can help.');
      return;
    }

    setSubmitting(true);
    setError('');

    const formData = new FormData();
    formData.append('description', trimmedDescription);
    if (trimmedSubject) formData.append('subject', trimmedSubject);
    if (trimmedEmail) formData.append('email', trimmedEmail);
    if (name) formData.append('name', name);
    files.forEach((file) => formData.append('attachments', file, file.name));

    try {
      const res = await fetch('/api/report-issue', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error || 'Something went wrong while sending your report.');
      }

      resetForm();
      setSuccessOpen(true);
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to send your report.';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  const formattedFileSize = (size: number) => `${(size / (1024 * 1024)).toFixed(1)} MB`;

  const dialogContent = !open ? null : (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="report-problem-title"
    >
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-xl"
        onClick={requestClose}
        aria-hidden="true"
      />

      <div
        className="relative z-10 w-full max-w-2xl overflow-hidden rounded-[28px] border border-white/10 bg-gradient-to-br from-zinc-950/95 via-zinc-950/85 to-black/85 shadow-[0_25px_120px_rgba(0,0,0,0.4)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="absolute inset-x-8 top-0 h-28 bg-gradient-to-r from-white/10 via-transparent to-white/10 blur-3xl opacity-60 pointer-events-none" />
        <div className="relative p-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm uppercase tracking-[0.35em] text-emerald-300/80">Support</p>
              <h2 id="report-problem-title" className="mt-1 text-2xl font-semibold text-white">
                Report a problem
              </h2>
              <p className="mt-1 text-sm text-zinc-400">
                Tell us what went wrong. Screenshots help us fix issues faster.
              </p>
            </div>
            <button
              type="button"
              onClick={requestClose}
              className="rounded-full p-2 text-zinc-400 transition hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300"
              aria-label="Close"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 6l12 12M6 18L18 6" />
              </svg>
            </button>
          </div>

          <form className="mt-6 space-y-5" onSubmit={handleSubmit}>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="space-y-2">
                <span className="text-xs uppercase tracking-[0.22em] text-zinc-400">Subject</span>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Something isn't working as expected"
                  className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-zinc-500 focus:border-emerald-300/70 focus:outline-none focus:ring-2 focus:ring-emerald-300/30"
                />
              </label>

              <label className="space-y-2">
                <span className="text-xs uppercase tracking-[0.22em] text-zinc-400">Contact email</span>
                <input
                  type="email"
                  value={reporterEmail}
                  onChange={(e) => setReporterEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-zinc-500 focus:border-emerald-300/70 focus:outline-none focus:ring-2 focus:ring-emerald-300/30"
                />
              </label>
            </div>

            <label className="space-y-2">
              <span className="text-xs uppercase tracking-[0.22em] text-zinc-400">What happened?</span>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Include any steps to reproduce, expected behavior, and what you saw instead."
                className="min-h-[140px] w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-zinc-500 focus:border-emerald-300/70 focus:outline-none focus:ring-2 focus:ring-emerald-300/30"
              />
            </label>

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.22em] text-zinc-400">Screenshots</p>
                  <p className="text-xs text-zinc-500">PNG, JPG, GIF - up to {MAX_FILES} files, {MAX_FILE_SIZE_MB}MB each</p>
                </div>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-xs font-medium text-white transition hover:border-white/40 hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300"
                >
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                  Add screenshot
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => handleFiles(e.target.files)}
                />
              </div>

              {files.length > 0 && (
                <ul className="space-y-2 rounded-2xl border border-white/5 bg-white/5 p-3">
                  {files.map((file, idx) => (
                    <li
                      key={`${file.name}-${idx}`}
                      className="flex items-center justify-between gap-3 rounded-xl bg-white/5 px-3 py-2 text-sm text-white"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-white/90">{file.name}</p>
                        <p className="text-xs text-zinc-400">{formattedFileSize(file.size)}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeFile(idx)}
                        className="rounded-full p-1.5 text-zinc-400 transition hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300"
                        aria-label={`Remove ${file.name}`}
                      >
                        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M6 6l12 12M6 18L18 6" />
                        </svg>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {error && <p className="text-sm text-rose-200">{error}</p>}

            <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={requestClose}
                className="rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-sm font-medium text-zinc-200 transition hover:border-white/40 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex items-center justify-center gap-2 rounded-2xl accent-button px-4 py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-70"
              >
                {submitting && (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-black/40 border-t-black" aria-hidden="true" />
                )}
                Send report
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );

  const statusContent = (
    <StatusDialog
      open={successOpen}
      title="Report sent"
      message="Thanks for letting us know. We'll take a look and follow up if we need more details."
      variant="success"
      primaryText="Close"
      onClose={() => {
        setSuccessOpen(false);
        onClose();
      }}
    />
  );

  const confirmContent = (
    <ConfirmDialog
      isOpen={confirmOpen}
      title="Discard report?"
      message="You have unsent changes. Closing now will clear your report."
      confirmText="Discard"
      cancelText="Keep editing"
      variant="danger"
      onConfirm={closeAndReset}
      onCancel={() => setConfirmOpen(false)}
    />
  );

  return (
    <>
      {mounted ? createPortal(dialogContent, document.body) : dialogContent}
      {mounted ? createPortal(statusContent, document.body) : statusContent}
      {mounted ? createPortal(confirmContent, document.body) : confirmContent}
    </>
  );
}
