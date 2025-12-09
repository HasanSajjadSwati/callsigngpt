"use client";

export default function TypingIndicator() {
  const dots = [0, 1, 2];

  return (
    <div className="flex w-full justify-start">
      <div className="inline-flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-xs text-zinc-200 shadow-[0_15px_40px_rgba(2,6,23,.35)]">
        <div className="flex items-center gap-1">
          {dots.map((dot) => (
            <span
              key={dot}
              className="h-2 w-2 rounded-full bg-emerald-300/80 animate-pulse"
              style={{ animationDelay: `${dot * 0.15}s` }}
            />
          ))}
        </div>
        <span className="text-[10px] uppercase tracking-[0.35em] text-zinc-500">
          Assistant typing
        </span>
      </div>
    </div>
  );
}
