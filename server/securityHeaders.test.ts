import assert from 'node:assert';
import {
  buildContentSecurityPolicy,
  getSecurityHeaders,
  securityHeadersMiddleware,
  applySecurityHeadersToResponse,
  buildAuthCookie,
  buildClearAuthCookie,
  parseCookie,
  AUTH_COOKIE_NAME,
} from './securityHeaders.js';

console.log('Running Security Headers & CSP Hardening Tests...');

// 1. buildContentSecurityPolicy() - Production Hardening
{
  const prodCsp = buildContentSecurityPolicy({ isProduction: true });

  // Must not contain unsafe-inline in script-src for production
  const scriptSrcDirective = prodCsp
    .split(';')
    .map(d => d.trim())
    .find(d => d.startsWith('script-src'));

  assert.ok(scriptSrcDirective, 'script-src directive must exist');
  assert.ok(!scriptSrcDirective.includes("'unsafe-inline'"), "Production script-src must not contain 'unsafe-inline'");

  // Must not contain unsafe-eval anywhere in production CSP
  assert.ok(!prodCsp.includes("'unsafe-eval'"), "Production CSP must not contain 'unsafe-eval'");

  // Must not contain unencrypted http: source
  const directives = prodCsp.split(';').map(d => d.trim()).filter(Boolean);
  for (const directive of directives) {
    const parts = directive.split(/\s+/);
    const sources = parts.slice(1);
    assert.ok(!sources.includes('http:'), `Directive ${parts[0]} must not contain unencrypted http:`);
  }

  // Must not contain broad wildcard https: in img-src, media-src, or connect-src in production
  const directiveMap = Object.fromEntries(
    directives.map(d => {
      const [name, ...sources] = d.split(/\s+/);
      return [name, sources];
    })
  );

  assert.ok(!directiveMap['img-src'].includes('https:'), "img-src must not contain broad wildcard 'https:'");
  assert.ok(!directiveMap['media-src'].includes('https:'), "media-src must not contain broad wildcard 'https:'");
  assert.ok(!directiveMap['connect-src'].includes('https:'), "connect-src must not contain broad wildcard 'https:'");
  assert.ok(!directiveMap['connect-src'].includes('wss:'), "connect-src must not contain broad wildcard 'wss:'");

  // Must not contain *.run.app or *.pages.dev wildcard frame-ancestors in production
  const frameAncestors = directiveMap['frame-ancestors'] || [];
  assert.ok(!frameAncestors.includes('https://*.run.app'), "frame-ancestors must not contain wildcard https://*.run.app");
  assert.ok(!frameAncestors.includes('https://*.pages.dev'), "frame-ancestors must not contain wildcard https://*.pages.dev");

  // Must include official eventgamestudio.com domains and self in frame-ancestors
  assert.ok(frameAncestors.includes("'self'"), "frame-ancestors must include 'self'");
  assert.ok(frameAncestors.includes('https://eventgamestudio.com'), 'frame-ancestors must include eventgamestudio.com');
  assert.ok(frameAncestors.includes('https://*.eventgamestudio.com'), 'frame-ancestors must include *.eventgamestudio.com');

  // Must whitelist verified Google Identity Services and Stripe SDK in script-src
  const scriptSrc = directiveMap['script-src'] || [];
  assert.ok(scriptSrc.includes("'self'"), "script-src must include 'self'");
  assert.ok(scriptSrc.includes('https://accounts.google.com'), 'script-src must include accounts.google.com');
  assert.ok(scriptSrc.includes('https://apis.google.com'), 'script-src must include apis.google.com');
  assert.ok(scriptSrc.includes('https://js.stripe.com'), 'script-src must include js.stripe.com');

  // Must restrict object-src to none and base-uri to self
  assert.ok(prodCsp.includes("object-src 'none'"), "object-src must be 'none'");
  assert.ok(prodCsp.includes("base-uri 'self'"), "base-uri must be 'self'");

  // Allows dev server relaxations only when isProduction is false
  const devCsp = buildContentSecurityPolicy({ isProduction: false });
  assert.ok(devCsp.includes("'unsafe-inline'"), "Dev CSP includes 'unsafe-inline'");
  assert.ok(devCsp.includes("'unsafe-eval'"), "Dev CSP includes 'unsafe-eval'");
  assert.ok(devCsp.includes('https://*.run.app'), 'Dev CSP includes https://*.run.app for previews');
  console.log('✓ buildContentSecurityPolicy() production hardening tests passed');
}

