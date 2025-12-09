'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { getApiBase } from '@/lib/apiBase';
import { HttpClient } from '@/lib/httpClient';
import ReportProblemDialog from './ReportProblemDialog';

type Item = { id: string; title: string };

function HistoryItem({
  title,
  active,
  isEditing,
  onClick,
  onRename,
  onDelete,
  onSaveEdit,
  onCancelEdit,
}: {
  title: string;
  active?: boolean;
  isEditing?: boolean;
  onClick: () => void;
  onRename: () => void;
  onDelete: () => void;
  onSaveEdit: (newTitle: string) => void;
  onCancelEdit: () => void;
}) {
  const [editValue, setEditValue] = useState(title);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setEditValue(title);
  }, [title]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleSave = () => {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== title) {
      onSaveEdit(trimmed);
    } else {
      onCancelEdit();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSave();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setEditValue(title);
      onCancelEdit();
    }
  };

  return (
    <div
      className={[
        'group flex items-center gap-2 rounded-2xl px-3 h-12 transition-all',
        active
          ? 'bg-white/10 border border-white/20 shadow-[0_10px_30px_rgba(15,23,42,.35)]'
          : 'border border-transparent hover:border-white/10 hover:bg-white/5',
      ].join(' ')}
    >
      <div
        className={[
          'flex h-8 w-8 items-center justify-center rounded-xl border border-white/10',
          active ? 'bg-white/20 text-white' : 'bg-white/5 text-zinc-400 group-hover:text-white',
        ].join(' ')}
      >
        <img
          src="/icons8-chat-96.svg"
          alt=""
          aria-hidden="true"
          className="h-4 w-4"
          style={{ filter: 'invert(1)' }}
        />
      </div>

      {isEditing ? (
        <input
          ref={inputRef}
          type="text"
          value={editValue}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleSave}
          className="flex-1 bg-white/10 border border-white/20 rounded-xl px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-300/50"
          onClick={(e: React.MouseEvent<HTMLInputElement>) => e.stopPropagation()}
        />
      ) : (
        <button
          onClick={onClick}
          className="flex-1 text-left truncate text-[15px]"
          title={title}
        >
          <span className={active ? 'text-white font-medium' : 'text-zinc-200'}>
            {title || 'Untitled chat'}
          </span>
        </button>
      )}

      {!isEditing && (
        <div className="flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition">
          <button
            onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
              e.stopPropagation();
              e.preventDefault();
              onRename();
            }}
            className="rounded-xl p-1.5 hover:bg-white/10 text-zinc-300 hover:text-white"
            title="Rename"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 20h4l10-10-4-4L4 16v4z" />
            </svg>
          </button>
          <button
            onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
              e.stopPropagation();
              e.preventDefault();
              onDelete();
            }}
            className="history-delete-button rounded-xl p-1.5 hover:bg-white/10 text-zinc-300 hover:text-red-200"
            title="Delete"
          >
            <img
              src="/icons8-remove-96.svg"
              alt=""
              aria-hidden="true"
              className="h-4 w-4"
            />
          </button>
        </div>
      )}
    </div>
  );
}

