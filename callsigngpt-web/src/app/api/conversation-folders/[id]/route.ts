import { NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseServer } from '@/lib/supabaseServer';

const MAX_FOLDER_NAME = 60;
const getBearerToken = (req: Request) => {
  const auth = req.headers.get('authorization') || '';
  return auth.startsWith('Bearer ') ? auth.slice('Bearer '.length) : null;
};

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type IdParams = { id: string };

export async function PATCH(
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

  const bodySchema = z.object({
    name: z.string().trim().min(1).max(MAX_FOLDER_NAME).optional(),
    sortOrder: z.number().int().optional(),
    sort_order: z.number().int().optional(),
  });

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const updates: Record<string, any> = {};
  if (typeof parsed.data.name === 'string') {
    updates.name = parsed.data.name.trim();
  }
  if (parsed.data.sortOrder !== undefined || parsed.data.sort_order !== undefined) {
    updates.sort_order = parsed.data.sortOrder ?? parsed.data.sort_order;
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No changes provided' }, { status: 400 });
  }

  const { data: existing, error: readErr } = await sb
    .from('conversation_folders')
    .select('id,user_id')
    .eq('id', id)
    .single();

  if (readErr) return NextResponse.json({ error: readErr.message }, { status: 404 });
  if (existing.user_id !== user.id) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const { error: updErr } = await sb
    .from('conversation_folders')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });
  return NextResponse.json({ ok: true }, { status: 200 });
}

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
    .from('conversation_folders')
    .select('id,user_id')
    .eq('id', id)
    .single();

  if (readErr) return NextResponse.json({ error: readErr.message }, { status: 404 });
  if (existing.user_id !== user.id) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const { error: delErr } = await sb.from('conversation_folders').delete().eq('id', id);
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });

  return NextResponse.json({ ok: true }, { status: 200 });
}