// 2. getSecurityHeaders() - Full Header Suite
{
  const headers = getSecurityHeaders({ isProduction: true, isHttps: true });
  assert.ok(headers['Content-Security-Policy'], 'Content-Security-Policy must be set');
  assert.strictEqual(headers['Strict-Transport-Security'], 'max-age=31536000; includeSubDomains; preload');
  assert.strictEqual(headers['X-Content-Type-Options'], 'nosniff');
  assert.strictEqual(headers['Referrer-Policy'], 'strict-origin-when-cross-origin');
  assert.strictEqual(
    headers['Permissions-Policy'],
    'camera=(), microphone=(), geolocation=(), payment=(self), usb=(), screen-wake-lock=(self)'
  );
  assert.strictEqual(headers['Cross-Origin-Opener-Policy'], 'same-origin-allow-popups');
  assert.strictEqual(headers['X-XSS-Protection'], '0');
  console.log('✓ getSecurityHeaders() suite tests passed');
}

// 3. securityHeadersMiddleware() - Express Integration
{
  const middleware = securityHeadersMiddleware({ isProduction: true, isHttps: true });
  const headersSet: Record<string, string> = {};

  const req: any = {
    secure: true,
    headers: {},
  };

  const res: any = {
    getHeader: (name: string) => headersSet[name],
    setHeader: (name: string, val: string) => {
      headersSet[name] = val;
    },
  };

  let nextCalled = false;
  middleware(req, res, () => {
    nextCalled = true;
  });

  assert.strictEqual(nextCalled, true, 'next() must be called');
  assert.ok(headersSet['Content-Security-Policy'], 'Content-Security-Policy must be set on res');
  assert.strictEqual(headersSet['Strict-Transport-Security'], 'max-age=31536000; includeSubDomains; preload');
  assert.strictEqual(headersSet['X-Content-Type-Options'], 'nosniff');
  assert.strictEqual(headersSet['Referrer-Policy'], 'strict-origin-when-cross-origin');

  // Does not overwrite existing custom headers
  const customHeadersSet: Record<string, string> = {
    'Referrer-Policy': 'no-referrer',
  };
  const customRes: any = {
    getHeader: (name: string) => customHeadersSet[name],
    setHeader: (name: string, val: string) => {
      customHeadersSet[name] = val;
    },
  };
  middleware(req, customRes, () => {});
  assert.strictEqual(customHeadersSet['Referrer-Policy'], 'no-referrer');
  assert.strictEqual(customHeadersSet['X-Content-Type-Options'], 'nosniff');
  console.log('✓ securityHeadersMiddleware() Express tests passed');
}

// 4. applySecurityHeadersToResponse() - Worker/Fetch Integration
{
  const initialResponse = new Response('OK', {
    status: 200,
    headers: { 'Content-Type': 'text/plain' },
  });

  const securedResponse = applySecurityHeadersToResponse(initialResponse, {
    isProduction: true,
    isHttps: true,
  });

  assert.strictEqual(securedResponse.status, 200);
  assert.strictEqual(securedResponse.headers.get('Content-Type'), 'text/plain');
  assert.ok(securedResponse.headers.get('Content-Security-Policy'));
  assert.strictEqual(securedResponse.headers.get('Strict-Transport-Security'), 'max-age=31536000; includeSubDomains; preload');
  assert.strictEqual(securedResponse.headers.get('X-Content-Type-Options'), 'nosniff');
  assert.strictEqual(securedResponse.headers.get('Referrer-Policy'), 'strict-origin-when-cross-origin');

  // Handles 204 No Content with null body safely
  const nullBodyResponse = new Response(null, { status: 204 });
  const secured204 = applySecurityHeadersToResponse(nullBodyResponse, {
    isProduction: true,
    isHttps: true,
  });
  assert.strictEqual(secured204.status, 204);
  assert.strictEqual(secured204.headers.get('X-Content-Type-Options'), 'nosniff');
  console.log('✓ applySecurityHeadersToResponse() Worker tests passed');
}

// 5. Cookie Helpers (HttpOnly / Secure)
{
  const cookie = buildAuthCookie('test-token-xyz', { isProduction: true, secure: true });
  assert.ok(cookie.includes(`${AUTH_COOKIE_NAME}=test-token-xyz`));
  assert.ok(cookie.includes('HttpOnly'));
  assert.ok(cookie.includes('Secure'));
  assert.ok(cookie.includes('SameSite=Lax'));
  assert.ok(cookie.includes('Path=/'));

  const clearCookie = buildClearAuthCookie({ isProduction: true });
  assert.ok(clearCookie.includes(`${AUTH_COOKIE_NAME}=`));
  assert.ok(clearCookie.includes('Max-Age=0'));
  assert.ok(clearCookie.includes('Expires=Thu, 01 Jan 1970 00:00:00 GMT'));

  const cookieHeader = 'other=123; app_token=my-secret-jwt; session=abc';
  assert.strictEqual(parseCookie(cookieHeader), 'my-secret-jwt');
  assert.strictEqual(parseCookie('other=123; session=abc'), null);
  assert.strictEqual(parseCookie(undefined), null);
  console.log('✓ Cookie helper tests passed');
}

console.log('🎉 All Security Headers and CSP Tests Passed!');

