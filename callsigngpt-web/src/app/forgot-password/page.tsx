'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { getAuthRedirectUrl } from '@/lib/authRedirect';
import StatusDialog from '@/components/StatusDialog';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [statusDialog, setStatusDialog] = useState<{
    open: boolean;
    title: string;
    message: string;
    variant: 'error' | 'success' | 'info';
  }>({ open: false, title: '', message: '', variant: 'info' });

  const inputClass =
    'w-full rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-sm sm:text-base text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-400/40 focus:border-emerald-400/40 transition backdrop-blur';

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;

    setSending(true);
    try {
      const redirectTo = getAuthRedirectUrl('/reset-password');

      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo,
      });

      if (error) {
        setStatusDialog({
          open: true,
          title: 'Error',
          message: error.message,
          variant: 'error',
        });
      } else {
        setStatusDialog({
          open: true,
          title: 'Check your email',
          message:
            'If an account exists with that email, you will receive a password reset link shortly.',
          variant: 'success',
        });
        setEmail('');
      }
    } catch (err: any) {
      setStatusDialog({
        open: true,
        title: 'Error',
        message: err?.message ?? 'Something went wrong. Please try again.',
        variant: 'error',
      });
    } finally {
      setSending(false);
    }
  }

  return (
    <main className="relative min-h-screen flex items-center justify-center px-4 py-8 text-zinc-100">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-16 -top-24 h-64 w-64 rounded-full bg-emerald-500/15 blur-[120px]" />
        <div className="absolute right-[-60px] top-10 h-56 w-56 rounded-full bg-indigo-500/12 blur-[120px]" />
        <div className="absolute -bottom-28 left-1/2 h-72 w-72 -translate-x-1/2 transform rounded-full bg-cyan-500/10 blur-[130px]" />
      </div>

      <section className="glass-panel gradient-border relative w-full max-w-md rounded-[28px] border border-white/10 p-6 shadow-[0_25px_90px_rgba(2,6,23,.6)] sm:p-8">
        <div className="space-y-6">
          <div className="space-y-2 text-left">
            <p className="text-[11px] uppercase tracking-[0.35em] text-emerald-200/80">
              CallSignGPT
            </p>
            <h1 className="text-2xl font-semibold text-white">Forgot your password?</h1>
            <p className="text-sm text-zinc-400">
              Enter the email address associated with your account and we&apos;ll send you a
              link to reset your password.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <input
              className={inputClass}
              placeholder="Email address"
              autoComplete="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />

            <button
              type="submit"
              disabled={sending || !email.trim()}
              className="w-full rounded-2xl bg-gradient-to-r from-emerald-400 via-sky-400 to-cyan-400 px-4 py-3.5 text-sm font-semibold text-black shadow-lg shadow-emerald-500/30 transition hover:shadow-emerald-400/50 disabled:opacity-60 sm:text-base"
            >
              {sending ? 'Sending…' : 'Send reset link'}
            </button>
          </form>

          <div className="text-center text-sm text-zinc-400">
            Remember your password?{' '}
            <a
              href="/login"
              className="font-semibold text-zinc-200 underline-offset-4 hover:underline"
            >
              Sign in
            </a>
          </div>
        </div>
      </section>

      <StatusDialog
        open={statusDialog.open}
        title={statusDialog.title}
        message={statusDialog.message}
        variant={statusDialog.variant}
        onClose={() => setStatusDialog((prev) => ({ ...prev, open: false }))}
      />
    </main>
  );
}
