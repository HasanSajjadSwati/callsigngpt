// callsigngpt-web/src/hooks/useConversation.ts
'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { UI_TEXT, APP_CONFIG, getSystemGreeting } from '@/config/uiText';
import { UIMsg } from '@/lib/chat';
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
  };
}

const extractConversation = (data: any) => (data?.conversation ? data.conversation : data);
type ConversationOpts = { accessToken?: string; apiClient?: HttpClient | null };

type UseConversationReturn = {
  msgs: UIMsg[];
  setMsgs: React.Dispatch<React.SetStateAction<UIMsg[]>>;
  conversationId: string | null;
  sidebarReloadKey: number;
  setSidebarReloadKey: React.Dispatch<React.SetStateAction<number>>;
  ensureConversation: () => Promise<void>;
  appendMessages: (...newMessages: UIMsg[]) => Promise<void>;
  saveCurrentChatIfNeeded: () => Promise<void>;
  resetToNewChat: () => void;
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
  const isExternalApi = Boolean(apiBase);
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

  const [msgs, setMsgs] = useState<UIMsg[]>(() => [greetingFnRef.current()]);
  const msgsRef = useRef<UIMsg[]>(msgs); // Keep ref to latest messages
  const saveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [loadingConversation, setLoadingConversation] = useState(false);

  // Keep ref in sync with msgs state
  useEffect(() => {
    msgsRef.current = msgs;
  }, [msgs]);

  const [conversationId, setConversationId] = useState<string | null>(null);
  const [sidebarReloadKey, setSidebarReloadKey] = useState(0);
  const createdOnServer = useRef(false);
  const isCreatingConversation = useRef(false);
  const pendingConversationId = useRef<string | null>(null); // Track conversation being created
  const lastFailedConversationId = useRef<string | null>(null); // Prevent hammering missing IDs

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
    setConversationId(null);
    pendingConversationId.current = null;
    setMsgs([greetingFnRef.current()]);
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
    if (id && lastFailedConversationId.current === id) {
      setLoadingConversation(false);
      return;
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

    const fetchFromLocal = async () => {
      const res = await fetch(`${APP_CONFIG.api.baseUrl}/conversations/${id}`, {
        method: 'GET',
        credentials: apiCredentials,
        headers: {
          ...authHeaders,
        } as HeadersInit,
        cache: 'no-store',
      });
      if (!res.ok) return null;
      const data = await res.json();
      return extractConversation(data);
    };

    (async () => {
      setLoadingConversation(true);
      try {
        let convo: any = null;

        // Prefer local DB (Next API) first so data stays in sync
        try {
          convo = await fetchFromLocal();
        } catch {
          // ignore
        }

        // If local did not return data, try external when configured
        if (!convo && isExternalApi && authedClient) {
          try {
            const data = await authedClient.get(`/conversations/${id}`);
            convo = extractConversation(data);
          } catch (err: any) {
            if (cancelled) return;
            console.error(
              `[useConversation] Failed to load conversation ${id}:`,
              err?.message || err,
            );
          }
        }

        // As a last resort, try external in same-origin mode
        if (!convo && authedClient && !isExternalApi) {
          try {
            const data = await authedClient.get(`/conversations/${id}`);
            convo = extractConversation(data);
          } catch (err: any) {
            if (cancelled) return;
            console.error(
              `[useConversation] Failed to load conversation ${id}:`,
              err?.message || err,
            );
          }
        }

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
          const loaded: UIMsg[] = Array.isArray(convo.messages) ? convo.messages : [];

          setMsgs((prev) => {
            const hasLocalContent = prev.some((m) => m.role === 'user' || m.role === 'assistant');
            // If we are switching to a different conversation, always load server data
            if (conversationId && conversationId !== id) {
              return loaded.length
                ? loaded
                : [greetingFnRef.current()];
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
              : [greetingFnRef.current()];
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
  }, [search, conversationId, resetLocal, authedClient, apiBase, apiCredentials, isExternalApi, clearConversationQuery, authHeaders]);

  /** Create conversation on server if missing */
  const ensureConversation = useCallback(async () => {
    if (createdOnServer.current && conversationId) return;

    // Set flags BEFORE making the request to prevent any race conditions
    isCreatingConversation.current = true;
    pendingConversationId.current = null;
    
    try {
      // Use ref to get the latest messages (includes optimistic updates)
      const currentMsgs = msgsRef.current;
      const firstUser = currentMsgs.find((m) => m.role === 'user');
      const title =
        firstUser?.content?.slice(0, APP_CONFIG.conversation.maxTitleLength) ||
        UI_TEXT.app.newChatTitle;

      let newId: string | undefined;

      // Create via local API first (DB of record)
      try {
        const res = await fetch(`${APP_CONFIG.api.baseUrl}/conversations`, {
          method: 'POST',
          credentials: apiCredentials,
          headers: { 'Content-Type': 'application/json', ...authHeaders } as HeadersInit,
          body: JSON.stringify({ title, model, messages: currentMsgs }),
        });
        if (res.ok) {
          const data = await res.json();
          newId = data?.conversation?.id;
        }
      } catch {
        // ignore, try external next
      }

      // Fallback to external if local failed and external is available
      if (!newId && authedClient) {
        try {
          const data = await authedClient.post(`/conversations`, { title, model, messages: currentMsgs });
          const convo = extractConversation(data);
          newId = convo?.id;
        } catch {
          // ignore
        }
      }

      if (newId) {
        createdOnServer.current = true;
        pendingConversationId.current = newId;
        
        setConversationId(newId);

        setSidebarReloadKey((k) => k + APP_CONFIG.conversation.resetKeyIncrement);
        
        const curr = search.get('c');
        if (curr !== newId) {
          setTimeout(() => {
            const url = new URL(window.location.href);
            url.searchParams.set('c', newId);
            router.replace(`${url.pathname}?${url.searchParams.toString()}`);
          }, 500);
        }
      }
    } catch (_error) {
      isCreatingConversation.current = false;
      pendingConversationId.current = null;
    }
  }, [msgs, model, conversationId, router, search, authedClient, apiBase, apiCredentials, isExternalApi, authHeaders]);

  const sendConversationPatch = useCallback(
    async (cid: string, body: Record<string, any>, logCtx = '[appendMessages]') => {
      // Try local DB first
      try {
        const res = await fetch(`${APP_CONFIG.api.baseUrl}/conversations/${cid}`, {
          method: 'PATCH',
          credentials: apiCredentials,
          headers: { 'Content-Type': 'application/json', ...authHeaders } as HeadersInit,
          body: JSON.stringify(body),
        });
        if (res.ok) return;
        console.error(`${logCtx} Failed to save messages locally:`, res.status, res.statusText);
      } catch (err) {
        console.error(`${logCtx} Local save errored:`, err);
      }

      // Fallback to external if available
      if (authedClient) {
        try {
          await authedClient.patch(`/conversations/${cid}`, body);
          return;
        } catch (err: any) {
          console.error(`${logCtx} Failed to save messages via external API:`, err?.message || err);
        }
      }
    },
    [apiBase, apiCredentials, isExternalApi, authedClient, authHeaders],
  );

  /** Append messages plus persist */
  const appendMessages = useCallback(
    async (...newMessages: UIMsg[]) => {
      let finalConversationId: string | null = null;
      
      setMsgs((prev) => {
        const existingIds = new Set(prev.map((m) => m.id));
        const toAdd = newMessages.filter((m) => !existingIds.has(m.id));
        const next = toAdd.length > 0 ? [...prev, ...toAdd] : prev;
        
        const finalNext = next.map((msg) => {
          const updated = newMessages.find((nm) => nm.id === msg.id);
          return updated || msg;
        });
        
        const cid = conversationId || pendingConversationId.current;
        finalConversationId = cid;
        
        if (cid) {
          const firstUserMsg = finalNext.find((m) => m.role === 'user');
          const newTitle = firstUserMsg
            ? firstUserMsg.content.slice(0, APP_CONFIG.conversation.maxTitleLength).trim()
            : undefined;
          
          const updateBody: { messages: UIMsg[]; title?: string } = { messages: finalNext };
          if (newTitle && (pendingConversationId.current === cid || isCreatingConversation.current)) {
            updateBody.title = newTitle;
          }
          
          // debounce saves to reduce flicker
          if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
          saveTimerRef.current = setTimeout(() => {
            void sendConversationPatch(cid, updateBody, '[appendMessages]');
          }, 300);
        }
        return finalNext;
      });
      
      if (!finalConversationId && pendingConversationId.current) {
        setTimeout(async () => {
          const cid = conversationId || pendingConversationId.current;
          if (cid) {
            const currentMsgs = msgsRef.current;
            const firstUserMsg = currentMsgs.find((m) => m.role === 'user');
            const newTitle = firstUserMsg
              ? firstUserMsg.content.slice(0, APP_CONFIG.conversation.maxTitleLength).trim()
              : undefined;
            
            const updateBody: { messages: UIMsg[]; title?: string } = { messages: currentMsgs };
            if (newTitle && (pendingConversationId.current === cid || isCreatingConversation.current)) {
              updateBody.title = newTitle;
            }

            await sendConversationPatch(cid, updateBody, '[appendMessages]');
          }
        }, 200);
      }
      
      isCreatingConversation.current = false;
      pendingConversationId.current = null;
    },
    [conversationId, sendConversationPatch],
  );

  /** Save current chat (explicit) */
  const saveCurrentChatIfNeeded = useCallback(async () => {
      if (!conversationId) return;
      try {
        await sendConversationPatch(conversationId, { messages: msgs }, '[useConversation]');
      } catch (_err) {
        console.warn('[useConversation] saveCurrentChatIfNeeded failed:', _err);
      }
  }, [conversationId, msgs, sendConversationPatch]);

  /** Reset local chat */
  const resetToNewChat = useCallback(() => {
    resetLocal();
    const url = new URL(window.location.href);
    url.searchParams.delete('c');
    router.replace(`${url.pathname}${url.search}`);
  }, [router, resetLocal]);

  return {
    msgs,
    setMsgs,
    conversationId,
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
