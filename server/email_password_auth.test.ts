/**
 * Comprehensive Email/Password Registration, Email Verification & Password Reset Test Suite
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
} from './emailVerification.js';
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
  // Section 1: Validation & Password Hashing Unit Tests
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
  // Section 2: Registration Endpoint (POST /api/auth/register)
  // -------------------------------------------------------------
  console.log('\n--- Section 2: Registration Endpoint & Validation ---');

  // 2.1 Rejection of password mismatch
  const mismatchReq = new Request('http://localhost/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'bob@example.com',
      password: 'Password123',
      confirmPassword: 'DifferentPassword123',
    }),
  });
  const mismatchRes = await worker.fetch(mismatchReq, TEST_ENV);
  const mismatchBody = (await mismatchRes.json()) as any;
  report(
    mismatchRes.status === 422 && mismatchBody.error === 'Passwords do not match',
    'POST /api/auth/register rejects mismatched passwords with 422'
  );

  // 2.2 Rejection of weak password
  const weakReq = new Request('http://localhost/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'bob@example.com',
      password: 'weak',
      confirmPassword: 'weak',
    }),
  });
  const weakRes = await worker.fetch(weakReq, TEST_ENV);
  report(weakRes.status === 422, 'POST /api/auth/register rejects weak password with 422');

  // 2.3 Successful registration
  const regReq = new Request('http://localhost/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'Bob@Example.COM  ',
      password: 'Password123',
      confirmPassword: 'Password123',
    }),
  });
  const regRes = await worker.fetch(regReq, TEST_ENV);
  const regBody = (await regRes.json()) as any;

  report(
    regRes.status === 201 &&
      regBody.success === true &&
      regBody.email === 'bob@example.com' &&
      regBody.message.includes('verification link'),
    'POST /api/auth/register succeeds with normalized email and instructs to check email'
  );

  const bobRecord = await getUserByEmail('bob@example.com', TEST_ENV);
  report(
    bobRecord !== null &&
      bobRecord.email === 'bob@example.com' &&
      bobRecord.email_verified === false &&
      Boolean(bobRecord.verification_token_hash) &&
      Boolean(bobRecord.verification_token_expires_at),
    'Registered user is created as email_verified=false with verification token stored'
  );

  // 2.4 Duplicate registration rejection
  const dupReq = new Request('http://localhost/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'bob@example.com',
      password: 'Password123',
      confirmPassword: 'Password123',
    }),
  });
  const dupRes = await worker.fetch(dupReq, TEST_ENV);
  report(
    dupRes.status === 409,
    'POST /api/auth/register rejects duplicate registration with 409'
  );

  // -------------------------------------------------------------
  // Section 3: Login Restriction for Unverified Accounts
  // -------------------------------------------------------------
  console.log('\n--- Section 3: Login Restriction for Unverified Accounts ---');

  const unverifiedLoginReq = new Request('http://localhost/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'bob@example.com',
      password: 'Password123',
    }),
  });
  const unverifiedLoginRes = await worker.fetch(unverifiedLoginReq, TEST_ENV);
  const unverifiedLoginBody = (await unverifiedLoginRes.json()) as any;

  report(
    unverifiedLoginRes.status === 403 &&
      unverifiedLoginBody.code === 'EMAIL_NOT_VERIFIED' &&
      unverifiedLoginBody.error.includes('verify your email'),
    'POST /api/auth/login blocks unverified accounts with 403 EMAIL_NOT_VERIFIED'
  );

  // -------------------------------------------------------------
  // Section 4: Email Verification Callback (POST /api/auth/verify-email)
  // -------------------------------------------------------------
  console.log('\n--- Section 4: Email Verification Callback ---');

  // 4.1 Missing token
  const missingTokenReq = new Request('http://localhost/api/auth/verify-email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: '' }),
  });
  const missingTokenRes = await worker.fetch(missingTokenReq, TEST_ENV);
  report(
    missingTokenRes.status === 422,
    'POST /api/auth/verify-email rejects missing token with 422'
  );

  // 4.2 Invalid token
  const invalidTokenReq = new Request('http://localhost/api/auth/verify-email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: 'bogus_nonexistent_token' }),
  });
  const invalidTokenRes = await worker.fetch(invalidTokenReq, TEST_ENV);
  const invalidTokenBody = (await invalidTokenRes.json()) as any;
  report(
    invalidTokenRes.status === 400 && invalidTokenBody.code === 'INVALID_TOKEN',
    'POST /api/auth/verify-email rejects invalid/used token with 400 INVALID_TOKEN'
  );

  // 4.3 Successful verification with valid token
  // Let's create a known raw token and hash for bob
  const { rawToken, tokenHash, expiresAt } = generateVerificationToken(24);
  await updateUserVerificationToken(bobRecord!.id, tokenHash, expiresAt, TEST_ENV);

  const verifyReq = new Request('http://localhost/api/auth/verify-email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: rawToken }),
  });
  const verifyRes = await worker.fetch(verifyReq, TEST_ENV);
  const verifyBody = (await verifyRes.json()) as any;

  report(
    verifyRes.status === 200 &&
      verifyBody.success === true &&
      Boolean(verifyBody.token) &&
      verifyBody.user?.email === 'bob@example.com',
    'POST /api/auth/verify-email validates token and issues authenticated session'
  );

  const bobAfterVerify = await getUserById(bobRecord!.id, TEST_ENV);
  report(
    bobAfterVerify?.email_verified === true &&
      Boolean(bobAfterVerify?.verified_at) &&
      !bobAfterVerify?.verification_token_hash,
    'User record updated: email_verified=true, token cleared, verified_at set'
  );

  // 4.4 Token cannot be reused (one-time use)
  const reuseReq = new Request('http://localhost/api/auth/verify-email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: rawToken }),
  });
  const reuseRes = await worker.fetch(reuseReq, TEST_ENV);
  const reuseBody = (await reuseRes.json()) as any;
  report(
    reuseRes.status === 400 && reuseBody.code === 'INVALID_TOKEN',
    'Verification token is single-use: subsequent attempt rejected with 400 INVALID_TOKEN'
  );

  // 4.5 Expired token handling
  const expiredTokenData = generateVerificationToken(-1); // expired 1 hour ago
  await updateUserVerificationToken(
    bobRecord!.id,
    expiredTokenData.tokenHash,
    expiredTokenData.expiresAt,
    TEST_ENV
  );
  // Temporarily set email_verified back to false to test expired branch
  await updateUserVerificationToken(bobRecord!.id, expiredTokenData.tokenHash, expiredTokenData.expiresAt, TEST_ENV);
  const expiredReq = new Request('http://localhost/api/auth/verify-email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: expiredTokenData.rawToken }),
  });
  const expiredRes = await worker.fetch(expiredReq, TEST_ENV);
  const expiredBody = (await expiredRes.json()) as any;
  report(
    expiredRes.status === 400 && expiredBody.code === 'EXPIRED_TOKEN',
    'POST /api/auth/verify-email detects expired token with 400 EXPIRED_TOKEN'
  );

  // Restore verified state for bob
  await verifyUserEmail(bobRecord!.id, TEST_ENV);

  // -------------------------------------------------------------
  // Section 5: Verified Account Login
  // -------------------------------------------------------------
  console.log('\n--- Section 5: Verified Account Login ---');

  const verifiedLoginReq = new Request('http://localhost/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'bob@example.com',
      password: 'Password123',
    }),
  });
  const verifiedLoginRes = await worker.fetch(verifiedLoginReq, TEST_ENV);
  const verifiedLoginBody = (await verifiedLoginRes.json()) as any;

  report(
    verifiedLoginRes.status === 200 &&
      Boolean(verifiedLoginBody.token) &&
      verifiedLoginBody.user?.email === 'bob@example.com',
    'POST /api/auth/login succeeds for verified account and returns signed JWT'
  );

  const payload = await verifyAppToken(verifiedLoginBody.token, undefined, TEST_ENV);
  report(
    payload?.sub === bobRecord!.id,
    'Signed JWT sub claim matches user id'
  );

  // -------------------------------------------------------------
  // Section 6: Resend Verification Email (Enumeration-Safe)
  // -------------------------------------------------------------
  console.log('\n--- Section 6: Resend Verification Email ---');

  // Test for unverified user Charlie
  const charlie = await createUser(
    {
      email: 'charlie@example.com',
      name: 'Charlie',
      password_hash: await hashPassword('PassCharlie123'),
      email_verified: false,
    },
    TEST_ENV
  );

  const resendReq = new Request('http://localhost/api/auth/resend-verification', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'charlie@example.com' }),
  });
  const resendRes = await worker.fetch(resendReq, TEST_ENV);
  const resendBody = (await resendRes.json()) as any;

  report(
    resendRes.status === 200 &&
      resendBody.success === true &&
      resendBody.message.includes('If an account requires email verification'),
    'POST /api/auth/resend-verification succeeds with generic message'
  );

  const charlieAfterResend = await getUserById(charlie.id, TEST_ENV);
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
  const nonexistentResendRes = await worker.fetch(nonexistentResendReq, TEST_ENV);
  const nonexistentResendBody = (await nonexistentResendRes.json()) as any;

  report(
    nonexistentResendRes.status === 200 &&
      nonexistentResendBody.message === resendBody.message,
    'Resend verification for non-existent email returns identical generic response (zero enumeration leak)'
  );

  // -------------------------------------------------------------
  // Section 7: Password Reset Flow
  // -------------------------------------------------------------
  console.log('\n--- Section 7: Password Reset Flow ---');

  const forgotReq = new Request('http://localhost/api/auth/forgot-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'bob@example.com' }),
  });
  const forgotRes = await worker.fetch(forgotReq, TEST_ENV);
  const forgotBody = (await forgotRes.json()) as any;

  report(
    forgotRes.status === 200 &&
      forgotBody.success === true &&
      forgotBody.message.includes('password reset link has been sent'),
    'POST /api/auth/forgot-password returns safe generic success message'
  );

  const bobAfterForgot = await getUserById(bobRecord!.id, TEST_ENV);
  report(
    Boolean(bobAfterForgot?.password_reset_token_hash) &&
      Boolean(bobAfterForgot?.password_reset_expires_at),
    'Password reset token hash and expiration stored on user record'
  );

  // Test reset completion
  const { rawToken: resetToken, tokenHash: resetHash, expiresAt: resetExpires } =
    generatePasswordResetToken(1);
  await updateUserPasswordResetToken(bobRecord!.id, resetHash, resetExpires, TEST_ENV);

  const resetReq = new Request('http://localhost/api/auth/reset-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      token: resetToken,
      password: 'NewStrongPassword456',
      confirmPassword: 'NewStrongPassword456',
    }),
  });
  const resetRes = await worker.fetch(resetReq, TEST_ENV);
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
  const newLoginRes = await worker.fetch(newLoginReq, TEST_ENV);
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
  const oldLoginRes = await worker.fetch(oldLoginReq, TEST_ENV);
  report(oldLoginRes.status === 401, 'Login with old password fails with 401');

  // -------------------------------------------------------------
  // Section 8: Google Account Coexistence
  // -------------------------------------------------------------
  console.log('\n--- Section 8: Google Account Coexistence ---');

  // Create a user who registered via Google
  const googleUser = await createUser(
    {
      google_id: 'google-sub-999888',
      email: 'googleuser@example.com',
      name: 'Google User',
      email_verified: true,
      verified_at: new Date().toISOString(),
    },
    TEST_ENV
  );

  // Email password registration with existing Google user email returns 409 informing Google sign-in
  const googleDupReq = new Request('http://localhost/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'googleuser@example.com',
      password: 'Password123',
      confirmPassword: 'Password123',
    }),
  });
  const googleDupRes = await worker.fetch(googleDupReq, TEST_ENV);
  const googleDupBody = (await googleDupRes.json()) as any;

  report(
    googleDupRes.status === 409 &&
      googleDupBody.error.includes('Google Sign-In'),
    'Registration with existing Google email safely rejected with 409 directing to Google Sign-In'
  );

  // Email password login for Google user returns clear message to sign in with Google
  const googleLoginReq = new Request('http://localhost/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'googleuser@example.com',
      password: 'Password123',
    }),
  });
  const googleLoginRes = await worker.fetch(googleLoginReq, TEST_ENV);
  const googleLoginBody = (await googleLoginRes.json()) as any;

  report(
    googleLoginRes.status === 401 &&
      googleLoginBody.error.includes('Google Sign-In'),
    'Password login for Google-only account directs user to sign in with Google'
  );

  // -------------------------------------------------------------
  // Section 9: Welcome Credit Eligibility Guard
  // -------------------------------------------------------------
  console.log('\n--- Section 9: Welcome Credit Eligibility Guard ---');

  // Unverified user Charlie should NOT be eligible for welcome credit
  const charlieOrg = await createOrganization(
    { name: 'Charlie Org', owner_id: charlie.id },
    TEST_ENV
  );
  const unverifiedEligibility = await evaluatePromotionEligibility({
    userId: charlie.id,
    organizationId: charlieOrg.id,
    rewardType: 'WELCOME_CREDIT',
    env: TEST_ENV,
  });

  report(
    unverifiedEligibility.eligible === false,
    'Unverified email user is strictly not eligible for Welcome Credit'
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
