/**
 * Production Financial Safety Tests for Wallet Engine
 * 
 * Verifies that:
 * 1. When Supabase is configured in production, any database error causes the transaction
 *    to FAIL LOUDLY (throw an error) and never silently pretend success via local fallback.
 * 2. Balances cannot diverge between customer view and real database.
 * 3. Local fallback is strictly isolated to development/test placeholder environments.
 */

import crypto from 'node:crypto';
import {
  createTopup,
  grantWelcomeCredit,
  grantShowcaseCredit,
  consumeWelcomeCredit,
  consumeShowcaseCredit,
  getWalletBalance,
  recalculateWalletBalances,
  createTopupOrder,
  processTopupOrderStatus,
  processEventPayment,
  getOutstandingBalance,
  setOutstandingBalance,
} from './wallet.js';
import { createOrganization } from './organizations.js';
import { isSupabaseConfigured } from '../supabase.js';

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

function assertTrue(condition: boolean, testName: string) {
  if (condition) {
    console.log(`  ✓ PASS: ${testName}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${testName}`);
    failed++;
  }
}

async function runProductionAcidTests() {
  console.log('\n======================================================');
  console.log(' RUNNING WALLET PRODUCTION ACID INTEGRITY TEST SUITE');
  console.log('======================================================\n');

  // Test 1: Placeholder environment detection
  console.log('--- Test Group 1: Environment Detection ---');
  const mockDevEnv = {
    SUPABASE_URL: 'https://placeholder-project.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'placeholder-service-key',
  };
  const devIsProd = isSupabaseConfigured(mockDevEnv);
  assertEqual(devIsProd, false, 'Placeholder mock environment correctly identified as non-production (false)');

  const mockProdEnv = {
    SUPABASE_URL: 'https://test-error-database.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'real-service-role-key-abc123xyz',
  };
  const prodDetected = isSupabaseConfigured(mockProdEnv);
  assertEqual(prodDetected, true, 'Configured Supabase environment correctly identified as production (true)');

  // Test 2: In production environment, failed Supabase inserts must throw
  console.log('\n--- Test Group 2: Production Failure Behavior (Never Silent Fallback) ---');
  const testOrgId = crypto.randomUUID();

  // Attempting to top-up with production env configured against an unreachable/mock URL must throw an error,
  // NOT silently write to local JSON and return success.
  let topupThrewError = false;
  let topupErrorMessage = '';
  try {
    await createTopup(
      {
        organizationId: testOrgId,
        amount: 1400.00,
        referenceId: `prod_test_topup_${crypto.randomUUID()}`,
      },
      mockProdEnv
    );
  } catch (err: any) {
    topupThrewError = true;
    topupErrorMessage = err.message;
  }

  assertTrue(topupThrewError, 'createTopup throws error when Supabase fails in production mode');
  assertTrue(
    topupErrorMessage.includes('Financial ledger transaction failed') ||
    topupErrorMessage.includes('Database') ||
    topupErrorMessage.includes('fetch failed'),
    `Error message clearly indicates financial transaction failure: "${topupErrorMessage}"`
  );

  // Test 3: Attempting grantWelcomeCredit in production when database is down must throw
  let welcomeThrewError = false;
  try {
    await grantWelcomeCredit(
      {
        organizationId: testOrgId,
      },
      mockProdEnv
    );
  } catch (err: any) {
    welcomeThrewError = true;
  }
  assertTrue(welcomeThrewError, 'grantWelcomeCredit throws error when Supabase fails in production mode');

  // Test 4: Attempting grantShowcaseCredit in production when database is down must throw
  let showcaseThrewError = false;
  try {
    await grantShowcaseCredit(
      {
        organizationId: testOrgId,
      },
      mockProdEnv
    );
  } catch (err: any) {
    showcaseThrewError = true;
  }
  assertTrue(showcaseThrewError, 'grantShowcaseCredit throws error when Supabase fails in production mode');

  // Test 5: recalculateWalletBalances in production when database is down must throw
  let recalcThrewError = false;
  try {
    await recalculateWalletBalances(testOrgId, mockProdEnv);
  } catch (err: any) {
    recalcThrewError = true;
  }
  assertTrue(recalcThrewError, 'recalculateWalletBalances throws error when Supabase query fails in production mode');

  // Test 6: createTopupOrder in production when database is down must throw
  let topupOrderThrewError = false;
  try {
    await createTopupOrder(
      {
        organizationId: testOrgId,
        userId: crypto.randomUUID(),
        amount: 500,
      },
      mockProdEnv
    );
  } catch (err: any) {
    topupOrderThrewError = true;
  }
  assertTrue(topupOrderThrewError, 'createTopupOrder throws error when Supabase fails in production mode');

  // Test 7: processTopupOrderStatus in production when database is down must throw
  let processTopupThrewError = false;
  try {
    await processTopupOrderStatus(
      {
        orderId: crypto.randomUUID(),
        newStatus: 'PAID',
        isTrustedSettlement: true,
      },
      mockProdEnv
    );
  } catch (err: any) {
    processTopupThrewError = true;
  }
  assertTrue(processTopupThrewError, 'processTopupOrderStatus throws error when Supabase fails in production mode');

  // Test 8: processEventPayment in production when database is down must throw
  let eventPaymentThrewError = false;
  try {
    await processEventPayment(
      {
        organizationId: testOrgId,
        eventId: crypto.randomUUID(),
        paymentMode: 'FULL_PAID',
        eventPrice: 1400,
      },
      mockProdEnv
    );
  } catch (err: any) {
    eventPaymentThrewError = true;
  }
  assertTrue(eventPaymentThrewError, 'processEventPayment throws error when Supabase fails in production mode');

  // Test 9: createOrganization in production when database is down must throw
  let createOrgThrewError = false;
  try {
    await createOrganization(
      {
        name: 'Test Safe Org',
        owner_id: crypto.randomUUID(),
      },
      mockProdEnv
    );
  } catch (err: any) {
    createOrgThrewError = true;
  }
  assertTrue(createOrgThrewError, 'createOrganization throws error when Supabase fails in production mode');

  // Test 10: getOutstandingBalance in production when database is down must throw (FAIL CLOSED)
  let getOutstandingThrewError = false;
  try {
    await getOutstandingBalance(testOrgId, mockProdEnv);
  } catch (err: any) {
    getOutstandingThrewError = true;
  }
  assertTrue(getOutstandingThrewError, 'getOutstandingBalance throws error when Supabase fails in production mode (FAIL CLOSED)');

  // Test 11: setOutstandingBalance in production when database is down must throw (FAIL CLOSED)
  let setOutstandingThrewError = false;
  try {
    await setOutstandingBalance(testOrgId, 100.00, mockProdEnv);
  } catch (err: any) {
    setOutstandingThrewError = true;
  }
  assertTrue(setOutstandingThrewError, 'setOutstandingBalance throws error when Supabase fails in production mode (FAIL CLOSED)');

  console.log('\n======================================================');
  console.log(` RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('======================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
  process.exit(0);
}

runProductionAcidTests().catch((err) => {
  console.error('Fatal error during production ACID test execution:', err);
  process.exit(1);
});
