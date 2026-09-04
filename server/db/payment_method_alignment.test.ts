import crypto from 'node:crypto';
import {
  SUPPORTED_PAYMENT_METHODS,
  isPaymentMethodSupported,
  getSupportedPaymentMethods,
  createPaymentSession,
} from '../payment/index.js';
import { createTopupOrder, getWalletBalance, getOutstandingBalance } from './wallet.js';
import { getSupabaseServerClient } from '../supabase.js';
import fs from 'fs';
import path from 'path';

let passed = 0;
let failed = 0;

async function ensureTestOrg(orgId: string): Promise<string> {
  const supabase = getSupabaseServerClient();
  try {
    const { data: users } = await supabase.from('users').select('id').limit(1);
    const validOwnerId = users?.[0]?.id || '4c857d15-ab93-45a6-8de5-7858ab4d6bd2';
    await supabase.from('organizations').upsert({
      id: orgId,
      name: `Test Org ${orgId.slice(0, 8)}`,
      slug: `test-org-${orgId.slice(0, 8)}`,
      owner_id: validOwnerId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    return validOwnerId;
  } catch {
    return '4c857d15-ab93-45a6-8de5-7858ab4d6bd2';
  }
}

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  ✓ ${message}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    failed++;
  }
}

function assertEqual<T>(actual: T, expected: T, message: string) {
  const isMatch = actual === expected;
  if (isMatch) {
    console.log(`  ✓ ${message} [${String(actual)}]`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${message} (Expected: ${String(expected)}, Received: ${String(actual)})`);
    failed++;
  }
}

async function runTests() {
  console.log('======================================================');
  console.log(' PAYMENT METHOD ALIGNMENT & INTEGRITY TESTS');
  console.log(' Ensuring UI & Backend Only Advertise Supported Methods');
  console.log('======================================================\n');

  // ----------------------------------------------------
  // TEST GROUP 1: Authoritative Supported Payment Methods Config
  // ----------------------------------------------------
  console.log('--- Test Group 1: Authoritative Supported Payment Methods ---');

  const supportedMethods = getSupportedPaymentMethods();
  assertEqual(supportedMethods.length, 1, 'Only 1 payment method is currently enabled/supported');
  assertEqual(supportedMethods[0].id, 'card', 'The supported payment method is "card"');
  assertEqual(supportedMethods[0].enabled, true, 'Card payment method is enabled');

  // Verify isPaymentMethodSupported helper behavior
  assert(isPaymentMethodSupported('card'), 'isPaymentMethodSupported accepts "card"');
  assert(isPaymentMethodSupported('CARD'), 'isPaymentMethodSupported is case-insensitive for "CARD"');
  assert(isPaymentMethodSupported(' card '), 'isPaymentMethodSupported trims whitespace');
  assert(!isPaymentMethodSupported('fpx'), 'isPaymentMethodSupported strictly REJECTS "fpx"');
  assert(!isPaymentMethodSupported('FPX'), 'isPaymentMethodSupported strictly REJECTS "FPX"');
  assert(!isPaymentMethodSupported('online_banking'), 'isPaymentMethodSupported strictly REJECTS "online_banking"');
  assert(!isPaymentMethodSupported('grabpay'), 'isPaymentMethodSupported strictly REJECTS "grabpay"');
  assert(!isPaymentMethodSupported('crypto'), 'isPaymentMethodSupported strictly REJECTS "crypto"');

  // Fallback behavior when method is omitted/null/undefined
  assert(isPaymentMethodSupported(null), 'isPaymentMethodSupported returns true for null (card fallback)');
  assert(isPaymentMethodSupported(undefined), 'isPaymentMethodSupported returns true for undefined (card fallback)');
  assert(isPaymentMethodSupported(''), 'isPaymentMethodSupported returns true for empty string (card fallback)');

  // ----------------------------------------------------
  // TEST GROUP 2: Checkout Session Alignment
  // ----------------------------------------------------
  console.log('\n--- Test Group 2: Checkout Session Alignment ---');

  const testOrgId = crypto.randomUUID();
  const testUserId = await ensureTestOrg(testOrgId);

  // Create standard top-up order with card payment method
  const cardOrder = await createTopupOrder({
    organizationId: testOrgId,
    userId: testUserId,
    amount: 100,
    currency: 'MYR',
    paymentMethod: 'card',
  });

  const sessionResult = await createPaymentSession({
    order: cardOrder,
    originUrl: 'http://localhost:3000',
    customerEmail: 'test@example.com',
  });

  assertEqual(sessionResult.paymentMethod, 'card', 'Payment session explicitly returns paymentMethod === "card" (not "card_or_fpx")');
  assert(sessionResult.paymentMethod !== 'card_or_fpx', 'Payment session does NOT return legacy "card_or_fpx"');
  assert(sessionResult.paymentMethod !== 'fpx', 'Payment session does NOT return "fpx"');

  // ----------------------------------------------------
  // TEST GROUP 3: Rejection of Unsupported Payment Methods at Checkout
  // ----------------------------------------------------
  console.log('\n--- Test Group 3: Rejection of Unsupported Payment Methods ---');

  // Create an order attempting to use unsupported 'fpx'
  const fpxOrder = await createTopupOrder({
    organizationId: testOrgId,
    userId: testUserId,
    amount: 100,
    currency: 'MYR',
    paymentMethod: 'fpx',
  });

  let fpxCheckoutFailed = false;
  let fpxErrorMessage = '';
  try {
    await createPaymentSession({
      order: fpxOrder,
      originUrl: 'http://localhost:3000',
      customerEmail: 'test@example.com',
    });
  } catch (err: any) {
    fpxCheckoutFailed = true;
    fpxErrorMessage = err.message;
  }

  assert(fpxCheckoutFailed, 'createPaymentSession rejects order configured with unsupported payment method "fpx"');
  assert(fpxErrorMessage.includes('Unsupported payment method'), 'Error message explicitly states unsupported payment method');

  // ----------------------------------------------------
  // TEST GROUP 4: Static UI Codebase Audit
  // ----------------------------------------------------
  console.log('\n--- Test Group 4: Static UI Codebase Audit ---');

  const modalPath = path.resolve('src/components/wallet/PaymentCheckoutModal.tsx');
  const topUpPagePath = path.resolve('src/components/wallet/TopUpPage.tsx');
  const serverPaymentPath = path.resolve('server/payment/index.ts');

  const modalCode = fs.readFileSync(modalPath, 'utf8');
  const topUpPageCode = fs.readFileSync(topUpPagePath, 'utf8');
  const serverPaymentCode = fs.readFileSync(serverPaymentPath, 'utf8');

  // Assert modal code does not advertise FPX
  assert(!modalCode.includes('Online Banking (FPX)'), 'PaymentCheckoutModal does NOT contain "Online Banking (FPX)" text');
  assert(!modalCode.includes("setSelectedPaymentMethod('fpx')"), 'PaymentCheckoutModal does NOT allow selecting "fpx"');
  assert(!modalCode.includes("selectedPaymentMethod === 'fpx'"), 'PaymentCheckoutModal does NOT have FPX conditional branches');

  // Assert TopUpPage does not advertise FPX
  assert(!topUpPageCode.includes('Online Banking (FPX)'), 'TopUpPage does NOT contain "Online Banking (FPX)" text');
  assert(!topUpPageCode.includes("setSelectedPaymentMethod('fpx')"), 'TopUpPage does NOT allow selecting "fpx"');
  assert(!topUpPageCode.includes("selectedPaymentMethod === 'fpx'"), 'TopUpPage does NOT have FPX conditional branches');

  // Assert Stripe Checkout configuration only configures 'card'
  assert(serverPaymentCode.includes("payment_method_types: ['card']"), 'Stripe Checkout configuration strictly uses payment_method_types: [\'card\']');
  assert(!serverPaymentCode.includes("'card_or_fpx'"), 'server/payment/index.ts does NOT contain legacy "card_or_fpx"');

  // Summary
  console.log('\n======================================================');
  console.log(` RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('======================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal error running payment method alignment tests:', err);
  process.exit(1);
});
