"use client";

type Props = {
  query?: string | null;
};

const trimQuery = (value: string, max = 64) =>
  value.length > max ? `${value.slice(0, max - 3)}...` : value;

export default function SearchIndicator({ query }: Props) {
  const label = query
    ? `Searching the web for "${trimQuery(query)}"`
    : 'Searching the web';
  const dots = [0, 1, 2];

  return (
    <div className="flex w-full justify-start">
      <div className="inline-flex items-center gap-2 rounded-full border border-[color:var(--ui-border)] bg-[color:var(--ui-surface)] px-2.5 py-1 text-xs text-zinc-400">
        <div className="flex items-center gap-1">
          {dots.map((dot) => (
            <span
              key={dot}
              className="h-2 w-2 rounded-full bg-[color:var(--ui-accent)] opacity-80 animate-pulse"
              style={{ animationDelay: `${dot * 0.15}s` }}
            />
          ))}
        </div>
        <span className="text-[11px] uppercase tracking-[0.25em] text-zinc-500">
          {label}
        </span>
      </div>
    </div>
  );
}
