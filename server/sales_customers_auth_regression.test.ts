import { test, expect, describe, beforeEach } from 'bun:test';
import * as jose from 'jose';
import {
  createUser,
  createOrganization,
} from './db/index.js';
import { localUsersCache } from './db/users.js';
import {
  clearLocalSalesPartnersCache,
  createSalesPartnerApplication,
  updateSalesPartnerStatus,
  localSalesPartnersCache,
} from './db/salesPartners.js';
import {
  clearLocalAttributionsCache,
  clearLocalReferralCodesCache,
  getOrCreateSalesReferralCode,
  recordCustomerReferral,
  approveCustomerAttribution,
} from './db/salesAttribution.js';
import {
  listSalesPartnerCustomers,
  getSalesPartnerCustomerDetail,
} from './db/salesDashboard.js';
import {
  authenticateSalesPartner,
  authenticateJWT,
  signAppToken,
  getJwtSecret,
} from './auth.js';
import { apiFetch, buildApiUrl } from '../src/lib/api.js';
import worker from '../worker.js';

describe('Sales Customers API Authentication & Authorization Regression Suite', () => {
  const testEnv = {
    SUPABASE_URL: 'https://placeholder.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'placeholder-service-key',
    JWT_SECRET: 'test-jwt-secret-for-sales-customers-auth-regression-32ch',
    NODE_ENV: 'test',
  };

  process.env.SUPABASE_URL = testEnv.SUPABASE_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY = testEnv.SUPABASE_SERVICE_ROLE_KEY;
  process.env.JWT_SECRET = testEnv.JWT_SECRET;
  process.env.NODE_ENV = 'test';

  beforeEach(() => {
    localUsersCache.clear();
    clearLocalSalesPartnersCache();
    clearLocalAttributionsCache();
    clearLocalReferralCodesCache();
  });

  async function createPartnerWithAttributedCustomer(prefix: string) {
    const partnerUser = await createUser(
      { email: `${prefix}.partner@example.com`, name: `${prefix} Partner` },
      testEnv
    );
    await createSalesPartnerApplication(
      partnerUser.id,
      { legal_name: `${prefix} Agency`, country_code: 'MY', tax_id: `TAX-${prefix}` },
      testEnv
    );
    await updateSalesPartnerStatus(partnerUser.id, 'active', 'admin-id', testEnv);

    const clientUser = await createUser(
      { email: `${prefix}.client@example.com`, name: `${prefix} Client` },
      testEnv
    );
    const clientOrg = await createOrganization(
      { name: `${prefix} Client Org`, owner_id: clientUser.id },
      testEnv
    );

    const refCode = await getOrCreateSalesReferralCode(partnerUser.id, testEnv);
    const refRecord = await recordCustomerReferral({
      referralCode: refCode.code,
      referredUserId: clientUser.id,
      organizationId: clientOrg.id,
    }, testEnv);
    await approveCustomerAttribution(
      refRecord.attribution!.id,
      'admin-id',
      'Test setup approval',
      { allowExistingCustomerOverride: true },
      testEnv
    );

    const partnerToken = await signAppToken(partnerUser.id, undefined, undefined, testEnv.JWT_SECRET, testEnv);
    return { partnerUser, clientUser, clientOrg, attribution: refRecord.attribution!, partnerToken };
  }

  // --------------------------------------------------------------------------
  // 1. Logged-in active Sales Partner can retrieve authorized customer list
  // --------------------------------------------------------------------------
  test('1. Logged-in active Sales Partner can retrieve their authorized customer list (Worker and Node)', async () => {
    const { partnerUser, clientOrg, partnerToken } = await createPartnerWithAttributedCustomer('reg1');

    // 1.1 Worker with Authorization: Bearer header
    const workerReq = new Request('https://eventgamestudio.kiap93-kmj.workers.dev/api/sales/customers?page=1&limit=15&sort_by=latest_activity', {
      headers: {
        Authorization: `Bearer ${partnerToken}`,
      },
    });
    const workerRes = await worker.fetch(workerReq, testEnv as any);
    expect(workerRes.status).toBe(200);

    const workerBody = (await workerRes.json()) as any;
    expect(workerBody.success).toBe(true);
    expect(workerBody.total).toBe(1);
    expect(workerBody.customers).toHaveLength(1);
    expect(workerBody.customers[0].organization_id).toBe(clientOrg.id);

    // 1.2 Worker with session cookie: app_token
    const cookieReq = new Request('https://eventgamestudio.kiap93-kmj.workers.dev/api/sales/customers?page=1&limit=15', {
      headers: {
        Cookie: `app_token=${partnerToken}`,
      },
    });
    const cookieRes = await worker.fetch(cookieReq, testEnv as any);
    expect(cookieRes.status).toBe(200);

    // 1.3 Node / Express middleware execution
    let nextCalled = false;
    let errStatus: number | null = null;
    let errBody: any = null;

    const req: any = {
      headers: { authorization: `Bearer ${partnerToken}` },
      query: {},
    };
    const res: any = {
      status: (code: number) => {
        errStatus = code;
        return { json: (b: any) => { errBody = b; } };
      },
    };

    await authenticateSalesPartner(req, res, async () => {
      nextCalled = true;
    });

    expect(nextCalled).toBe(true);
    expect(req.user?.id).toBe(partnerUser.id);
    expect(req.salesPartnerProfile?.status).toBe('active');
  });

  // --------------------------------------------------------------------------
  // 2. Logged-out request returns 401
  // --------------------------------------------------------------------------
  test('2. Logged-out request returns 401 with expected error message (Worker and Node)', async () => {
    // 2.1 Worker
    const workerReq = new Request('https://eventgamestudio.kiap93-kmj.workers.dev/api/sales/customers?page=1&limit=15&sort_by=latest_activity');
    const workerRes = await worker.fetch(workerReq, testEnv as any);
    expect(workerRes.status).toBe(401);

    const workerBody = (await workerRes.json()) as any;
    expect(workerBody.error).toBe('Unauthenticated: Missing or invalid Authorization header or session cookie');

    // 2.2 Express middleware
    let nextCalled = false;
    let statusCode: number | null = null;
    let jsonBody: any = null;

    const req: any = { headers: {}, query: {} };
    const res: any = {
      status: (code: number) => {
        statusCode = code;
        return { json: (b: any) => { jsonBody = b; } };
      },
    };

    await authenticateSalesPartner(req, res, async () => {
      nextCalled = true;
    });

    expect(nextCalled).toBe(false);
    expect(statusCode).toBe(401);
    expect(jsonBody.error).toBe('Unauthenticated: Missing or invalid Authorization header or session cookie');
  });

  // --------------------------------------------------------------------------
  // 3. Invalid or expired token returns 401
  // --------------------------------------------------------------------------
  test('3. Invalid or expired token returns 401', async () => {
    // 3.1 Malformed token
    const malformedReq = new Request('https://eventgamestudio.kiap93-kmj.workers.dev/api/sales/customers', {
      headers: { Authorization: 'Bearer this.is.an.invalid.token' },
    });
    const malformedRes = await worker.fetch(malformedReq, testEnv as any);
    expect(malformedRes.status).toBe(401);

    const malformedBody = (await malformedRes.json()) as any;
    expect(malformedBody.error).toContain('Unauthenticated');

    // 3.2 Expired token
    const secret = getJwtSecret(testEnv.JWT_SECRET, testEnv);
    const expiredToken = await new jose.SignJWT({ sub: 'user-expired-id' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt(Math.floor(Date.now() / 1000) - 3600)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 10)
      .sign(secret);

    const expiredReq = new Request('https://eventgamestudio.kiap93-kmj.workers.dev/api/sales/customers', {
      headers: { Authorization: `Bearer ${expiredToken}` },
    });
    const expiredRes = await worker.fetch(expiredReq, testEnv as any);
    expect(expiredRes.status).toBe(401);

    const expiredBody = (await expiredRes.json()) as any;
    expect(expiredBody.error).toContain('Unauthenticated: Invalid or expired token');
  });

  // --------------------------------------------------------------------------
  // 4. Logged-in non-Sales Partner receives 403
  // --------------------------------------------------------------------------
  test('4. Logged-in non-Sales Partner receives 403 (standard customer, pending, suspended)', async () => {
    // 4.1 Standard customer (no partner application)
    const normalUser = await createUser({ email: 'normal.cust@example.com', name: 'Normal Customer' }, testEnv);
    const normalToken = await signAppToken(normalUser.id, undefined, undefined, testEnv.JWT_SECRET, testEnv);

    const normalReq = new Request('https://eventgamestudio.kiap93-kmj.workers.dev/api/sales/customers', {
      headers: { Authorization: `Bearer ${normalToken}` },
    });
    const normalRes = await worker.fetch(normalReq, testEnv as any);
    expect(normalRes.status).toBe(403);
    const normalBody = (await normalRes.json()) as any;
    expect(normalBody.error).toContain('Forbidden: Active Sales Partner access required');

    // 4.2 Pending partner
    const pendingUser = await createUser({ email: 'pending.p@example.com', name: 'Pending Partner' }, testEnv);
    await createSalesPartnerApplication(pendingUser.id, { legal_name: 'Pending Agency', country_code: 'MY' }, testEnv);
    const pendingToken = await signAppToken(pendingUser.id, undefined, undefined, testEnv.JWT_SECRET, testEnv);

    const pendingReq = new Request('https://eventgamestudio.kiap93-kmj.workers.dev/api/sales/customers', {
      headers: { Authorization: `Bearer ${pendingToken}` },
    });
    const pendingRes = await worker.fetch(pendingReq, testEnv as any);
    expect(pendingRes.status).toBe(403);

    // 4.3 Suspended partner
    const suspendedUser = await createUser({ email: 'suspended.p@example.com', name: 'Suspended Partner' }, testEnv);
    await createSalesPartnerApplication(suspendedUser.id, { legal_name: 'Suspended Agency', country_code: 'MY' }, testEnv);
    await updateSalesPartnerStatus(suspendedUser.id, 'suspended', 'admin-id', testEnv);
    const suspendedToken = await signAppToken(suspendedUser.id, undefined, undefined, testEnv.JWT_SECRET, testEnv);

    const suspendedReq = new Request('https://eventgamestudio.kiap93-kmj.workers.dev/api/sales/customers', {
      headers: { Authorization: `Bearer ${suspendedToken}` },
    });
    const suspendedRes = await worker.fetch(suspendedReq, testEnv as any);
    expect(suspendedRes.status).toBe(403);
  });

  // --------------------------------------------------------------------------
  // 5. Customer data belonging to another Sales Partner is not exposed
  // --------------------------------------------------------------------------
  test('5. Customer data belonging to another Sales Partner is not exposed (multi-tenant isolation & IDOR prevention)', async () => {
    const partnerA = await createPartnerWithAttributedCustomer('isoA');
    const partnerB = await createPartnerWithAttributedCustomer('isoB');

    // 5.1 Partner A fetches customers -> only sees Org A
    const reqA = new Request('https://eventgamestudio.kiap93-kmj.workers.dev/api/sales/customers', {
      headers: { Authorization: `Bearer ${partnerA.partnerToken}` },
    });
    const resA = await worker.fetch(reqA, testEnv as any);
    const bodyA = (await resA.json()) as any;
    expect(bodyA.total).toBe(1);
    expect(bodyA.customers[0].organization_id).toBe(partnerA.clientOrg.id);
    expect(bodyA.customers[0].organization_id).not.toBe(partnerB.clientOrg.id);

    // 5.2 Partner B attempts to fetch Partner A's customer details via IDOR
    const idorReq = new Request(`https://eventgamestudio.kiap93-kmj.workers.dev/api/sales/customers/${partnerA.attribution.id}`, {
      headers: { Authorization: `Bearer ${partnerB.partnerToken}` },
    });
    const idorRes = await worker.fetch(idorReq, testEnv as any);
    expect(idorRes.status).toBe(404);
  });

  // --------------------------------------------------------------------------
  // 6. Session refresh and page reload work correctly
  // --------------------------------------------------------------------------
  test('6. Session refresh and page reload work correctly with app_token', async () => {
    const { partnerUser, partnerToken } = await createPartnerWithAttributedCustomer('sess6');

    // Verify token can be verified and refreshed
    const { payload } = await jose.jwtVerify(partnerToken, getJwtSecret(testEnv.JWT_SECRET, testEnv));
    expect(payload.sub).toBe(partnerUser.id);

    // Re-sign new token (simulating session refresh)
    const refreshedToken = await signAppToken(partnerUser.id, undefined, undefined, testEnv.JWT_SECRET, testEnv);
    const refreshReq = new Request('https://eventgamestudio.kiap93-kmj.workers.dev/api/sales/customers', {
      headers: { Authorization: `Bearer ${refreshedToken}` },
    });
    const refreshRes = await worker.fetch(refreshReq, testEnv as any);
    expect(refreshRes.status).toBe(200);
  });

  // --------------------------------------------------------------------------
  // 7. Frontend requests use intended API environment and app_token
  // --------------------------------------------------------------------------
  test('7. Frontend apiFetch attaches Authorization: Bearer <app_token> and builds correct URL', async () => {
    const dummyToken = 'mock-bearer-token-12345';
    let interceptedUrl: string | null = null;
    let interceptedHeaders: Headers | null = null;
    let interceptedCredentials: any = null;

    // Mock global storage
    const mockStorage: Record<string, string> = {
      app_token: dummyToken,
      active_org_id: 'org-test-999',
    };

    (globalThis as any).window = {
      localStorage: {
        getItem: (k: string) => mockStorage[k] || null,
        setItem: (k: string, v: string) => { mockStorage[k] = v; },
        removeItem: (k: string) => { delete mockStorage[k]; },
      },
      location: { origin: 'https://eventgamestudio.com' },
      __ENV__: {
        VITE_API_BASE_URL: 'https://eventgamestudio.kiap93-kmj.workers.dev',
      },
    };

    // Mock fetch
    const originalFetch = globalThis.fetch;
    (globalThis as any).fetch = async (input: any, init: any) => {
      interceptedUrl = String(input);
      interceptedHeaders = new Headers(init?.headers);
      interceptedCredentials = init?.credentials;
      return new Response(JSON.stringify({ success: true, customers: [], total: 0 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    try {
      const res = await apiFetch('/api/sales/customers?page=1&limit=15&sort_by=latest_activity');
      expect(res.status).toBe(200);
      expect(interceptedUrl).toBe('https://eventgamestudio.kiap93-kmj.workers.dev/api/sales/customers?page=1&limit=15&sort_by=latest_activity');
      expect(interceptedHeaders?.get('Authorization')).toBe(`Bearer ${dummyToken}`);
      expect(interceptedHeaders?.get('x-organization-id')).toBe('org-test-999');
      expect(interceptedCredentials).toBe('include');
    } finally {
      globalThis.fetch = originalFetch;
      delete (globalThis as any).window;
    }
  });

  // --------------------------------------------------------------------------
  // 8. Node and Worker implementations pass equivalent authentication tests
  // --------------------------------------------------------------------------
  test('8. Node and Worker implementations pass equivalent authentication and authorization tests', async () => {
    const { partnerUser, clientOrg, partnerToken } = await createPartnerWithAttributedCustomer('parity8');

    // 8.1 Active partner: Worker vs Direct Node list
    const workerReq = new Request('https://eventgamestudio.kiap93-kmj.workers.dev/api/sales/customers', {
      headers: { Authorization: `Bearer ${partnerToken}` },
    });
    const workerRes = await worker.fetch(workerReq, testEnv as any);
    const workerData = (await workerRes.json()) as any;

    const nodeData = await listSalesPartnerCustomers(partnerUser.id, {}, testEnv);

    expect(workerRes.status).toBe(200);
    expect(workerData.total).toBe(nodeData.total);
    expect(workerData.customers[0].id).toBe(nodeData.customers[0].id);
    expect(workerData.customers[0].organization_id).toBe(nodeData.customers[0].organization_id);

    // 8.2 Unauthenticated: Worker returns 401, Node middleware returns 401
    const unauthWorkerRes = await worker.fetch(new Request('https://test.local/api/sales/customers'), testEnv as any);
    expect(unauthWorkerRes.status).toBe(401);

    let nodeStatusCode: number | null = null;
    const req: any = { headers: {}, query: {} };
    const res: any = {
      status: (c: number) => {
        nodeStatusCode = c;
        return { json: () => {} };
      },
    };
    await authenticateSalesPartner(req, res, async () => {});
    expect(nodeStatusCode).toBe(401);
  });
});
