import { test, expect, describe, beforeEach } from 'bun:test';
import fs from 'fs';
import path from 'path';
import {
  signAppToken,
} from './auth.js';
import {
  createUser,
  getUserById,
  createOrganization,
} from './db/index.js';
import {
  clearLocalSalesPartnersCache,
  createSalesPartnerApplication,
  updateSalesPartnerStatus,
} from './db/salesPartners.js';
import {
  clearLocalAttributionsCache,
  clearLocalReferralCodesCache,
  getOrCreateSalesReferralCode,
  validateReferralCode,
  recordCustomerReferral,
  linkOrganizationToPendingAttribution,
  getApprovedAttributionForOrg,
  getAttributionById,
  getAttributionAuditLogs,
  approveCustomerAttribution,
  rejectCustomerAttribution,
  reassignCustomerAttribution,
  revokeSalesReferralCode,
  listCustomerAttributions,
} from './db/salesAttribution.js';
import worker from '../worker.js';

describe('Phase 4 — Sales Referrals, Customer Attributions, and Admin Governance', () => {
  const testEnv = {
    SUPABASE_URL: 'https://placeholder.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'placeholder-service-key',
    JWT_SECRET: 'test-jwt-secret-for-sales-attribution-phase4-testing',
    NODE_ENV: 'test',
  };

  beforeEach(() => {
    clearLocalSalesPartnersCache();
    clearLocalAttributionsCache();
    clearLocalReferralCodesCache();
  });

  // 1. Database Migrations Inspection
  test('1. Migration files exist and define customer_attributions, unique indexes, and audit logs', () => {
    const migration1Path = path.join(process.cwd(), 'supabase/migrations/20261012020000_create_sales_referrals_and_attributions.sql');
    const migration2Path = path.join(process.cwd(), 'supabase/migrations/20261013000000_sales_attribution_enhancements.sql');

    expect(fs.existsSync(migration1Path)).toBe(true);
    expect(fs.existsSync(migration2Path)).toBe(true);

    const sql1 = fs.readFileSync(migration1Path, 'utf8');
    const sql2 = fs.readFileSync(migration2Path, 'utf8');

    // Base tables & constraints
    expect(sql1).toContain('CREATE TABLE IF NOT EXISTS public.sales_referral_codes');
    expect(sql1).toContain('CREATE TABLE IF NOT EXISTS public.customer_attributions');
    expect(sql1).toContain('CREATE TABLE IF NOT EXISTS public.customer_attribution_audit_logs');
    expect(sql1).toContain('CREATE INDEX IF NOT EXISTS idx_customer_attributions_partner');

    // Phase 4 enhancement indexes & idempotency
    expect(sql2).toContain('idx_customer_attributions_partner_user_unique');
    expect(sql2).toContain('idx_customer_attributions_partner_email_unique');
    expect(sql2).toContain('idx_customer_attribution_audit_actor');
    expect(sql2).toContain('idx_customer_attributions_competing');
  });

  // 2. Referral Code Generation and Fail-Closed Validation
  test('2. Active partner generates referral code; revoked code fails closed', async () => {
    const partnerUser = await createUser({
      email: 'partner.one@agency.com',
      name: 'Partner One',
    }, testEnv);

    await createSalesPartnerApplication(partnerUser.id, 'Partner Agency 1', testEnv);
    await updateSalesPartnerStatus(partnerUser.id, 'active', 'Approved partner', testEnv);

    // Generate code
    const codeRec = await getOrCreateSalesReferralCode(partnerUser.id, testEnv);
    expect(codeRec.code).toBeDefined();
    expect(codeRec.is_active).toBe(true);

    // Validate active code
    const validResult = await validateReferralCode(codeRec.code, testEnv);
    expect(validResult.valid).toBe(true);
    expect(validResult.partnerProfile?.status).toBe('active');

    // Revoke code
    await revokeSalesReferralCode(codeRec.code, undefined, 'Campaign ended', testEnv);

    // Validate revoked code
    const invalidResult = await validateReferralCode(codeRec.code, testEnv);
    expect(invalidResult.valid).toBe(false);
    expect(invalidResult.reason).toBe('CODE_INACTIVE_OR_REVOKED');
  });

  // 3. Idempotency & Duplicate Claim Prevention
  test('3. Repeated referral captures from the same partner return existing attribution without duplicates', async () => {
    const partner = await createUser({ email: 'partner.dupe@agency.com', name: 'Partner Dupe' }, testEnv);
    await createSalesPartnerApplication(partner.id, 'Dupe Agency', testEnv);
    await updateSalesPartnerStatus(partner.id, 'active', undefined, testEnv);
    const codeRec = await getOrCreateSalesReferralCode(partner.id, testEnv);

    const clientEmail = 'prospect.buyer@company.com';

    // First capture
    const first = await recordCustomerReferral({
      referralCode: codeRec.code,
      prospectEmail: clientEmail,
      referralMethod: 'link',
    }, testEnv);
    expect(first.success).toBe(true);
    expect(first.attribution).toBeDefined();

    // Second capture (identical partner & email)
    const second = await recordCustomerReferral({
      referralCode: codeRec.code,
      prospectEmail: clientEmail,
      referralMethod: 'link',
    }, testEnv);
    expect(second.success).toBe(true);
    expect(second.attribution?.id).toBe(first.attribution!.id);

    // Ensure list count for this partner is exactly 1
    const list = await listCustomerAttributions({ partnerUserId: partner.id }, testEnv);
    expect(list.length).toBe(1);
  });

  // 4. Competing Claims Between Different Partners
  test('4. Competing claim from different partner is flagged for Admin review and preserves prior evidence', async () => {
    // Partner A
    const partnerA = await createUser({ email: 'partner.a@agency.com', name: 'Partner A' }, testEnv);
    await createSalesPartnerApplication(partnerA.id, 'Agency A', testEnv);
    await updateSalesPartnerStatus(partnerA.id, 'active', undefined, testEnv);
    const codeA = await getOrCreateSalesReferralCode(partnerA.id, testEnv);

    // Partner B
    const partnerB = await createUser({ email: 'partner.b@agency.com', name: 'Partner B' }, testEnv);
    await createSalesPartnerApplication(partnerB.id, 'Agency B', testEnv);
    await updateSalesPartnerStatus(partnerB.id, 'active', undefined, testEnv);
    const codeB = await getOrCreateSalesReferralCode(partnerB.id, testEnv);

    const clientEmail = 'disputed.client@corp.com';

    // Partner A captures lead first
    const claimA = await recordCustomerReferral({
      referralCode: codeA.code,
      prospectEmail: clientEmail,
      referralMethod: 'link',
    }, testEnv);
    expect(claimA.success).toBe(true);

    // Partner B captures same lead afterwards
    const claimB = await recordCustomerReferral({
      referralCode: codeB.code,
      prospectEmail: clientEmail,
      referralMethod: 'code',
    }, testEnv);
    expect(claimB.success).toBe(true);
    expect(claimB.attribution?.is_competing_claim).toBe(true);
    expect(claimB.attribution?.competing_attribution_id).toBe(claimA.attribution!.id);
    expect(claimB.attribution?.status).toBe('needs_review');

    // Both records exist so Admin can inspect evidence
    const allAttributions = await listCustomerAttributions({}, testEnv);
    expect(allAttributions.length).toBe(2);
  });

  // 5. Existing Customer Protection & Self-Referral Detection
  test('5. Existing customer accounts and self-referrals are prevented from auto-qualification', async () => {
    const partner = await createUser({ email: 'partner.owner@agency.com', name: 'Partner Owner' }, testEnv);
    await createSalesPartnerApplication(partner.id, 'Owner Agency', testEnv);
    await updateSalesPartnerStatus(partner.id, 'active', undefined, testEnv);
    const code = await getOrCreateSalesReferralCode(partner.id, testEnv);

    // 5a. Self-referral attempt (partner refers themselves)
    const selfRef = await recordCustomerReferral({
      referralCode: code.code,
      referredUserId: partner.id,
      prospectEmail: partner.email,
    }, testEnv);
    expect(selfRef.success).toBe(true);
    expect(selfRef.attribution?.is_self_referral).toBe(true);
    expect(selfRef.attribution?.status).toBe('needs_review');

    // 5b. Existing customer check: user created with established orgs
    const existingUser = await createUser({
      email: 'established.customer@legacy.com',
      name: 'Legacy Customer',
    }, testEnv);
    await createOrganization({
      name: 'Legacy Corp',
      owner_id: existingUser.id,
      country_code: 'MY',
    }, testEnv);

    const existingClaim = await recordCustomerReferral({
      referralCode: code.code,
      referredUserId: existingUser.id,
      prospectEmail: existingUser.email,
    }, testEnv);
    expect(existingClaim.success).toBe(true);
    expect(existingClaim.attribution?.is_existing_customer).toBe(true);
    expect(existingClaim.attribution?.status).toBe('needs_review');
  });

  // 6. Organization Linking & Single Approved Attribution Rule
  test('6. Organization creation links to pending attribution and prevents duplicate approved partners', async () => {
    const partner = await createUser({ email: 'partner.linker@agency.com', name: 'Partner Linker' }, testEnv);
    await createSalesPartnerApplication(partner.id, 'Linker Agency', testEnv);
    await updateSalesPartnerStatus(partner.id, 'active', undefined, testEnv);
    const code = await getOrCreateSalesReferralCode(partner.id, testEnv);

    // Fresh prospect signs up via referral
    const newCustomer = await createUser({ email: 'new.buyer@startup.io', name: 'New Buyer' }, testEnv);
    await recordCustomerReferral({
      referralCode: code.code,
      referredUserId: newCustomer.id,
      prospectEmail: newCustomer.email,
    }, testEnv);

    // Customer creates organization
    const org = await createOrganization({
      name: 'Startup IO',
      owner_id: newCustomer.id,
      country_code: 'SG',
    }, testEnv);

    // Link organization to pending attribution
    const linked = await linkOrganizationToPendingAttribution(newCustomer.id, org.id, testEnv);
    expect(linked).toBeDefined();
    expect(linked?.organization_id).toBe(org.id);
    expect(linked?.status).toBe('approved');

    // Verify getApprovedAttributionForOrg returns this partner
    const approved = await getApprovedAttributionForOrg(org.id, testEnv);
    expect(approved?.partner_user_id).toBe(partner.id);
  });

  // 7. Admin Governance: Approval, Rejection, Reassignment, and Audit Logs
  test('7. Admin can approve, reject, reassign with recorded reason and full audit trail', async () => {
    const admin = await createUser({ email: 'admin@eventgamestudio.com', name: 'Platform Admin', is_developer: true }, testEnv);

    const partner1 = await createUser({ email: 'partner1@corp.com', name: 'Partner 1' }, testEnv);
    await createSalesPartnerApplication(partner1.id, 'Partner 1 Corp', testEnv);
    await updateSalesPartnerStatus(partner1.id, 'active', undefined, testEnv);
    const code1 = await getOrCreateSalesReferralCode(partner1.id, testEnv);

    const partner2 = await createUser({ email: 'partner2@corp.com', name: 'Partner 2' }, testEnv);
    await createSalesPartnerApplication(partner2.id, 'Partner 2 Corp', testEnv);
    await updateSalesPartnerStatus(partner2.id, 'active', undefined, testEnv);

    const client = await createUser({ email: 'client.review@test.com', name: 'Client Review' }, testEnv);

    // Lead created needing review
    const ref = await recordCustomerReferral({
      referralCode: code1.code,
      referredUserId: client.id,
      prospectEmail: client.email,
    }, testEnv);
    const attrId = ref.attribution!.id;

    // 7a. Reassign to Partner 2
    const reassigned = await reassignCustomerAttribution(
      attrId,
      partner2.id,
      admin.id,
      'Lead was initiated by Partner 2 at exhibition',
      testEnv
    );
    expect(reassigned.partner_user_id).toBe(partner2.id);
    expect(reassigned.status).toBe('approved');

    // 7b. Check audit trail
    const auditLogs = await getAttributionAuditLogs(attrId, testEnv);
    expect(auditLogs.length).toBeGreaterThanOrEqual(2);
    const reassignLog = auditLogs.find((l) => l.action === 'REASSIGNED');
    expect(reassignLog).toBeDefined();
    expect(reassignLog?.actor_user_id).toBe(admin.id);
    expect(reassignLog?.previous_partner_id).toBe(partner1.id);
    expect(reassignLog?.new_partner_id).toBe(partner2.id);

    // 7c. Admin reject with required reason
    const rejected = await rejectCustomerAttribution(
      attrId,
      admin.id,
      'Customer cancelled project engagement',
      testEnv
    );
    expect(rejected.status).toBe('rejected');
    expect(rejected.decision_reason).toBe('Customer cancelled project engagement');

    // 7d. Admin re-approve
    const approved = await approveCustomerAttribution(
      attrId,
      admin.id,
      'Customer re-engaged on enterprise contract',
      testEnv
    );
    expect(approved.status).toBe('approved');
  });

  // 8. Worker Route Security & Multi-Tenant Authorization
  test('8. Endpoints enforce authentication and RBAC boundaries in Worker', async () => {
    const regularUser = await createUser({ email: 'regular@user.com', name: 'Regular User' }, testEnv);
    const regularToken = await signAppToken(regularUser.id, undefined, undefined, testEnv.JWT_SECRET, testEnv);

    const adminUser = await createUser({ email: 'admin@studio.com', name: 'Admin', is_developer: true }, testEnv);
    const adminToken = await signAppToken(adminUser.id, undefined, undefined, testEnv.JWT_SECRET, testEnv);

    // 8a. Unauthenticated access to admin attributions is blocked (401)
    const unauthReq = new Request('https://api.eventgamestudio.local/api/developer/sales-attributions', {
      method: 'GET',
    });
    const unauthRes = await worker.fetch(unauthReq, testEnv);
    expect(unauthRes.status).toBe(401);

    // 8b. Regular customer cannot access developer attributions (403)
    const regularReq = new Request('https://api.eventgamestudio.local/api/developer/sales-attributions', {
      method: 'GET',
      headers: { Authorization: `Bearer ${regularToken}` },
    });
    const regularRes = await worker.fetch(regularReq, testEnv);
    expect(regularRes.status).toBe(403);

    // 8c. Developer Admin can access developer attributions (200)
    const adminReq = new Request('https://api.eventgamestudio.local/api/developer/sales-attributions', {
      method: 'GET',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const adminRes = await worker.fetch(adminReq, testEnv);
    expect(adminRes.status).toBe(200);
    const adminBody: any = await adminRes.json();
    expect(adminBody.success).toBe(true);
    expect(Array.isArray(adminBody.attributions)).toBe(true);

    // 8d. Public validation endpoint works without auth for valid active code
    const partner = await createUser({ email: 'public.partner@test.com', name: 'Public Partner' }, testEnv);
    await createSalesPartnerApplication(partner.id, 'Public Agency', testEnv);
    await updateSalesPartnerStatus(partner.id, 'active', undefined, testEnv);
    const code = await getOrCreateSalesReferralCode(partner.id, testEnv);

    const valReq = new Request(`https://api.eventgamestudio.local/api/referrals/validate/${code.code}`, {
      method: 'GET',
    });
    const valRes = await worker.fetch(valReq, testEnv);
    expect(valRes.status).toBe(200);
    const valBody: any = await valRes.json();
    expect(valBody.valid).toBe(true);
    expect(valBody.code).toBe(code.code);
  });
});
