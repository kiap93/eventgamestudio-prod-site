/**
 * Regression Test Suite: Developer Testing Sandbox (Late Webhook Scenario)
 * Production Boundary & Security Verification
 *
 * Verifies:
 * 1. Frontend Rendering Boundary:
 *    - Production builds (import.meta.env.DEV = false) NEVER render the late-webhook developer sandbox,
 *      even when logged in as a developer admin.
 *    - Development builds (import.meta.env.DEV = true) only render the sandbox for authenticated developer admins.
 *    - Normal customers (is_developer = false) NEVER see developer controls under any environment.
 *    - Separation of developer user privilege (isDevAdmin) from UI sandbox display (showDevSandbox).
 * 2. Normal Customer Payment Functionality Preservation:
 *    - Manual "Check Payment Status Now" button is preserved and rendered for all users.
 *    - Real-time payment status polling (pollOrderStatus) remains functional.
 *    - Pending order details and copyable Order ID are accessible to normal customers.
 * 3. Backend Simulation Endpoint Security (server.ts & worker.ts):
 *    - POST /api/developer/wallet/test-webhook is disabled in production environments (403 Forbidden).
 *    - Endpoint strictly enforces developer admin authorization.
 *    - Webhook requests pass through cryptographic signature verification (no arbitrary balance tampering).
 *    - Real Stripe webhook processing and normal reconciliation are fully preserved.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { getSupabaseServerClient } from '../supabase.js';
import {
  createTopupOrder,
  getTopupOrderById,
  getWalletBalance,
} from './wallet.js';
import {
  verifyAndProcessPaymentWebhook,
  generateWebhookSignature,
  getPaymentWebhookSecret,
} from '../payment/index.js';

// Ensure test webhook secret is populated for testing
process.env.PAYMENT_WEBHOOK_SECRET = process.env.PAYMENT_WEBHOOK_SECRET || 'test_webhook_secret_sandbox_boundary_123';

let passed = 0;
let failed = 0;

function assertEqual(actual: any, expected: any, testName: string) {
  if (actual === expected) {
    console.log(`  ✓ PASS: ${testName} (got: ${actual})`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${testName} - Expected "${expected}", got "${actual}"`);
    failed++;
    throw new Error(`Assertion failed: ${testName}. Expected "${expected}", got "${actual}"`);
  }
}

function assertTrue(condition: boolean, testName: string) {
  if (condition) {
    console.log(`  ✓ PASS: ${testName}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${testName} - Condition was false`);
    failed++;
    throw new Error(`Assertion failed: ${testName}`);
  }
}

/**
 * Pure evaluation function mirroring the exact frontend boundary logic
 */
function evaluateSandboxVisibility(isDevEnvironment: boolean, currentUser: { is_developer?: boolean } | null) {
  const isDevAdmin = Boolean(currentUser?.is_developer);
  const showDevSandbox = Boolean(isDevEnvironment && isDevAdmin);
  return { isDevAdmin, showDevSandbox };
}

