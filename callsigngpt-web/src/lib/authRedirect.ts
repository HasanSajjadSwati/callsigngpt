const normalizePath = (path: string) => {
  if (!path) return '/';
  return path.startsWith('/') ? path : `/${path}`;
};

export function getAuthRedirectUrl(path = '/') {
  const normalizedPath = normalizePath(path);
  const envBase = (process.env.NEXT_PUBLIC_SITE_URL || '').trim().replace(/\/$/, '');

  if (envBase) {
    return `${envBase}${normalizedPath}`;
  }

  if (typeof window !== 'undefined' && window.location.origin) {
    return `${window.location.origin}${normalizedPath}`;
  }

  return undefined;
}