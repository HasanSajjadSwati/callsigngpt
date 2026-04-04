// callsigngpt-web/src/hooks/useConversation.ts
'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { UI_TEXT, APP_CONFIG, getSystemGreeting } from '@/config/uiText';
import { UIMsg, withTimestamps } from '@/lib/chat';
import { getApiBase } from '@/lib/apiBase';
import { HttpClient } from '@/lib/httpClient';
import { modelCache } from '@/lib/modelCache';

type Role = UIMsg['role'];

function buildSystemMessage(modelKey: string, labels: Record<string, string>): UIMsg {
  const label = (modelKey && labels[modelKey]) || modelKey || 'CallSignGPT';
  return {
    id: genId(),
    role: (APP_CONFIG.conversation.greetingRole ?? 'assistant') as Role,
    content: getSystemGreeting(label),
    createdAt: Date.now(),
  };
}

function coerceFolderId(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function sanitizeAttachment(attachment: UIMsg['attachment']): UIMsg['attachment'] | undefined {
  if (!attachment || typeof attachment !== 'object') return undefined;

  const type = attachment.type === 'image' || attachment.type === 'file' ? attachment.type : undefined;
  const name = typeof attachment.name === 'string' ? attachment.name : '';
  const mime = typeof attachment.mime === 'string' ? attachment.mime : '';
  const size = typeof attachment.size === 'number' && Number.isFinite(attachment.size) ? attachment.size : 0;

  if (!type || !name) return undefined;

  if (type === 'image') {
    return {
      type,
      name,
      mime,
      size,
      src: typeof attachment.src === 'string' ? attachment.src : '',
    };
  }

  return {
    type,
    name,
    mime,
    size,
    ...(typeof attachment.src === 'string' ? { src: attachment.src } : {}),
  };
}

function sanitizeMessageForPersistence(message: UIMsg): UIMsg {
  return {
    id: typeof message.id === 'string' ? message.id : String(message.id ?? ''),
    role: message.role,
    content: typeof message.content === 'string' ? message.content : String(message.content ?? ''),
    ...(typeof message.createdAt === 'number' && Number.isFinite(message.createdAt)
      ? { createdAt: message.createdAt }
      : {}),
    ...(sanitizeAttachment(message.attachment) ? { attachment: sanitizeAttachment(message.attachment) } : {}),
  };
}

function sanitizeMessagesForPersistence(messages: UIMsg[]): UIMsg[] {
  return withTimestamps(messages).map(sanitizeMessageForPersistence);
}

const extractConversation = (data: any) => (data?.conversation ? data.conversation : data);
type ConversationOpts = { accessToken?: string; apiClient?: HttpClient | null };

type UseConversationReturn = {
  msgs: UIMsg[];
  setMsgs: React.Dispatch<React.SetStateAction<UIMsg[]>>;
  conversationId: string | null;
  loadedModel: string | null;
  sidebarReloadKey: number;
  setSidebarReloadKey: React.Dispatch<React.SetStateAction<number>>;
  ensureConversation: () => Promise<void>;
  appendMessages: (...newMessages: UIMsg[]) => Promise<void>;
  saveCurrentChatIfNeeded: () => Promise<void>;
  resetToNewChat: (folderId?: string | null) => void;
  loadingConversation: boolean;
};
export function useConversation(
  modelState: [string, (v: string) => void],
  opts: ConversationOpts = {},
): UseConversationReturn {
  const [model] = modelState;
  const router = useRouter();
  const search = useSearchParams();
  const accessToken = opts?.accessToken;

  const apiBase = getApiBase();
  const conversationApiBase = apiBase || APP_CONFIG.api.baseUrl;
  const apiCredentials = APP_CONFIG.api.credentials as RequestCredentials;
  const authedClient = useMemo(
    () =>
      opts?.apiClient ??
      (accessToken
        ? new HttpClient({
            baseUrl: conversationApiBase,
            headers: { Authorization: `Bearer ${accessToken}` },
          })
        : null),
    [opts?.apiClient, accessToken, conversationApiBase],
  );
  const authHeaders = useMemo(
    () => (accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    [accessToken],
  );

  const [modelLabels, setModelLabels] = useState<Record<string, string>>({});
  const modelRef = useRef(model);
  const modelLabelsRef = useRef<Record<string, string>>({});
  const greetingFnRef = useRef<() => UIMsg>(() => buildSystemMessage(modelRef.current, modelLabelsRef.current));

  useEffect(() => {
    modelRef.current = model;
    greetingFnRef.current = () => buildSystemMessage(modelRef.current, modelLabelsRef.current);
  }, [model]);

  useEffect(() => {
    modelLabelsRef.current = modelLabels;
    greetingFnRef.current = () => buildSystemMessage(modelRef.current, modelLabelsRef.current);
  }, [modelLabels]);

  const [msgs, _setMsgs] = useState<UIMsg[]>(() => withTimestamps([greetingFnRef.current()]));
  const msgsRef = useRef<UIMsg[]>(msgs); // Keep ref to latest messages
  const saveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [loadingConversation, setLoadingConversation] = useState(false);

  // Wrapper that keeps msgsRef in sync synchronously
  const setMsgs: typeof _setMsgs = useCallback((action) => {
    _setMsgs((prev) => {
      const next = typeof action === 'function' ? action(prev) : action;
      msgsRef.current = next;
      return next;
    });
  }, []);

  // Also keep ref in sync after React commits (belt-and-suspenders)
  useEffect(() => {
    msgsRef.current = msgs;
  }, [msgs]);

  const [conversationId, setConversationId] = useState<string | null>(null);
  const [loadedModel, setLoadedModel] = useState<string | null>(null);
  const [sidebarReloadKey, setSidebarReloadKey] = useState(0);
  const bumpSidebarReload = useCallback(
    () => setSidebarReloadKey((k) => k + APP_CONFIG.conversation.resetKeyIncrement),
    [setSidebarReloadKey],
  );
  const createdOnServer = useRef(false);
  const isCreatingConversation = useRef(false);
  const pendingConversationId = useRef<string | null>(null); // Track conversation being created
  const lastFailedConversationId = useRef<string | null>(null); // Prevent hammering missing IDs
  const pendingFolderIdRef = useRef<string | null>(null);

  const clearConversationQuery = useCallback(
    (expectedId?: string | null) => {
      if (typeof window === 'undefined') return;
      const url = new URL(window.location.href);
      if (expectedId && url.searchParams.get('c') !== expectedId) return;
      url.searchParams.delete('c');
      router.replace(`${url.pathname}${url.search}`);
    },
    [router],
  );

  /** Shared local reset */
  const resetLocal = useCallback(() => {
    createdOnServer.current = false;
    isCreatingConversation.current = false;
    setConversationId(null);
    setLoadedModel(null);
    pendingConversationId.current = null;
    pendingFolderIdRef.current = null;
    setMsgs(withTimestamps([greetingFnRef.current()]));
  }, []);

  // Fetch model labels so the greeting can use display names
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await modelCache.list();
        if (cancelled) return;
        const map: Record<string, string> = {};
        for (const m of data || []) {
          map[m.modelKey] = m.displayName || m.modelKey;
        }
        setModelLabels(map);
      } catch (err) {
        console.warn('[useConversation] failed to load model labels', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  // Keep the greeting in sync with the selected model/display name without retriggering conversation load
  useEffect(() => {
    const nextGreeting = greetingFnRef.current().content;
    setMsgs((prev) => {
      if (!prev.length) return prev;
      const [first, ...rest] = prev;
      if (first.role !== (APP_CONFIG.conversation.greetingRole as Role)) return prev;
      if (first.content === nextGreeting) return prev;
      return [{ ...first, content: nextGreeting }, ...rest];
    });
  }, [model, modelLabels]);

  // Load conversation when ?c changes
  useEffect(() => {
    const id = search.get('c');

    // If the user is switching to a different chat, clear any stale "creating" flags
    // so selection is never blocked by a previous pending conversation state.
    if (id && id !== conversationId && (isCreatingConversation.current || pendingConversationId.current)) {
      isCreatingConversation.current = false;
      pendingConversationId.current = null;
    }

    // If no ID, reset to new chat state
    // BUT: Do not reset if we are in the process of creating a conversation
    // (this prevents clearing messages when conversationId is set before URL updates)
    if (!id) {
      if (conversationId && !isCreatingConversation.current && !pendingConversationId.current) {
        resetLocal();
      }
      lastFailedConversationId.current = null;
      setLoadingConversation(false);
      return;
    }

    // If we are already on this conversation, do not reload
    if (conversationId === id) {
      setLoadingConversation(false);
      return;
    }

    // If we are in the process of creating a conversation, do not reload yet
    // (this prevents race conditions when ensureConversation updates the URL)
    // Also check if this is the pending conversation we are creating
    if (isCreatingConversation.current || pendingConversationId.current === id) {
      setLoadingConversation(false);
      return;
    }

    let cancelled = false;

    const fetchConversation = async () => {
      const tryLocal = async () => {
        try {
          const res = await fetch(`/api/conversations/${id}`, {
            method: 'GET',
            credentials: apiCredentials,
            headers: {
              ...authHeaders,
            } as HeadersInit,
            cache: 'no-store',
          });
          if (!res.ok) return null;
          const data = await res.json();
          if (cancelled) return null;
          return extractConversation(data);
        } catch (err: any) {
          if (!cancelled) {
            console.error(
              `[useConversation] Failed to load conversation ${id} via local API:`,
              err?.message || err,
            );
          }
          return null;
        }
      };

      const tryExternal = async () => {
        if (!authedClient) return null;
        try {
          const data = await authedClient.get(`/conversations/${id}`);
          if (cancelled) return null;
          return extractConversation(data);
        } catch (err: any) {
          const msg = err?.message || '';
          const is404 = /404/.test(msg);
          if (!cancelled && !is404) {
            console.error(
              `[useConversation] Failed to load conversation ${id} via API:`,
              msg || err,
            );
          }
          return null;
        }
      };

      // Race both sources — use whichever succeeds first
      const [local, external] = await Promise.all([tryLocal(), tryExternal()]);
      return local ?? external;
    };

    (async () => {
      setLoadingConversation(true);
      try {
        const convo = await fetchConversation();

        if (!convo) {
          lastFailedConversationId.current = id;
          setSidebarReloadKey((k) => k + APP_CONFIG.conversation.resetKeyIncrement);
          clearConversationQuery(id);
          resetLocal();
          return;
        }

        if (cancelled) return;
        
        if (convo?.id) {
          lastFailedConversationId.current = null;
          createdOnServer.current = true;
          setConversationId(convo.id);
          if (convo.model) setLoadedModel(convo.model);
          const loaded: UIMsg[] = Array.isArray(convo.messages)
            ? withTimestamps(convo.messages)
            : [];

          setMsgs((prev) => {
            const hasLocalContent = prev.some((m) => m.role === 'user' || m.role === 'assistant');
            // If we are switching to a different conversation, always load server data
            if (conversationId && conversationId !== id) {
              return loaded.length
                ? loaded
                : withTimestamps([greetingFnRef.current()]);
            }

            // If staying on same conversation and we already have meaningful local state, keep it to avoid flicker
            if (hasLocalContent && conversationId === convo.id) {
              return prev;
            }
            
            // If we are loading the conversation that was just created (pendingConversationId matches)
            // AND we are in the process of creating (flag is set) AND we have user messages
            // Preserve the optimistic updates
            const isPendingConversation = pendingConversationId.current === id;
            const isCreating = isCreatingConversation.current;
            const hasUserMessages = prev.some((m) => m.role === 'user');
            
            if ((isPendingConversation || isCreating) && hasUserMessages) {
              // Preserve optimistic updates during conversation creation
              // This prevents the server response (which might not have the user message yet)
              // from overwriting the optimistic update
              return prev;
            }
            
            // Otherwise, use the loaded messages
            return loaded.length
              ? loaded
              : withTimestamps([greetingFnRef.current()]);
          });
        } else {
          console.warn(`[useConversation] Conversation ${id} has no data`);
          lastFailedConversationId.current = id;
          setSidebarReloadKey((k) => k + APP_CONFIG.conversation.resetKeyIncrement);
          clearConversationQuery(id);
          resetLocal();
        }
      } catch (error) {
        if (cancelled) return;
        console.error(`[useConversation] Error loading conversation ${id}:`, error);
        lastFailedConversationId.current = id;
        setSidebarReloadKey((k) => k + APP_CONFIG.conversation.resetKeyIncrement);
        clearConversationQuery(id);
        resetLocal();
      } finally {
        if (!cancelled) setLoadingConversation(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [search, conversationId, resetLocal, authedClient, apiBase, apiCredentials, clearConversationQuery, authHeaders]);

  /** Create conversation on server if missing */
  const ensureConversation = useCallback(async () => {
    if (createdOnServer.current && conversationId) return;

    // Set flags BEFORE making the request to prevent any race conditions
    isCreatingConversation.current = true;
    pendingConversationId.current = null;
    
    try {
      // Use ref to get the latest messages (includes optimistic updates)
      const currentMsgs = sanitizeMessagesForPersistence(msgsRef.current);
      const firstUser = currentMsgs.find((m) => m.role === 'user');
      // Short placeholder title — the LLM-based generate-title will overwrite it
      const title =
        firstUser?.content?.split(/\s+/).slice(0, 4).join(' ').slice(0, 40) ||
        UI_TEXT.app.newChatTitle;

      const pendingFolderId = coerceFolderId(pendingFolderIdRef.current);
      const createLocal = async () => {
        try {
          const payload: Record<string, any> = { title, model, messages: currentMsgs };
          if (pendingFolderId) {
            payload.folderId = pendingFolderId;
          }
          const res = await fetch(`/api/conversations`, {
            method: 'POST',
            credentials: apiCredentials,
            headers: { 'Content-Type': 'application/json', ...authHeaders } as HeadersInit,
            body: JSON.stringify(payload),
          });
          if (res.ok) {
            const data = await res.json();
            return data?.conversation?.id as string | undefined;
          }
        } catch {
          // ignore
        }
        return undefined;
      };

      const createExternal = async () => {
        if (!authedClient) return undefined;
        try {
          const payload: Record<string, any> = { title, model, messages: currentMsgs };
          if (pendingFolderId) {
            payload.folderId = pendingFolderId;
          }
          const data = await authedClient.post(`/conversations`, payload);
          const convo = extractConversation(data);
          return convo?.id;
        } catch (err) {
          console.error('[useConversation] Failed to create conversation via API:', err);
          return undefined;
        }
      };

      const newId = (await createLocal()) ?? (await createExternal());

      if (newId) {
        createdOnServer.current = true;
        pendingConversationId.current = newId;
        pendingFolderIdRef.current = null;
        
        setConversationId(newId);

        setSidebarReloadKey((k) => k + APP_CONFIG.conversation.resetKeyIncrement);
        
        const curr = search.get('c');
        if (curr !== newId) {
          const url = new URL(window.location.href);
          url.searchParams.set('c', newId);
          router.replace(`${url.pathname}?${url.searchParams.toString()}`);
        }
      }
    } catch {
      isCreatingConversation.current = false;
      pendingConversationId.current = null;
    } finally {
      isCreatingConversation.current = false;
    }
  }, [msgs, model, conversationId, router, search, authedClient, apiCredentials, authHeaders]);

  const sendConversationPatch = useCallback(
    async (cid: string, body: Record<string, any>, logCtx = '[appendMessages]') => {
      const saveLocal = async () => {
        try {
          const res = await fetch(`/api/conversations/${cid}`, {
            method: 'PATCH',
            credentials: apiCredentials,
            headers: { 'Content-Type': 'application/json', ...authHeaders } as HeadersInit,
            body: JSON.stringify(body),
          });
          if (res.ok) return true;
          console.error(`${logCtx} Failed to save messages locally:`, res.status, res.statusText);
        } catch (err) {
          console.error(`${logCtx} Local save errored:`, err);
        }
        return false;
      };

      const saveExternal = async () => {
        if (!authedClient) return false;
        try {
          await authedClient.patch(`/conversations/${cid}`, body);
          return true;
        } catch (err: any) {
          console.error(`${logCtx} Failed to save messages via API:`, err?.message || err);
          return false;
        }
      };

      if (await saveLocal()) return;
      await saveExternal();
    },
    [apiCredentials, authedClient, authHeaders],
  );

  /** Append messages plus persist */
  const appendMessages = useCallback(
    async (...newMessages: UIMsg[]) => {
      // Cancel any pending debounced save — we will save immediately below
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }

      // Update state (pure — no side effects inside the updater)
      setMsgs((prev) => {
        const existingIds = new Set(prev.map((m) => m.id));
        const toAdd = newMessages.filter((m) => !existingIds.has(m.id));
        const next = toAdd.length > 0 ? [...prev, ...toAdd] : prev;
        
        const finalNext = next.map((msg) => {
          const updated = newMessages.find((nm) => nm.id === msg.id);
          return updated || msg;
        });
        return withTimestamps(finalNext);
      });

      // Save immediately — msgsRef is synced synchronously inside setMsgs
      const cid = conversationId || pendingConversationId.current;
      if (cid) {
        // Strip any leaked search-status protocol markers before persisting
        const messagesToSave = withTimestamps(msgsRef.current).map((m) => {
          if (typeof m.content === 'string' && m.content.includes('[[[SEARCH_STATUS]]]')) {
            return { ...m, content: m.content.replace(/\[{3}SEARCH_STATUS\]{3}[^\n]*/g, '').trim() };
          }
          return m;
        });
        await sendConversationPatch(
          cid,
          { messages: sanitizeMessagesForPersistence(messagesToSave) },
          '[appendMessages]',
        );
      }
      
      isCreatingConversation.current = false;
      pendingConversationId.current = null;
    },
    [conversationId, sendConversationPatch],
  );

  /** Save current chat (explicit) — flushes any pending debounced save first */
  const saveCurrentChatIfNeeded = useCallback(async () => {
      // Flush any pending debounced save
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }

      // If a conversation is being created, wait for it (up to 5s)
      if (isCreatingConversation.current && !conversationId && !pendingConversationId.current) {
        for (let i = 0; i < 50; i++) {
          await new Promise((r) => setTimeout(r, 100));
          if (pendingConversationId.current || !isCreatingConversation.current) break;
        }
      }

      const cid = conversationId || pendingConversationId.current;
      if (!cid) return;
      try {
        await sendConversationPatch(
          cid,
          { messages: sanitizeMessagesForPersistence(msgsRef.current) },
          '[useConversation]',
        );
      } catch (_err) {
        console.warn('[useConversation] saveCurrentChatIfNeeded failed:', _err);
      }
  }, [conversationId, sendConversationPatch]);

  /** Reset local chat */
  const resetToNewChat = useCallback(
    (folderId?: string | null) => {
      resetLocal();
      pendingFolderIdRef.current = coerceFolderId(folderId);
      const url = new URL(window.location.href);
      url.searchParams.delete('c');
      router.replace(`${url.pathname}${url.search}`);
    },
    [router, resetLocal],
  );

  return {
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
  };
}

function genId() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
}
