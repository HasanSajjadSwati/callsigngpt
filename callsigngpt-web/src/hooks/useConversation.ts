// callsigngpt-web/src/hooks/useConversation.ts
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { UI_TEXT, APP_CONFIG, getSystemGreeting } from '@/config/uiText';
import { UIMsg } from '@/lib/chat';

export function useConversation(modelState: [string, (v: string) => void]) {
  const [model] = modelState;
  const router = useRouter();
  const search = useSearchParams();

  const [modelLabels, setModelLabels] = useState<Record<string, string>>({});
  const modelRef = useRef(model);
  const modelLabelsRef = useRef<Record<string, string>>({});

  useEffect(() => {
    modelRef.current = model;
  }, [model]);

  useEffect(() => {
    modelLabelsRef.current = modelLabels;
  }, [modelLabels]);

  const greetingForModel = useCallback(
    (modelKey?: string) => {
      const key = modelKey ?? modelRef.current;
      const label = (key && modelLabelsRef.current[key]) || key;
      return getSystemGreeting(label);
    },
    [],
  );

  const buildSystemMessage = useCallback(
    (): UIMsg => ({
      id: genId(),
      role: APP_CONFIG.conversation.greetingRole,
      content: greetingForModel(modelRef.current),
    }),
    [greetingForModel],
  );

  const [msgs, setMsgs] = useState<UIMsg[]>(() => [buildSystemMessage()]);
  const msgsRef = useRef<UIMsg[]>(msgs); // Keep ref to latest messages

  // Keep ref in sync with msgs state
  useEffect(() => {
    msgsRef.current = msgs;
  }, [msgs]);

  const [conversationId, setConversationId] = useState<string | null>(null);
  const [sidebarReloadKey, setSidebarReloadKey] = useState(0);
  const createdOnServer = useRef(false);
  const isCreatingConversation = useRef(false);
  const pendingConversationId = useRef<string | null>(null); // Track conversation being created

  /** Shared local reset */
  const resetLocal = useCallback(() => {
    createdOnServer.current = false;
    setConversationId(null);
    pendingConversationId.current = null;
    setMsgs([buildSystemMessage()]);
  }, [buildSystemMessage]);

  // Fetch model labels so the greeting can use display names
  useEffect(() => {
    let cancelled = false;
    const apiBase =
      (process.env.NEXT_PUBLIC_API_URL ||
        (typeof window !== 'undefined' ? window.location.origin.replace(/:3000$/, ':3001') : '')
      ).replace(/\/$/, '');
    (async () => {
      if (!apiBase) return;
      try {
        const resp = await fetch(`${apiBase}/models`);
        if (!resp.ok) throw new Error(`models fetch failed ${resp.status}`);
        const data = await resp.json();
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

  // Keep the greeting in sync with the selected model/display name
  useEffect(() => {
    const nextGreeting = greetingForModel(model);
    setMsgs((prev) => {
      if (!prev.length) return prev;
      const [first, ...rest] = prev;
      if (first.role !== APP_CONFIG.conversation.greetingRole) return prev;
      if (first.content === nextGreeting) return prev;
      return [{ ...first, content: nextGreeting }, ...rest];
    });
  }, [model, modelLabels, greetingForModel]);

  // Load conversation when ?c changes
  useEffect(() => {
    const id = search.get('c');
    
    // If no ID, reset to new chat state
    // BUT: Don't reset if we're in the process of creating a conversation
    // (this prevents clearing messages when conversationId is set before URL updates)
    if (!id) {
      if (conversationId && !isCreatingConversation.current && !pendingConversationId.current) {
        resetLocal();
      }
      return;
    }

    // If we're already on this conversation, don't reload
    if (conversationId === id) {
      return;
    }

    // If we're in the process of creating a conversation, don't reload yet
    // (this prevents race conditions when ensureConversation updates the URL)
    // Also check if this is the pending conversation we're creating
    if (isCreatingConversation.current || pendingConversationId.current === id) {
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(`${APP_CONFIG.api.baseUrl}/conversations/${id}`, {
          method: 'GET',
          credentials: APP_CONFIG.api.credentials,
          cache: 'no-store',
        });

        if (cancelled) return;

        if (!res.ok) {
          console.error(`[useConversation] Failed to load conversation ${id}:`, res.status, res.statusText);
          resetLocal();
          return;
        }

        const data = await res.json();
        const convo = data?.conversation;
        
        if (cancelled) return;
        
        if (convo?.id) {
          createdOnServer.current = true;
          setConversationId(convo.id);
          const loaded: UIMsg[] = Array.isArray(convo.messages) ? convo.messages : [];
          
          // Only preserve optimistic updates if we're loading the conversation we just created
          // (meaning we're in the middle of creating/sending a message)
          // If we're switching to a DIFFERENT conversation, always load from server
          setMsgs((prev) => {
            // If we're switching to a different conversation, always load server data
            if (conversationId && conversationId !== id) {
              return loaded.length
                ? loaded
                : [buildSystemMessage()];
            }
            
            // If we're loading the conversation that was just created (pendingConversationId matches)
            // AND we're in the process of creating (flag is set) AND we have user messages
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
              : [buildSystemMessage()];
          });
        } else {
          console.warn(`[useConversation] Conversation ${id} has no data`);
          resetLocal();
        }
      } catch (error) {
        if (cancelled) return;
        console.error(`[useConversation] Error loading conversation ${id}:`, error);
        resetLocal();
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [search, conversationId, resetLocal, buildSystemMessage]);

  /** Create conversation on server if missing */
  const ensureConversation = useCallback(async () => {
    if (createdOnServer.current && conversationId) return;

    // Set flags BEFORE making the request to prevent any race conditions
    isCreatingConversation.current = true;
    pendingConversationId.current = null; // Clear any pending ID
    
    try {
      // Use ref to get the latest messages (includes optimistic updates)
      const currentMsgs = msgsRef.current;
      const firstUser = currentMsgs.find((m) => m.role === 'user');
      const title =
        firstUser?.content?.slice(0, APP_CONFIG.conversation.maxTitleLength) ||
        UI_TEXT.app.newChatTitle;

      const res = await fetch(`${APP_CONFIG.api.baseUrl}/conversations`, {
        method: 'POST',
        credentials: APP_CONFIG.api.credentials,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, model, messages: currentMsgs }),
      });
      if (!res.ok) {
        isCreatingConversation.current = false;
        pendingConversationId.current = null;
        return;
      }

      const data = await res.json();
      const newId: string | undefined = data?.conversation?.id;
      if (newId) {
        createdOnServer.current = true;
        // Set pending ID BEFORE updating state/URL to ensure loader sees it
        pendingConversationId.current = newId;
        
        // Update conversationId state - but DON'T update URL yet
        // We'll update URL after streaming starts to avoid triggering loader
        setConversationId(newId);

        // Sidebar refresh
        setSidebarReloadKey((k) => k + APP_CONFIG.conversation.resetKeyIncrement);
        
        // Update URL AFTER a delay to allow streaming to start first
        // This prevents the loader from running and overwriting optimistic updates
        const curr = search.get('c');
        if (curr !== newId) {
          setTimeout(() => {
            const url = new URL(window.location.href);
            url.searchParams.set('c', newId);
            router.replace(`${url.pathname}?${url.searchParams.toString()}`);
          }, 500); // Delay to ensure streaming has started
        }
      }
    } catch (error) {
      // On error, clear flags
      isCreatingConversation.current = false;
      pendingConversationId.current = null;
    }
    // Don't clear flags in finally - they'll be cleared when appendMessages is called
  }, [msgs, model, conversationId, router, search]);

  /** Append messages + persist */
  const appendMessages = useCallback(
    async (...newMessages: UIMsg[]) => {
      let finalConversationId: string | null = null;
      let messagesToSave: UIMsg[] = [];
      
      setMsgs((prev) => {
        // Check if messages are already in the array (from optimistic update)
        const existingIds = new Set(prev.map((m) => m.id));
        const toAdd = newMessages.filter((m) => !existingIds.has(m.id));
        const next = toAdd.length > 0 ? [...prev, ...toAdd] : prev;
        
        // Update the last message if it's the assistant message being updated
        const finalNext = next.map((msg) => {
          const updated = newMessages.find((nm) => nm.id === msg.id);
          return updated || msg;
        });
        
        messagesToSave = finalNext;
        
        // Use the current conversationId, or wait for it if we just created the conversation
        const cid = conversationId || pendingConversationId.current;
        finalConversationId = cid;
        
        if (cid) {
          // Generate title from first user message if we have one
          const firstUserMsg = finalNext.find((m) => m.role === 'user');
          const newTitle = firstUserMsg
            ? firstUserMsg.content.slice(0, APP_CONFIG.conversation.maxTitleLength).trim()
            : undefined;
          
          // Save messages to server - also update title if we have a user message
          // Update title if conversation was just created (to replace "New chat" with actual title)
          const updateBody: { messages: UIMsg[]; title?: string } = { messages: finalNext };
          // Only update title if we just created the conversation (pendingConversationId matches)
          // This ensures we set a proper title instead of "New chat" without overwriting custom titles
          if (newTitle && (pendingConversationId.current === cid || isCreatingConversation.current)) {
            updateBody.title = newTitle;
          }
          
          fetch(`${APP_CONFIG.api.baseUrl}/conversations/${cid}`, {
            method: 'PATCH',
            credentials: APP_CONFIG.api.credentials,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updateBody),
          })
            .then((res) => {
              if (!res.ok) {
                console.error('[appendMessages] Failed to save messages:', res.status, res.statusText);
              } else {
                console.log('[appendMessages] Successfully saved', finalNext.length, 'messages', newTitle ? `with title: ${newTitle}` : '');
                // Refresh sidebar to show updated title
                setSidebarReloadKey((k) => k + 1);
              }
            })
            .catch((err) => {
              console.error('[appendMessages] Error saving messages:', err);
            });
        }
        return finalNext;
      });
      
      // If we don't have a conversationId yet, wait a bit and try again
      if (!finalConversationId && pendingConversationId.current) {
        // Wait for conversationId to be set, then save
        setTimeout(async () => {
          const cid = conversationId || pendingConversationId.current;
          if (cid) {
            const currentMsgs = msgsRef.current;
            // Generate title from first user message
            // Only update if conversation was just created (to avoid overwriting custom titles)
            const firstUserMsg = currentMsgs.find((m) => m.role === 'user');
            const newTitle = firstUserMsg
              ? firstUserMsg.content.slice(0, APP_CONFIG.conversation.maxTitleLength).trim()
              : undefined;
            
            try {
              const updateBody: { messages: UIMsg[]; title?: string } = { messages: currentMsgs };
              // Only update title if we just created the conversation (to replace "New chat")
              if (newTitle && (pendingConversationId.current === cid || isCreatingConversation.current)) {
                updateBody.title = newTitle;
              }
              
              const res = await fetch(`${APP_CONFIG.api.baseUrl}/conversations/${cid}`, {
                method: 'PATCH',
                credentials: APP_CONFIG.api.credentials,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updateBody),
              });
              if (!res.ok) {
                console.error('[appendMessages] Retry failed to save messages:', res.status);
              } else {
                console.log('[appendMessages] Retry successfully saved', currentMsgs.length, 'messages', newTitle ? `with title: ${newTitle}` : '');
                // Refresh sidebar to show updated title
                setSidebarReloadKey((k) => k + 1);
              }
            } catch (err) {
              console.error('[appendMessages] Retry error saving messages:', err);
            }
          }
        }, 200);
      }
      
      // Clear the creation flags after messages are appended (streaming is complete)
      // This allows the loader to run normally for future conversation switches
      isCreatingConversation.current = false;
      pendingConversationId.current = null;
    },
    [conversationId],
  );

  /** Save current chat (explicit) */
  const saveCurrentChatIfNeeded = useCallback(async () => {
    if (!conversationId) return;
    try {
      await fetch(`${APP_CONFIG.api.baseUrl}/conversations/${conversationId}`, {
        method: 'PATCH',
        credentials: APP_CONFIG.api.credentials,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: msgs }),
      });
    } catch (err) {
      console.warn('[useConversation] saveCurrentChatIfNeeded failed:', err);
    }
  }, [conversationId, msgs]);

  /** Reset local chat */
  const resetToNewChat = useCallback(() => {
    resetLocal();
    // Clear the URL parameter
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
  };
}

function genId() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
}
