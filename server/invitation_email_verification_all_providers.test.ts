import assert from 'node:assert';
import crypto from 'node:crypto';
import {
  createInvitation,
  getInvitationByTokenHash,
  sendInvitationVerificationCode,
  acceptInvitationWithEmailVerification,
  localInvitationsCache,
} from './db/invitations.js';
import { hashToken, verifyAppToken } from './auth.js';
import { generateInvitationVerificationEmailTemplate } from './email/invitationVerificationTemplate.js';
import { localUsersCache, getUserByEmail } from './db/users.js';
import { localMembersCache, getMember } from './db/members.js';
import { localOrgsCache } from './db/organizations.js';

async function runInvitationEmailVerificationSuite() {
  console.log('========================================================================');
  console.log('TEST SUITE: INVITATION SUPPORT FOR ALL EMAIL PROVIDERS (RESEND OTP)');
  console.log('========================================================================\n');

  // Intercept Resend API calls
  let capturedEmails: Array<{ to: string; subject: string; html: string; text: string }> = [];
  const originalFetch = globalThis.fetch;
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

  process.env.JWT_SECRET = 'test_jwt_secret_super_secure_key_1234567890';
  const testEnv = {
    RESEND_API_KEY: 're_test_mock_invitations',
    RESEND_INVITATION_FROM: 'EventGameStudio <invitations@eventgamestudio.com>',
    JWT_SECRET: 'test_jwt_secret_super_secure_key_1234567890',
  };

  // Seed test organization
  const testOrgId = 'org-test-multi-tenant-123';
  localOrgsCache.set(testOrgId, {
    id: testOrgId,
    name: 'Apex Global Activations',
    slug: 'apex-global',
    owner_id: 'user-owner-999',
    logo_url: null,
    country_code: 'MY',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  try {
    // --------------------------------------------------------------------------
    // Test 1: Email Providers Diversity (Gmail, Outlook, Hotmail, Yahoo, Custom Domain)
    // --------------------------------------------------------------------------
    console.log('Test 1: Testing invitations across diverse email providers...');
    const testProviders = [
      { email: 'sarah.connor@outlook.com', role: 'admin' as const, provider: 'Outlook' },
      { email: 'david.brent@hotmail.com', role: 'designer' as const, provider: 'Hotmail' },
      { email: 'lisa.wong@yahoo.com', role: 'viewer' as const, provider: 'Yahoo' },
      { email: 'alex.tan@gmail.com', role: 'admin' as const, provider: 'Gmail' },
      { email: 'marcus@enterprisesolutions.my', role: 'designer' as const, provider: 'Custom Business Domain' },
    ];

    for (const item of testProviders) {
      const rawToken = `invite_token_${item.provider.toLowerCase().replace(/\s+/g, '_')}_${crypto.randomUUID()}`;
      const tokenHash = hashToken(rawToken);

      const invite = await createInvitation(
        {
          organization_id: testOrgId,
          email: item.email,
          role: item.role,
          token_hash: tokenHash,
          invited_by: 'user-owner-999',
        },
        testEnv
      );

      assert.strictEqual(invite.email, item.email.toLowerCase());
      assert.strictEqual(invite.role, item.role);
      assert.strictEqual(invite.accepted_at, null);

      // Verify token lookup
      const retrieved = await getInvitationByTokenHash(tokenHash, testEnv);
      assert.ok(retrieved, `Invitation for ${item.provider} must be found by token hash`);
      assert.strictEqual(retrieved?.email, item.email.toLowerCase());
    }
    console.log('  ✓ PASSED: Successfully created and verified invitations for Outlook, Hotmail, Yahoo, Gmail, and Custom Business Domains.\n');

    // --------------------------------------------------------------------------
    // Test 2: Requesting Single-Use 6-Digit Verification Code via Resend
    // --------------------------------------------------------------------------
    console.log('Test 2: Requesting verification code, Resend dispatch & confidentiality...');
    capturedEmails = [];
    const outlookToken = 'token_for_outlook_test_user_777';
    const outlookHash = hashToken(outlookToken);
    await createInvitation(
      {
        organization_id: testOrgId,
        email: 'event.manager@outlook.com',
        role: 'admin',
        token_hash: outlookHash,
        invited_by: 'user-owner-999',
      },
      testEnv
    );

    const sendResult = await sendInvitationVerificationCode({
      token: outlookToken,
      env: testEnv,
    });

    assert.strictEqual(sendResult.success, true);
    assert.strictEqual(sendResult.email, 'event.manager@outlook.com');
    // Ensure secrets are never exposed in return value
    assert.strictEqual((sendResult as any).code, undefined, 'Verification code must NEVER be returned in API response');
    assert.strictEqual((sendResult as any).codeHash, undefined, 'Code hash must not be exposed');

    // Verify email was sent via Resend with 6-digit code
    assert.strictEqual(capturedEmails.length, 1);
    const sentEmail = capturedEmails[0];
    const recipientEmail = Array.isArray(sentEmail.to) ? sentEmail.to[0] : sentEmail.to;
    assert.strictEqual(recipientEmail, 'event.manager@outlook.com');
    assert.ok(sentEmail.subject.includes('Apex Global Activations'));
    
    // Extract 6-digit code from email text for subsequent test verification
    const codeMatch = sentEmail.text.match(/\b\d{6}\b/);
    assert.ok(codeMatch, 'Sent email must contain a 6-digit verification code');
    const sentCode = codeMatch[0];
    console.log(`  ✓ PASSED: 6-digit code generated and dispatched via Resend. Secrets hidden from client response.\n`);

    // --------------------------------------------------------------------------
    // Test 3: Resend Rate Limiting and 60-Second Cooldown
    // --------------------------------------------------------------------------
    console.log('Test 3: Enforcing 60-second cooldown between resend requests...');
    let cooldownErrorCaught = false;
    try {
      await sendInvitationVerificationCode({
        token: outlookToken,
        env: testEnv,
      });
    } catch (err: any) {
      cooldownErrorCaught = true;
      assert.strictEqual(err.statusCode, 429);
      assert.strictEqual(err.code, 'RESEND_COOLDOWN');
      assert.ok(err.remainingSeconds > 0 && err.remainingSeconds <= 60);
    }
    assert.ok(cooldownErrorCaught, 'Immediate resend must be rejected with HTTP 429 RESEND_COOLDOWN');
    console.log('  ✓ PASSED: 60-second cooldown enforced on repeated verification code requests.\n');

    // --------------------------------------------------------------------------
    // Test 4: Verification Code Validation, Attempt Throttling, and Invalidation
    // --------------------------------------------------------------------------
    console.log('Test 4: Verification attempts throttling and invalidation after 5 failures...');
    // Attempt with incorrect 6-digit code
    let invalidCodeError: any = null;
    try {
      await acceptInvitationWithEmailVerification({
        token: outlookToken,
        code: '999999',
        password: 'ValidPassword123!',
        env: testEnv,
      });
    } catch (err: any) {
      invalidCodeError = err;
    }
    assert.ok(invalidCodeError);
    assert.strictEqual(invalidCodeError.statusCode, 400);
    assert.strictEqual(invalidCodeError.code, 'INVALID_CODE');
    assert.strictEqual(invalidCodeError.remainingAttempts, 4);

    // Fail 4 more times to exceed 5 max attempts
    for (let i = 0; i < 4; i++) {
      try {
        await acceptInvitationWithEmailVerification({
          token: outlookToken,
          code: '000000',
          password: 'ValidPassword123!',
          env: testEnv,
        });
      } catch (err: any) {
        if (i === 3) {
          assert.strictEqual(err.code, 'TOO_MANY_ATTEMPTS');
        }
      }
    }

    // Now even correct code should be rejected because code was invalidated
    let invalidatedError: any = null;
    try {
      await acceptInvitationWithEmailVerification({
        token: outlookToken,
        code: sentCode,
        password: 'ValidPassword123!',
        env: testEnv,
      });
    } catch (err: any) {
      invalidatedError = err;
    }
    assert.ok(invalidatedError);
    assert.strictEqual(invalidatedError.code, 'CODE_NOT_REQUESTED');
    console.log('  ✓ PASSED: Incorrect code attempts decremented; code invalidated after 5 failed attempts.\n');

    // --------------------------------------------------------------------------
    // Test 5: Successful Acceptance without Google Account (Outlook / Yahoo / Custom)
    // --------------------------------------------------------------------------
    console.log('Test 5: Full verification and account activation without Google OAuth...');
    // Reset invitation with a fresh code
    const inviteRecord = await getInvitationByTokenHash(outlookHash, testEnv);
    assert.ok(inviteRecord);
    // Artificially reset last_code_sent_at to allow resend
    inviteRecord.last_code_sent_at = new Date(Date.now() - 120000).toISOString();
    localInvitationsCache.set(inviteRecord.id, inviteRecord);

    capturedEmails = [];
    await sendInvitationVerificationCode({
      token: outlookToken,
      env: testEnv,
    });
    assert.strictEqual(capturedEmails.length, 1);
    const newCodeMatch = capturedEmails[0].text.match(/\b\d{6}\b/);
    assert.ok(newCodeMatch);
    const freshCode = newCodeMatch[0];

    const acceptResult = await acceptInvitationWithEmailVerification({
      token: outlookToken,
      code: freshCode,
      name: 'Sarah Connor',
      password: 'StrongPassword123!',
      env: testEnv,
    });

    // 5a. Result payload verification
    assert.ok(acceptResult.token, 'Must return an application session token');
    assert.strictEqual(acceptResult.user.email, 'event.manager@outlook.com');
    assert.strictEqual(acceptResult.user.name, 'Sarah Connor');
    assert.strictEqual(acceptResult.organization.id, testOrgId);
    assert.strictEqual(acceptResult.organization.role, 'admin');

    // 5b. Authenticated session verification
    const verifiedJwt = await verifyAppToken(acceptResult.token, undefined, testEnv);
    assert.strictEqual(verifiedJwt.sub, acceptResult.user.id);
    assert.strictEqual(verifiedJwt.organizationId, testOrgId);
    assert.strictEqual(verifiedJwt.role, 'admin');

    // 5c. Database user record state
    const createdUser = await getUserByEmail('event.manager@outlook.com', testEnv);
    assert.ok(createdUser);
    assert.strictEqual(createdUser.email_verified, true, 'User must be marked email_verified: true');
    assert.ok(createdUser.password_hash, 'Password hash must be stored');

    // 5d. Organization membership record state
    const member = await getMember(testOrgId, createdUser.id, testEnv);
    assert.ok(member);
    assert.strictEqual(member.role, 'admin', 'Role must strictly match invitation role');

    // 5e. Single-use guarantee: Re-submitting the same code must fail immediately
    let reuseError: any = null;
    try {
      await acceptInvitationWithEmailVerification({
        token: outlookToken,
        code: freshCode,
        password: 'ValidPassword123!',
        env: testEnv,
      });
    } catch (err: any) {
      reuseError = err;
    }
    assert.ok(reuseError);
    assert.strictEqual(reuseError.statusCode, 409, 'Re-accepting an already accepted invitation must return 409');
    console.log('  ✓ PASSED: Outlook user verified email, set password, activated account & joined organization as ADMIN with full session token.\n');

    // --------------------------------------------------------------------------
    // Test 6: Role Tampering & Privilege Escalation Prevention
    // --------------------------------------------------------------------------
    console.log('Test 6: Verifying that invitee cannot alter email or escalate role...');
    const viewerToken = 'token_for_restricted_viewer_999';
    const viewerHash = hashToken(viewerToken);
    await createInvitation(
      {
        organization_id: testOrgId,
        email: 'intern@company.com',
        role: 'viewer', // Restricted role
        token_hash: viewerHash,
        invited_by: 'user-owner-999',
      },
      testEnv
    );

    capturedEmails = [];
    await sendInvitationVerificationCode({
      token: viewerToken,
      env: testEnv,
    });
    const viewerCode = capturedEmails[0].text.match(/\b\d{6}\b/)![0];

    const viewerAcceptResult = await acceptInvitationWithEmailVerification({
      token: viewerToken,
      code: viewerCode,
      name: 'Intern User',
      password: 'ViewerPassword123!',
      env: testEnv,
    });

    // Verify role is strictly 'viewer', ignoring any client wishes
    assert.strictEqual(viewerAcceptResult.organization.role, 'viewer');
    const viewerMember = await getMember(testOrgId, viewerAcceptResult.user.id, testEnv);
    assert.strictEqual(viewerMember?.role, 'viewer');
    console.log('  ✓ PASSED: Restricted role ("viewer") strictly enforced; no privilege escalation allowed.\n');

    // --------------------------------------------------------------------------
    // Test 7: Expired Invitation Handling
    // --------------------------------------------------------------------------
    console.log('Test 7: Rejecting expired invitations (HTTP 410)...');
    const expiredToken = 'token_expired_111';
    const expiredHash = hashToken(expiredToken);
    await createInvitation(
      {
        organization_id: testOrgId,
        email: 'late.joiner@yahoo.com',
        role: 'member' as any,
        token_hash: expiredHash,
        invited_by: 'user-owner-999',
        expires_at: new Date(Date.now() - 3600000).toISOString(), // Expired 1 hour ago
      },
      testEnv
    );

    let expiredError: any = null;
    try {
      await sendInvitationVerificationCode({
        token: expiredToken,
        env: testEnv,
      });
    } catch (err: any) {
      expiredError = err;
    }
    assert.ok(expiredError);
    assert.strictEqual(expiredError.statusCode, 410);
    assert.strictEqual(expiredError.code, 'INVITATION_EXPIRED');
    console.log('  ✓ PASSED: Expired invitation requests rejected with HTTP 410 INVITATION_EXPIRED.\n');

    // --------------------------------------------------------------------------
    // Test 8: Custom Business Email & Yahoo Verification Link Template
    // --------------------------------------------------------------------------
    console.log('Test 8: Direct verification URL link in email template...');
    const customEmailTemplate = generateInvitationVerificationEmailTemplate({
      organizationName: 'Apex Global Activations',
      email: 'partnerships@custombrand.com',
      role: 'designer',
      code: '839201',
      verificationUrl: 'https://eventgamestudio.com/accept-invite?token=xyz123&code=839201',
    });

    assert.ok(customEmailTemplate.html.includes('839201'));
    assert.ok(customEmailTemplate.html.includes('partnerships@custombrand.com'));
    assert.ok(customEmailTemplate.html.includes('https://eventgamestudio.com/accept-invite?token=xyz123&amp;code=839201') || customEmailTemplate.html.includes('https://eventgamestudio.com/accept-invite?token=xyz123&code=839201'));
    console.log('  ✓ PASSED: Email template correctly formats direct verification link and 6-digit code.\n');

    console.log('========================================================================');
    console.log('🎉 ALL INVITATION EMAIL VERIFICATION TESTS PASSED SUCCESSFULLY!');
    console.log('========================================================================\n');
  } finally {
    globalThis.fetch = originalFetch;
  }
}

runInvitationEmailVerificationSuite().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
