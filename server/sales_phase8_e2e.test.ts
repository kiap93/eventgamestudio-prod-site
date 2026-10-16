import { test, expect, describe, beforeEach } from 'bun:test';
import fs from 'fs';
import path from 'path';
import { signAppToken, isUserDeveloperAdmin } from './auth.js';
import {
  createUser,
  getUserById,
  createOrganization,
} from './db/index.js';
import {
  localSalesPartnersCache,
  clearLocalSalesPartnersCache,
  createSalesPartnerApplication,
  updateSalesPartnerStatus,
  updateSalesPartnerRate,
  getSalesPartnerProfileByUserId,
  listSalesPartnerProfiles,
  getSalesPartnerAuditLogs,
} from './db/salesPartners.js';
import {
  clearLocalAttributionsCache,
  clearLocalReferralCodesCache,
  getOrCreateSalesReferralCode,
  recordCustomerReferral,
  approveCustomerAttribution,
  rejectCustomerAttribution,
  reassignCustomerAttribution,
  listCustomerAttributions,
  getAttributionById,
} from './db/salesAttribution.js';
import {
  clearLocalCommissionsCache,
  evaluateAndRecordEventCommission,
  approveCommission,
  adjustCommission,
  handleEventRefundCommissionClawback,
  createSalesOpportunityRequest,
  approveSalesOpportunity,
  getCommissionsReadyForPayout,
  createPayoutBatch,
  markPayoutBatchPaid,
  getCommissionAuditLogs,
} from './db/salesCommissions.js';
import {
  localEventsCache,
  createEvent,
} from './db/events.js';
import {
  localThemesCache,
  createTheme,
} from './db/themes.js';
import { localUsersCache } from './db/users.js';
import worker from '../worker.js';

