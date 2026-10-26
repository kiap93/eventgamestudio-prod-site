/**
 * API Client & Endpoint URL Utilities
 */

export const DEFAULT_API_PLACEHOLDER = 'https://YOUR-NEW-API-URL';

export function isPlaceholderUrl(url?: string | null): boolean {
  if (!url || typeof url !== 'string') return true;
  const trimmed = url.trim().toLowerCase();
  if (trimmed === '' || trimmed === 'https://your-new-api-url' || trimmed.includes('your-new-api-url')) {
    return true;
  }
  return false;
}

export function getApiBaseUrl(): string {
  let candidate: string | undefined;

  if (typeof window !== 'undefined') {
    const runtimeEnv = (window as any).__ENV__;
    if (runtimeEnv) {
      candidate = runtimeEnv.VITE_API_BASE_URL || runtimeEnv.API_BASE_URL;
    }
  }

  if (!candidate && typeof import.meta !== 'undefined' && import.meta.env) {
    candidate = import.meta.env.VITE_API_BASE_URL;
  }

  if (!candidate || isPlaceholderUrl(candidate)) {
    return '';
  }

  // Strip trailing slashes
  let cleanUrl = candidate.trim().replace(/\/+$/, '');

  // If base url ends with /api, strip it so buildApiUrl will not duplicate /api
  if (cleanUrl.toLowerCase().endsWith('/api')) {
    cleanUrl = cleanUrl.slice(0, -4);
  }

  return cleanUrl;
}

export function buildApiUrl(path: string): string {
  if (!path) return '';

  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }

  const base = getApiBaseUrl();
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;

  if (!base) {
    return normalizedPath;
  }

  return `${base}${normalizedPath}`;
}

export function migrateLegacyAppToken(): void {
  if (typeof window === 'undefined' || !window.localStorage) return;

  try {
    const legacyToken = localStorage.getItem('durian_app_token');
    if (legacyToken) {
      if (!localStorage.getItem('app_token')) {
        localStorage.setItem('app_token', legacyToken);
      }
      localStorage.removeItem('durian_app_token');
    }
  } catch (err) {
    // Ignore storage errors in restricted contexts
  }
}

export async function apiFetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  let url: string | URL | Request = input;

  if (typeof input === 'string') {
    url = buildApiUrl(input);
  }

  // If url is a relative string path and running in an environment without implicit origin (e.g. tests)
  if (typeof url === 'string' && url.startsWith('/')) {
    if (typeof window !== 'undefined' && window.location && window.location.origin && window.location.origin !== 'null') {
      url = `${window.location.origin}${url}`;
    } else {
      url = `http://localhost:3000${url}`;
    }
  }

  const headers = new Headers(init?.headers);

  try {
    const storage = typeof window !== 'undefined' && window.localStorage ? window.localStorage : (typeof localStorage !== 'undefined' ? localStorage : null);
    const session = typeof window !== 'undefined' && window.sessionStorage ? window.sessionStorage : (typeof sessionStorage !== 'undefined' ? sessionStorage : null);
    const token =
      storage?.getItem('app_token') ||
      session?.getItem('app_token') ||
      storage?.getItem('auth_token') ||
      session?.getItem('auth_token');
    if (token && !headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${token}`);
    }

    const activeOrgId = storage?.getItem('active_org_id') || session?.getItem('active_org_id');
    if (activeOrgId && !headers.has('x-organization-id')) {
      headers.set('x-organization-id', activeOrgId);
    }
  } catch {
    // Ignore storage access errors
  }

  return fetch(url, {
    ...init,
    credentials: init?.credentials ?? 'include',
    headers,
  });
}
