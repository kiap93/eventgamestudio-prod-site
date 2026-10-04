import { describe, test, expect, beforeAll, afterAll, beforeEach } from 'bun:test';
import crypto from 'node:crypto';
import {
  createInvitation,
  getInvitationByTokenHash,
  sendInvitationVerificationCode,
  acceptInvitationWithEmailVerification,
  localInvitationsCache,
} from './db/invitations.js';
import { hashToken, verifyAppToken, signAppToken } from './auth.js';
import {
  localUsersCache,
  getUserByEmail,
  setUserPassword,
  updateUserPasswordResetToken,
  getUserByPasswordResetToken,
  upsertGoogleUser,
} from './db/users.js';
import { localMembersCache, getMember } from './db/members.js';
import { localOrgsCache, getUserOrganizations } from './db/organizations.js';
import { verifyPassword, hashPassword } from './password.js';

describe('Invitation Acceptance and Next-Time Login Test Suite', () => {
  let capturedEmails: Array<{ to: string; subject: string; html: string; text: string }> = [];
  const originalFetch = globalThis.fetch;

  const testEnv = {
    RESEND_API_KEY: 're_test_mock_invitations',
    RESEND_INVITATION_FROM: 'EventGameStudio <invitations@eventgamestudio.com>',
    JWT_SECRET: 'test_jwt_secret_super_secure_key_1234567890',
  };

  const testOrg1Id = 'org-tenant-alpha-111';
  const testOrg2Id = 'org-tenant-beta-222';

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

    // Seed test organizations
    localOrgsCache.set(testOrg1Id, {
      id: testOrg1Id,
      name: 'Alpha Interactive Studio',
      slug: 'alpha-interactive',
      owner_id: 'user-alpha-owner',
      logo_url: null,
      country_code: 'MY',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    localOrgsCache.set(testOrg2Id, {
      id: testOrg2Id,
      name: 'Beta Event Dynamics',
      slug: 'beta-events',
      owner_id: 'user-beta-owner',
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
  });

  // Helper to extract 6-digit code from captured email
  function getLatestVerificationCode(): string {
    expect(capturedEmails.length).toBeGreaterThan(0);
    const latest = capturedEmails[capturedEmails.length - 1];
    const match = latest.text.match(/\b\d{6}\b/);
    expect(match).not.toBeNull();
    return match![0];
  }

  // --------------------------------------------------------------------------
  // 1. Accept invitation with a valid code and matching passwords
  // --------------------------------------------------------------------------
  test('1. Accept invitation with a valid code and matching passwords', async () => {
    const rawToken = 'token_test_1_' + crypto.randomUUID();
    const tokenHash = hashToken(rawToken);
    const email = 'alice.designer@outlook.com';

    await createInvitation(
      {
        organization_id: testOrg1Id,
        email,
        role: 'designer',
        token_hash: tokenHash,
        invited_by: 'user-alpha-owner',
      },
      testEnv
    );

    // Request verification code
    const sendRes = await sendInvitationVerificationCode({ token: rawToken, env: testEnv });
    expect(sendRes.success).toBe(true);
    const code = getLatestVerificationCode();

    // Accept with code and matching strong passwords
    const acceptRes = await acceptInvitationWithEmailVerification({
      token: rawToken,
      code,
      password: 'StrongPassword123!',
      confirmPassword: 'StrongPassword123!',
      name: 'Alice Designer',
      env: testEnv,
    });

    expect(acceptRes.token).toBeDefined();
    expect(acceptRes.user.email).toBe(email);
    expect(acceptRes.organization.id).toBe(testOrg1Id);
    expect(acceptRes.organization.role).toBe('designer');

    // Verify user stored in database
    const user = await getUserByEmail(email, testEnv);
    expect(user).not.toBeNull();
    expect(user!.email_verified).toBe(true);
    expect(user!.password_hash).toBeDefined();
    expect(user!.password_hash).not.toBe('StrongPassword123!'); // Not plaintext!
    expect(user!.password_hash?.startsWith('pbkdf2$100000$')).toBe(true);

    // Verify membership stored
    const member = await getMember(testOrg1Id, user!.id, testEnv);
    expect(member).not.toBeNull();
    expect(member!.role).toBe('designer');

    // Verify invitation marked accepted
    const invite = await getInvitationByTokenHash(tokenHash, testEnv);
    expect(invite!.accepted_at).not.toBeNull();
  });

  // --------------------------------------------------------------------------
  // 2. Reject missing or weak passwords
  // --------------------------------------------------------------------------
  test('2. Reject missing or weak passwords', async () => {
    const rawToken = 'token_test_2_' + crypto.randomUUID();
    const tokenHash = hashToken(rawToken);
    const email = 'bob.weak@yahoo.com';

    await createInvitation(
      {
        organization_id: testOrg1Id,
        email,
        role: 'admin',
        token_hash: tokenHash,
        invited_by: 'user-alpha-owner',
      },
      testEnv
    );

    await sendInvitationVerificationCode({ token: rawToken, env: testEnv });
    const code = getLatestVerificationCode();

    // 2a: Missing password
    let missingPassErr: any = null;
    try {
      await acceptInvitationWithEmailVerification({
        token: rawToken,
        code,
        password: '',
        env: testEnv,
      });
    } catch (err: any) {
      missingPassErr = err;
    }
    expect(missingPassErr).not.toBeNull();
    expect(missingPassErr.statusCode).toBe(422);
    expect(missingPassErr.code).toBe('PASSWORD_REQUIRED');

    // 2b: Password too short (< 8 chars)
    let shortPassErr: any = null;
    try {
      await acceptInvitationWithEmailVerification({
        token: rawToken,
        code,
        password: 'Pass1',
        env: testEnv,
      });
    } catch (err: any) {
      shortPassErr = err;
    }
    expect(shortPassErr).not.toBeNull();
    expect(shortPassErr.statusCode).toBe(422);
    expect(shortPassErr.code).toBe('INVALID_PASSWORD');

    // 2c: Password without numbers
    let noNumPassErr: any = null;
    try {
      await acceptInvitationWithEmailVerification({
        token: rawToken,
        code,
        password: 'PasswordOnlyLetters',
        env: testEnv,
      });
    } catch (err: any) {
      noNumPassErr = err;
    }
    expect(noNumPassErr).not.toBeNull();
    expect(noNumPassErr.statusCode).toBe(422);
    expect(noNumPassErr.code).toBe('INVALID_PASSWORD');

    // 2d: Password without letters
    let noLetterPassErr: any = null;
    try {
      await acceptInvitationWithEmailVerification({
        token: rawToken,
        code,
        password: '1234567890123',
        env: testEnv,
      });
    } catch (err: any) {
      noLetterPassErr = err;
    }
    expect(noLetterPassErr).not.toBeNull();
    expect(noLetterPassErr.statusCode).toBe(422);
    expect(noLetterPassErr.code).toBe('INVALID_PASSWORD');

    // Ensure invitation was NOT accepted and remains pending
    const invite = await getInvitationByTokenHash(tokenHash, testEnv);
    expect(invite!.accepted_at).toBeNull();
  });

  // --------------------------------------------------------------------------
  // 3. Reject mismatched passwords
  // --------------------------------------------------------------------------
  test('3. Reject mismatched passwords', async () => {
    const rawToken = 'token_test_3_' + crypto.randomUUID();
    const tokenHash = hashToken(rawToken);
    const email = 'charlie.mismatch@hotmail.com';

    await createInvitation(
      {
        organization_id: testOrg1Id,
        email,
        role: 'viewer',
        token_hash: tokenHash,
        invited_by: 'user-alpha-owner',
      },
      testEnv
    );

    await sendInvitationVerificationCode({ token: rawToken, env: testEnv });
    const code = getLatestVerificationCode();

    let mismatchErr: any = null;
    try {
      await acceptInvitationWithEmailVerification({
        token: rawToken,
        code,
        password: 'CorrectPassword123!',
        confirmPassword: 'DifferentPassword456!',
        env: testEnv,
      });
    } catch (err: any) {
      mismatchErr = err;
    }

    expect(mismatchErr).not.toBeNull();
    expect(mismatchErr.statusCode).toBe(422);
    expect(mismatchErr.code).toBe('PASSWORDS_DO_NOT_MATCH');

    const invite = await getInvitationByTokenHash(tokenHash, testEnv);
    expect(invite!.accepted_at).toBeNull();
  });

  // --------------------------------------------------------------------------
  // 4. Reject invalid, expired, or reused verification codes
  // --------------------------------------------------------------------------
  test('4. Reject invalid, expired, or reused verification codes', async () => {
    const rawToken = 'token_test_4_' + crypto.randomUUID();
    const tokenHash = hashToken(rawToken);
    const email = 'diana.codes@customdomain.com';

    await createInvitation(
      {
        organization_id: testOrg1Id,
        email,
        role: 'designer',
        token_hash: tokenHash,
        invited_by: 'user-alpha-owner',
      },
      testEnv
    );

    await sendInvitationVerificationCode({ token: rawToken, env: testEnv });
    const validCode = getLatestVerificationCode();

    // 4a: Invalid code
    let invalidCodeErr: any = null;
    try {
      await acceptInvitationWithEmailVerification({
        token: rawToken,
        code: '999999',
        password: 'ValidPassword123!',
        confirmPassword: 'ValidPassword123!',
        env: testEnv,
      });
    } catch (err: any) {
      invalidCodeErr = err;
    }
    expect(invalidCodeErr).not.toBeNull();
    expect(invalidCodeErr.statusCode).toBe(400);
    expect(invalidCodeErr.code).toBe('INVALID_CODE');

    // 4b: Expired code
    const invite = await getInvitationByTokenHash(tokenHash, testEnv);
    invite!.verification_code_expires_at = new Date(Date.now() - 60000).toISOString();
    localInvitationsCache.set(invite!.id, invite!);

    let expiredCodeErr: any = null;
    try {
      await acceptInvitationWithEmailVerification({
        token: rawToken,
        code: validCode,
        password: 'ValidPassword123!',
        confirmPassword: 'ValidPassword123!',
        env: testEnv,
      });
    } catch (err: any) {
      expiredCodeErr = err;
    }
    expect(expiredCodeErr).not.toBeNull();
    expect(expiredCodeErr.statusCode).toBe(400);
    expect(expiredCodeErr.code).toBe('CODE_EXPIRED');

    // Request fresh code and accept successfully
    invite!.last_code_sent_at = new Date(Date.now() - 120000).toISOString();
    localInvitationsCache.set(invite!.id, invite!);

    await sendInvitationVerificationCode({ token: rawToken, env: testEnv });
    const freshCode = getLatestVerificationCode();

    const acceptRes = await acceptInvitationWithEmailVerification({
      token: rawToken,
      code: freshCode,
      password: 'ValidPassword123!',
      confirmPassword: 'ValidPassword123!',
      env: testEnv,
    });
    expect(acceptRes.token).toBeDefined();

    // 4c: Reused code on already accepted invitation
    let reuseErr: any = null;
    try {
      await acceptInvitationWithEmailVerification({
        token: rawToken,
        code: freshCode,
        password: 'ValidPassword123!',
        confirmPassword: 'ValidPassword123!',
        env: testEnv,
      });
    } catch (err: any) {
      reuseErr = err;
    }
    expect(reuseErr).not.toBeNull();
    expect(reuseErr.statusCode).toBe(409);
    expect(reuseErr.code).toBe('INVITATION_ALREADY_ACCEPTED');
  });

  // --------------------------------------------------------------------------
  // 5. Log out and successfully log in again using the invited email and new password
  // --------------------------------------------------------------------------
  test('5. Log out and successfully log in again using the invited email and new password', async () => {
    // We use alice.designer@outlook.com from Test 1
    const email = 'alice.designer@outlook.com';
    const password = 'StrongPassword123!';

    const user = await getUserByEmail(email, testEnv);
    expect(user).not.toBeNull();
    expect(user!.password_hash).toBeDefined();

    // Simulate login verification against PBKDF2 hash
    const isPasswordValid = await verifyPassword(password, user!.password_hash);
    expect(isPasswordValid).toBe(true);

    // Verify session token generation and claim contents
    const memberships = await getUserOrganizations(user!.id, testEnv);
    expect(memberships.length).toBeGreaterThan(0);
    const org = memberships[0];

    const sessionToken = await signAppToken(user!.id, org.id, org.role as any, undefined, testEnv);
    expect(sessionToken).toBeDefined();

    const decoded = await verifyAppToken(sessionToken, undefined, testEnv);
    expect(decoded.sub).toBe(user!.id);
    expect(decoded.organizationId).toBe(testOrg1Id);
    expect(decoded.role).toBe('designer');
  });

  // --------------------------------------------------------------------------
  // 6. Reject an incorrect password
  // --------------------------------------------------------------------------
  test('6. Reject an incorrect password', async () => {
    const email = 'alice.designer@outlook.com';
    const user = await getUserByEmail(email, testEnv);
    expect(user).not.toBeNull();

    const isMatch = await verifyPassword('IncorrectPassword999!', user!.password_hash);
    expect(isMatch).toBe(false);
  });

  // --------------------------------------------------------------------------
  // 7. Successfully reset a forgotten password and log in with the new password
  // --------------------------------------------------------------------------
  test('7. Successfully reset a forgotten password and log in with the new password', async () => {
    const email = 'alice.designer@outlook.com';
    const user = await getUserByEmail(email, testEnv);
    expect(user).not.toBeNull();

    // Simulate forgot password token generation
    const rawResetToken = 'reset_token_' + crypto.randomUUID();
    const resetTokenHash = hashToken(rawResetToken);
    const expiresAt = new Date(Date.now() + 3600000).toISOString();

    await updateUserPasswordResetToken(user!.id, resetTokenHash, expiresAt, testEnv);

    // Lookup user by reset token
    const userByReset = await getUserByPasswordResetToken(resetTokenHash, testEnv);
    expect(userByReset).not.toBeNull();
    expect(userByReset!.id).toBe(user!.id);

    // Set new password
    const newPassword = 'NewAlicePassword456!';
    const newHash = await hashPassword(newPassword);
    await setUserPassword(user!.id, newHash, testEnv);

    // Verify old password fails
    const updatedUser = await getUserByEmail(email, testEnv);
    const oldPassMatch = await verifyPassword('StrongPassword123!', updatedUser!.password_hash);
    expect(oldPassMatch).toBe(false);

    // Verify new password succeeds
    const newPassMatch = await verifyPassword(newPassword, updatedUser!.password_hash);
    expect(newPassMatch).toBe(true);
  });

  // --------------------------------------------------------------------------
  // 8. Preserve Google invitation acceptance
  // --------------------------------------------------------------------------
  test('8. Preserve Google invitation acceptance', async () => {
    const rawToken = 'token_google_test_' + crypto.randomUUID();
    const tokenHash = hashToken(rawToken);
    const email = 'google.lead@gmail.com';

    await createInvitation(
      {
        organization_id: testOrg1Id,
        email,
        role: 'admin',
        token_hash: tokenHash,
        invited_by: 'user-alpha-owner',
      },
      testEnv
    );

    // Simulate Google OAuth ID token verification returning verified profile
    const mockGoogleProfile = {
      sub: 'google-sub-id-789012',
      email,
      name: 'Google Lead',
      picture: 'https://lh3.googleusercontent.com/a/mock',
    };

    const user = await upsertGoogleUser(mockGoogleProfile, testEnv);
    expect(user.google_id).toBe('google-sub-id-789012');
    expect(user.email_verified).toBe(true);

    // Add membership and accept invitation
    const invite = await getInvitationByTokenHash(tokenHash, testEnv);
    expect(invite).not.toBeNull();
    expect(invite!.role).toBe('admin');

    const appToken = await signAppToken(user.id, invite!.organization_id, invite!.role, undefined, testEnv);
    expect(appToken).toBeDefined();

    const decoded = await verifyAppToken(appToken, undefined, testEnv);
    expect(decoded.sub).toBe(user.id);
    expect(decoded.role).toBe('admin');
  });

  // --------------------------------------------------------------------------
  // 9. Correctly handle an existing user invited to another organization
  // --------------------------------------------------------------------------
  test('9. Correctly handle an existing user invited to another organization', async () => {
    // Alice (from Test 1) already belongs to testOrg1Id.
    // Now testOrg2Id invites Alice as 'admin'.
    const email = 'alice.designer@outlook.com';
    const existingAlice = await getUserByEmail(email, testEnv);
    expect(existingAlice).not.toBeNull();
    const originalUserId = existingAlice!.id;

    const rawToken = 'token_test_org2_' + crypto.randomUUID();
    const tokenHash = hashToken(rawToken);

    await createInvitation(
      {
        organization_id: testOrg2Id,
        email,
        role: 'admin',
        token_hash: tokenHash,
        invited_by: 'user-beta-owner',
      },
      testEnv
    );

    await sendInvitationVerificationCode({ token: rawToken, env: testEnv });
    const code = getLatestVerificationCode();

    // Existing user accepts invitation: password is NOT required and existing password hash is preserved
    const acceptRes = await acceptInvitationWithEmailVerification({
      token: rawToken,
      code,
      env: testEnv,
    });

    // 9a. Verify user ID remains exactly the same (NO duplicate user created!)
    expect(acceptRes.user.id).toBe(originalUserId);
    const userAfter = await getUserByEmail(email, testEnv);
    expect(userAfter!.id).toBe(originalUserId);

    // 9b. Verify Alice now has memberships in BOTH organizations
    const memberships = await getUserOrganizations(originalUserId, testEnv);
    expect(memberships.length).toBe(2);
    const org1Member = memberships.find((m) => m.id === testOrg1Id);
    const org2Member = memberships.find((m) => m.id === testOrg2Id);

    expect(org1Member).toBeDefined();
    expect(org1Member!.role).toBe('designer'); // Preserves Org 1 role

    expect(org2Member).toBeDefined();
    expect(org2Member!.role).toBe('admin'); // Has Org 2 role

    // 9c. Verify Alice's original password remains preserved and unchanged!
    const isOriginalPassValid = await verifyPassword('NewAlicePassword456!', userAfter!.password_hash);
    expect(isOriginalPassValid).toBe(true);
  });

  // --------------------------------------------------------------------------
  // 10. Verify that unauthorized roles and organization memberships cannot be assigned by manipulating requests
  // --------------------------------------------------------------------------
  test('10. Verify that unauthorized roles and organization memberships cannot be assigned by manipulating requests', async () => {
    const rawToken = 'token_test_10_' + crypto.randomUUID();
    const tokenHash = hashToken(rawToken);
    const email = 'mallory.viewer@company.com';

    // Mallory is invited ONLY as 'viewer' to testOrg1Id
    await createInvitation(
      {
        organization_id: testOrg1Id,
        email,
        role: 'viewer',
        token_hash: tokenHash,
        invited_by: 'user-alpha-owner',
      },
      testEnv
    );

    await sendInvitationVerificationCode({ token: rawToken, env: testEnv });
    const code = getLatestVerificationCode();

    // Attacker passes malicious parameters in request payload:
    // Attempts to claim role 'owner', a different organization 'org-hacked-666', and different email
    const maliciousPayload: any = {
      token: rawToken,
      code,
      password: 'MalloryPassword123!',
      confirmPassword: 'MalloryPassword123!',
      role: 'owner',
      organization_id: testOrg2Id,
      email: 'victim@company.com',
      is_developer: true,
      env: testEnv,
    };

    const acceptRes = await acceptInvitationWithEmailVerification(maliciousPayload);

    // Verify assigned organization is strictly the invited org (testOrg1Id), not testOrg2Id
    expect(acceptRes.organization.id).toBe(testOrg1Id);

    // Verify assigned role is strictly 'viewer', not 'owner'
    expect(acceptRes.organization.role).toBe('viewer');

    // Verify user created is mallory.viewer@company.com, not victim@company.com
    expect(acceptRes.user.email).toBe(email);
    expect(acceptRes.user.is_developer).toBe(false);

    // Verify database record
    const member = await getMember(testOrg1Id, acceptRes.user.id, testEnv);
    expect(member).not.toBeNull();
    expect(member!.role).toBe('viewer');

    // Verify attacker is NOT a member of testOrg2Id
    const illegalMember = await getMember(testOrg2Id, acceptRes.user.id, testEnv);
    expect(illegalMember).toBeNull();
  });
});
