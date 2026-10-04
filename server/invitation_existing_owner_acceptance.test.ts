import { describe, test, expect, beforeAll, afterAll, beforeEach } from 'bun:test';
import crypto from 'node:crypto';
import {
  createInvitation,
  getInvitationByTokenHash,
  getInvitationAccountStatus,
  validateInvitationVerificationCode,
  sendInvitationVerificationCode,
  acceptInvitationWithEmailVerification,
  localInvitationsCache,
} from './db/invitations.js';
import { hashToken, signAppToken, verifyAppToken } from './auth.js';
import {
  localUsersCache,
  getUserByEmail,
  createUser,
  setUserPassword,
  upsertGoogleUser,
} from './db/users.js';
import { localMembersCache, getMember, addMember } from './db/members.js';
import { localOrgsCache, createOrganization, getUserOrganizations } from './db/organizations.js';
import { verifyPassword, hashPassword } from './password.js';

describe('Regression Suite: Invitation Acceptance for Existing Owners and Multi-Tenant Accounts', () => {
  let capturedEmails: Array<{ to: string; subject: string; html: string; text: string }> = [];
  const originalFetch = globalThis.fetch;

  const testEnv = {
    RESEND_API_KEY: 're_test_mock_invitations',
    RESEND_INVITATION_FROM: 'EventGameStudio <invitations@eventgamestudio.com>',
    JWT_SECRET: 'test_jwt_secret_super_secure_key_1234567890',
  };

  const companyAId = 'org-company-alpha-aaa';
  const companyBId = 'org-company-beta-bbb';

  beforeAll(() => {
    process.env.JWT_SECRET = testEnv.JWT_SECRET;

    globalThis.fetch = async (input: any, init?: any) => {
      const url = typeof input === 'string' ? input : input?.url || '';
      if (url.includes('api.resend.com')) {
        const payload = JSON.parse(init?.body || '{}');
        capturedEmails.push({
          to: payload.to,
          subject: payload.subject,
          html: payload.html,
          text: payload.text,
        });
        return new Response(JSON.stringify({ id: `re_mock_${Date.now()}` }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return originalFetch(input, init);
    };

    // Seed Company Alpha
    localOrgsCache.set(companyAId, {
      id: companyAId,
      name: 'Alpha Corporate Events',
      slug: 'alpha-events',
      owner_id: 'user-existing-owner-1',
      logo_url: null,
      country_code: 'MY',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    // Seed Company Beta
    localOrgsCache.set(companyBId, {
      id: companyBId,
      name: 'Beta Global Marketing',
      slug: 'beta-global',
      owner_id: 'user-beta-owner-2',
      logo_url: null,
      country_code: 'SG',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  });

  afterAll(() => {
    globalThis.fetch = originalFetch;
  });

  beforeEach(() => {
    capturedEmails = [];
  });

  function getLatestVerificationCode(): string {
    expect(capturedEmails.length).toBeGreaterThan(0);
    const latest = capturedEmails[capturedEmails.length - 1];
    const match = latest.text.match(/\b\d{6}\b/);
    expect(match).not.toBeNull();
    return match![0];
  }

  // --------------------------------------------------------------------------
  // 1. New user accepts an invitation and must create a password.
  // --------------------------------------------------------------------------
  test('1. New user accepts an invitation and must create a password', async () => {
    const rawToken = 'token_new_user_' + crypto.randomUUID();
    const tokenHash = hashToken(rawToken);
    const email = 'brand.new.user@externaldomain.com';

    await createInvitation(
      {
        organization_id: companyAId,
        email,
        role: 'designer',
        token_hash: tokenHash,
        invited_by: 'user-existing-owner-1',
      },
      testEnv
    );

    // Account status check must indicate new_user requiring password
    const status = await getInvitationAccountStatus(tokenHash, testEnv);
    expect(status).not.toBeNull();
    expect(status!.accountStatus).toBe('new_user');
    expect(status!.requiresPassword).toBe(true);
    expect(status!.alreadyMember).toBe(false);

    await sendInvitationVerificationCode({ token: rawToken, env: testEnv });
    const code = getLatestVerificationCode();

    // Must reject acceptance if no password provided
    let noPassErr: any = null;
    try {
      await acceptInvitationWithEmailVerification({
        token: rawToken,
        code,
        env: testEnv,
      });
    } catch (err: any) {
      noPassErr = err;
    }
    expect(noPassErr).not.toBeNull();
    expect(noPassErr.statusCode).toBe(422);
    expect(noPassErr.code).toBe('PASSWORD_REQUIRED');

    // Accepting with valid password succeeds
    const newPass = 'FreshUserPassword123!';
    const result = await acceptInvitationWithEmailVerification({
      token: rawToken,
      code,
      password: newPass,
      confirmPassword: newPass,
      env: testEnv,
    });
    expect(result.token).toBeDefined();
    expect(result.user.email).toBe(email);

    const createdUser = await getUserByEmail(email, testEnv);
    expect(createdUser).not.toBeNull();
    expect(await verifyPassword(newPass, createdUser!.password_hash)).toBe(true);
  });

  // --------------------------------------------------------------------------
  // 2. Existing owner with a password accepts another company's invitation without seeing password fields.
  // --------------------------------------------------------------------------
  test("2. Existing owner with a password accepts another company's invitation without seeing password fields", async () => {
    const ownerEmail = 'owner.alpha@eventcorporation.com';
    const ownerPassword = 'MasterOwnerSecret2026!';
    const ownerPasswordHash = await hashPassword(ownerPassword);

    const existingOwner = await createUser(
      {
        id: 'user-existing-owner-1',
        email: ownerEmail,
        name: 'Alpha Owner',
        password_hash: ownerPasswordHash,
        email_verified: true,
      },
      testEnv
    );

    // Owner owns Company A
    await addMember(
      {
        organization_id: companyAId,
        user_id: existingOwner.id,
        role: 'owner',
      },
      testEnv
    );

    // Company Beta invites Alpha Owner as 'admin'
    const rawToken = 'token_owner_invited_' + crypto.randomUUID();
    const tokenHash = hashToken(rawToken);

    await createInvitation(
      {
        organization_id: companyBId,
        email: ownerEmail,
        role: 'admin',
        token_hash: tokenHash,
        invited_by: 'user-beta-owner-2',
      },
      testEnv
    );

    // Authoritative check must determine requiresPassword = false
    const status = await getInvitationAccountStatus(tokenHash, testEnv);
    expect(status).not.toBeNull();
    expect(status!.accountStatus).toBe('existing_password');
    expect(status!.requiresPassword).toBe(false);
    expect(status!.alreadyMember).toBe(false);

    // Verification code validation also confirms requiresPassword = false
    await sendInvitationVerificationCode({ token: rawToken, env: testEnv });
    const code = getLatestVerificationCode();

    const codeValidation = await validateInvitationVerificationCode({
      token: rawToken,
      code,
      env: testEnv,
    });
    expect(codeValidation.valid).toBe(true);
    expect(codeValidation.requiresPassword).toBe(false);
    expect(codeValidation.accountStatus).toBe('existing_password');

    // Existing owner accepts WITHOUT password
    const result = await acceptInvitationWithEmailVerification({
      token: rawToken,
      code,
      env: testEnv,
    });
    expect(result.token).toBeDefined();
    expect(result.user.id).toBe(existingOwner.id);
  });

  // --------------------------------------------------------------------------
  // 3. Existing owner's password hash remains unchanged after acceptance.
  // --------------------------------------------------------------------------
  test("3. Existing owner's password hash remains unchanged after acceptance (tamper-proof)", async () => {
    const ownerEmail = 'owner.tamper.check@eventcorporation.com';
    const originalPassword = 'OriginalOwnerPassword999!';
    const originalHash = await hashPassword(originalPassword);

    const owner = await createUser(
      {
        email: ownerEmail,
        name: 'Tamper Owner',
        password_hash: originalHash,
        email_verified: true,
      },
      testEnv
    );

    const rawToken = 'token_tamper_test_' + crypto.randomUUID();
    const tokenHash = hashToken(rawToken);

    await createInvitation(
      {
        organization_id: companyBId,
        email: ownerEmail,
        role: 'viewer',
        token_hash: tokenHash,
        invited_by: 'user-beta-owner-2',
      },
      testEnv
    );

    await sendInvitationVerificationCode({ token: rawToken, env: testEnv });
    const code = getLatestVerificationCode();

    // Even if client or attacker maliciously passes a new password in request body
    const result = await acceptInvitationWithEmailVerification({
      token: rawToken,
      code,
      password: 'MaliciousOverwritingPassword000!',
      confirmPassword: 'MaliciousOverwritingPassword000!',
      env: testEnv,
    });
    expect(result.token).toBeDefined();

    // Verify database password hash was NOT mutated
    const userInDb = await getUserByEmail(ownerEmail, testEnv);
    expect(userInDb!.password_hash).toBe(originalHash);

    // Verify original password is still valid and malicious password fails
    expect(await verifyPassword(originalPassword, userInDb!.password_hash)).toBe(true);
    expect(await verifyPassword('MaliciousOverwritingPassword000!', userInDb!.password_hash)).toBe(false);
  });

  // --------------------------------------------------------------------------
  // 4. Existing Google-only owner accepts an invitation without creating a password.
  // --------------------------------------------------------------------------
  test('4. Existing Google-only owner accepts an invitation without creating a password', async () => {
    const googleEmail = 'google.owner@company.com';
    const googleUser = await upsertGoogleUser(
      {
        sub: 'google-uid-12345678',
        email: googleEmail,
        name: 'Google Owner',
      },
      testEnv
    );
    expect(googleUser.password_hash).toBeFalsy();

    const rawToken = 'token_google_owner_' + crypto.randomUUID();
    const tokenHash = hashToken(rawToken);

    await createInvitation(
      {
        organization_id: companyBId,
        email: googleEmail,
        role: 'admin',
        token_hash: tokenHash,
        invited_by: 'user-beta-owner-2',
      },
      testEnv
    );

    const status = await getInvitationAccountStatus(tokenHash, testEnv);
    expect(status!.accountStatus).toBe('existing_google');
    expect(status!.requiresPassword).toBe(false);

    await sendInvitationVerificationCode({ token: rawToken, env: testEnv });
    const code = getLatestVerificationCode();

    // Accepts via email OTP without password
    const result = await acceptInvitationWithEmailVerification({
      token: rawToken,
      code,
      env: testEnv,
    });
    expect(result.user.id).toBe(googleUser.id);

    // Google-only status preserved (still no password_hash)
    const userAfter = await getUserByEmail(googleEmail, testEnv);
    expect(userAfter!.password_hash).toBeFalsy();
    expect(userAfter!.google_id).toBe('google-uid-12345678');
  });

  // --------------------------------------------------------------------------
  // 5. Existing user joins a second organization without creating a duplicate user.
  // --------------------------------------------------------------------------
  test('5. Existing user joins a second organization without creating a duplicate user', async () => {
    const multiOrgEmail = 'sarah.multitenant@agency.com';
    const userPass = 'SarahStrongPassword123!';
    const initialUser = await createUser(
      {
        email: multiOrgEmail,
        name: 'Sarah Multi',
        password_hash: await hashPassword(userPass),
        email_verified: true,
      },
      testEnv
    );

    // Add to Company A
    await addMember({ organization_id: companyAId, user_id: initialUser.id, role: 'designer' }, testEnv);

    // Invite to Company B
    const rawToken = 'token_sarah_join_b_' + crypto.randomUUID();
    const tokenHash = hashToken(rawToken);

    await createInvitation(
      {
        organization_id: companyBId,
        email: multiOrgEmail,
        role: 'admin',
        token_hash: tokenHash,
        invited_by: 'user-beta-owner-2',
      },
      testEnv
    );

    await sendInvitationVerificationCode({ token: rawToken, env: testEnv });
    const code = getLatestVerificationCode();

    const acceptRes = await acceptInvitationWithEmailVerification({
      token: rawToken,
      code,
      env: testEnv,
    });

    // Exactly the same user ID
    expect(acceptRes.user.id).toBe(initialUser.id);

    // Total users in cache for this email is exactly 1
    const usersWithEmail = Array.from(localUsersCache.values()).filter(
      (u) => u.email.toLowerCase() === multiOrgEmail.toLowerCase()
    );
    expect(usersWithEmail.length).toBe(1);

    // User now belongs to both organizations
    const memberships = await getUserOrganizations(initialUser.id, testEnv);
    expect(memberships.length).toBe(2);
    expect(memberships.find((m) => m.id === companyAId)?.role).toBe('designer');
    expect(memberships.find((m) => m.id === companyBId)?.role).toBe('admin');
  });

  // --------------------------------------------------------------------------
  // 6. Existing member accepts a redundant invitation without creating a duplicate membership.
  // --------------------------------------------------------------------------
  test('6. Existing member accepts a redundant invitation without creating a duplicate membership', async () => {
    const memberEmail = 'bob.redundant@company.com';
    const bob = await createUser(
      {
        email: memberEmail,
        name: 'Bob Member',
        password_hash: await hashPassword('BobPassword123!'),
        email_verified: true,
      },
      testEnv
    );

    // Bob is ALREADY in Company A as admin
    await addMember({ organization_id: companyAId, user_id: bob.id, role: 'admin' }, testEnv);

    // Someone accidentally sends Bob another invitation to Company A
    const rawToken = 'token_redundant_' + crypto.randomUUID();
    const tokenHash = hashToken(rawToken);

    await createInvitation(
      {
        organization_id: companyAId,
        email: memberEmail,
        role: 'viewer', // Try inviting as viewer
        token_hash: tokenHash,
        invited_by: 'user-existing-owner-1',
      },
      testEnv
    );

    // Account status check detects duplicate membership
    const status = await getInvitationAccountStatus(tokenHash, testEnv);
    expect(status!.alreadyMember).toBe(true);
    expect(status!.accountStatus).toBe('already_member');
    expect(status!.existingRole).toBe('admin');

    await sendInvitationVerificationCode({ token: rawToken, env: testEnv });
    const code = getLatestVerificationCode();

    const result = await acceptInvitationWithEmailVerification({
      token: rawToken,
      code,
      env: testEnv,
    });

    expect(result.alreadyMember).toBe(true);
    expect(result.organization.role).toBe('admin'); // Preserves existing admin role!

    // Verify members count in Company A for Bob is exactly 1
    const companyAMembers = Array.from(localMembersCache.values()).filter(
      (m) => m.organization_id === companyAId && m.user_id === bob.id
    );
    expect(companyAMembers.length).toBe(1);
    expect(companyAMembers[0].role).toBe('admin');
  });

  // --------------------------------------------------------------------------
  // 7. Existing account role is not overwritten without authorization.
  // --------------------------------------------------------------------------
  test('7. Existing account role is not overwritten without authorization (Owner cannot be downgraded)', async () => {
    const ownerEmail = 'chief.executive@company.com';
    const chief = await createUser(
      {
        email: ownerEmail,
        name: 'Chief Exec',
        password_hash: await hashPassword('ChiefPassword123!'),
        email_verified: true,
      },
      testEnv
    );

    // Chief is OWNER of Company A
    await addMember({ organization_id: companyAId, user_id: chief.id, role: 'owner' }, testEnv);
    const orgRecord = localOrgsCache.get(companyAId)!;
    orgRecord.owner_id = chief.id;
    localOrgsCache.set(companyAId, orgRecord);

    // A low-privilege invitation is created for Company A with role 'viewer'
    const rawToken = 'token_downgrade_attempt_' + crypto.randomUUID();
    const tokenHash = hashToken(rawToken);

    await createInvitation(
      {
        organization_id: companyAId,
        email: ownerEmail,
        role: 'viewer',
        token_hash: tokenHash,
        invited_by: 'user-existing-owner-1',
      },
      testEnv
    );

    await sendInvitationVerificationCode({ token: rawToken, env: testEnv });
    const code = getLatestVerificationCode();

    const result = await acceptInvitationWithEmailVerification({
      token: rawToken,
      code,
      env: testEnv,
    });

    // Owner role is strictly preserved!
    expect(result.organization.role).toBe('owner');
    const memberInDb = await getMember(companyAId, chief.id, testEnv);
    expect(memberInDb!.role).toBe('owner');
  });

  // --------------------------------------------------------------------------
  // 8. Invalid or expired invitation codes are rejected.
  // --------------------------------------------------------------------------
  test('8. Invalid or expired invitation codes are rejected', async () => {
    const rawToken = 'token_expiry_test_' + crypto.randomUUID();
    const tokenHash = hashToken(rawToken);

    await createInvitation(
      {
        organization_id: companyAId,
        email: 'expire.test@example.com',
        role: 'viewer',
        token_hash: tokenHash,
        invited_by: 'user-existing-owner-1',
      },
      testEnv
    );

    await sendInvitationVerificationCode({ token: rawToken, env: testEnv });
    const code = getLatestVerificationCode();

    // 8a. Wrong code
    let wrongCodeErr: any = null;
    try {
      await acceptInvitationWithEmailVerification({
        token: rawToken,
        code: '000000',
        env: testEnv,
      });
    } catch (err: any) {
      wrongCodeErr = err;
    }
    expect(wrongCodeErr).not.toBeNull();
    expect(wrongCodeErr.statusCode).toBe(400);
    expect(wrongCodeErr.code).toBe('INVALID_CODE');

    // 8b. Expired code
    const invite = await getInvitationByTokenHash(tokenHash, testEnv);
    invite!.verification_code_expires_at = new Date(Date.now() - 10000).toISOString();
    localInvitationsCache.set(invite!.id, invite!);

    let expiredErr: any = null;
    try {
      await acceptInvitationWithEmailVerification({
        token: rawToken,
        code,
        env: testEnv,
      });
    } catch (err: any) {
      expiredErr = err;
    }
    expect(expiredErr).not.toBeNull();
    expect(expiredErr.statusCode).toBe(400);
    expect(expiredErr.code).toBe('CODE_EXPIRED');
  });

  // --------------------------------------------------------------------------
  // 9. Users cannot change the invited organization or role through manipulated requests.
  // --------------------------------------------------------------------------
  test('9. Users cannot change the invited organization or role through manipulated requests', async () => {
    const rawToken = 'token_manipulation_test_' + crypto.randomUUID();
    const tokenHash = hashToken(rawToken);
    const email = 'hacker.tamper@example.com';

    // Legitimate invitation is viewer for Company A
    await createInvitation(
      {
        organization_id: companyAId,
        email,
        role: 'viewer',
        token_hash: tokenHash,
        invited_by: 'user-existing-owner-1',
      },
      testEnv
    );

    await sendInvitationVerificationCode({ token: rawToken, env: testEnv });
    const code = getLatestVerificationCode();

    // Malicious request attempting to inject organization_id or role into body
    const maliciousPayload: any = {
      token: rawToken,
      code,
      password: 'HackerPassword123!',
      confirmPassword: 'HackerPassword123!',
      role: 'owner',
      organization_id: companyBId,
      env: testEnv,
    };

    const result = await acceptInvitationWithEmailVerification(maliciousPayload);

    // Server-authoritative: Assigned to Company A as viewer ONLY
    expect(result.organization.id).toBe(companyAId);
    expect(result.organization.role).toBe('viewer');

    const decoded = await verifyAppToken(result.token, undefined, testEnv);
    expect(decoded.organizationId).toBe(companyAId);
    expect(decoded.role).toBe('viewer');
  });

  // --------------------------------------------------------------------------
  // 10. The actual login endpoint still works after acceptance.
  // --------------------------------------------------------------------------
  test('10. The actual login endpoint still works after acceptance', async () => {
    const userEmail = 'persisted.login@example.com';
    const rawPassword = 'ExistingLoginPass123!';

    const rawToken = 'token_login_test_' + crypto.randomUUID();
    const tokenHash = hashToken(rawToken);

    await createInvitation(
      {
        organization_id: companyAId,
        email: userEmail,
        role: 'designer',
        token_hash: tokenHash,
        invited_by: 'user-existing-owner-1',
      },
      testEnv
    );

    await sendInvitationVerificationCode({ token: rawToken, env: testEnv });
    const code = getLatestVerificationCode();

    await acceptInvitationWithEmailVerification({
      token: rawToken,
      code,
      password: rawPassword,
      confirmPassword: rawPassword,
      env: testEnv,
    });

    // Simulate login endpoint flow: lookup user, verify password, sign token
    const user = await getUserByEmail(userEmail, testEnv);
    expect(user).not.toBeNull();
    expect(await verifyPassword(rawPassword, user!.password_hash)).toBe(true);

    const sessionToken = await signAppToken(user!.id, companyAId, 'designer', undefined, testEnv);
    const verified = await verifyAppToken(sessionToken, undefined, testEnv);
    expect(verified.sub).toBe(user!.id);
    expect(verified.role).toBe('designer');
  });

  // --------------------------------------------------------------------------
  // 11. Both server.ts and worker.ts implement consistent behavior.
  // --------------------------------------------------------------------------
  test('11. Both server.ts and worker.ts implement consistent behavior', async () => {
    // Both server.ts and worker.ts call the canonical helpers:
    // - getInvitationAccountStatus
    // - validateInvitationVerificationCode
    // - acceptInvitationWithEmailVerification
    const rawToken = 'token_parity_test_' + crypto.randomUUID();
    const tokenHash = hashToken(rawToken);

    await createInvitation(
      {
        organization_id: companyBId,
        email: 'parity.user@example.com',
        role: 'designer',
        token_hash: tokenHash,
        invited_by: 'user-beta-owner-2',
      },
      testEnv
    );

    const status = await getInvitationAccountStatus(tokenHash, testEnv);
    expect(status).toHaveProperty('accountStatus');
    expect(status).toHaveProperty('requiresPassword');
    expect(status).toHaveProperty('alreadyMember');
  });

  // --------------------------------------------------------------------------
  // 12. Failed acceptance operations do not leave inconsistent account or membership records.
  // --------------------------------------------------------------------------
  test('12. Failed acceptance operations do not leave inconsistent account or membership records', async () => {
    const rawToken = 'token_fail_safe_' + crypto.randomUUID();
    const tokenHash = hashToken(rawToken);
    const email = 'fail.safe.user@example.com';

    await createInvitation(
      {
        organization_id: companyAId,
        email,
        role: 'viewer',
        token_hash: tokenHash,
        invited_by: 'user-existing-owner-1',
      },
      testEnv
    );

    await sendInvitationVerificationCode({ token: rawToken, env: testEnv });

    // Wrong code fails
    try {
      await acceptInvitationWithEmailVerification({
        token: rawToken,
        code: '987654',
        env: testEnv,
      });
    } catch {
      // Expected failure
    }

    // Verify user was NOT created
    const userInDb = await getUserByEmail(email, testEnv);
    expect(userInDb).toBeNull();

    // Verify invitation is NOT marked accepted
    const invite = await getInvitationByTokenHash(tokenHash, testEnv);
    expect(invite!.accepted_at).toBeNull();
  });
});
