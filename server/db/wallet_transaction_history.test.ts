/**
 * Server-Side Tests for Wallet Transaction History & Organization Isolation
 */

import crypto from 'node:crypto';
import assert from 'node:assert';
import {
  createTopupOrder,
  processTopupOrderStatus,
  getWalletTransactions,
  getWalletBalance,
  createTopup,
  processEventPayment,
} from './wallet.js';

let passed = 0;
let failed = 0;

function test(name: string, fn: () => Promise<void>) {
  return fn()
    .then(() => {
      console.log(`  ✓ ${name}`);
      passed++;
    })
    .catch((err) => {
      console.error(`  ✗ ${name}`);
      console.error(err);
      failed++;
    });
}

async function runTests() {
  console.log('--- EventGameStudio Wallet Transaction History & Organization Isolation Tests ---');

  await test('maintains strict organization isolation so Org B cannot see Org A transactions', async () => {
    const orgA = crypto.randomUUID();
    const orgB = crypto.randomUUID();
    const user1 = crypto.randomUUID();

    // 1. Create a Top Up order in Org A
    const orderA = await createTopupOrder({
      organizationId: orgA,
      userId: user1,
      amount: 6000,
      paymentReference: 'pay_stripe_orgA_1001',
    });

    // 2. Mark orderA as PAID
    await processTopupOrderStatus({
      orderId: orderA.id,
      newStatus: 'PAID',
      paymentReference: 'pay_stripe_orgA_1001',
      isTrustedSettlement: true,
    });

    // 3. Query transactions for Org A
    const txnsA = await getWalletTransactions(orgA);
    assert(txnsA.total >= 2, 'Org A should have at least 2 transactions');
    assert(txnsA.transactions.every((t) => t.organization_id === orgA), 'All txns must belong to Org A');

    // 4. Query transactions for Org B - must NOT include any Org A transactions
    const txnsB = await getWalletTransactions(orgB);
    const orgAItemsInB = txnsB.transactions.filter((t) => t.organization_id === orgA);
    assert.strictEqual(orgAItemsInB.length, 0, 'Org B must not see any of Org A transactions');
  });

  await test('correctly filters transactions by group: ALL, TOPUP, EVENT_USAGE, CREDITS, REFUNDS', async () => {
    const orgId = crypto.randomUUID();
    const user1 = crypto.randomUUID();

    // A. Top-up deposit (creates 1 TOPUP and 1 TOPUP_CREDIT)
    const order = await createTopupOrder({
      organizationId: orgId,
      userId: user1,
      amount: 6000,
      paymentReference: 'pay_stripe_test_6000',
    });
    await processTopupOrderStatus({
      orderId: order.id,
      newStatus: 'PAID',
      paymentReference: 'pay_stripe_test_6000',
      isTrustedSettlement: true,
    });

    // B. Event Payment (creates EVENT_PAYMENT and CREDIT_USAGE)
    await processEventPayment({
      organizationId: orgId,
      eventId: crypto.randomUUID(),
      eventName: 'Grand Corporate Gala',
      eventPrice: 1400,
      paymentMode: 'TOPUP_CREDIT',
      createdBy: user1,
    });

    // C. Test Filter: TOPUP
    const topupFilter = await getWalletTransactions(orgId, { filterGroup: 'TOPUP' });
    assert.strictEqual(topupFilter.transactions.length, 1);
    assert.strictEqual(topupFilter.transactions[0].transaction_type, 'TOPUP');
    assert.strictEqual(topupFilter.transactions[0].balance_type, 'PAID_BALANCE');
    assert.strictEqual(topupFilter.transactions[0].amount, 6000);

    // D. Test Filter: CREDITS
    const creditsFilter = await getWalletTransactions(orgId, { filterGroup: 'CREDITS' });
    assert(creditsFilter.transactions.length >= 1, 'Should have credits transactions');
    assert(
      creditsFilter.transactions.every((t) =>
        ['TOPUP_CREDIT', 'WELCOME_CREDIT', 'SHOWCASE_CREDIT'].includes(t.transaction_type)
      ),
      'All transactions must be credits'
    );

    // E. Test Filter: EVENT_USAGE
    const eventFilter = await getWalletTransactions(orgId, { filterGroup: 'EVENT_USAGE' });
    assert.strictEqual(eventFilter.transactions.length, 2, 'Should have 2 event usage transactions');
    assert(
      eventFilter.transactions.every((t) =>
        ['EVENT_PAYMENT', 'CREDIT_USAGE'].includes(t.transaction_type)
      ),
      'All transactions must be event payment/usage'
    );

    // F. Test Filter: ALL
    const allFilter = await getWalletTransactions(orgId, { filterGroup: 'ALL' });
    assert.strictEqual(allFilter.total, 4, 'Total transactions should be 4');
  });

  await test('supports date range filtering on ledger timestamps', async () => {
    const orgId = crypto.randomUUID();
    const user1 = crypto.randomUUID();

    await createTopup({
      organizationId: orgId,
      amount: 1000,
      createdBy: user1,
    });

    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();

    const inRange = await getWalletTransactions(orgId, {
      startDate: yesterday,
      endDate: tomorrow,
    });
    assert(inRange.transactions.length > 0, 'Should find transaction within current window');

    const pastRange = await getWalletTransactions(orgId, {
      startDate: '2020-01-01T00:00:00.000Z',
      endDate: '2020-01-02T00:00:00.000Z',
    });
    assert.strictEqual(pastRange.transactions.length, 0, 'Should not find transactions outside date window');
  });

  await test('validates Top Up Order and Ledger record correlation for Top Up Detail view', async () => {
    const orgId = crypto.randomUUID();
    const user1 = crypto.randomUUID();

    // Create a RM 6,000 top up order (5% bonus = RM 300)
    const order = await createTopupOrder({
      organizationId: orgId,
      userId: user1,
      amount: 6000,
      paymentReference: 'pay_stripe_audit_ref_9988',
      notes: 'Corporate Annual Top Up',
    });

    assert.strictEqual(order.top_up_amount, 6000);
    assert.strictEqual(order.expected_credit_amount, 300);
    assert.strictEqual(order.total_wallet_value, 6300);

    // Process to PAID
    const processResult = await processTopupOrderStatus({
      orderId: order.id,
      newStatus: 'PAID',
      paymentReference: 'pay_stripe_audit_ref_9988',
      isTrustedSettlement: true,
    });

    assert.strictEqual(processResult.order.status, 'PAID');
    assert.strictEqual(processResult.order.payment_reference, 'pay_stripe_audit_ref_9988');

    // Retrieve ledger transactions
    const txns = await getWalletTransactions(orgId);
    const topupTxn = txns.transactions.find((t) => t.transaction_type === 'TOPUP');
    const creditTxn = txns.transactions.find((t) => t.transaction_type === 'TOPUP_CREDIT');

    assert(topupTxn !== undefined, 'Topup ledger entry must exist');
    assert.strictEqual(topupTxn?.amount, 6000);
    assert.strictEqual(topupTxn?.balance_type, 'PAID_BALANCE');
    assert.strictEqual(topupTxn?.metadata?.topup_order_id, order.id);

    assert(creditTxn !== undefined, 'Credit ledger entry must exist');
    assert.strictEqual(creditTxn?.amount, 300);
    assert.strictEqual(creditTxn?.balance_type, 'TOPUP_CREDIT');

    // Verify wallet balance
    const wallet = await getWalletBalance(orgId);
    assert.strictEqual(wallet.paid_balance, 6000);
    assert.strictEqual(wallet.topup_credit, 300);
    assert.strictEqual(wallet.total_balance, 6300);
  });

  console.log(`\nSummary: ${passed} passed, ${failed} failed\n`);
  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
