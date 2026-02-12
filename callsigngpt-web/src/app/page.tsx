'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { HttpClient } from '@/lib/httpClient';
import { getApiBase } from '@/lib/apiBase';
import { APP_CONFIG } from '@/config/uiText';

import Sidebar from '@/components/Sidebar';
import MessageBubble from '@/components/MessageBubble';
import TypingIndicator from '@/components/TypingIndicator';
import SearchIndicator from '@/components/SearchIndicator';
import Composer from '@/components/Composer';
import ConfirmDialog from '@/components/ConfirmDialog';
import StatusDialog from '@/components/StatusDialog';
import ModelPicker from '@/components/ModelPicker';

import { useConversation } from '@/hooks/useConversation';
import { useStreamingChat } from '@/hooks/useStreamingChat';
import { useModelTheme } from '@/hooks/useModelTheme';
import type { UIMsg } from '@/lib/chat';

const DEFAULT_MODEL_KEY = 'basic:gpt-4o-mini';

/** Ensure no duplicate message IDs before rendering (generate stable fallbacks if missing) */
function sanitizeMsgs(arr: UIMsg[]): UIMsg[] {
  const seen = new Set<string>();
  return arr
    .map((m, idx) => {
      const rawId = (m.id || '').toString().trim();
      if (rawId) return m;
      const fallbackId = `auto-${idx}-${m.role || 'msg'}-${(m.content || '').slice(0, 16)}`;
      return { ...m, id: fallbackId };
    })
    .filter((m) => {
      if (!m.id) return false;
      if (seen.has(m.id)) return false;
      seen.add(m.id);
      return true;
    });
}

/** Tiny helper to keep model default isolated */
function useStateWithDefault<T>(def: T): [T, (v: T) => void] {
  const [v, setV] = useState(def);
  return [v, setV];
}

function normalizeErrorMessage(raw: string): string {
  if (!raw) return 'Something went wrong.';
  const lower = raw.toLowerCase();
  if (lower.includes('bodystreambuffer was aborted')) {
    return 'GPT-5 limit reached. Using GPT-4o Mini (free) instead. Please try again.';
  }
  if (lower.includes('daily quota exceeded')) {
    const hourMatch = raw.match(/(\d+)\s*hour/i);
    if (hourMatch) {
      const h = hourMatch[1];
      return `Daily quota exceeded. Please try again in ${h} hour${h === '1' ? '' : 's'}.`;
    }
    return 'Daily quota exceeded. Please try again later.';
  }

  // Try to parse JSON payload inside the error string if present
  const jsonStart = raw.indexOf('{');
  if (jsonStart !== -1) {
    try {
      const parsed = JSON.parse(raw.slice(jsonStart));
      const msg = typeof parsed?.message === 'string' ? parsed.message : '';
      if (msg) {
        if (msg.toLowerCase().includes('daily quota exceeded')) {
          return 'Daily quota exceeded. Please come back tomorrow.';
        }
        return msg;
      }
    } catch {
      // ignore parse failure
    }
  }

  return raw;
}

