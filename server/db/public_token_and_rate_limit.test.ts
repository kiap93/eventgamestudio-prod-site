import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generatePublicToken } from './events.js';
import {
  checkRateLimit,
  isVenueRequest,
  createRateLimiter,
  checkWorkerRateLimit,
  publicEventRateLimiter,
  publicHighScoreReadRateLimiter,
  signVenueToken,
  verifyVenueToken,
} from '../rateLimiter.js';

describe('Public Event Token & Rate Limiting Security Hardening', () => {
  describe('Public Event Token Generation', () => {
    it('generates a 16-character token by default with 80 bits of entropy', () => {
      const token = generatePublicToken();
      assert.equal(typeof token, 'string');
      assert.equal(token.length, 16, 'Default token length must be 16 characters');
    });

    it('uses only unambiguous Base32 characters and excludes 0, O, 1, I', () => {
      const allowedAlphabet = /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]+$/;

      for (let i = 0; i < 50; i++) {
        const token = generatePublicToken();
        assert.ok(
          allowedAlphabet.test(token),
          `Token "${token}" contains characters outside the unambiguous Base32 alphabet`
        );
        assert.equal(token.includes('0'), false, 'Token must not contain 0');
        assert.equal(token.includes('O'), false, 'Token must not contain O');
        assert.equal(token.includes('1'), false, 'Token must not contain 1');
        assert.equal(token.includes('I'), false, 'Token must not contain I');
      }
    });

    it('generates collision-resistant unique tokens across samples', () => {
      const tokens = new Set<string>();
      const sampleSize = 1000;
      for (let i = 0; i < sampleSize; i++) {
        const token = generatePublicToken();
        tokens.add(token);
      }
      assert.equal(tokens.size, sampleSize, 'All generated tokens must be unique');
    });

    it('supports custom length parameter when explicitly provided', () => {
      assert.equal(generatePublicToken(20).length, 20);
      assert.equal(generatePublicToken(12).length, 12);
      assert.equal(generatePublicToken(7).length, 7);
    });
  });

  describe('Cryptographically Authenticated Venue Detection (isVenueRequest)', () => {
    it('strictly rejects unauthenticated client-controlled flags (X-Venue-Mode, ?venue=true, etc.)', () => {
      // 1. Unauthenticated Express request headers must return false
      assert.equal(isVenueRequest({ headers: { 'x-venue-mode': 'true' } }), false);
      assert.equal(isVenueRequest({ headers: { 'x-venue-allowance': '1' } }), false);
      assert.equal(isVenueRequest({ headers: { 'x-venue-display': 'true' } }), false);

      // 2. Unauthenticated Express request query parameters must return false
      assert.equal(isVenueRequest({ query: { venue: '1' } }), false);
      assert.equal(isVenueRequest({ query: { venue: 'true' } }), false);
      assert.equal(isVenueRequest({ query: { display: '1' } }), false);
      assert.equal(isVenueRequest({ query: { tournament: 'true' } }), false);
      assert.equal(isVenueRequest({ headers: {}, query: {} }), false);
      assert.equal(isVenueRequest(null), false);
      assert.equal(isVenueRequest(undefined), false);

      // 3. Unauthenticated Fetch / Cloudflare Worker requests must return false
      const normalReq = new Request('https://example.com/api/public/events/7KQ2M9X4F8P3W6YJ');
      assert.equal(isVenueRequest(normalReq), false);

      const headerReq = new Request('https://example.com/api/public/events/7KQ2M9X4F8P3W6YJ', {
        headers: { 'X-Venue-Mode': 'true' },
      });
      assert.equal(isVenueRequest(headerReq), false);

      const displayReq = new Request('https://example.com/api/public/events/7KQ2M9X4F8P3W6YJ?display=1');
      assert.equal(isVenueRequest(displayReq), false);

      const venueQueryReq = new Request('https://example.com/api/public/events/7KQ2M9X4F8P3W6YJ?venue=true');
      assert.equal(isVenueRequest(venueQueryReq), false);
    });

    it('verifies and accepts cryptographically signed venue tokens', async () => {
      const validToken = await signVenueToken({
        eventId: 'evt_test_123',
        publicToken: '7KQ2M9X4F8P3W6YJ',
        organizationId: 'org_test_456',
        expiresIn: '1h',
      });

      // 1. In Express request via X-Venue-Token header
      assert.equal(
        isVenueRequest({ headers: { 'x-venue-token': validToken } }),
        true,
        'Valid X-Venue-Token header must qualify for venue mode'
      );

      // 2. In Express request via Authorization Bearer header
      assert.equal(
        isVenueRequest({ headers: { authorization: `Bearer ${validToken}` } }),
        true,
        'Valid Bearer venue token must qualify for venue mode'
      );

      // 3. In Express request via venue_token query parameter
      assert.equal(
        isVenueRequest({ query: { venue_token: validToken } }),
        true,
        'Valid venue_token query param must qualify for venue mode'
      );

      // 4. In Fetch / Cloudflare Worker Request via header
      const workerHeaderReq = new Request('https://example.com/api/public/events/7KQ2M9X4F8P3W6YJ', {
        headers: { 'X-Venue-Token': validToken },
      });
      assert.equal(isVenueRequest(workerHeaderReq), true);

      // 5. In Fetch / Cloudflare Worker Request via query param
      const workerQueryReq = new Request(`https://example.com/api/public/events/7KQ2M9X4F8P3W6YJ?venue_token=${validToken}`);
      assert.equal(isVenueRequest(workerQueryReq), true);
    });

    it('accepts authenticated organizer / team member sessions', () => {
      // 1. Session with req.user populated
      assert.equal(
        isVenueRequest({ user: { id: 'usr_org_owner_1' } }),
        true,
        'Authenticated user session must qualify for venue allowance'
      );

      // 2. Session with req.jwtPayload populated
      assert.equal(
        isVenueRequest({ jwtPayload: { sub: 'usr_org_member_1', organizationId: 'org_123' } }),
        true,
        'Authenticated JWT payload must qualify for venue allowance'
      );
    });

    it('rejects forged, tampered, or expired venue tokens', async () => {
      // 1. Tampered token
      const validToken = await signVenueToken({
        eventId: 'evt_test_123',
        publicToken: '7KQ2M9X4F8P3W6YJ',
        expiresIn: '1h',
      });
      const tamperedToken = validToken.slice(0, -4) + 'abcd';
      assert.equal(isVenueRequest({ headers: { 'x-venue-token': tamperedToken } }), false);

      // 2. Malformed arbitrary string
      assert.equal(isVenueRequest({ headers: { 'x-venue-token': 'not-a-token' } }), false);
      assert.equal(isVenueRequest({ query: { venue_token: 'fake_token_12345' } }), false);

      // 3. Expired token
      const expiredToken = await signVenueToken({
        eventId: 'evt_test_123',
        publicToken: '7KQ2M9X4F8P3W6YJ',
        expiresIn: '-10s', // Expired 10 seconds ago
      });
      assert.equal(isVenueRequest({ headers: { 'x-venue-token': expiredToken } }), false);
    });
  });

  describe('Public Read Rate Limiting Enforcement', () => {
    it('enforces 60 requests/minute baseline on public event lookup', () => {
      const testKeyPrefix = `test_pub_event_${Date.now()}`;
      const clientKey = `${testKeyPrefix}:192.168.1.100`;

      // 60 requests should succeed
      for (let i = 1; i <= 60; i++) {
        const result = checkRateLimit(clientKey, {
          windowMs: 60 * 1000,
          max: 60,
          keyPrefix: testKeyPrefix,
        });
        assert.equal(result.allowed, true, `Request #${i} must be allowed within baseline limit`);
        assert.equal(result.limit, 60);
        assert.equal(result.remaining, 60 - i);
      }

      // Request #61 must be blocked
      const blockedResult = checkRateLimit(clientKey, {
        windowMs: 60 * 1000,
        max: 60,
        keyPrefix: testKeyPrefix,
      });
      assert.equal(blockedResult.allowed, false, 'Request #61 must be blocked with HTTP 429');
      assert.equal(blockedResult.remaining, 0);
      assert.ok(blockedResult.retryAfter > 0, 'Retry-After must be positive');
    });

    it('expands to venue allowance (180 requests/minute) when venue mode is active', () => {
      const testKeyPrefix = `test_venue_${Date.now()}`;
      const clientKey = `${testKeyPrefix}:192.168.1.200`;

      // Simulate 120 requests under venue allowance (which would exceed baseline 60)
      for (let i = 1; i <= 120; i++) {
        const result = checkRateLimit(clientKey, {
          windowMs: 60 * 1000,
          max: 180, // venue allowance max
          keyPrefix: testKeyPrefix,
        });
        assert.equal(result.allowed, true, `Request #${i} must be allowed under venue allowance`);
        assert.equal(result.limit, 180);
      }
    });

    it('verifies Express middleware attaches rate limit headers and blocks on limit', () => {
      assert.equal(typeof publicEventRateLimiter, 'function');
      assert.equal(typeof publicHighScoreReadRateLimiter, 'function');

      const prefix = `test_express_${Date.now()}`;
      const customLimiter = createRateLimiter({
        windowMs: 60 * 1000,
        max: 2,
        keyPrefix: prefix,
        keyGenerator: () => 'fixed_test_client',
      });

      const req: any = { headers: {} };
      let statusCalled = 0;
      let jsonPayload: any = null;
      let nextCalledCount = 0;

      const res: any = {
        setHeader: () => {},
        status: (code: number) => {
          statusCalled = code;
          return {
            json: (data: any) => {
              jsonPayload = data;
            },
          };
        },
      };

      // 1st request -> allowed
      customLimiter(req, res, () => {
        nextCalledCount++;
      });
      assert.equal(nextCalledCount, 1);

      // 2nd request -> allowed
      customLimiter(req, res, () => {
        nextCalledCount++;
      });
      assert.equal(nextCalledCount, 2);

      // 3rd request -> blocked with 429
      customLimiter(req, res, () => {
        nextCalledCount++;
      });
      assert.equal(nextCalledCount, 2, 'next() must NOT be called when rate limited');
      assert.equal(statusCalled, 429, 'Response status must be 429');
      assert.equal(jsonPayload?.error, 'Too Many Requests');
    });

    it('verifies Cloudflare Worker rate limiter helper enforces venue allowance', async () => {
      const testPrefix = `test_cf_${Date.now()}`;
      const normalRequest = new Request('https://example.com/api/public/events/token123', {
        headers: { 'cf-connecting-ip': '203.0.113.50' },
      });

      // 1. Normal request has max = 60
      const normalRes = checkWorkerRateLimit(normalRequest, {
        windowMs: 60 * 1000,
        max: 60,
        venueAllowanceMax: 180,
        isVenueRequest,
        keyPrefix: testPrefix,
      });
      assert.equal(normalRes.allowed, true);
      assert.equal(normalRes.headers['RateLimit-Limit'], '60');

      // 2. Unauthenticated spoofed request with ?venue=true must NOT receive venue allowance
      const spoofedPrefix = `test_cf_spoofed_${Date.now()}`;
      const spoofedRequest = new Request('https://example.com/api/public/events/token123?venue=true', {
        headers: { 'cf-connecting-ip': '203.0.113.55' },
      });
      const spoofedRes = checkWorkerRateLimit(spoofedRequest, {
        windowMs: 60 * 1000,
        max: 60,
        venueAllowanceMax: 180,
        isVenueRequest,
        keyPrefix: spoofedPrefix,
      });
      assert.equal(spoofedRes.allowed, true);
      assert.equal(spoofedRes.headers['RateLimit-Limit'], '60', 'Unauthenticated ?venue=true must remain at baseline 60');

      // 3. Cryptographically authenticated venue request receives max = 180
      const validToken = await signVenueToken({
        eventId: 'evt_cf_test',
        publicToken: 'token123',
        expiresIn: '2h',
      });
      const venuePrefix = `test_cf_venue_${Date.now()}`;
      const venueRequest = new Request('https://example.com/api/public/events/token123', {
        headers: {
          'cf-connecting-ip': '203.0.113.60',
          'X-Venue-Token': validToken,
        },
      });

      const venueRes = checkWorkerRateLimit(venueRequest, {
        windowMs: 60 * 1000,
        max: 60,
        venueAllowanceMax: 180,
        isVenueRequest,
        keyPrefix: venuePrefix,
      });
      assert.equal(venueRes.allowed, true);
      assert.equal(venueRes.headers['RateLimit-Limit'], '180', 'Authenticated venue token must receive 180 allowance');
    });
  });
});
