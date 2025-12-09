'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';

import TopBar from '@/components/TopBar';
import Sidebar from '@/components/Sidebar';
import MessageBubble from '@/components/MessageBubble';
import TypingIndicator from '@/components/TypingIndicator';
import Composer from '@/components/Composer';
import ConfirmDialog from '@/components/ConfirmDialog';
import StatusDialog from '@/components/StatusDialog';

import { useConversation } from '@/hooks/useConversation';
import { useStreamingChat } from '@/hooks/useStreamingChat';
import { useModelTheme } from '@/hooks/useModelTheme';
import type { UIMsg } from '@/lib/chat';

/** Ensure no duplicate message IDs before rendering */
function sanitizeMsgs(arr: UIMsg[]): UIMsg[] {
  const map = new Map<string, UIMsg>();
  for (const m of arr) map.set(m.id || '', m);
  return Array.from(map.entries())
    .filter(([id]) => Boolean(id))
    .map(([, m]) => m);
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

export default function Home() {
  const router = useRouter();
  const { session, accessToken, loading: authLoading } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // ---- Delete confirmation state ----
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

  // ---- Model selection state ----
  const modelState = useStateWithDefault('');
  const [model, _setModel] = modelState;
  useModelTheme(model);

  const setModelAndPersist = async (nextModel: string) => {
    _setModel(nextModel); // update UI immediately
    if (conversationId) {
      try {
        await fetch(`/api/conversations/${conversationId}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ model: nextModel }),
        });
        // optional: refresh sidebar ordering
        setSidebarReloadKey((k) => k + 1);
      } catch (e) {
        console.error('Failed to persist model:', e);
      }
    }
  };

  // ---- Conversation state ----
  const {
    msgs,
    setMsgs,
    conversationId,
    sidebarReloadKey,
    setSidebarReloadKey,
    ensureConversation,
    appendMessages,
    saveCurrentChatIfNeeded,
    resetToNewChat,
  } = useConversation(modelState);
  const [statusDialog, setStatusDialog] = useState<{
    open: boolean;
    title: string;
    message: string;
    variant?: 'error' | 'success' | 'info';
  }>({ open: false, title: '', message: '', variant: 'error' });

  // ---- Streaming chat ----
  const { send, stop, loading } = useStreamingChat({
    accessToken,
    model,
    msgs,
    setMsgs,
    ensureConversation,
    appendMessages,
    conversationId, // pass current conversationId
    onError: (message) =>
      setStatusDialog({
        open: true,
        title: 'Limit reached',
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

  useEffect(() => {
    let cancelled = false;

    async function hydrateModelFromDB() {
      if (!conversationId) return;
      try {
        const r = await fetch(`/api/conversations/${conversationId}`, { cache: 'no-store' });
        if (!r.ok) return; // handle 401/404 quietly
        const { conversation } = await r.json();
        if (!cancelled && conversation?.model) {
          // IMPORTANT: set UI only (no PATCH back to server here)
          _setModel(conversation.model);
        }
      } catch (e) {
        console.error('Failed to hydrate model from DB:', e);
      }
    }

    hydrateModelFromDB();
    return () => {
      cancelled = true;
    };
  }, [conversationId, _setModel]);

  // ---- Auto-scroll on new messages ----
  const scrollerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scrollerRef.current?.scrollTo({
      top: scrollerRef.current.scrollHeight,
      behavior: 'smooth',
    });
  }, [msgs, loading]);

  // ---- Redirect to /login if not authenticated ----
  useEffect(() => {
    if (!authLoading && !session) router.replace('/login');
  }, [authLoading, session, router]);

  if (authLoading) return <div className="min-h-screen bg-black" />;
  if (!session) return null;

  const safeMsgs = sanitizeMsgs(msgs);
  const handleNewChat = async () => {
    await saveCurrentChatIfNeeded();
    resetToNewChat();
    setSidebarReloadKey((k) => k + 1);
    setSidebarOpen(false);
  };
  const handleSelectChat = (id: string) => {
    if (conversationId === id) {
      setSidebarOpen(false);
      return;
    }
    router.replace(`/?c=${id}`);
    setSidebarOpen(false);
  };

  // ---- Layout ----
  return (
    <main className="relative flex h-screen min-h-screen flex-col overflow-hidden px-4 py-4 text-zinc-100 sm:px-6 sm:py-5 md:px-8 md:py-6 lg:px-10 lg:py-6">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-24 top-[-140px] h-72 w-72 rounded-full bg-emerald-500/12 blur-[130px]" />
        <div className="absolute right-[-90px] top-6 h-64 w-64 rounded-full bg-indigo-500/12 blur-[120px]" />
        <div className="absolute -bottom-40 left-1/2 h-80 w-80 -translate-x-1/2 transform rounded-full bg-cyan-400/12 blur-[140px]" />
      </div>

      <div className="relative mx-auto flex w-full max-w-none flex-1 min-h-0 flex-col gap-5 sm:gap-6 lg:gap-8">
        <div className="sticky top-2 sm:top-3 z-30 flex flex-wrap items-center gap-2 rounded-3xl border border-white/10 bg-black/40 px-3 py-2 backdrop-blur xl:hidden">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="inline-flex items-center gap-2 rounded-2xl border border-white/20 bg-white/5 px-3.5 py-2 text-sm font-semibold text-white shadow-[0_12px_36px_rgba(2,6,23,.55)] transition hover:border-white/40 hover:bg-white/10"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 6h16M4 12h12M4 18h16" />
            </svg>
            Chats
          </button>
          <button
            type="button"
            onClick={handleNewChat}
            className="inline-flex items-center gap-2 rounded-2xl accent-button px-3.5 py-2 text-sm font-semibold shadow-[0_12px_36px_rgba(2,6,23,.55)]"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M12 5v14M5 12h14" />
            </svg>
            New chat
          </button>
          <span className="ml-auto inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.25em] text-emerald-100 shadow-inner">
            <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_0_6px_rgba(16,185,129,0.15)]" />
            Live
          </span>
        </div>

        <div className="grid h-full min-h-0 gap-5 xl:grid-cols-[360px_minmax(0,1fr)] xl:items-start">
          {sidebarOpen && (
            <div
              className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity duration-200 xl:hidden"
              onClick={() => setSidebarOpen(false)}
            />
          )}
          <div
            className={[
              'fixed inset-y-4 left-4 right-4 z-50 transition-all duration-200 xl:sticky xl:top-4 xl:z-10',
              sidebarOpen
                ? 'translate-x-0 opacity-100 pointer-events-auto'
                : '-translate-x-[110%] opacity-0 pointer-events-none',
              'xl:translate-x-0 xl:opacity-100 xl:pointer-events-auto xl:flex-shrink-0 xl:basis-[360px] xl:max-w-[400px] xl:h-[calc(100vh-2rem)] xl:-ml-1 xl:mr-3',
            ].join(' ')}
          >
            <Sidebar
              currentId={conversationId}
              reloadKey={sidebarReloadKey}
              onNewChat={handleNewChat}
              onSelect={handleSelectChat}
              onClose={() => setSidebarOpen(false)}
              onRename={async (id, newTitle) => {
                const patchRes = await fetch(`/api/conversations/${id}`, {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ title: newTitle }),
                });

                if (!patchRes.ok) {
                  const errorText = await patchRes.text().catch(() => 'Unknown error');
                  console.error('Failed to rename conversation:', errorText);
                  throw new Error(`Failed to rename: ${errorText}`);
                }
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
                        const res = await fetch(`/api/conversations/${id}`, {
                          method: 'DELETE',
                        });

                        if (!res.ok) {
                          const errorText = await res.text().catch(() => 'Unknown error');
                          console.error('Failed to delete conversation:', errorText);
                          throw new Error(`Failed to delete: ${errorText}`);
                        }

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
                setSidebarReloadKey((k) => k + 1);
              }}
            />
          </div>

          {/* Right column: TopBar + Chat area */}
          <section className="flex min-w-0 min-h-0 flex-1 flex-col gap-4 sm:gap-5 xl:h-[calc(100vh-2rem)]">
            <div className="glass-panel gradient-border rounded-[28px] border border-white/10 p-4 sm:p-6 shadow-[0_24px_100px_rgba(2,6,23,.65)]">
              <TopBar model={model} setModel={setModelAndPersist} />
            </div>

            <div className="glass-panel gradient-border flex flex-1 min-h-0 flex-col overflow-hidden rounded-[30px] border border-white/10 p-3 sm:p-4 lg:p-5 shadow-[0_28px_110px_rgba(2,6,23,.7)]">
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[22px] border border-white/5 bg-white/5">
                <div
                  ref={scrollerRef}
                  className="scroll-area flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain px-3 py-5 sm:px-5 lg:px-8"
                >
                  <div className="flex w-full flex-col space-y-4 pb-24 sm:pb-28">
                    {safeMsgs.map((m) => (
                      <MessageBubble key={m.id} msg={m} />
                    ))}
                    {loading && <TypingIndicator />}
                  </div>
                </div>

                <div className="border-t border-white/5 px-2 py-3 sm:px-4 sm:py-4">
                  <Composer
                    disabled={loading}
                    showStop={loading}
                    onStop={stop}
                    onSend={async ({ text, attachment }) => {
                      await send({ text, attachment });
                    }}
                  />
                </div>
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
          // Reject the promise so optimistic update can be reverted
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
        onClose={() => setStatusDialog({ open: false, title: '', message: '', variant: 'error' })}
      />
    </main>
  );
}
