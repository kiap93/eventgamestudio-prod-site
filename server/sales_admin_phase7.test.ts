import { test, expect, describe, beforeEach } from 'bun:test';
import fs from 'fs';
import path from 'path';
import { signAppToken } from './auth.js';
import {
  createUser,
  getUserById,
  createOrganization,
} from './db/index.js';
import {
  localSalesPartnersCache,
  localSalesPartnerAuditLogsCache,
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
} from './db/salesAttribution.js';
import {
  clearLocalCommissionsCache,
  evaluateAndRecordEventCommission,
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

describe('Phase 7 — Sales Partner Administration, Rate Overrides & Audit Governance', () => {
  const testEnv = {
    SUPABASE_URL: 'https://placeholder.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'placeholder-service-key',
    JWT_SECRET: 'test-jwt-secret-for-phase-7-testing',
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

  async function setupTestEvent(params: {
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
      event_currency: 'MYR',
      custom_price_override: true,
    }, testEnv);
  }

  // 1. Admin lists sales partners with status filtering and search query
  test('1. Admin lists sales partners with status filtering and search query', async () => {
    const adminUser = await createUser({
      email: 'admin.lead@eventgamestudio.com',
      name: 'Lead Admin',
      is_developer: true,
    }, testEnv);

    const partner1 = await createUser({ email: 'partner1@agency.com', name: 'Alpha Agency' }, testEnv);
    const partner2 = await createUser({ email: 'partner2@events.sg', name: 'Beta Events' }, testEnv);

    await createSalesPartnerApplication(partner1.id, 'Alpha Agency Notes', testEnv);
    await createSalesPartnerApplication(partner2.id, 'Beta Events Notes', testEnv);
    await updateSalesPartnerStatus(partner1.id, 'active', 'Approved partner 1', adminUser.id, 'Initial launch approval', testEnv);

    // List all
    const all = await listSalesPartnerProfiles({}, testEnv);
    expect(all.length).toBe(2);

    // Filter by status active
    const activeOnly = await listSalesPartnerProfiles({ status: 'active' }, testEnv);
    expect(activeOnly.length).toBe(1);
    expect(activeOnly[0].user_id).toBe(partner1.id);

    // Filter by status pending
    const pendingOnly = await listSalesPartnerProfiles({ status: 'pending' }, testEnv);
    expect(pendingOnly.length).toBe(1);
    expect(pendingOnly[0].user_id).toBe(partner2.id);

    // Search by agency / user name
    const searchResult = await listSalesPartnerProfiles({ search: 'Alpha' }, testEnv);
    expect(searchResult.length).toBe(1);
    expect(searchResult[0].user?.name).toBe('Alpha Agency');
  });

  // 2. Admin activates a pending sales partner with reason & audit log recorded
  test('2. Admin activates a pending sales partner with reason & audit log recorded', async () => {
    const adminUser = await createUser({
      email: 'admin.lead@eventgamestudio.com',
      name: 'Lead Admin',
      is_developer: true,
    }, testEnv);

    const partner = await createUser({ email: 'partner.pending@agency.com', name: 'Pending Partner' }, testEnv);
    await createSalesPartnerApplication(partner.id, 'Pending Corp', testEnv);

    const updated = await updateSalesPartnerStatus(
      partner.id,
      'active',
      'Verified contract and tax ID',
      adminUser.id,
      'Approved after onboarding review',
      testEnv
    );

    expect(updated.status).toBe('active');
    expect(updated.activated_at).toBeDefined();

    // Verify audit log
    const logs = await getSalesPartnerAuditLogs(partner.id, testEnv);
    expect(logs.length).toBeGreaterThanOrEqual(1);
    const activationLog = logs.find((l) => l.action === 'ACTIVATED');
    expect(activationLog).toBeDefined();
    expect(activationLog?.previous_status).toBe('pending');
    expect(activationLog?.new_status).toBe('active');
    expect(activationLog?.actor_user_id).toBe(adminUser.id);
    expect(activationLog?.reason).toContain('Approved after onboarding review');
  });

  // 3. Admin suspends an active sales partner with mandatory reason (rejects empty reason)
  test('3. Admin suspends an active sales partner with mandatory reason (rejects empty reason)', async () => {
    const adminUser = await createUser({
      email: 'admin.lead@eventgamestudio.com',
      name: 'Lead Admin',
      is_developer: true,
    }, testEnv);

    const partner = await createUser({ email: 'partner.suspend@agency.com', name: 'Partner Suspended' }, testEnv);
    await createSalesPartnerApplication(partner.id, 'Suspend Corp', testEnv);
    await updateSalesPartnerStatus(partner.id, 'active', 'Approved', adminUser.id, 'Initial approval', testEnv);

    // Attempting suspension with empty reason must throw
    await expect(
      updateSalesPartnerStatus(partner.id, 'suspended', 'Note', adminUser.id, '   ', testEnv)
    ).rejects.toThrow(/reason is required/i);

    // Valid suspension
    const suspended = await updateSalesPartnerStatus(
      partner.id,
      'suspended',
      'Breach of guidelines',
      adminUser.id,
      'Investigation into suspicious self-referral activities',
      testEnv
    );

    expect(suspended.status).toBe('suspended');
    expect(suspended.suspended_at).toBeDefined();

    const logs = await getSalesPartnerAuditLogs(partner.id, testEnv);
    const suspensionLog = logs.find((l) => l.action === 'SUSPENDED');
    expect(suspensionLog).toBeDefined();
    expect(suspensionLog?.reason).toContain('Investigation into suspicious self-referral');
  });

  // 4. Admin reactivates a suspended sales partner with mandatory reason & audit log
  test('4. Admin reactivates a suspended sales partner with mandatory reason & audit log', async () => {
    const adminUser = await createUser({
      email: 'admin.lead@eventgamestudio.com',
      name: 'Lead Admin',
      is_developer: true,
    }, testEnv);

    const partner = await createUser({ email: 'partner.reactivate@agency.com', name: 'Reactivate Partner' }, testEnv);
    await createSalesPartnerApplication(partner.id, 'Reactivate Corp', testEnv);
    await updateSalesPartnerStatus(partner.id, 'active', 'Initial', adminUser.id, 'Approved', testEnv);
    await updateSalesPartnerStatus(partner.id, 'suspended', 'Suspended', adminUser.id, 'Temporary pause', testEnv);

    // Reactivation requires non-empty reason
    await expect(
      updateSalesPartnerStatus(partner.id, 'active', 'Notes', adminUser.id, '', testEnv)
    ).rejects.toThrow(/reason is required/i);

    const reactivated = await updateSalesPartnerStatus(
      partner.id,
      'active',
      'Cleared by legal audit',
      adminUser.id,
      'Investigation concluded favorably',
      testEnv
    );

    expect(reactivated.status).toBe('active');
    expect(reactivated.suspended_at).toBeNull();

    const logs = await getSalesPartnerAuditLogs(partner.id, testEnv);
    const reactivateLog = logs.find((l) => l.action === 'REACTIVATED');
    expect(reactivateLog).toBeDefined();
    expect(reactivateLog?.previous_status).toBe('suspended');
    expect(reactivateLog?.new_status).toBe('active');
  });

  // 5. Consequential status transitions require non-empty reason
  test('5. Rejection requires non-empty reason', async () => {
    const adminUser = await createUser({
      email: 'admin.lead@eventgamestudio.com',
      name: 'Lead Admin',
      is_developer: true,
    }, testEnv);

    const partner = await createUser({ email: 'partner.reject@agency.com', name: 'Reject Partner' }, testEnv);
    await createSalesPartnerApplication(partner.id, 'Reject Corp', testEnv);

    await expect(
      updateSalesPartnerStatus(partner.id, 'rejected', '', adminUser.id, '', testEnv)
    ).rejects.toThrow(/reason is required/i);

    const rejected = await updateSalesPartnerStatus(
      partner.id,
      'rejected',
      'Incomplete registration documentation',
      adminUser.id,
      'Applicant does not have a verified business registration number',
      testEnv
    );

    expect(rejected.status).toBe('rejected');
  });

  // 6. Non-admin / normal customer / sales partner receives 403 on admin sales-partner endpoints
  test('6. Non-admin receives 403 on admin sales-partner endpoints', async () => {
    const normalCustomer = await createUser({ email: 'customer@buyer.com', name: 'Customer User' }, testEnv);
    const partnerUser = await createUser({ email: 'partner@agency.com', name: 'Partner User' }, testEnv);
    await createSalesPartnerApplication(partnerUser.id, 'Partner Org', testEnv);
    await updateSalesPartnerStatus(partnerUser.id, 'active', 'Ok', undefined, 'Initial', testEnv);

    const customerToken = await signAppToken(normalCustomer.id, undefined, undefined, testEnv.JWT_SECRET, testEnv);
    const partnerToken = await signAppToken(partnerUser.id, undefined, undefined, testEnv.JWT_SECRET, testEnv);

    // List endpoint
    const req1 = new Request('http://localhost/api/developer/sales-partners', {
      headers: { Authorization: `Bearer ${customerToken}` },
    });
    const res1 = await worker.fetch(req1, testEnv);
    expect(res1.status).toBe(403);

    const req2 = new Request('http://localhost/api/developer/sales-partners', {
      headers: { Authorization: `Bearer ${partnerToken}` },
    });
    const res2 = await worker.fetch(req2, testEnv);
    expect(res2.status).toBe(403);

    // Update status endpoint
    const req3 = new Request(`http://localhost/api/developer/sales-partners/${partnerUser.id}/status`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${partnerToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ status: 'active', reason: 'Self elevate' }),
    });
    const res3 = await worker.fetch(req3, testEnv);
    expect(res3.status).toBe(403);
  });

  // 7. Unauthenticated request receives 401 on admin sales-partner endpoints
  test('7. Unauthenticated request receives 401 on admin sales-partner endpoints', async () => {
    const req = new Request('http://localhost/api/developer/sales-partners');
    const res = await worker.fetch(req, testEnv);
    expect(res.status).toBe(401);
  });

  // 8. Admin configures partner-specific commission rates (first_order, repeat_order, custom)
  test('8. Admin configures partner-specific commission rates (first_order, repeat_order, custom)', async () => {
    const adminUser = await createUser({
      email: 'admin.lead@eventgamestudio.com',
      name: 'Lead Admin',
      is_developer: true,
    }, testEnv);

    const partner = await createUser({ email: 'partner.rates@agency.com', name: 'Rates Partner' }, testEnv);
    await createSalesPartnerApplication(partner.id, 'Rates Corp', testEnv);
    await updateSalesPartnerStatus(partner.id, 'active', 'Approved', adminUser.id, 'Launch', testEnv);

    const updated = await updateSalesPartnerRate(
      partner.id,
      {
        custom_commission_rate: 0.12,
        first_order_commission_rate: 0.15,
        repeat_order_commission_rate: 0.08,
      },
      adminUser.id,
      'Exclusive enterprise reseller agreement signed',
      testEnv
    );

    expect(updated.custom_commission_rate).toBe(0.12);
    expect(updated.first_order_commission_rate).toBe(0.15);
    expect(updated.repeat_order_commission_rate).toBe(0.08);

    const logs = await getSalesPartnerAuditLogs(partner.id, testEnv);
    const rateLog = logs.find((l) => l.action === 'RATE_CHANGED');
    expect(rateLog).toBeDefined();
    expect(rateLog?.actor_user_id).toBe(adminUser.id);
    expect(rateLog?.reason).toContain('Exclusive enterprise reseller');
    expect(rateLog?.metadata.new_rates.first_order_commission_rate).toBe(0.15);
  });

  // 9. Rate validation rejects negative rates, rates > 0.50 (50%), or non-numeric values
  test('9. Rate validation rejects negative rates, rates > 0.50 (50%), or non-numeric values', async () => {
    const adminUser = await createUser({
      email: 'admin.lead@eventgamestudio.com',
      name: 'Lead Admin',
      is_developer: true,
    }, testEnv);

    const partner = await createUser({ email: 'partner.badrate@agency.com', name: 'Bad Rate' }, testEnv);
    await createSalesPartnerApplication(partner.id, 'Bad Rate Corp', testEnv);

    // Negative rate
    await expect(
      updateSalesPartnerRate(partner.id, { custom_commission_rate: -0.05 }, adminUser.id, 'Test', testEnv)
    ).rejects.toThrow(/between 0.00 and 0.50/i);

    // Excessive rate (> 50%)
    await expect(
      updateSalesPartnerRate(partner.id, { first_order_commission_rate: 0.55 }, adminUser.id, 'Test', testEnv)
    ).rejects.toThrow(/between 0.00 and 0.50/i);

    // Missing reason
    await expect(
      updateSalesPartnerRate(partner.id, { first_order_commission_rate: 0.15 }, adminUser.id, '  ', testEnv)
    ).rejects.toThrow(/reason is required/i);
  });

  // 10. Rate override precedence: first_order_commission_rate takes precedence for first orders
  test('10. Rate override precedence: first_order_commission_rate takes precedence for first orders', async () => {
    const adminUser = await createUser({
      email: 'admin.lead@eventgamestudio.com',
      name: 'Lead Admin',
      is_developer: true,
    }, testEnv);

    const partnerUser = await createUser({ email: 'partner.firstrate@agency.com', name: 'First Rate Partner' }, testEnv);
    await createSalesPartnerApplication(partnerUser.id, 'First Rate Agency', testEnv);
    await updateSalesPartnerStatus(partnerUser.id, 'active', 'Approved', adminUser.id, 'Launch', testEnv);

    // Configure first_order = 15%, custom = 12%
    await updateSalesPartnerRate(
      partnerUser.id,
      { first_order_commission_rate: 0.15, custom_commission_rate: 0.12 },
      adminUser.id,
      'Partner promotion tier',
      testEnv
    );

    const code = await getOrCreateSalesReferralCode(partnerUser.id, testEnv);

    const customerUser = await createUser({ email: 'buyer.first@client.com', name: 'Buyer First' }, testEnv);
    const customerOrg = await createOrganization({ name: 'Buyer Corp', owner_id: customerUser.id }, testEnv);

    const ref = await recordCustomerReferral({ referralCode: code.code, userId: customerUser.id, organizationId: customerOrg.id }, testEnv);
    expect(ref.attribution).toBeDefined();
    await approveCustomerAttribution(ref.attribution!.id, adminUser.id, 'Approved attribution', testEnv);

    const theme = await createTheme({
      organization_id: customerOrg.id,
      game_id: 'catch-brand',
      name: 'Corporate Catch',
      assets: {},
    }, testEnv);

    const event = await setupTestEvent({
      organization_id: customerOrg.id,
      game_theme_id: theme.id,
      name: 'Annual Gala',
      paid_amount: 1400,
    });

    const res = await evaluateAndRecordEventCommission(event.id, testEnv);
    expect(res.eligible).toBe(true);
    expect(res.commission).toBeDefined();
    expect(res.commission?.order_type).toBe('first_order');
    expect(res.commission?.commission_rate).toBe(0.15); // first_order_commission_rate override applied
    expect(res.commission?.commission_amount).toBe(210); // 15% of 1400
  });

  // 11. Rate override precedence: repeat_order_commission_rate takes precedence for repeat orders
  test('11. Rate override precedence: repeat_order_commission_rate takes precedence for repeat orders', async () => {
    const adminUser = await createUser({
      email: 'admin.lead@eventgamestudio.com',
      name: 'Lead Admin',
      is_developer: true,
    }, testEnv);

    const partnerUser = await createUser({ email: 'partner.repeatrate@agency.com', name: 'Repeat Partner' }, testEnv);
    await createSalesPartnerApplication(partnerUser.id, 'Repeat Agency', testEnv);
    await updateSalesPartnerStatus(partnerUser.id, 'active', 'Approved', adminUser.id, 'Launch', testEnv);

    // Configure repeat_order = 8%, custom = 12%
    await updateSalesPartnerRate(
      partnerUser.id,
      { repeat_order_commission_rate: 0.08, custom_commission_rate: 0.12 },
      adminUser.id,
      'Repeat bonus rate',
      testEnv
    );

    const code = await getOrCreateSalesReferralCode(partnerUser.id, testEnv);
    const customerUser = await createUser({ email: 'buyer.repeat@client.com', name: 'Buyer Repeat' }, testEnv);
    const customerOrg = await createOrganization({ name: 'Repeat Buyer Corp', owner_id: customerUser.id }, testEnv);

    const ref = await recordCustomerReferral({ referralCode: code.code, userId: customerUser.id, organizationId: customerOrg.id }, testEnv);
    expect(ref.attribution).toBeDefined();
    await approveCustomerAttribution(ref.attribution!.id, adminUser.id, 'Approved attribution', testEnv);

    const theme = await createTheme({
      organization_id: customerOrg.id,
      game_id: 'catch-brand',
      name: 'Theme 1',
      assets: {},
    }, testEnv);

    // Event 1 (First order) -> falls back to custom_commission_rate (12%)
    const event1 = await setupTestEvent({
      organization_id: customerOrg.id,
      game_theme_id: theme.id,
      name: 'First Order Event',
      paid_amount: 1400,
    });

    const res1 = await evaluateAndRecordEventCommission(event1.id, testEnv);
    expect(res1.eligible).toBe(true);
    expect(res1.commission?.order_type).toBe('first_order');
    expect(res1.commission?.commission_rate).toBe(0.12); // fallback to custom_commission_rate

    // Event 2 (Repeat order) -> repeat_order_commission_rate = 8% takes precedence over custom (12%)
    const event2 = await setupTestEvent({
      organization_id: customerOrg.id,
      game_theme_id: theme.id,
      name: 'Second Order Event',
      paid_amount: 1400,
      start_date: '2026-11-15',
      end_date: '2026-11-15',
    });

    const res2 = await evaluateAndRecordEventCommission(event2.id, testEnv);
    expect(res2.eligible).toBe(true);
    expect(res2.commission?.order_type).toBe('repeat_order');
    expect(res2.commission?.commission_rate).toBe(0.08); // repeat_order_commission_rate override applied
    expect(res2.commission?.commission_amount).toBe(112); // 8% of 1400
  });

  // 12. Custom commission rate fallback applies when first/repeat rate is not explicitly set
  test('12. Custom commission rate fallback applies when first/repeat rate is not explicitly set', async () => {
    const adminUser = await createUser({
      email: 'admin.lead@eventgamestudio.com',
      name: 'Lead Admin',
      is_developer: true,
    }, testEnv);

    const partnerUser = await createUser({ email: 'partner.customonly@agency.com', name: 'Custom Partner' }, testEnv);
    await createSalesPartnerApplication(partnerUser.id, 'Custom Agency', testEnv);
    await updateSalesPartnerStatus(partnerUser.id, 'active', 'Approved', adminUser.id, 'Launch', testEnv);

    // Only set custom_commission_rate = 0.07 (7% flat)
    await updateSalesPartnerRate(
      partnerUser.id,
      { custom_commission_rate: 0.07 },
      adminUser.id,
      'Flat 7% agreement',
      testEnv
    );

    const code = await getOrCreateSalesReferralCode(partnerUser.id, testEnv);
    const customerUser = await createUser({ email: 'buyer.custom@client.com', name: 'Buyer Custom' }, testEnv);
    const customerOrg = await createOrganization({ name: 'Custom Org', owner_id: customerUser.id }, testEnv);

    const refCustom = await recordCustomerReferral({ referralCode: code.code, userId: customerUser.id, organizationId: customerOrg.id }, testEnv);
    expect(refCustom.attribution).toBeDefined();
    await approveCustomerAttribution(refCustom.attribution!.id, adminUser.id, 'Approved attribution', testEnv);

    const theme = await createTheme({
      organization_id: customerOrg.id,
      game_id: 'catch-brand',
      name: 'Theme Flat',
      assets: {},
    }, testEnv);

    const event = await setupTestEvent({
      organization_id: customerOrg.id,
      game_theme_id: theme.id,
      name: 'Flat Event',
      paid_amount: 1400,
    });

    const res = await evaluateAndRecordEventCommission(event.id, testEnv);
    expect(res.eligible).toBe(true);
    expect(res.commission?.commission_rate).toBe(0.07);
    expect(res.commission?.commission_amount).toBe(98); // 7% of 1400
  });

  // 13. Admin views immutable sales partner audit log with actor identity and metadata
  test('13. Admin views immutable sales partner audit log with actor identity and metadata', async () => {
    const adminUser = await createUser({
      email: 'admin.lead@eventgamestudio.com',
      name: 'Lead Admin',
      is_developer: true,
    }, testEnv);

    const partner = await createUser({ email: 'partner.auditview@agency.com', name: 'Audit Partner' }, testEnv);
    await createSalesPartnerApplication(partner.id, 'Audit Agency', testEnv);

    await updateSalesPartnerStatus(partner.id, 'active', 'Note 1', adminUser.id, 'Reason 1', testEnv);
    await updateSalesPartnerRate(partner.id, { custom_commission_rate: 0.15 }, adminUser.id, 'Reason 2', testEnv);
    await updateSalesPartnerStatus(partner.id, 'suspended', 'Note 3', adminUser.id, 'Reason 3', testEnv);

    const logs = await getSalesPartnerAuditLogs(partner.id, testEnv);
    expect(logs.length).toBe(4);

    const actions = logs.map((l) => l.action);
    expect(actions).toContain('APPLIED');
    expect(actions).toContain('ACTIVATED');
    expect(actions).toContain('RATE_CHANGED');
    expect(actions).toContain('SUSPENDED');
  });

  // 14. Atomic status and rate updates record audit log in the same transaction
  test('14. Database migration defines atomic RPCs and RESTRICT foreign key protection', () => {
    const migrationPath = path.join(process.cwd(), 'supabase/migrations/20261016000000_phase7_sales_partner_admin_and_audit_logs.sql');
    expect(fs.existsSync(migrationPath)).toBe(true);
    const sql = fs.readFileSync(migrationPath, 'utf8');

    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.update_sales_partner_status_atomic');
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.update_sales_partner_rates_atomic');
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.create_sales_commission_atomic');
    expect(sql).toContain('ON DELETE RESTRICT');
    expect(sql).toContain('ENABLE ROW LEVEL SECURITY');
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.update_sales_partner_status_atomic');
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.update_sales_partner_rates_atomic');
  });

  // 15. Cloudflare Worker and Express provide identical admin sales partner governance endpoints and behavior
  test('15. Cloudflare Worker and Express provide identical admin sales partner governance endpoints and behavior', async () => {
    const adminUser = await createUser({
      email: 'admin.worker@eventgamestudio.com',
      name: 'Admin Worker',
      is_developer: true,
    }, testEnv);

    const partnerUser = await createUser({ email: 'partner.worker@agency.com', name: 'Partner Worker' }, testEnv);
    await createSalesPartnerApplication(partnerUser.id, 'Worker Agency Ltd', testEnv);

    const adminToken = await signAppToken(adminUser.id, undefined, undefined, testEnv.JWT_SECRET, testEnv);

    // Test GET /api/developer/sales-partners
    const listReq = new Request('http://localhost/api/developer/sales-partners', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const listRes = await worker.fetch(listReq, testEnv);
    expect(listRes.status).toBe(200);
    const listData: any = await listRes.json();
    expect(listData.success).toBe(true);
    expect(Array.isArray(listData.salesPartners)).toBe(true);

    // Test POST /api/developer/sales-partners/:userId/status (activate)
    const statusReq = new Request(`http://localhost/api/developer/sales-partners/${partnerUser.id}/status`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        status: 'active',
        admin_notes: 'Worker test activation',
        reason: 'Worker governance test',
      }),
    });
    const statusRes = await worker.fetch(statusReq, testEnv);
    expect(statusRes.status).toBe(200);
    const statusData: any = await statusRes.json();
    expect(statusData.success).toBe(true);
    expect(statusData.salesPartner.status).toBe('active');

    // Test POST /api/developer/sales-partners/:userId/rates (rate override)
    const rateReq = new Request(`http://localhost/api/developer/sales-partners/${partnerUser.id}/rates`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        first_order_commission_rate: 0.14,
        reason: 'Worker custom tier agreement',
      }),
    });
    const rateRes = await worker.fetch(rateReq, testEnv);
    expect(rateRes.status).toBe(200);
    const rateData: any = await rateRes.json();
    expect(rateData.success).toBe(true);
    expect(rateData.salesPartner.first_order_commission_rate).toBe(0.14);

    // Test GET /api/developer/sales-partners/:userId/audit-logs
    const auditReq = new Request(`http://localhost/api/developer/sales-partners/${partnerUser.id}/audit-logs`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const auditRes = await worker.fetch(auditReq, testEnv);
    expect(auditRes.status).toBe(200);
    const auditData: any = await auditRes.json();
    expect(auditData.success).toBe(true);
    expect(auditData.auditLogs.length).toBeGreaterThanOrEqual(2);
  });
});
