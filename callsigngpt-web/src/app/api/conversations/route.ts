import { NextResponse } from 'next/server';
import { APP_CONFIG, UI_TEXT } from '@/config/uiText';
import { supabaseServer } from '@/lib/supabaseServer';

type AnyMessage = { role?: string; content?: string | null };
const MAX_TITLE_LENGTH = APP_CONFIG.conversation.maxTitleLength ?? 80;
const PLACEHOLDER_TITLE = UI_TEXT.app.newChatTitle.toLowerCase();

function deriveTitle(messages: AnyMessage[] | undefined, fallback = UI_TEXT.app.newChatTitle) {
  if (!Array.isArray(messages)) return fallback;
  const firstUser = messages.find(
    (m) => (m?.role ?? '').toLowerCase() === 'user' && Boolean((m?.content ?? '').toString().trim()),
  );
  const raw = (firstUser?.content ?? '').toString().trim();
  if (!raw) return fallback;
  return raw.slice(0, MAX_TITLE_LENGTH);
}

function pickTitle(provided: string | undefined, messages?: AnyMessage[]) {
  const cleanProvided = (provided ?? '').trim();
  if (cleanProvided && cleanProvided.toLowerCase() !== PLACEHOLDER_TITLE) {
    return cleanProvided.slice(0, MAX_TITLE_LENGTH);
  }
  return deriveTitle(messages, cleanProvided || UI_TEXT.app.newChatTitle);
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const sb = await supabaseServer();
  const { data: { user } = { user: null } } = await sb.auth.getUser();

  if (!user) {
    return NextResponse.json({ conversations: [] }, { status: 200 });
  }

  const { data, error } = await sb
    .from('conversations')
    .select('id,title,model,updated_at,created_at')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false });

  if (error) {
    return NextResponse.json({ conversations: [], error: error.message }, { status: 500 });
  }

  return NextResponse.json({ conversations: data ?? [] }, { status: 200 });
}

export async function POST(req: Request) {
  const sb = await supabaseServer();
  const { data: { user } = { user: null } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { title, model, messages = [] } = await req.json();
  const normalizedMessages: AnyMessage[] = Array.isArray(messages) ? messages : [];
  const finalTitle = pickTitle(typeof title === 'string' ? title : undefined, normalizedMessages);

  const { data, error } = await sb
    .from('conversations')
    .insert({ user_id: user.id, title: finalTitle, model, messages: normalizedMessages })
    .select('id,title,model,updated_at,created_at')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ conversation: data }, { status: 200 });
}

/** NEW: clear all conversations for the current user */
export async function DELETE() {
  const sb = await supabaseServer();
  const { data: { user } = { user: null } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { error } = await sb.from('conversations').delete().eq('user_id', user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true }, { status: 200 });
}
