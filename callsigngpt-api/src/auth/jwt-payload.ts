// src/auth/jwt-payload.ts

/**
 * Shape of a Supabase JWT payload.
 *
 * Supabase issues JWTs (HS256) where `sub` is the user ID.
 * Additional claims can be present (like email, role, etc.).
 */
export type JwtPayload = {
  sub: string;        // Supabase user UUID
  email?: string;     // optional email if claim is included
  role?: string;      // Supabase role (e.g. authenticated)
  exp?: number;       // expiration timestamp
  iat?: number;       // issued at
  // add other custom claims if you configure them in Supabase
};
