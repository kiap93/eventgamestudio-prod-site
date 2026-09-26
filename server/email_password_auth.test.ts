/**
 * Comprehensive Email/Password Registration, Email Verification & Password Reset Test Suite
 *
 * Covers:
 * - Scenario A: Admin email NOT configured -> 503 Service Unavailable, no user created, safe error.
 * - Scenario B: Admin email configured -> 201 Created, verification email awaited, normal flow.
 * - Scenario C: Provider configured but Gmail send fails -> 503 safe error, automatic user rollback.
 * - Anti-enumeration safety on resend and forgot-password.
 * - Mandatory login block for unverified accounts.
 * - Single-use token and expiration enforcement.
 * - Production vs dev fallback environment gating.
 */

import assert from 'node:assert';
import worker from '../worker.js';
import {
  createUser,
  getUserById,
  getUserByEmail,
  getUserByVerificationToken,
  getUserByPasswordResetToken,
  verifyUserEmail,
  setUserPassword,
  updateUserVerificationToken,
  updateUserPasswordResetToken,
  deleteUser,
  localUsersCache,
} from './db/users.js';
import {
  hashPassword,
  verifyPassword,
  validatePassword,
  validateEmail,
} from './password.js';
import {
  generateVerificationToken,
  generatePasswordResetToken,
  sendVerificationEmail,
  sendPasswordResetEmail,
  isEmailServiceConfigured,
} from './emailVerification.js';
import {
  saveGoogleMailSettings,
  disconnectGoogleMail,
  getGoogleMailSettings,
} from './db/googleMailSettings.js';
import {
  verifyAppToken,
  hashToken,
} from './auth.js';
import { resetRateLimitStores } from './rateLimiter.js';
import { evaluatePromotionEligibility } from './db/rewards.js';
import { createOrganization } from './db/organizations.js';

console.log('======================================================');
console.log('Running Email/Password Auth & Verification Test Suite');
console.log('======================================================\n');

const JWT_SECRET = 'test-jwt-secret-at-least-32-chars-long-9876543210';
const TEST_ENV: Record<string, any> = {
  JWT_SECRET,
  NODE_ENV: 'test',
  ALLOW_LOCAL_FALLBACK: 'true',
};

let passed = 0;
let failed = 0;

function report(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`  ✓ ${testName}`);
    passed++;
  } else {
    console.error(`  ✗ ${testName}${detail ? ` -> ${detail}` : ''}`);
    failed++;
  }
}

