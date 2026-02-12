"use client";

type Props = {
  query?: string | null;
};

const trimQuery = (value: string, max = 80) =>
  value.length > max ? `${value.slice(0, max - 3)}...` : value;

export default function SearchIndicator({ query }: Props) {
  const label = query
    ? `Searching the web for "${trimQuery(query)}"`
    : 'Searching the web';
  const dots = [0, 1, 2];

  return (
    <div className="flex w-full justify-start">
      <div className="inline-flex items-center gap-2 rounded-full border border-[color:var(--ui-border)] bg-[color:var(--ui-surface)] px-3 py-1.5 text-xs text-zinc-400 shadow-sm">
        {/* Globe icon */}
        <svg
          className="h-3.5 w-3.5 text-[color:var(--ui-accent)] animate-spin"
          style={{ animationDuration: '2s' }}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <circle cx="12" cy="12" r="10" />
          <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
        </svg>
        <div className="flex items-center gap-1">
          {dots.map((dot) => (
            <span
              key={dot}
              className="h-1.5 w-1.5 rounded-full bg-[color:var(--ui-accent)] opacity-80 animate-pulse"
              style={{ animationDelay: `${dot * 0.2}s` }}
            />
          ))}
        </div>
        <span className="text-[11px] uppercase tracking-[0.2em] text-zinc-500">
          {label}
        </span>
      </div>
    </div>
  );
}
