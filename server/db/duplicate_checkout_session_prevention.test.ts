/**
 * BLOCKER 3 TEST SUITE: Duplicate Stripe Checkout Session Prevention
 *
 * Verifies:
 * 1. Double-click protection: Rapid successive requests return the identical Checkout Session.
 * 2. Two simultaneous requests: Concurrent Promise.all calls resolve to the exact same session without duplicates.
 * 3. Repeated payment request: Sequential re-requests for an active PENDING order reuse the existing valid session.
 * 4. Expired Checkout Session: Safely creates a fresh session ONLY when the previous one is genuinely expired.
 * 5. Cancelled Checkout Session: Safely creates a fresh session when the user cancelled the previous attempt.
 * 6. Successful payment: Rejects checkout session creation once an order is PAID.
 * 7. Duplicate webhook: Ensures idempotency on payment webhooks so wallet is never double-credited.
 * 8. Separate top-up orders: Independent orders receive distinct, unique Checkout Sessions without interference.
 * 9. High-concurrency stress test: 5 simultaneous requests resolve to one authoritative session.
 */

import crypto from 'node:crypto';
import { getSupabaseServerClient } from '../supabase.js';
import {
  createTopupOrder,
  getTopupOrderById,
  getWalletBalance,
  getOutstandingBalance,
  setOutstandingBalance,
  clearOutstandingBalance,
  cancelActiveCheckoutSession,
  expireActiveCheckoutSession,
} from './wallet.js';
import {
  createPaymentSession,
  verifyAndProcessPaymentWebhook,
  generateWebhookSignature,
  getPaymentWebhookSecret,
  _clearInFlightCheckoutSessionsForTests,
} from '../payment/index.js';

process.env.PAYMENT_WEBHOOK_SECRET = process.env.PAYMENT_WEBHOOK_SECRET || 'test_webhook_secret_key_12345';

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, details?: any) {
  if (condition) {
    console.log(`  ✓ PASS: ${testName}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${testName}`, details !== undefined ? details : '');
    failed++;
  }
}

