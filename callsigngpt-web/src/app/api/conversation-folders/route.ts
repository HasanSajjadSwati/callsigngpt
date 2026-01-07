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

export async function GET(req: Request) {
  const sb = await supabaseServer();
  const token = getBearerToken(req);
  const { data: { user } = { user: null } } = token
    ? await sb.auth.getUser(token)
    : await sb.auth.getUser();

  if (!user) {
    return NextResponse.json({ folders: [] }, { status: 200 });
  }

  const { data, error } = await sb
    .from('conversation_folders')
    .select('id,name,sort_order,created_at,updated_at')
    .eq('user_id', user.id)
    .order('sort_order', { ascending: true })
    .order('updated_at', { ascending: false });

  if (error) {
    return NextResponse.json({ folders: [], error: error.message }, { status: 500 });
  }

  return NextResponse.json({ folders: data ?? [] }, { status: 200 });
}

export async function POST(req: Request) {
  const sb = await supabaseServer();
  const token = getBearerToken(req);
  const { data: { user } = { user: null } } = token
    ? await sb.auth.getUser(token)
    : await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const bodySchema = z.object({
    name: z.string().trim().min(1).max(MAX_FOLDER_NAME),
    sortOrder: z.number().int().optional(),
    sort_order: z.number().int().optional(),
  });

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const sortOrder = parsed.data.sortOrder ?? parsed.data.sort_order;
  const insertPayload: Record<string, any> = {
    user_id: user.id,
    name: parsed.data.name.trim(),
  };
  if (sortOrder !== undefined) insertPayload.sort_order = sortOrder;

  const { data, error } = await sb
    .from('conversation_folders')
    .insert(insertPayload)
    .select('id,name,sort_order,created_at,updated_at')
    .single();

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'Folder already exists' }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ folder: data }, { status: 200 });
}