async function runTests() {
  resetRateLimitStores();
  localUsersCache.clear();

  // -------------------------------------------------------------
  // Section 1: Password & Email Validation & Hashing
  // -------------------------------------------------------------
  console.log('\n--- Section 1: Password & Email Validation & Hashing ---');

  const validEmailResult = validateEmail('  Alice@Example.COM  ');
  report(
    validEmailResult.valid && validEmailResult.normalized === 'alice@example.com',
    'Email validation trims and normalizes to lowercase'
  );

  const invalidEmailResult = validateEmail('not-an-email');
  report(!invalidEmailResult.valid, 'Invalid email format is rejected');

  report(!validatePassword('short').valid, 'Password shorter than 8 characters is rejected');
  report(!validatePassword('allcharactersnonumbers').valid, 'Password without numbers is rejected');
  report(!validatePassword('1234567890').valid, 'Password without letters is rejected');
  report(validatePassword('StrongPass123').valid, 'Password meeting complexity rules is accepted');

  const hashed = await hashPassword('SecretPass123');
  report(
    hashed.startsWith('pbkdf2$100000$'),
    'Password is cryptographically hashed with PBKDF2-SHA256'
  );

  const match = await verifyPassword('SecretPass123', hashed);
  report(match === true, 'Correct password verifies successfully against PBKDF2 hash');

  const mismatch = await verifyPassword('WrongPassword123', hashed);
  report(mismatch === false, 'Incorrect password fails verification against PBKDF2 hash');

  // -------------------------------------------------------------
  // Section 2: Scenario A — Admin Email NOT Configured (Fail-Closed)
  // -------------------------------------------------------------
  console.log('\n--- Section 2: Missing Email Configuration (Scenario A) ---');

  // Ensure Gmail configuration is completely disconnected
  await disconnectGoogleMail(TEST_ENV);
  const isConfiguredBefore = await isEmailServiceConfigured(TEST_ENV);
  report(isConfiguredBefore === false, 'isEmailServiceConfigured returns false when Gmail settings are missing');

  // 2.1 Registration with missing email configuration returns HTTP 503
  const unconfiguredRegReq = new Request('http://localhost/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'unconfigured_user@example.com',
      password: 'StrongPassword123',
      confirmPassword: 'StrongPassword123',
    }),
  });
  const unconfiguredRegRes = await worker.fetch(unconfiguredRegReq, TEST_ENV);
  const unconfiguredRegBody = (await unconfiguredRegRes.json()) as any;

  report(
    unconfiguredRegRes.status === 503,
    'POST /api/auth/register returns HTTP 503 when email sending is unconfigured'
  );
  report(
    unconfiguredRegBody.error === 'Email verification is currently unavailable. Please contact the administrator.',
    'POST /api/auth/register returns expected safe user-facing message'
  );
  report(
    unconfiguredRegBody.success !== true && !unconfiguredRegBody.message && !unconfiguredRegBody.verificationUrl,
    'POST /api/auth/register does not return fake success or expose verification URLs'
  );

  // 2.2 Verify user was NOT created in the database
  const ghostUser = await getUserByEmail('unconfigured_user@example.com', TEST_ENV);
  report(
    ghostUser === null,
    'Unconfigured registration did NOT create an orphaned unverified user in the database'
  );

  // 2.3 Resend verification with missing email config returns HTTP 503
  const unconfiguredResendReq = new Request('http://localhost/api/auth/resend-verification', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'anyuser@example.com' }),
  });
  const unconfiguredResendRes = await worker.fetch(unconfiguredResendReq, TEST_ENV);
  const unconfiguredResendBody = (await unconfiguredResendRes.json()) as any;
  report(
    unconfiguredResendRes.status === 503 &&
      unconfiguredResendBody.error === 'Email verification is currently unavailable. Please contact the administrator.',
    'POST /api/auth/resend-verification returns HTTP 503 when email sending is unconfigured'
  );

  // 2.4 Forgot password with missing email config returns HTTP 503
  const unconfiguredForgotReq = new Request('http://localhost/api/auth/forgot-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'anyuser@example.com' }),
  });
  const unconfiguredForgotRes = await worker.fetch(unconfiguredForgotReq, TEST_ENV);
  const unconfiguredForgotBody = (await unconfiguredForgotRes.json()) as any;
  report(
    unconfiguredForgotRes.status === 503 &&
      unconfiguredForgotBody.error === 'Email service is currently unavailable. Please contact the administrator.',
    'POST /api/auth/forgot-password returns HTTP 503 when email sending is unconfigured'
  );

  // -------------------------------------------------------------
  // Section 3: Scenario C — Gmail Send Fails (Rollback & Safe Errors)
  // -------------------------------------------------------------
  console.log('\n--- Section 3: Provider Configured but Dispatch Fails (Scenario C) ---');

  // Configure settings with invalid refresh token so sendEmailViaGmail will fail
  await saveGoogleMailSettings(
    {
      email_address: 'admin@eventgamestudio.com',
      refresh_token_encrypted: 'invalid_mock_token_that_causes_send_failure',
      enabled: true,
      status: 'connected',
    },
    TEST_ENV
  );

  // Mock global fetch to simulate a Gmail API failure during send
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const urlStr = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url;
    if (urlStr.includes('oauth2.googleapis.com/token') || urlStr.includes('gmail.googleapis.com')) {
      return new Response(
        JSON.stringify({
          error: 'invalid_grant',
          error_description: 'Bad Request - Token revoked (internal secret diagnostic)',
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }
    return originalFetch(input, init);
  };

  const failingSendReq = new Request('http://localhost/api/auth/register', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-correlation-id': 'corr-test-gmail-fail-123',
    },
    body: JSON.stringify({
      email: 'failing_delivery@example.com',
      password: 'Password123',
      confirmPassword: 'Password123',
    }),
  });
  const failingSendRes = await worker.fetch(failingSendReq, TEST_ENV);
  const failingSendBody = (await failingSendRes.json()) as any;

  report(
    failingSendRes.status === 503,
    'POST /api/auth/register returns HTTP 503 when Gmail delivery fails'
  );
  report(
    failingSendBody.error === "We couldn't send the verification email right now. Please try again later.",
    'POST /api/auth/register returns safe user-facing message on Gmail failure'
  );
  report(
    !JSON.stringify(failingSendBody).includes('invalid_grant') &&
      !JSON.stringify(failingSendBody).includes('Token revoked') &&
      !JSON.stringify(failingSendBody).includes('stack'),
    'Internal Gmail API error details are NOT exposed to the client'
  );

  // Verify that the newly created unverified user was rolled back
  const rolledBackUser = await getUserByEmail('failing_delivery@example.com', TEST_ENV);
  report(
    rolledBackUser === null,
    'Newly created user was safely rolled back / deleted from database after dispatch failure'
  );

  // Restore fetch
  globalThis.fetch = originalFetch;

  // -------------------------------------------------------------
  // Section 4: Scenario B — Registration with Valid Email Configuration
  // -------------------------------------------------------------
  console.log('\n--- Section 4: Successful Registration & Validation (Scenario B) ---');

  // Enable test email dispatch mode for automated verification in test environment
  const VALID_CONFIG_ENV: Record<string, any> = {
    ...TEST_ENV,
    ALLOW_EMAIL_TEST_FALLBACK: 'true',
  };

  // 4.1 Rejection of password mismatch
  const mismatchReq = new Request('http://localhost/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'bob@example.com',
      password: 'Password123',
      confirmPassword: 'DifferentPassword123',
    }),
  });
  const mismatchRes = await worker.fetch(mismatchReq, VALID_CONFIG_ENV);
  const mismatchBody = (await mismatchRes.json()) as any;
  report(
    mismatchRes.status === 422 && mismatchBody.error === 'Passwords do not match',
    'POST /api/auth/register rejects mismatched passwords with 422'
  );

  // 4.2 Rejection of weak password
  const weakReq = new Request('http://localhost/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'bob@example.com',
      password: 'weak',
      confirmPassword: 'weak',
    }),
  });
  const weakRes = await worker.fetch(weakReq, VALID_CONFIG_ENV);
  report(weakRes.status === 422, 'POST /api/auth/register rejects weak password with 422');

  // 4.3 Successful registration
  const regReq = new Request('http://localhost/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'Bob@Example.COM  ',
      password: 'Password123',
      confirmPassword: 'Password123',
    }),
  });
  const regRes = await worker.fetch(regReq, VALID_CONFIG_ENV);
  const regBody = (await regRes.json()) as any;

  report(
    regRes.status === 201 &&
      regBody.success === true &&
      regBody.email === 'bob@example.com' &&
      regBody.message.includes('verification link'),
    'POST /api/auth/register succeeds with normalized email and instructs to check email'
  );

  const bobRecord = await getUserByEmail('bob@example.com', VALID_CONFIG_ENV);
  report(
    bobRecord !== null &&
      bobRecord.email === 'bob@example.com' &&
      bobRecord.email_verified === false &&
      Boolean(bobRecord.verification_token_hash) &&
      Boolean(bobRecord.verification_token_expires_at),
    'Registered user is created as email_verified=false with verification token stored'
  );

  // 4.4 Duplicate registration rejection
  const dupReq = new Request('http://localhost/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'bob@example.com',
      password: 'Password123',
      confirmPassword: 'Password123',
    }),
  });
  const dupRes = await worker.fetch(dupReq, VALID_CONFIG_ENV);
  report(
    dupRes.status === 409,
    'POST /api/auth/register rejects duplicate registration with 409'
  );

  // -------------------------------------------------------------
  // Section 5: Login Restriction for Unverified Accounts
  // -------------------------------------------------------------
  console.log('\n--- Section 5: Login Restriction for Unverified Accounts ---');

  const unverifiedLoginReq = new Request('http://localhost/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'bob@example.com',
      password: 'Password123',
    }),
  });
  const unverifiedLoginRes = await worker.fetch(unverifiedLoginReq, VALID_CONFIG_ENV);
  const unverifiedLoginBody = (await unverifiedLoginRes.json()) as any;

  report(
    unverifiedLoginRes.status === 403 &&
      unverifiedLoginBody.code === 'EMAIL_NOT_VERIFIED' &&
      unverifiedLoginBody.error.includes('verify your email'),
    'POST /api/auth/login blocks unverified accounts with 403 EMAIL_NOT_VERIFIED'
  );

  // -------------------------------------------------------------
  // Section 6: Email Verification Callback (POST /api/auth/verify-email)
  // -------------------------------------------------------------
  console.log('\n--- Section 6: Email Verification Callback ---');

  // 6.1 Missing token
  const missingTokenReq = new Request('http://localhost/api/auth/verify-email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: '' }),
  });
  const missingTokenRes = await worker.fetch(missingTokenReq, VALID_CONFIG_ENV);
  report(
    missingTokenRes.status === 422,
    'POST /api/auth/verify-email rejects missing token with 422'
  );

  // 6.2 Invalid token
  const invalidTokenReq = new Request('http://localhost/api/auth/verify-email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: 'bogus_nonexistent_token' }),
  });
  const invalidTokenRes = await worker.fetch(invalidTokenReq, VALID_CONFIG_ENV);
  const invalidTokenBody = (await invalidTokenRes.json()) as any;
  report(
    invalidTokenRes.status === 400 && invalidTokenBody.code === 'INVALID_TOKEN',
    'POST /api/auth/verify-email rejects invalid/used token with 400 INVALID_TOKEN'
  );

  // 6.3 Successful verification with valid token
  const { rawToken, tokenHash, expiresAt } = generateVerificationToken(24);
  await updateUserVerificationToken(bobRecord!.id, tokenHash, expiresAt, VALID_CONFIG_ENV);

  const verifyReq = new Request('http://localhost/api/auth/verify-email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: rawToken }),
  });
  const verifyRes = await worker.fetch(verifyReq, VALID_CONFIG_ENV);
  const verifyBody = (await verifyRes.json()) as any;

  report(
    verifyRes.status === 200 &&
      verifyBody.success === true &&
      Boolean(verifyBody.token) &&
      verifyBody.user?.email === 'bob@example.com',
    'POST /api/auth/verify-email validates token and issues authenticated session'
  );

  const bobAfterVerify = await getUserById(bobRecord!.id, VALID_CONFIG_ENV);
  report(
    bobAfterVerify?.email_verified === true &&
      Boolean(bobAfterVerify?.verified_at) &&
      !bobAfterVerify?.verification_token_hash,
    'User record updated: email_verified=true, token cleared, verified_at set'
  );

  // 6.4 Token cannot be reused (one-time use)
  const reuseReq = new Request('http://localhost/api/auth/verify-email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: rawToken }),
  });
  const reuseRes = await worker.fetch(reuseReq, VALID_CONFIG_ENV);
  const reuseBody = (await reuseRes.json()) as any;
  report(
    reuseRes.status === 400 && reuseBody.code === 'INVALID_TOKEN',
    'Verification token is single-use: subsequent attempt rejected with 400 INVALID_TOKEN'
  );

  // 6.5 Expired token handling
  const expiredTokenData = generateVerificationToken(-1); // expired
  await updateUserVerificationToken(bobRecord!.id, expiredTokenData.tokenHash, expiredTokenData.expiresAt, VALID_CONFIG_ENV);
  const expiredReq = new Request('http://localhost/api/auth/verify-email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: expiredTokenData.rawToken }),
  });
  const expiredRes = await worker.fetch(expiredReq, VALID_CONFIG_ENV);
  const expiredBody = (await expiredRes.json()) as any;
  report(
    expiredRes.status === 400 && expiredBody.code === 'EXPIRED_TOKEN',
    'POST /api/auth/verify-email detects expired token with 400 EXPIRED_TOKEN'
  );

  // Restore verified state for bob
  await verifyUserEmail(bobRecord!.id, VALID_CONFIG_ENV);

  // -------------------------------------------------------------
  // Section 7: Verified Account Login
  // -------------------------------------------------------------
  console.log('\n--- Section 7: Verified Account Login ---');

  const verifiedLoginReq = new Request('http://localhost/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'bob@example.com',
      password: 'Password123',
    }),
  });
  const verifiedLoginRes = await worker.fetch(verifiedLoginReq, VALID_CONFIG_ENV);
  const verifiedLoginBody = (await verifiedLoginRes.json()) as any;

  report(
    verifiedLoginRes.status === 200 &&
      Boolean(verifiedLoginBody.token) &&
      verifiedLoginBody.user?.email === 'bob@example.com',
    'POST /api/auth/login succeeds for verified account and returns signed JWT'
  );

  const payload = await verifyAppToken(verifiedLoginBody.token, undefined, VALID_CONFIG_ENV);
  report(
    payload?.sub === bobRecord!.id,
    'Signed JWT sub claim matches user id'
  );

  // -------------------------------------------------------------
  // Section 8: Resend Verification Email (Enumeration-Safe)
  // -------------------------------------------------------------
  console.log('\n--- Section 8: Resend Verification Email ---');

  const charlie = await createUser(
    {
      email: 'charlie@example.com',
      name: 'Charlie',
      password_hash: await hashPassword('PassCharlie123'),
      email_verified: false,
    },
    VALID_CONFIG_ENV
  );

  const resendReq = new Request('http://localhost/api/auth/resend-verification', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'charlie@example.com' }),
  });
  const resendRes = await worker.fetch(resendReq, VALID_CONFIG_ENV);
  const resendBody = (await resendRes.json()) as any;

  report(
    resendRes.status === 200 &&
      resendBody.success === true &&
      resendBody.message.includes('If an account requires email verification'),
    'POST /api/auth/resend-verification succeeds with generic message'
  );

  const charlieAfterResend = await getUserById(charlie.id, VALID_CONFIG_ENV);
  report(
    Boolean(charlieAfterResend?.verification_token_hash),
    'New verification token was generated and stored on resend'
  );

  // Non-existent email returns same generic message (prevents enumeration)
  const nonexistentResendReq = new Request('http://localhost/api/auth/resend-verification', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'doesnotexist@example.com' }),
  });
  const nonexistentResendRes = await worker.fetch(nonexistentResendReq, VALID_CONFIG_ENV);
  const nonexistentResendBody = (await nonexistentResendRes.json()) as any;

  report(
    nonexistentResendRes.status === 200 &&
      nonexistentResendBody.message === resendBody.message,
    'Resend verification for non-existent email returns identical generic response (zero enumeration leak)'
  );

  // Resend verification when email provider is configured but delivery fails
  const origFetch = globalThis.fetch;
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const urlStr = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url;
    if (urlStr.includes('oauth2.googleapis.com') || urlStr.includes('gmail.googleapis.com')) {
      return new Response(
        JSON.stringify({ error: 'backend_smtp_crash', error_description: 'Internal credentials compromised' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }
    return origFetch(input, init);
  };

  const failingResendReq = new Request('http://localhost/api/auth/resend-verification', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'charlie@example.com' }),
  });
  const failingResendRes = await worker.fetch(failingResendReq, {
    ...VALID_CONFIG_ENV,
    ALLOW_EMAIL_TEST_FALLBACK: 'false',
  });
  const failingResendBody = (await failingResendRes.json()) as any;

  report(
    failingResendRes.status === 503 &&
      failingResendBody.error === "We couldn't send the verification email right now. Please try again later.",
    'POST /api/auth/resend-verification returns 503 and safe message on delivery failure'
  );
  report(
    !JSON.stringify(failingResendBody).includes('backend_smtp_crash') &&
      !JSON.stringify(failingResendBody).includes('credentials compromised'),
    'Resend failure does not expose internal provider errors'
  );

  globalThis.fetch = origFetch;

  // Rate limiting check on resend verification
  let rateLimitHit = false;
  for (let i = 0; i < 7; i++) {
    const spamReq = new Request('http://localhost/api/auth/resend-verification', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-forwarded-for': '198.51.100.42',
        'x-test-rate-limit': 'true',
      },
      body: JSON.stringify({ email: 'charlie@example.com' }),
    });
    const spamRes = await worker.fetch(spamReq, VALID_CONFIG_ENV);
    if (spamRes.status === 429) {
      rateLimitHit = true;
      break;
    }
  }
  report(rateLimitHit, 'POST /api/auth/resend-verification enforces rate limiting (returns 429 on spam)');

  // -------------------------------------------------------------
  // Section 9: Password Reset Flow
  // -------------------------------------------------------------
  console.log('\n--- Section 9: Password Reset Flow ---');

  const forgotReq = new Request('http://localhost/api/auth/forgot-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'bob@example.com' }),
  });
  const forgotRes = await worker.fetch(forgotReq, VALID_CONFIG_ENV);
  const forgotBody = (await forgotRes.json()) as any;

  report(
    forgotRes.status === 200 &&
      forgotBody.success === true &&
      forgotBody.message.includes('password reset link has been sent'),
    'POST /api/auth/forgot-password returns safe generic success message'
  );

  const bobAfterForgot = await getUserById(bobRecord!.id, VALID_CONFIG_ENV);
  report(
    Boolean(bobAfterForgot?.password_reset_token_hash) &&
      Boolean(bobAfterForgot?.password_reset_expires_at),
    'Password reset token hash and expiration stored on user record'
  );

  // Test reset completion
  const { rawToken: resetToken, tokenHash: resetHash, expiresAt: resetExpires } =
    generatePasswordResetToken(1);
  await updateUserPasswordResetToken(bobRecord!.id, resetHash, resetExpires, VALID_CONFIG_ENV);

  const resetReq = new Request('http://localhost/api/auth/reset-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      token: resetToken,
      password: 'NewStrongPassword456',
      confirmPassword: 'NewStrongPassword456',
    }),
  });
  const resetRes = await worker.fetch(resetReq, VALID_CONFIG_ENV);
  const resetBody = (await resetRes.json()) as any;

  report(
    resetRes.status === 200 &&
      resetBody.success === true &&
      resetBody.message.includes('Password has been reset successfully'),
    'POST /api/auth/reset-password resets password successfully'
  );

  // Verify login with new password works
  const newLoginReq = new Request('http://localhost/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'bob@example.com',
      password: 'NewStrongPassword456',
    }),
  });
  const newLoginRes = await worker.fetch(newLoginReq, VALID_CONFIG_ENV);
  report(newLoginRes.status === 200, 'Login with new password succeeds');

  // Verify login with old password fails
  const oldLoginReq = new Request('http://localhost/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'bob@example.com',
      password: 'Password123',
    }),
  });
  const oldLoginRes = await worker.fetch(oldLoginReq, VALID_CONFIG_ENV);
  report(oldLoginRes.status === 401, 'Login with old password fails with 401');

  // -------------------------------------------------------------
  // Section 10: Google Account Coexistence
  // -------------------------------------------------------------
  console.log('\n--- Section 10: Google Account Coexistence ---');

  const googleUser = await createUser(
    {
      google_id: 'google-sub-999888',
      email: 'googleuser@example.com',
      name: 'Google User',
      email_verified: true,
      verified_at: new Date().toISOString(),
    },
    VALID_CONFIG_ENV
  );

  const googleDupReq = new Request('http://localhost/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'googleuser@example.com',
      password: 'Password123',
      confirmPassword: 'Password123',
    }),
  });
  const googleDupRes = await worker.fetch(googleDupReq, VALID_CONFIG_ENV);
  const googleDupBody = (await googleDupRes.json()) as any;

  report(
    googleDupRes.status === 409 &&
      googleDupBody.error.includes('Google Sign-In'),
    'Registration with existing Google email safely rejected with 409 directing to Google Sign-In'
  );

  const googleLoginReq = new Request('http://localhost/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'googleuser@example.com',
      password: 'Password123',
    }),
  });
  const googleLoginRes = await worker.fetch(googleLoginReq, VALID_CONFIG_ENV);
  const googleLoginBody = (await googleLoginRes.json()) as any;

  report(
    googleLoginRes.status === 401 &&
      googleLoginBody.error.includes('Google Sign-In'),
    'Password login for Google-only account directs user to sign in with Google'
  );

  // -------------------------------------------------------------
  // Section 11: Welcome Credit Eligibility Guard
  // -------------------------------------------------------------
  console.log('\n--- Section 11: Welcome Credit Eligibility Guard ---');

  const charlieOrg = await createOrganization(
    { name: 'Charlie Org', owner_id: charlie.id },
    VALID_CONFIG_ENV
  );
  const unverifiedEligibility = await evaluatePromotionEligibility({
    userId: charlie.id,
    organizationId: charlieOrg.id,
    rewardType: 'WELCOME_CREDIT',
    env: VALID_CONFIG_ENV,
  });

  report(
    unverifiedEligibility.eligible === false,
    'Unverified email user is strictly not eligible for Welcome Credit'
  );

  // -------------------------------------------------------------
  // Section 12: Unit Tests for sendVerificationEmail & sendPasswordResetEmail
  // -------------------------------------------------------------
  console.log('\n--- Section 12: sendVerificationEmail & sendPasswordResetEmail Direct Unit Tests ---');

  // 12.1 Unconfigured environment returns EMAIL_NOT_CONFIGURED
  const unconfiguredResult = await sendVerificationEmail({
    email: 'test@example.com',
    rawToken: 'mock_token',
    env: { NODE_ENV: 'production' },
  });
  report(
    unconfiguredResult.success === false && unconfiguredResult.status === 'EMAIL_NOT_CONFIGURED',
    'sendVerificationEmail returns EMAIL_NOT_CONFIGURED when settings are absent'
  );

  // 12.2 Production environment never allows local test fallback
  const prodWithFallbackAttempt = await sendVerificationEmail({
    email: 'test@example.com',
    rawToken: 'mock_token',
    env: {
      NODE_ENV: 'production',
      ALLOW_EMAIL_TEST_FALLBACK: 'true',
    },
  });
  report(
    prodWithFallbackAttempt.success === false && prodWithFallbackAttempt.status === 'EMAIL_NOT_CONFIGURED',
    'sendVerificationEmail strictly blocks test fallback in production even with ALLOW_EMAIL_TEST_FALLBACK'
  );

  // 12.3 sendPasswordResetEmail returns EMAIL_NOT_CONFIGURED when settings are absent
  const unconfiguredResetResult = await sendPasswordResetEmail({
    email: 'test@example.com',
    rawToken: 'mock_token',
    env: { NODE_ENV: 'production' },
  });
  report(
    unconfiguredResetResult.success === false && unconfiguredResetResult.status === 'EMAIL_NOT_CONFIGURED',
    'sendPasswordResetEmail returns EMAIL_NOT_CONFIGURED when settings are absent'
  );

  // -------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------
  console.log('\n======================================================');
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log('======================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Unhandled test failure:', err);
  process.exit(1);
});
