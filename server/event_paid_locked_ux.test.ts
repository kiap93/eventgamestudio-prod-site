import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { updateEvent, createEvent, getEventById, runEventLifecycleMaintenance } from './db/events.js';
import { createUser } from './db/users.js';
import { createOrganization } from './db/organizations.js';
import { ensureDefaultGame } from './db/games.js';
import { createTheme } from './db/themes.js';
import { en } from '../src/locales/en.js';
import { zhCN } from '../src/locales/zh-CN.js';
import { msMY } from '../src/locales/ms-MY.js';

let passed = 0;
let failed = 0;

async function test(desc: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    console.log(`  ✓ ${desc}`);
    passed++;
  } catch (err: any) {
    console.error(`  ✗ ${desc}`);
    console.error(err);
    failed++;
  }
}

async function runTests() {
  console.log('======================================================');
  console.log('Running Paid Event Locked UX & Configuration Tests');
  console.log('======================================================\n');

  const workerEnv: Record<string, any> = {
    JWT_SECRET: 'test_jwt_secret_key_32_bytes_long_minimum!!',
    SUPABASE_URL: 'https://placeholder.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'placeholder_key',
    RATE_LIMIT_DISABLED: 'true',
  };

  // TEST 1: Locale Strings match recommended UI specifications exactly
  await test('1. Locales contain the exact recommended UI strings for locked paid events', () => {
    assert.strictEqual(
      en.event.configurationLockedTitle,
      'Event configuration locked',
      'English title must match recommended UX'
    );
    assert.strictEqual(
      en.event.configurationLockedDesc,
      'This event has been paid and its event setup can no longer be changed. If you need assistance, contact EventGameStudio support.',
      'English description must match recommended UX'
    );
    assert.ok(
      zhCN.event.configurationLockedTitle && zhCN.event.configurationLockedDesc,
      'Simplified Chinese locale must contain locked title & description'
    );
    assert.ok(
      msMY.event.configurationLockedTitle && msMY.event.configurationLockedDesc,
      'Malay locale must contain locked title & description'
    );
  });

  // TEST 2: EditEventDialog.tsx structural verification for UI controls
  await test('2. EditEventDialog.tsx disables controls and renders locked UI when isPaid is true', () => {
    const dialogFilePath = path.resolve(process.cwd(), 'src/components/events/EditEventDialog.tsx');
    const content = fs.readFileSync(dialogFilePath, 'utf-8');

    // Verify usage of configurationLockedTitle and configurationLockedDesc
    assert.ok(
      content.includes('t(\'event.configurationLockedTitle\''),
      'Dialog must display event.configurationLockedTitle'
    );
    assert.ok(
      content.includes('t(\'event.configurationLockedDesc\'') || content.includes('event.configurationLockedDesc'),
      'Dialog must display event.configurationLockedDesc'
    );

    // Verify support contact mailto
    assert.ok(
      content.includes('settings.enquiry_email') || content.includes('mailto:'),
      'Dialog must include support contact link'
    );

    // Verify controls are disabled when paid
    assert.ok(
      content.includes('disabled={isPaid}'),
      'Input controls must have disabled={isPaid}'
    );
    assert.ok(
      content.includes('readOnly={isPaid}'),
      'Text and date inputs must have readOnly={isPaid}'
    );
    assert.ok(
      content.includes('setSelectedThemeId(theme.id)'),
      'Theme selector exists'
    );
    assert.ok(
      content.includes('!isPaid && setSelectedThemeId(theme.id)'),
      'Theme switching must be disabled when isPaid'
    );

    // Verify submit button disabled/replaced when paid
    assert.ok(
      content.includes('isPaid ?') && content.includes('Event configuration locked'),
      'Action button area must display locked configuration indicator when isPaid'
    );

    // Verify handleSubmit prevents action when isPaid
    assert.ok(
      content.includes('if (isPaid) {') && content.includes('setError('),
      'handleSubmit must reject submission if isPaid'
    );
  });

  // TEST 3: Backend updateEvent enforces locked fields for paid events
  await test('3. Backend updateEvent rejects modifying paid event setup fields', async () => {
    const user = await createUser({
      email: `ux_tester_${Date.now()}@example.com`,
      name: 'UX Tester',
    }, workerEnv);

    const org = await createOrganization({
      name: 'UX Test Org',
      owner_id: user.id,
    }, workerEnv);

    const game = await ensureDefaultGame(org.id, 'UX Test Game', workerEnv);
    const themeA = await createTheme({
      organization_id: org.id,
      game_id: game.id,
      name: 'Theme Alpha',
      slug: `theme-alpha-${Date.now()}`,
    }, workerEnv);

    const themeB = await createTheme({
      organization_id: org.id,
      game_id: game.id,
      name: 'Theme Beta',
      slug: `theme-beta-${Date.now()}`,
    }, workerEnv);

    const paidEvent = await createEvent({
      organization_id: org.id,
      game_id: game.id,
      game_theme_id: themeA.id,
      name: 'Original Paid Event Name',
      event_date: '2026-11-10',
      start_date: '2026-11-10',
      end_date: '2026-11-11',
      startDate: '2026-11-10',
      endDate: '2026-11-11',
      starts_at: '2026-11-10T00:00:00.000Z',
      expires_at: '2026-11-11T23:59:59.999Z',
      status: 'scheduled',
      event_status: 'SCHEDULED',
      payment_status: 'PAID',
      paid_amount: 1400,
      created_by: user.id,
      event_price: 1400,
      event_timezone: 'Asia/Singapore',
    }, workerEnv);

    // Check modifying name
    let nameError: any;
    try {
      await updateEvent(paidEvent.id, { name: 'Attempted Renamed Event' }, workerEnv);
    } catch (err) {
      nameError = err;
    }
    assert.ok(nameError, 'Must throw error when renaming paid event');
    assert.strictEqual(nameError.code, 'EVENT_LOCKED_AFTER_PAYMENT');
    assert.strictEqual(nameError.status, 403);

    // Check modifying theme
    let themeError: any;
    try {
      await updateEvent(paidEvent.id, { game_theme_id: themeB.id }, workerEnv);
    } catch (err) {
      themeError = err;
    }
    assert.ok(themeError, 'Must throw error when switching theme for paid event');
    assert.strictEqual(themeError.code, 'EVENT_LOCKED_AFTER_PAYMENT');

    // Check modifying start date / end date
    let dateError: any;
    try {
      await updateEvent(paidEvent.id, { start_date: '2026-11-12' }, workerEnv);
    } catch (err) {
      dateError = err;
    }
    assert.ok(dateError, 'Must throw error when changing start_date for paid event');
    assert.strictEqual(dateError.code, 'EVENT_LOCKED_AFTER_PAYMENT');

    // Check modifying timezone
    let tzError: any;
    try {
      await updateEvent(paidEvent.id, { event_timezone: 'Asia/Tokyo' }, workerEnv);
    } catch (err) {
      tzError = err;
    }
    assert.ok(tzError, 'Must throw error when changing timezone for paid event');
    assert.strictEqual(tzError.code, 'EVENT_LOCKED_AFTER_PAYMENT');

    // Check modifying status
    let statusError: any;
    try {
      await updateEvent(paidEvent.id, { status: 'draft' }, workerEnv);
    } catch (err) {
      statusError = err;
    }
    assert.ok(statusError, 'Must throw error when changing status to draft for paid event');
    assert.strictEqual(statusError.code, 'EVENT_LOCKED_AFTER_PAYMENT');
  });

  // TEST 4: Unpaid event can be modified freely without lock
  await test('4. Unpaid event setup can be modified without lock errors', async () => {
    const user = await createUser({
      email: `unpaid_tester_${Date.now()}@example.com`,
      name: 'Unpaid Tester',
    }, workerEnv);

    const org = await createOrganization({
      name: 'Unpaid Org',
      owner_id: user.id,
    }, workerEnv);

    const game = await ensureDefaultGame(org.id, 'Unpaid Game', workerEnv);
    const theme = await createTheme({
      organization_id: org.id,
      game_id: game.id,
      name: 'Unpaid Theme',
      slug: `theme-unpaid-${Date.now()}`,
    }, workerEnv);

    const unpaidEvent = await createEvent({
      organization_id: org.id,
      game_id: game.id,
      game_theme_id: theme.id,
      name: 'Initial Unpaid Event',
      event_date: '2026-12-01',
      start_date: '2026-12-01',
      end_date: '2026-12-02',
      startDate: '2026-12-01',
      endDate: '2026-12-02',
      starts_at: '2026-12-01T00:00:00.000Z',
      expires_at: '2026-12-02T23:59:59.999Z',
      status: 'scheduled',
      event_status: 'PENDING_PAYMENT',
      payment_status: 'UNPAID',
      created_by: user.id,
      event_price: 1900,
    }, workerEnv);

    const updated = await updateEvent(unpaidEvent.id, {
      name: 'Renamed Unpaid Event',
      start_date: '2026-12-05',
      end_date: '2026-12-06',
    }, workerEnv);

    assert.strictEqual(updated.name, 'Renamed Unpaid Event');
    assert.strictEqual(updated.start_date, '2026-12-05');
  });

  console.log('\n======================================================');
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log('======================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
