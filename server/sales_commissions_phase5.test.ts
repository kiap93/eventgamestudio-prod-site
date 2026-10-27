import { test, expect, describe, beforeEach } from 'bun:test';
import fs from 'fs';
import path from 'path';
import {
  clearLocalCommissionsCache,
  evaluateAndRecordEventCommission,
  approveCommission,
  adjustCommission,
  createSalesOpportunityRequest,
  approveSalesOpportunity,
  listSalesOpportunities,
  getCommissionsReadyForPayout,
  createPayoutBatch,
  markPayoutBatchPaid,
  handleEventRefundCommissionClawback,
  getCommissionAuditLogs,
  listAdminCommissions,
  DEFAULT_COMMISSION_SETTINGS,
  getSalesCommissionSettings,
  updateSalesCommissionSettings,
  normalizePersistedCommissionSettings,
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
import { localUsersCache } from './db/users.js';
import {
  localEventsCache,
  createEvent,
} from './db/events.js';
import {
  localThemesCache,
  createTheme,
} from './db/themes.js';
import worker from '../worker.js';

describe('Phase 5 — Sales Commissions, Opportunities, Payouts & Financial Safety Audit', () => {
  const testEnv = {
    SUPABASE_URL: 'https://placeholder.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'placeholder-service-key',
    JWT_SECRET: 'test-jwt-secret-for-phase-5-testing',
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

  // --------------------------------------------------------------------------
  // 1. MIGRATION & SCHEMA AUDIT
  // --------------------------------------------------------------------------
  test('1. Migration files define sales_commissions, atomic constraints, and audit logs', () => {
    const migration1 = path.join(process.cwd(), 'supabase/migrations/20261014000000_create_sales_commissions_and_payouts.sql');
    const migration2 = path.join(process.cwd(), 'supabase/migrations/20261015000000_phase5_atomic_commissions_and_auditability.sql');

    expect(fs.existsSync(migration1)).toBe(true);
    expect(fs.existsSync(migration2)).toBe(true);

    const sql1 = fs.readFileSync(migration1, 'utf8');
    const sql2 = fs.readFileSync(migration2, 'utf8');

    // Base tables
    expect(sql1).toContain('CREATE TABLE IF NOT EXISTS public.sales_commissions');
    expect(sql1).toContain('CREATE TABLE IF NOT EXISTS public.sales_opportunities');
    expect(sql1).toContain('CREATE TABLE IF NOT EXISTS public.sales_payout_batches');
    expect(sql1).toContain('CREATE TABLE IF NOT EXISTS public.sales_commission_audit_logs');

    // Phase 5 atomic & audit preservation enhancements
    expect(sql2).toContain('original_commission_rate');
    expect(sql2).toContain('original_commission_amount');
    expect(sql2).toContain('calculation_version');
    expect(sql2).toContain('adjustment_amount');
    expect(sql2).toContain('adjustment_reason');
    expect(sql2).toContain('idx_unique_first_order_commission_per_org');
  });

  // --------------------------------------------------------------------------
  // 2. FIRST QUALIFYING ORDER: 10% COMMISSION ON CASH
  // --------------------------------------------------------------------------
  test('2. First qualifying event order receives 10% commission on cash collected', async () => {
    const { org, theme } = await setupPartnerAndCustomerOrg('tc2');

    // Create Paid Event with RM1,400 Cash
    const event = await createTestEvent({
      organization_id: org.id,
      game_theme_id: theme.id,
      name: 'Annual Tech Gala 2026',
      paid_amount: 1400.00,
      discount_amount: 0.00,
    });

    // Evaluate Commission
    const result = await evaluateAndRecordEventCommission(event.id, testEnv);
    expect(result.eligible).toBe(true);
    expect(result.commission).not.toBeNull();

    const comm = result.commission!;
    expect(comm.order_type).toBe('first_order');
    expect(comm.commission_rate).toBe(0.10);
    expect(comm.commission_amount).toBe(140.00);
    expect(comm.original_commission_rate).toBe(0.10);
    expect(comm.original_commission_amount).toBe(140.00);
    expect(comm.calculation_version).toBe(1);
    expect(comm.status).toBe('pending_review');
    expect(comm.cash_collected_amount).toBe(1400.00);
    expect(comm.promo_discount_amount).toBe(0.00);
  });

  // --------------------------------------------------------------------------
  // 3. PROMOTIONAL CREDITS EXCLUDED FROM COMMISSIONABLE REVENUE
  // --------------------------------------------------------------------------
  test('3. Promotional credits are excluded from commissionable cash revenue', async () => {
    const { org, theme } = await setupPartnerAndCustomerOrg('tc3');

    // Paid Event: RM1,400 total price, RM400 cash + RM1,000 promotional credits
    const event = await createTestEvent({
      organization_id: org.id,
      game_theme_id: theme.id,
      name: 'Beta Festival',
      paid_amount: 400.00,
      discount_amount: 1000.00,
    });

    const result = await evaluateAndRecordEventCommission(event.id, testEnv);
    expect(result.eligible).toBe(true);
    const comm = result.commission!;
    // Commission is 10% strictly on RM400 cash = RM40.00 (not on RM1,400)
    expect(comm.commission_amount).toBe(40.00);
    expect(comm.cash_collected_amount).toBe(400.00);
    expect(comm.promo_discount_amount).toBe(1000.00);
  });

  // --------------------------------------------------------------------------
  // 4. ZERO CASH ORDER (100% PROMOTIONAL CREDITS) EARNS NO COMMISSION
  // --------------------------------------------------------------------------
  test('4. Orders funded 100% by promotional credits earn RM0 commission and are ineligible', async () => {
    const { org, theme } = await setupPartnerAndCustomerOrg('tc4');

    // Paid Event: RM800 total price, RM0 cash + RM800 promo credits
    const event = await createTestEvent({
      organization_id: org.id,
      game_theme_id: theme.id,
      name: 'Gamma Free Launch',
      paid_amount: 0.00,
      discount_amount: 800.00,
    });

    const result = await evaluateAndRecordEventCommission(event.id, testEnv);
    expect(result.eligible).toBe(false);
    expect(result.commission).toBeNull();
    expect(result.reason).toContain('No cash collected');
  });

  // --------------------------------------------------------------------------
  // 5. UNAPPROVED ATTRIBUTION & SELF-REFERRALS EARN NO COMMISSION
  // --------------------------------------------------------------------------
  test('5. Unapproved attribution and self-referrals cannot earn commission', async () => {
    const partnerUser = await createUser({ email: 'partner5@example.com', name: 'Partner Five' }, testEnv);
    await createSalesPartnerApplication(partnerUser.id, { legal_name: 'Agency 5' }, testEnv);
    await updateSalesPartnerStatus(partnerUser.id, 'active', 'test-admin', testEnv);

    // Customer creates org but attribution is still 'pending'
    const custUser = await createUser({ email: 'client5@example.com', name: 'Client Five' }, testEnv);
    const org = await createOrganization({ name: 'Delta Org', owner_id: custUser.id }, testEnv);
    const theme = await createTheme({ organization_id: org.id, name: 'Delta Theme' }, testEnv);

    const refCode = await getOrCreateSalesReferralCode(partnerUser.id, testEnv);
    await recordCustomerReferral({
      referralCode: refCode.code,
      referredUserId: custUser.id,
      organizationId: org.id,
    }, testEnv);
    // Notice: attribution NOT approved!

    const event1 = await createTestEvent({
      organization_id: org.id,
      game_theme_id: theme.id,
      name: 'Delta Gala',
      paid_amount: 1400.00,
    });

    const result1 = await evaluateAndRecordEventCommission(event1.id, testEnv);
    expect(result1.eligible).toBe(false);
    expect(result1.reason).toContain('does not have an approved Sales Partner attribution');

    // Self-referral case: partner owns the client org
    const partnerOwnOrg = await createOrganization({ name: 'Partner Own Org', owner_id: partnerUser.id }, testEnv);
    const selfTheme = await createTheme({ organization_id: partnerOwnOrg.id, name: 'Self Theme' }, testEnv);
    const selfRefRes = await recordCustomerReferral({
      referralCode: refCode.code,
      referredUserId: partnerUser.id,
      organizationId: partnerOwnOrg.id,
    }, testEnv);
    const attrib2 = selfRefRes.attribution!;
    attrib2.is_self_referral = true;
    attrib2.status = 'approved';

    const event2 = await createTestEvent({
      organization_id: partnerOwnOrg.id,
      game_theme_id: selfTheme.id,
      name: 'Self Event',
      paid_amount: 1400.00,
    });

    const result2 = await evaluateAndRecordEventCommission(event2.id, testEnv);
    expect(result2.eligible).toBe(false);
    expect(result2.reason).toContain('self-referral');
  });

  // --------------------------------------------------------------------------
  // 6. REPEAT QUALIFYING ORDER WITHIN 12 MONTHS: 5% COMMISSION
  // --------------------------------------------------------------------------
  test('6. Repeat qualifying order placed within 12 months receives 5% commission', async () => {
    const { org, theme } = await setupPartnerAndCustomerOrg('tc6');

    // Order 1 (First Order): RM1,400 cash
    const event1 = await createTestEvent({
      organization_id: org.id,
      game_theme_id: theme.id,
      name: 'Event 1 - January',
      paid_amount: 1400.00,
    });
    const res1 = await evaluateAndRecordEventCommission(event1.id, testEnv);
    expect(res1.eligible).toBe(true);
    expect(res1.commission?.order_type).toBe('first_order');
    expect(res1.commission?.commission_rate).toBe(0.10);

    // Order 2 (Repeat Order, within 12 months): RM2,000 cash
    const event2 = await createTestEvent({
      organization_id: org.id,
      game_theme_id: theme.id,
      name: 'Event 2 - April',
      paid_amount: 2000.00,
    });
    const res2 = await evaluateAndRecordEventCommission(event2.id, testEnv);
    expect(res2.eligible).toBe(true);
    expect(res2.commission?.order_type).toBe('repeat_order');
    expect(res2.commission?.commission_rate).toBe(0.05);
    expect(res2.commission?.commission_amount).toBe(100.00); // 5% of RM2,000
    expect(res2.commission?.original_commission_rate).toBe(0.05);
  });

  // --------------------------------------------------------------------------
  // 7. AFTER 12 MONTHS: NO AUTOMATIC COMMISSION WITHOUT ADMIN-APPROVED OPPORTUNITY
  // --------------------------------------------------------------------------
  test('7. Repeat order placed after 12-month window requires Admin-approved opportunity', async () => {
    const { partnerUser, org, theme } = await setupPartnerAndCustomerOrg('tc7');

    // Order 1: Placed 14 months ago
    const pastDate = new Date();
    pastDate.setMonth(pastDate.getMonth() - 14);

    const event1 = await createTestEvent({
      organization_id: org.id,
      game_theme_id: theme.id,
      name: 'Event 1 - Past Year',
      paid_amount: 1400.00,
    });
    const res1 = await evaluateAndRecordEventCommission(event1.id, testEnv);
    expect(res1.eligible).toBe(true);
    // Backdate the first order's eligibility date to 14 months ago
    res1.commission!.eligibility_date = pastDate.toISOString();

    // Case A: Order 2 placed without opportunity -> Ineligible
    const eventWithoutOpp = await createTestEvent({
      organization_id: org.id,
      game_theme_id: theme.id,
      name: 'Event 2 - After Window Without Opp',
      paid_amount: 1400.00,
    });
    const resWithoutOpp = await evaluateAndRecordEventCommission(eventWithoutOpp.id, testEnv);
    expect(resWithoutOpp.eligible).toBe(false);
    expect(resWithoutOpp.reason).toContain('Repeat order window has expired');

    // Case B: Partner requests opportunity, Admin approves it BEFORE order placement
    const opp = await createSalesOpportunityRequest(
      {
        partnerUserId: partnerUser.id,
        organizationId: org.id,
        title: '2027 Annual Conference Re-engagement',
        description: 'Client expanding to 3 regional events',
      },
      testEnv
    );
    expect(opp.status).toBe('pending');

    await approveSalesOpportunity(opp.id, 'admin-user-123', { decisionNotes: 'Pre-approved renewal' }, testEnv);

    // Give a brief delay so approval timestamp is strictly before order placement timestamp
    await new Promise((r) => setTimeout(r, 10));

    // Now Order 2 is placed AFTER opportunity was approved!
    const event2 = await createTestEvent({
      organization_id: org.id,
      game_theme_id: theme.id,
      name: 'Event 2 - After Window With Pre-Approval',
      paid_amount: 1400.00,
    });

    // Evaluate Order 2 -> Eligible under approved_opportunity!
    const res2WithOpp = await evaluateAndRecordEventCommission(event2.id, testEnv);
    expect(res2WithOpp.eligible).toBe(true);
    expect(res2WithOpp.commission?.order_type).toBe('approved_opportunity');
    expect(res2WithOpp.commission?.commission_rate).toBe(0.05);
    expect(res2WithOpp.commission?.commission_amount).toBe(70.00);
    expect(res2WithOpp.commission?.opportunity_id).toBe(opp.id);

    // Opportunity should now be marked consumed
    const oppList = await listSalesOpportunities({ organization_id: org.id }, testEnv);
    const consumedOpp = oppList.find((o) => o.id === opp.id);
    expect(consumedOpp?.status).toBe('consumed');

    // Case C: A subsequent Order 3 cannot re-consume the same opportunity
    const event3 = await createTestEvent({
      organization_id: org.id,
      game_theme_id: theme.id,
      name: 'Event 3 - Another Try',
      paid_amount: 1400.00,
    });

    const res3 = await evaluateAndRecordEventCommission(event3.id, testEnv);
    expect(res3.eligible).toBe(false);
    expect(res3.reason).toContain('Repeat order window has expired');
  });

  // --------------------------------------------------------------------------
  // 8. IDEMPOTENCY: DUPLICATE WEBHOOKS DO NOT CREATE DUPLICATE COMMISSIONS
  // --------------------------------------------------------------------------
  test('8. Duplicate payment evaluations for same event are strictly idempotent', async () => {
    const { org, theme } = await setupPartnerAndCustomerOrg('tc8');

    const event = await createTestEvent({
      organization_id: org.id,
      game_theme_id: theme.id,
      name: 'Eta Conference',
      paid_amount: 1400.00,
    });

    const call1 = await evaluateAndRecordEventCommission(event.id, testEnv);
    const call2 = await evaluateAndRecordEventCommission(event.id, testEnv);

    expect(call1.eligible).toBe(true);
    expect(call2.eligible).toBe(true);
    expect(call1.commission?.id).toBe(call2.commission?.id);
  });

  // --------------------------------------------------------------------------
  // 9. SAFER POLICY: COMMISSION APPROVAL REQUIRES EVENT COMPLETION
  // --------------------------------------------------------------------------
  test('9. Commission becomes payable only after event delivery is COMPLETED', async () => {
    const { org, theme } = await setupPartnerAndCustomerOrg('tc9');

    // Event is currently SCHEDULED (future date)
    const event = await createTestEvent({
      organization_id: org.id,
      game_theme_id: theme.id,
      name: 'Theta Live Stage',
      start_date: '2026-12-01',
      end_date: '2026-12-02',
      payment_status: 'PAID',
      event_status: 'SCHEDULED',
      paid_amount: 1400.00,
    });

    const evalResult = await evaluateAndRecordEventCommission(event.id, testEnv);
    expect(evalResult.eligible).toBe(true);
    const commId = evalResult.commission!.id;

    // Admin tries to approve before event completion -> MUST FAIL
    await expect(approveCommission(commId, 'admin-user', 'Premature approval', testEnv))
      .rejects.toThrow('Event delivery has not completed yet');

    // Simulate event completion
    event.event_status = 'COMPLETED';
    event.status = 'completed';

    // Now Admin approval succeeds
    const approved = await approveCommission(commId, 'admin-user', 'Event delivered successfully', testEnv);
    expect(approved.status).toBe('approved');
    expect(approved.is_delivery_completed).toBe(true);
    expect(approved.approved_by_user_id).toBe('admin-user');
  });

  // --------------------------------------------------------------------------
  // 10. REFUND / CLAWBACK & AUDIT TRAIL
  // --------------------------------------------------------------------------
  test('10. Event refund triggers commission voiding/clawback with immutable audit log', async () => {
    const { org, theme } = await setupPartnerAndCustomerOrg('tc10');

    const event = await createTestEvent({
      organization_id: org.id,
      game_theme_id: theme.id,
      name: 'Iota Summit',
      paid_amount: 1400.00,
    });

    const evalResult = await evaluateAndRecordEventCommission(event.id, testEnv);
    const comm = evalResult.commission!;

    // Trigger refund clawback
    const voided = await handleEventRefundCommissionClawback(event.id, 'Customer requested full refund', 'admin-user', testEnv);
    expect(voided?.status).toBe('voided');

    // Verify Audit Logs
    const logs = await getCommissionAuditLogs(comm.id, testEnv);
    expect(logs.length).toBeGreaterThanOrEqual(2); // CREATED, then VOIDED
    const voidLog = logs.find((l) => l.action === 'VOIDED');
    expect(voidLog).toBeDefined();
    expect(voidLog?.reason).toContain('Customer requested full refund');
  });

  // --------------------------------------------------------------------------
  // 11. ADMIN COMMISSION ADJUSTMENT & AUDIT PRESERVATION
  // --------------------------------------------------------------------------
  test('11. Admin adjustment preserves original calculation and logs adjustment audit', async () => {
    const { org, theme } = await setupPartnerAndCustomerOrg('tc11');

    const event = await createTestEvent({
      organization_id: org.id,
      game_theme_id: theme.id,
      name: 'Kappa Launch',
      paid_amount: 1400.00,
    });

    const evalResult = await evaluateAndRecordEventCommission(event.id, testEnv);
    const comm = evalResult.commission!;
    expect(comm.commission_amount).toBe(140.00);

    // Adjust by -RM20.00 to RM120.00
    const adjusted = await adjustCommission(
      comm.id,
      120.00,
      'admin-super',
      'Minus credit card processing fee deduction',
      testEnv
    );

    expect(adjusted.commission_amount).toBe(120.00);
    // Original values remain unchanged
    expect(adjusted.original_commission_amount).toBe(140.00);
    expect(adjusted.original_commission_rate).toBe(0.10);
    expect(adjusted.adjustment_amount).toBe(-20.00);
    expect(adjusted.adjustment_reason).toBe('Minus credit card processing fee deduction');

    // Audit Log Check
    const logs = await getCommissionAuditLogs(comm.id, testEnv);
    const adjustLog = logs.find((l) => l.action === 'ADJUSTED');
    expect(adjustLog).toBeDefined();
    expect(adjustLog?.previous_amount).toBe(140.00);
    expect(adjustLog?.new_amount).toBe(120.00);
    expect(adjustLog?.actor_user_id).toBe('admin-super');
  });

  // --------------------------------------------------------------------------
  // 12. PAYOUT BATCH LIFECYCLE
  // --------------------------------------------------------------------------
  test('12. Full payout batch lifecycle: ready grouping -> batch creation -> marked paid', async () => {
    const { org, theme } = await setupPartnerAndCustomerOrg('tc12');

    const event = await createTestEvent({
      organization_id: org.id,
      game_theme_id: theme.id,
      name: 'Lambda Demo',
      payment_status: 'PAID',
      event_status: 'COMPLETED',
      status: 'completed',
      paid_amount: 1400.00,
    });

    const evalResult = await evaluateAndRecordEventCommission(event.id, testEnv);
    const commId = evalResult.commission!.id;
    await approveCommission(commId, 'admin-user', 'Delivered', testEnv);

    // 1. Ready for Payout Query
    const ready = await getCommissionsReadyForPayout(testEnv);
    expect(ready.total_approved_commissions).toBe(1);
    expect(ready.total_ready_amount).toBe(140.00);
    expect(ready.partners.length).toBe(1);

    // 2. Create Payout Batch
    const batch = await createPayoutBatch([commId], 'admin-user', 'October Payout Cycle', testEnv);
    expect(['draft', 'pending', 'pending_approval']).toContain(batch.status);
    expect(batch.total_amount).toBe(140.00);
    expect(batch.total_commissions).toBe(1);

    // 3. Mark Payout Batch as Paid
    const paidBatch = await markPayoutBatchPaid(batch.id, 'TXN-BANK-MY-998822', 'admin-user', 'Settled via DuitNow', testEnv);
    expect(paidBatch.status).toBe('paid');
    expect(paidBatch.payment_reference).toBe('TXN-BANK-MY-998822');

    // 4. Commissions in Batch Should Now Be 'paid'
    const adminList = await listAdminCommissions({ payout_batch_id: batch.id }, testEnv);
    expect(adminList.commissions.length).toBe(1);
    expect(adminList.commissions[0].status).toBe('paid');
    expect(adminList.commissions[0].paid_at).not.toBeNull();
  });

  // --------------------------------------------------------------------------
  // 13. CONCURRENCY SAFETY: TWO CONCURRENT ORDERS CANNOT BOTH CLAIM FIRST-ORDER
  // --------------------------------------------------------------------------
  test('13. Concurrent orders for the same organization safely serialize: one first_order, one repeat_order', async () => {
    const { org, theme } = await setupPartnerAndCustomerOrg('tc13');

    // Create 2 separate paid events concurrently for the same organization
    const eventA = await createTestEvent({
      organization_id: org.id,
      game_theme_id: theme.id,
      name: 'Concurrent Event A',
      paid_amount: 1400.00,
    });

    const eventB = await createTestEvent({
      organization_id: org.id,
      game_theme_id: theme.id,
      name: 'Concurrent Event B',
      paid_amount: 1400.00,
    });

    // Run evaluation concurrently using Promise.all
    const [evalA, evalB] = await Promise.all([
      evaluateAndRecordEventCommission(eventA.id, testEnv),
      evaluateAndRecordEventCommission(eventB.id, testEnv),
    ]);

    expect(evalA.eligible).toBe(true);
    expect(evalB.eligible).toBe(true);

    const orderTypes = [evalA.commission!.order_type, evalB.commission!.order_type];
    // Exactly ONE must be first_order, and the other must be repeat_order!
    expect(orderTypes).toContain('first_order');
    expect(orderTypes).toContain('repeat_order');

    const rates = [evalA.commission!.commission_rate, evalB.commission!.commission_rate];
    expect(rates).toContain(0.10);
    expect(rates).toContain(0.05);
  });

  // --------------------------------------------------------------------------
  // 14. PRODUCTION SAFETY: NO IN-MEMORY FALLBACK IN PRODUCTION
  // --------------------------------------------------------------------------
  test('14. Production safety guards prevent silent in-memory fallback in production', async () => {
    const prodEnv = {
      NODE_ENV: 'production',
      // No Supabase URL
    };

    // Any financial operation without configured DB in production must fail closed
    await expect(approveCommission('fake-id', 'admin', 'notes', prodEnv))
      .rejects.toThrow();

    await expect(createPayoutBatch(['fake-id'], 'admin', 'notes', prodEnv))
      .rejects.toThrow();
  });

  // --------------------------------------------------------------------------
  // 15. WORKER API ROUTE PARITY FOR SALES COMMISSIONS & OPPORTUNITIES
  // --------------------------------------------------------------------------
  test('15. Cloudflare Worker API routes handle commissions and opportunities with authentication', async () => {
    const { partnerUser, org } = await setupPartnerAndCustomerOrg('tc15');
    const { signAppToken } = await import('./auth.js');
    const partnerToken = await signAppToken(partnerUser.id, undefined, undefined, testEnv.JWT_SECRET, testEnv);

    // Sales Partner: GET /api/sales/commissions
    const req1 = new Request('https://test.local/api/sales/commissions', {
      headers: { Authorization: `Bearer ${partnerToken}` },
    });
    const res1 = await worker.fetch(req1, testEnv as any);
    expect(res1.status).toBe(200);
    const body1 = await res1.json() as any;
    expect(body1.success).toBe(true);
    expect(body1.summary).toBeDefined();

    // Sales Partner: POST /api/sales/opportunities (request renewal opportunity)
    const req2 = new Request('https://test.local/api/sales/opportunities', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${partnerToken}`,
      },
      body: JSON.stringify({
        organization_id: org.id,
        title: '2027 Multi-City Showcase Tour',
        description: 'Large client renewing for next calendar year',
      }),
    });
    const res2 = await worker.fetch(req2, testEnv as any);
    expect(res2.status).toBe(200);
    const body2 = await res2.json() as any;
    expect(body2.success).toBe(true);
    expect(body2.opportunity.title).toBe('2027 Multi-City Showcase Tour');
    expect(body2.opportunity.status).toBe('pending');
  });

  // --------------------------------------------------------------------------
  // 16. AUTHORITATIVE COMMISSION RATES (10% FIRST / 5% REPEAT) & UNIT SAFETY
  // --------------------------------------------------------------------------
  test('16. Authoritative default commission rates are 10% (0.10) first order and 5% (0.05) repeat order, rejecting whole-number percentage unit confusion', async () => {
    expect(DEFAULT_COMMISSION_SETTINGS.first_order_commission_rate).toBe(0.10);
    expect(DEFAULT_COMMISSION_SETTINGS.repeat_order_commission_rate).toBe(0.05);
    expect(DEFAULT_COMMISSION_SETTINGS.repeat_window_months).toBe(12);

    const initial = await getSalesCommissionSettings(testEnv);
    expect(initial.first_order_commission_rate).toBe(0.10);
    expect(initial.repeat_order_commission_rate).toBe(0.05);

    // Reject whole-number percentage inputs (e.g. 10 instead of 0.10, or 5 instead of 0.05)
    await expect(
      updateSalesCommissionSettings({ first_order_commission_rate: 10 }, 'admin-user', testEnv)
    ).rejects.toThrow('First-order commission rate must be a decimal fraction between 0.00 and 0.50');

    await expect(
      updateSalesCommissionSettings({ repeat_order_commission_rate: 5 }, 'admin-user', testEnv)
    ).rejects.toThrow('Repeat-order commission rate must be a decimal fraction between 0.00 and 0.50');

    // Normalize legacy 0.15 / 0.10 persisted defaults or whole-number storage safely
    const normalizedLegacy = normalizePersistedCommissionSettings({
      first_order_commission_rate: 0.15,
      repeat_order_commission_rate: 0.10,
      repeat_window_months: 12,
    });
    expect(normalizedLegacy.first_order_commission_rate).toBe(0.10);
    expect(normalizedLegacy.repeat_order_commission_rate).toBe(0.05);

    const normalizedWholeNumbers = normalizePersistedCommissionSettings({
      first_order_commission_rate: 10,
      repeat_order_commission_rate: 5,
    });
    expect(normalizedWholeNumbers.first_order_commission_rate).toBe(0.10);
    expect(normalizedWholeNumbers.repeat_order_commission_rate).toBe(0.05);
  });

  // --------------------------------------------------------------------------
  // 17. DEVELOPER ADMIN SETTINGS API & FINALIZED COMMISSION IMMUTABILITY
  // --------------------------------------------------------------------------
  test('17. Developer Admin rate settings save/load 10% and 5% via API without mutating existing finalized commissions', async () => {
    const adminUser = await createUser({
      email: 'admin@eventgamestudio.com',
      name: 'Admin Dev',
      is_developer: true,
    }, testEnv);
    const { signAppToken } = await import('./auth.js');
    const adminToken = await signAppToken(adminUser.id, undefined, undefined, testEnv.JWT_SECRET, testEnv);

    // 1. Create and approve a commission under default 10% rate
    const { org, theme } = await setupPartnerAndCustomerOrg('tc17');
    const event1 = await createTestEvent({
      organization_id: org.id,
      game_theme_id: theme.id,
      name: 'Finalized Event 1',
      payment_status: 'PAID',
      event_status: 'COMPLETED',
      status: 'completed',
      paid_amount: 1400.00,
    });
    const eval1 = await evaluateAndRecordEventCommission(event1.id, testEnv);
    const approvedComm = await approveCommission(eval1.commission!.id, adminUser.id, 'Approved at 10%', testEnv);
    expect(approvedComm.commission_rate).toBe(0.10);
    expect(approvedComm.commission_amount).toBe(140.00);

    // 2. GET /api/developer/sales-commissions/settings returns 0.10 and 0.05
    const getRes = await worker.fetch(
      new Request('https://test.local/api/developer/sales-commissions/settings', {
        headers: { Authorization: `Bearer ${adminToken}` },
      }),
      testEnv as any
    );
    expect(getRes.status).toBe(200);
    const getBody = (await getRes.json()) as any;
    expect(getBody.settings.first_order_commission_rate).toBe(0.10);
    expect(getBody.settings.repeat_order_commission_rate).toBe(0.05);

    // 3. PUT /api/developer/sales-commissions/settings rejects invalid unit (e.g. 10 instead of 0.10) with 400
    const badPutRes = await worker.fetch(
      new Request('https://test.local/api/developer/sales-commissions/settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          first_order_commission_rate: 10,
          repeat_order_commission_rate: 5,
        }),
      }),
      testEnv as any
    );
    expect(badPutRes.status).toBe(400);

    // 4. PUT /api/developer/sales-commissions/settings saves 0.10 and 0.05 cleanly
    const validPutRes = await worker.fetch(
      new Request('https://test.local/api/developer/sales-commissions/settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          first_order_commission_rate: 0.10,
          repeat_order_commission_rate: 0.05,
          repeat_window_months: 12,
          require_delivery_completion: true,
        }),
      }),
      testEnv as any
    );
    expect(validPutRes.status).toBe(200);
    const validPutBody = (await validPutRes.json()) as any;
    expect(validPutBody.settings.first_order_commission_rate).toBe(0.10);
    expect(validPutBody.settings.repeat_order_commission_rate).toBe(0.05);

    // 5. Verify finalized commission record was NOT silently mutated
    const commList = await listAdminCommissions({ organization_id: org.id }, testEnv);
    const persistedComm = commList.commissions.find((c) => c.id === approvedComm.id);
    expect(persistedComm?.status).toBe('approved');
    expect(persistedComm?.commission_rate).toBe(0.10);
    expect(persistedComm?.commission_amount).toBe(140.00);
  });

  // --------------------------------------------------------------------------
  // 18. MIGRATION 20261027000000 VERIFICATION
  // --------------------------------------------------------------------------
  test('18. Migration 20261027000000 enforces 10% first-order and 5% repeat-order rates in platform_settings and create_sales_commission_atomic', () => {
    const migrationPath = path.join(
      process.cwd(),
      'supabase/migrations/20261027000000_fix_sales_partner_commission_rates_10_5.sql'
    );
    expect(fs.existsSync(migrationPath)).toBe(true);
    const sql = fs.readFileSync(migrationPath, 'utf8');
    expect(sql).toContain("'first_order_commission_rate', 0.10");
    expect(sql).toContain("'repeat_order_commission_rate', 0.05");
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.create_sales_commission_atomic');
    expect(sql).toContain('v_default_first_rate NUMERIC := 0.10');
    expect(sql).toContain('v_default_repeat_rate NUMERIC := 0.05');
  });
});
