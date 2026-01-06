'use client';

import { useEffect, useState } from 'react';
import { modelCache } from '@/lib/modelCache';

export type ModelPickerProps = {
  value: string;
  onChange: (v: string) => void;
  variant?: 'default' | 'inline';
};

type ApiModel = {
  modelKey: string;
  displayName?: string | null;
  provider?: string;
  providerModel?: string;
};

type Option = {
  key: string;
  label: string;
  description?: string;
};

export default function ModelPicker({ value, onChange, variant = 'default' }: ModelPickerProps) {
  const [options, setOptions] = useState<Option[]>([]);
  const isInline = variant === 'inline';

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data: ApiModel[] = await modelCache.list();
        if (cancelled) return;
        const nextOptions = (data || []).map((m) => {
          const parts = [m.provider, m.providerModel].filter(Boolean);
          return {
            key: m.modelKey,
            label: m.displayName || m.modelKey,
            description: parts.length ? parts.join(' - ') : undefined,
          };
        });
        setOptions(nextOptions);
        if (nextOptions.length > 0 && !nextOptions.some((o) => o.key === value)) {
          onChange(nextOptions[0].key);
        }
      } catch (err) {
        console.error('Failed to load models', err);
        setOptions([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [onChange, value]);

  return (
    <div
      className={
        isInline
          ? 'flex items-center gap-2 text-[color:var(--ui-text)]'
          : 'flex w-full flex-col gap-1 text-[color:var(--ui-text)]'
      }
    >
      <div className={isInline ? 'flex items-center gap-2' : 'flex flex-wrap items-center gap-1.5 sm:gap-2'}>
        {!isInline && (
          <span className="min-w-[60px] text-[10px] uppercase tracking-[0.35em] text-zinc-500">Model</span>
        )}
        <div className={isInline ? 'relative w-auto max-w-full min-w-[160px]' : 'relative flex-1 min-w-[180px] sm:min-w-[240px]'}>
          <select
            value={value}
            onChange={(event) => onChange(event.target.value)}
            className={
              isInline
                ? 'appearance-none w-full rounded-full border border-transparent bg-transparent px-3 pr-8 py-1.5 text-left text-sm font-medium text-[color:var(--ui-text)] transition hover:bg-white/5 focus:outline-none focus:ring-2 focus:ring-[color:var(--ui-accent)]'
                : 'appearance-none w-full max-w-full rounded-xl border border-[color:var(--ui-border)] bg-[color:var(--ui-input)] px-3 pr-9 py-2 text-left text-sm font-medium text-[color:var(--ui-text)] focus:outline-none focus:ring-2 focus:ring-[color:var(--ui-accent)]'
            }
          >
            {options.map((opt) => (
              <option key={opt.key} value={opt.key} title={opt.description} className="text-[color:var(--ui-text)]">
                {opt.label}
              </option>
            ))}
          </select>
          <svg
            viewBox="0 0 24 24"
            className={
              isInline
                ? 'pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400'
                : 'pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400'
            }
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </div>
      </div>
    </div>
  );
}
