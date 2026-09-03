/**
 * Automated Unit Tests for CORS Whitelist Security Implementation
 * 
 * Test Scenarios:
 * 1. Allowed origin (matches first default origin)
 * 2. Second allowed origin (matches second configured origin)
 * 3. Unknown origin (non-whitelisted domain is rejected)
 * 4. Missing Origin (returns no Access-Control-Allow-Origin, no crash)
 * 5. OPTIONS preflight (validates allowed vs forbidden preflight requests)
 * 6. Credentials (ensures Access-Control-Allow-Credentials: true with exact origin and Vary: Origin)
 * 7. Multiple configured origins via ALLOWED_ORIGINS (comma-separated parsing)
 * 8. Production localhost protection (localhost rejected in production unless explicitly whitelisted)
 * 9. Never returns wildcard `*` with credentials or multiple origins in one header
 */

import {
  parseAllowedOrigins,
  isOriginAllowed,
  getCorsHeaders,
  DEFAULT_ALLOWED_ORIGINS,
} from './cors.js';

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

async function runCorsTests() {
  console.log('\n======================================================');
  console.log('Running CORS Whitelist Security & Header Tests');
  console.log('======================================================\n');

  // Test 1: Allowed Origin
  {
    console.log('[Test 1: Allowed Origin]');
    const origin = 'https://eventgamestudio.com';
    const allowed = isOriginAllowed(origin, { isProduction: true });
    assert(allowed === true, 'Allows primary default origin https://eventgamestudio.com in production');

    const headers = getCorsHeaders(origin, undefined, { isProduction: true });
    assert(headers['Access-Control-Allow-Origin'] === 'https://eventgamestudio.com', 'Returns exact matching Access-Control-Allow-Origin');
    assert(headers['Access-Control-Allow-Credentials'] === 'true', 'Sets Access-Control-Allow-Credentials to true');
    assert(headers['Vary'] === 'Origin', 'Sets Vary: Origin header');
  }

  // Test 2: Second Allowed Origin
  {
    console.log('\n[Test 2: Second Allowed Origin]');
    const origin = 'https://www.eventgamestudio.com';
    const allowed = isOriginAllowed(origin, { isProduction: true });
    assert(allowed === true, 'Allows second default origin https://www.eventgamestudio.com');

    const headers = getCorsHeaders(origin, undefined, { isProduction: true });
    assert(headers['Access-Control-Allow-Origin'] === 'https://www.eventgamestudio.com', 'Returns exact second origin in header');
    assert(headers['Access-Control-Allow-Credentials'] === 'true', 'Includes credentials header for second origin');
    assert(headers['Vary'] === 'Origin', 'Includes Vary: Origin header for second origin');
  }

  // Test 3: Unknown Origin
  {
    console.log('\n[Test 3: Unknown / Non-whitelisted Origin]');
    const evilOrigin = 'https://malicious-site.com';
    const allowed = isOriginAllowed(evilOrigin, { isProduction: true });
    assert(allowed === false, 'Rejects unknown origin https://malicious-site.com in production');

    const evilSubdomain = 'https://eventgamestudio.com.attacker.com';
    const evilSubAllowed = isOriginAllowed(evilSubdomain, { isProduction: true });
    assert(evilSubAllowed === false, 'Rejects spoofed suffix subdomain origin in production');

    const headers = getCorsHeaders(evilOrigin, undefined, { isProduction: true });
    assert(headers['Access-Control-Allow-Origin'] === undefined, 'Does NOT set Access-Control-Allow-Origin for untrusted origin');
    assert(headers['Access-Control-Allow-Credentials'] === undefined, 'Does NOT set Access-Control-Allow-Credentials for untrusted origin');
    assert(headers['Vary'] === undefined, 'Does NOT set Vary header when origin is not allowed');
  }

  // Test 4: Missing Origin Header
  {
    console.log('\n[Test 4: Missing / Null Origin]');
    const allowedNull = isOriginAllowed(null, { isProduction: true });
    assert(allowedNull === false, 'isOriginAllowed returns false for null');

    const allowedUndefined = isOriginAllowed(undefined, { isProduction: true });
    assert(allowedUndefined === false, 'isOriginAllowed returns false for undefined');

    const allowedStringNull = isOriginAllowed('null', { isProduction: true });
    assert(allowedStringNull === false, 'isOriginAllowed returns false for "null"');

    const headers = getCorsHeaders(undefined, undefined, { isProduction: true });
    assert(headers['Access-Control-Allow-Origin'] === undefined, 'No Access-Control-Allow-Origin set when origin is missing');
    assert(headers['Access-Control-Allow-Methods'] !== undefined, 'Still returns permitted HTTP methods');
  }

  // Test 5: OPTIONS Preflight Request
  {
    console.log('\n[Test 5: OPTIONS Preflight Handling]');
    const customReqHeaders = 'Content-Type, Authorization, X-Custom-Header';
    const allowedOrigin = 'https://app.eventgamestudio.com';
    const preflightHeaders = getCorsHeaders(allowedOrigin, customReqHeaders, { isProduction: true });

    assert(preflightHeaders['Access-Control-Allow-Origin'] === 'https://app.eventgamestudio.com', 'Preflight returns exact allowed origin');
    assert(preflightHeaders['Access-Control-Allow-Headers'] === customReqHeaders, 'Preflight reflects requested headers');
    assert(preflightHeaders['Access-Control-Max-Age'] === '86400', 'Preflight includes Access-Control-Max-Age');
    assert(preflightHeaders['Access-Control-Allow-Methods'].includes('GET') && preflightHeaders['Access-Control-Allow-Methods'].includes('OPTIONS'), 'Preflight permits standard REST verbs');

    // Forbidden preflight check
    const forbiddenPreflight = isOriginAllowed('https://evil-preflight.com', { isProduction: true });
    assert(forbiddenPreflight === false, 'Forbidden preflight is recognized and denied');
  }

  // Test 6: Credentials & Security Safeguards
  {
    console.log('\n[Test 6: Credentials & Anti-Wildcard Safeguard]');
    const origin = 'https://eventgamestudio.com';
    const headers = getCorsHeaders(origin, undefined, { isProduction: true });

    assert(headers['Access-Control-Allow-Origin'] !== '*', 'Access-Control-Allow-Origin is never wildcard `*`');
    assert(!headers['Access-Control-Allow-Origin']?.includes(','), 'Access-Control-Allow-Origin never contains multiple origins');
    assert(headers['Access-Control-Allow-Credentials'] === 'true', 'Credentials allowed only with exact origin');
    assert(headers['Vary'] === 'Origin', 'Vary: Origin set alongside dynamic origin reflection');
  }

  // Test 7: Multiple Configured Origins via ALLOWED_ORIGINS
  {
    console.log('\n[Test 7: Multiple Configured Origins via ALLOWED_ORIGINS]');
    const customConfig = 'https://partner-portal.com, https://internal.corp.com , https://demo.eventgamestudio.com';
    const parsed = parseAllowedOrigins(customConfig);

    assert(parsed.has('https://partner-portal.com'), 'Parses first configured custom origin');
    assert(parsed.has('https://internal.corp.com'), 'Parses and trims second configured custom origin');
    assert(parsed.has('https://demo.eventgamestudio.com'), 'Parses third configured custom origin');
    assert(parsed.has('https://eventgamestudio.com'), 'Preserves default allowed origins');

    const options = { allowedOrigins: customConfig, isProduction: true };
    assert(isOriginAllowed('https://partner-portal.com', options) === true, 'Allows configured partner-portal origin');
    assert(isOriginAllowed('https://internal.corp.com', options) === true, 'Allows configured internal.corp origin');
    assert(isOriginAllowed('https://unconfigured.com', options) === false, 'Rejects unconfigured domain');
  }

  // Test 8: Localhost Policy (Dev vs Production)
  {
    console.log('\n[Test 8: Localhost Isolation Policy]');
    const localOrigin = 'http://localhost:3000';
    const local127 = 'http://127.0.0.1:5173';

    // In development mode:
    const devAllowed = isOriginAllowed(localOrigin, { isProduction: false });
    assert(devAllowed === true, 'Allows localhost in development/staging');
    const dev127Allowed = isOriginAllowed(local127, { isProduction: false });
    assert(dev127Allowed === true, 'Allows 127.0.0.1 in development/staging');

    // In production mode:
    const prodAllowed = isOriginAllowed(localOrigin, { isProduction: true });
    assert(prodAllowed === false, 'STRICTLY rejects localhost in production when not in ALLOWED_ORIGINS');
    const prod127Allowed = isOriginAllowed(local127, { isProduction: true });
    assert(prod127Allowed === false, 'STRICTLY rejects 127.0.0.1 in production when not in ALLOWED_ORIGINS');

    // If explicitly added to ALLOWED_ORIGINS in production:
    const prodWithExplicitLocal = isOriginAllowed(localOrigin, {
      isProduction: true,
      allowedOrigins: 'http://localhost:3000',
    });
    assert(prodWithExplicitLocal === true, 'Allows localhost in production only if explicitly configured in ALLOWED_ORIGINS');
  }

  // Test 9: Platform Domain Policy & Anti-Wildcard Production Guardrails
  {
    console.log('\n[Test 9: Platform Domain Policy & Anti-Wildcard Production Guardrails]');
    const arbitraryWorker = 'https://random-attacker.workers.dev';
    const arbitraryPages = 'https://malicious-phishing.pages.dev';
    const arbitraryCloudRun = 'https://untrusted-service.run.app';
    const prodPagesOrigin = 'https://eventgamestudio.pages.dev';
    const subDomainOrigin = 'https://custom-org.eventgamestudio.com';
    const devCloudRun = 'https://ais-dev-p7yr75yish7jjotmam3wdk-897229651653.asia-southeast1.run.app';
    const stagingWorker = 'https://staging-preview.workers.dev';
    const stagingPages = 'https://staging-branch.pages.dev';

    // 1. In PRODUCTION:
    // Required production domains:
    assert(isOriginAllowed(prodPagesOrigin, { isProduction: true }) === true, 'Allows real production frontend https://eventgamestudio.pages.dev in production');
    assert(isOriginAllowed(subDomainOrigin, { isProduction: true }) === true, 'Allows *.eventgamestudio.com tenant subdomains in production');

    // Broad wildcards are strictly rejected in production:
    assert(isOriginAllowed(arbitraryWorker, { isProduction: true }) === false, 'STRICTLY rejects arbitrary *.workers.dev origin in production');
    assert(isOriginAllowed(arbitraryPages, { isProduction: true }) === false, 'STRICTLY rejects arbitrary *.pages.dev origin in production');
    assert(isOriginAllowed(arbitraryCloudRun, { isProduction: true }) === false, 'STRICTLY rejects arbitrary *.run.app origin in production');

    const headersProd = getCorsHeaders(arbitraryWorker, undefined, { isProduction: true });
    assert(headersProd['Access-Control-Allow-Origin'] === undefined, 'Does not emit Access-Control-Allow-Origin for arbitrary *.workers.dev in production');

    // If a specific worker or run.app origin is explicitly added to ALLOWED_ORIGINS:
    const explicitlyConfigured = isOriginAllowed(arbitraryWorker, {
      isProduction: true,
      allowedOrigins: arbitraryWorker,
    });
    assert(explicitlyConfigured === true, 'Allows specific *.workers.dev in production ONLY if explicitly declared in ALLOWED_ORIGINS');

    // 2. In DEVELOPMENT / STAGING:
    assert(isOriginAllowed(devCloudRun, { isProduction: false }) === true, 'Allows *.run.app preview sandbox in development/staging');
    assert(isOriginAllowed(stagingWorker, { isProduction: false }) === true, 'Allows *.workers.dev preview sandbox in development/staging');
    assert(isOriginAllowed(stagingPages, { isProduction: false }) === true, 'Allows *.pages.dev preview sandbox in development/staging');

    const devHeaders = getCorsHeaders(devCloudRun, undefined, { isProduction: false });
    assert(devHeaders['Access-Control-Allow-Origin'] === devCloudRun, 'Reflects exact allowed preview origin in development');
    assert(devHeaders['Access-Control-Allow-Credentials'] === 'true', 'Sets credentials for allowed preview origin in development');
  }

  console.log('\n======================================================');
  console.log(`CORS Test Summary: ${passed} passed, ${failed} failed`);
  console.log('======================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runCorsTests().catch((err) => {
  console.error('Fatal error during CORS tests:', err);
  process.exit(1);
});
