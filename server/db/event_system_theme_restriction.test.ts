import assert from 'node:assert';
import { createOrganization } from './organizations.js';
import { createEvent, createEventWithAtomicPayment, updateEvent } from './events.js';
import { createTheme, createSystemTheme } from './themes.js';
import { ensureDefaultGame } from './games.js';

async function runTests() {
  console.log('--- STARTING EVENT SYSTEM THEME RESTRICTION TESTS ---');

  // Setup: Organization
  const org = await createOrganization({
    name: 'Theme Security Org ' + Date.now(),
    owner_id: '4c857d15-ab93-45a6-8de5-7858ab4d6bd2',
  });

  // Setup: Game
  const game = await ensureDefaultGame(org.id, 'Memory Match');

  // Setup: System Theme (is_system: true, read-only platform template)
  const systemTheme = await createSystemTheme({
    game_id: game.id,
    name: 'System Default Memory Template',
    slug: 'system-memory-template-' + Date.now(),
  });

  assert.strictEqual(systemTheme.is_system, true);

  // Setup: Organization-owned Theme
  const orgTheme = await createTheme({
    organization_id: org.id,
    game_id: game.id,
    name: 'Organization Custom Memory Theme',
  });

  assert.strictEqual(orgTheme.is_system, false);
  assert.strictEqual(orgTheme.organization_id, org.id);

  // TEST 1: createEvent MUST reject system theme with 403 / SYSTEM_THEME_NOT_ALLOWED
  let systemThemeCreateError: any = null;
  try {
    await createEvent({
      organization_id: org.id,
      game_id: game.id,
      game_theme_id: systemTheme.id,
      name: 'Event With System Theme',
      starts_at: new Date(Date.now() + 86400000).toISOString(),
      expires_at: new Date(Date.now() + 172800000).toISOString(),
      status: 'pending_payment',
    });
  } catch (err: any) {
    systemThemeCreateError = err;
  }

  console.log('1. createEvent system theme rejection:', systemThemeCreateError?.message, systemThemeCreateError?.status, systemThemeCreateError?.code);
  assert.ok(systemThemeCreateError, 'Expected createEvent with system theme to throw an error');
  assert.strictEqual(systemThemeCreateError.status, 403);
  assert.strictEqual(systemThemeCreateError.code, 'SYSTEM_THEME_NOT_ALLOWED');
  assert.strictEqual(systemThemeCreateError.message, 'Only organization themes can be used for events.');

  // TEST 2: createEventWithAtomicPayment MUST reject system theme with 403 / SYSTEM_THEME_NOT_ALLOWED
  let atomicSystemThemeError: any = null;
  try {
    await createEventWithAtomicPayment({
      organization_id: org.id,
      game_id: game.id,
      game_theme_id: systemTheme.id,
      name: 'Atomic Event With System Theme',
      starts_at: new Date(Date.now() + 86400000).toISOString(),
      expires_at: new Date(Date.now() + 172800000).toISOString(),
      status: 'scheduled',
      payment_mode: 'WELCOME_CREDIT',
    });
  } catch (err: any) {
    atomicSystemThemeError = err;
  }

  console.log('2. createEventWithAtomicPayment system theme rejection:', atomicSystemThemeError?.message, atomicSystemThemeError?.status, atomicSystemThemeError?.code);
  assert.ok(atomicSystemThemeError, 'Expected createEventWithAtomicPayment with system theme to throw an error');
  assert.strictEqual(atomicSystemThemeError.status, 403);
  assert.strictEqual(atomicSystemThemeError.code, 'SYSTEM_THEME_NOT_ALLOWED');
  assert.strictEqual(atomicSystemThemeError.message, 'Only organization themes can be used for events.');

  // TEST 3: createEvent MUST succeed with organization-owned theme
  const validEvent = await createEvent({
    organization_id: org.id,
    game_id: game.id,
    game_theme_id: orgTheme.id,
    name: 'Valid Organization Event',
    starts_at: new Date(Date.now() + 86400000).toISOString(),
    expires_at: new Date(Date.now() + 172800000).toISOString(),
    status: 'pending_payment',
  });

  console.log('3. Valid organization event created:', validEvent.id, validEvent.name);
  assert.ok(validEvent.id);
  assert.strictEqual(validEvent.game_theme_id, orgTheme.id);

  // TEST 4: updateEvent MUST reject updating to a system theme with 403 / SYSTEM_THEME_NOT_ALLOWED
  let updateSystemThemeError: any = null;
  try {
    await updateEvent(validEvent.id, {
      game_theme_id: systemTheme.id,
    });
  } catch (err: any) {
    updateSystemThemeError = err;
  }

  console.log('4. updateEvent system theme rejection:', updateSystemThemeError?.message, updateSystemThemeError?.status, updateSystemThemeError?.code);
  assert.ok(updateSystemThemeError, 'Expected updateEvent with system theme to throw an error');
  assert.strictEqual(updateSystemThemeError.status, 403);
  assert.strictEqual(updateSystemThemeError.code, 'SYSTEM_THEME_NOT_ALLOWED');
  assert.strictEqual(updateSystemThemeError.message, 'Only organization themes can be used for events.');

  console.log('--- ALL EVENT SYSTEM THEME RESTRICTION TESTS PASSED! ---');
}

runTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
