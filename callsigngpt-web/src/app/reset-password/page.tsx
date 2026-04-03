'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import StatusDialog from '@/components/StatusDialog';

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [ready, setReady] = useState(false);
  const [statusDialog, setStatusDialog] = useState<{
    open: boolean;
    title: string;
    message: string;
    variant: 'error' | 'success' | 'info';
  }>({ open: false, title: '', message: '', variant: 'info' });

  const inputClass =
    'w-full rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-sm sm:text-base text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-400/40 focus:border-emerald-400/40 transition backdrop-blur';

  // Supabase exchanges the token in the URL hash automatically when the page loads.
  // We listen for the PASSWORD_RECOVERY event to know we're ready.
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setReady(true);
      }
    });

    // Also check if there's already an active session (user clicked link & session is set)
    supabase.auth.getSession().then(({ data }) => {
      if (data?.session) {
        setReady(true);
      }
    });

    return () => {
      sub.subscription.unsubscribe();
    };
  }, []);

  const PASSWORD_MIN_LENGTH = 8;
  const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^a-zA-Z\d]).{8,}$/;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (password !== confirmPassword) {
      setStatusDialog({
        open: true,
        title: 'Passwords don\u2019t match',
        message: 'Please make sure both password fields match.',
        variant: 'error',
      });
      return;
    }

    if (password.length < PASSWORD_MIN_LENGTH) {
      setStatusDialog({
        open: true,
        title: 'Password too short',
        message: `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`,
        variant: 'error',
      });
      return;
    }

    if (!PASSWORD_REGEX.test(password)) {
      setStatusDialog({
        open: true,
        title: 'Password too weak',
        message:
          'Password must contain at least one uppercase letter, one lowercase letter, one digit, and one special character.',
        variant: 'error',
      });
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });

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
          title: 'Password updated',
          message: 'Your password has been reset successfully. Redirecting to sign in…',
          variant: 'success',
        });
        // Sign out so user can log in fresh with new password
        await supabase.auth.signOut();
        setTimeout(() => router.replace('/login'), 2000);
      }
    } catch (err: any) {
      setStatusDialog({
        open: true,
        title: 'Error',
        message: err?.message ?? 'Something went wrong. Please try again.',
        variant: 'error',
      });
    } finally {
      setSubmitting(false);
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
        {!ready ? (
          <div className="space-y-4 text-center">
            <p className="text-[11px] uppercase tracking-[0.35em] text-emerald-200/80">
              CallSignGPT
            </p>
            <h1 className="text-2xl font-semibold text-white">Verifying your link…</h1>
            <p className="text-sm text-zinc-400">
              Please wait while we verify your password reset link. If this takes too long,
              your link may have expired.
            </p>
            <a
              href="/forgot-password"
              className="inline-block text-sm font-semibold text-zinc-200 underline-offset-4 hover:underline"
            >
              Request a new link
            </a>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="space-y-2 text-left">
              <p className="text-[11px] uppercase tracking-[0.35em] text-emerald-200/80">
                CallSignGPT
              </p>
              <h1 className="text-2xl font-semibold text-white">Set a new password</h1>
              <p className="text-sm text-zinc-400">
                Choose a strong password with at least 8 characters, including uppercase,
                lowercase, a digit, and a special character.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <input
                type="password"
                className={inputClass}
                placeholder="New password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={PASSWORD_MIN_LENGTH}
              />
              <input
                type="password"
                className={inputClass}
                placeholder="Confirm new password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={PASSWORD_MIN_LENGTH}
              />

              <button
                type="submit"
                disabled={submitting || !password || !confirmPassword}
                className="w-full rounded-2xl bg-gradient-to-r from-emerald-400 via-sky-400 to-cyan-400 px-4 py-3.5 text-sm font-semibold text-black shadow-lg shadow-emerald-500/30 transition hover:shadow-emerald-400/50 disabled:opacity-60 sm:text-base"
              >
                {submitting ? 'Updating…' : 'Reset password'}
              </button>
            </form>

            <div className="text-center text-sm text-zinc-400">
              <a
                href="/login"
                className="font-semibold text-zinc-200 underline-offset-4 hover:underline"
              >
                Back to sign in
              </a>
            </div>
          </div>
        )}
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