function HomeInner() {
  const router = useRouter();
  const { session, accessToken, loading: authLoading } = useAuth();
  const sessionKey = session?.user?.id || session?.user?.email || 'anonymous';
  const apiBase = getApiBase();
  const conversationApiBase = apiBase || APP_CONFIG.api.baseUrl;
  const conversationClient = useMemo(
    () =>
      accessToken
        ? new HttpClient({
            baseUrl: conversationApiBase,
            headers: { Authorization: `Bearer ${accessToken}` },
          })
        : null,
    [accessToken, conversationApiBase],
  );
  const authHeaders = useMemo(
    () => (accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    [accessToken],
  );
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [forceWebSearch, setForceWebSearch] = useState(false);

  // Delete confirmation state
  const deleteConfirmRef = useRef<{
    reject: ((error: Error) => void) | null;
  }>({ reject: null });

  const [deleteConfirm, setDeleteConfirm] = useState<{
    isOpen: boolean;
    id: string | null;
    onConfirm: (() => void) | null;
  }>({
    isOpen: false,
    id: null,
    onConfirm: null,
  });

  // Model selection state
  const modelState = useStateWithDefault(DEFAULT_MODEL_KEY);
  const [model, _setModel] = modelState;
  useModelTheme(model);

  const {
    msgs,
    setMsgs,
    conversationId,
    loadedModel,
    sidebarReloadKey,
    setSidebarReloadKey,
    ensureConversation,
    appendMessages,
    saveCurrentChatIfNeeded,
    resetToNewChat,
    loadingConversation,
  } = useConversation(modelState, { accessToken, apiClient: conversationClient });

  const patchConversation = useCallback(
    async (id: string, body: Record<string, any>) => {
      const patchExternal = async () => {
        if (!conversationClient) return false;
        await conversationClient.patch(`/conversations/${id}`, body);
        return true;
      };

      const patchLocal = async () => {
        const res = await fetch(`/api/conversations/${id}`, {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json', ...authHeaders } as HeadersInit,
          body: JSON.stringify(body),
        });
        if (res.ok) return true;
        return false;
      };

      if (await patchLocal()) return;
      if (await patchExternal()) return;

      throw new Error('Failed to update conversation');
    },
    [conversationClient, authHeaders],
  );

  const deleteConversation = useCallback(
    async (id: string) => {
      const deleteExternal = async () => {
        if (!conversationClient) return false;
        await conversationClient.delete(`/conversations/${id}`);
        return true;
      };

      const deleteLocal = async () => {
        const res = await fetch(`/api/conversations/${id}`, {
          method: 'DELETE',
          credentials: 'include',
          headers: { ...authHeaders } as HeadersInit,
        });
        if (res.ok) return true;
        return false;
      };

      if (await deleteLocal()) return;
      if (await deleteExternal()) return;

      throw new Error('Failed to delete conversation');
    },
    [conversationClient, authHeaders],
  );

  const setModelAndPersist = async (nextModel: string) => {
    _setModel(nextModel); // update UI immediately
    if (conversationId) {
      try {
        await patchConversation(conversationId, { model: nextModel });
      } catch (e) {
        console.error('Failed to persist model:', e);
      }
    }
  };

  const [statusDialog, setStatusDialog] = useState<{
    open: boolean;
    title: string;
    message: string;
    variant?: 'error' | 'success' | 'info';
  }>({ open: false, title: '', message: '', variant: 'error' });

  // Streaming chat
  const { send, stop, loading, interrupted, searching, searchQuery } = useStreamingChat({
    accessToken,
    model,
    msgs,
    setMsgs,
    ensureConversation,
    appendMessages,
    conversationId,
    onSidebarDirty: () => setSidebarReloadKey((k) => k + 1),
    onError: (message) =>
      setStatusDialog({
        open: true,
        title: /quota|limit/i.test(message || '') ? 'Limit reached' : 'Error',
        message: normalizeErrorMessage(message || ''),
        variant: 'error',
      }),
    onModelFallback: (fallbackKey) => {
      setStatusDialog({
        open: true,
        title: 'Fallback to free model',
        message: 'GPT-5 daily limit reached. Switching to GPT-4o Mini (free).',
        variant: 'info',
      });
      setModelAndPersist(fallbackKey);
    },
  });

  // Sync model picker when conversation loads (uses loadedModel from useConversation — no extra fetch)
  useEffect(() => {
    if (loadedModel) _setModel(loadedModel);
  }, [loadedModel, _setModel]);

  const scrollerRef = useRef<HTMLDivElement>(null);
  const [hasPendingScroll, setHasPendingScroll] = useState(false);

  const computeIsAtBottom = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return true;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    return distanceFromBottom <= 48;
  }, []);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;

    const handleScroll = () => {
      const atBottom = computeIsAtBottom();
      setHasPendingScroll(!atBottom);
    };

    handleScroll(); // initialize based on current position
    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', handleScroll);
    };
  }, [computeIsAtBottom]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;

    const atBottom = computeIsAtBottom();

    if (!atBottom) {
      setHasPendingScroll(true);
      return;
    }

    setHasPendingScroll(false);

    // Use rAF so the DOM has painted before we measure/scroll
    requestAnimationFrame(() => {
      el.scrollTo({
        top: el.scrollHeight,
        behavior: 'smooth',
      });
    });
  }, [msgs, loading, computeIsAtBottom]);

  // Reset scroll state when switching chats or accounts to keep Jump to Present consistent everywhere
  useEffect(() => {
    const el = scrollerRef.current;
    setHasPendingScroll(false);
    if (!el) return;

    requestAnimationFrame(() => {
      el.scrollTo({
        top: el.scrollHeight,
        behavior: 'auto',
      });
    });
  }, [conversationId, sessionKey]);

  // Redirect to /login if not authenticated
  useEffect(() => {
    if (!authLoading && !session) router.replace('/login');
  }, [authLoading, session, router]);

  if (authLoading) return (
    <div className="min-h-screen bg-[color:var(--ui-bg)] flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 rounded-full border-2 border-[color:var(--ui-border-strong)] border-t-[color:var(--ui-accent)] animate-spin" />
        <span className="text-sm text-[color:var(--ui-text-muted)] animate-pulse">Loading…</span>
      </div>
    </div>
  );
  if (!session) return null;

  const safeMsgs = sanitizeMsgs(msgs);
  const hasAssistantReply = safeMsgs.some((m) => m.role === 'assistant' && (m.content || '').trim().length > 0);
  const hasConversationContent = safeMsgs.some((m) => {
    if (m.role !== 'user' && m.role !== 'assistant') return false;
    const hasText = (m.content || '').trim().length > 0;
    const hasAttachment = Boolean(m.attachment);
    return hasText || hasAttachment;
  });
  const isEmptyConversation = !hasConversationContent;

  const handleNewChat = async (folderId?: string | null) => {
    await saveCurrentChatIfNeeded();
    resetToNewChat(folderId);
    setSidebarOpen(false);
  };

  const handleSelectChat = (id: string) => {
    router.replace(`/?c=${id}`);
    setSidebarOpen(false);
  };

  // Layout
  return (
    <main className="page-fade relative flex h-screen min-h-screen flex-col overflow-hidden p-0">
      <div className="relative mx-auto flex w-full max-w-none flex-1 min-h-0 flex-col gap-3 sm:gap-3">
        <div className="sticky top-0 z-30 flex flex-wrap items-center gap-1.5 rounded-2xl border border-[color:var(--ui-border)] bg-[color:var(--ui-surface)] px-2 py-1.5 shadow-sm xl:hidden">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="inline-flex items-center gap-2 rounded-xl border border-[color:var(--ui-border)] bg-transparent px-3 py-1.5 text-sm font-medium text-[color:var(--ui-text)] transition hover:bg-white/5"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 6h16M4 12h12M4 18h16" />
            </svg>
            Chats
          </button>
          <button
            type="button"
            onClick={() => handleNewChat()}
            className="inline-flex items-center gap-2 rounded-xl border border-[color:var(--ui-border)] bg-[color:var(--ui-surface)] px-3.5 py-2 text-sm font-medium text-[color:var(--ui-text)] transition hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--ui-accent)]"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M12 5v14M5 12h14" />
            </svg>
            New chat
          </button>
        </div>

        <div className="grid h-full min-h-0 gap-3 xl:gap-0 xl:grid-cols-[20%_minmax(0,1fr)] xl:items-start">
          {sidebarOpen && (
            <div
              className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity duration-200 xl:hidden"
              onClick={() => setSidebarOpen(false)}
            />
          )}
          <div
            className={[
              'fixed inset-0 z-50 transition-all duration-200 xl:sticky xl:top-0 xl:z-10',
              sidebarOpen
                ? 'translate-x-0 opacity-100 pointer-events-auto'
                : '-translate-x-[110%] opacity-0 pointer-events-none',
              'xl:translate-x-0 xl:opacity-100 xl:pointer-events-auto xl:flex-shrink-0 xl:basis-[20%] xl:max-w-none xl:h-screen',
            ].join(' ')}
          >
            <Sidebar
              currentId={conversationId}
              reloadKey={sidebarReloadKey}
              onNewChat={handleNewChat}
              onNewChatInFolder={(folderId) => handleNewChat(folderId)}
              onSelect={handleSelectChat}
              onClose={() => setSidebarOpen(false)}
              onRename={async (id, newTitle) => {
                await patchConversation(id, { title: newTitle });
              }}
              onMoveFolder={async (id, folderId) => {
                await patchConversation(id, { folderId });
              }}
              onDelete={async (id) => {
                return new Promise<void>((resolve, reject) => {
                  deleteConfirmRef.current.reject = reject;
                  setDeleteConfirm({
                    isOpen: true,
                    id,
                    onConfirm: async () => {
                      setDeleteConfirm({ isOpen: false, id: null, onConfirm: null });
                      deleteConfirmRef.current.reject = null;
                      try {
                        await deleteConversation(id);
                        if (conversationId === id) {
                          resetToNewChat();
                        }

                        resolve();
                      } catch (error) {
                          reject(error as Error);
                      }
                    },
                  });
                });
              }}
              onClearAll={() => {
                resetToNewChat();
              }}
            />
          </div>

          {/* Right column - Chat area */}
          <section className="flex min-w-0 min-h-0 flex-1 flex-col gap-3 xl:h-screen">
            <div className="flex flex-1 min-h-0 flex-col overflow-hidden bg-[color:var(--ui-surface-alt)]">
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[color:var(--ui-surface-alt)] relative">
                <div className="flex items-center gap-2 px-2 py-1.5">
                  <ModelPicker value={model} onChange={setModelAndPersist} variant="inline" />
                </div>
                {loadingConversation && (
                  <div className="absolute right-4 top-3 z-20 inline-flex items-center gap-2 rounded-full border border-[color:var(--ui-border)] bg-[color:var(--ui-surface)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-[color:var(--ui-text-muted)]">
                    <span className="h-2 w-2 rounded-full bg-emerald-300 animate-pulse" />
                    Syncing...
                  </div>
                )}
                {isEmptyConversation ? (
                  <div className="flex flex-1 flex-col items-center justify-center px-2 py-4">
                    <div className="flex w-full max-w-xl flex-col items-center gap-4">
                      <h2 className="text-center text-2xl font-medium tracking-tight text-[color:var(--ui-text)]">
                        What can I help with?
                      </h2>
                      <div className="w-full">
                        <Composer
                          disabled={loading}
                          showStop={loading}
                          onStop={stop}
                          forceWebSearch={forceWebSearch}
                          onForceWebSearchChange={setForceWebSearch}
                          onSend={async ({ text, attachment }) => {
                            await send({ text, attachment, forceSearch: forceWebSearch });
                          }}
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    <div
                      ref={scrollerRef}
                      className="scroll-area flex-1 min-h-0 overflow-y-auto overflow-x-auto sm:overflow-x-hidden overscroll-contain px-2 py-3 sm:px-3 sm:py-3"
                      style={{ WebkitOverflowScrolling: 'touch' }}
                    >
                      <div className="flex w-full flex-col space-y-3 pb-10 sm:pb-12">
                        {safeMsgs.map((m) => (
                          <MessageBubble key={m.id} msg={m} />
                        ))}
                        {searching && <SearchIndicator query={searchQuery} />}
                        {loading && <TypingIndicator />}
                        <div
                          className={[
                            'sticky bottom-1 flex justify-end transition-opacity duration-300 ease-out',
                            hasPendingScroll ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none',
                          ].join(' ')}
                          style={{ paddingRight: 0, transform: 'translate(6px, 6px)' }}
                        >
                          <button
                            type="button"
                            className="inline-flex items-center gap-2 rounded-full border border-[color:var(--ui-border)] bg-[color:var(--ui-surface)] px-3 py-1.5 text-xs font-medium text-[color:var(--ui-text)] transition hover:bg-white/5"
                            onClick={() => {
                              setHasPendingScroll(false);
                              scrollerRef.current?.scrollTo({
                                top: scrollerRef.current.scrollHeight,
                                behavior: 'smooth',
                              });
                            }}
                          >
                            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
                              <path d="M12 5v14m0 0 5-5m-5 5-5-5" />
                            </svg>
                            Jump to present
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="border-t border-[color:var(--ui-border)] px-2 py-2 sm:px-3 sm:py-3 space-y-2">
                      {!loading && interrupted && hasAssistantReply && (
                        <div className="flex justify-end">
                          <button
                            type="button"
                            onClick={() => send({ text: 'Continue', forceSearch: forceWebSearch })}
                            className="inline-flex items-center gap-2 rounded-full border border-[color:var(--ui-border)] bg-[color:var(--ui-surface)] px-3 py-1.5 text-xs font-medium text-[color:var(--ui-text)] transition hover:bg-white/5"
                          >
                            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
                              <path d="M5 12h14m0 0-6-5m6 5-6 5" />
                            </svg>
                            Continue response
                          </button>
                        </div>
                      )}
                      <Composer
                        disabled={loading}
                        showStop={loading}
                        onStop={stop}
                        forceWebSearch={forceWebSearch}
                        onForceWebSearchChange={setForceWebSearch}
                        onSend={async ({ text, attachment }) => {
                          await send({ text, attachment, forceSearch: forceWebSearch });
                        }}
                      />
                    </div>
                  </>
                )}
              </div>
            </div>
          </section>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={deleteConfirm.isOpen}
        title="Delete Chat"
        message="Are you sure you want to delete this chat? This action cannot be undone."
        confirmText="Delete"
        cancelText="Cancel"
        variant="danger"
        onConfirm={() => {
          if (deleteConfirm.onConfirm) {
            deleteConfirm.onConfirm();
          }
        }}
        onCancel={() => {
          setDeleteConfirm({ isOpen: false, id: null, onConfirm: null });
          if (deleteConfirmRef.current.reject) {
            deleteConfirmRef.current.reject(new Error('Deletion cancelled'));
            deleteConfirmRef.current.reject = null;
          }
        }}
      />
      <StatusDialog
        open={statusDialog.open}
        title={statusDialog.title}
        message={statusDialog.message}
        variant={statusDialog.variant ?? 'error'}
        onClose={() =>
          setStatusDialog({ open: false, title: '', message: '', variant: 'error' })
        }
      />
    </main>
  );
}

export default function Home() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[color:var(--ui-bg)] flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 rounded-full border-2 border-[color:var(--ui-border-strong)] border-t-[color:var(--ui-accent)] animate-spin" />
            <span className="text-sm text-[color:var(--ui-text-muted)] animate-pulse">Loading…</span>
          </div>
        </div>
      }
    >
      <HomeInner />
    </Suspense>
  );
}
