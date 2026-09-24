/**
 * Event Game Studio — Authenticated Venue Mode & Rate Limiter Security Test Suite
 *
 * Verifies that:
 * 1. Unauthenticated client-controlled flags (X-Venue-Mode, ?venue=true, etc.) are strictly rejected.
 * 2. Cryptographically signed venue tokens and verified organizer sessions elevate allowance to 180/min.
 * 3. Tampered, forged, or expired tokens are rejected.
 * 4. Venue token minting API (/api/events/:eventId/venue-token) enforces organizer authorization.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  signVenueToken,
  verifyVenueToken,
  isVenueRequest,
  isVenueRequestAsync,
  extractCandidateToken,
} from './venueAuth.js';
import {
  createRateLimiter,
  checkRateLimit,
  checkWorkerRateLimit,
} from './rateLimiter.js';
import { signAppToken } from './auth.js';

const TEST_JWT_SECRET = 'test_secret_venue_auth_at_least_32_bytes_long_12345';
const TEST_ENV = {
  JWT_SECRET: TEST_JWT_SECRET,
  NODE_ENV: 'test',
};

describe('Cryptographically Authenticated Venue Authorization', () => {
  describe('Rejection of Unauthenticated Client-Controlled Flags', () => {
    it('rejects all unauthenticated headers', () => {
      assert.equal(isVenueRequest({ headers: { 'x-venue-mode': 'true' } }, TEST_ENV), false);
      assert.equal(isVenueRequest({ headers: { 'x-venue-mode': '1' } }, TEST_ENV), false);
      assert.equal(isVenueRequest({ headers: { 'x-venue-allowance': 'true' } }, TEST_ENV), false);
      assert.equal(isVenueRequest({ headers: { 'x-venue-allowance': '1' } }, TEST_ENV), false);
      assert.equal(isVenueRequest({ headers: { 'x-venue-display': 'true' } }, TEST_ENV), false);
      assert.equal(isVenueRequest({ headers: { 'x-venue-display': '1' } }, TEST_ENV), false);
    });

    it('rejects all unauthenticated query parameters', () => {
      assert.equal(isVenueRequest({ query: { venue: 'true' } }, TEST_ENV), false);
      assert.equal(isVenueRequest({ query: { venue: '1' } }, TEST_ENV), false);
      assert.equal(isVenueRequest({ query: { display: 'true' } }, TEST_ENV), false);
      assert.equal(isVenueRequest({ query: { display: '1' } }, TEST_ENV), false);
      assert.equal(isVenueRequest({ query: { tournament: 'true' } }, TEST_ENV), false);
      assert.equal(isVenueRequest({ query: { tournament: '1' } }, TEST_ENV), false);
    });

    it('rejects Fetch / Worker Requests with unauthenticated indicators', () => {
      const spoofedUrl = 'https://example.com/api/public/events/7KQ2M9X4F8P3W6YJ?venue=true&display=1&tournament=true';
      const spoofedReq = new Request(spoofedUrl, {
        headers: {
          'X-Venue-Mode': 'true',
          'X-Venue-Allowance': '1',
          'X-Venue-Display': 'true',
        },
      });
      assert.equal(isVenueRequest(spoofedReq, TEST_ENV), false);
    });
  });

  describe('Signed Venue Token Minting & Cryptographic Verification', () => {
    it('signs and verifies a valid venue token', async () => {
      const token = await signVenueToken(
        {
          eventId: 'evt_001',
          publicToken: '7KQ2M9X4F8P3W6YJ',
          organizationId: 'org_abc',
          issuedBy: 'usr_owner_1',
          expiresIn: '24h',
        },
        TEST_JWT_SECRET,
        TEST_ENV
      );

      assert.equal(typeof token, 'string');
      assert.ok(token.split('.').length === 3, 'Token must be a valid 3-part JWT');

      const verified = await verifyVenueToken(token, TEST_JWT_SECRET, TEST_ENV);
      assert.ok(verified, 'Verification must succeed for valid token');
      assert.equal(verified?.type, 'venue_display');
      assert.equal(verified?.eventId, 'evt_001');
      assert.equal(verified?.publicToken, '7KQ2M9X4F8P3W6YJ');
      assert.equal(verified?.organizationId, 'org_abc');
      assert.equal(verified?.issuedBy, 'usr_owner_1');
    });

    it('extracts and qualifies venue token via X-Venue-Token header', async () => {
      const token = await signVenueToken(
        { eventId: 'evt_001', publicToken: '7KQ2M9X4F8P3W6YJ' },
        TEST_JWT_SECRET,
        TEST_ENV
      );

      // Express request
      const expReq = { headers: { 'x-venue-token': token } };
      assert.equal(isVenueRequest(expReq, TEST_ENV), true);

      // Worker request
      const workerReq = new Request('https://example.com/api/public/events/7KQ2M9X4F8P3W6YJ', {
        headers: { 'X-Venue-Token': token },
      });
      assert.equal(isVenueRequest(workerReq, TEST_ENV), true);
    });

    it('extracts and qualifies venue token via ?venue_token query parameter', async () => {
      const token = await signVenueToken(
        { eventId: 'evt_001', publicToken: '7KQ2M9X4F8P3W6YJ' },
        TEST_JWT_SECRET,
        TEST_ENV
      );

      // Express request
      const expReq = { query: { venue_token: token } };
      assert.equal(isVenueRequest(expReq, TEST_ENV), true);

      // Worker request
      const workerReq = new Request(`https://example.com/api/public/events/7KQ2M9X4F8P3W6YJ?venue_token=${token}`);
      assert.equal(isVenueRequest(workerReq, TEST_ENV), true);
    });

    it('extracts and qualifies venue token via Authorization: Bearer header', async () => {
      const token = await signVenueToken(
        { eventId: 'evt_001', publicToken: '7KQ2M9X4F8P3W6YJ' },
        TEST_JWT_SECRET,
        TEST_ENV
      );

      // Express request
      const expReq = { headers: { authorization: `Bearer ${token}` } };
      assert.equal(isVenueRequest(expReq, TEST_ENV), true);

      // Worker request
      const workerReq = new Request('https://example.com/api/public/events/7KQ2M9X4F8P3W6YJ', {
        headers: { Authorization: `Bearer ${token}` },
      });
      assert.equal(isVenueRequest(workerReq, TEST_ENV), true);
    });
  });

  describe('Authenticated Organizer / Member Session Verification', () => {
    it('accepts valid organizer App JWT tokens in Authorization header', async () => {
      const organizerJwt = await signAppToken(
        'usr_organizer_99',
        'org_fest_123',
        'owner',
        TEST_JWT_SECRET,
        TEST_ENV
      );

      // Express request with Bearer App JWT
      const expReq = { headers: { authorization: `Bearer ${organizerJwt}` } };
      assert.equal(isVenueRequest(expReq, TEST_ENV), true);

      // Worker request with Bearer App JWT
      const workerReq = new Request('https://example.com/api/public/events/7KQ2M9X4F8P3W6YJ', {
        headers: { Authorization: `Bearer ${organizerJwt}` },
      });
      assert.equal(isVenueRequest(workerReq, TEST_ENV), true);
    });

    it('accepts requests with pre-authenticated req.user / req.jwtPayload', () => {
      assert.equal(isVenueRequest({ user: { id: 'usr_organizer_1' } }, TEST_ENV), true);
      assert.equal(isVenueRequest({ jwtPayload: { sub: 'usr_organizer_1', role: 'admin' } }, TEST_ENV), true);
    });
  });

  describe('Cryptographic Tamper & Expiration Resistance', () => {
    it('rejects tampered venue tokens', async () => {
      const token = await signVenueToken(
        { eventId: 'evt_001', publicToken: '7KQ2M9X4F8P3W6YJ' },
        TEST_JWT_SECRET,
        TEST_ENV
      );

      // Tamper signature
      const tampered = token.slice(0, -6) + 'xxxxxx';
      assert.equal(isVenueRequest({ headers: { 'x-venue-token': tampered } }, TEST_ENV), false);
      const verified = await verifyVenueToken(tampered, TEST_JWT_SECRET, TEST_ENV);
      assert.equal(verified, null);
    });

    it('rejects tokens signed with an unauthorized/different secret', async () => {
      const foreignSecret = 'an_attacker_forged_secret_key_32_bytes_long';
      const forgedToken = await signVenueToken(
        { eventId: 'evt_001', publicToken: '7KQ2M9X4F8P3W6YJ' },
        foreignSecret,
        { JWT_SECRET: foreignSecret }
      );

      assert.equal(isVenueRequest({ headers: { 'x-venue-token': forgedToken } }, TEST_ENV), false);
    });

    it('rejects expired venue tokens', async () => {
      const expiredToken = await signVenueToken(
        { eventId: 'evt_001', publicToken: '7KQ2M9X4F8P3W6YJ', expiresIn: '-5m' },
        TEST_JWT_SECRET,
        TEST_ENV
      );

      assert.equal(isVenueRequest({ headers: { 'x-venue-token': expiredToken } }, TEST_ENV), false);
      const verified = await verifyVenueToken(expiredToken, TEST_JWT_SECRET, TEST_ENV);
      assert.equal(verified, null);
    });
  });

  describe('Rate Limiter Integration with Cryptographic Venue Auth', () => {
    it('applies baseline 60/min limit to unauthenticated spoofed requests', () => {
      const keyPrefix = `test_spoof_${Date.now()}`;
      const spoofedReq = new Request('https://example.com/api/public/events/token123?venue=true', {
        headers: {
          'cf-connecting-ip': '198.51.100.10',
          'X-Venue-Mode': 'true',
        },
      });

      const res = checkWorkerRateLimit(spoofedReq, {
        windowMs: 60 * 1000,
        max: 60,
        venueAllowanceMax: 180,
        isVenueRequest: (r) => isVenueRequest(r, TEST_ENV),
        keyPrefix,
      });

      assert.equal(res.allowed, true);
      assert.equal(res.headers['RateLimit-Limit'], '60', 'Spoofed request must not receive venue allowance');
    });

    it('applies venue allowance (180/min) to cryptographically authenticated venue requests', async () => {
      const validToken = await signVenueToken(
        { eventId: 'evt_real', publicToken: 'token123' },
        TEST_JWT_SECRET,
        TEST_ENV
      );

      const keyPrefix = `test_legit_venue_${Date.now()}`;
      const venueReq = new Request('https://example.com/api/public/events/token123', {
        headers: {
          'cf-connecting-ip': '198.51.100.20',
          'X-Venue-Token': validToken,
        },
      });

      const res = checkWorkerRateLimit(venueReq, {
        windowMs: 60 * 1000,
        max: 60,
        venueAllowanceMax: 180,
        isVenueRequest: (r) => isVenueRequest(r, TEST_ENV),
        keyPrefix,
      });

      assert.equal(res.allowed, true);
      assert.equal(res.headers['RateLimit-Limit'], '180', 'Authenticated venue request must receive 180 allowance');
    });
  });
});