describe('Phase 8 — End-to-End Verification, Security, Financial Reconciliation & Parity', () => {
  const testEnv = {
    SUPABASE_URL: 'https://placeholder.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'placeholder-service-key',
    JWT_SECRET: 'test-jwt-secret-for-phase-8-e2e-testing-32bytes',
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

  async function createTestPaidEvent(params: {
    organization_id: string;
    game_theme_id: string;
    name: string;
    paid_amount: number;
    discount_amount?: number;
    event_currency?: string;
    event_status?: string;
    start_date?: string;
    end_date?: string;
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
      payment_status: 'PAID' as any,
      event_status: (params.event_status || 'SCHEDULED') as any,
      status: 'scheduled' as any,
      paid_amount: params.paid_amount,
      discount_amount: params.discount_amount || 0,
      event_price: (params.paid_amount + (params.discount_amount || 0)) || 1400,
      event_currency: params.event_currency || 'MYR',
      custom_price_override: true,
    }, testEnv);
  }

  // ==========================================================================
  // SECTION 1: AUTHENTICATION & MULTI-TENANT AUTHORIZATION (IDOR PREVENTION)
  // ==========================================================================

  test('1. Unauthenticated request to protected sales endpoints returns 401', async () => {
    const endpoints = [
      '/api/sales/dashboard-summary',
      '/api/sales/customers',
      '/api/sales/commissions',
      '/api/sales/referral-code',
      '/api/developer/sales-partners',
    ];

    for (const path of endpoints) {
      const req = new Request(`http://localhost${path}`);
      const res = await worker.fetch(req, testEnv);
      expect(res.status).toBe(401);
    }
  });

  test('2. Customer user receives 403 on sales partner & admin endpoints', async () => {
    const customer = await createUser({ email: 'ordinary.customer@buyer.com', name: 'Buyer' }, testEnv);
    const token = await signAppToken(customer.id, undefined, undefined, testEnv.JWT_SECRET, testEnv);

    const endpoints = [
      '/api/sales/dashboard-summary',
      '/api/sales/customers',
      '/api/sales/commissions',
      '/api/sales/referral-code',
      '/api/developer/sales-partners',
    ];

    for (const path of endpoints) {
      const req = new Request(`http://localhost${path}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const res = await worker.fetch(req, testEnv);
      expect(res.status).toBe(403);
    }
  });

  test('3. Suspended Sales Partner receives 403 on sales workspace endpoints', async () => {
    const admin = await createUser({ email: 'admin@eventgamestudio.com', name: 'Admin', is_developer: true }, testEnv);
    const partner = await createUser({ email: 'suspended@agency.com', name: 'Suspended Partner' }, testEnv);
    await createSalesPartnerApplication(partner.id, 'Suspended Agency', testEnv);
    await updateSalesPartnerStatus(partner.id, 'suspended', 'Investigation', admin.id, 'Policy violation', testEnv);

    const token = await signAppToken(partner.id, undefined, undefined, testEnv.JWT_SECRET, testEnv);

    const req = new Request('http://localhost/api/sales/dashboard-summary', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const res = await worker.fetch(req, testEnv);
    expect(res.status).toBe(403);
  });

  test('4. Partner A cannot access Partner B customer attributions or commissions (Tenant Isolation)', async () => {
    const admin = await createUser({ email: 'admin@eventgamestudio.com', name: 'Admin', is_developer: true }, testEnv);
    const partnerA = await createUser({ email: 'partner.a@agency.com', name: 'Partner A' }, testEnv);
    const partnerB = await createUser({ email: 'partner.b@agency.com', name: 'Partner B' }, testEnv);

    await createSalesPartnerApplication(partnerA.id, 'Agency A', testEnv);
    await updateSalesPartnerStatus(partnerA.id, 'active', 'Approved', admin.id, 'Launch', testEnv);
    await createSalesPartnerApplication(partnerB.id, 'Agency B', testEnv);
    await updateSalesPartnerStatus(partnerB.id, 'active', 'Approved', admin.id, 'Launch', testEnv);

    const codeA = await getOrCreateSalesReferralCode(partnerA.id, testEnv);
    const codeB = await getOrCreateSalesReferralCode(partnerB.id, testEnv);

    const custUserA = await createUser({ email: 'cust.a@client.com', name: 'Client A' }, testEnv);
    const orgA = await createOrganization({ name: 'Client A Corp', owner_id: custUserA.id }, testEnv);
    const refA = await recordCustomerReferral({ referralCode: codeA.code, userId: custUserA.id, organizationId: orgA.id }, testEnv);
    await approveCustomerAttribution(refA.attribution!.id, admin.id, 'Approved', testEnv);

    const custUserB = await createUser({ email: 'cust.b@client.com', name: 'Client B' }, testEnv);
    const orgB = await createOrganization({ name: 'Client B Corp', owner_id: custUserB.id }, testEnv);
    const refB = await recordCustomerReferral({ referralCode: codeB.code, userId: custUserB.id, organizationId: orgB.id }, testEnv);
    await approveCustomerAttribution(refB.attribution!.id, admin.id, 'Approved', testEnv);

    // Partner A requests customers
    const tokenA = await signAppToken(partnerA.id, undefined, undefined, testEnv.JWT_SECRET, testEnv);
    const req = new Request('http://localhost/api/sales/customers', {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    const res = await worker.fetch(req, testEnv);
    expect(res.status).toBe(200);
    const data: any = await res.json();
    expect(data.success).toBe(true);

    // Verify Partner A only sees customer A and never customer B
    const orgIds = data.customers.map((c: any) => c.organization_id);
    expect(orgIds).toContain(orgA.id);
    expect(orgIds).not.toContain(orgB.id);
  });

  test('5. Server ignores client-supplied actor ID and resolves authenticated actor server-side', async () => {
    const admin = await createUser({ email: 'admin@eventgamestudio.com', name: 'Admin', is_developer: true }, testEnv);
    const partner = await createUser({ email: 'partner.actor@agency.com', name: 'Partner' }, testEnv);
    await createSalesPartnerApplication(partner.id, 'Agency', testEnv);

    const adminToken = await signAppToken(admin.id, undefined, undefined, testEnv.JWT_SECRET, testEnv);

    // Call update status with a fake actor_user_id in body
    const req = new Request(`http://localhost/api/developer/sales-partners/${partner.id}/status`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        status: 'active',
        reason: 'Legitimate activation',
        actor_user_id: '00000000-0000-0000-0000-000000000000', // Client spoof attempt
      }),
    });
    const res = await worker.fetch(req, testEnv);
    expect(res.status).toBe(200);

    const logs = await getSalesPartnerAuditLogs(partner.id, testEnv);
    const activeLog = logs.find((l) => l.action === 'ACTIVATED');
    expect(activeLog).toBeDefined();
    // Must be admin.id, NOT the spoofed ID
    expect(activeLog?.actor_user_id).toBe(admin.id);
  });

  // ==========================================================================
  // SECTION 2: ATTRIBUTION LIFECYCLE, DUPLICATES, SELF-REFERRALS & COMPETING CLAIMS
  // ==========================================================================

  test('6. Duplicate referral capture from same partner is idempotent', async () => {
    const partner = await createUser({ email: 'partner.dup@agency.com', name: 'Partner Dup' }, testEnv);
    await createSalesPartnerApplication(partner.id, 'Agency Dup', testEnv);
    await updateSalesPartnerStatus(partner.id, 'active', 'Approved', undefined, 'Initial', testEnv);
    const code = await getOrCreateSalesReferralCode(partner.id, testEnv);

    const clientEmail = 'duplicate.buyer@brand.com';

    // First capture
    const first = await recordCustomerReferral({
      referralCode: code.code,
      prospectEmail: clientEmail,
      referralMethod: 'link',
    }, testEnv);
    expect(first.success).toBe(true);

    // Second capture with identical code and prospectEmail
    const second = await recordCustomerReferral({
      referralCode: code.code,
      prospectEmail: clientEmail,
      referralMethod: 'link',
    }, testEnv);
    expect(second.success).toBe(true);
    expect(second.attribution?.id).toBe(first.attribution!.id);
  });

  test('7. Competing referral claim between two partners is flagged for Admin review', async () => {
    const partner1 = await createUser({ email: 'p1@agency.com', name: 'Partner 1' }, testEnv);
    const partner2 = await createUser({ email: 'p2@agency.com', name: 'Partner 2' }, testEnv);
    await createSalesPartnerApplication(partner1.id, 'Agency 1', testEnv);
    await createSalesPartnerApplication(partner2.id, 'Agency 2', testEnv);
    await updateSalesPartnerStatus(partner1.id, 'active', 'Ok', undefined, 'Init', testEnv);
    await updateSalesPartnerStatus(partner2.id, 'active', 'Ok', undefined, 'Init', testEnv);

    const code1 = await getOrCreateSalesReferralCode(partner1.id, testEnv);
    const code2 = await getOrCreateSalesReferralCode(partner2.id, testEnv);

    const prospectEmail = 'shared.enterprise@target.com';

    // Partner 1 captures lead
    const claim1 = await recordCustomerReferral({ referralCode: code1.code, prospectEmail }, testEnv);
    expect(claim1.attribution?.status).toBe('pending');
    expect(claim1.attribution?.is_competing_claim).toBeFalsy();

    // Partner 2 attempts to claim same lead
    const claim2 = await recordCustomerReferral({ referralCode: code2.code, prospectEmail }, testEnv);
    expect(claim2.success).toBe(true);
    expect(claim2.attribution?.is_competing_claim).toBe(true);
  });

  test('8. Self-referral attempt is marked disqualified from commissions', async () => {
    const partnerUser = await createUser({ email: 'partner.self@agency.com', name: 'Partner Self' }, testEnv);
    await createSalesPartnerApplication(partnerUser.id, 'Self Agency', testEnv);
    await updateSalesPartnerStatus(partnerUser.id, 'active', 'Ok', undefined, 'Init', testEnv);
    const code = await getOrCreateSalesReferralCode(partnerUser.id, testEnv);

    // Partner registers their own organization using their referral code
    const ownOrg = await createOrganization({ name: 'Partner Own Org', owner_id: partnerUser.id }, testEnv);
    const claim = await recordCustomerReferral({
      referralCode: code.code,
      userId: partnerUser.id,
      organizationId: ownOrg.id,
    }, testEnv);

    expect(claim.attribution?.is_self_referral).toBe(true);
    // Mark approved to test that even an approved attribution with is_self_referral is disqualified from commission
    claim.attribution!.status = 'approved';

    const theme = await createTheme({ organization_id: ownOrg.id, name: 'Self Theme' }, testEnv);
    const event = await createTestPaidEvent({
      organization_id: ownOrg.id,
      game_theme_id: theme.id,
      name: 'Self Event',
      paid_amount: 1400,
    });

    const comm = await evaluateAndRecordEventCommission(event.id, testEnv);
    expect(comm.eligible).toBe(false);
    expect(comm.reason).toContain('self-referral');
  });

  // ==========================================================================
  // SECTION 3: FINANCIAL RECONCILIATION & LEDGER INTEGRITY
  // ==========================================================================

  test('9. Financial Reconciliation: First order at 10% on Cash collected', async () => {
    const admin = await createUser({ email: 'admin@eventgamestudio.com', name: 'Admin', is_developer: true }, testEnv);
    const partner = await createUser({ email: 'partner.fin1@agency.com', name: 'Partner Fin' }, testEnv);
    await createSalesPartnerApplication(partner.id, 'Agency Fin', testEnv);
    await updateSalesPartnerStatus(partner.id, 'active', 'Ok', admin.id, 'Init', testEnv);
    const code = await getOrCreateSalesReferralCode(partner.id, testEnv);

    const cust = await createUser({ email: 'cust.fin1@brand.com', name: 'Cust Fin' }, testEnv);
    const org = await createOrganization({ name: 'Fin Org', owner_id: cust.id }, testEnv);
    const ref = await recordCustomerReferral({ referralCode: code.code, userId: cust.id, organizationId: org.id }, testEnv);
    await approveCustomerAttribution(ref.attribution!.id, admin.id, 'Approved', testEnv);

    const theme = await createTheme({ organization_id: org.id, name: 'Fin Theme' }, testEnv);

    // Order 1: RM1,400 Cash
    const event = await createTestPaidEvent({
      organization_id: org.id,
      game_theme_id: theme.id,
      name: 'Event 1',
      paid_amount: 1400.00,
      discount_amount: 0.00,
    });

    const res = await evaluateAndRecordEventCommission(event.id, testEnv);
    expect(res.eligible).toBe(true);
    const comm = res.commission!;
    expect(comm.order_type).toBe('first_order');
    expect(comm.commission_rate).toBe(0.10);
    expect(comm.commission_amount).toBe(140.00);
    expect(comm.cash_collected_amount).toBe(1400.00);
    expect(comm.promo_discount_amount).toBe(0.00);
  });

  test('10. Financial Reconciliation: Promotional credits strictly excluded from commission basis', async () => {
    const admin = await createUser({ email: 'admin@eventgamestudio.com', name: 'Admin', is_developer: true }, testEnv);
    const partner = await createUser({ email: 'partner.promo@agency.com', name: 'Partner Promo' }, testEnv);
    await createSalesPartnerApplication(partner.id, 'Promo Agency', testEnv);
    await updateSalesPartnerStatus(partner.id, 'active', 'Ok', admin.id, 'Init', testEnv);
    const code = await getOrCreateSalesReferralCode(partner.id, testEnv);

    const cust = await createUser({ email: 'cust.promo@brand.com', name: 'Cust Promo' }, testEnv);
    const org = await createOrganization({ name: 'Promo Org', owner_id: cust.id }, testEnv);
    const ref = await recordCustomerReferral({ referralCode: code.code, userId: cust.id, organizationId: org.id }, testEnv);
    await approveCustomerAttribution(ref.attribution!.id, admin.id, 'Approved', testEnv);

    const theme = await createTheme({ organization_id: org.id, name: 'Promo Theme' }, testEnv);

    // RM1,400 event paid with RM400 cash + RM1,000 promotional credits
    const event = await createTestPaidEvent({
      organization_id: org.id,
      game_theme_id: theme.id,
      name: 'Promo Event',
      paid_amount: 400.00,
      discount_amount: 1000.00,
    });

    const res = await evaluateAndRecordEventCommission(event.id, testEnv);
    expect(res.eligible).toBe(true);
    const comm = res.commission!;
    // 10% on RM400 cash = RM40.00 (NOT 10% on RM1400)
    expect(comm.commission_amount).toBe(40.00);
    expect(comm.cash_collected_amount).toBe(400.00);
    expect(comm.promo_discount_amount).toBe(1000.00);
  });

  test('11. Financial Reconciliation: Zero cash (100% Promo Credit) yields 0 commission and ineligible', async () => {
    const admin = await createUser({ email: 'admin@eventgamestudio.com', name: 'Admin', is_developer: true }, testEnv);
    const partner = await createUser({ email: 'partner.zerocash@agency.com', name: 'Partner Zero' }, testEnv);
    await createSalesPartnerApplication(partner.id, 'Zero Agency', testEnv);
    await updateSalesPartnerStatus(partner.id, 'active', 'Ok', admin.id, 'Init', testEnv);
    const code = await getOrCreateSalesReferralCode(partner.id, testEnv);

    const cust = await createUser({ email: 'cust.zerocash@brand.com', name: 'Cust Zero' }, testEnv);
    const org = await createOrganization({ name: 'Zero Org', owner_id: cust.id }, testEnv);
    const ref = await recordCustomerReferral({ referralCode: code.code, userId: cust.id, organizationId: org.id }, testEnv);
    await approveCustomerAttribution(ref.attribution!.id, admin.id, 'Approved', testEnv);

    const theme = await createTheme({ organization_id: org.id, name: 'Zero Theme' }, testEnv);

    // RM1,400 event paid 100% with promo credits (RM0 cash)
    const event = await createTestPaidEvent({
      organization_id: org.id,
      game_theme_id: theme.id,
      name: 'Free Promo Event',
      paid_amount: 0.00,
      discount_amount: 1400.00,
    });

    const res = await evaluateAndRecordEventCommission(event.id, testEnv);
    expect(res.eligible).toBe(false);
    expect(res.reason).toContain('promotional credits or free');
  });

  test('12. Financial Reconciliation: Repeat orders after 12 months require Admin-approved opportunity', async () => {
    const admin = await createUser({ email: 'admin@eventgamestudio.com', name: 'Admin', is_developer: true }, testEnv);
    const partner = await createUser({ email: 'partner.opp@agency.com', name: 'Partner Opp' }, testEnv);
    await createSalesPartnerApplication(partner.id, 'Opp Agency', testEnv);
    await updateSalesPartnerStatus(partner.id, 'active', 'Ok', admin.id, 'Init', testEnv);
    const partnerProfile = await getSalesPartnerProfileByUserId(partner.id, testEnv);
    const code = await getOrCreateSalesReferralCode(partner.id, testEnv);

    const cust = await createUser({ email: 'cust.opp@brand.com', name: 'Cust Opp' }, testEnv);
    const org = await createOrganization({ name: 'Opp Org', owner_id: cust.id }, testEnv);
    const ref = await recordCustomerReferral({ referralCode: code.code, userId: cust.id, organizationId: org.id }, testEnv);
    await approveCustomerAttribution(ref.attribution!.id, admin.id, 'Approved', testEnv);

    const theme = await createTheme({ organization_id: org.id, name: 'Opp Theme' }, testEnv);

    // Event 1: First order on 2026-11-01
    const event1 = await createTestPaidEvent({
      organization_id: org.id,
      game_theme_id: theme.id,
      name: 'Event 2026',
      paid_amount: 1400,
      start_date: '2026-11-01',
      end_date: '2026-11-01',
    });
    const comm1 = await evaluateAndRecordEventCommission(event1.id, testEnv);
    expect(comm1.eligible).toBe(true);

    // Backdate the first order's eligibility date to 14 months ago
    const pastDate = new Date();
    pastDate.setMonth(pastDate.getMonth() - 14);
    comm1.commission!.eligibility_date = pastDate.toISOString();

    // Event 2 placed without opportunity -> Ineligible
    const event2 = await createTestPaidEvent({
      organization_id: org.id,
      game_theme_id: theme.id,
      name: 'Event 2027 Late',
      paid_amount: 1400,
      start_date: '2026-11-15',
      end_date: '2026-11-15',
    });
    const comm2WithoutOpp = await evaluateAndRecordEventCommission(event2.id, testEnv);
    expect(comm2WithoutOpp.eligible).toBe(false);
    expect(comm2WithoutOpp.reason).toContain('Repeat order window has expired');

    // Partner requests exceptional opportunity and Admin approves
    const opp = await createSalesOpportunityRequest(
      {
        partnerUserId: partner.id,
        organizationId: org.id,
        title: '2027 Mid-Year Re-engagement Gala',
        description: 'Customer renewed after marketing pitch',
      },
      testEnv
    );

    await approveSalesOpportunity(opp.id, admin.id, { decisionNotes: 'Approved renewal commission' }, testEnv);

    // Give a brief delay so approval timestamp is strictly before order placement timestamp
    await new Promise((r) => setTimeout(r, 10));

    // Event 3 placed WITH approved opportunity -> Eligible under approved_opportunity!
    const event3 = await createTestPaidEvent({
      organization_id: org.id,
      game_theme_id: theme.id,
      name: 'Event 2027 Approved Opp',
      paid_amount: 1400,
      start_date: '2026-11-20',
      end_date: '2026-11-20',
    });
    const comm3WithOpp = await evaluateAndRecordEventCommission(event3.id, testEnv);
    expect(comm3WithOpp.eligible).toBe(true);
    expect(comm3WithOpp.commission?.order_type).toBe('approved_opportunity');
    expect(comm3WithOpp.commission?.commission_rate).toBe(0.05);
    expect(comm3WithOpp.commission?.commission_amount).toBe(70.00);
  });

  test('13. Financial Reconciliation: Currency Isolation between MYR and SGD events', async () => {
    const admin = await createUser({ email: 'admin@eventgamestudio.com', name: 'Admin', is_developer: true }, testEnv);
    const partner = await createUser({ email: 'partner.curr@agency.com', name: 'Partner Currency' }, testEnv);
    await createSalesPartnerApplication(partner.id, 'Currency Agency', testEnv);
    await updateSalesPartnerStatus(partner.id, 'active', 'Ok', admin.id, 'Init', testEnv);
    const code = await getOrCreateSalesReferralCode(partner.id, testEnv);

    // SG Organization
    const custSg = await createUser({ email: 'cust.sg@brand.com', name: 'Cust SG' }, testEnv);
    const orgSg = await createOrganization({ name: 'Singapore Corp', owner_id: custSg.id }, testEnv);
    const refSg = await recordCustomerReferral({ referralCode: code.code, userId: custSg.id, organizationId: orgSg.id }, testEnv);
    await approveCustomerAttribution(refSg.attribution!.id, admin.id, 'Approved', testEnv);

    const themeSg = await createTheme({ organization_id: orgSg.id, name: 'SG Theme' }, testEnv);

    const eventSg = await createTestPaidEvent({
      organization_id: orgSg.id,
      game_theme_id: themeSg.id,
      name: 'Singapore Expo',
      paid_amount: 800,
      event_currency: 'SGD',
    });

    const res = await evaluateAndRecordEventCommission(eventSg.id, testEnv);
    expect(res.eligible).toBe(true);
    expect(res.commission?.currency).toBe('SGD');
    expect(res.commission?.commission_amount).toBe(80); // 10% on SGD 800
  });

  test('14. Event refund voids commission and logs clawback audit record', async () => {
    const admin = await createUser({ email: 'admin@eventgamestudio.com', name: 'Admin', is_developer: true }, testEnv);
    const partner = await createUser({ email: 'partner.refund@agency.com', name: 'Partner Refund' }, testEnv);
    await createSalesPartnerApplication(partner.id, 'Refund Agency', testEnv);
    await updateSalesPartnerStatus(partner.id, 'active', 'Ok', admin.id, 'Init', testEnv);
    const code = await getOrCreateSalesReferralCode(partner.id, testEnv);

    const cust = await createUser({ email: 'cust.refund@brand.com', name: 'Cust Refund' }, testEnv);
    const org = await createOrganization({ name: 'Refund Org', owner_id: cust.id }, testEnv);
    const ref = await recordCustomerReferral({ referralCode: code.code, userId: cust.id, organizationId: org.id }, testEnv);
    await approveCustomerAttribution(ref.attribution!.id, admin.id, 'Approved', testEnv);

    const theme = await createTheme({ organization_id: org.id, name: 'Theme' }, testEnv);
    const event = await createTestPaidEvent({
      organization_id: org.id,
      game_theme_id: theme.id,
      name: 'Cancelled Event',
      paid_amount: 1400,
    });

    const commRes = await evaluateAndRecordEventCommission(event.id, testEnv);
    expect(commRes.eligible).toBe(true);
    const commId = commRes.commission!.id;

    // Customer cancels and requests refund
    const voided = await handleEventRefundCommissionClawback(
      event.id,
      'Customer requested cancellation and full refund',
      admin.id,
      testEnv
    );

    expect(voided).not.toBeNull();
    expect(voided?.status).toBe('voided');

    const logs = await getCommissionAuditLogs(commId, testEnv);
    const refundLog = logs.find((l) => l.action === 'VOIDED');
    expect(refundLog).toBeDefined();
    expect(refundLog?.previous_status).toBe('pending_review');
    expect(refundLog?.new_status).toBe('voided');
    expect(refundLog?.actor_user_id).toBe(admin.id);
  });

  test('15. Full Payout Lifecycle: Delivery completion -> Ready grouping -> Batch creation -> Paid', async () => {
    const admin = await createUser({ email: 'admin@eventgamestudio.com', name: 'Admin', is_developer: true }, testEnv);
    const partner = await createUser({ email: 'partner.batch@agency.com', name: 'Partner Batch' }, testEnv);
    await createSalesPartnerApplication(partner.id, 'Batch Agency', testEnv);
    await updateSalesPartnerStatus(partner.id, 'active', 'Ok', admin.id, 'Init', testEnv);
    const partnerProfile = await getSalesPartnerProfileByUserId(partner.id, testEnv);
    const code = await getOrCreateSalesReferralCode(partner.id, testEnv);

    const cust = await createUser({ email: 'cust.batch@brand.com', name: 'Cust Batch' }, testEnv);
    const org = await createOrganization({ name: 'Batch Org', owner_id: cust.id }, testEnv);
    const ref = await recordCustomerReferral({ referralCode: code.code, userId: cust.id, organizationId: org.id }, testEnv);
    await approveCustomerAttribution(ref.attribution!.id, admin.id, 'Approved', testEnv);

    const theme = await createTheme({ organization_id: org.id, name: 'Theme Batch' }, testEnv);
    const event = await createTestPaidEvent({
      organization_id: org.id,
      game_theme_id: theme.id,
      name: 'Delivered Event',
      paid_amount: 1400,
      event_status: 'COMPLETED',
    });

    const commRes = await evaluateAndRecordEventCommission(event.id, testEnv);
    expect(commRes.eligible).toBe(true);
    const commId = commRes.commission!.id;

    // Admin approves commission for payout
    await approveCommission(commId, admin.id, 'Verified delivery', testEnv);

    // Group ready for payout
    const ready = await getCommissionsReadyForPayout(testEnv);
    expect(ready.partners.length).toBeGreaterThanOrEqual(1);
    const partnerGroup = ready.partners.find((g) => g.partner.user_id === partner.id);
    expect(partnerGroup).toBeDefined();
    expect(partnerGroup?.total_amount).toBe(140.00);

    // Create payout batch
    const batch = await createPayoutBatch(
      [commId],
      admin.id,
      'Monthly payout batch Oct 2026',
      testEnv
    );

    expect(batch.status).toBe('draft');
    expect(batch.total_amount).toBe(140.00);

    // Mark payout batch paid
    const paidBatch = await markPayoutBatchPaid(
      batch.id,
      'BANK-TRANSFER-TX-998877',
      admin.id,
      'Settled via wire',
      testEnv
    );

    expect(paidBatch.status).toBe('paid');
    expect(paidBatch.payment_reference).toBe('BANK-TRANSFER-TX-998877');
    expect(paidBatch.paid_at).toBeDefined();
  });
});
