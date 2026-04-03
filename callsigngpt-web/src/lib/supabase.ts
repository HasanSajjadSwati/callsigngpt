'use client';

import { createBrowserClient } from '@supabase/ssr';

// Fallbacks prevent @supabase/ssr from throwing during Next.js static build
// when env vars are unavailable. No real Supabase calls happen at build time.
export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder',
);
