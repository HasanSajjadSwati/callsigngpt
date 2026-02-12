// /api/conversations/[id]/generate-title
// Generates a short, ChatGPT-style title for a conversation using the LLM.
import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';
import { APP_CONFIG } from '@/config/uiText';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TITLE_MODEL = process.env.TITLE_GENERATION_MODEL || 'basic:gpt-4o-mini';
const MAX_TITLE_LENGTH = APP_CONFIG.conversation.maxTitleLength ?? 80;

const getBearerToken = (req: Request) => {
  const auth = req.headers.get('authorization') || '';
  return auth.startsWith('Bearer ') ? auth.slice('Bearer '.length) : null;
};

/**
 * Truncate content to avoid sending huge payloads for title generation.
 * We only need the gist of the conversation.
 */
function truncateContent(content: string, max = 500): string {
  if (!content) return content;
  // Strip internal protocol markers (e.g. search status chunks that may have leaked into stored messages)
  const cleaned = content.replace(/\[{3}SEARCH_STATUS\]{3}[^\n]*/g, '').trim();
  if (cleaned.length <= max) return cleaned;
  return cleaned.slice(0, max) + '…';
}

type IdParams = { id: string };

export async function POST(
  req: Request,
  ctx: { params: Promise<IdParams> },
) {
  const { id } = await ctx.params;
  const sb = await supabaseServer();
  const token = getBearerToken(req);
  const { data: { user } = { user: null } } = token
    ? await sb.auth.getUser(token)
    : await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  // Fetch the conversation
  const { data: convo, error: readErr } = await sb
    .from('conversations')
    .select('id, user_id, title, messages')
    .eq('id', id)
    .single();

  if (readErr || !convo) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (convo.user_id !== user.id) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const messages: { role: string; content: string }[] = Array.isArray(convo.messages)
    ? convo.messages
    : [];

  // Find the first user message and the first assistant reply
  const firstUser = messages.find((m) => m.role === 'user' && m.content?.trim());
  const firstAssistant = messages.find((m) => m.role === 'assistant' && m.content?.trim());

  if (!firstUser) {
    return NextResponse.json({ title: convo.title || 'New chat' }, { status: 200 });
  }

  // Build a prompt for title generation
  const snippet = [
    `User: ${truncateContent(firstUser.content)}`,
    firstAssistant ? `Assistant: ${truncateContent(firstAssistant.content)}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  const titlePrompt = [
    {
      role: 'system' as const,
      content:
        'You are a conversation title generator. Given the beginning of a conversation, generate a short, descriptive title (3-8 words max). ' +
        'The title should capture the main topic or intent. Do NOT use quotes, punctuation at the end, or the word "Title:". ' +
        'Just output the title text and nothing else.',
    },
    {
      role: 'user' as const,
      content: `Generate a short title for this conversation:\n\n${snippet}`,
    },
  ];

  // Call the NestJS /chat API for title generation
  const apiBase = (process.env.NEXT_PUBLIC_API_URL || '').trim().replace(/\/$/, '');
  const chatUrl = apiBase
    ? `${apiBase}/chat`
    : `http://localhost:${process.env.API_PORT || '3001'}/chat`;

  try {
    const chatRes = await fetch(chatUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token || ''}`,
      },
      body: JSON.stringify({
        model: TITLE_MODEL,
        messages: titlePrompt,
        temperature: 0.3,
        max_tokens: 30,
        stream: false,
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!chatRes.ok) {
      // Fallback: just use first user message truncated
      const fallbackTitle = firstUser.content.trim().slice(0, MAX_TITLE_LENGTH);
      return NextResponse.json({ title: fallbackTitle }, { status: 200 });
    }

    // The /chat endpoint uses SSE — parse the streamed response
    const sseText = await chatRes.text();
    let generatedTitle = '';

    for (const line of sseText.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data: ')) continue;
      const payload = trimmed.slice(6);
      if (payload === '[DONE]') break;
      try {
        const parsed = JSON.parse(payload);
        const content = parsed?.choices?.[0]?.delta?.content;
        if (typeof content === 'string') {
          generatedTitle += content;
        }
        // Also handle error responses
        if (parsed?.error) {
          break;
        }
      } catch {
        // skip invalid SSE frames
      }
    }

    // Clean up the generated title
    let title = generatedTitle
      .trim()
      .replace(/^["']+|["']+$/g, '') // strip wrapping quotes
      .replace(/[.!?]+$/, '')        // strip trailing punctuation
      .trim();

    if (!title || title.length < 2) {
      title = truncateContent(firstUser.content, MAX_TITLE_LENGTH);
    } else {
      title = title.slice(0, MAX_TITLE_LENGTH);
    }

    // Save the generated title
    await sb
      .from('conversations')
      .update({ title, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', user.id);

    return NextResponse.json({ title }, { status: 200 });
  } catch (err) {
    // On any failure, fall back to truncated first message
    const fallbackTitle = firstUser.content.trim().slice(0, MAX_TITLE_LENGTH);
    return NextResponse.json({ title: fallbackTitle }, { status: 200 });
  }
}
