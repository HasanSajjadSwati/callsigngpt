'use client';

import { usePathname } from 'next/navigation';
import ModelPicker from '@/components/ModelPicker';
import { useEffect, useState } from 'react';

type Props = {
  model?: string;
  setModel?: (m: string) => void;
  showLogo?: boolean;
  showStatusBadge?: boolean;
};

type ModelMeta = {
  key: string;
  label: string;
  description?: string;
};

export default function TopBar({ model, setModel, showLogo = false, showStatusBadge = true }: Props) {
  const pathname = usePathname();
  const isChatPage = pathname === '/';
  const [meta, setMeta] = useState<Record<string, ModelMeta>>({});
  const badgeCopy = ['Secure by design', 'Realtime sync', 'Multi-provider ready'];

  useEffect(() => {
    let cancelled = false;
    const apiBase =
      (process.env.NEXT_PUBLIC_API_URL ||
        (typeof window !== 'undefined' ? window.location.origin.replace(/:3000$/, ':3001') : '')
      ).replace(/\/$/, '');
    (async () => {
      try {
        if (!apiBase) throw new Error('API base URL not configured');
        const resp = await fetch(`${apiBase}/models`);
        if (!resp.ok) throw new Error(`models fetch failed ${resp.status}`);
        const data = await resp.json();
        if (cancelled) return;
        const map: Record<string, ModelMeta> = {};
        for (const m of data || []) {
          map[m.modelKey] = {
            key: m.modelKey,
            label: m.displayName || m.modelKey,
            description: `${m.provider} - ${m.providerModel}`,
          };
        }
        setMeta(map);
      } catch (err) {
        console.error('Failed to load model metadata', err);
        setMeta({});
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const currentModel = model ? meta[model] : undefined;
  const description = currentModel?.description ?? 'Pilot conversations with precision.';
  const displayName = currentModel?.label ?? 'CallSignGPT';

  return (
    <header className="min-h-[80px] rounded-[20px] border border-white/10 bg-white/5 px-4 py-4 shadow-[0_8px_30px_rgba(2,6,23,.45)]">
      <div className="flex h-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        {showLogo && !isChatPage ? (
          <div className="flex w-full flex-col gap-3">
            <div className="flex items-center gap-3 sm:gap-4">
              <div className="grid h-12 w-12 place-items-center rounded-2xl border border-white/20 bg-white/10 shadow-[0_12px_50px_rgba(2,6,23,.6)]">
                <img
                  src="/callsign-logo.svg"
                  alt="CallSignGPT logo"
                  className="h-7 w-7 opacity-95"
                  draggable={false}
                />
              </div>
              <div className="flex flex-col leading-tight">
                <span className="text-[10px] uppercase tracking-[0.45em] text-emerald-200/80">
                  {displayName}
                </span>
                <span className="text-lg font-semibold text-white sm:text-xl">
                  Pilot conversations with precision.
                </span>
                <span className="text-xs text-zinc-400 sm:text-sm">
                  Model-aware routing, synced history, and audit-ready controls for every team.
                </span>
              </div>
              {showStatusBadge && (
                <span className="ml-auto hidden rounded-full border border-emerald-300/30 bg-emerald-300/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.25em] text-emerald-50 shadow-inner sm:inline-flex">
                  Live sync
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {badgeCopy.map((badge) => (
                <span
                  key={badge}
                  className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/5 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-200 shadow-[0_10px_30px_rgba(2,6,23,.4)]"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />
                  {badge}
                </span>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3 sm:gap-4">
            {showLogo && (
              <div className="grid h-11 w-11 place-items-center rounded-2xl border border-white/15 bg-white/10 shadow-[0_8px_30px_rgba(2,6,23,.45)]">
                <img
                  src="/callsign-logo.svg"
                  alt="CallSignGPT logo"
                  className="h-6 w-6 opacity-95"
                  draggable={false}
                />
              </div>
            )}
            <div className="flex flex-col leading-tight">
              <span className="text-[9px] uppercase tracking-[0.4em] text-zinc-500">{displayName}</span>
              <span className="text-sm font-semibold text-white">{description}</span>
            </div>
          </div>
        )}
        {isChatPage && model !== undefined && setModel && (
          <div className="w-full sm:max-w-lg">
            <ModelPicker value={model} onChange={setModel} />
          </div>
        )}
      </div>
    </header>
  );
}
