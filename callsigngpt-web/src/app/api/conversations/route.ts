import { NextResponse } from 'next/server';
import { z } from 'zod';
import { APP_CONFIG, UI_TEXT } from '@/config/uiText';
import { supabaseServer } from '@/lib/supabaseServer';

type AnyMessage = { role?: string; content?: string | null };
const MAX_TITLE_LENGTH = APP_CONFIG.conversation.maxTitleLength ?? 80;
const PLACEHOLDER_TITLE = UI_TEXT.app.newChatTitle.toLowerCase();
const MAX_MESSAGES = 200;
const MAX_MESSAGE_LENGTH = 4000;
const getBearerToken = (req: Request) => {
  const auth = req.headers.get('authorization') || '';
  return auth.startsWith('Bearer ') ? auth.slice('Bearer '.length) : null;
};

function deriveTitle(
  messages: AnyMessage[] | undefined,
  fallback: string = UI_TEXT.app.newChatTitle,
) {
  if (!Array.isArray(messages)) return fallback;
  const firstUser = messages.find(
    (m) =>
      (m?.role ?? '').toLowerCase() === 'user' &&
      Boolean((m?.content ?? '').toString().trim()),
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
  return deriveTitle(messages, UI_TEXT.app.newChatTitle);
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const sb = await supabaseServer();
  const token = getBearerToken(req);
  const { data: { user } = { user: null } } = token
    ? await sb.auth.getUser(token)
    : await sb.auth.getUser();

  if (!user) {
    return NextResponse.json({ conversations: [] }, { status: 200 });
  }

  const { data, error } = await sb
    .from('conversations')
    .select('id,title,model,updated_at,created_at')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false });

  if (error) {
    return NextResponse.json(
      { conversations: [], error: error.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ conversations: data ?? [] }, { status: 200 });
}

export async function POST(req: Request) {
  const sb = await supabaseServer();
  const token = getBearerToken(req);
  const { data: { user } = { user: null } } = token
    ? await sb.auth.getUser(token)
    : await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const bodySchema = z.object({
    title: z.string().optional(),
    model: z.string().trim().max(200).optional(),
    messages: z
      .array(
        z.object({
          role: z.string().trim().max(20).optional(),
          content: z
            .union([z.string().max(MAX_MESSAGE_LENGTH), z.null()])
            .optional(),
        }),
      )
      .max(MAX_MESSAGES)
      .optional(),
  });

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const { title, model, messages = [] } = parsed.data;
  const normalizedMessages: AnyMessage[] = Array.isArray(messages)
    ? messages.map((m) => ({
        role: (m.role ?? '').toString().slice(0, 20),
        content: typeof m.content === 'string' ? m.content.slice(0, MAX_MESSAGE_LENGTH) : null,
      }))
    : [];
  const finalTitle = pickTitle(
    typeof title === 'string' ? title : undefined,
    normalizedMessages,
  );

  const { data, error } = await sb
    .from('conversations')
    .insert({
      user_id: user.id,
      title: finalTitle,
      model,
      messages: normalizedMessages,
    })
    .select('id,title,model,updated_at,created_at')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ conversation: data }, { status: 200 });
}

/** NEW: clear all conversations for the current user */
export async function DELETE(req: Request) {
  const sb = await supabaseServer();
  const token = getBearerToken(req);
  const { data: { user } = { user: null } } = token
    ? await sb.auth.getUser(token)
    : await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { error } = await sb.from('conversations').delete().eq('user_id', user.id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}
