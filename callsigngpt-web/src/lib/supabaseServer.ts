// src/lib/supabaseServer.ts
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';

export async function supabaseServer() {
  // `cookies()` must be awaited in Next.js 15+
  const cookieStore = await cookies();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    throw new Error('Supabase env vars are missing (NEXT_PUBLIC_SUPABASE_URL/ANON_KEY)');
  }

  return createServerClient(
    url,
    anon,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set() {
          // no-op — Next.js 15 cookies() store is read-only in route handlers
        },
        remove() {
          // no-op — same as above
        },
      },
    },
  );
}
