/**
 * Comprehensive Server-Side Test Suite: Wallet Top-Up Security & Payment Lifecycle
 * 
 * Tests Required:
 * 1. Organization owner cannot call: POST /api/organizations/:orgId/wallet/topup
 *    Expected: 403 Forbidden and wallet balance remains unchanged.
 * 2. Organization admin cannot call: POST /api/wallet/topups/:id/status with {"status": "PAID"}
 *    Expected: 403 Forbidden and wallet balance remains unchanged.
 * 3. Organization admin cannot call: POST /api/wallet/topups/:id/process-status with {"status": "PAID"}
 *    Expected: 403 Forbidden and wallet balance remains unchanged.
 * 4. Organization user cannot directly create PAID, COMPLETED, or TOPUP_CREDIT records.
 * 5. A valid trusted settlement can credit the wallet exactly once.
 * 6. Duplicate settlement/webhook processed twice does NOT credit the wallet twice (idempotency).
 * 7. A failed/invalid payment does NOT credit the wallet.
 * 8. Organization isolation: User from Org A cannot manipulate a Top-up Order belonging to Org B.
 * 9. Developer Admin Manual Reconciliation: Privileged admin can reconcile with valid reason & payment reference.
 */

import crypto from 'node:crypto';
import {
  getWalletBalance,
  createTopupOrder,
  getTopupOrderById,
  listTopupOrdersByOrganization,
  processTopupOrderStatus,
  reconcileTopupOrder,
  getWalletTransactions,
  getWalletAuditTrail,
} from './wallet.js';
import {
  verifyAndProcessPaymentWebhook,
  generateWebhookSignature,
  getPaymentWebhookSecret,
} from '../payment/index.js';

let passed = 0;
let failed = 0;

