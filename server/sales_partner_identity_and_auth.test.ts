import { test, expect, describe, beforeEach } from 'bun:test';
import fs from 'fs';
import path from 'path';
import {
  signAppToken,
  resolveAuthToken,
  isUserActiveSalesPartner,
  isUserDeveloperAdmin,
  verifyOrgMembershipAndPermission,
  PERMISSIONS,
  OrgRole,
} from './auth.js';
import {
  createUser,
  getUserById,
  updateUser,
  createOrganization,
  addMember,
  getMember,
} from './db/index.js';
import {
  localSalesPartnersCache,
  clearLocalSalesPartnersCache,
  createSalesPartnerApplication,
  updateSalesPartnerStatus,
  getSalesPartnerProfileByUserId,
  listSalesPartnerProfiles,
} from './db/salesPartners.js';
import worker from '../worker.js';

describe('Phase 2 — Sales Partner Identity, Dual-Role Accounts, and Secure Authorization', () => {
  const testEnv = {
    SUPABASE_URL: 'https://placeholder.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'placeholder-service-key',
    JWT_SECRET: 'test-jwt-secret-for-sales-partner-auth-testing-32b',
    NODE_ENV: 'test',
  };

  beforeEach(() => {
    clearLocalSalesPartnersCache();
  });

  // 15. Migration file inspection and structural integrity
  test('15. Database migration exists and defines additive schema, RLS, and trigger', () => {
    const migrationPath = path.join(process.cwd(), 'supabase/migrations/20261012010000_create_sales_partner_profiles.sql');
    expect(fs.existsSync(migrationPath)).toBe(true);

    const sql = fs.readFileSync(migrationPath, 'utf8');

    // Table definition & columns
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.sales_partner_profiles');
    expect(sql).toContain('user_id UUID NOT NULL REFERENCES public.users (id)');
    expect(sql).toContain('CONSTRAINT unique_sales_partner_user UNIQUE (user_id)');
    expect(sql).toContain("status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'suspended', 'rejected'))");
    expect(sql).toContain('applied_at TIMESTAMPTZ NOT NULL DEFAULT timezone(\'utc\'::text, now())');
    expect(sql).toContain('activated_at TIMESTAMPTZ');
    expect(sql).toContain('suspended_at TIMESTAMPTZ');

    // Indexes
    expect(sql).toContain('CREATE INDEX IF NOT EXISTS idx_sales_partner_profiles_user_id');
    expect(sql).toContain('CREATE INDEX IF NOT EXISTS idx_sales_partner_profiles_status');

    // RLS & Grants
    expect(sql).toContain('ALTER TABLE public.sales_partner_profiles ENABLE ROW LEVEL SECURITY');
    expect(sql).toContain('CREATE POLICY "Users can view own sales partner profile"');
    expect(sql).toContain('CREATE POLICY "Developer admins can view all sales partner profiles"');
    expect(sql).toContain('REVOKE INSERT, UPDATE, DELETE ON public.sales_partner_profiles FROM authenticated');
    expect(sql).toContain('GRANT SELECT ON public.sales_partner_profiles TO authenticated');

    // Tampering protection trigger
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.prevent_sales_partner_tampering()');
    expect(sql).toContain('CREATE TRIGGER trg_prevent_sales_partner_tampering');
  });

  // 1. Normal Customer cannot access protected Sales Partner endpoints
  test('1. Normal Customer cannot access protected Sales Partner endpoint (/api/sales/me returns 403)', async () => {
    const customerUser = await createUser({
      email: 'regular.customer@company.com',
      name: 'Regular Customer',
    }, testEnv);

    const token = await signAppToken(customerUser.id, undefined, undefined, testEnv.JWT_SECRET, testEnv);

    const req = new Request('https://api.eventgamestudio.local/api/sales/me', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const res = await worker.fetch(req, testEnv);
    expect(res.status).toBe(403);

    const body: any = await res.json();
    expect(body.code).toBe('SALES_PARTNER_ACCESS_REQUIRED');
    expect(body.partnerStatus).toBe('none');
  });

  // 2. Active Sales Partner can access authorized Sales Partner endpoints
  test('2. Active Sales Partner can access authorized Sales Partner endpoint (/api/sales/me returns 200)', async () => {
    const partnerUser = await createUser({
      email: 'active.partner@sales.com',
      name: 'Active Partner',
    }, testEnv);

    // Apply and activate profile
    await createSalesPartnerApplication(partnerUser.id, 'Self-applied as agent', testEnv);
    await updateSalesPartnerStatus(partnerUser.id, 'active', 'Approved by admin', testEnv);

    const isPartnerActive = await isUserActiveSalesPartner(partnerUser.id, testEnv);
    expect(isPartnerActive).toBe(true);

    const token = await signAppToken(partnerUser.id, undefined, undefined, testEnv.JWT_SECRET, testEnv);

    const req = new Request('https://api.eventgamestudio.local/api/sales/me', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const res = await worker.fetch(req, testEnv);
    expect(res.status).toBe(200);

    const body: any = await res.json();
    expect(body.success).toBe(true);
    expect(body.salesPartner.user_id).toBe(partnerUser.id);
    expect(body.salesPartner.status).toBe('active');
    expect(body.user.email).toBe('active.partner@sales.com');
  });

  // 3. Pending partner cannot access protected Sales Partner functions
  test('3. Pending partner cannot access protected Sales Partner functions (/api/sales/me returns 403)', async () => {
    const pendingUser = await createUser({
      email: 'pending.partner@candidate.com',
      name: 'Pending Candidate',
    }, testEnv);

    await createSalesPartnerApplication(pendingUser.id, 'Pending review', testEnv);

    const isPartnerActive = await isUserActiveSalesPartner(pendingUser.id, testEnv);
    expect(isPartnerActive).toBe(false);

    const token = await signAppToken(pendingUser.id, undefined, undefined, testEnv.JWT_SECRET, testEnv);

    const req = new Request('https://api.eventgamestudio.local/api/sales/me', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const res = await worker.fetch(req, testEnv);
    expect(res.status).toBe(403);

    const body: any = await res.json();
    expect(body.code).toBe('SALES_PARTNER_ACCESS_REQUIRED');
    expect(body.partnerStatus).toBe('pending');
  });

  // 4. Suspended partner loses Sales Partner access
  test('4. Suspended partner loses Sales Partner access (/api/sales/me returns 403)', async () => {
    const suspendedUser = await createUser({
      email: 'suspended.partner@audit.com',
      name: 'Suspended Partner',
    }, testEnv);

    await createSalesPartnerApplication(suspendedUser.id, 'Initial app', testEnv);
    await updateSalesPartnerStatus(suspendedUser.id, 'active', 'Activated', testEnv);
    // Suspended later
    await updateSalesPartnerStatus(suspendedUser.id, 'suspended', 'Suspended for review', testEnv);

    const isPartnerActive = await isUserActiveSalesPartner(suspendedUser.id, testEnv);
    expect(isPartnerActive).toBe(false);

    const token = await signAppToken(suspendedUser.id, undefined, undefined, testEnv.JWT_SECRET, testEnv);

    const req = new Request('https://api.eventgamestudio.local/api/sales/me', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const res = await worker.fetch(req, testEnv);
    expect(res.status).toBe(403);

    const body: any = await res.json();
    expect(body.code).toBe('SALES_PARTNER_ACCESS_REQUIRED');
    expect(body.partnerStatus).toBe('suspended');
  });

  // 5. Suspended partner retains legitimate Customer organization access
  test('5. Suspended partner retains legitimate Customer organization access', async () => {
    const dualUser = await createUser({
      email: 'dual.suspended@client.com',
      name: 'Dual Suspended User',
    }, testEnv);

    // Create an organization owned by this customer
    const org = await createOrganization({
      name: 'Dual User Client Agency',
      owner_id: dualUser.id,
      country_code: 'SG',
    }, testEnv);

    // Give partner status, then suspend partner status
    await createSalesPartnerApplication(dualUser.id, 'App', testEnv);
    await updateSalesPartnerStatus(dualUser.id, 'suspended', 'Partner suspended', testEnv);

    // Verify Sales Partner access is revoked
    expect(await isUserActiveSalesPartner(dualUser.id, testEnv)).toBe(false);

    // Verify Customer organization membership and permissions remain fully intact
    const membership = await verifyOrgMembershipAndPermission(dualUser.id, org.id, 'event.create', testEnv);
    expect(membership.isMember).toBe(true);
    expect(membership.role).toBe('owner');
    expect(membership.hasPermission).toBe(true);

    const walletCheck = await verifyOrgMembershipAndPermission(dualUser.id, org.id, 'wallet.view', testEnv);
    expect(walletCheck.hasPermission).toBe(true);
  });

  // 6. A user can simultaneously have Sales Partner access and Customer organization membership
  test('6. A user can simultaneously hold active Sales Partner access and Customer organization membership', async () => {
    const dualActiveUser = await createUser({
      email: 'dual.active@hybrid.com',
      name: 'Dual Active User',
    }, testEnv);

    const org = await createOrganization({
      name: 'Hybrid Corp Client',
      owner_id: dualActiveUser.id,
      country_code: 'MY',
    }, testEnv);

    // Activate Sales Partner capability
    await createSalesPartnerApplication(dualActiveUser.id, 'Dual role app', testEnv);
    await updateSalesPartnerStatus(dualActiveUser.id, 'active', 'Approved', testEnv);

    // 1. Verify Sales Partner active
    expect(await isUserActiveSalesPartner(dualActiveUser.id, testEnv)).toBe(true);

    // 2. Verify Customer Organization Owner intact
    const orgCheck = await verifyOrgMembershipAndPermission(dualActiveUser.id, org.id, 'event.view', testEnv);
    expect(orgCheck.isMember).toBe(true);
    expect(orgCheck.role).toBe('owner');

    // 3. Verify /api/auth/me returns both workspaces simultaneously
    const token = await signAppToken(dualActiveUser.id, org.id, 'owner', testEnv.JWT_SECRET, testEnv);
    const req = new Request('https://api.eventgamestudio.local/api/auth/me', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const res = await worker.fetch(req, testEnv);
    expect(res.status).toBe(200);

    const authMe: any = await res.json();
    expect(authMe.user.id).toBe(dualActiveUser.id);
    expect(authMe.organizations.length).toBeGreaterThan(0);
    expect(authMe.activeOrganization?.id).toBe(org.id);
    expect(authMe.salesPartner).not.toBeNull();
    expect(authMe.salesPartner.status).toBe('active');
  });

  // 7. Granting Sales Partner access does not change the user's organization role
  test('7. Granting Sales Partner access does not alter organization role', async () => {
    const designerUser = await createUser({
      email: 'designer.user@studio.com',
      name: 'Design Specialist',
    }, testEnv);

    const ownerUser = await createUser({
      email: 'agency.owner@studio.com',
      name: 'Agency Owner',
    }, testEnv);

    const org = await createOrganization({
      name: 'Studio Design Org',
      owner_id: ownerUser.id,
    }, testEnv);

    // Add designerUser as 'designer'
    await addMember({
      organization_id: org.id,
      user_id: designerUser.id,
      role: 'designer',
    }, testEnv);

    const memberBefore = await getMember(org.id, designerUser.id, testEnv);
    expect(memberBefore?.role).toBe('designer');

    // Activate as Sales Partner
    await createSalesPartnerApplication(designerUser.id, 'Sales app', testEnv);
    await updateSalesPartnerStatus(designerUser.id, 'active', 'Approved', testEnv);

    // Verify organization role is still 'designer'
    const memberAfter = await getMember(org.id, designerUser.id, testEnv);
    expect(memberAfter?.role).toBe('designer');
  });

  // 8. A Sales Partner cannot assign themselves Developer Admin privileges
  test('8. A Sales Partner cannot assign themselves Developer Admin privileges', async () => {
    const partner = await createUser({
      email: 'partner.attempt@sales.com',
      name: 'Partner Attempting Escalation',
      is_developer: false,
    }, testEnv);

    await createSalesPartnerApplication(partner.id, 'App', testEnv);
    await updateSalesPartnerStatus(partner.id, 'active', 'Approved', testEnv);

    // Attempt to escalate via updateUser
    const updated = await updateUser(partner.id, {
      name: 'Malicious Name',
      is_developer: true, // Should be ignored/stripped by updateUser defense
    } as any, testEnv);

    expect(updated.is_developer).toBe(false);
    expect(isUserDeveloperAdmin(updated, testEnv)).toBe(false);
  });

  // 9. A Sales Partner cannot activate or suspend their own profile via public endpoints
  test('9. A Sales Partner cannot activate or suspend their own profile via public endpoints', async () => {
    const partnerUser = await createUser({
      email: 'applicant@candidate.com',
      name: 'Applicant Candidate',
    }, testEnv);

    const token = await signAppToken(partnerUser.id, undefined, undefined, testEnv.JWT_SECRET, testEnv);

    // Applying via public endpoint only yields 'pending'
    const applyReq = new Request('https://api.eventgamestudio.local/api/sales/apply', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ adminNotes: 'Want to be active immediately' }),
    });

    const applyRes = await worker.fetch(applyReq, testEnv);
    expect(applyRes.status).toBe(201);
    const applyBody: any = await applyRes.json();
    expect(applyBody.salesPartner.status).toBe('pending');

    // Attempting to apply again fails with conflict
    const reapplyRes = await worker.fetch(applyReq, testEnv);
    expect(reapplyRes.status).toBe(409);
  });

  // 10. An unauthorized user cannot activate or suspend another partner
  test('10. An unauthorized user cannot activate or suspend another partner (403 Forbidden)', async () => {
    const regularUser = await createUser({
      email: 'unauthorized.user@company.com',
      name: 'Unauthorized User',
      is_developer: false,
    }, testEnv);

    const targetPartner = await createUser({
      email: 'target.partner@sales.com',
      name: 'Target Partner',
    }, testEnv);

    await createSalesPartnerApplication(targetPartner.id, 'App', testEnv);

    const token = await signAppToken(regularUser.id, undefined, undefined, testEnv.JWT_SECRET, testEnv);

    const patchReq = new Request(`https://api.eventgamestudio.local/api/developer/sales-partners/${targetPartner.id}/status`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ status: 'active', admin_notes: 'Self-activating target' }),
    });

    const res = await worker.fetch(patchReq, testEnv);
    expect(res.status).toBe(403);

    // Verify target status is still 'pending'
    const profile = await getSalesPartnerProfileByUserId(targetPartner.id, testEnv);
    expect(profile?.status).toBe('pending');
  });

  // 11. Existing Developer Admin authorization still works
  test('11. Authorized Developer Admin can list and update Sales Partner status', async () => {
    const adminUser = await createUser({
      email: 'platform.admin@system.com',
      name: 'Platform Admin',
      is_developer: true,
    }, testEnv);

    const partnerUser = await createUser({
      email: 'new.candidate@sales.com',
      name: 'New Candidate',
    }, testEnv);

    await createSalesPartnerApplication(partnerUser.id, 'Looking to join program', testEnv);

    const adminToken = await signAppToken(adminUser.id, undefined, undefined, testEnv.JWT_SECRET, testEnv);

    // List partners
    const listReq = new Request('https://api.eventgamestudio.local/api/developer/sales-partners', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${adminToken}`,
      },
    });

    const listRes = await worker.fetch(listReq, testEnv);
    expect(listRes.status).toBe(200);
    const listBody: any = await listRes.json();
    expect(Array.isArray(listBody.salesPartners)).toBe(true);
    expect(listBody.salesPartners.some((p: any) => p.user_id === partnerUser.id)).toBe(true);

    // Update partner status to 'active'
    const updateReq = new Request(`https://api.eventgamestudio.local/api/developer/sales-partners/${partnerUser.id}/status`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ status: 'active', admin_notes: 'Interview completed and verified' }),
    });

    const updateRes = await worker.fetch(updateReq, testEnv);
    expect(updateRes.status).toBe(200);
    const updateBody: any = await updateRes.json();
    expect(updateBody.success).toBe(true);
    expect(updateBody.salesPartner.status).toBe('active');
    expect(updateBody.salesPartner.activated_at).not.toBeNull();
  });

  // 12. Existing Designer restrictions remain unchanged
  test('12. Existing Designer role restrictions remain strictly enforced', () => {
    expect(PERMISSIONS.designer).toBeDefined();
    // Designer can only edit games/themes
    expect(PERMISSIONS.designer.includes('game.view')).toBe(true);
    expect(PERMISSIONS.designer.includes('game.background.edit')).toBe(true);

    // Strictly forbidden for designer
    expect(PERMISSIONS.designer.includes('event.create')).toBe(false);
    expect(PERMISSIONS.designer.includes('event.pay')).toBe(false);
    expect(PERMISSIONS.designer.includes('wallet.topup')).toBe(false);
    expect(PERMISSIONS.designer.includes('organization.delete')).toBe(false);
  });

  // 13. Existing login, session restoration, and organization switching continue to work
  test('13. Session restoration and organization switching preserve Sales Partner status', async () => {
    const user = await createUser({
      email: 'multi.org.partner@company.com',
      name: 'Multi Org Partner',
    }, testEnv);

    const org1 = await createOrganization({ name: 'Organization One', owner_id: user.id }, testEnv);
    const org2 = await createOrganization({ name: 'Organization Two', owner_id: user.id }, testEnv);

    // Activate as sales partner
    await createSalesPartnerApplication(user.id, 'App', testEnv);
    await updateSalesPartnerStatus(user.id, 'active', 'Activated', testEnv);

    // Token for org1
    const token1 = await signAppToken(user.id, org1.id, 'owner', testEnv.JWT_SECRET, testEnv);
    const meReq1 = new Request('https://api.eventgamestudio.local/api/auth/me', {
      headers: { Authorization: `Bearer ${token1}` },
    });
    const meRes1 = await worker.fetch(meReq1, testEnv);
    const meBody1: any = await meRes1.json();
    expect(meBody1.activeOrganization.id).toBe(org1.id);
    expect(meBody1.salesPartner?.status).toBe('active');

    // Switch to org2
    const switchReq = new Request('https://api.eventgamestudio.local/api/auth/switch-org', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token1}`,
      },
      body: JSON.stringify({ organizationId: org2.id }),
    });
    const switchRes = await worker.fetch(switchReq, testEnv);
    expect(switchRes.status).toBe(200);
    const switchBody: any = await switchRes.json();

    // Verify token for org2 maintains sales partner status on /me
    const meReq2 = new Request('https://api.eventgamestudio.local/api/auth/me', {
      headers: { Authorization: `Bearer ${switchBody.token}` },
    });
    const meRes2 = await worker.fetch(meReq2, testEnv);
    const meBody2: any = await meRes2.json();
    expect(meBody2.activeOrganization.id).toBe(org2.id);
    expect(meBody2.salesPartner?.status).toBe('active');
  });

  // 14. Missing or invalid authorization data fails closed
  test('14. Missing or invalid authorization data fails closed', async () => {
    // Empty user ID
    expect(await isUserActiveSalesPartner('', testEnv)).toBe(false);
    expect(await isUserActiveSalesPartner(null as any, testEnv)).toBe(false);

    // Non-existent user
    expect(await isUserActiveSalesPartner('00000000-0000-0000-0000-000000000000', testEnv)).toBe(false);

    // Unauthenticated request to /api/sales/me
    const unauthReq = new Request('https://api.eventgamestudio.local/api/sales/me', {
      method: 'GET',
    });
    const unauthRes = await worker.fetch(unauthReq, testEnv);
    expect(unauthRes.status).toBe(401);

    // Bogus token
    const bogusReq = new Request('https://api.eventgamestudio.local/api/sales/me', {
      method: 'GET',
      headers: { Authorization: 'Bearer bogus-malformed-token' },
    });
    const bogusRes = await worker.fetch(bogusReq, testEnv);
    expect(bogusRes.status).toBe(401);
  });
});
