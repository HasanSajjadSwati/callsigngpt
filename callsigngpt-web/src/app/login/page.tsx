'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import TopBar from '@/components/TopBar';
import StatusDialog from '@/components/StatusDialog';
import { GoogleAuthButton } from '@/components/GoogleAuthButton';

const HIGHLIGHTS = [
  {
    title: 'Unified history',
    desc: 'Move between phone, tablet, and desktop without losing context.',
    kicker: 'Continuity',
  },
  {
    title: 'Instant model swap',
    desc: 'Switch providers mid-chat and keep responses flowing.',
    kicker: 'Control',
  },
  {
    title: 'Secure access',
    desc: 'SSO-ready auth, encrypted at rest, privacy by default.',
    kicker: 'Trust',
  },
];

const CHIPS = ['Realtime streaming', 'Device-to-device handoff', 'Workspace ready'];

export default function LoginPage() {
  const router = useRouter();
  const { signIn, signInWithGoogle, loading, session } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [googleLoading, setGoogleLoading] = useState(false);
  const [statusDialog, setStatusDialog] = useState<{
    open: boolean;
    title: string;
    message: string;
  }>({ open: false, title: '', message: '' });
  const inputClass =
    'w-full rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-sm sm:text-base text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-400/40 focus:border-emerald-400/40 transition backdrop-blur';

  // Redirect after login once auth has loaded
  useEffect(() => {
    if (!loading && session) {
      router.replace('/');
    }
  }, [loading, session, router]);

  return (
    <main className="relative min-h-screen overflow-hidden px-4 py-8 text-zinc-100 sm:px-6 md:px-8 lg:px-14 lg:py-12">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-16 -top-24 h-64 w-64 rounded-full bg-emerald-500/15 blur-[120px]" />
        <div className="absolute right-[-60px] top-10 h-56 w-56 rounded-full bg-indigo-500/12 blur-[120px]" />
        <div className="absolute -bottom-28 left-1/2 h-72 w-72 -translate-x-1/2 transform rounded-full bg-cyan-500/10 blur-[130px]" />
      </div>

      <div className="relative mx-auto flex w-full max-w-6xl flex-col gap-6 sm:gap-8 lg:gap-10">
        <TopBar showLogo showStatusBadge={false} />
        <div className="grid gap-6 md:grid-cols-[1.05fr_0.95fr] md:items-start lg:gap-8 xl:gap-12">
          <section className="glass-panel gradient-border relative order-2 overflow-hidden rounded-[32px] border border-white/10 p-6 shadow-[0_30px_120px_rgba(2,6,23,.6)] sm:p-8 md:order-1">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_15%,rgba(16,185,129,0.12),transparent_40%),radial-gradient(circle_at_85%_0%,rgba(14,165,233,0.12),transparent_40%),radial-gradient(circle_at_50%_110%,rgba(37,99,235,0.08),transparent_35%)]" />
            <div className="relative flex flex-col gap-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-2 text-left">
                  <p className="text-[11px] uppercase tracking-[0.35em] text-emerald-200/80">CallSignGPT</p>
                  <h1 className="text-2xl font-semibold leading-tight text-white sm:text-3xl md:text-4xl">
                    Sign in to pick up right where you left off.
                  </h1>
                  <p className="text-sm text-zinc-400 sm:text-base">
                    Access conversations, manage your workspace, and explore every model from a single canvas.
                  </p>
                </div>
                <div className="flex items-center gap-5 self-start rounded-full border border-emerald-300/20 bg-emerald-300/10 px-5 py-1 text-[11px] font-semibold uppercase tracking-[0.25em] text-emerald-50 shadow-inner">
                  <span className="h-2 w-3 rounded-full bg-emerald-400 shadow-[0_0_0_6px_rgba(16,185,129,0.15)]" />
                  Live sync
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {HIGHLIGHTS.map((item) => (
                  <div
                    key={item.title}
                    className="rounded-2xl border border-white/5 bg-white/5 p-4 text-left shadow-[0_15px_45px_rgba(2,6,23,.35)]"
                  >
                    <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-zinc-500">
                      {item.kicker}
                    </p>
                    <p className="mt-2 text-base font-semibold text-white">{item.title}</p>
                    <p className="mt-1 text-sm text-zinc-400">{item.desc}</p>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap gap-2">
                {CHIPS.map((chip) => (
                  <span
                    key={chip}
                    className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-200"
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-cyan-400" />
                    {chip}
                  </span>
                ))}
              </div>
            </div>
          </section>

          <section className="glass-panel gradient-border relative order-1 w-full rounded-[28px] border border-white/10 p-5 shadow-[0_25px_90px_rgba(2,6,23,.6)] sm:p-6 md:order-2 md:sticky md:top-6">
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const { error } = await signIn(email, password);
                if (error) {
                  setStatusDialog({
                    open: true,
                    title: 'Sign in failed',
                    message: error || 'Unable to sign in. Please try again.',
                  });
                } else {
                  router.replace('/');
                }
              }}
              className="space-y-5 sm:space-y-6"
            >
              <div className="flex flex-wrap items-start justify-between gap-2 text-left">
                <div className="space-y-1">
                  <span className="text-xs font-semibold uppercase tracking-[0.4em] text-zinc-500">
                    Welcome back
                  </span>
                  <h2 className="text-2xl font-semibold text-white">Sign in to your account</h2>
                </div>
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.25em] text-zinc-200">
                  Secure
                </span>
              </div>

              <div className="space-y-3">
                <GoogleAuthButton
                  loading={googleLoading}
                  onClick={async () => {
                    setGoogleLoading(true);
                    const { error } = await signInWithGoogle('/');
                    if (error) {
                      setStatusDialog({
                        open: true,
                        title: 'Google sign-in failed',
                        message: error,
                      });
                      setGoogleLoading(false);
                    }
                  }}
                />
                <div className="flex items-center gap-3 text-xs uppercase tracking-[0.2em] text-zinc-500">
                  <span className="h-px flex-1 bg-white/10" />
                  <span className="text-[11px]">Or continue with email</span>
                  <span className="h-px flex-1 bg-white/10" />
                </div>
              </div>

              <div className="space-y-3">
                <input
                  className={inputClass}
                  placeholder="Email address"
                  autoComplete="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />

                <input
                  type="password"
                  className={inputClass}
                  placeholder="Password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>

              <button className="w-full rounded-2xl bg-gradient-to-r from-emerald-400 via-sky-400 to-cyan-400 px-4 py-3.5 text-sm font-semibold text-black shadow-lg shadow-emerald-500/30 transition hover:shadow-emerald-400/50 sm:text-base">
                Sign in
              </button>

              <div className="text-center text-sm text-zinc-400">
                Don&apos;t have an account?{' '}
                <a href="/signup" className="font-semibold text-zinc-200 underline-offset-4 hover:underline">
                  Create one
                </a>
              </div>
            </form>
            <StatusDialog
              open={statusDialog.open}
              title={statusDialog.title}
              message={statusDialog.message}
              variant="error"
              onClose={() => setStatusDialog({ open: false, title: '', message: '' })}
            />
          </section>
        </div>
      </div>
    </main>
  );
}
