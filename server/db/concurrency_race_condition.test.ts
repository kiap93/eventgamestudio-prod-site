import assert from 'node:assert';
import { createOrganization } from './organizations.js';
import { getWalletBalance, createTopupOrder, processTopupOrderStatus } from './wallet.js';
import { createEventWithAtomicPayment } from './events.js';
import { createTheme } from './themes.js';
import { ensureDefaultGame } from './games.js';

async function testConcurrentEventCreation() {
  console.log('--- STARTING CONCURRENCY & RACE CONDITION EVENT CREATION TEST ---');

  // Setup Org with RM600 paid balance + RM800 Welcome Credit = exactly 1 event (RM1400)
  const org = await createOrganization({
    name: 'Concurrency Test Corp ' + Date.now(),
    owner_id: '4c857d15-ab93-45a6-8de5-7858ab4d6bd2',
  });

  const order = await createTopupOrder({
    organizationId: org.id,
    userId: '4c857d15-ab93-45a6-8de5-7858ab4d6bd2',
    amount: 600,
    currency: 'MYR',
  });

  await processTopupOrderStatus({
    orderId: order.id,
    newStatus: 'PAID',
    paymentMethod: 'card',
    paymentReference: 'test_ref_concurrency_setup',
    processedBy: '4c857d15-ab93-45a6-8de5-7858ab4d6bd2',
    isTrustedSettlement: true,
  });

  const walletBefore = await getWalletBalance(org.id);
  console.log('Wallet before parallel requests:', walletBefore);
  assert.strictEqual(walletBefore.paid_balance, 600);
  assert.strictEqual(walletBefore.welcome_credit, 800);

  const game = await ensureDefaultGame(org.id, 'Test Game');
  const theme = await createTheme({
    organization_id: org.id,
    game_id: game.id,
    name: 'Theme Concurrency',
  });

  // Simulate two browser tabs simultaneously attempting to create an event at the exact same millisecond
  console.log('Triggering 2 simultaneous createEventWithAtomicPayment requests...');

  const results = await Promise.allSettled([
    createEventWithAtomicPayment({
      organization_id: org.id,
      game_theme_id: theme.id,
      name: 'Concurrent Event Tab 1',
      starts_at: new Date(Date.now() + 86400000).toISOString(),
      expires_at: new Date(Date.now() + 172800000).toISOString(),
      status: 'scheduled',
      payment_mode: 'WELCOME_CREDIT',
    }),
    createEventWithAtomicPayment({
      organization_id: org.id,
      game_theme_id: theme.id,
      name: 'Concurrent Event Tab 2',
      starts_at: new Date(Date.now() + 86400000).toISOString(),
      expires_at: new Date(Date.now() + 172800000).toISOString(),
      status: 'scheduled',
      payment_mode: 'WELCOME_CREDIT',
    }),
  ]);

  const fulfilled = results.filter((r) => r.status === 'fulfilled');
  const rejected = results.filter((r) => r.status === 'rejected');

  console.log(`Results: ${fulfilled.length} succeeded, ${rejected.length} safely rejected.`);

  // Exactly 1 must succeed and exactly 1 must be safely rejected due to insufficient balance
  assert.strictEqual(fulfilled.length, 1, 'Only 1 event creation should succeed with limited balance');
  assert.strictEqual(rejected.length, 1, 'The other concurrent request must be safely rejected');

  const rejectionReason: any = (rejected[0] as PromiseRejectedResult).reason;
  console.log('Rejection Error Details:', {
    code: rejectionReason?.code,
    message: rejectionReason?.message,
    required: rejectionReason?.required,
    available: rejectionReason?.available,
    shortfall: rejectionReason?.shortfall,
  });

  assert.strictEqual(rejectionReason?.code, 'INSUFFICIENT_BALANCE');
  assert.strictEqual(rejectionReason?.required, 1400); // Standard full price since welcome credit was consumed by the first event
  assert.strictEqual(rejectionReason?.available, 0);
  assert.strictEqual(rejectionReason?.shortfall, 1400);

  const walletAfter = await getWalletBalance(org.id);
  console.log('Wallet after concurrent requests:', walletAfter);
  assert.strictEqual(walletAfter.paid_balance, 0);
  assert.strictEqual(walletAfter.welcome_credit, 0);

  console.log('--- CONCURRENCY & RACE CONDITION TEST PASSED PERFECTLY! ---');
}

testConcurrentEventCreation().catch((err) => {
  console.error('Concurrency Test failed:', err);
  process.exit(1);
});
