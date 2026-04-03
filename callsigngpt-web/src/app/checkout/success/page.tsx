'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth';

function CheckoutSuccessInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get('session_id');
  const { session } = useAuth();
  const [countdown, setCountdown] = useState(5);

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          router.replace('/');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [router]);

  return (
    <main className="flex min-h-screen items-center justify-center px-4 text-zinc-100">
      <div className="w-full max-w-md space-y-6 text-center">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500/20">
          <svg viewBox="0 0 24 24" className="h-10 w-10 text-emerald-400" fill="none" stroke="currentColor" strokeWidth={2.5}>
            <path d="M20 6L9 17l-5-5" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-white">Payment Successful!</h1>
        <p className="text-sm text-zinc-400">
          Your plan has been upgraded. Changes may take a moment to reflect.
        </p>
        {sessionId && (
          <p className="text-xs text-zinc-500">
            Reference: {sessionId}
          </p>
        )}
        <div className="space-y-3">
          <button
            onClick={() => router.replace('/')}
            className="w-full rounded-2xl bg-gradient-to-r from-emerald-400 via-cyan-400 to-sky-400 py-3 text-sm font-bold text-black shadow-lg"
          >
            Start chatting
          </button>
          <p className="text-xs text-zinc-500">
            Redirecting in {countdown}s…
          </p>
        </div>
      </div>
    </main>
  );
}

export default function CheckoutSuccessPage() {
  return (
    <Suspense>
      <CheckoutSuccessInner />
    </Suspense>
  );
}
