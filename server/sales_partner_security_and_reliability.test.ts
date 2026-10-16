import { test, expect, describe, beforeEach } from 'bun:test';
import fs from 'fs';
import path from 'path';
import {
  signAppToken,
  resolveAuthToken,
  isUserActiveSalesPartner,
  isUserDeveloperAdmin,
} from './auth.js';
import {
  createUser,
  getUserById,
  createOrganization,
} from './db/index.js';
import { createEvent, localEventsCache } from './db/events.js';
import { createTheme, localThemesCache } from './db/themes.js';
import {
  localSalesPartnersCache,
  localSalesPartnerAdminNotesCache,
  localSalesPartnerAuditLogsCache,
  clearLocalSalesPartnersCache,
  createSalesPartnerApplication,
  updateSalesPartnerStatus,
  updateSalesPartnerRate,
  getSalesPartnerProfileByUserId,
  getSalesPartnerAdminNotes,
  listSalesPartnerProfiles,
} from './db/salesPartners.js';
import {
  localCommissionsCache,
  localOpportunitiesCache,
  localPayoutBatchesCache,
  clearLocalCommissionsCache,
  evaluateAndRecordEventCommission,
  handleEventRefundCommissionClawback,
  createPayoutBatch,
  markPayoutBatchPaid,
  getPartnerCommissions,
} from './db/salesCommissions.js';
import {
  localAttributionsCache,
  clearLocalAttributionsCache,
  getOrCreateSalesReferralCode,
  recordCustomerReferral,
  approveCustomerAttribution,
} from './db/salesAttribution.js';
import { assertProductionSalesSafe } from './supabase.js';
import worker from '../worker.js';

