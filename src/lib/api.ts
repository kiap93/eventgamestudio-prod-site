/**
 * Centralized API client helper for sending requests to the EventGameStudio API.
 * Base URL is driven by VITE_API_BASE_URL as the single source of truth.
 */

export const DEFAULT_API_PLACEHOLDER = 'https://YOUR-NEW-API-URL';

/**
 * Checks whether a given URL is undefined, empty, or a dummy template placeholder
 * (e.g. 'https://YOUR-NEW-API-URL').
 */
export const isPlaceholderUrl = (url?: string | null): boolean => {
  if (!url || typeof url !== 'string') return true;
  const trimmed = url.trim().toLowerCase();
  return (
    trimmed === '' ||
    trimmed === DEFAULT_API_PLACEHOLDER.toLowerCase() ||
    trimmed.includes('your-new-api-url') ||
    trimmed === 'undefined' ||
    trimmed === 'null'
  );
};

/**
 * Resolves the authoritative API base URL:
 * 1. Checks runtime environment injected by Cloudflare Worker or Express (window.__ENV__.VITE_API_BASE_URL / API_BASE_URL).
 *    This allows variables configured directly in Cloudflare Worker environment variables or secrets
 *    to be immediately captured without requiring a frontend static bundle rebuild.
 * 2. Checks build-time Vite environment variable (import.meta.env.VITE_API_BASE_URL).
 * 3. If neither is set, or if set to a dummy template placeholder (e.g. 'https://YOUR-NEW-API-URL'),
 *    falls back safely to empty string ('') for same-origin relative API pathing (/api/*).
 *    In Cloudflare Worker deployments, the frontend worker handles /api/* routes via run_worker_first.
 *    In local Express dev, requests are served or proxied seamlessly.
 */
export const getApiBaseUrl = (): string => {
  // 1. Runtime environment variables injected by Cloudflare Worker or server
  if (typeof window !== 'undefined') {
    const runtimeEnv = (window as any).__ENV__;
    const runtimeUrl = runtimeEnv?.VITE_API_BASE_URL || runtimeEnv?.API_BASE_URL;

    if (typeof runtimeUrl === 'string' && !isPlaceholderUrl(runtimeUrl)) {
      let url = runtimeUrl.trim();
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = url.startsWith('//') ? `https:${url}` : `https://${url}`;
      }
      return url.replace(/\/+$/, '');
    }
  }

  // 2. Build-time Vite environment variable
  const configuredUrl = import.meta.env.VITE_API_BASE_URL;
  if (typeof configuredUrl === 'string' && !isPlaceholderUrl(configuredUrl)) {
    let url = configuredUrl.trim();
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = url.startsWith('//') ? `https:${url}` : `https://${url}`;
    }
    return url.replace(/\/+$/, '');
  }

  // 3. Safe fallback: Always return relative path ('') rather than a dummy broken host
  return '';
};

/**
 * Resolves an API endpoint path against the authoritative API base URL.
 * Handles leading/trailing slashes, prevents duplicate '/api/api' segments,
 * and passes absolute URLs (http:// or https://) through untouched.
 */
export function buildApiUrl(path: string): string {
  if (!path) return '';
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }

  const baseUrl = getApiBaseUrl();
  const cleanPath = path.startsWith('/') ? path : `/${path}`;

  if (!baseUrl) {
    return cleanPath;
  }

  const cleanBase = baseUrl.replace(/\/+$/, '');

  // Avoid duplicate '/api' segment if baseUrl ends with '/api' and path begins with '/api/'
  if (cleanBase.endsWith('/api') && cleanPath.startsWith('/api/')) {
    return `${cleanBase}${cleanPath.slice(4)}`;
  }
  if (cleanBase.endsWith('/api') && cleanPath === '/api') {
    return cleanBase;
  }

  return `${cleanBase}${cleanPath}`;
}

export const API_BASE_URL = getApiBaseUrl();

/**
 * One-time clean migration: if a client still has legacy 'durian_app_token',
 * migrate it to 'app_token' (if not already set) and immediately remove the legacy key
 * so the application only interacts with 'app_token'.
 */
export function migrateLegacyAppToken(): void {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
  try {
    const legacyToken = localStorage.getItem('durian_app_token');
    if (legacyToken) {
      if (!localStorage.getItem('app_token')) {
        localStorage.setItem('app_token', legacyToken);
      }
      localStorage.removeItem('durian_app_token');
    }
  } catch {
    // Ignore storage access errors (e.g. sandboxed iframes)
  }
}

// Automatically execute on module load in browser environments
migrateLegacyAppToken();

/**
 * Sends an HTTP request to the Cloudflare Worker API.
 *
 * @param path The endpoint path (e.g., '/api/themes') or full URL
 * @param options Standard fetch RequestInit options
 * @returns Promise<Response>
 */
export async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const fullUrl = buildApiUrl(path);

  const headers = new Headers(options.headers || {});

  // 1. Automatic Authorization header from localStorage if available and not explicitly provided
  if (!headers.has('Authorization')) {
    const token = typeof localStorage !== 'undefined' ? localStorage.getItem('app_token') : null;
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
  }

  // 1b. Automatic Correlation ID propagation for client-to-server request tracing
  if (!headers.has('x-correlation-id') && !headers.has('x-request-id')) {
    try {
      const generatedId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `req-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      headers.set('x-correlation-id', generatedId);
    } catch {
      // ignore
    }
  }

  // 2. Body & Content-Type handling
  let body = options.body;

  if (body instanceof FormData) {
    // For FormData uploads, ensure Content-Type header is omitted so browser generates boundary
    headers.delete('Content-Type');
  } else if (
    body &&
    typeof body === 'object' &&
    !(body instanceof Blob) &&
    !(body instanceof ArrayBuffer) &&
    !(body instanceof URLSearchParams)
  ) {
    body = JSON.stringify(body);
    if (!headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }
  }

  return fetch(fullUrl, {
    ...options,
    credentials: options.credentials || 'include',
    headers,
    body,
  });
}

/**
 * Friendly error message formatter that displays reference ID when available,
 * ensuring users never see raw SQL or stack traces while having a traceable ID for support.
 */
export function formatApiErrorMessage(
  errData: any,
  fallbackMessage = 'An unexpected error occurred. Please try again.'
): string {
  if (!errData) return fallbackMessage;
  if (typeof errData === 'string') return errData;
  const msg = errData.error || errData.message || fallbackMessage;
  if (errData.requestId) {
    return `${msg} (Reference ID: ${errData.requestId.slice(0, 8)})`;
  }
  return msg;
}

