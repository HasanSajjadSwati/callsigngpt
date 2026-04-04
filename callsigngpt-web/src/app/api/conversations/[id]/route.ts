// /src/app/api/conversations/[id]/route.ts
import { NextResponse } from 'next/server';
import { APP_CONFIG, UI_TEXT } from '@/config/uiText';
import { supabaseServer } from '@/lib/supabaseServer';

type AnyAttachment = {
  type?: string;
  name?: string;
  mime?: string;
  size?: number;
  src?: string;
};
type AnyMessage = {
  id?: string;
  role?: string;
  content?: string | null;
  createdAt?: number | string | null;
  attachment?: AnyAttachment | null;
};
const MAX_TITLE_LENGTH = APP_CONFIG.conversation.maxTitleLength ?? 80;
const PLACEHOLDER_TITLE = UI_TEXT.app.newChatTitle.toLowerCase();
const getBearerToken = (req: Request) => {
  const auth = req.headers.get('authorization') || '';
  return auth.startsWith('Bearer ') ? auth.slice('Bearer '.length) : null;
};
async function ensureFolderAccess(sb: any, userId: string, folderId: string) {
  const { data, error } = await sb
    .from('conversation_folders')
    .select('id,user_id')
    .eq('id', folderId)
    .single();
  if (error || !data) return false;
  return data.user_id === userId;
}

function normalizeAttachment(raw: AnyAttachment | null | undefined) {
  if (!raw || typeof raw !== 'object') return undefined;
  const type = raw.type === 'image' || raw.type === 'file' ? raw.type : undefined;
  const name = typeof raw.name === 'string' ? raw.name.slice(0, 255) : '';
  if (!type || !name) return undefined;

  return {
    type,
    name,
    mime: typeof raw.mime === 'string' ? raw.mime.slice(0, 255) : '',
    size: typeof raw.size === 'number' && Number.isFinite(raw.size) ? raw.size : 0,
    ...(typeof raw.src === 'string' ? { src: raw.src } : {}),
  };
}

function normalizeMessage(raw: AnyMessage) {
  return {
    ...(typeof raw.id === 'string' ? { id: raw.id.slice(0, 255) } : {}),
    role: (raw.role ?? '').toString().slice(0, 20),
    content: typeof raw.content === 'string' ? raw.content.slice(0, 4000) : null,
    ...(raw.createdAt !== undefined && raw.createdAt !== null ? { createdAt: raw.createdAt } : {}),
    ...(normalizeAttachment(raw.attachment) ? { attachment: normalizeAttachment(raw.attachment) } : {}),
  };
}

function deriveTitle(messages: AnyMessage[] | undefined, fallback = UI_TEXT.app.newChatTitle) {
  if (!Array.isArray(messages)) return fallback;
  const firstUser = messages.find(
    (m) => (m?.role ?? '').toLowerCase() === 'user' && Boolean((m?.content ?? '').toString().trim()),
  );
  const raw = (firstUser?.content ?? '').toString().trim();
  if (!raw) return fallback;
  // Short summary: first 4 words, max 40 chars
  return raw.split(/\s+/).slice(0, 4).join(' ').slice(0, 40);
}

function pickTitle(provided?: string, messages?: AnyMessage[], fallback = UI_TEXT.app.newChatTitle) {
  const cleanProvided = (provided ?? '').trim();
  if (cleanProvided && cleanProvided.toLowerCase() !== PLACEHOLDER_TITLE) {
    return cleanProvided.slice(0, MAX_TITLE_LENGTH);
  }
  return deriveTitle(messages, fallback);
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type IdParams = { id: string };

// GET /api/conversations/:id  -> { conversation }
export async function GET(
  req: Request,
  ctx: { params: Promise<IdParams> } // <-- Next 15: params is async
) {
  const { id } = await ctx.params;     // <-- await it
  const sb = await supabaseServer();
  const token = getBearerToken(req);
  const { data: { user } = { user: null } } = token
    ? await sb.auth.getUser(token)
    : await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { data, error } = await sb
    .from('conversations')
    .select('id,title,model,folder_id,messages,updated_at,created_at,user_id')
    .eq('id', id)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  if (data.user_id !== user.id) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  return NextResponse.json({ conversation: data }, { status: 200 });
}

// PATCH /api/conversations/:id  body: { messages?, title?, model? } -> { ok: true }
export async function PATCH(
  req: Request,
  ctx: { params: Promise<IdParams> } // <-- async
) {
  const { id } = await ctx.params;     // <-- await it
  const sb = await supabaseServer();
  const token = getBearerToken(req);
  const { data: { user } = { user: null } } = token
    ? await sb.auth.getUser(token)
    : await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const updates: Record<string, any> = {};
  const providedTitle = typeof body.title === 'string' ? body.title : undefined;
  const messagesFromBody: AnyMessage[] | undefined = Array.isArray(body.messages) ? body.messages : undefined;
  const hasFolderKey = 'folderId' in body || 'folder_id' in body;
  const rawFolderId = body.folderId ?? body.folder_id;
  const folderId = typeof rawFolderId === 'string' ? rawFolderId.trim() : rawFolderId;
  if (messagesFromBody) updates.messages = messagesFromBody.map(normalizeMessage);
  if ('model' in body) updates.model = body.model;

  // ensure row exists & belongs to user
  const { data: existing, error: readErr } = await sb
    .from('conversations')
    .select('id,user_id,title')
    .eq('id', id)
    .single();

  if (readErr) return NextResponse.json({ error: readErr.message }, { status: 404 });
  if (existing.user_id !== user.id) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  if (providedTitle !== undefined) {
    updates.title = pickTitle(providedTitle, messagesFromBody, existing.title ?? UI_TEXT.app.newChatTitle);
  }
  // Never auto-derive title from messages on PATCH — title comes from
  // ensureConversation (placeholder) or generateTitle (LLM-generated).
  if (hasFolderKey) {
    if (typeof folderId === 'string' && folderId) {
      const ok = await ensureFolderAccess(sb, user.id, folderId);
      if (!ok) return NextResponse.json({ error: 'Invalid folder' }, { status: 400 });
      updates.folder_id = folderId;
    } else {
      updates.folder_id = null;
    }
  }

  const { error: updErr } = await sb
    .from('conversations')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });
  return NextResponse.json({ ok: true }, { status: 200 });
}

// (optional) DELETE /api/conversations/:id
export async function DELETE(
  req: Request,
  ctx: { params: Promise<IdParams> }
) {
  const { id } = await ctx.params;
  const sb = await supabaseServer();

  const token = getBearerToken(req);
  const { data: { user } = { user: null } } = token
    ? await sb.auth.getUser(token)
    : await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { data: existing, error: readErr } = await sb
    .from('conversations')
    .select('id,user_id')
    .eq('id', id)
    .single();

  if (readErr) return NextResponse.json({ error: readErr.message }, { status: 404 });
  if (existing.user_id !== user.id) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const { error: delErr } = await sb.from('conversations').delete().eq('id', id);
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });

  return NextResponse.json({ ok: true }, { status: 200 });
}
