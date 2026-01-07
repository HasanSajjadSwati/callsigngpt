'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const isInline = variant === 'inline';
  const containerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuStyle, setMenuStyle] = useState<{ top: number; left: number; width: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
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
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [onChange, value]);

  useEffect(() => {
    if (!open) return;

    const handlePointer = (event: MouseEvent) => {
      if (!containerRef.current) return;
      if (
        !containerRef.current.contains(event.target as Node) &&
        !menuRef.current?.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    };

    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointer);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handlePointer);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      setMenuStyle(null);
      return;
    }

    const updateMenuPosition = () => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const viewportPadding = 12;
      const maxWidth = Math.max(0, window.innerWidth - viewportPadding * 2);
      const minWidth = isInline ? 240 : 220;
      const widthBase = isInline ? 320 : rect.width;
      const clampedMin = Math.min(minWidth, maxWidth);
      const width = Math.max(clampedMin, Math.min(widthBase, maxWidth));
      let left = rect.left;

      if (left + width > window.innerWidth - viewportPadding) {
        left = window.innerWidth - viewportPadding - width;
      }
      if (left < viewportPadding) {
        left = viewportPadding;
      }

      const top = rect.bottom + 8;
      setMenuStyle({ top, left, width });
    };

    updateMenuPosition();
    window.addEventListener('resize', updateMenuPosition);
    window.addEventListener('scroll', updateMenuPosition, true);
    return () => {
      window.removeEventListener('resize', updateMenuPosition);
      window.removeEventListener('scroll', updateMenuPosition, true);
    };
  }, [open, isInline]);

  const selected = options.find((opt) => opt.key === value) ?? options[0];
  const buttonLabel = selected?.label ?? (loading ? 'Loading models' : 'Select model');
  const buttonDescription = !isInline ? selected?.description : undefined;

  const menu =
    open && menuStyle ? (
      <div
        ref={menuRef}
        role="listbox"
        style={menuStyle}
        className="fixed z-50 overflow-hidden rounded-2xl border border-[color:var(--ui-border)] bg-[color:var(--ui-surface)] shadow-[var(--ui-shadow)]"
      >
        {options.length > 0 ? (
          <>
            <div className="px-3 pt-3 pb-2 text-[10px] uppercase tracking-[0.35em] text-[color:var(--ui-text-subtle)]">
              Models
            </div>
            <ul className="max-h-80 overflow-auto px-2 pb-2">
              {options.map((opt) => {
                const isSelected = opt.key === value;
                return (
                  <li key={opt.key}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => {
                        onChange(opt.key);
                        setOpen(false);
                      }}
                      className={[
                        'group flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ui-accent)]',
                        isSelected
                          ? 'bg-[color:var(--ui-surface-alt)] text-[color:var(--ui-text)]'
                          : 'text-[color:var(--ui-text)] hover:bg-white/5',
                      ].join(' ')}
                    >
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-sm font-medium">{opt.label}</span>
                        {opt.description && (
                          <span className="truncate text-xs text-[color:var(--ui-text-muted)]">
                            {opt.description}
                          </span>
                        )}
                      </span>
                      <svg
                        viewBox="0 0 24 24"
                        className={[
                          'h-4 w-4 flex-shrink-0 text-[color:var(--ui-text)] transition-opacity',
                          isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-40',
                        ].join(' ')}
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.2"
                      >
                        <path d="M5 13l4 4L19 7" />
                      </svg>
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        ) : (
          <div className="px-4 py-3 text-sm text-[color:var(--ui-text-muted)]">
            {loading ? 'Loading models...' : 'No models available.'}
          </div>
        )}
      </div>
    ) : null;

  return (
    <div
      className={
        isInline
          ? 'flex items-center gap-2 text-[color:var(--ui-text)]'
          : 'flex w-full flex-col gap-1 text-[color:var(--ui-text)]'
      }
    >
      <div className={isInline ? 'flex items-center gap-2' : 'flex flex-wrap items-center gap-2'}>
        {!isInline && (
          <span className="min-w-[60px] text-[10px] uppercase tracking-[0.35em] text-[color:var(--ui-text-subtle)]">
            Model
          </span>
        )}
        <div
          ref={containerRef}
          className={isInline ? 'relative w-auto max-w-full min-w-[160px]' : 'relative flex-1 min-w-[200px]'}
        >
          <button
            type="button"
            aria-haspopup="listbox"
            aria-expanded={open}
            onClick={() => setOpen((prev) => !prev)}
            className={[
              'group inline-flex w-full items-center justify-between gap-3 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ui-accent)]',
              isInline
                ? 'rounded-full border border-transparent bg-transparent px-2.5 py-1.5 text-sm font-semibold text-[color:var(--ui-text)] hover:bg-white/5 sm:text-base'
                : 'rounded-2xl border border-[color:var(--ui-border)] bg-[color:var(--ui-surface)] px-3 py-2 text-sm font-medium text-[color:var(--ui-text)] shadow-[var(--ui-shadow-soft)] hover:bg-[color:var(--ui-surface-alt)]',
              open && !isInline ? 'ring-1 ring-[color:var(--ui-border-strong)]' : '',
            ].join(' ')}
          >
            <span className="flex min-w-0 flex-1 flex-col text-left">
              <span className="truncate">{buttonLabel}</span>
              {buttonDescription && (
                <span className="truncate text-xs text-[color:var(--ui-text-muted)]">{buttonDescription}</span>
              )}
            </span>
            <svg
              viewBox="0 0 24 24"
              className={[
                'h-4 w-4 flex-shrink-0 text-[color:var(--ui-text-muted)] transition-transform',
                open ? 'rotate-180' : '',
              ].join(' ')}
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>
        </div>
      </div>
      {open && typeof document !== 'undefined' && menuStyle ? createPortal(menu, document.body) : null}
    </div>
  );
}