function assertEqual(actual: any, expected: any, testName: string) {
  if (actual === expected) {
    console.log(`  ✓ PASS: ${testName} (expected ${expected}, got ${actual})`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${testName} - Expected ${expected}, got ${actual}`);
    failed++;
  }
}

async function ensureTestOrg(orgId: string, userId: string): Promise<string> {
  const supabase = getSupabaseServerClient();
  try {
    await supabase.from('users').upsert({
      id: userId,
      email: `test-${userId.slice(0, 8)}@eventgamestudio.com`,
      created_at: new Date().toISOString(),
    });
    await supabase.from('organizations').upsert({
      id: orgId,
      name: `Test Org ${orgId.slice(0, 8)}`,
      slug: `test-org-${orgId.slice(0, 8)}`,
      owner_id: userId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  } catch {
    // Fallback if local memory mode
  }
  return orgId;
}

async function runAllTests() {
  console.log('======================================================');
  console.log(' BLOCKER 3: PREVENT DUPLICATE STRIPE CHECKOUT SESSIONS');
  console.log('======================================================\n');

  const testOrgId = crypto.randomUUID();
  const testUserId = crypto.randomUUID();
  await ensureTestOrg(testOrgId, testUserId);
  await clearOutstandingBalance(testOrgId);

  // --------------------------------------------------------------------------
  // SCENARIO 1: Double-Click Protection
  // --------------------------------------------------------------------------
  console.log('--- Test 1: Double-Click Protection ---');
  _clearInFlightCheckoutSessionsForTests();

  const order1 = await createTopupOrder({
    organizationId: testOrgId,
    userId: testUserId,
    amount: 50.0,
    currency: 'MYR',
  });

  assert(order1 !== null, 'Order 1 created successfully');
  assertEqual(order1.status, 'PENDING', 'Order 1 initial status is PENDING');

  // Simulate two rapid successive clicks (double-click)
  const click1Promise = createPaymentSession({ order: order1, originUrl: 'http://localhost:3000' });
  const click2Promise = createPaymentSession({ order: order1, originUrl: 'http://localhost:3000' });

  const [res1, res2] = await Promise.all([click1Promise, click2Promise]);

  assertEqual(res1.sessionId, res2.sessionId, 'Double-click returns identical sessionId');
  assertEqual(res1.checkoutUrl, res2.checkoutUrl, 'Double-click returns identical checkoutUrl');
  assertEqual(res1.paymentReference, res2.paymentReference, 'Double-click returns identical paymentReference');
  assertEqual(res1.amount, 50.0, 'Session amount is RM50.00');

  const refreshedOrder1 = await getTopupOrderById(order1.id);
  assert(refreshedOrder1 !== null, 'Refreshed order 1 exists');
  assertEqual(
    refreshedOrder1?.metadata?.stripe_session_id,
    res1.sessionId,
    'Database stores exactly the single authoritative session ID'
  );

  // --------------------------------------------------------------------------
  // SCENARIO 2: Two Simultaneous Requests (Promise.all)
  // --------------------------------------------------------------------------
  console.log('\n--- Test 2: Two Simultaneous Requests ---');
  _clearInFlightCheckoutSessionsForTests();

  const order2 = await createTopupOrder({
    organizationId: testOrgId,
    userId: testUserId,
    amount: 100.0,
    currency: 'MYR',
  });

  const [sim1, sim2] = await Promise.all([
    createPaymentSession({ order: order2, originUrl: 'http://localhost:3000' }),
    createPaymentSession({ order: order2, originUrl: 'http://localhost:3000' }),
  ]);

  assertEqual(sim1.sessionId, sim2.sessionId, 'Two simultaneous requests return identical sessionId');
  assertEqual(sim1.checkoutUrl, sim2.checkoutUrl, 'Two simultaneous requests return identical checkoutUrl');
  assert(sim1.sessionId.length > 0, 'Session ID is non-empty');

  // --------------------------------------------------------------------------
  // SCENARIO 3: Repeated Payment Request (Sequential Re-request)
  // --------------------------------------------------------------------------
  console.log('\n--- Test 3: Repeated Payment Request (Re-requesting existing valid session) ---');
  _clearInFlightCheckoutSessionsForTests();

  const order3 = await createTopupOrder({
    organizationId: testOrgId,
    userId: testUserId,
    amount: 75.0,
    currency: 'MYR',
  });

  // Call 1: Initial creation
  const initialSession = await createPaymentSession({ order: order3, originUrl: 'http://localhost:3000' });
  assertEqual(initialSession.sessionCreated, true, 'Initial request creates new session');

  // Call 2: Sequential repeated call (user reloads page or re-clicks Pay after modal was opened)
  const repeatedSession = await createPaymentSession({ order: order3, originUrl: 'http://localhost:3000' });
  assertEqual(repeatedSession.sessionCreated, false, 'Repeated request does NOT create new session (sessionCreated=false)');
  assertEqual(repeatedSession.sessionId, initialSession.sessionId, 'Repeated request reuses identical sessionId');
  assertEqual(repeatedSession.checkoutUrl, initialSession.checkoutUrl, 'Repeated request reuses identical checkoutUrl');
  assertEqual(repeatedSession.message, 'Active valid Stripe Checkout Session reused', 'Confirmation message indicates session reuse');

  // Call 3: Another repeated call
  const thirdSession = await createPaymentSession({ order: order3, originUrl: 'http://localhost:3000' });
  assertEqual(thirdSession.sessionId, initialSession.sessionId, 'Third call still reuses identical sessionId');

  // --------------------------------------------------------------------------
  // SCENARIO 4: Expired Checkout Session
  // --------------------------------------------------------------------------
  console.log('\n--- Test 4: Expired Checkout Session (Replaces expired session safely) ---');
  _clearInFlightCheckoutSessionsForTests();

  const order4 = await createTopupOrder({
    organizationId: testOrgId,
    userId: testUserId,
    amount: 60.0,
    currency: 'MYR',
  });

  const originalSession4 = await createPaymentSession({ order: order4, originUrl: 'http://localhost:3000' });
  assertEqual(originalSession4.sessionCreated, true, 'Original session created');

  // Mark the active checkout session as expired
  const expiredOrder = await expireActiveCheckoutSession(order4.id);
  assert(expiredOrder !== null, 'Order session marked expired');
  assertEqual(expiredOrder?.metadata?.session_status, 'expired', 'Order metadata reflects expired status');

  // Now requesting a session again MUST create a fresh new session
  const freshSession4 = await createPaymentSession({ order: order4, originUrl: 'http://localhost:3000' });
  assertEqual(freshSession4.sessionCreated, true, 'Fresh session created for expired order (sessionCreated=true)');
  assert(
    freshSession4.sessionId !== originalSession4.sessionId,
    'Fresh session has different sessionId than expired session'
  );

  const updatedOrder4 = await getTopupOrderById(order4.id);
  assertEqual(
    updatedOrder4?.metadata?.stripe_session_id,
    freshSession4.sessionId,
    'Database updated with fresh session ID'
  );
  assert(
    Array.isArray(updatedOrder4?.metadata?.previous_sessions) && updatedOrder4.metadata.previous_sessions.length >= 1,
    'Previous expired session archived in metadata'
  );
  assertEqual(
    updatedOrder4?.metadata?.previous_sessions[0]?.sessionId,
    originalSession4.sessionId,
    'Archived session ID matches original expired session'
  );

  // --------------------------------------------------------------------------
  // SCENARIO 5: Cancelled Checkout Session
  // --------------------------------------------------------------------------
  console.log('\n--- Test 5: Cancelled Checkout Session (Replaces cancelled session safely) ---');
  _clearInFlightCheckoutSessionsForTests();

  const order5 = await createTopupOrder({
    organizationId: testOrgId,
    userId: testUserId,
    amount: 80.0,
    currency: 'MYR',
  });

  const originalSession5 = await createPaymentSession({ order: order5, originUrl: 'http://localhost:3000' });
  assertEqual(originalSession5.sessionCreated, true, 'Original session created');

  // Cancel the active session
  const cancelledOrder = await cancelActiveCheckoutSession(order5.id, 'User clicked Cancel in Checkout');
  assert(cancelledOrder !== null, 'Order session marked cancelled');
  assertEqual(cancelledOrder?.metadata?.checkout_cancelled, true, 'Metadata checkout_cancelled is true');

  // Requesting again MUST create a fresh session
  const freshSession5 = await createPaymentSession({ order: order5, originUrl: 'http://localhost:3000' });
  assertEqual(freshSession5.sessionCreated, true, 'Fresh session created after cancellation');
  assert(
    freshSession5.sessionId !== originalSession5.sessionId,
    'Fresh session ID is different from cancelled session ID'
  );

  const updatedOrder5 = await getTopupOrderById(order5.id);
  assertEqual(
    updatedOrder5?.metadata?.stripe_session_id,
    freshSession5.sessionId,
    'Database stores fresh session ID'
  );
  assertEqual(
    updatedOrder5?.metadata?.checkout_cancelled,
    false,
    'checkout_cancelled reset to false on fresh session'
  );

  // --------------------------------------------------------------------------
  // SCENARIO 6: Successful Payment (Cannot checkout already PAID order)
  // --------------------------------------------------------------------------
  console.log('\n--- Test 6: Successful Payment (Rejects checkout on PAID order) ---');
  _clearInFlightCheckoutSessionsForTests();

  const order6 = await createTopupOrder({
    organizationId: testOrgId,
    userId: testUserId,
    amount: 120.0,
    currency: 'MYR',
  });

  const session6 = await createPaymentSession({ order: order6, originUrl: 'http://localhost:3000' });
  assertEqual(session6.sessionCreated, true, 'Session created for order 6');

  // Simulate payment provider webhook marking order as PAID
  const secret = getPaymentWebhookSecret();
  const paymentRef = session6.paymentReference;
  const webhookBody = JSON.stringify({
    id: `evt_succ_${Date.now()}`,
    type: 'payment.succeeded',
    created: Math.floor(Date.now() / 1000),
    data: {
      object: {
        id: paymentRef,
        amount: 120.0,
        currency: 'MYR',
        metadata: {
          order_id: order6.id,
          organization_id: testOrgId,
        },
        status: 'succeeded',
      },
    },
  });
  const { signatureHeader } = generateWebhookSignature(webhookBody, secret);

  const webhookResult = await verifyAndProcessPaymentWebhook({
    rawBody: webhookBody,
    signature: signatureHeader,
  });

  assertEqual(webhookResult.success, true, 'Webhook successfully processed payment');
  const paidOrder6 = await getTopupOrderById(order6.id);
  assertEqual(paidOrder6?.status, 'PAID', 'Order 6 is now PAID');

  // Attempting to create a checkout session for a PAID order MUST throw an error
  let threwErrorOnPaid = false;
  try {
    await createPaymentSession({ order: paidOrder6!, originUrl: 'http://localhost:3000' });
  } catch (err: any) {
    threwErrorOnPaid = true;
    assert(
      err.message.includes('Only PENDING orders can be checked out'),
      'Throws clear error rejecting checkout on PAID order'
    );
  }
  assert(threwErrorOnPaid, 'createPaymentSession threw expected error for PAID order');

  // --------------------------------------------------------------------------
  // SCENARIO 7: Duplicate Webhook (Idempotency prevents duplicate credits)
  // --------------------------------------------------------------------------
  console.log('\n--- Test 7: Duplicate Webhook Idempotency ---');
  const initialBalance = await getWalletBalance(testOrgId);

  // Send the identical webhook again
  const duplicateWebhookResult = await verifyAndProcessPaymentWebhook({
    rawBody: webhookBody,
    signature: signatureHeader,
  });

  assertEqual(duplicateWebhookResult.isDuplicate, true, 'Duplicate webhook identified as isDuplicate=true');
  assertEqual(duplicateWebhookResult.alreadyProcessed, true, 'Duplicate webhook identified as alreadyProcessed=true');

  const balanceAfterDuplicate = await getWalletBalance(testOrgId);
  assertEqual(
    balanceAfterDuplicate.paid_balance,
    initialBalance.paid_balance,
    'Wallet paid balance unchanged after duplicate webhook (zero double-crediting)'
  );

  // --------------------------------------------------------------------------
  // SCENARIO 8: Separate Top-Up Orders (Independent sessions)
  // --------------------------------------------------------------------------
  console.log('\n--- Test 8: Separate Top-Up Orders (Independent sessions created) ---');
  _clearInFlightCheckoutSessionsForTests();

  const [orderA, orderB] = await Promise.all([
    createTopupOrder({
      organizationId: testOrgId,
      userId: testUserId,
      amount: 200.0,
      currency: 'MYR',
    }),
    createTopupOrder({
      organizationId: testOrgId,
      userId: testUserId,
      amount: 300.0,
      currency: 'MYR',
    }),
  ]);

  assert(orderA !== null && orderB !== null, 'Orders A and B created');
  assert(orderA.id !== orderB.id, 'Orders A and B have distinct IDs');

  const [sessionA, sessionB] = await Promise.all([
    createPaymentSession({ order: orderA, originUrl: 'http://localhost:3000' }),
    createPaymentSession({ order: orderB, originUrl: 'http://localhost:3000' }),
  ]);

  assert(sessionA.sessionId !== sessionB.sessionId, 'Order A and Order B receive distinct session IDs');
  assert(sessionA.checkoutUrl !== sessionB.checkoutUrl, 'Order A and Order B receive distinct checkout URLs');
  assert(sessionA.paymentReference !== sessionB.paymentReference, 'Order A and Order B receive distinct payment references');
  assertEqual(sessionA.amount, 200.0, 'Session A has correct amount');
  assertEqual(sessionB.amount, 300.0, 'Session B has correct amount');

  // --------------------------------------------------------------------------
  // SCENARIO 9: High-Concurrency Stress Test (5 Simultaneous Requests)
  // --------------------------------------------------------------------------
  console.log('\n--- Test 9: High-Concurrency Stress Test (5 simultaneous clicks) ---');
  _clearInFlightCheckoutSessionsForTests();

  const orderStress = await createTopupOrder({
    organizationId: testOrgId,
    userId: testUserId,
    amount: 250.0,
    currency: 'MYR',
  });

  const stressResults = await Promise.all([
    createPaymentSession({ order: orderStress, originUrl: 'http://localhost:3000' }),
    createPaymentSession({ order: orderStress, originUrl: 'http://localhost:3000' }),
    createPaymentSession({ order: orderStress, originUrl: 'http://localhost:3000' }),
    createPaymentSession({ order: orderStress, originUrl: 'http://localhost:3000' }),
    createPaymentSession({ order: orderStress, originUrl: 'http://localhost:3000' }),
  ]);

  const firstSessionId = stressResults[0].sessionId;
  const allIdentical = stressResults.every((r) => r.sessionId === firstSessionId);
  assert(allIdentical, 'All 5 concurrent requests returned the exact same session ID');

  const stressOrderInDb = await getTopupOrderById(orderStress.id);
  assertEqual(
    stressOrderInDb?.metadata?.stripe_session_id,
    firstSessionId,
    'Database accurately stores single authoritative session'
  );

  // --------------------------------------------------------------------------
  // SUMMARY
  // --------------------------------------------------------------------------
  console.log('\n======================================================');
  console.log(` RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('======================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runAllTests().catch((err) => {
  console.error('Test runner fatal error:', err);
  process.exit(1);
});
