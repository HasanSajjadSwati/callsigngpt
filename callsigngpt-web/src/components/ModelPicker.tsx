'use client';

import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { modelCache } from '@/lib/modelCache';

export type ModelPickerProps = {
  value: string;
  onChange: (v: string) => void;
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

export default function ModelPicker({ value, onChange }: ModelPickerProps) {
  const [options, setOptions] = useState<Option[]>([]);

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

  const ringStyle = useMemo(() => ({ '--tw-ring-color': 'var(--accent-ring)' } as CSSProperties), []);

  return (
    <div className="flex w-full flex-col gap-1 text-white">
      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        <span className="min-w-[60px] text-[10px] uppercase tracking-[0.35em] text-zinc-500">Model</span>
        <div className="relative flex-1 min-w-[180px] sm:min-w-[240px]">
          <select
            value={value}
            onChange={(event) => onChange(event.target.value)}
            className="appearance-none w-full max-w-full rounded-2xl border border-white/15 bg-white/5 px-4 pr-10 py-2.5 text-left text-sm font-medium text-white shadow-[0_8px_30px_rgba(2,6,23,.45)] focus:outline-none focus:ring-2"
            style={ringStyle}
          >
            {options.map((opt) => (
              <option key={opt.key} value={opt.key} title={opt.description} className="text-white">
                {opt.label}
              </option>
            ))}
          </select>
          <svg
            viewBox="0 0 24 24"
            className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white"
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
