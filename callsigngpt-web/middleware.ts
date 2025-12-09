import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(_req: NextRequest) {
  const res = NextResponse.next();
  // Light security headers; keep CSP permissive to avoid breaking provider calls.
  res.headers.set(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "connect-src 'self' ws: wss: https://*.supabase.co https://*.supabase.in https://api.openai.com https://api.anthropic.com https://api.mistral.ai https://api.deepseek.com https://api.together.xyz https://generativelanguage.googleapis.com",
      "img-src 'self' data: blob:",
      "style-src 'self' 'unsafe-inline'",
      "script-src 'self'",
      "font-src 'self' data:",
    ].join('; '),
  );
  res.headers.set('Referrer-Policy', 'same-origin');
  res.headers.set('X-Content-Type-Options', 'nosniff');
  res.headers.set('X-Frame-Options', 'SAMEORIGIN');
  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
