let cachedBase: string | null = null;

/**
 * Resolve the API base URL.
 * - Prefer NEXT_PUBLIC_API_URL
 * - Otherwise, when in browser, swap port 3000 -> 3001 for colocated API
 * - Returns '' if unknown (caller can treat as same-origin)
 */
export function getApiBase(): string {
  if (cachedBase !== null) return cachedBase;

  const envBase = (process.env.NEXT_PUBLIC_API_URL || '').trim();
  if (envBase) {
    cachedBase = envBase.replace(/\/$/, '');
    return cachedBase;
  }

  if (typeof window !== 'undefined' && window.location?.origin) {
    cachedBase = window.location.origin.replace(/:3000$/, ':3001').replace(/\/$/, '');
    return cachedBase;
  }

  cachedBase = '';
  return cachedBase;
}