describe('Sales Partner Security, Isolation & Reliability Audit Suite', () => {
  const testEnv = {
    SUPABASE_URL: 'https://placeholder.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'placeholder-service-key',
    JWT_SECRET: 'test-jwt-secret-for-sales-partner-audit-testing-32b',
    NODE_ENV: 'test',
  };

  beforeEach(() => {
    clearLocalSalesPartnersCache();
    clearLocalCommissionsCache();
    clearLocalAttributionsCache();
    localEventsCache.clear();
    localThemesCache.clear();
  });

  async function createTestEvent(params: {
    organization_id: string;
    game_theme_id: string;
    name: string;
    paid_amount: number;
    discount_amount?: number;
    currency?: string;
  }) {
    return await createEvent(
      {
        organization_id: params.organization_id,
        game_id: 'catch-brand',
        game_theme_id: params.game_theme_id,
        name: params.name,
        start_date: '2026-11-01',
        end_date: '2026-11-01',
        startDate: '2026-11-01',
        endDate: '2026-11-01',
        payment_status: 'PAID' as any,
        event_status: 'SCHEDULED' as any,
        status: 'scheduled' as any,
        paid_amount: params.paid_amount,
        discount_amount: params.discount_amount || 0,
        event_price: (params.paid_amount + (params.discount_amount || 0)) || 1400,
        event_currency: (params.currency || 'MYR') as any,
        custom_price_override: true,
      },
      testEnv
    );
  }

  // ==============================================================================
  // 1. DIRECT ACCESS TO PRIVATE ADMINISTRATOR NOTES & SCHEMA ISOLATION
  // ==============================================================================
  describe('1. Protection of Private Administrator Notes', () => {
    test('1.1. Migration defines sales_partner_admin_notes table with Developer Admin RLS and drops admin_notes from profiles', () => {
      const migrationPath = path.join(
        process.cwd(),
        'supabase/migrations/20261018000000_protect_sales_partner_admin_notes_and_atomic_application.sql'
      );
      expect(fs.existsSync(migrationPath)).toBe(true);

      const sql = fs.readFileSync(migrationPath, 'utf8');

      // Dedicated restricted table
      expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.sales_partner_admin_notes');
      expect(sql).toContain('partner_user_id UUID NOT NULL REFERENCES public.users (id) ON DELETE CASCADE');
      expect(sql).toContain('admin_notes TEXT NOT NULL');
      expect(sql).toContain('CONSTRAINT unique_sales_partner_admin_notes UNIQUE (partner_user_id)');

      // RLS enabled and strictly restricted to developer admins
      expect(sql).toContain('ALTER TABLE public.sales_partner_admin_notes ENABLE ROW LEVEL SECURITY');
      expect(sql).toContain('CREATE POLICY "Developer admins view sales partner admin notes"');
      expect(sql).toContain('CREATE POLICY "Developer admins manage sales partner admin notes"');
      expect(sql).toContain('u.is_developer = true');

      // Drop column from public profiles
      expect(sql).toContain('ALTER TABLE public.sales_partner_profiles DROP COLUMN IF EXISTS admin_notes');

      // Atomic application creation RPC
      expect(sql).toContain('CREATE OR REPLACE FUNCTION public.create_sales_partner_application_atomic');
    });

    test('1.2. Partner querying /api/sales/me does NOT receive admin_notes', async () => {
      const partnerUser = await createUser(
        { email: 'partner.privacy@agency.com', name: 'Privacy Partner' },
        testEnv
      );

      // Create application and activate with private administrator notes
      await createSalesPartnerApplication(partnerUser.id, { agencyName: 'Secret Agency', applicationNotes: 'Pitch deck ready' }, testEnv);
      await updateSalesPartnerStatus(
        partnerUser.id,
        'active',
        'CONFIDENTIAL: Credit check verified SSM registration 2026-X. High trust partner.',
        undefined,
        'Approved after phone interview',
        testEnv
      );

      const token = await signAppToken(partnerUser.id, undefined, undefined, testEnv.JWT_SECRET, testEnv);

      const req = new Request('https://api.eventgamestudio.local/api/sales/me', {
        headers: { Authorization: `Bearer ${token}` },
      });

      const res = await worker.fetch(req, testEnv);
      expect(res.status).toBe(200);

      const body: any = await res.json();
      expect(body.salesPartner).toBeDefined();
      expect(body.salesPartner.agency_name).toBe('Secret Agency');
      expect(body.salesPartner.application_notes).toBe('Pitch deck ready');
      // CRITICAL: admin_notes must NEVER be exposed to the partner
      expect(body.salesPartner.admin_notes).toBeUndefined();
    });

    test('1.3. Developer Admin CAN view private admin notes via developer endpoints', async () => {
      const devAdmin = await createUser(
        { email: 'admin.auditor@eventgamestudio.com', name: 'Platform Admin', is_developer: true },
        testEnv
      );

      const candidate = await createUser(
        { email: 'applicant.corp@events.com', name: 'Candidate Corp' },
        testEnv
      );

      await createSalesPartnerApplication(candidate.id, 'Candidate Proposal', testEnv);
      await updateSalesPartnerStatus(
        candidate.id,
        'active',
        'INTERNAL ADMIN NOTE: Verified SSM #12345. Approved standard commission tier.',
        devAdmin.id,
        'Approved by admin',
        testEnv
      );

      const devToken = await signAppToken(devAdmin.id, undefined, undefined, testEnv.JWT_SECRET, testEnv);

      const req = new Request('https://api.eventgamestudio.local/api/developer/sales-partners', {
        headers: { Authorization: `Bearer ${devToken}` },
      });

      const res = await worker.fetch(req, testEnv);
      expect(res.status).toBe(200);

      const body: any = await res.json();
      const candidateProfile = body.partners.find((p: any) => p.user_id === candidate.id);
      expect(candidateProfile).toBeDefined();
      expect(candidateProfile.admin_notes).toBe('INTERNAL ADMIN NOTE: Verified SSM #12345. Approved standard commission tier.');
    });
  });

  // ==============================================================================
  // 2. RLS AND PRIVILEGE ENFORCEMENT ACROSS ROLES
  // ==============================================================================
  describe('2. Multi-Role Privilege Boundaries & Tampering Protection', () => {
    test('2.1. Anonymous users receive 401 on protected sales partner endpoints', async () => {
      const req = new Request('https://api.eventgamestudio.local/api/sales/me', { method: 'GET' });
      const res = await worker.fetch(req, testEnv);
      expect(res.status).toBe(401);
    });

    test('2.2. Ordinary customer receives 403 on protected sales partner endpoints', async () => {
      const customer = await createUser({ email: 'client@company.com', name: 'Client' }, testEnv);
      const token = await signAppToken(customer.id, undefined, undefined, testEnv.JWT_SECRET, testEnv);

      const req = new Request('https://api.eventgamestudio.local/api/sales/me', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const res = await worker.fetch(req, testEnv);
      expect(res.status).toBe(403);

      const body: any = await res.json();
      expect(body.code).toBe('SALES_PARTNER_ACCESS_REQUIRED');
      expect(body.partnerStatus).toBe('none');
    });

    test('2.3. Pending partner receives 403 on protected sales partner endpoints', async () => {
      const pendingUser = await createUser({ email: 'pending@applicant.com', name: 'Pending' }, testEnv);
      await createSalesPartnerApplication(pendingUser.id, 'App notes', testEnv);

      const token = await signAppToken(pendingUser.id, undefined, undefined, testEnv.JWT_SECRET, testEnv);
      const req = new Request('https://api.eventgamestudio.local/api/sales/me', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const res = await worker.fetch(req, testEnv);
      expect(res.status).toBe(403);

      const body: any = await res.json();
      expect(body.partnerStatus).toBe('pending');
    });

    test('2.4. Non-admin users receive 403 on developer sales partner endpoints', async () => {
      const partner = await createUser({ email: 'partner@sales.com', name: 'Partner' }, testEnv);
      await createSalesPartnerApplication(partner.id, 'Notes', testEnv);
      await updateSalesPartnerStatus(partner.id, 'active', 'Activated', testEnv);

      const token = await signAppToken(partner.id, undefined, undefined, testEnv.JWT_SECRET, testEnv);

      // Attempt to access developer list
      const listReq = new Request('https://api.eventgamestudio.local/api/developer/sales-partners', {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect((await worker.fetch(listReq, testEnv)).status).toBe(403);

      // Attempt to modify partner status
      const statusReq = new Request(`https://api.eventgamestudio.local/api/developer/sales-partners/${partner.id}/status`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'active', reason: 'Self-elevation' }),
      });
      expect((await worker.fetch(statusReq, testEnv)).status).toBe(403);

      // Attempt to modify commission rates
      const rateReq = new Request(`https://api.eventgamestudio.local/api/developer/sales-partners/${partner.id}/rates`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ custom_commission_rate: 0.40, reason: 'Unauthorized rate change' }),
      });
      expect((await worker.fetch(rateReq, testEnv)).status).toBe(403);
    });
  });

  // ==============================================================================
  // 3. ATOMIC APPLICATION CREATION AND AUDIT LOGGING
  // ==============================================================================
  describe('3. Atomic Application Creation & Audit Logging', () => {
    test('3.1. Successful application creation writes both profile and APPLIED audit log', async () => {
      const user = await createUser({ email: 'atomictest@partner.com', name: 'Atomic Test' }, testEnv);

      const profile = await createSalesPartnerApplication(
        user.id,
        {
          agencyName: 'Impact Marketing Studio',
          applicationNotes: 'Specialized in experiential corporate roadshows',
        },
        testEnv
      );

      expect(profile).toBeDefined();
      expect(profile.status).toBe('pending');
      expect(profile.agency_name).toBe('Impact Marketing Studio');
      expect(profile.application_notes).toBe('Specialized in experiential corporate roadshows');

      // Audit log must exist
      const auditLogs = localSalesPartnerAuditLogsCache.filter((l) => l.partner_user_id === user.id);
      expect(auditLogs.length).toBe(1);
      expect(auditLogs[0].action).toBe('APPLIED');
      expect(auditLogs[0].new_status).toBe('pending');
      expect(auditLogs[0].sales_partner_id).toBe(profile.id);
      expect(auditLogs[0].metadata?.agency_name).toBe('Impact Marketing Studio');
    });

    test('3.2. Validation rejects overly long agency names (> 150 chars) or notes (> 1000 chars)', async () => {
      const user = await createUser({ email: 'limits@partner.com', name: 'Limits' }, testEnv);

      const longAgency = 'A'.repeat(151);
      await expect(
        createSalesPartnerApplication(user.id, { agencyName: longAgency }, testEnv)
      ).rejects.toThrow('Agency name cannot exceed 150 characters');

      const longNotes = 'N'.repeat(1001);
      await expect(
        createSalesPartnerApplication(user.id, { applicationNotes: longNotes }, testEnv)
      ).rejects.toThrow('Application details cannot exceed 1,000 characters');
    });
  });

  // ==============================================================================
  // 4. DUPLICATE AND CONCURRENT SUBMISSIONS
  // ==============================================================================
  describe('4. Duplicate & Concurrent Submissions', () => {
    test('4.1. Second application submission fails safely with clear already-exists error', async () => {
      const user = await createUser({ email: 'duplicate@partner.com', name: 'Duplicate' }, testEnv);

      await createSalesPartnerApplication(user.id, 'First attempt', testEnv);

      await expect(
        createSalesPartnerApplication(user.id, 'Second attempt', testEnv)
      ).rejects.toThrow('A Sales Partner application or profile already exists for this account');
    });

    test('4.2. HTTP POST /api/sales/apply returns 409 Conflict when already submitted', async () => {
      const user = await createUser({ email: 'http.dup@partner.com', name: 'HTTP Dup' }, testEnv);
      const token = await signAppToken(user.id, undefined, undefined, testEnv.JWT_SECRET, testEnv);

      // First submit: 201 Created
      const req1 = new Request('https://api.eventgamestudio.local/api/sales/apply', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ agencyName: 'First Agency', applicationNotes: 'First notes' }),
      });
      const res1 = await worker.fetch(req1, testEnv);
      expect(res1.status).toBe(201);

      // Second submit: 409 Conflict
      const req2 = new Request('https://api.eventgamestudio.local/api/sales/apply', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ agencyName: 'Second Agency', applicationNotes: 'Second notes' }),
      });
      const res2 = await worker.fetch(req2, testEnv);
      expect(res2.status).toBe(409);

      const body2: any = await res2.json();
      expect(body2.error).toContain('already exists');
    });
  });

  // ==============================================================================
  // 5. DATABASE FAILURE DURING /api/auth/me & NO ACCIDENTAL NEW-APPLICANT RESET
  // ==============================================================================
  describe('5. Database Outage Safety During /api/auth/me', () => {
    test('5.1. /api/auth/me distinguishes genuine missing profile from database lookup failure', async () => {
      // Case A: Healthy user with NO sales partner profile -> returns salesPartner: null
      const nonPartnerUser = await createUser({ email: 'nocandidate@company.com', name: 'No Candidate' }, testEnv);
      const tokenA = await signAppToken(nonPartnerUser.id, undefined, undefined, testEnv.JWT_SECRET, testEnv);

      const reqA = new Request('https://api.eventgamestudio.local/api/auth/me', {
        headers: { Authorization: `Bearer ${tokenA}` },
      });
      const resA = await worker.fetch(reqA, testEnv);
      expect(resA.status).toBe(200);
      const bodyA: any = await resA.json();
      expect(bodyA.salesPartner).toBeNull();
      expect(bodyA.salesPartnerUnavailable).toBeUndefined();

      // Case B: Existing partner with database lookup failure
      const activePartnerUser = await createUser({ email: 'existing.active@sales.com', name: 'Existing Active' }, testEnv);
      await createSalesPartnerApplication(activePartnerUser.id, 'App', testEnv);
      await updateSalesPartnerStatus(activePartnerUser.id, 'active', 'Approved', testEnv);

      // Simulate database failure by clearing local cache and forcing an error environment
      clearLocalSalesPartnersCache();
      const failingEnv = {
        ...testEnv,
        SIMULATE_SALES_PARTNER_DB_ERROR: 'true',
      };

      const tokenB = await signAppToken(activePartnerUser.id, undefined, undefined, testEnv.JWT_SECRET, testEnv);
      const reqB = new Request('https://api.eventgamestudio.local/api/auth/me', {
        headers: { Authorization: `Bearer ${tokenB}` },
      });

      const resB = await worker.fetch(reqB, failingEnv);
      expect(resB.status).toBe(200);
      const bodyB: any = await resB.json();

      // CRITICAL: Must NOT report salesPartner: null when DB fails!
      // Must return salesPartner: undefined and salesPartnerUnavailable: true
      expect(bodyB.salesPartner).toBeUndefined();
      expect(bodyB.salesPartnerUnavailable).toBe(true);
    });
  });

  // ==============================================================================
  // 6. PRODUCTION DATABASE OUTAGES & FAIL-CLOSED INTEGRITY
  // ==============================================================================
  describe('6. Production Mode Fail-Closed Safeguards', () => {
    test('6.1. Production rejects mutations when Supabase is not configured (no local fallback)', async () => {
      const prodEnv = {
        NODE_ENV: 'production',
        ALLOW_LOCAL_FALLBACK: 'false',
        SUPABASE_URL: '', // Missing
        SUPABASE_SERVICE_ROLE_KEY: '',
      };

      expect(() => {
        assertProductionSalesSafe('createSalesPartnerApplication', prodEnv);
      }).toThrow('Fatal: Sales Partner operation "createSalesPartnerApplication" requires a valid Supabase database connection');

      await expect(
        createSalesPartnerApplication('some-user-id', 'Details', prodEnv)
      ).rejects.toThrow();

      await expect(
        updateSalesPartnerStatus('some-user-id', 'active', 'Reason', undefined, 'Reason', prodEnv)
      ).rejects.toThrow();

      await expect(
        updateSalesPartnerRate('some-user-id', { custom_commission_rate: 0.15 }, undefined, 'Rate reason', prodEnv)
      ).rejects.toThrow();
    });

    test('6.2. Status checker isUserActiveSalesPartner fails closed on database errors', async () => {
      const failingEnv = {
        NODE_ENV: 'production',
        ALLOW_LOCAL_FALLBACK: 'false',
        SUPABASE_URL: '',
      };

      const isActive = await isUserActiveSalesPartner('00000000-0000-0000-0000-000000000001', failingEnv);
      expect(isActive).toBe(false);
    });
  });

  // ==============================================================================
  // 7. NODE & WORKER PARITY
  // ==============================================================================
  describe('7. Node/Worker Parity Verification', () => {
    test('7.1. Cloudflare Worker provides identical responses for sales partner endpoints', async () => {
      const user = await createUser({ email: 'worker.parity@sales.com', name: 'Parity User' }, testEnv);
      const token = await signAppToken(user.id, undefined, undefined, testEnv.JWT_SECRET, testEnv);

      // POST /api/sales/apply on Worker
      const applyReq = new Request('https://api.eventgamestudio.local/api/sales/apply', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ agencyName: 'Worker Agency', applicationNotes: 'Worker notes' }),
      });
      const applyRes = await worker.fetch(applyReq, testEnv);
      expect(applyRes.status).toBe(201);
      const applyBody: any = await applyRes.json();
      expect(applyBody.success).toBe(true);
      expect(applyBody.salesPartner.status).toBe('pending');
      expect(applyBody.salesPartner.admin_notes).toBeUndefined();

      // GET /api/sales/me before activation returns 403
      const meReq1 = new Request('https://api.eventgamestudio.local/api/sales/me', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const meRes1 = await worker.fetch(meReq1, testEnv);
      expect(meRes1.status).toBe(403);

      // Activate partner
      await updateSalesPartnerStatus(user.id, 'active', 'Admin verified', testEnv);

      // GET /api/sales/me after activation returns 200 with sanitized profile
      const meReq2 = new Request('https://api.eventgamestudio.local/api/sales/me', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const meRes2 = await worker.fetch(meReq2, testEnv);
      expect(meRes2.status).toBe(200);
      const meBody2: any = await meRes2.json();
      expect(meBody2.success).toBe(true);
      expect(meBody2.salesPartner.status).toBe('active');
      expect(meBody2.salesPartner.admin_notes).toBeUndefined();
    });
  });

  // ==============================================================================
  // 8. LIFECYCLE: REGISTRATION -> APPLICATION -> APPROVAL -> ACCESS
  // ==============================================================================
  describe('8. End-to-End Sales Partner Lifecycle', () => {
    test('8.1. Full lifecycle from new user to approved partner with attribution and commissions', async () => {
      // 1. User registration & Customer Org
      const partnerUser = await createUser({ email: 'e2e.partner@agency.com', name: 'E2E Partner' }, testEnv);
      const partnerOrg = await createOrganization({ name: 'Partner Event Agency', owner_id: partnerUser.id }, testEnv);

      // 2. Submit application
      const app = await createSalesPartnerApplication(
        partnerUser.id,
        { agencyName: 'Global Activations', applicationNotes: 'Organizing 15 roadshows annually' },
        testEnv
      );
      expect(app.status).toBe('pending');

      // 3. Admin review & approval with private admin notes
      const devAdmin = await createUser({ email: 'admin.approver@eventgamestudio.com', name: 'Approver', is_developer: true }, testEnv);
      const activated = await updateSalesPartnerStatus(
        partnerUser.id,
        'active',
        'VERIFIED: Phone call with Managing Director. Company profile verified.',
        devAdmin.id,
        'Application approved',
        testEnv
      );
      expect(activated.status).toBe('active');

      // 4. Partner generates referral code
      const codeRecord = await getOrCreateSalesReferralCode(partnerUser.id, testEnv);
      expect(codeRecord.code).toBeDefined();

      // 5. Customer registers using referral code
      const customerUser = await createUser({ email: 'corp.client@clientcorp.com', name: 'Corp Client' }, testEnv);
      const clientOrg = await createOrganization({ name: 'Client Corp Events', owner_id: customerUser.id }, testEnv);

      const refResult = await recordCustomerReferral({
        referralCode: codeRecord.code,
        prospectEmail: customerUser.email,
        referredUserId: customerUser.id,
        organizationId: clientOrg.id,
        referralMethod: 'link',
      }, testEnv);
      expect(refResult.success).toBe(true);

      // Admin approves attribution
      await approveCustomerAttribution(
        refResult.attribution!.id,
        devAdmin.id,
        'Verified qualifying lead',
        { allowExistingCustomerOverride: true },
        testEnv
      );

      // 6. Customer purchases event with RM1,400 Cash
      const theme = await createTheme({ organization_id: clientOrg.id, name: 'Client Theme' }, testEnv);
      const event = await createTestEvent({
        organization_id: clientOrg.id,
        game_theme_id: theme.id,
        name: 'Client Roadshow Event',
        paid_amount: 1400.0,
      });

      const commissionResult = await evaluateAndRecordEventCommission(event.id, testEnv);

      expect(commissionResult.commission).toBeDefined();
      expect(commissionResult.commission!.partner_user_id).toBe(partnerUser.id);
      expect(commissionResult.commission!.commission_amount).toBe(140.0); // 10% on RM1,400 Cash
      expect(commissionResult.commission!.currency).toBe('MYR');
    });
  });

  // ==============================================================================
  // 9. FINANCIAL RECONCILIATION, REFUNDS, PAYOUT IDEMPOTENCY & CURRENCY ISOLATION
  // ==============================================================================
  describe('9. Financial Reconciliation & Payout Safeguards', () => {
    test('9.1. Promotional credits are strictly excluded from commission basis', async () => {
      const partner = await createUser({ email: 'fin.partner@agency.com', name: 'Fin Partner' }, testEnv);
      await createSalesPartnerApplication(partner.id, 'Fin', testEnv);
      await updateSalesPartnerStatus(partner.id, 'active', 'Approved', testEnv);

      const code = await getOrCreateSalesReferralCode(partner.id, testEnv);
      const client = await createUser({ email: 'promo.client@corp.com', name: 'Promo Client' }, testEnv);
      const clientOrg = await createOrganization({ name: 'Promo Client Org', owner_id: client.id }, testEnv);

      const ref = await recordCustomerReferral({
        referralCode: code.code,
        prospectEmail: client.email,
        referredUserId: client.id,
        organizationId: clientOrg.id,
      }, testEnv);
      await approveCustomerAttribution(ref.attribution!.id, 'admin', 'Approved', { allowExistingCustomerOverride: true }, testEnv);

      const theme = await createTheme({ organization_id: clientOrg.id, name: 'Promo Theme' }, testEnv);
      const event = await createTestEvent({
        organization_id: clientOrg.id,
        game_theme_id: theme.id,
        name: 'Promo Event',
        paid_amount: 600.0,
        discount_amount: 800.0,
      });

      // Commission is 10% on CASH ONLY: 10% * 600 = RM60.00 (NOT RM140.00)
      const res = await evaluateAndRecordEventCommission(event.id, testEnv);
      expect(res.commission!.cash_collected_amount).toBe(600.0);
      expect(res.commission!.commission_amount).toBe(60.0);
    });

    test('9.2. Event refund voids commission and logs clawback audit record', async () => {
      const partner = await createUser({ email: 'refund.partner@agency.com', name: 'Refund Partner' }, testEnv);
      await createSalesPartnerApplication(partner.id, 'Refund', testEnv);
      await updateSalesPartnerStatus(partner.id, 'active', 'Approved', testEnv);

      const code = await getOrCreateSalesReferralCode(partner.id, testEnv);
      const client = await createUser({ email: 'refund.client@corp.com', name: 'Refund Client' }, testEnv);
      const clientOrg = await createOrganization({ name: 'Refund Org', owner_id: client.id }, testEnv);

      const ref = await recordCustomerReferral({
        referralCode: code.code,
        organizationId: clientOrg.id,
      }, testEnv);
      await approveCustomerAttribution(ref.attribution!.id, 'admin', 'Approved', { allowExistingCustomerOverride: true }, testEnv);

      const theme = await createTheme({ organization_id: clientOrg.id, name: 'Refund Theme' }, testEnv);
      const event = await createTestEvent({
        organization_id: clientOrg.id,
        game_theme_id: theme.id,
        name: 'Refund Event',
        paid_amount: 1400.0,
      });

      const res = await evaluateAndRecordEventCommission(event.id, testEnv);
      expect(res.commission!.status).toBe('pending_review');

      // Process event refund clawback
      const clawback = await handleEventRefundCommissionClawback(event.id, 'Event cancelled by client', 'admin-001', testEnv);
      expect(clawback?.status).toBe('voided');

      // Verify commission is now voided
      const commissions = await getPartnerCommissions(partner.id, testEnv);
      const comm = commissions.find((c) => c.event_id === event.id);
      expect(comm?.status).toBe('voided');
    });

    test('9.3. Currency isolation: MYR and SGD commissions are grouped into separate payout batches', async () => {
      const partner = await createUser({ email: 'multi.currency@partner.com', name: 'Multi Currency' }, testEnv);
      await createSalesPartnerApplication(partner.id, 'Currency', testEnv);
      await updateSalesPartnerStatus(partner.id, 'active', 'Approved', testEnv);

      const code = await getOrCreateSalesReferralCode(partner.id, testEnv);

      // Customer 1 in Malaysia (MYR)
      const myClient = await createUser({ email: 'my.client@corp.my', name: 'MY Client' }, testEnv);
      const myOrg = await createOrganization({ name: 'MY Org', owner_id: myClient.id }, testEnv);
      const refMY = await recordCustomerReferral({ referralCode: code.code, organizationId: myOrg.id }, testEnv);
      await approveCustomerAttribution(refMY.attribution!.id, 'admin', 'Approved', { allowExistingCustomerOverride: true }, testEnv);

      const themeMY = await createTheme({ organization_id: myOrg.id, name: 'MY Theme' }, testEnv);
      const eventMY = await createTestEvent({
        organization_id: myOrg.id,
        game_theme_id: themeMY.id,
        name: 'MY Event',
        paid_amount: 1400.0,
        currency: 'MYR',
      });
      const commMY = await evaluateAndRecordEventCommission(eventMY.id, testEnv);

      // Customer 2 in Singapore (SGD)
      const sgClient = await createUser({ email: 'sg.client@corp.sg', name: 'SG Client' }, testEnv);
      const sgOrg = await createOrganization({ name: 'SG Org', owner_id: sgClient.id }, testEnv);
      const refSG = await recordCustomerReferral({ referralCode: code.code, organizationId: sgOrg.id }, testEnv);
      await approveCustomerAttribution(refSG.attribution!.id, 'admin', 'Approved', { allowExistingCustomerOverride: true }, testEnv);

      const themeSG = await createTheme({ organization_id: sgOrg.id, name: 'SG Theme' }, testEnv);
      const eventSG = await createTestEvent({
        organization_id: sgOrg.id,
        game_theme_id: themeSG.id,
        name: 'SG Event',
        paid_amount: 1400.0,
        currency: 'SGD',
      });
      const commSG = await evaluateAndRecordEventCommission(eventSG.id, testEnv);

      // Manually set status to 'ready' to test batch creation
      localCommissionsCache.get(commMY.commission!.id)!.status = 'ready';
      localCommissionsCache.get(commSG.commission!.id)!.status = 'ready';

      // Create MYR batch
      const myrBatch = await createPayoutBatch(
        { partner_user_id: partner.id, currency: 'MYR' },
        'admin-001',
        testEnv
      );
      expect(myrBatch.currency).toBe('MYR');
      expect(myrBatch.commission_count).toBe(1);
      expect(myrBatch.total_amount).toBe(140.0);

      // Create SGD batch
      const sgdBatch = await createPayoutBatch(
        { partner_user_id: partner.id, currency: 'SGD' },
        'admin-001',
        testEnv
      );
      expect(sgdBatch.currency).toBe('SGD');
      expect(sgdBatch.commission_count).toBe(1);
      expect(sgdBatch.total_amount).toBe(140.0);

      // Mark MYR batch paid with reference
      const paidBatch = await markPayoutBatchPaid(
        myrBatch.id,
        { payment_reference: 'BANK-TRF-MYR-2026-001', payment_method: 'bank_transfer' },
        'admin-001',
        testEnv
      );
      expect(paidBatch.status).toBe('paid');
      expect(paidBatch.payment_reference).toBe('BANK-TRF-MYR-2026-001');

      // Idempotency: marking already-paid batch paid throws or returns existing
      await expect(
        markPayoutBatchPaid(
          myrBatch.id,
          { payment_reference: 'DUPLICATE-REF', payment_method: 'bank_transfer' },
          'admin-001',
          testEnv
        )
      ).rejects.toThrow('Batch is already marked as paid');
    });
  });
});
