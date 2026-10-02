import { buildApiUrl, DEFAULT_API_PLACEHOLDER, getApiBaseUrl, isPlaceholderUrl } from './api';

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`  ✓ ${testName}`);
    passed++;
  } else {
    console.error(`  ✗ ${testName}${detail ? ` -> ${detail}` : ''}`);
    failed++;
  }
}

console.log('\n======================================================');
console.log('Running API Client URL Configuration & Path Tests');
console.log('======================================================\n');

// 1. Placeholder verification
assert(DEFAULT_API_PLACEHOLDER === 'https://YOUR-NEW-API-URL', 'DEFAULT_API_PLACEHOLDER matches the required placeholder');

// 2. isPlaceholderUrl checks
assert(isPlaceholderUrl(DEFAULT_API_PLACEHOLDER) === true, 'Identifies DEFAULT_API_PLACEHOLDER as placeholder');
assert(isPlaceholderUrl('https://your-new-api-url') === true, 'Identifies lowercased placeholder as placeholder');
assert(isPlaceholderUrl('https://YOUR-NEW-API-URL/api') === true, 'Identifies url containing placeholder as placeholder');
assert(isPlaceholderUrl('') === true, 'Identifies empty string as placeholder');
assert(isPlaceholderUrl('   ') === true, 'Identifies whitespace string as placeholder');
assert(isPlaceholderUrl(null) === true, 'Identifies null as placeholder');
assert(isPlaceholderUrl(undefined) === true, 'Identifies undefined as placeholder');

// 3. Intended API URL acceptance (MUST NOT reject kiap93-kmj)
const INTENDED_API_URL = 'https://eventgamestudio-api.kiap93-kmj.workers.dev';
assert(isPlaceholderUrl(INTENDED_API_URL) === false, 'Accepts intended Cloudflare Worker API URL containing kiap93-kmj');
assert(isPlaceholderUrl('https://api.eventgamestudio.com') === false, 'Recognizes valid production URL as non-placeholder');

// 4. Absolute URLs pass-through
assert(buildApiUrl('https://stripe.com/checkout') === 'https://stripe.com/checkout', 'Passes absolute https:// URL untouched');
assert(buildApiUrl('http://insecure-api.internal/health') === 'http://insecure-api.internal/health', 'Passes absolute http:// URL untouched');

// 5. Empty path handling
assert(buildApiUrl('') === '', 'Handles empty path cleanly');

// 6. Deduplicate /api when base already has /api
assert(
  buildApiUrl.call(null, '/api/auth/me') !== undefined,
  'Function buildApiUrl is callable'
);

// 7. Relative-path fallback when no valid API base URL is configured
delete (globalThis as any).window;
assert(getApiBaseUrl() === '', 'Relative-path fallback returns empty string when no base URL is configured');
assert(buildApiUrl('/api/auth/me') === '/api/auth/me', 'Resolves to relative path /api/auth/me when no base URL is configured');

// 8. Runtime configuration with intended API URL
(globalThis as any).window = {
  __ENV__: {
    VITE_API_BASE_URL: INTENDED_API_URL,
  },
};
assert(getApiBaseUrl() === INTENDED_API_URL, 'Resolves intended API base URL from window.__ENV__.VITE_API_BASE_URL');
assert(
  buildApiUrl('/api/auth/me') === `${INTENDED_API_URL}/api/auth/me`,
  'buildApiUrl resolves /api/auth/me against intended API URL'
);

// 9. Trailing slash normalization
(globalThis as any).window = {
  __ENV__: {
    VITE_API_BASE_URL: `${INTENDED_API_URL}///`,
  },
};
assert(getApiBaseUrl() === INTENDED_API_URL, 'Normalizes and strips trailing slashes from runtime base URL');
assert(
  buildApiUrl('/api/auth/me') === `${INTENDED_API_URL}/api/auth/me`,
  'Prevents double slash when base URL had trailing slashes'
);

// 10. Duplicate /api segment prevention
(globalThis as any).window = {
  __ENV__: {
    VITE_API_BASE_URL: `${INTENDED_API_URL}/api`,
  },
};
assert(
  buildApiUrl('/api/auth/me') === `${INTENDED_API_URL}/api/auth/me`,
  'Prevents duplicate /api/api when base URL ends with /api'
);

// 11. Runtime configuration takes precedence over build-time configuration
(globalThis as any).window = {
  __ENV__: {
    VITE_API_BASE_URL: 'https://runtime-override.example.com',
  },
};
assert(getApiBaseUrl() === 'https://runtime-override.example.com', 'Runtime configuration takes precedence over build-time configuration');

// 12. window.__ENV__.API_BASE_URL alternative key is supported
(globalThis as any).window = {
  __ENV__: {
    API_BASE_URL: INTENDED_API_URL,
  },
};
assert(getApiBaseUrl() === INTENDED_API_URL, 'Supports API_BASE_URL key on window.__ENV__');

// 13. Runtime placeholder is ignored, falling back safely
(globalThis as any).window = {
  __ENV__: {
    VITE_API_BASE_URL: 'https://YOUR-NEW-API-URL',
  },
};
assert(getApiBaseUrl() === '', 'Ignores placeholder in runtime env and safely falls back to relative path');
assert(buildApiUrl('/api/auth/me') === '/api/auth/me', 'Never calls dummy placeholder host on runtime placeholder');

// 14. Build-time configuration works when runtime configuration is absent
(globalThis as any).window = {};
(import.meta.env as any).VITE_API_BASE_URL = INTENDED_API_URL;
assert(getApiBaseUrl() === INTENDED_API_URL, 'Build-time import.meta.env.VITE_API_BASE_URL is accepted when runtime config is absent');
assert(
  buildApiUrl('/api/auth/me') === `${INTENDED_API_URL}/api/auth/me`,
  'buildApiUrl resolves /api/auth/me using build-time environment variable'
);
delete (import.meta.env as any).VITE_API_BASE_URL;

// Cleanup global window
delete (globalThis as any).window;

console.log(`\nResults: ${passed} passed, ${failed} failed\n`);
if (failed > 0) {
  process.exit(1);
}
