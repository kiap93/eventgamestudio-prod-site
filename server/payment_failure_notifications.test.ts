import assert from 'node:assert';
import crypto from 'node:crypto';
import { createUser } from './db/users.js';
import { createOrganization } from './db/organizations.js';
import { createTheme } from './db/themes.js';
import { ensureDefaultGame } from './db/games.js';
import { createEvent, createEventWithAtomicPayment } from './db/events.js';
import {
  createTopupOrder,
  processTopupOrderStatus,
  processEventPayment,
  getWalletBalance,
  createTopup,
} from './db/wallet.js';
import { listNotifications } from './db/notifications.js';
import {
  dispatchPaymentFailed,
  dispatchEventPaymentFailed,
  dispatchPaymentLifecycleTransition,
  dispatchNotificationEvent,
} from './notifications/dispatcher.js';

async function runPaymentFailureNotificationTests() {
  console.log('================================================================');
  console.log(' RUNNING PAYMENT FAILURE & LIFECYCLE NOTIFICATION TESTS');
  console.log('================================================================');

  const testUser = await createUser({
    email: `payment-notify-${crypto.randomUUID().slice(0, 8)}@example.com`,
    name: 'Notification Test User',
  });

  const org = await createOrganization({
    name: `Payment Notify Corp ${Date.now()}`,
    owner_id: testUser.id,
  });

  const game = await ensureDefaultGame(org.id, 'Failure Test Game');
  const theme = await createTheme({
    organization_id: org.id,
    game_id: game.id,
    name: 'Failure Test Theme',
  });

  // -------------------------------------------------------------------------
  // TEST 1: Direct dispatchPaymentFailed
  // -------------------------------------------------------------------------
  console.log('--- Test 1: Direct dispatchPaymentFailed ---');
  const paymentFailedNotifs = await dispatchPaymentFailed({
    organizationId: org.id,
    recipientUserId: testUser.id,
    referenceId: `direct_fail_${Date.now()}`,
    amount: 1400,
    currency: 'MYR',
    subject: 'Direct Top-up Order',
    reason: 'Card was declined by issuing bank',
  });

  assert.strictEqual(paymentFailedNotifs.length, 1);
  assert.strictEqual(paymentFailedNotifs[0].type, 'payment_failed');
  assert.ok(paymentFailedNotifs[0].message.includes('Card was declined by issuing bank'));
  assert.strictEqual(paymentFailedNotifs[0].action_url, '/wallet');
  console.log('  ✓ dispatchPaymentFailed correctly created in-app notification with declined reason and /wallet actionUrl');

  // -------------------------------------------------------------------------
  // TEST 2: Direct dispatchEventPaymentFailed
  // -------------------------------------------------------------------------
  console.log('--- Test 2: Direct dispatchEventPaymentFailed ---');
  const eventFailedNotifs = await dispatchEventPaymentFailed({
    organizationId: org.id,
    recipientUserId: testUser.id,
    eventId: 'event_fail_test_123',
    eventName: 'Annual Gala 2026',
    amount: 1400,
    currency: 'MYR',
    reason: 'Insufficient wallet balance',
  });

  assert.strictEqual(eventFailedNotifs.length, 1);
  assert.strictEqual(eventFailedNotifs[0].type, 'event_payment_failed');
  assert.ok(eventFailedNotifs[0].message.includes('Annual Gala 2026'));
  assert.ok(eventFailedNotifs[0].message.includes('Insufficient wallet balance'));
  assert.strictEqual(eventFailedNotifs[0].action_url, '/events');
  console.log('  ✓ dispatchEventPaymentFailed correctly created notification with event name and /events actionUrl');

  // -------------------------------------------------------------------------
  // TEST 3: dispatchPaymentLifecycleTransition (PENDING -> SUCCESS, FAILED, EXPIRED, CANCELLED)
  // -------------------------------------------------------------------------
  console.log('--- Test 3: dispatchPaymentLifecycleTransition state machine ---');

  // 3a. Transition to PAID (SUCCESS)
  const paidNotifs = await dispatchPaymentLifecycleTransition({
    previousStatus: 'PENDING',
    newStatus: 'PAID',
    organizationId: org.id,
    recipientUserId: testUser.id,
    referenceId: `trans_paid_${Date.now()}`,
    orderId: 'order_paid_123',
    amount: 500,
    currency: 'MYR',
  });
  assert.strictEqual(paidNotifs.length, 1);
  assert.strictEqual(paidNotifs[0].type, 'payment_success');
  console.log('  ✓ PENDING -> PAID dispatched PAYMENT_SUCCESS notification');

  // 3b. Transition to FAILED
  const failedNotifs = await dispatchPaymentLifecycleTransition({
    previousStatus: 'PENDING',
    newStatus: 'FAILED',
    organizationId: org.id,
    recipientUserId: testUser.id,
    referenceId: `trans_fail_${Date.now()}`,
    orderId: 'order_fail_123',
    amount: 600,
    currency: 'MYR',
    reason: 'Gateway timeout',
  });
  assert.strictEqual(failedNotifs.length, 1);
  assert.strictEqual(failedNotifs[0].type, 'payment_failed');
  assert.ok(failedNotifs[0].message.includes('Gateway timeout'));
  console.log('  ✓ PENDING -> FAILED dispatched PAYMENT_FAILED notification with failure reason');

  // 3c. Transition to EXPIRED
  const expiredNotifs = await dispatchPaymentLifecycleTransition({
    previousStatus: 'PENDING',
    newStatus: 'EXPIRED',
    organizationId: org.id,
    recipientUserId: testUser.id,
    referenceId: `trans_exp_${Date.now()}`,
    orderId: 'order_exp_123',
    amount: 700,
    currency: 'MYR',
  });
  assert.strictEqual(expiredNotifs.length, 1);
  assert.strictEqual(expiredNotifs[0].type, 'payment_failed');
  assert.strictEqual(expiredNotifs[0].title, 'Payment Session Expired');
  assert.ok(expiredNotifs[0].message.includes('expired'));
  console.log('  ✓ PENDING -> EXPIRED dispatched PAYMENT_FAILED notification with "Payment Session Expired" title');

  // 3d. Transition to CANCELLED
  const cancelledNotifs = await dispatchPaymentLifecycleTransition({
    previousStatus: 'PENDING',
    newStatus: 'CANCELLED',
    organizationId: org.id,
    recipientUserId: testUser.id,
    referenceId: `trans_canc_${Date.now()}`,
    orderId: 'order_canc_123',
    amount: 800,
    currency: 'MYR',
  });
  assert.strictEqual(cancelledNotifs.length, 1);
  assert.strictEqual(cancelledNotifs[0].type, 'payment_failed');
  assert.strictEqual(cancelledNotifs[0].title, 'Payment Cancelled');
  assert.ok(cancelledNotifs[0].message.includes('cancelled'));
  console.log('  ✓ PENDING -> CANCELLED dispatched PAYMENT_FAILED notification with "Payment Cancelled" title');

  // 3e. Event payment failure transition
  const eventFailTransitionNotifs = await dispatchPaymentLifecycleTransition({
    previousStatus: 'PENDING',
    newStatus: 'FAILED',
    organizationId: org.id,
    recipientUserId: testUser.id,
    referenceId: `trans_event_${Date.now()}`,
    eventId: 'event_transition_999',
    eventName: 'Summer Fest',
    amount: 1400,
    currency: 'MYR',
    reason: 'Card verification failed',
  });
  assert.strictEqual(eventFailTransitionNotifs.length, 1);
  assert.strictEqual(eventFailTransitionNotifs[0].type, 'event_payment_failed');
  assert.ok(eventFailTransitionNotifs[0].message.includes('Summer Fest'));
  console.log('  ✓ Event transition dispatched EVENT_PAYMENT_FAILED notification');

  // -------------------------------------------------------------------------
  // TEST 4: Top-up Order status transitions via processTopupOrderStatus
  // -------------------------------------------------------------------------
  console.log('--- Test 4: processTopupOrderStatus failure status transitions ---');

  // 4a. Order transitions to FAILED
  const failOrder = await createTopupOrder({
    organizationId: org.id,
    userId: testUser.id,
    amount: 500,
    currency: 'MYR',
    paymentMethod: 'hitpay',
  });

  const failResult = await processTopupOrderStatus({
    orderId: failOrder.id,
    newStatus: 'FAILED',
    reason: 'Payment intent abandoned',
    processedBy: testUser.id,
  });
  assert.strictEqual(failResult.order.status, 'FAILED');

  const userNotifsAfterFail = await listNotifications({ userId: testUser.id });
  const matchingFailNotif = userNotifsAfterFail.notifications.find(
    (n) => n.metadata?.order_id === failOrder.id && n.type === 'payment_failed'
  );
  assert.ok(matchingFailNotif, 'Should have received payment_failed notification for failed order');
  console.log('  ✓ processTopupOrderStatus dispatched notification when order marked FAILED');

  // 4b. Order transitions to CANCELLED
  const cancelOrder = await createTopupOrder({
    organizationId: org.id,
    userId: testUser.id,
    amount: 750,
    currency: 'MYR',
    paymentMethod: 'hitpay',
  });

  const cancelResult = await processTopupOrderStatus({
    orderId: cancelOrder.id,
    newStatus: 'CANCELLED',
    reason: 'User closed payment window',
    processedBy: testUser.id,
  });
  assert.strictEqual(cancelResult.order.status, 'CANCELLED');

  const userNotifsAfterCancel = await listNotifications({ userId: testUser.id });
  const matchingCancelNotif = userNotifsAfterCancel.notifications.find(
    (n) => n.metadata?.order_id === cancelOrder.id && n.type === 'payment_failed'
  );
  assert.ok(matchingCancelNotif, 'Should have received payment_failed notification for cancelled order');
  assert.strictEqual(matchingCancelNotif.title, 'Payment Cancelled');
  console.log('  ✓ processTopupOrderStatus dispatched "Payment Cancelled" notification when order marked CANCELLED');

  // 4c. Order transitions to EXPIRED
  const expireOrder = await createTopupOrder({
    organizationId: org.id,
    userId: testUser.id,
    amount: 1000,
    currency: 'MYR',
    paymentMethod: 'hitpay',
  });

  const expireResult = await processTopupOrderStatus({
    orderId: expireOrder.id,
    newStatus: 'EXPIRED',
    reason: 'Checkout window timed out after 30 minutes',
    processedBy: testUser.id,
  });
  assert.strictEqual(expireResult.order.status, 'EXPIRED');

  const userNotifsAfterExpire = await listNotifications({ userId: testUser.id });
  const matchingExpireNotif = userNotifsAfterExpire.notifications.find(
    (n) => n.metadata?.order_id === expireOrder.id && n.type === 'payment_failed'
  );
  assert.ok(matchingExpireNotif, 'Should have received payment_failed notification for expired order');
  assert.strictEqual(matchingExpireNotif.title, 'Payment Session Expired');
  console.log('  ✓ processTopupOrderStatus dispatched "Payment Session Expired" notification when order marked EXPIRED');

  // -------------------------------------------------------------------------
  // TEST 5: processEventPayment failure dispatches EVENT_PAYMENT_FAILED & INSUFFICIENT_BALANCE
  // -------------------------------------------------------------------------
  console.log('--- Test 5: processEventPayment failure dispatches EVENT_PAYMENT_FAILED ---');
  const unpaidEvent = await createEvent({
    organization_id: org.id,
    game_theme_id: theme.id,
    name: 'Unpaid Gala',
    event_date: '2026-11-01',
    start_date: '2026-11-01',
    end_date: '2026-11-01',
    starts_at: '2026-11-01T00:00:00.000Z',
    expires_at: '2026-11-01T23:59:59.999Z',
    event_price: 1400,
  });

  // Current wallet balance is 0, so processEventPayment must reject with INSUFFICIENT_BALANCE
  let rejected = false;
  try {
    await processEventPayment({
      organizationId: org.id,
      eventId: unpaidEvent.id,
      paymentMode: 'FULL_PAID',
      createdBy: testUser.id,
    });
  } catch (err: any) {
    rejected = true;
    assert.ok(err.message.toLowerCase().includes('insufficient') || err.code === 'INSUFFICIENT_BALANCE');
  }
  assert.ok(rejected, 'processEventPayment should have rejected due to zero balance');

  const userNotifsAfterEventFail = await listNotifications({ userId: testUser.id });
  const eventFailNotif = userNotifsAfterEventFail.notifications.find(
    (n) => n.type === 'event_payment_failed' && n.entity_id === unpaidEvent.id
  );
  assert.ok(eventFailNotif, 'Should have received event_payment_failed notification for event');
  assert.strictEqual(eventFailNotif.action_url, '/events');
  console.log('  ✓ processEventPayment dispatched EVENT_PAYMENT_FAILED notification when payment failed');

  // -------------------------------------------------------------------------
  // TEST 6: createEventWithAtomicPayment insufficient balance dispatches failure
  // -------------------------------------------------------------------------
  console.log('--- Test 6: createEventWithAtomicPayment balance check failure ---');
  let atomicCreateRejected = false;
  try {
    await createEventWithAtomicPayment({
      organization_id: org.id,
      game_id: game.id,
      game_theme_id: theme.id,
      name: 'Unfunded Conference',
      event_date: '2026-11-15',
      start_date: '2026-11-15',
      end_date: '2026-11-15',
      starts_at: '2026-11-15T00:00:00.000Z',
      expires_at: '2026-11-15T23:59:59.999Z',
      payment_mode: 'FULL_PAID',
      created_by: testUser.id,
    });
  } catch (err: any) {
    atomicCreateRejected = true;
    assert.strictEqual(err.code, 'INSUFFICIENT_BALANCE');
  }
  assert.ok(atomicCreateRejected, 'createEventWithAtomicPayment should reject when balance is 0');

  const userNotifsAfterAtomicFail = await listNotifications({ userId: testUser.id });
  const unfundedEventNotif = userNotifsAfterAtomicFail.notifications.find(
    (n) => n.type === 'event_payment_failed' && n.message.includes('Unfunded Conference')
  );
  assert.ok(unfundedEventNotif, 'Should have received event_payment_failed notification for Unfunded Conference');
  console.log('  ✓ createEventWithAtomicPayment dispatched EVENT_PAYMENT_FAILED on insufficient balance');

  console.log('================================================================');
  console.log(' ALL PAYMENT FAILURE NOTIFICATION TESTS PASSED SUCCESSFULLY!');
  console.log('================================================================');
}

runPaymentFailureNotificationTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
