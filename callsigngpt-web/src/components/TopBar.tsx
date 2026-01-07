'use client';

import { usePathname } from 'next/navigation';
import ModelPicker from '@/components/ModelPicker';
import { useEffect, useState } from 'react';
import { modelCache } from '@/lib/modelCache';

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
    (async () => {
      try {
        const data = await modelCache.list();
        if (cancelled) return;
        const map: Record<string, ModelMeta> = {};
        for (const m of data || []) {
          const parts = [m.provider, m.providerModel].filter(Boolean);
          map[m.modelKey] = {
            key: m.modelKey,
            label: m.displayName || m.modelKey,
            description: parts.length ? parts.join(' - ') : undefined,
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
    <header className="min-h-[64px] rounded-2xl border border-[color:var(--ui-border)] bg-[color:var(--ui-surface)] px-3 py-3">
      <div className="flex h-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
        {showLogo && !isChatPage ? (
          <div className="flex w-full flex-col gap-3">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-xl border border-[color:var(--ui-border)] bg-[color:var(--ui-surface-alt)] p-2">
                <img
                  src="/logo.png"
                  alt="CallSignGPT logo"
                  className="h-full w-full object-contain opacity-95"
                  draggable={false}
                />
              </div>
              <div className="flex flex-col leading-tight">
                <span className="text-[10px] uppercase tracking-[0.45em] text-[color:var(--ui-text-subtle)]">
                  {displayName}
                </span>
                <span className="text-lg font-semibold text-[color:var(--ui-text)] sm:text-xl">
                  Pilot conversations with precision.
                </span>
                <span className="text-xs text-zinc-400 sm:text-sm">
                  Model-aware routing, synced history, and audit-ready controls for every team.
                </span>
              </div>
              {showStatusBadge && (
                <span className="ml-auto hidden rounded-full border border-[color:var(--ui-border)] bg-[color:var(--ui-surface-alt)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.25em] text-[color:var(--ui-text-muted)] sm:inline-flex">
                  Live
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {badgeCopy.map((badge) => (
                <span
                  key={badge}
                  className="inline-flex items-center gap-2 rounded-full border border-[color:var(--ui-border)] bg-[color:var(--ui-surface-alt)] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-300"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--ui-accent)]" />
                  {badge}
                </span>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 sm:gap-3">
            {showLogo && (
              <div className="grid h-9 w-9 place-items-center rounded-xl border border-[color:var(--ui-border)] bg-[color:var(--ui-surface-alt)] p-2">
                <img
                  src="/logo.png"
                  alt="CallSignGPT logo"
                  className="h-full w-full object-contain opacity-95"
                  draggable={false}
                />
              </div>
            )}
            <div className="flex flex-col leading-tight">
              <span className="text-[9px] uppercase tracking-[0.4em] text-zinc-500">{displayName}</span>
              <span className="text-sm font-semibold text-[color:var(--ui-text)]">{description}</span>
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
