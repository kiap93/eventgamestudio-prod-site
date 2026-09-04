/**
 * Automated Test Suite for Privilege Escalation Prevention
 *
 * Verifies:
 * 1. RLS Migrations: drops "Users can update own user record" and revokes UPDATE from authenticated & anon
 * 2. Defense-in-depth trigger: prevent_user_privilege_escalation installed on public.users
 * 3. updateUser: strips attempts to inject is_developer, role, id, or other privileged fields
 * 4. updateUserProfile: safely allows updating name and avatar_url, rejects invalid values
 * 5. Worker API: rejects forbidden fields in /api/auth/profile with 400 Bad Request
 * 6. Worker API: allows authorized updates to name and avatar_url via service role
 */

import fs from 'fs';
import path from 'path';
import { createUser, getUserById, updateUser, updateUserProfile } from './db/users.js';
import { signAppToken } from './auth.js';
import worker from '../worker.js';

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`  ✓ ${testName}`);
    passed++;
  } else {
    console.error(`  ✗ ${testName}${detail ? ` -> ${detail}` : ''}`);
    failed++;
  }
}

async function runPrivilegeEscalationTests() {
  console.log('\n======================================================');
  console.log('Running Privilege Escalation Prevention Tests');
  console.log('======================================================\n');

  const testEnv = {
    SUPABASE_URL: 'https://placeholder.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'placeholder-service-key',
  };

  // Test 1: RLS Migrations
  try {
    const migrationPath = path.join(process.cwd(), 'supabase/migrations/20260904020000_prevent_user_privilege_escalation.sql');
    assert(fs.existsSync(migrationPath), '1. Migration file 20260904020000_prevent_user_privilege_escalation.sql exists');

    const migrationContent = fs.readFileSync(migrationPath, 'utf8');
    assert(
      migrationContent.includes('DROP POLICY IF EXISTS "Users can update own user record" ON public.users;'),
      '1b. Migration drops "Users can update own user record" policy'
    );
    assert(
      migrationContent.includes('REVOKE UPDATE ON public.users FROM authenticated;') &&
      migrationContent.includes('REVOKE UPDATE ON public.users FROM anon;'),
      '1c. Migration revokes UPDATE on public.users from authenticated and anon'
    );
    assert(
      migrationContent.includes('CREATE OR REPLACE FUNCTION public.prevent_user_privilege_escalation()'),
      '1d. Migration creates defense-in-depth trigger function prevent_user_privilege_escalation'
    );

    // Baseline migration check
    const baselinePath = path.join(process.cwd(), 'supabase/migrations/20260903000000_initial_baseline.sql');
    const baselineContent = fs.readFileSync(baselinePath, 'utf8');
    assert(
      !baselineContent.includes('CREATE POLICY "Users can update own user record"'),
      '1e. Baseline migration does not create vulnerable update policy'
    );

    // Schema.sql check
    const schemaPath = path.join(process.cwd(), 'supabase/schema.sql');
    const schemaContent = fs.readFileSync(schemaPath, 'utf8');
    assert(
      !schemaContent.includes('CREATE POLICY "Users can update own user record"'),
      '1f. schema.sql does not create vulnerable update policy'
    );
  } catch (err: any) {
    assert(false, '1. RLS migration checks failed', err.message);
  }

  // Test 2: updateUser strips attempts to set is_developer or other privileged fields
  try {
    const user = await createUser({
      email: `victim_${Date.now()}@example.com`,
      name: 'Regular User',
      is_developer: false,
    }, testEnv);

    assert(user.is_developer === false, '2a. User created with is_developer = false');

    const maliciousUpdate = {
      name: 'Hacker Attempt',
      is_developer: true,
      role: 'admin',
      id: '00000000-0000-0000-0000-000000000000',
    } as any;

    const updated = await updateUser(user.id, maliciousUpdate, testEnv);
    assert(updated.name === 'Hacker Attempt', '2b. Name update succeeded');
    assert(updated.is_developer === false, '2c. is_developer remained false (injection stripped)');
    assert(updated.id === user.id, '2d. id remained unchanged');

    const stored = await getUserById(user.id, testEnv);
    assert(stored?.is_developer === false, '2e. Stored record retains is_developer = false');
  } catch (err: any) {
    assert(false, '2. updateUser privilege stripping failed', err.message);
  }

  // Test 3: updateUserProfile safely updates name and avatar_url
  try {
    const user = await createUser({
      email: `profile_${Date.now()}@example.com`,
      name: 'Initial Name',
      is_developer: false,
    }, testEnv);

    const updated = await updateUserProfile(user.id, {
      name: 'Updated Name',
      avatar_url: 'https://example.com/new-avatar.png',
    }, testEnv);

    assert(updated.name === 'Updated Name', '3a. Profile name updated');
    assert(updated.avatar_url === 'https://example.com/new-avatar.png', '3b. Profile avatar_url updated');
    assert(updated.is_developer === false, '3c. is_developer remains false');

    const cleared = await updateUserProfile(user.id, {
      avatar_url: null,
    }, testEnv);
    assert(cleared.avatar_url === null, '3d. avatar_url successfully cleared');
  } catch (err: any) {
    assert(false, '3. updateUserProfile tests failed', err.message);
  }

  // Test 4: updateUserProfile input validation
  try {
    const user = await createUser({
      email: `invalid_${Date.now()}@example.com`,
      name: 'Valid Name',
      is_developer: false,
    }, testEnv);

    let emptyNameThrew = false;
    try {
      await updateUserProfile(user.id, { name: '   ' }, testEnv);
    } catch {
      emptyNameThrew = true;
    }
    assert(emptyNameThrew, '4a. Rejects whitespace-only name');

    let longNameThrew = false;
    try {
      await updateUserProfile(user.id, { name: 'a'.repeat(101) }, testEnv);
    } catch {
      longNameThrew = true;
    }
    assert(longNameThrew, '4b. Rejects names longer than 100 characters');

    let longAvatarThrew = false;
    try {
      await updateUserProfile(user.id, { avatar_url: 'https://example.com/' + 'a'.repeat(1005) }, testEnv);
    } catch {
      longAvatarThrew = true;
    }
    assert(longAvatarThrew, '4c. Rejects avatar URLs longer than 1000 characters');
  } catch (err: any) {
    assert(false, '4. Validation tests failed', err.message);
  }

  // Test 5: Worker API rejects forbidden fields in /api/auth/profile
  try {
    const user = await createUser({
      email: `worker_target_${Date.now()}@example.com`,
      name: 'Regular Member',
      is_developer: false,
    }, testEnv);

    const jwtSecret = '0123456789abcdef0123456789abcdef';
    const token = await signAppToken(user.id, undefined, undefined, jwtSecret, { JWT_SECRET: jwtSecret, NODE_ENV: 'development' });

    const workerEnv = {
      ...testEnv,
      JWT_SECRET: jwtSecret,
      NODE_ENV: 'development',
    };

    const maliciousReq = new Request('https://eventgamestudio.com/api/auth/profile', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        Origin: 'https://eventgamestudio.com',
      },
      body: JSON.stringify({
        name: 'Attempted Escalation',
        is_developer: true,
      }),
    });

    const res1 = await worker.fetch(maliciousReq, workerEnv, {} as any);
    assert(res1.status === 400, '5a. Worker API responds with 400 Bad Request on is_developer alteration');
    const body1 = (await res1.json()) as any;
    assert(
      body1.error?.includes("Modifying protected field 'is_developer' is strictly prohibited"),
      '5b. Worker API error explicitly mentions forbidden field rejection'
    );

    const freshUser = await getUserById(user.id, testEnv);
    assert(freshUser?.is_developer === false, '5c. Database user remains uncompromised (is_developer = false)');

    const validReq = new Request('https://eventgamestudio.com/api/auth/profile', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        Origin: 'https://eventgamestudio.com',
      },
      body: JSON.stringify({
        name: 'Properly Updated Name',
        avatar_url: 'https://example.com/avatar.jpg',
      }),
    });

    const res2 = await worker.fetch(validReq, workerEnv, {} as any);
    assert(res2.status === 200, '5d. Worker API accepts valid profile update with 200 OK');
    const body2 = (await res2.json()) as any;
    assert(body2.success === true, '5e. Response indicates success');
    assert(body2.user.name === 'Properly Updated Name', '5f. Response contains updated name');
    assert(body2.user.avatar_url === 'https://example.com/avatar.jpg', '5g. Response contains updated avatar');
    assert(body2.user.is_developer === false, '5h. is_developer remains false in response');
  } catch (err: any) {
    assert(false, '5. Worker API tests failed', err.message);
  }

  console.log('\n======================================================');
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log('======================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runPrivilegeEscalationTests().catch((err) => {
  console.error('Fatal test suite error:', err);
  process.exit(1);
});
