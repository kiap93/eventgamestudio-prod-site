/**
 * Centralized API client helper for sending requests to the Cloudflare Worker API.
 * Base URL defaults to VITE_API_BASE_URL or https://eventgamestudio-api.kiap93-kmj.workers.dev
 */

export const getApiBaseUrl = (): string => {
  let url = import.meta.env.VITE_API_BASE_URL;
  if (!url || typeof url !== 'string' || url.trim() === '') {
    // If in the browser and running in local dev or container preview, use relative URL to route to server.ts
    if (typeof window !== 'undefined' && window.location?.origin) {
      const hostname = window.location.hostname;
      if (
        hostname === 'localhost' ||
        hostname === '127.0.0.1' ||
        hostname === '0.0.0.0' ||
        window.location.port === '3000' ||
        hostname.includes('aistudio') ||
        hostname.includes('googleusercontent.com')
      ) {
        return '';
      }
    }
    url = 'https://eventgamestudio-api.kiap93-kmj.workers.dev';
  } else {
    url = url.trim();
  }

  if (url && !url.startsWith('http://') && !url.startsWith('https://')) {
    if (url.startsWith('//')) {
      url = `https:${url}`;
    } else {
      url = `https://${url}`;
    }
  }

  return url.replace(/\/+$/, '');
};

export const API_BASE_URL = getApiBaseUrl();

/**
 * Sends an HTTP request to the Cloudflare Worker API.
 *
 * @param path The endpoint path (e.g., '/api/themes') or full URL
 * @param options Standard fetch RequestInit options
 * @returns Promise<Response>
 */
export async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const baseUrl = getApiBaseUrl();
  let fullUrl: string;

  if (path.startsWith('http://') || path.startsWith('https://')) {
    fullUrl = path;
  } else {
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    fullUrl = `${baseUrl}${cleanPath}`;
  }

  const headers = new Headers(options.headers || {});

  // 1. Automatic Authorization header from localStorage if available and not explicitly provided
  if (!headers.has('Authorization')) {
    const token = localStorage.getItem('app_token') || localStorage.getItem('durian_app_token');
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
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
    headers,
    body,
  });
}

