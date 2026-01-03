import React from 'react';

type GoogleAuthButtonProps = {
  onClick: () => void;
  loading?: boolean;
  label?: string;
};

export function GoogleAuthButton({ onClick, loading = false, label }: GoogleAuthButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className="flex w-full items-center justify-center gap-3 rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
      aria-busy={loading}
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white shadow-inner">
        <img src="/google.svg" alt="Google" className="h-5 w-5" />
      </span>
      {loading ? 'Redirecting to Google...' : label ?? 'Continue with Google'}
    </button>
  );
}