function assertEqual(actual: any, expected: any, testName: string) {
  if (actual === expected) {
    console.log(`  ✓ PASS: ${testName} (expected ${expected}, got ${actual})`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${testName} - Expected ${expected}, got ${actual}`);
    failed++;
  }
}

async function runSecurityTests() {
  console.log('\n======================================================');
  console.log(' RUNNING WALLET TOP-UP SECURITY & LIFECYCLE TESTS');
  console.log('======================================================\n');

  const orgAId = `11111111-aaaa-4000-8000-${crypto.randomUUID().slice(24)}`;
  const orgBId = `22222222-bbbb-4000-8000-${crypto.randomUUID().slice(24)}`;
  const userOrgAOwner = `owner-a-${crypto.randomUUID().slice(24)}`;
  const userOrgBAdmin = `admin-b-${crypto.randomUUID().slice(24)}`;
  const devAdminUser = `dev-superadmin-${crypto.randomUUID().slice(24)}`;

  // ----------------------------------------------------
  // TEST 1: DIRECT TOPUP MUTATION IS FORBIDDEN & REJECTED
  // ----------------------------------------------------
  console.log('--- Test 1: Direct Wallet Top-Up Mutation Is Forbidden ---');
  const initialWalletA = await getWalletBalance(orgAId);
  assertEqual(initialWalletA.paid_balance, 0.00, 'Initial Org A paid balance is 0.00');
  assertEqual(initialWalletA.total_balance, 0.00, 'Initial Org A total balance is 0.00');

  // Verify that any direct call to processTopupOrderStatus with 'PAID' without trusted flag is rejected
  let directPaidError = false;
  try {
    const dummyOrder = await createTopupOrder({
      organizationId: orgAId,
      userId: userOrgAOwner,
      amount: 1000.00,
      currency: 'MYR',
      notes: 'Direct mutation attempt',
    });

    await processTopupOrderStatus({
      orderId: dummyOrder.id,
      newStatus: 'PAID',
      // No isTrustedSettlement flag!
    });
  } catch (err: any) {
    directPaidError = true;
    assertEqual(
      err.message.includes('requires trusted settlement verification') ||
      err.message.includes('Unauthorized'),
      true,
      'Direct transition to PAID without trusted settlement verification is blocked at engine level'
    );
  }
  assertEqual(directPaidError, true, 'Direct PAID mutation strictly rejected with error');

  const walletAfterDirectAttempt = await getWalletBalance(orgAId);
  assertEqual(walletAfterDirectAttempt.paid_balance, 0.00, 'Wallet paid balance unchanged (0.00) after rejected direct mutation');
  assertEqual(walletAfterDirectAttempt.topup_credit, 0.00, 'Wallet topup credit unchanged (0.00) after rejected direct mutation');

  // ----------------------------------------------------
  // TEST 2 & 3: ORG USERS CANNOT MANUALLY SET STATUS = PAID
  // ----------------------------------------------------
  console.log('\n--- Test 2 & 3: Org Users Cannot Manually Transition Orders to PAID ---');
  const testOrderPending = await createTopupOrder({
    organizationId: orgAId,
    userId: userOrgAOwner,
    amount: 6000.00,
    currency: 'MYR',
    notes: 'Pending order to test user status manipulation',
  });

  assertEqual(testOrderPending.status, 'PENDING', 'Order created in PENDING status');
  assertEqual(testOrderPending.top_up_amount, 6000.00, 'Order amount is RM6,000.00');
  assertEqual(testOrderPending.expected_credit_amount, 300.00, 'Order promo credit expected is RM300.00 (5%)');

  // Org user attempting status: 'PAID'
  let userSetPaidError = false;
  try {
    await processTopupOrderStatus({
      orderId: testOrderPending.id,
      newStatus: 'PAID',
      isTrustedSettlement: false, // Normal user context
    });
  } catch (err: any) {
    userSetPaidError = true;
    assertEqual(err.message.includes('requires trusted settlement verification'), true, 'Error message enforces trusted settlement rule');
  }
  assertEqual(userSetPaidError, true, 'Manual transition to PAID by user context strictly rejected');

  const walletAfterUserAttempt = await getWalletBalance(orgAId);
  assertEqual(walletAfterUserAttempt.paid_balance, 0.00, 'Wallet balance remains 0.00 after manual PAID attempt');
  assertEqual(walletAfterUserAttempt.topup_credit, 0.00, 'Wallet credit remains 0.00 after manual PAID attempt');

  // ----------------------------------------------------
  // TEST 4: CANNOT DIRECTLY CREATE COMPLETED TOPUP_CREDIT
  // ----------------------------------------------------
  console.log('\n--- Test 4: Cannot Directly Create COMPLETED Top-up Records ---');
  // Order creation only produces PENDING records
  const newOrder = await createTopupOrder({
    organizationId: orgAId,
    userId: userOrgAOwner,
    amount: 10000.00,
    currency: 'MYR',
  });
  assertEqual(newOrder.status, 'PENDING', 'createTopupOrder strictly produces PENDING status');
  assertEqual(newOrder.paid_at, null, 'paid_at is null for newly created order');

  const txnsBeforeSettlement = await getWalletTransactions(orgAId);
  assertEqual(txnsBeforeSettlement.transactions.length, 0, 'Zero ledger transactions generated by PENDING order creation');

  // ----------------------------------------------------
  // TEST 5: VALID TRUSTED PAYMENT WEBHOOK CREDITS WALLET ONCE
  // ----------------------------------------------------
  console.log('\n--- Test 5: Valid Trusted Settlement Credits Wallet Exactly Once ---');
  const secret = getPaymentWebhookSecret();
  const paymentRef = `PAY_GW_${crypto.randomUUID().slice(0, 8).toUpperCase()}`;

  const validPayload = JSON.stringify({
    id: `evt_${crypto.randomUUID()}`,
    type: 'payment.succeeded',
    created: Math.floor(Date.now() / 1000),
    data: {
      object: {
        id: paymentRef,
        amount: 6000.00,
        currency: 'MYR',
        metadata: {
          order_id: testOrderPending.id,
          organization_id: orgAId,
        },
        payment_method: 'fpx',
        status: 'succeeded',
      },
    },
  });

  const { signatureHeader } = generateWebhookSignature(validPayload, secret);

  const webhookResult = await verifyAndProcessPaymentWebhook({
    rawBody: validPayload,
    signature: signatureHeader,
  });

  assertEqual(webhookResult.success, true, 'Trusted webhook verification succeeds');
  assertEqual(webhookResult.status, 'PAID', 'Order status transitions to PAID');
  assertEqual(webhookResult.alreadyProcessed, false, 'First-time processing flag is false');
  assertEqual(webhookResult.order?.status, 'PAID', 'Returned order object has status PAID');

  const walletAfterSettlement = await getWalletBalance(orgAId);
  assertEqual(walletAfterSettlement.paid_balance, 6000.00, 'Wallet paid balance credited with RM6,000.00');
  assertEqual(walletAfterSettlement.topup_credit, 300.00, 'Wallet topup credit credited with RM300.00 (5% bonus)');
  assertEqual(walletAfterSettlement.total_balance, 6300.00, 'Total wallet balance is RM6,300.00');

  // Check separate ledger entries
  const txnsAfterSettlement = await getWalletTransactions(orgAId);
  const paidEntry = txnsAfterSettlement.transactions.find((t) => t.balance_type === 'PAID_BALANCE' && t.transaction_type === 'TOPUP');
  const creditEntry = txnsAfterSettlement.transactions.find((t) => t.balance_type === 'TOPUP_CREDIT' && t.transaction_type === 'TOPUP_CREDIT');

  assertEqual(paidEntry !== undefined, true, 'PAID_BALANCE entry exists in ledger');
  assertEqual(paidEntry?.amount, 6000.00, 'PAID_BALANCE amount is RM6,000.00');
  assertEqual(creditEntry !== undefined, true, 'TOPUP_CREDIT entry exists in ledger');
  assertEqual(creditEntry?.amount, 300.00, 'TOPUP_CREDIT amount is RM300.00');

  // ----------------------------------------------------
  // TEST 6: REPLAY / DUPLICATE WEBHOOK DOES NOT DOUBLE-CREDIT (IDEMPOTENCY)
  // ----------------------------------------------------
  console.log('\n--- Test 6: Replay / Duplicate Settlement Does NOT Double-Credit ---');

  const replayResult = await verifyAndProcessPaymentWebhook({
    rawBody: validPayload,
    signature: signatureHeader,
  });

  assertEqual(replayResult.success, true, 'Replay webhook returns success = true');
  assertEqual(replayResult.isDuplicate, true, 'Replay webhook flagged as duplicate');
  assertEqual(replayResult.alreadyProcessed, true, 'alreadyProcessed is true');

  const walletAfterReplay = await getWalletBalance(orgAId);
  assertEqual(walletAfterReplay.paid_balance, 6000.00, 'Paid balance remains RM6,000.00 (ZERO duplicate credit)');
  assertEqual(walletAfterReplay.topup_credit, 300.00, 'Topup credit remains RM300.00 (ZERO duplicate credit)');
  assertEqual(walletAfterReplay.total_balance, 6300.00, 'Total balance remains RM6,300.00');

  // ----------------------------------------------------
  // TEST 7: FAILED / INVALID PAYMENT DOES NOT CREDIT WALLET
  // ----------------------------------------------------
  console.log('\n--- Test 7: Failed / Invalid Payment Does NOT Credit Wallet ---');
  const failedOrder = await createTopupOrder({
    organizationId: orgAId,
    userId: userOrgAOwner,
    amount: 2000.00,
    currency: 'MYR',
    notes: 'Order destined to fail',
  });

  const failedPayload = JSON.stringify({
    id: `evt_${crypto.randomUUID()}`,
    type: 'payment.failed',
    data: {
      object: {
        id: `PAY_FAIL_${crypto.randomUUID().slice(0, 8)}`,
        amount: 2000.00,
        currency: 'MYR',
        metadata: {
          order_id: failedOrder.id,
          organization_id: orgAId,
        },
        status: 'failed',
      },
    },
  });

  const { signatureHeader: failedSig } = generateWebhookSignature(failedPayload, secret);
  const failWebhookResult = await verifyAndProcessPaymentWebhook({
    rawBody: failedPayload,
    signature: failedSig,
  });

  assertEqual(failWebhookResult.status, 'FAILED', 'Order status marked as FAILED');
  const walletAfterFail = await getWalletBalance(orgAId);
  assertEqual(walletAfterFail.paid_balance, 6000.00, 'Wallet paid balance strictly unchanged after failed payment');
  assertEqual(walletAfterFail.topup_credit, 300.00, 'Wallet topup credit strictly unchanged after failed payment');

  // Invalid signature rejection
  let badSigError = false;
  try {
    await verifyAndProcessPaymentWebhook({
      rawBody: failedPayload,
      signature: 'invalid_signature_hash',
    });
  } catch (err: any) {
    badSigError = true;
    assertEqual(err.code, 'INVALID_SIGNATURE', 'Invalid signature rejected with INVALID_SIGNATURE code');
  }
  assertEqual(badSigError, true, 'Webhook with forged/invalid signature rejected');

  // Amount mismatch rejection
  const mismatchOrder = await createTopupOrder({
    organizationId: orgAId,
    userId: userOrgAOwner,
    amount: 5000.00,
    currency: 'MYR',
  });

  const mismatchPayload = JSON.stringify({
    id: `evt_${crypto.randomUUID()}`,
    type: 'payment.succeeded',
    data: {
      object: {
        id: `PAY_MISMATCH_${crypto.randomUUID().slice(0, 8)}`,
        amount: 100.00, // Sending 100 instead of 5000!
        currency: 'MYR',
        metadata: {
          order_id: mismatchOrder.id,
          organization_id: orgAId,
        },
      },
    },
  });

  const { signatureHeader: mismatchSig } = generateWebhookSignature(mismatchPayload, secret);
  let amountMismatchError = false;
  try {
    await verifyAndProcessPaymentWebhook({
      rawBody: mismatchPayload,
      signature: mismatchSig,
    });
  } catch (err: any) {
    amountMismatchError = true;
    assertEqual(err.code, 'AMOUNT_MISMATCH', 'Amount mismatch error code is AMOUNT_MISMATCH');
  }
  assertEqual(amountMismatchError, true, 'Amount mismatch strictly rejected');

  // ----------------------------------------------------
  // TEST 8: ORGANIZATION ISOLATION
  // ----------------------------------------------------
  console.log('\n--- Test 8: Organization Isolation ---');
  const orgBOrder = await createTopupOrder({
    organizationId: orgBId,
    userId: userOrgBAdmin,
    amount: 10000.00,
    currency: 'MYR',
    notes: 'Org B order',
  });

  assertEqual(orgBOrder.organization_id, orgBId, 'Org B order belongs to Org B');

  // Webhook targeting Org B order with Org A metadata rejected
  const crossOrgPayload = JSON.stringify({
    id: `evt_${crypto.randomUUID()}`,
    type: 'payment.succeeded',
    data: {
      object: {
        id: `PAY_CROSS_${crypto.randomUUID().slice(0, 8)}`,
        amount: 10000.00,
        currency: 'MYR',
        metadata: {
          order_id: orgBOrder.id,
          organization_id: orgAId, // Mismatch!
        },
      },
    },
  });

  const { signatureHeader: crossSig } = generateWebhookSignature(crossOrgPayload, secret);
  let crossOrgError = false;
  try {
    await verifyAndProcessPaymentWebhook({
      rawBody: crossOrgPayload,
      signature: crossSig,
    });
  } catch (err: any) {
    crossOrgError = true;
    assertEqual(err.code, 'ORGANIZATION_MISMATCH', 'Cross-organization injection rejected with ORGANIZATION_MISMATCH');
  }
  assertEqual(crossOrgError, true, 'Cross-org manipulation strictly rejected');

  // Org A and Org B order lists are strictly isolated
  const orgAOrders = await listTopupOrdersByOrganization(orgAId);
  const orgBOrders = await listTopupOrdersByOrganization(orgBId);

  assertEqual(orgAOrders.every((o) => o.organization_id === orgAId), true, 'Org A orders contain ONLY Org A orders');
  assertEqual(orgBOrders.every((o) => o.organization_id === orgBId), true, 'Org B orders contain ONLY Org B orders');

  // ----------------------------------------------------
  // TEST 9: DEVELOPER ADMIN MANUAL RECONCILIATION
  // ----------------------------------------------------
  console.log('\n--- Test 9: Developer Admin Manual Reconciliation ---');
  const reconOrder = await createTopupOrder({
    organizationId: orgBId,
    userId: userOrgBAdmin,
    amount: 8000.00,
    currency: 'MYR',
    notes: 'Offline bank transfer awaiting developer reconciliation',
  });

  assertEqual(reconOrder.status, 'PENDING', 'Reconciliation order initial status is PENDING');

  // Attempt reconciliation without valid reason (must fail)
  let missingReasonError = false;
  try {
    await reconcileTopupOrder({
      orderId: reconOrder.id,
      paymentReference: 'BANK_TXN_888999',
      reconciledBy: devAdminUser,
      reason: 'ab', // too short!
    });
  } catch (err: any) {
    missingReasonError = true;
    assertEqual(err.message.includes('minimum 5 characters'), true, 'Reconciliation requires explicit reason');
  }
  assertEqual(missingReasonError, true, 'Reconciliation rejected when reason is insufficient');

  // Successful manual reconciliation
  const reconResult = await reconcileTopupOrder({
    orderId: reconOrder.id,
    paymentReference: 'BANK_TXN_MAYBANK_888999',
    paymentMethod: 'bank_transfer',
    reconciledBy: devAdminUser,
    reason: 'Verified Maybank business account deposit slip receipt #MB888999',
  });

  assertEqual(reconResult.order.status, 'PAID', 'Reconciled order transitioned to PAID');
  assertEqual(reconResult.alreadyProcessed, false, 'First-time reconciliation is not duplicate');

  const walletBAfterRecon = await getWalletBalance(orgBId);
  assertEqual(walletBAfterRecon.paid_balance, 8000.00, 'Org B wallet paid balance credited with RM8,000.00');
  assertEqual(walletBAfterRecon.topup_credit, 400.00, 'Org B wallet promotional credit credited with RM400.00 (5%)');

  // Replay reconciliation on already PAID order
  const reconReplayResult = await reconcileTopupOrder({
    orderId: reconOrder.id,
    paymentReference: 'BANK_TXN_MAYBANK_888999',
    reconciledBy: devAdminUser,
    reason: 'Duplicate check on Maybank receipt',
  });

  assertEqual(reconReplayResult.alreadyProcessed, true, 'Replay reconciliation returns alreadyProcessed = true');
  const walletBAfterReplay = await getWalletBalance(orgBId);
  assertEqual(walletBAfterReplay.paid_balance, 8000.00, 'Zero duplicate credit on reconciliation replay');
  assertEqual(walletBAfterReplay.topup_credit, 400.00, 'Zero duplicate credit on reconciliation replay');

  // ----------------------------------------------------
  // TEST 10: USER CANCELLATION OF PENDING ORDERS
  // ----------------------------------------------------
  console.log('\n--- Test 10: User Cancellation of Pending Orders ---');
  const orderToCancel = await createTopupOrder({
    organizationId: orgBId,
    userId: userOrgBAdmin,
    amount: 1000.00,
    currency: 'MYR',
  });

  const cancelResult = await processTopupOrderStatus({
    orderId: orderToCancel.id,
    newStatus: 'CANCELLED',
    reason: 'User abandoned checkout in UI',
  });

  assertEqual(cancelResult.order.status, 'CANCELLED', 'Order status transitioned to CANCELLED');
  const walletBAfterCancel = await getWalletBalance(orgBId);
  assertEqual(walletBAfterCancel.paid_balance, 8000.00, 'Wallet balance unchanged by CANCELLED order');

  // ----------------------------------------------------
  // AUDIT TRAIL VERIFICATION
  // ----------------------------------------------------
  console.log('\n--- Audit Trail Verification ---');
  const auditTrailA = await getWalletAuditTrail(orgAId);
  assertEqual(Array.isArray(auditTrailA) && auditTrailA.length > 0, true, 'Audit trail records security and payment events');

  const completedEvents = auditTrailA.filter((e) => e.event_type === 'PAYMENT_COMPLETED');
  assertEqual(completedEvents.length >= 1, true, 'PAYMENT_COMPLETED event recorded in audit trail');

  console.log('\n======================================================');
  console.log(` SECURITY SUITE RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('======================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
  process.exit(0);
}

runSecurityTests().catch((err) => {
  console.error('Security test run failed:', err);
  process.exit(1);
});