export default function Sidebar({
  currentId,
  reloadKey,
  onNewChat,
  onSelect,
  onRename,
  onDelete,
  onClearAll,
  onClose,
}: {
  currentId: string | null;
  reloadKey?: number;
  onNewChat: () => void;
  onSelect: (id: string) => void;
  onRename: (id: string, newTitle: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onClearAll: () => void;
  onClose?: () => void;
}) {
  const router = useRouter();
  const { session, signOut, accessToken } = useAuth();

  const email = session?.user?.email ?? '';
  const name = session?.user?.name ?? email.split('@')[0] ?? 'User';
  const initial = (name || 'U').slice(0, 1).toUpperCase();

  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [plan, setPlan] = useState<string | null>(null);

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const apiBase = getApiBase();
  const authedClient = useMemo(
    () =>
      accessToken
        ? new HttpClient({ baseUrl: apiBase, headers: { Authorization: `Bearer ${accessToken}` } })
        : null,
    [accessToken, apiBase],
  );

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    if (menuOpen) document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [menuOpen]);

  useEffect(() => {
    let cancelled = false;
    if (!accessToken) {
      setPlan(null);
      return;
    }

    (async () => {
      try {
        if (!authedClient) return;
        const data = await authedClient.get<{ tier?: string; plan?: string }>('/auth/me');
        if (!cancelled) {
          setPlan((data?.tier ?? data?.plan ?? 'free') as string);
        }
      } catch (err) {
        if (!cancelled) setPlan(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [accessToken, authedClient]);

  useEffect(() => {
    let cancelled = false;

    (async function load() {
      setLoading(true);
      try {
        const res = await fetch('/api/conversations', { cache: 'no-store' });
        const data = res.ok ? await res.json() : { conversations: [] };
        if (!cancelled) setItems(data.conversations ?? []);
      } catch (err) {
        if (!cancelled) {
          console.error('[Sidebar] failed to load conversations:', err);
          setItems([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  useEffect(() => {
    if (reloadKey && reloadKey > 0 && !loading) {
      const timeoutId = setTimeout(() => {
        fetch('/api/conversations', { cache: 'no-store' })
          .then((res) => (res.ok ? res.json() : { conversations: [] }))
          .then((data) => {
            setItems((prev) => {
              const serverItems = data.conversations ?? [];
              if (serverItems.length > 0) {
                return serverItems;
              }
              return prev;
            });
          })
          .catch((err) => {
            console.error('[Sidebar] background refresh failed:', err);
          });
      }, 100);

      return () => clearTimeout(timeoutId);
    }
  }, [reloadKey, loading]);

  const formattedPlan = (plan ?? 'free').charAt(0).toUpperCase() + (plan ?? 'free').slice(1);

  return (
    <>
      <aside className="w-full min-w-0 shrink-0 h-full flex flex-col glass-panel rounded-[32px] border border-white/10 px-4 py-5 xl:basis-[26%] xl:max-w-sm">
      <div className="mb-2 flex justify-end xl:hidden">
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-white/15 bg-white/5 text-white transition hover:border-white/30 hover:bg-white/10"
            aria-label="Close sidebar"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        )}
      </div>
      <div className="px-1 pb-4">
        <div className="flex items-center gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-2xl accent-pill border border-white/20">
            <img
              src="/callsign-logo.svg"
              alt="CallSignGPT"
              className="h-7 w-7 opacity-95"
              draggable={false}
            />
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-zinc-500">Workspace</p>
            <p className="text-lg font-semibold text-white">CallSignGPT</p>
          </div>
        </div>

        <button
          onClick={onNewChat}
          className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl accent-button px-4 py-3 text-sm font-semibold"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M12 5v14M5 12h14" />
          </svg>
          Start new chat
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto scroll-area px-1 pb-4">
        <div className="px-2 pb-2">
          <span className="text-[11px] uppercase tracking-[0.4em] text-zinc-500/80 select-none">
            Recents
          </span>
        </div>

        {loading && <div className="text-xs text-zinc-400 px-3 py-2">Loading…</div>}

        {!loading && (
          <div className="space-y-2">
            {items.map((c) => (
              <HistoryItem
                key={c.id}
                title={c.title}
                active={c.id === currentId}
                isEditing={editingId === c.id}
                onClick={() => {
                  if (editingId !== c.id) {
                    onSelect(c.id);
                  }
                }}
                onRename={() => setEditingId(c.id)}
                onDelete={async () => {
                  const removedItem = c;
                  let previousItems: Item[] = [];
                  setItems((prev) => {
                    previousItems = prev;
                    return prev.filter((item) => item.id !== c.id);
                  });
                  try {
                    await onDelete(c.id);
                  } catch (error) {
                    if (error instanceof Error && (error.message === 'Deletion cancelled' || error.message.includes('cancelled'))) {
                      setItems(previousItems);
                    } else {
                      const res = await fetch('/api/conversations', { cache: 'no-store' });
                      const data = res.ok ? await res.json() : { conversations: [] };
                      setItems(data.conversations ?? []);
                    }
                  }
                }}
                onSaveEdit={async (newTitle) => {
                  const oldTitle = c.title;
                  setItems((prev) =>
                    prev.map((item) => (item.id === c.id ? { ...item, title: newTitle } : item))
                  );
                  setEditingId(null);
                  try {
                    await onRename(c.id, newTitle);
                  } catch (error) {
                    setItems((prev) =>
                      prev.map((item) => (item.id === c.id ? { ...item, title: oldTitle } : item))
                    );
                  }
                }}
                onCancelEdit={() => setEditingId(null)}
              />
            ))}
            {items.length === 0 && (
              <div className="text-xs text-zinc-500 px-3 py-4">
                You have no chats yet. Start a conversation above.
              </div>
            )}
          </div>
        )}
      </div>

      <div className="mt-auto px-1 pt-4 border-t border-white/5">
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className="w-full rounded-2xl border border-white/10 bg-white/5 px-3 py-3 flex items-center gap-3 hover:border-white/30 transition"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            title={email}
          >
            <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white/15 text-white font-semibold">
              {initial}
            </span>
            <div className="flex-1 min-w-0 text-left">
              <div className="text-sm font-semibold text-white truncate">{name}</div>
              <div className="text-xs text-zinc-400 truncate">{email}</div>
              <div className="text-[11px] uppercase tracking-[0.3em] text-emerald-300/80">
                {formattedPlan}
              </div>
            </div>
            <svg
              viewBox="0 0 24 24"
              className="h-4 w-4 text-zinc-400"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>

          {menuOpen && (
            <div
              role="menu"
              className="glass-panel gradient-border-dropdown absolute left-0 right-0 bottom-full mb-2 z-40 rounded-2xl border border-white/10 shadow-[0_25px_80px_rgba(2,6,23,.7)] backdrop-blur-2xl scroll-area max-h-60 overflow-y-auto p-2"
            >
              <button
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  router.push('/account');
                }}
                className="block w-full text-left rounded-2xl px-3 py-2 text-sm text-zinc-100 transition hover:bg-white/10"
              >
                Account settings
              </button>
              <button
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  setReportOpen(true);
                }}
                className="block w-full text-left rounded-2xl px-3 py-2 text-sm text-zinc-100 transition hover:bg-white/10"
              >
                Report a problem
              </button>
              <button
                role="menuitem"
                onClick={async () => {
                  setMenuOpen(false);
                  await signOut();
                  router.push('/login');
                }}
                className="block w-full text-left rounded-2xl px-3 py-2 text-sm text-red-300 transition hover:bg-red-500/10"
              >
                Logout
              </button>
            </div>
          )}
        </div>
      </div>
    </aside>
    <ReportProblemDialog
      open={reportOpen}
      onClose={() => setReportOpen(false)}
      email={email}
      name={name}
    />
    </>
  );
}
