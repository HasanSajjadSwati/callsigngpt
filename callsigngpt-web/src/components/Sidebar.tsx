'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { getApiBase } from '@/lib/apiBase';
import { HttpClient } from '@/lib/httpClient';
import { APP_CONFIG } from '@/config/uiText';
import ReportProblemDialog from './ReportProblemDialog';
import ConfirmDialog from './ConfirmDialog';

type Item = { id: string; title: string; folderId?: string | null; updatedAt?: number };
type Folder = { id: string; name: string; sortOrder?: number | null };

function toUpdatedAt(raw: any): number {
  const val = raw?.updatedAt ?? raw?.updated_at ?? raw?.updatedAt ?? raw?.updated_at;
  if (typeof val === 'number' && Number.isFinite(val)) return val;
  if (typeof val === 'string') {
    const parsed = Date.parse(val);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return 0;
}

function normalizeItems(payload: any): Item[] {
  const list = Array.isArray(payload) ? payload : payload?.conversations ?? [];
  if (!Array.isArray(list)) return [];
  return list
    .map((item: any) => ({
      id: item?.id,
      title: item?.title ?? '',
      folderId: item?.folder_id ?? item?.folderId ?? null,
      updatedAt: toUpdatedAt(item),
    }))
    .filter((item: Item) => Boolean(item.id));
}

function normalizeFolders(payload: any): Folder[] {
  const list = Array.isArray(payload) ? payload : payload?.folders ?? [];
  if (!Array.isArray(list)) return [];
  return list
    .map((folder: any) => ({
      id: folder?.id,
      name: folder?.name ?? '',
      sortOrder: folder?.sort_order ?? folder?.sortOrder ?? 0,
    }))
    .filter((folder: Folder) => Boolean(folder.id));
}

function sortFolders(list: Folder[]): Folder[] {
  return [...list].sort((a, b) => {
    const orderDiff = (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
    if (orderDiff !== 0) return orderDiff;
    return a.name.localeCompare(b.name);
  });
}

function sortItems(list: Item[]): Item[] {
  return [...list].sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
}

function HistoryItem({
  title,
  active,
  isEditing,
  folderId,
  folders = [],
  onClick,
  onRename,
  onDelete,
  onMoveFolder,
  onSaveEdit,
  onCancelEdit,
}: {
  title: string;
  active?: boolean;
  isEditing?: boolean;
  folderId?: string | null;
  folders?: Folder[];
  onClick: () => void;
  onRename: () => void;
  onDelete: () => void;
  onMoveFolder?: (folderId: string | null) => void;
  onSaveEdit: (newTitle: string) => void;
  onCancelEdit: () => void;
}) {
  const [editValue, setEditValue] = useState(title);
  const inputRef = useRef<HTMLInputElement>(null);
  const [moveOpen, setMoveOpen] = useState(false);
  const moveButtonRef = useRef<HTMLButtonElement>(null);
  const moveMenuRef = useRef<HTMLDivElement>(null);
  const [moveMenuStyle, setMoveMenuStyle] = useState<{ top: number; left: number; width: number } | null>(null);

  useEffect(() => {
    setEditValue(title);
  }, [title]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  useEffect(() => {
    if (!moveOpen) return;

    const handlePointer = (event: MouseEvent) => {
      if (
        moveButtonRef.current?.contains(event.target as Node) ||
        moveMenuRef.current?.contains(event.target as Node)
      ) {
        return;
      }
      setMoveOpen(false);
    };

    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMoveOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointer);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handlePointer);
      document.removeEventListener('keydown', handleKey);
    };
  }, [moveOpen]);

  useEffect(() => {
    if (!moveOpen) {
      setMoveMenuStyle(null);
      return;
    }

    const updateMenuPosition = () => {
      if (!moveButtonRef.current) return;
      const rect = moveButtonRef.current.getBoundingClientRect();
      const viewportPadding = 12;
      const maxWidth = Math.max(0, window.innerWidth - viewportPadding * 2);
      const minWidth = 220;
      const widthBase = 240;
      const clampedMin = Math.min(minWidth, maxWidth);
      const width = Math.max(clampedMin, Math.min(widthBase, maxWidth));
      let left = rect.right - width;

      if (left + width > window.innerWidth - viewportPadding) {
        left = window.innerWidth - viewportPadding - width;
      }
      if (left < viewportPadding) {
        left = viewportPadding;
      }

      const top = rect.bottom + 8;
      setMoveMenuStyle({ top, left, width });
    };

    updateMenuPosition();
    window.addEventListener('resize', updateMenuPosition);
    window.addEventListener('scroll', updateMenuPosition, true);
    return () => {
      window.removeEventListener('resize', updateMenuPosition);
      window.removeEventListener('scroll', updateMenuPosition, true);
    };
  }, [moveOpen]);

  useEffect(() => {
    if (isEditing) setMoveOpen(false);
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

  const moveMenu =
    moveOpen && moveMenuStyle ? (
      <div
        ref={moveMenuRef}
        role="listbox"
        style={moveMenuStyle}
        className="fixed z-50 overflow-hidden rounded-2xl border border-[color:var(--ui-border)] bg-[color:var(--ui-surface)] shadow-[var(--ui-shadow)]"
      >
        <div className="px-3 pt-3 pb-2 text-[10px] uppercase tracking-[0.35em] text-[color:var(--ui-text-subtle)]">
          Folders
        </div>
        <ul className="max-h-72 overflow-auto px-2 pb-2">
          {[
            { id: null, name: 'Unfiled' },
            ...folders.map((folder) => ({ id: folder.id, name: folder.name || 'Untitled folder' })),
          ].map((option) => {
            const isSelected = (folderId ?? null) === option.id;
            return (
              <li key={option.id ?? 'unfiled'}>
                <button
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => {
                    onMoveFolder?.(option.id);
                    setMoveOpen(false);
                  }}
                  className={[
                    'group flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ui-accent)]',
                    isSelected
                      ? 'bg-[color:var(--ui-surface-alt)] text-[color:var(--ui-text)]'
                      : 'text-[color:var(--ui-text)] hover:bg-white/5',
                  ].join(' ')}
                >
                  <span className="truncate text-sm font-medium">{option.name}</span>
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
      </div>
    ) : null;

  return (
    <>
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
            {(onMoveFolder && (folders.length > 0 || folderId)) && (
              <div className="relative">
                <button
                  ref={moveButtonRef}
                  onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                    e.stopPropagation();
                    e.preventDefault();
                    setMoveOpen((v) => !v);
                  }}
                  aria-haspopup="listbox"
                  aria-expanded={moveOpen}
                  className="rounded-lg p-1 hover:bg-white/10 text-zinc-300 hover:text-white"
                  title="Move to folder"
                >
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6">
                    <path d="M3 7h6l2 2h10v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />
                  </svg>
                </button>
              </div>
            )}
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
      {moveMenu && typeof document !== 'undefined' ? createPortal(moveMenu, document.body) : null}
    </>
  );
}

function FolderItem({
  name,
  count,
  isCollapsed,
  isEditing,
  onToggle,
  onRename,
  onDelete,
  onSaveEdit,
  onCancelEdit,
}: {
  name: string;
  count: number;
  isCollapsed: boolean;
  isEditing?: boolean;
  onToggle: () => void;
  onRename: () => void;
  onDelete: () => void;
  onSaveEdit: (newName: string) => void;
  onCancelEdit: () => void;
}) {
  const [editValue, setEditValue] = useState(name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setEditValue(name);
  }, [name]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleSave = () => {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== name) {
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
      setEditValue(name);
      onCancelEdit();
    }
  };

  return (
    <div
      className={[
        'group flex items-center gap-1.5 rounded-lg px-2.5 h-9 transition border border-transparent',
        'hover:border-[color:var(--ui-border)] hover:bg-white/5',
      ].join(' ')}
    >
      <button
        type="button"
        onClick={onToggle}
        className="flex h-7 w-7 items-center justify-center rounded-lg border border-[color:var(--ui-border)] bg-transparent text-[color:var(--ui-text-muted)] group-hover:text-[color:var(--ui-text)]"
        aria-label={isCollapsed ? 'Expand folder' : 'Collapse folder'}
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6">
          <path d="M3 7h6l2 2h10v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />
        </svg>
      </button>

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
        <button onClick={onToggle} className="flex-1 text-left truncate text-[14px]" title={name}>
          <span className="text-[color:var(--ui-text)] font-medium">
            {name || 'Untitled folder'}
          </span>
        </button>
      )}

      <div className="flex items-center gap-1.5 text-[11px] text-zinc-500">
        <span>{count}</span>
        <svg
          viewBox="0 0 24 24"
          className={[
            'h-3 w-3 text-zinc-500 transition-transform',
            isCollapsed ? '-rotate-90' : 'rotate-0',
          ].join(' ')}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </div>

      {!isEditing && (
        <div className="flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition">
          <button
            onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
              e.stopPropagation();
              e.preventDefault();
              onRename();
            }}
            className="rounded-lg p-1 hover:bg-white/10 text-zinc-300 hover:text-white"
            title="Rename folder"
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
            className="rounded-lg p-1 hover:bg-white/10 text-zinc-300 hover:text-red-200"
            title="Delete folder"
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
  onNewChatInFolder,
  onSelect,
  onRename,
  onDelete,
  onMoveFolder,
  onClearAll: _onClearAll,
  onClose,
}: {
  currentId: string | null;
  reloadKey?: number;
  onNewChat: () => void;
  onNewChatInFolder: (folderId: string) => void;
  onSelect: (id: string) => void;
  onRename: (id: string, newTitle: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onMoveFolder: (id: string, folderId: string | null) => Promise<void>;
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
  const [folders, setFolders] = useState<Folder[]>([]);
  const [foldersLoading, setFoldersLoading] = useState(false);
  const [folderError, setFolderError] = useState<string | null>(null);
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set());
  const [folderDeleteConfirm, setFolderDeleteConfirm] = useState<{
    isOpen: boolean;
    folderId: string | null;
    folderName: string;
  }>({ isOpen: false, folderId: null, folderName: '' });
  const newFolderInputRef = useRef<HTMLInputElement>(null);

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
    if (creatingFolder && newFolderInputRef.current) {
      newFolderInputRef.current.focus();
      newFolderInputRef.current.select();
    }
  }, [creatingFolder]);

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
    if (!session) {
      setFolders([]);
      setFolderError(null);
      return;
    }

    (async () => {
      setFoldersLoading(true);
      setFolderError(null);
      try {
        const res = await fetch('/api/conversation-folders', {
          cache: 'no-store',
          credentials: 'include',
          headers: { ...authHeaders } as HeadersInit,
        });
        if (!res.ok) {
          if (!cancelled) {
            setFolders([]);
            if (res.status !== 401) {
              setFolderError('Failed to load folders.');
            }
          }
          return;
        }
        const data = await res.json();
        if (!cancelled) {
          setFolders(normalizeFolders(data));
        }
      } catch (err) {
        if (!cancelled) {
          console.error('[Sidebar] failed to load folders', err);
          setFolders([]);
          setFolderError('Failed to load folders.');
        }
      } finally {
        if (!cancelled) setFoldersLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [session, authHeaders, reloadKey]);

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
        return normalizeItems(data);
      };

      try {
        const localList = await loadFromLocalApi();
        if (!cancelled && localList.length > 0) {
          setItems(localList);
          return;
        }

        if (authedClient) {
          try {
            const data = await authedClient.get<{ conversations?: Item[] } | Item[]>('/conversations');
            const list = normalizeItems(data);
            if (!cancelled && list.length > 0) {
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
              const list = normalizeItems(data);
              if (list.length > 0) {
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
                const serverItems = normalizeItems(data);
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

  const toggleFolderCollapse = (id: string) => {
    setCollapsedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleCreateFolder = async () => {
    const name = newFolderName.trim();
    setCreatingFolder(false);
    setNewFolderName('');
    if (!name) return;

    setFolderError(null);
    try {
      const res = await fetch('/api/conversation-folders', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...authHeaders } as HeadersInit,
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setFolderError(err?.error || 'Failed to create folder.');
        return;
      }
      const data = await res.json();
      const [folder] = normalizeFolders(data?.folder ? [data.folder] : data);
      if (folder) setFolders((prev) => [...prev, folder]);
    } catch (err) {
      setFolderError('Failed to create folder.');
    }
  };

  const handleRenameFolder = async (id: string, nextName: string) => {
    const prevName = folders.find((f) => f.id === id)?.name ?? '';
    setFolders((prev) => prev.map((f) => (f.id === id ? { ...f, name: nextName } : f)));
    setEditingFolderId(null);
    setFolderError(null);
    try {
      const res = await fetch(`/api/conversation-folders/${id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...authHeaders } as HeadersInit,
        body: JSON.stringify({ name: nextName }),
      });
      if (!res.ok) {
        throw new Error('Failed to rename folder');
      }
    } catch (err) {
      setFolders((prev) => prev.map((f) => (f.id === id ? { ...f, name: prevName } : f)));
      setFolderError('Failed to rename folder.');
    }
  };

  const handleMoveConversation = async (id: string, folderId: string | null) => {
    const prevItems = items;
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, folderId } : item)));
    setFolderError(null);
    try {
      await onMoveFolder(id, folderId);
    } catch (err) {
      setItems(prevItems);
      setFolderError('Failed to move chat.');
    }
  };

  const confirmDeleteFolder = async () => {
    if (!folderDeleteConfirm.folderId) {
      setFolderDeleteConfirm({ isOpen: false, folderId: null, folderName: '' });
      return;
    }
    const folderId = folderDeleteConfirm.folderId;
    const prevFolders = folders;
    const prevItems = items;
    setFolderDeleteConfirm({ isOpen: false, folderId: null, folderName: '' });
    setFolders((prev) => prev.filter((f) => f.id !== folderId));
    setItems((prev) =>
      prev.map((item) => (item.folderId === folderId ? { ...item, folderId: null } : item)),
    );
    setCollapsedFolders((prev) => {
      const next = new Set(prev);
      next.delete(folderId);
      return next;
    });

    setFolderError(null);
    try {
      const res = await fetch(`/api/conversation-folders/${folderId}`, {
        method: 'DELETE',
        credentials: 'include',
        headers: { ...authHeaders } as HeadersInit,
      });
      if (!res.ok) {
        throw new Error('Failed to delete folder');
      }
    } catch (err) {
      setFolders(prevFolders);
      setItems(prevItems);
      setFolderError('Failed to delete folder.');
    }
  };

  const sortedFolders = useMemo(() => sortFolders(folders), [folders]);
  const groupedItems = useMemo(() => {
    const folderIds = new Set(sortedFolders.map((folder) => folder.id));
    const byFolder = new Map<string, Item[]>();
    const unfiled: Item[] = [];

    for (const item of items) {
      const folderId = item.folderId ?? null;
      if (folderId && folderIds.has(folderId)) {
        const list = byFolder.get(folderId) ?? [];
        list.push(item);
        byFolder.set(folderId, list);
      } else {
        unfiled.push(item);
      }
    }

    for (const folder of sortedFolders) {
      const list = byFolder.get(folder.id) ?? [];
      byFolder.set(folder.id, sortItems(list));
    }

    return {
      unfiled: sortItems(unfiled),
      byFolder,
    };
  }, [items, sortedFolders]);

  const formattedPlan = (plan ?? 'free').charAt(0).toUpperCase() + (plan ?? 'free').slice(1);

  return (
    <>
      <aside className="w-full min-w-0 shrink-0 h-full flex flex-col glass-panel panel-flush-right panel-edge px-3 py-3">
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
        <div className="rounded-2xl border border-[color:var(--ui-border)] bg-[color:var(--ui-surface-alt)] p-3 shadow-[var(--ui-shadow-soft)]">
          <div className="flex items-center gap-3">
            <div className="grid h-12 w-12 place-items-center rounded-2xl border border-[color:var(--ui-border)] bg-[color:var(--ui-surface)] p-2 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.03)]">
              <img
                src="/logo.png"
                alt="CallSignGPT"
                className="h-full w-full object-contain opacity-95"
                draggable={false}
              />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-[0.45em] text-[color:var(--ui-text-subtle)]">
                Workspace
              </p>
              <p className="text-lg font-semibold text-[color:var(--ui-text)] truncate">CallSignGPT</p>
            </div>
          </div>

          <button
            onClick={onNewChat}
            className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-[color:var(--ui-border)] bg-[color:var(--ui-surface)] px-3.5 py-2.5 text-sm font-medium text-[color:var(--ui-text)] transition hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--ui-accent)]"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Start new chat
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto scroll-area px-1 pb-3">
        <div className="px-2 pb-1.5 flex items-center justify-between">
          <span className="text-[11px] uppercase tracking-[0.4em] text-zinc-500/80 select-none">
            Folders
          </span>
          <button
            type="button"
            onClick={() => {
              setFolderError(null);
              setCreatingFolder(true);
              setNewFolderName('');
            }}
            className="rounded-lg border border-[color:var(--ui-border)] px-2 py-1 text-[10px] uppercase tracking-[0.2em] text-zinc-400 hover:text-white transition"
          >
            New
          </button>
        </div>

        {foldersLoading && (
          <div className="text-xs text-zinc-400 px-2.5 py-1.5">Loading folders...</div>
        )}

        {creatingFolder && (
          <div className="px-2.5 pb-2">
            <input
              ref={newFolderInputRef}
              type="text"
              value={newFolderName}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewFolderName(e.target.value)}
              onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void handleCreateFolder();
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  setCreatingFolder(false);
                  setNewFolderName('');
                }
              }}
              onBlur={() => {
                if (creatingFolder) {
                  void handleCreateFolder();
                }
              }}
              placeholder="Folder name"
              className="w-full rounded-lg border border-[color:var(--ui-border)] bg-[color:var(--ui-input)] px-2.5 py-2 text-sm text-[color:var(--ui-text)] focus:outline-none focus:ring-2 focus:ring-[color:var(--ui-accent)]"
            />
          </div>
        )}

        {!foldersLoading && sortedFolders.length === 0 && !creatingFolder && (
          <div className="text-xs text-zinc-500 px-2.5 py-2">No folders yet.</div>
        )}

        {folderError && (
          <div className="text-xs text-rose-300 px-2.5 py-1.5">{folderError}</div>
        )}

        <div className="space-y-2">
          {sortedFolders.map((folder) => {
            const folderItems = groupedItems.byFolder.get(folder.id) ?? [];
            const isCollapsed = collapsedFolders.has(folder.id);
            return (
              <div key={folder.id} className="space-y-1">
                <FolderItem
                  name={folder.name}
                  count={folderItems.length}
                  isCollapsed={isCollapsed}
                  isEditing={editingFolderId === folder.id}
                  onToggle={() => toggleFolderCollapse(folder.id)}
                  onRename={() => setEditingFolderId(folder.id)}
                  onDelete={() =>
                    setFolderDeleteConfirm({
                      isOpen: true,
                      folderId: folder.id,
                      folderName: folder.name || 'Untitled folder',
                    })
                  }
                  onSaveEdit={(newName) => handleRenameFolder(folder.id, newName)}
                  onCancelEdit={() => setEditingFolderId(null)}
                />
                {!isCollapsed && (
                  <div className="space-y-2 pl-3">
                    <button
                      type="button"
                      onClick={() => onNewChatInFolder(folder.id)}
                      className="group flex w-full items-center gap-2 rounded-lg border border-[color:var(--ui-border)] bg-[color:var(--ui-surface)] px-2.5 py-2 text-sm text-[color:var(--ui-text-muted)] transition hover:bg-white/5 hover:text-[color:var(--ui-text)]"
                    >
                      <span className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-[color:var(--ui-border)] bg-transparent text-[color:var(--ui-text-muted)] group-hover:text-[color:var(--ui-text)]">
                        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M12 5v14M5 12h14" />
                        </svg>
                      </span>
                      <span className="truncate">
                        New chat in {folder.name || 'this folder'}
                      </span>
                    </button>
                    {folderItems.map((c) => (
                      <HistoryItem
                        key={c.id}
                        title={c.title}
                        active={c.id === currentId}
                        isEditing={editingId === c.id}
                        folderId={c.folderId ?? null}
                        folders={sortedFolders}
                        onMoveFolder={(nextFolderId) => handleMoveConversation(c.id, nextFolderId)}
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
                                  const list = normalizeItems(data);
                                  if (list.length > 0) {
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
                              setItems(normalizeItems(data));
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
                    {folderItems.length === 0 && (
                      <div className="text-xs text-zinc-500 px-2.5 py-2">
                        No chats in this folder.
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-4 px-2 pb-1.5">
          <span className="text-[11px] uppercase tracking-[0.4em] text-zinc-500/80 select-none">
            Chats
          </span>
        </div>

        {loading && <div className="text-xs text-zinc-400 px-2.5 py-1.5">Loading...</div>}

        {!loading && (
          <div className="space-y-2 stagger-fade">
            {groupedItems.unfiled.map((c) => (
              <HistoryItem
                key={c.id}
                title={c.title}
                active={c.id === currentId}
                isEditing={editingId === c.id}
                folderId={c.folderId ?? null}
                folders={sortedFolders}
                onMoveFolder={(nextFolderId) => handleMoveConversation(c.id, nextFolderId)}
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
                          const list = normalizeItems(data);
                          if (list.length > 0) {
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
                      setItems(normalizeItems(data));
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
            {items.length > 0 && groupedItems.unfiled.length === 0 && (
              <div className="text-xs text-zinc-500 px-2.5 py-2">
                No unfiled chats.
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
    <ConfirmDialog
      isOpen={folderDeleteConfirm.isOpen}
      title="Delete folder"
      message={`Delete "${folderDeleteConfirm.folderName}"? Chats inside will be moved to Unfiled.`}
      confirmText="Delete folder"
      cancelText="Cancel"
      variant="danger"
      onConfirm={() => void confirmDeleteFolder()}
      onCancel={() =>
        setFolderDeleteConfirm({ isOpen: false, folderId: null, folderName: '' })
      }
    />
    <ReportProblemDialog
      open={reportOpen}
      onClose={() => setReportOpen(false)}
      email={email}
      name={name}
    />
    </>
  );
}