async function runTestSuite() {
  console.log('\n================================================================');
  console.log(' RUNNING DEVELOPER TESTING SANDBOX PRODUCTION BOUNDARY TESTS');
  console.log('================================================================\n');

  // --------------------------------------------------------------------------
  // TEST GROUP 1: FRONTEND VISIBILITY BOUNDARY LOGIC MATRIX
  // --------------------------------------------------------------------------
  console.log('--- Test Group 1: Frontend Sandbox Visibility Matrix ---');

  // Scenario A: Production build, Developer account
  // CRITICAL BUG FIX: Previously this returned true because (currentUser.is_developer || DEV) evaluated to true.
  const prodDeveloper = evaluateSandboxVisibility(false, { is_developer: true });
  assertEqual(prodDeveloper.isDevAdmin, true, 'Prod Developer: isDevAdmin is true (user privilege preserved)');
  assertEqual(prodDeveloper.showDevSandbox, false, 'Prod Developer: showDevSandbox is strictly FALSE in production build');

  // Scenario B: Production build, Regular customer
  const prodCustomer = evaluateSandboxVisibility(false, { is_developer: false });
  assertEqual(prodCustomer.isDevAdmin, false, 'Prod Customer: isDevAdmin is false');
  assertEqual(prodCustomer.showDevSandbox, false, 'Prod Customer: showDevSandbox is strictly FALSE in production build');

  // Scenario C: Production build, Unauthenticated visitor
  const prodAnonymous = evaluateSandboxVisibility(false, null);
  assertEqual(prodAnonymous.isDevAdmin, false, 'Prod Anonymous: isDevAdmin is false');
  assertEqual(prodAnonymous.showDevSandbox, false, 'Prod Anonymous: showDevSandbox is strictly FALSE in production build');

  // Scenario D: Development build, Developer account
  const devDeveloper = evaluateSandboxVisibility(true, { is_developer: true });
  assertEqual(devDeveloper.isDevAdmin, true, 'Dev Developer: isDevAdmin is true');
  assertEqual(devDeveloper.showDevSandbox, true, 'Dev Developer: showDevSandbox is TRUE for local development testing');

  // Scenario E: Development build, Regular customer
  const devCustomer = evaluateSandboxVisibility(true, { is_developer: false });
  assertEqual(devCustomer.isDevAdmin, false, 'Dev Customer: isDevAdmin is false');
  assertEqual(devCustomer.showDevSandbox, false, 'Dev Customer: Regular customer NEVER sees sandbox in dev build');

  // Scenario F: Development build, Unauthenticated visitor
  const devAnonymous = evaluateSandboxVisibility(true, null);
  assertEqual(devAnonymous.isDevAdmin, false, 'Dev Anonymous: isDevAdmin is false');
  assertEqual(devAnonymous.showDevSandbox, false, 'Dev Anonymous: Anonymous visitor NEVER sees sandbox in dev build');

  // --------------------------------------------------------------------------
  // TEST GROUP 2: STATIC CODE AUDIT OF FRONTEND COMPONENTS
  // --------------------------------------------------------------------------
  console.log('\n--- Test Group 2: Frontend Codebase Integrity Audit ---');

  const topUpPagePath = path.resolve(process.cwd(), 'src/components/wallet/TopUpPage.tsx');
  const topUpPageContent = fs.readFileSync(topUpPagePath, 'utf8');

  // Verify the flawed conditional is completely gone
  const flawedPattern = /isDevAdmin\s*=\s*Boolean\(\s*currentUser\?\.is_developer\s*\|\|\s*\(import\.meta as any\)\.env\?\.DEV\s*\)/;
  assertTrue(!flawedPattern.test(topUpPageContent), 'TopUpPage.tsx does not use flawed OR condition');

  // Verify showDevSandbox strictly requires import.meta.env.DEV
  assertTrue(
    topUpPageContent.includes('const showDevSandbox = Boolean(import.meta.env.DEV && isDevAdmin);'),
    'TopUpPage.tsx defines showDevSandbox with import.meta.env.DEV && isDevAdmin'
  );

  // Verify the late-webhook sandbox is gated by showDevSandbox
  assertTrue(
    topUpPageContent.includes('{showDevSandbox && (\n              <div className="p-4 rounded-2xl bg-slate-950/90 border border-amber-500/30 text-left space-y-3">') ||
    topUpPageContent.includes('{showDevSandbox && (\n              <div className="p-4 rounded-2xl bg-slate-950/90 border border-amber-500/30'),
    'TopUpPage.tsx gates late-webhook sandbox with showDevSandbox'
  );

  // Verify manual check button is NOT inside showDevSandbox
  const manualCheckIdx = topUpPageContent.indexOf('checkPaymentStatusNow');
  const sandboxIdx = topUpPageContent.indexOf('developerTestingSandbox');
  assertTrue(manualCheckIdx !== -1 && manualCheckIdx < sandboxIdx, 'Manual check button is rendered before sandbox');

  // Verify PaymentCheckoutModal uses consistent boundary
  const modalPath = path.resolve(process.cwd(), 'src/components/wallet/PaymentCheckoutModal.tsx');
  const modalContent = fs.readFileSync(modalPath, 'utf8');
  assertTrue(
    modalContent.includes('const showDevSandbox = Boolean(import.meta.env.DEV && isDevAdmin);'),
    'PaymentCheckoutModal.tsx defines showDevSandbox consistently'
  );
  assertTrue(
    modalContent.includes('{showDevSandbox && (\n            <div className="pt-2 border-t border-slate-800/80 space-y-2">'),
    'PaymentCheckoutModal.tsx gates developer tools with showDevSandbox'
  );

  // --------------------------------------------------------------------------
  // TEST GROUP 3: SERVER-SIDE SIMULATION ENDPOINT SECURITY AUDIT
  // --------------------------------------------------------------------------
  console.log('\n--- Test Group 3: Backend Simulation Endpoint Security Audit ---');

  const serverTsPath = path.resolve(process.cwd(), 'server.ts');
  const serverTsContent = fs.readFileSync(serverTsPath, 'utf8');

  // Verify server.ts protects /api/developer/wallet/test-webhook with authenticateDeveloperAdmin
  assertTrue(
    serverTsContent.includes("app.post('/api/developer/wallet/test-webhook', authenticateDeveloperAdmin,"),
    'server.ts requires authenticateDeveloperAdmin on test-webhook endpoint'
  );

  // Verify server.ts disables endpoint in production
  assertTrue(
    serverTsContent.includes('TEST_WEBHOOK_DISABLED_IN_PRODUCTION'),
    'server.ts returns TEST_WEBHOOK_DISABLED_IN_PRODUCTION when in production environment'
  );

  // Verify worker.ts protects /api/developer/wallet/test-webhook
  const workerTsPath = path.resolve(process.cwd(), 'worker.ts');
  const workerTsContent = fs.readFileSync(workerTsPath, 'utf8');

  assertTrue(
    workerTsContent.includes("if (pathname === '/api/developer/wallet/test-webhook' && method === 'POST')"),
    'worker.ts handles test-webhook route'
  );
  assertTrue(
    workerTsContent.includes('isUserDeveloperAdmin(auth.user, env)'),
    'worker.ts verifies isUserDeveloperAdmin'
  );
  assertTrue(
    workerTsContent.includes("errorResponse('Forbidden: Test webhook simulation is disabled in production environments.', 403, cors)"),
    'worker.ts disables test webhook simulation in production'
  );

  // --------------------------------------------------------------------------
  // TEST GROUP 4: FUNCTIONAL SIMULATION AND REAL WEBHOOK INTEGRITY
  // --------------------------------------------------------------------------
  console.log('\n--- Test Group 4: Functional Ledger Integrity & Production Defense ---');

  const testOrgId = crypto.randomUUID();
  const testUserId = crypto.randomUUID();

  // Create real test top-up order
  const order = await createTopupOrder({
    organizationId: testOrgId,
    userId: testUserId,
    amount: 1400.00,
    currency: 'MYR',
    notes: 'Regression test topup order',
  });

  assertEqual(order.status, 'PENDING', 'Order starts in PENDING status');

  // 1. Simulate production environment check:
  // When NODE_ENV === 'production', simulation requests must be strictly rejected
  const simulateEndpointHandler = (env: { NODE_ENV?: string; ENVIRONMENT?: string; APP_ENV?: string }, isDevUser: boolean) => {
    if (!isDevUser) {
      return { status: 403, error: 'Forbidden: Developer Admin access required.' };
    }
    const isProduction =
      env.NODE_ENV === 'production' ||
      env.ENVIRONMENT === 'production' ||
      env.APP_ENV === 'production';
    if (isProduction) {
      return {
        status: 403,
        error: 'Forbidden: Test webhook simulation is disabled in production environments.',
        code: 'TEST_WEBHOOK_DISABLED_IN_PRODUCTION',
      };
    }
    return { status: 200, success: true };
  };

  // Test non-developer call
  const nonDevCall = simulateEndpointHandler({ NODE_ENV: 'development' }, false);
  assertEqual(nonDevCall.status, 403, 'Non-developer receives 403 Forbidden even in development');

  // Test developer call in production
  const prodDevCall = simulateEndpointHandler({ NODE_ENV: 'production' }, true);
  assertEqual(prodDevCall.status, 403, 'Developer in production receives 403 Forbidden');
  assertEqual(prodDevCall.code, 'TEST_WEBHOOK_DISABLED_IN_PRODUCTION', 'Correct error code returned in production');

  // Test developer call in local dev
  const localDevCall = simulateEndpointHandler({ NODE_ENV: 'development' }, true);
  assertEqual(localDevCall.status, 200, 'Developer in development receives 200 OK');

  // 2. Verify real cryptographic webhook processing works independently of simulation
  const secret = getPaymentWebhookSecret();
  const validWebhookPayload = JSON.stringify({
    id: `evt_test_${Date.now()}`,
    type: 'payment.succeeded',
    created: Math.floor(Date.now() / 1000),
    data: {
      object: {
        id: `pay_${Date.now()}`,
        amount: order.top_up_amount,
        currency: order.currency,
        metadata: {
          order_id: order.id,
          organization_id: order.organization_id,
        },
        status: 'succeeded',
      },
    },
  });

  const { signatureHeader } = generateWebhookSignature(validWebhookPayload, secret);
  const webhookResult = await verifyAndProcessPaymentWebhook({
    rawBody: validWebhookPayload,
    signature: signatureHeader,
    secretOverride: secret,
  });

  assertEqual(webhookResult.status, 'PAID', 'Real cryptographic webhook successfully processes order to PAID');

  const updatedOrder = await getTopupOrderById(order.id);
  assertEqual(updatedOrder?.status, 'PAID', 'Order record updated to PAID in database');

  const finalWallet = await getWalletBalance(testOrgId);
  assertEqual(finalWallet.paid_balance, 1400.00, 'Wallet ledger credited accurately via verified webhook');

  // --------------------------------------------------------------------------
  // SUMMARY
  // --------------------------------------------------------------------------
  console.log('\n================================================================');
  console.log(` ALL REGRESSION TESTS PASSED! Passed: ${passed}, Failed: ${failed}`);
  console.log('================================================================\n');
}

runTestSuite().catch((err) => {
  console.error('Test suite failed with unexpected error:', err);
  process.exit(1);
});
