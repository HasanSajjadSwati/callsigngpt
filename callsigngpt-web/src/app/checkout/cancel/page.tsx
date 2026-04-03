'use client';

import { useRouter } from 'next/navigation';

export default function CheckoutCancelPage() {
  const router = useRouter();

  return (
    <main className="flex min-h-screen items-center justify-center px-4 text-zinc-100">
      <div className="w-full max-w-md space-y-6 text-center">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-zinc-500/20">
          <svg viewBox="0 0 24 24" className="h-10 w-10 text-zinc-400" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M6 6l12 12M6 18L18 6" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-white">Payment Cancelled</h1>
        <p className="text-sm text-zinc-400">
          No charges were made. You can try again anytime from your account settings.
        </p>
        <div className="flex gap-3">
          <button
            onClick={() => router.push('/account')}
            className="flex-1 rounded-2xl border border-white/15 bg-white/5 py-3 text-sm font-medium text-zinc-200 transition hover:border-white/30 hover:bg-white/10"
          >
            Back to Account
          </button>
          <button
            onClick={() => router.push('/')}
            className="flex-1 rounded-2xl bg-gradient-to-r from-emerald-400 via-cyan-400 to-sky-400 py-3 text-sm font-bold text-black shadow-lg"
          >
            Continue chatting
          </button>
        </div>
      </div>
    </main>
  );
}
