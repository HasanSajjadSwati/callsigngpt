'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { getApiBase } from '@/lib/apiBase';
import { HttpClient } from '@/lib/httpClient';
import { APP_CONFIG } from '@/config/uiText';
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
        'group flex items-center gap-1.5 rounded-lg px-2.5 h-10 transition',
        active
          ? 'bg-[color:var(--ui-surface-alt)] border border-[color:var(--ui-border-strong)]'
          : 'border border-transparent hover:border-[color:var(--ui-border)] hover:bg-white/5',
      ].join(' ')}
    >
      <div
        className={[
          'flex h-7 w-7 items-center justify-center rounded-lg border border-[color:var(--ui-border)]',
          active
            ? 'bg-[color:var(--ui-surface)] text-[color:var(--ui-text)]'
            : 'bg-transparent text-[color:var(--ui-text-muted)] group-hover:text-[color:var(--ui-text)]',
        ].join(' ')}
      >
        <img
          src="/icons8-chat-96.svg"
          alt=""
          aria-hidden="true"
          className="h-3.5 w-3.5"
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
          className="flex-1 rounded-lg border border-[color:var(--ui-border)] bg-[color:var(--ui-input)] px-2.5 py-1 text-sm text-[color:var(--ui-text)] focus:outline-none focus:ring-2 focus:ring-[color:var(--ui-accent)]"
          onClick={(e: React.MouseEvent<HTMLInputElement>) => e.stopPropagation()}
        />
      ) : (
        <button
          onClick={onClick}
          className="flex-1 text-left truncate text-[15px]"
          title={title}
        >
          <span className={active ? 'text-[color:var(--ui-text)] font-medium' : 'text-zinc-200'}>
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
            className="rounded-lg p-1 hover:bg-white/10 text-zinc-300 hover:text-white"
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
            className="history-delete-button rounded-lg p-1 hover:bg-white/10 text-zinc-300 hover:text-red-200"
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
  onClearAll: _onClearAll,
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
  const metadataName =
    typeof session?.user?.user_metadata?.name === 'string' ? session.user.user_metadata.name : '';
  const name = metadataName || session?.user?.name || email.split('@')[0] || 'User';
  const initial = (name || 'U').slice(0, 1).toUpperCase();

  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [plan, setPlan] = useState<string | null>(null);

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const apiBase = getApiBase();
  const isExternalApi = Boolean(apiBase);
  const authHeaders = useMemo(
    () => (accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    [accessToken],
  );
  const authedClient = useMemo(
    () =>
      accessToken
        ? new HttpClient({
            baseUrl: apiBase || APP_CONFIG.api.baseUrl,
            headers: { Authorization: `Bearer ${accessToken}` },
          })
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
      } catch {
        if (!cancelled) setPlan(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [accessToken, authedClient, isExternalApi, authHeaders]);

  useEffect(() => {
    let cancelled = false;

    (async function load() {
      setLoading(true);
      const isAuthError = (err: any) => {
        const msg = (err?.message || '').toString().toLowerCase();
        return msg.includes('401') || msg.includes('unauthorized');
      };
      const loadFromLocalApi = async (): Promise<Item[]> => {
        const res = await fetch('/api/conversations', {
          cache: 'no-store',
          credentials: 'include',
          headers: { ...authHeaders } as HeadersInit,
        });
        const data = res.ok ? await res.json() : { conversations: [] };
        return (data.conversations ?? []) as Item[];
      };

      try {
        const localList = await loadFromLocalApi();
        if (!cancelled && Array.isArray(localList) && localList.length > 0) {
          setItems(localList);
          return;
        }

        if (authedClient) {
          try {
            const data = await authedClient.get<{ conversations?: Item[] } | Item[]>('/conversations');
            const list = (data as any)?.conversations ?? data;
            if (!cancelled && Array.isArray(list) && list.length > 0) {
              setItems(list);
              return;
            }
          } catch (err) {
            if (!isAuthError(err)) {
              console.error('[Sidebar] failed to load conversations (external)', err);
            }
          }
        }

        if (!cancelled) setItems(localList);
      } catch (err) {
        if (!cancelled) {
          console.error('[Sidebar] failed to load conversations', err);
          try {
            const fallback = await loadFromLocalApi();
            setItems(fallback);
          } catch {
            setItems([]);
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [reloadKey, authedClient, apiBase, isExternalApi, authHeaders]);

  useEffect(() => {
    if (reloadKey && reloadKey > 0 && !loading) {
      const timeoutId = setTimeout(() => {
        const refresh = async () => {
          try {
            if (authedClient) {
              const data = await authedClient.get<{ conversations?: Item[] } | Item[]>('/conversations');
              const list = (data as any)?.conversations ?? data;
              if (Array.isArray(list) && list.length > 0) {
                setItems(list);
                return;
              }
            }
          } catch (err) {
            const msg = (err as any)?.message?.toString().toLowerCase() || '';
            if (!msg.includes('401') && !msg.includes('unauthorized')) {
              console.error('[Sidebar] background refresh (external) failed', err);
            }
          }

          fetch('/api/conversations', {
            cache: 'no-store',
            credentials: 'include',
            headers: { ...authHeaders } as HeadersInit,
          })
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
            .catch(() => {
              console.error('[Sidebar] background refresh failed');
            });
        };

        void refresh();
      }, 100);

      return () => clearTimeout(timeoutId);
    }
  }, [reloadKey, loading, authedClient, authHeaders]);

  const formattedPlan = (plan ?? 'free').charAt(0).toUpperCase() + (plan ?? 'free').slice(1);

  return (
    <>
      <aside className="w-full min-w-0 shrink-0 h-full flex flex-col glass-panel rounded-2xl px-3 py-3">
      <div className="mb-2 flex justify-end xl:hidden">
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[color:var(--ui-border)] bg-transparent text-[color:var(--ui-text)] transition hover:bg-white/5"
            aria-label="Close sidebar"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        )}
      </div>
      <div className="px-1 pb-3">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl border border-[color:var(--ui-border)] bg-[color:var(--ui-surface-alt)]">
            <img
              src="/callsign-logo.svg"
              alt="CallSignGPT"
              className="h-6 w-6 opacity-95"
              draggable={false}
            />
          </div>
          <div>
          <p className="text-xs uppercase tracking-[0.35em] text-zinc-500">Workspace</p>
          <p className="text-lg font-semibold text-[color:var(--ui-text)]">CallSignGPT</p>
        </div>
      </div>

      <button
        onClick={onNewChat}
        className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl accent-button px-3 py-2.5 text-sm font-medium"
      >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M12 5v14M5 12h14" />
          </svg>
          Start new chat
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto scroll-area px-1 pb-3">
        <div className="px-2 pb-1.5">
          <span className="text-[11px] uppercase tracking-[0.4em] text-zinc-500/80 select-none">
            Recents
          </span>
        </div>

        {loading && <div className="text-xs text-zinc-400 px-2.5 py-1.5">Loading...</div>}

        {!loading && (
          <div className="space-y-2 stagger-fade">
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
                  const _removedItem = c;
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
                      try {
                        if (authedClient) {
                          const data = await authedClient.get<{ conversations?: Item[] } | Item[]>('/conversations');
                          const list = (data as any)?.conversations ?? data;
                          if (Array.isArray(list) && list.length > 0) {
                            setItems(list);
                            return;
                          }
                        }
                      } catch {
                        // fall through to local
                      }
                      const res = await fetch('/api/conversations', {
                        cache: 'no-store',
                        credentials: 'include',
                        headers: { ...authHeaders } as HeadersInit,
                      });
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
                  } catch {
                    setItems((prev) =>
                      prev.map((item) => (item.id === c.id ? { ...item, title: oldTitle } : item))
                    );
                  }
                }}
                onCancelEdit={() => setEditingId(null)}
              />
            ))}
            {items.length === 0 && (
              <div className="text-xs text-zinc-500 px-2.5 py-3">
                You have no chats yet. Start a conversation above.
              </div>
            )}
          </div>
        )}
      </div>

      <div className="mt-auto px-1 pt-3 border-t border-[color:var(--ui-border)]">
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className="w-full rounded-xl border border-[color:var(--ui-border)] bg-[color:var(--ui-surface)] px-2.5 py-2 flex items-center gap-2.5 hover:bg-white/5 transition"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            title={email}
          >
            <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[color:var(--ui-surface-alt)] text-[color:var(--ui-text)] font-semibold">
              {initial}
            </span>
            <div className="flex-1 min-w-0 text-left">
              <div className="text-sm font-medium text-[color:var(--ui-text)] truncate">{name}</div>
              <div className="text-[11px] uppercase tracking-[0.3em] text-[color:var(--ui-text-subtle)]">
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
              className="glass-panel gradient-border-dropdown absolute left-0 right-0 bottom-full mb-2 z-40 rounded-xl scroll-area max-h-60 overflow-y-auto p-1.5"
            >
              <button
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  router.push('/account');
                }}
                className="block w-full text-left rounded-lg px-2.5 py-1.5 text-sm text-[color:var(--ui-text)] transition hover:bg-white/10"
              >
                Account settings
              </button>
              <button
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  setReportOpen(true);
                }}
                className="block w-full text-left rounded-lg px-2.5 py-1.5 text-sm text-[color:var(--ui-text)] transition hover:bg-white/10"
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
                className="block w-full text-left rounded-lg px-2.5 py-1.5 text-sm text-red-300 transition hover:bg-red-500/10"
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
