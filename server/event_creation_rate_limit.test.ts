import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  checkRateLimit,
  resetRateLimitStores,
  getRateLimitStoreForTest,
  createRateLimiter,
  checkWorkerRateLimit,
  checkWorkerRateLimitWithCloudflare,
  eventCreationRateLimiter,
  EVENT_CREATION_RATE_LIMIT_WINDOW_MS,
  EVENT_CREATION_RATE_LIMIT_MAX,
  EVENT_CREATION_RATE_LIMIT_MESSAGE,
  WORKER_EVENT_CREATION_RATE_LIMIT,
} from './rateLimiter.js';

describe('Event Creation Rate Limiting (50 attempts per 10 minutes per organization)', () => {
  beforeEach(() => {
    resetRateLimitStores();
  });

  describe('Configuration & Constants Integrity', () => {
    it('enforces exactly 50 max attempts per 10-minute (600,000ms) window', () => {
      assert.equal(EVENT_CREATION_RATE_LIMIT_MAX, 50, 'EVENT_CREATION_RATE_LIMIT_MAX must be 50');
      assert.equal(EVENT_CREATION_RATE_LIMIT_WINDOW_MS, 10 * 60 * 1000, 'Window must be 10 minutes (600000ms)');
      assert.equal(
        EVENT_CREATION_RATE_LIMIT_MESSAGE,
        'Event creation rate limit exceeded: Maximum 50 event creation attempts per 10 minutes per organization.'
      );
      assert.equal(WORKER_EVENT_CREATION_RATE_LIMIT.max, 50);
      assert.equal(WORKER_EVENT_CREATION_RATE_LIMIT.windowMs, 600000);
      assert.equal(WORKER_EVENT_CREATION_RATE_LIMIT.keyPrefix, 'worker_event_creation');
    });
  });

  describe('Core Sliding Window Enforcement', () => {
    it('permits the first 50 eligible event creation attempts for an organization', () => {
      const orgId = `org_test_${Date.now()}_alpha`;
      const clientKey = `event_creation:org:${orgId}`;

      for (let attempt = 1; attempt <= 50; attempt++) {
        const result = checkRateLimit(clientKey, {
          windowMs: EVENT_CREATION_RATE_LIMIT_WINDOW_MS,
          max: EVENT_CREATION_RATE_LIMIT_MAX,
          keyPrefix: 'event_creation',
        });

        assert.equal(result.allowed, true, `Attempt #${attempt} must be permitted`);
        assert.equal(result.limit, 50, 'Limit must report 50');
        assert.equal(result.remaining, 50 - attempt, `Remaining quota must be ${50 - attempt}`);
        assert.equal(result.retryAfter, 0, 'retryAfter must be 0 for permitted attempts');
        assert.ok(result.resetTime > 0, 'resetTime timestamp must be positive');
      }
    });

    it('blocks the 51st attempt within the same 10-minute window with 429 and retryAfter', () => {
      const orgId = `org_test_${Date.now()}_block`;
      const clientKey = `event_creation:org:${orgId}`;

      // Execute 50 permitted attempts
      for (let i = 1; i <= 50; i++) {
        const res = checkRateLimit(clientKey, {
          windowMs: EVENT_CREATION_RATE_LIMIT_WINDOW_MS,
          max: EVENT_CREATION_RATE_LIMIT_MAX,
          keyPrefix: 'event_creation',
        });
        assert.equal(res.allowed, true);
      }

      // 51st attempt must be blocked
      const blocked51 = checkRateLimit(clientKey, {
        windowMs: EVENT_CREATION_RATE_LIMIT_WINDOW_MS,
        max: EVENT_CREATION_RATE_LIMIT_MAX,
        keyPrefix: 'event_creation',
      });

      assert.equal(blocked51.allowed, false, 'The 51st attempt must be rate-limited');
      assert.equal(blocked51.limit, 50);
      assert.equal(blocked51.remaining, 0, 'Remaining quota must be 0');
      assert.ok(blocked51.retryAfter > 0, 'retryAfter must be positive (> 0 seconds)');
      assert.ok(blocked51.retryAfter <= 600, 'retryAfter must not exceed the 10-minute window (600s)');
      assert.ok(blocked51.resetTime > 0, 'resetTime timestamp must be reported');

      // Subsequent 52nd attempt also blocked
      const blocked52 = checkRateLimit(clientKey, {
        windowMs: EVENT_CREATION_RATE_LIMIT_WINDOW_MS,
        max: EVENT_CREATION_RATE_LIMIT_MAX,
        keyPrefix: 'event_creation',
      });
      assert.equal(blocked52.allowed, false);
      assert.equal(blocked52.remaining, 0);
    });

    it('preserves strict organization-level isolation so one organization cannot exhaust another', () => {
      const orgA = `org_corp_a_${Date.now()}`;
      const orgB = `org_corp_b_${Date.now()}`;

      const keyA = `event_creation:org:${orgA}`;
      const keyB = `event_creation:org:${orgB}`;

      // Org A consumes all 50 attempts
      for (let i = 1; i <= 50; i++) {
        const resA = checkRateLimit(keyA, {
          windowMs: EVENT_CREATION_RATE_LIMIT_WINDOW_MS,
          max: EVENT_CREATION_RATE_LIMIT_MAX,
          keyPrefix: 'event_creation',
        });
        assert.equal(resA.allowed, true, `Org A attempt #${i} must be permitted`);
      }

      // Org A's 51st attempt is blocked
      const resA51 = checkRateLimit(keyA, {
        windowMs: EVENT_CREATION_RATE_LIMIT_WINDOW_MS,
        max: EVENT_CREATION_RATE_LIMIT_MAX,
        keyPrefix: 'event_creation',
      });
      assert.equal(resA51.allowed, false, 'Org A 51st attempt must be blocked');

      // Org B should have its FULL quota untouched (all 50 available)
      for (let j = 1; j <= 50; j++) {
        const resB = checkRateLimit(keyB, {
          windowMs: EVENT_CREATION_RATE_LIMIT_WINDOW_MS,
          max: EVENT_CREATION_RATE_LIMIT_MAX,
          keyPrefix: 'event_creation',
        });
        assert.equal(resB.allowed, true, `Org B attempt #${j} must be permitted regardless of Org A`);
        assert.equal(resB.remaining, 50 - j);
      }

      // Org B is blocked only on its own 51st attempt
      const resB51 = checkRateLimit(keyB, {
        windowMs: EVENT_CREATION_RATE_LIMIT_WINDOW_MS,
        max: EVENT_CREATION_RATE_LIMIT_MAX,
        keyPrefix: 'event_creation',
      });
      assert.equal(resB51.allowed, false, 'Org B 51st attempt must be blocked');
    });

    it('resets quota correctly after the 10-minute sliding window expires', () => {
      const orgId = `org_expire_${Date.now()}`;
      const clientKey = `event_creation:org:${orgId}`;
      const options = {
        windowMs: EVENT_CREATION_RATE_LIMIT_WINDOW_MS,
        max: EVENT_CREATION_RATE_LIMIT_MAX,
        keyPrefix: 'event_creation',
      };

      // Fill 50 attempts
      for (let i = 0; i < 50; i++) {
        checkRateLimit(clientKey, options);
      }

      // 51st is blocked
      const blocked = checkRateLimit(clientKey, options);
      assert.equal(blocked.allowed, false);

      // Simulate counter expiration by advancing timestamps in the store
      const store = getRateLimitStoreForTest('event_creation');
      assert.ok(store);
      const record = store.get(clientKey);
      assert.ok(record);
      assert.equal(record.timestamps.length, 50);

      // Age all 50 timestamps by 11 minutes (past the 10-minute window)
      const elevenMinutesAgo = Date.now() - 11 * 60 * 1000;
      record.timestamps = record.timestamps.map(() => elevenMinutesAgo);

      // Next attempt after window expiration must now be permitted
      const freshAttempt = checkRateLimit(clientKey, options);
      assert.equal(freshAttempt.allowed, true, 'Request after window expiration must succeed');
      assert.equal(freshAttempt.remaining, 49, 'Remaining quota must reset to 49');
    });

    it('handles concurrent requests atomically without quota leakage', async () => {
      const orgId = `org_concurrent_${Date.now()}`;
      const clientKey = `event_creation:org:${orgId}`;
      const options = {
        windowMs: EVENT_CREATION_RATE_LIMIT_WINDOW_MS,
        max: EVENT_CREATION_RATE_LIMIT_MAX,
        keyPrefix: 'event_creation',
      };

      // Concurrently dispatch 60 checkRateLimit requests
      const promises = Array.from({ length: 60 }, async (_, index) => {
        return { index, result: checkRateLimit(clientKey, options) };
      });

      const results = await Promise.all(promises);
      const allowedCount = results.filter((r) => r.result.allowed).length;
      const blockedCount = results.filter((r) => !r.result.allowed).length;

      assert.equal(allowedCount, 50, 'Exactly 50 concurrent requests must be allowed');
      assert.equal(blockedCount, 10, 'Exactly 10 excess requests must be blocked');
    });
  });

  describe('Express Middleware (eventCreationRateLimiter)', () => {
    it('invokes next() for first 50 attempts and responds with 429 on 51st', async () => {
      const orgId = `express_org_${Date.now()}`;
      let nextCalledCount = 0;
      let lastStatusCode = 0;
      let lastJsonBody: any = null;
      const responseHeaders: Record<string, string> = {};

      const createMockReq = () => ({
        headers: {
          'x-organization-id': orgId,
        },
        jwtPayload: {
          organizationId: orgId,
          sub: 'usr_test_1',
        },
        user: { id: 'usr_test_1' },
      });

      const mockRes = {
        setHeader: (k: string, v: string) => {
          responseHeaders[k.toLowerCase()] = v;
        },
        status: (code: number) => {
          lastStatusCode = code;
          return {
            json: (data: any) => {
              lastJsonBody = data;
            },
          };
        },
      };

      // 50 attempts via Express middleware
      for (let i = 1; i <= 50; i++) {
        await eventCreationRateLimiter(createMockReq() as any, mockRes as any, () => {
          nextCalledCount++;
        });
        assert.equal(nextCalledCount, i, `Attempt #${i} must call next()`);
      }

      assert.equal(responseHeaders['ratelimit-limit'], '50');
      assert.equal(responseHeaders['ratelimit-remaining'], '0');

      // 51st attempt via Express middleware
      await eventCreationRateLimiter(createMockReq() as any, mockRes as any, () => {
        nextCalledCount++;
      });

      assert.equal(nextCalledCount, 50, 'next() must NOT be called on 51st attempt');
      assert.equal(lastStatusCode, 429, 'Status must be HTTP 429 Too Many Requests');
      assert.equal(lastJsonBody?.error, 'Too Many Requests');
      assert.equal(
        lastJsonBody?.message,
        'Event creation rate limit exceeded: Maximum 50 event creation attempts per 10 minutes per organization.'
      );
      assert.ok(lastJsonBody?.retryAfterSeconds > 0, 'retryAfterSeconds must be positive');
      assert.equal(responseHeaders['retry-after'], lastJsonBody.retryAfterSeconds.toString());
      assert.equal(responseHeaders['x-ratelimit-limit'], '50');
      assert.equal(responseHeaders['x-ratelimit-remaining'], '0');
    });

    it('extracts organization ID from Authorization Bearer JWT payload when available', async () => {
      const orgId = `jwt_org_${Date.now()}`;
      // Construct an unencrypted mock JWT header.payload.signature
      const payloadObj = { organizationId: orgId, sub: 'usr_jwt_test' };
      const base64Payload = Buffer.from(JSON.stringify(payloadObj)).toString('base64');
      const fakeJwt = `eyJhbGciOiJIUzI1NiJ9.${base64Payload}.mock_sig`;

      const reqWithJwt = {
        headers: {
          authorization: `Bearer ${fakeJwt}`,
        },
      };

      let allowedCount = 0;
      const mockRes = {
        setHeader: () => {},
        status: () => ({ json: () => {} }),
      };

      for (let i = 0; i < 50; i++) {
        await eventCreationRateLimiter(reqWithJwt as any, mockRes as any, () => {
          allowedCount++;
        });
      }
      assert.equal(allowedCount, 50);

      // 51st attempt for same org in JWT must be blocked
      let blocked51 = false;
      const blockRes = {
        setHeader: () => {},
        status: (code: number) => {
          if (code === 429) blocked51 = true;
          return { json: () => {} };
        },
      };
      await eventCreationRateLimiter(reqWithJwt as any, blockRes as any, () => {
        allowedCount++;
      });
      assert.equal(blocked51, true, '51st attempt using JWT organizationId must be blocked');
      assert.equal(allowedCount, 50, 'next() must not be called');
    });
  });

  describe('Cloudflare Worker Rate Limiter (WORKER_EVENT_CREATION_RATE_LIMIT)', () => {
    it('permits 50 worker requests and blocks 51st with 429 schema', async () => {
      const orgId = `cf_org_${Date.now()}`;

      const makeRequest = () =>
        new Request('https://api.eventgamestudio.com/api/events', {
          method: 'POST',
          headers: {
            'x-organization-id': orgId,
            'x-test-rate-limit': 'true', // Enforce real rate limit without test bypass
            'content-type': 'application/json',
          },
          body: JSON.stringify({ name: 'Test Event' }),
        });

      // Send 50 worker requests
      for (let i = 1; i <= 50; i++) {
        const res = checkWorkerRateLimit(makeRequest(), WORKER_EVENT_CREATION_RATE_LIMIT);
        assert.equal(res.allowed, true, `Worker request #${i} must be allowed`);
        assert.equal(res.headers['RateLimit-Limit'], '50');
        assert.equal(res.headers['RateLimit-Remaining'], (50 - i).toString());
      }

      // Send 51st worker request
      const res51 = checkWorkerRateLimit(makeRequest(), WORKER_EVENT_CREATION_RATE_LIMIT);
      assert.equal(res51.allowed, false, '51st worker request must be blocked');
      assert.equal(res51.headers['RateLimit-Limit'], '50');
      assert.equal(res51.headers['RateLimit-Remaining'], '0');
      assert.ok(Number(res51.headers['Retry-After']) > 0);

      assert.equal(res51.errorResponse?.error, 'Too Many Requests');
      assert.equal(
        res51.errorResponse?.message,
        'Event creation rate limit exceeded: Maximum 50 event creation attempts per 10 minutes per organization.'
      );
      assert.ok(res51.errorResponse?.retryAfterSeconds > 0);
    });

    it('isolates different organizations in worker requests', async () => {
      const orgA = `cf_org_a_${Date.now()}`;
      const orgB = `cf_org_b_${Date.now()}`;

      const reqA = () =>
        new Request('https://api.eventgamestudio.com/api/events', {
          method: 'POST',
          headers: {
            'x-organization-id': orgA,
            'x-test-rate-limit': 'true',
          },
        });

      const reqB = () =>
        new Request('https://api.eventgamestudio.com/api/events', {
          method: 'POST',
          headers: {
            'x-organization-id': orgB,
            'x-test-rate-limit': 'true',
          },
        });

      // Org A consumes 50
      for (let i = 0; i < 50; i++) {
        assert.equal(checkWorkerRateLimit(reqA(), WORKER_EVENT_CREATION_RATE_LIMIT).allowed, true);
      }
      // Org A 51st blocked
      assert.equal(checkWorkerRateLimit(reqA(), WORKER_EVENT_CREATION_RATE_LIMIT).allowed, false);

      // Org B is untouched and allowed
      const resB = checkWorkerRateLimit(reqB(), WORKER_EVENT_CREATION_RATE_LIMIT);
      assert.equal(resB.allowed, true, 'Org B must be allowed even when Org A is blocked');
      assert.equal(resB.headers['RateLimit-Remaining'], '49');
    });

    it('works seamlessly with checkWorkerRateLimitWithCloudflare when edge binding is not bound', async () => {
      const orgId = `cf_edge_fallback_${Date.now()}`;
      const req = new Request('https://api.eventgamestudio.com/api/events', {
        method: 'POST',
        headers: {
          'x-organization-id': orgId,
          'x-test-rate-limit': 'true',
        },
      });

      const result = await checkWorkerRateLimitWithCloudflare(req, WORKER_EVENT_CREATION_RATE_LIMIT, {});
      assert.equal(result.allowed, true);
      assert.equal(result.headers['RateLimit-Limit'], '50');
      assert.equal(result.headers['RateLimit-Remaining'], '49');
    });
  });
});

