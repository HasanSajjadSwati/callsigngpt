import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const getBearerToken = (req: Request) => {
  const auth = req.headers.get('authorization') || '';
  return auth.startsWith('Bearer ') ? auth.slice('Bearer '.length) : null;
};

export async function POST(req: Request) {
  // Identify the user via the cookie-based server client or Bearer token
  const sb = await supabaseServer();
  const token = getBearerToken(req);
  const { data: { user } = { user: null } } = token
    ? await sb.auth.getUser(token)
    : await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  // Step 1: Null out folder_id on conversations so FK doesn't block folder delete
  const { error: unlinkErr } = await sb
    .from('conversations')
    .update({ folder_id: null })
    .eq('user_id', user.id);
  if (unlinkErr) {
    console.error('[clear] Failed to unlink folders:', unlinkErr);
  }

  // Step 2: Delete all conversations for the user
  const { data: deletedConvos, error: convError } = await sb
    .from('conversations')
    .delete()
    .eq('user_id', user.id)
    .select('id');
  if (convError) {
    console.error('[clear] Failed to delete conversations:', convError);
    return NextResponse.json({ error: convError.message }, { status: 500 });
  }

  // Step 3: Delete all conversation folders for the user
  const { data: deletedFolders, error: folderError } = await sb
    .from('conversation_folders')
    .delete()
    .eq('user_id', user.id)
    .select('id');
  if (folderError) {
    console.error('[clear] Failed to delete folders:', folderError);
    return NextResponse.json({ error: folderError.message }, { status: 500 });
  }

  console.log(`[clear] Deleted ${deletedConvos?.length ?? 0} conversations, ${deletedFolders?.length ?? 0} folders for user ${user.id}`);

  return NextResponse.json({
    ok: true,
    deletedConversations: deletedConvos?.length ?? 0,
    deletedFolders: deletedFolders?.length ?? 0,
  }, { status: 200 });
}
