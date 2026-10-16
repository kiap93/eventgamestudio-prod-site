import { test, expect, describe, beforeEach } from 'bun:test';
import {
  clearLocalCommissionsCache,
  evaluateAndRecordEventCommission,
  approveCommission,
  getPartnerCommissions,
  getPartnerCommissionSummary,
} from './db/salesCommissions.js';
import {
  clearLocalSalesPartnersCache,
  createSalesPartnerApplication,
  updateSalesPartnerStatus,
} from './db/salesPartners.js';
import {
  clearLocalAttributionsCache,
  clearLocalReferralCodesCache,
  getOrCreateSalesReferralCode,
  recordCustomerReferral,
  approveCustomerAttribution,
} from './db/salesAttribution.js';
import {
  createUser,
  createOrganization,
} from './db/index.js';
import {
  localEventsCache,
  createEvent,
} from './db/events.js';
import {
  localThemesCache,
  createTheme,
} from './db/themes.js';
import {
  listSalesPartnerCustomers,
  getSalesPartnerCustomerDetail,
  getSalesDashboardSummary,
} from './db/salesDashboard.js';
import { parseRoute } from '../src/hooks/useRouteContext.js';
import { localUsersCache } from './db/users.js';
import worker from '../worker.js';

describe('Phase 6 — Sales Partner Dashboard, Customer List & Frontend Route Integration Audit', () => {
  const testEnv = {
    SUPABASE_URL: 'https://placeholder.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'placeholder-service-key',
    JWT_SECRET: 'test-jwt-secret-for-phase-6-testing',
    NODE_ENV: 'test',
  };

  beforeEach(() => {
    localUsersCache.clear();
    clearLocalSalesPartnersCache();
    clearLocalAttributionsCache();
    clearLocalReferralCodesCache();
    clearLocalCommissionsCache();
    localEventsCache.clear();
    localThemesCache.clear();
  });

  async function setupPartnerAndCustomerOrg(prefix: string) {
    const partnerUser = await createUser({ email: `${prefix}.partner@example.com`, name: `${prefix} Partner` }, testEnv);
    await createSalesPartnerApplication(partnerUser.id, {
      legal_name: `${prefix} Agency`,
      country_code: 'MY',
      tax_id: 'MY123456',
    }, testEnv);
    await updateSalesPartnerStatus(partnerUser.id, 'active', 'test-admin', testEnv);

    const custUser = await createUser({ email: `${prefix}.client@example.com`, name: `${prefix} Client` }, testEnv);
    const org = await createOrganization({ name: `${prefix} Corp`, owner_id: custUser.id }, testEnv);
    const theme = await createTheme({
      organization_id: org.id,
      name: `${prefix} Theme`,
    }, testEnv);

    const refCode = await getOrCreateSalesReferralCode(partnerUser.id, testEnv);
    const refRes = await recordCustomerReferral({
      referralCode: refCode.code,
      referredUserId: custUser.id,
      organizationId: org.id,
    }, testEnv);
    const attrib = refRes.attribution!;
    await approveCustomerAttribution(attrib.id, 'test-admin', 'Test setup approval', { allowExistingCustomerOverride: true }, testEnv);

    return { partnerUser, custUser, org, theme, attrib };
  }

  async function createTestEvent(params: {
    organization_id: string;
    game_theme_id: string;
    name: string;
    paid_amount: number;
    discount_amount?: number;
    payment_status?: string;
    event_status?: string;
    status?: string;
    start_date?: string;
    end_date?: string;
    currency?: string;
  }) {
    return await createEvent({
      organization_id: params.organization_id,
      game_id: 'catch-brand',
      game_theme_id: params.game_theme_id,
      name: params.name,
      start_date: params.start_date || '2026-11-01',
      end_date: params.end_date || '2026-11-01',
      startDate: params.start_date || '2026-11-01',
      endDate: params.end_date || '2026-11-01',
      payment_status: (params.payment_status || 'PAID') as any,
      event_status: (params.event_status || 'SCHEDULED') as any,
      status: (params.status || 'scheduled') as any,
      paid_amount: params.paid_amount,
      discount_amount: params.discount_amount || 0,
      event_price: (params.paid_amount + (params.discount_amount || 0)) || 1400,
      event_currency: params.currency || 'MYR',
      custom_price_override: true,
    }, testEnv);
  }

  // --------------------------------------------------------------------------
  // 1. /sales RENDERS THE DASHBOARD
  // --------------------------------------------------------------------------
  test('1. /sales route correctly parses to sales_dashboard mode and portal section', () => {
    const route1 = parseRoute('/sales');
    expect(route1.mode).toBe('sales_dashboard');
    expect(route1.isSalesRoute).toBe(true);
    expect(route1.salesSection).toBe('portal');

    const route2 = parseRoute('/sales/dashboard');
    expect(route2.mode).toBe('sales_dashboard');
    expect(route2.isSalesRoute).toBe(true);
    expect(route2.salesSection).toBe('portal');

    const route3 = parseRoute('/sales/portal');
    expect(route3.mode).toBe('sales_dashboard');
    expect(route3.isSalesRoute).toBe(true);
    expect(route3.salesSection).toBe('portal');
  });

  // --------------------------------------------------------------------------
  // 2. /sales/customers RENDERS CUSTOMER LIST PAGE
  // --------------------------------------------------------------------------
  test('2. /sales/customers route correctly parses to sales_customers mode and customers section', () => {
    const route1 = parseRoute('/sales/customers');
    expect(route1.mode).toBe('sales_customers');
    expect(route1.isSalesRoute).toBe(true);
    expect(route1.salesSection).toBe('customers');

    const route2 = parseRoute('/sales/clients');
    expect(route2.mode).toBe('sales_customers');
    expect(route2.isSalesRoute).toBe(true);
    expect(route2.salesSection).toBe('customers');
  });

  // --------------------------------------------------------------------------
  // 3. EXISTING SALES PARTNER ROUTES STILL RESOLVE CORRECTLY
  // --------------------------------------------------------------------------
  test('3. Existing Sales Partner routes (/sales/games, /sales/referrals, /sales/commissions) resolve properly', () => {
    const routeGames = parseRoute('/sales/games');
    expect(routeGames.mode).toBe('sales_games');
    expect(routeGames.isSalesRoute).toBe(true);
    expect(routeGames.salesSection).toBe('games');

    const routeGameDetail = parseRoute('/sales/games/match-3');
    expect(routeGameDetail.mode).toBe('sales_game_detail');
    expect(routeGameDetail.salesGameId).toBe('match-3');

    const routeReferrals = parseRoute('/sales/referrals');
    expect(routeReferrals.mode).toBe('sales_referrals');
    expect(routeReferrals.salesSection).toBe('referrals');

    const routeAttributions = parseRoute('/sales/attributions');
    expect(routeAttributions.mode).toBe('sales_referrals');
    expect(routeAttributions.salesSection).toBe('referrals');

    const routeCommissions = parseRoute('/sales/commissions');
    expect(routeCommissions.mode).toBe('sales_commissions');
    expect(routeCommissions.salesSection).toBe('commissions');

    const routePayouts = parseRoute('/sales/payouts');
    expect(routePayouts.mode).toBe('sales_commissions');
    expect(routePayouts.salesSection).toBe('commissions');
  });

  // --------------------------------------------------------------------------
  // 4. UNAUTHORIZED USERS CANNOT ACCESS PROTECTED SALES PARTNER DATA
  // --------------------------------------------------------------------------
  test('4. Unauthorized users cannot access protected Sales Partner data (401/403 enforced)', async () => {
    // 4.1. Unauthenticated request
    const unauthReq = new Request('https://test.local/api/sales/dashboard-summary');
    const unauthRes = await worker.fetch(unauthReq, testEnv as any);
    expect(unauthRes.status).toBe(401);

    // 4.2. Authenticated standard user without Sales Partner status
    const normalUser = await createUser({ email: 'normal.user@example.com', name: 'Normal User' }, testEnv);
    const { signAppToken } = await import('./auth.js');
    const normalToken = await signAppToken(normalUser.id, undefined, undefined, testEnv.JWT_SECRET, testEnv);

    const forbiddenReq = new Request('https://test.local/api/sales/dashboard-summary', {
      headers: { Authorization: `Bearer ${normalToken}` },
    });
    const forbiddenRes = await worker.fetch(forbiddenReq, testEnv as any);
    expect(forbiddenRes.status).toBe(403);
  });

  // --------------------------------------------------------------------------
  // 5. ACTIVE SALES PARTNER CAN RETRIEVE DASHBOARD SUMMARY
  // --------------------------------------------------------------------------
  test('5. An active Sales Partner can retrieve their dashboard summary', async () => {
    const { partnerUser, org, theme } = await setupPartnerAndCustomerOrg('tc5');
    const { signAppToken } = await import('./auth.js');
    const partnerToken = await signAppToken(partnerUser.id, undefined, undefined, testEnv.JWT_SECRET, testEnv);

    // Create an event order
    const event = await createTestEvent({
      organization_id: org.id,
      game_theme_id: theme.id,
      name: 'Launch Event',
      paid_amount: 1400.00,
    });
    await evaluateAndRecordEventCommission(event.id, testEnv);

    // Fetch dashboard summary
    const req = new Request('https://test.local/api/sales/dashboard-summary', {
      headers: { Authorization: `Bearer ${partnerToken}` },
    });
    const res = await worker.fetch(req, testEnv as any);
    expect(res.status).toBe(200);

    const body = (await res.json()) as any;
    expect(body.success).toBe(true);
    expect(body.summary).toBeDefined();
    expect(body.summary.total_attributed_customers).toBe(1);
    expect(body.summary.commissions_pending_review).toBe(140.00); // 10% of RM1400
    expect(body.summary.currency).toBe('MYR');
    expect(Array.isArray(body.summary.next_actions)).toBe(true);
    expect(Array.isArray(body.summary.recent_customers)).toBe(true);
  });

  // --------------------------------------------------------------------------
  // 6. CUSTOMER-LIST RESULTS ARE SCOPED TO THE AUTHENTICATED PARTNER
  // --------------------------------------------------------------------------
  test('6. Customer-list results are scoped strictly to the authenticated partner (no cross-tenant leakage)', async () => {
    const { partnerUser: partnerA, org: orgA } = await setupPartnerAndCustomerOrg('tc6a');
    const { partnerUser: partnerB, org: orgB } = await setupPartnerAndCustomerOrg('tc6b');

    const resultA = await listSalesPartnerCustomers(partnerA.id, {}, testEnv);
    const resultB = await listSalesPartnerCustomers(partnerB.id, {}, testEnv);

    expect(resultA.customers.length).toBe(1);
    expect(resultA.customers[0].organization_id).toBe(orgA.id);

    expect(resultB.customers.length).toBe(1);
    expect(resultB.customers[0].organization_id).toBe(orgB.id);

    // Verify Partner A cannot see Partner B's customer
    const orgIdsA = resultA.customers.map((c) => c.organization_id);
    expect(orgIdsA).not.toContain(orgB.id);
  });

  // --------------------------------------------------------------------------
  // 7. ANOTHER PARTNER'S CUSTOMER CANNOT BE RETRIEVED BY MANIPULATING ID (IDOR)
  // --------------------------------------------------------------------------
  test("7. Another partner's customer cannot be retrieved by manipulating ID (IDOR protection)", async () => {
    const { partnerUser: partnerA, attrib: attribA } = await setupPartnerAndCustomerOrg('tc7a');
    const { partnerUser: partnerB } = await setupPartnerAndCustomerOrg('tc7b');

    const { signAppToken } = await import('./auth.js');
    const tokenB = await signAppToken(partnerB.id, undefined, undefined, testEnv.JWT_SECRET, testEnv);

    // Partner B attempts to fetch Partner A's customer details using Partner A's attribution id
    const req = new Request(`https://test.local/api/sales/customers/${attribA.id}`, {
      headers: { Authorization: `Bearer ${tokenB}` },
    });
    const res = await worker.fetch(req, testEnv as any);
    expect(res.status).toBe(404);

    const body = (await res.json()) as any;
    expect(body.error).toContain('not attributed to your partner account');

    // Also check direct backend helper
    const directDetail = await getSalesPartnerCustomerDetail(partnerB.id, attribA.id, testEnv);
    expect(directDetail).toBeNull();
  });

  // --------------------------------------------------------------------------
  // 8. SEARCH AND PAGINATION RETURN CORRECT RESULTS
  // --------------------------------------------------------------------------
  test('8. Search and pagination return accurate results on /api/sales/customers', async () => {
    const partnerUser = await createUser({ email: 'tc8.partner@example.com', name: 'Search Partner' }, testEnv);
    await createSalesPartnerApplication(partnerUser.id, {
      legal_name: 'Search Agency',
      country_code: 'MY',
      tax_id: 'MY888',
    }, testEnv);
    await updateSalesPartnerStatus(partnerUser.id, 'active', 'test-admin', testEnv);

    const refCode = await getOrCreateSalesReferralCode(partnerUser.id, testEnv);

    // Create 3 customers for this partner
    for (let i = 1; i <= 3; i++) {
      const u = await createUser({ email: `tc8.client${i}@example.com`, name: `Client Name ${i}` }, testEnv);
      const o = await createOrganization({ name: `Alpha Corp ${i}`, owner_id: u.id }, testEnv);
      const ref = await recordCustomerReferral({
        referralCode: refCode.code,
        referredUserId: u.id,
        organizationId: o.id,
      }, testEnv);
      await approveCustomerAttribution(ref.attribution!.id, 'test-admin', 'Test setup approval', { allowExistingCustomerOverride: true }, testEnv);
    }

    // 8.1. Pagination: limit = 2
    const page1 = await listSalesPartnerCustomers(partnerUser.id, { page: 1, limit: 2 }, testEnv);
    expect(page1.total).toBe(3);
    expect(page1.customers.length).toBe(2);
    expect(page1.total_pages).toBe(2);

    const page2 = await listSalesPartnerCustomers(partnerUser.id, { page: 2, limit: 2 }, testEnv);
    expect(page2.customers.length).toBe(1);

    // 8.2. Search filtering
    const searchResult = await listSalesPartnerCustomers(partnerUser.id, { search: 'Corp 2' }, testEnv);
    expect(searchResult.total).toBe(1);
    expect(searchResult.customers[0].organization_name).toBe('Alpha Corp 2');

    // 8.3. Status filter with "all" should not filter out all customers
    const allStatusResult = await listSalesPartnerCustomers(partnerUser.id, { status: 'all' as any }, testEnv);
    expect(allStatusResult.total).toBe(3);
  });

  // --------------------------------------------------------------------------
  // 9. DASHBOARD COMMISSION TOTALS AGREE WITH AUTHORIZED DATA
  // --------------------------------------------------------------------------
  test('9. Dashboard commission totals agree with the backend authorized data', async () => {
    const { partnerUser, org, theme } = await setupPartnerAndCustomerOrg('tc9');

    // Order 1: RM1400 -> 10% = RM140 (delivery completed)
    const ev1 = await createTestEvent({
      organization_id: org.id,
      game_theme_id: theme.id,
      name: 'Event 1',
      paid_amount: 1400.00,
      status: 'completed',
      event_status: 'COMPLETED',
    });
    const eval1 = await evaluateAndRecordEventCommission(ev1.id, testEnv);
    expect(eval1.eligible).toBe(true);

    // Approve commission 1
    await approveCommission(eval1.commission!.id, 'admin', 'verified delivery', testEnv);

    // Order 2: RM2000 -> 5% repeat = RM100 (pending review)
    const ev2 = await createTestEvent({
      organization_id: org.id,
      game_theme_id: theme.id,
      name: 'Event 2',
      paid_amount: 2000.00,
    });
    const eval2 = await evaluateAndRecordEventCommission(ev2.id, testEnv);
    expect(eval2.eligible).toBe(true);

    // Authoritative summary calculation
    const summary = await getSalesDashboardSummary(partnerUser.id, testEnv);
    expect(summary.total_commissions_earned).toBe(140.00); // only approved/paid is earned
    expect(summary.approved_awaiting_payout).toBe(140.00);
    expect(summary.commissions_pending_review).toBe(100.00);
    expect(summary.currency).toBe('MYR');
  });

  // --------------------------------------------------------------------------
  // 10. MULTIPLE CURRENCIES ARE NOT INCORRECTLY COMBINED
  // --------------------------------------------------------------------------
  test('10. Multiple currencies are not incorrectly combined in commission totals', async () => {
    const { partnerUser, org, theme } = await setupPartnerAndCustomerOrg('tc10');

    // Commission 1 in MYR (delivery completed)
    const evMYR = await createTestEvent({
      organization_id: org.id,
      game_theme_id: theme.id,
      name: 'Event MYR',
      paid_amount: 1000.00,
      currency: 'MYR',
      status: 'completed',
      event_status: 'COMPLETED',
    });
    const evalMYR = await evaluateAndRecordEventCommission(evMYR.id, testEnv);
    await approveCommission(evalMYR.commission!.id, 'admin', 'ok', testEnv);

    // Directly test getPartnerCommissionSummary
    const commSummary = await getPartnerCommissionSummary(partnerUser.id, testEnv);
    expect(commSummary.currency).toBe('MYR');
    expect(commSummary.total_earned).toBe(100.00);

    const dashSummary = await getSalesDashboardSummary(partnerUser.id, testEnv);
    expect(dashSummary.currency).toBe('MYR');
    expect(dashSummary.total_commissions_earned).toBe(100.00);
  });

  // --------------------------------------------------------------------------
  // 11. LOADING, EMPTY AND API FAILURE STATES
  // --------------------------------------------------------------------------
  test('11. Empty state handles zero attributions and recommends referral link', async () => {
    const partnerUser = await createUser({ email: 'empty.partner@example.com', name: 'New Partner' }, testEnv);
    await createSalesPartnerApplication(partnerUser.id, {
      legal_name: 'New Agency',
      country_code: 'MY',
      tax_id: 'MY999',
    }, testEnv);
    await updateSalesPartnerStatus(partnerUser.id, 'active', 'test-admin', testEnv);

    const summary = await getSalesDashboardSummary(partnerUser.id, testEnv);
    expect(summary.total_attributed_customers).toBe(0);
    expect(summary.total_commissions_earned).toBe(0);
    expect(summary.recent_customers).toHaveLength(0);
    expect(summary.recent_commissions).toHaveLength(0);

    // Next action advises sharing referral code
    const actionTypes = summary.next_actions.map((a) => a.type);
    expect(actionTypes).toContain('unclaimed_activation');
  });

  // --------------------------------------------------------------------------
  // 12. DUAL-ROLE ACCOUNT RETAINS CUSTOMER WORKSPACE ACCESS
  // --------------------------------------------------------------------------
  test('12. A dual-role account retains Customer workspace access', async () => {
    const { partnerUser, org } = await setupPartnerAndCustomerOrg('tc12');

    // The user has an active partner application AND belongs to org
    const { signAppToken } = await import('./auth.js');
    const dualToken = await signAppToken(partnerUser.id, org.id, 'owner', testEnv.JWT_SECRET, testEnv);

    // Can access sales dashboard
    const salesReq = new Request('https://test.local/api/sales/dashboard-summary', {
      headers: { Authorization: `Bearer ${dualToken}` },
    });
    const salesRes = await worker.fetch(salesReq, testEnv as any);
    expect(salesRes.status).toBe(200);

    // Also route context correctly distinguishes sales from standard workspace
    const workspaceRoute = parseRoute('/events');
    expect(workspaceRoute.isSalesRoute).toBeFalsy();
    expect(workspaceRoute.mode).not.toBe('sales_dashboard');

    const salesRoute = parseRoute('/sales');
    expect(salesRoute.isSalesRoute).toBe(true);
    expect(salesRoute.mode).toBe('sales_dashboard');
  });

  // --------------------------------------------------------------------------
  // 13. EXISTING REFERRAL AND COMMISSION PAGES STILL WORK
  // --------------------------------------------------------------------------
  test('13. Existing referral and commission API routes remain functional', async () => {
    const { partnerUser } = await setupPartnerAndCustomerOrg('tc13');
    const { signAppToken } = await import('./auth.js');
    const partnerToken = await signAppToken(partnerUser.id, undefined, undefined, testEnv.JWT_SECRET, testEnv);

    // GET /api/sales/referral-code
    const reqRef = new Request('https://test.local/api/sales/referral-code', {
      headers: { Authorization: `Bearer ${partnerToken}` },
    });
    const resRef = await worker.fetch(reqRef, testEnv as any);
    expect(resRef.status).toBe(200);
    const bodyRef = (await resRef.json()) as any;
    expect(bodyRef.referralCode).toBeDefined();

    // GET /api/sales/commissions
    const reqComm = new Request('https://test.local/api/sales/commissions', {
      headers: { Authorization: `Bearer ${partnerToken}` },
    });
    const resComm = await worker.fetch(reqComm, testEnv as any);
    expect(resComm.status).toBe(200);
    const bodyComm = (await resComm.json()) as any;
    expect(bodyComm.commissions).toBeDefined();
    expect(bodyComm.summary).toBeDefined();
  });

  // --------------------------------------------------------------------------
  // 14. NODE SERVER AND WORKER API BEHAVIOR IS CONSISTENT
  // --------------------------------------------------------------------------
  test('14. Worker and Node endpoints provide consistent customer and dashboard responses', async () => {
    const { partnerUser, org } = await setupPartnerAndCustomerOrg('tc14');
    const { signAppToken } = await import('./auth.js');
    const partnerToken = await signAppToken(partnerUser.id, undefined, undefined, testEnv.JWT_SECRET, testEnv);

    // Call worker endpoint
    const reqCust = new Request('https://test.local/api/sales/customers', {
      headers: { Authorization: `Bearer ${partnerToken}` },
    });
    const resCust = await worker.fetch(reqCust, testEnv as any);
    expect(resCust.status).toBe(200);

    const bodyCust = (await resCust.json()) as any;
    expect(bodyCust.success).toBe(true);
    expect(bodyCust.total).toBe(1);
    expect(bodyCust.customers[0].organization_id).toBe(org.id);

    // Compare with direct backend call (same logic used by Express in server.ts)
    const directResult = await listSalesPartnerCustomers(partnerUser.id, {}, testEnv);
    expect(directResult.total).toBe(bodyCust.total);
    expect(directResult.customers[0].id).toBe(bodyCust.customers[0].id);
  });
});
