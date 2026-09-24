import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {
  createEvent,
  getEventById,
  deriveEventLifecycleStatus,
} from './events.js';
import { createOrganization } from './organizations.js';
import { createTheme } from './themes.js';
import { createTopup, processEventPayment, getWalletBalance } from './wallet.js';

describe('COALESCE Date Type Mismatch Fix & Payment Processing', () => {
  it('should ensure no migration or schema file contains mismatched COALESCE(text, date)', () => {
    const migrationsDir = path.resolve(process.cwd(), 'supabase/migrations');
    const schemaFile = path.resolve(process.cwd(), 'supabase/schema.sql');

    const filesToCheck: string[] = [schemaFile];
    const migrationFiles = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql'));
    for (const f of migrationFiles) {
      filesToCheck.push(path.join(migrationsDir, f));
    }

    // Regexp that detects the buggy pattern: COALESCE with v_event.start_date / end_date / event_date and (starts_at...)::date or DATE(starts_at)
    // without explicit regex/casting of text columns.
    const buggyPattern1 = /COALESCE\s*\(\s*v_event\.start_date\s*,\s*\(v_event\.starts_at/i;
    const buggyPattern2 = /COALESCE\s*\(\s*v_event\.end_date\s*,\s*\(v_event\.expires_at/i;
    const buggyPattern3 = /COALESCE\s*\(\s*p_start_date\s*,\s*v_event\.start_date\s*,\s*DATE/i;
    const buggyPattern4 = /COALESCE\s*\(\s*p_end_date\s*,\s*v_event\.end_date\s*,\s*DATE/i;

    for (const filePath of filesToCheck) {
      const content = fs.readFileSync(filePath, 'utf-8');
      assert.ok(
        !buggyPattern1.test(content),
        `File ${path.basename(filePath)} contains incompatible COALESCE(v_event.start_date, (v_event.starts_at...)::date)`
      );
      assert.ok(
        !buggyPattern2.test(content),
        `File ${path.basename(filePath)} contains incompatible COALESCE(v_event.end_date, (v_event.expires_at...)::date)`
      );
      assert.ok(
        !buggyPattern3.test(content),
        `File ${path.basename(filePath)} contains incompatible COALESCE(p_start_date, v_event.start_date, DATE(...))`
      );
      assert.ok(
        !buggyPattern4.test(content),
        `File ${path.basename(filePath)} contains incompatible COALESCE(p_end_date, v_event.end_date, DATE(...))`
      );
    }
  });

  it('should successfully process payment with the exact user payload parameters without 500 error', async () => {
    const env = {
      NODE_ENV: 'test',
      ALLOW_TEST_LOCAL_STORE: 'true',
    };

    // 1. Create Organization & Theme
    const orgOwnerId = crypto.randomUUID();
    const org = await createOrganization(
      {
        name: 'Payment Audit Org',
        owner_id: orgOwnerId,
        country_code: 'MY',
      },
      env
    );

    const theme = await createTheme(
      {
        organization_id: org.id,
        game_id: 'catch-brand',
        name: 'Payment Test Theme',
        slug: `payment-test-${Date.now()}`,
      },
      env
    );

    // 2. Fund organization wallet with cash balance
    await createTopup(
      {
        organizationId: org.id,
        amount: 3000,
        referenceId: `topup_audit_${Date.now()}`,
      },
      env
    );

    const walletBefore = await getWalletBalance(org.id, env);
    assert.ok(walletBefore.paid_balance >= 1400, 'Org wallet must have sufficient funds');

    // 3. Create Event with string dates
    const startDate = '2026-10-15';
    const endDate = '2026-10-16';
    const event = await createEvent(
      {
        organization_id: org.id,
        game_theme_id: theme.id,
        name: 'Conference Activation 2026',
        start_date: startDate,
        end_date: endDate,
        event_timezone: 'Asia/Singapore',
        event_price: 1400,
        event_currency: 'MYR',
      },
      env
    );

    assert.ok(event.id, 'Event must be created');
    assert.strictEqual(event.payment_status, 'UNPAID');

    // 4. Execute payment with user's exact parameters:
    // payment_mode: "FULL_PAID", topup_credit_requested: 0, use_event_credit: true, use_welcome_credit: false, welcome_credit_requested: 0
    const paymentResult = await processEventPayment(
      {
        organizationId: org.id,
        eventId: event.id,
        eventName: event.name,
        paymentMode: 'FULL_PAID',
        useWelcomeCredit: false,
        useEventCredit: true,
        welcomeCreditRequested: 0,
        topupCreditRequested: 0,
        eventPrice: 1400,
        referenceId: `pay_test_${Date.now()}`,
        createdBy: orgOwnerId,
      },
      env
    );

    assert.ok(paymentResult.success, 'Payment must succeed');
    assert.strictEqual(paymentResult.paymentCalculation.paidAmount, 1900);

    // Verify event is marked PAID
    const updatedEvent = await getEventById(event.id, env);
    assert.ok(updatedEvent, 'Updated event must exist');
    assert.strictEqual(updatedEvent?.payment_status, 'PAID');

    // Verify wallet deduction
    const walletAfter = await getWalletBalance(org.id, env);
    assert.strictEqual(walletAfter.paid_balance, walletBefore.paid_balance - 1900);
  });
});
