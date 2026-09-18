import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import worker from '../worker.js';
import { signAppToken } from './auth.js';
import { createUser } from './db/users.js';
import { createOrganization } from './db/organizations.js';
import { ensureDefaultGame, getAvailableGamesForStudio, createGame } from './db/games.js';
import { createTheme, getThemeById } from './db/themes.js';

let passed = 0;
let failed = 0;

function test(description: string, fn: () => void | Promise<void>) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      console.log(`  ✓ ${description}`);
      passed++;
    })
    .catch((err) => {
      console.error(`  ✗ ${description}`);
      console.error(err);
      failed++;
    });
}

async function runGamesThemesBackendWriteOnlyTests() {
  console.log('===============================================================');
  console.log('Running Games & Themes Backend-Write-Only & RLS Hardening Tests');
  console.log('===============================================================\n');

  const migrationPath = path.resolve(
    process.cwd(),
    'supabase/migrations/20260904040000_games_themes_backend_write_only.sql'
  );
  const baselinePath = path.resolve(
    process.cwd(),
    'supabase/migrations/20260903000000_initial_baseline.sql'
  );
  const schemaPath = path.resolve(process.cwd(), 'supabase/schema.sql');

  // --------------------------------------------------------------------------
  // SECTION 1: Migration & Schema Policy Hardening
  // --------------------------------------------------------------------------
  console.log('--- Section 1: Migration & Schema Policy Hardening ---');

  await test('1a. Migration 20260904040000_games_themes_backend_write_only.sql exists', () => {
    assert.ok(fs.existsSync(migrationPath), 'Migration file must exist');
  });

  await test('1b. Migration drops vulnerable client mutation policies on public.games', () => {
    const content = fs.readFileSync(migrationPath, 'utf-8');
    assert.ok(
      content.includes('DROP POLICY IF EXISTS "Owners, admins, designers can insert games" ON public.games'),
      'Must drop client insert policy for games'
    );
    assert.ok(
      content.includes('DROP POLICY IF EXISTS "Owners, admins, designers can update games" ON public.games'),
      'Must drop client update policy for games'
    );
    assert.ok(
      content.includes('DROP POLICY IF EXISTS "Owners and admins can delete games" ON public.games'),
      'Must drop client delete policy for games'
    );
  });

  await test('1c. Migration drops vulnerable client mutation policies on public.game_themes', () => {
    const content = fs.readFileSync(migrationPath, 'utf-8');
    assert.ok(
      content.includes('DROP POLICY IF EXISTS "Owners, admins, designers can insert themes" ON public.game_themes'),
      'Must drop client insert policy for game_themes'
    );
    assert.ok(
      content.includes('DROP POLICY IF EXISTS "Owners, admins, designers can update themes" ON public.game_themes'),
      'Must drop client update policy for game_themes'
    );
    assert.ok(
      content.includes('DROP POLICY IF EXISTS "Owners and admins can delete themes" ON public.game_themes'),
      'Must drop client delete policy for game_themes'
    );
  });

  await test('1d. Migration revokes direct table mutation privileges on games and game_themes from client roles', () => {
    const content = fs.readFileSync(migrationPath, 'utf-8');
    assert.ok(
      content.includes('REVOKE INSERT, UPDATE, DELETE ON public.games FROM authenticated'),
      'Must revoke games mutations from authenticated'
    );
    assert.ok(
      content.includes('REVOKE INSERT, UPDATE, DELETE ON public.games FROM anon'),
      'Must revoke games mutations from anon'
    );
    assert.ok(
      content.includes('GRANT SELECT ON public.games TO authenticated'),
      'Must preserve SELECT for authenticated on games'
    );

    assert.ok(
      content.includes('REVOKE INSERT, UPDATE, DELETE ON public.game_themes FROM authenticated'),
      'Must revoke game_themes mutations from authenticated'
    );
    assert.ok(
      content.includes('REVOKE INSERT, UPDATE, DELETE ON public.game_themes FROM anon'),
      'Must revoke game_themes mutations from anon'
    );
    assert.ok(
      content.includes('GRANT SELECT ON public.game_themes TO authenticated'),
      'Must preserve SELECT for authenticated on game_themes'
    );
  });

  await test('1e. Migration installs defense-in-depth triggers protecting sensitive columns', () => {
    const content = fs.readFileSync(migrationPath, 'utf-8');
    assert.ok(
      content.includes('CREATE OR REPLACE FUNCTION public.prevent_game_unauthorized_client_mutations'),
      'Must create game trigger function'
    );
    assert.ok(
      content.includes('trg_prevent_game_unauthorized_client_mutations'),
      'Must attach trigger to public.games'
    );
    assert.ok(
      content.includes('CREATE OR REPLACE FUNCTION public.prevent_game_theme_unauthorized_client_mutations'),
      'Must create game_theme trigger function'
    );
    assert.ok(
      content.includes('trg_prevent_game_theme_unauthorized_client_mutations'),
      'Must attach trigger to public.game_themes'
    );

    const sensitiveThemeCols = ['organization_id', 'game_id', 'is_system', 'ownership_type'];
    for (const col of sensitiveThemeCols) {
      assert.ok(
        content.includes(col),
        `Theme trigger function must explicitly protect sensitive column ${col}`
      );
    }
  });

  await test('1f. Baseline migration and schema.sql do not contain vulnerable client mutation policies', () => {
    const baseline = fs.readFileSync(baselinePath, 'utf-8');
    const schema = fs.readFileSync(schemaPath, 'utf-8');

    for (const [name, content] of [['baseline', baseline], ['schema.sql', schema]]) {
      assert.ok(
        !content.includes('CREATE POLICY "Owners, admins, designers can insert games"'),
        `${name} must not contain vulnerable insert policy for games`
      );
      assert.ok(
        !content.includes('CREATE POLICY "Owners, admins, designers can update games"'),
        `${name} must not contain vulnerable update policy for games`
      );
      assert.ok(
        !content.includes('CREATE POLICY "Owners and admins can delete games"'),
        `${name} must not contain vulnerable delete policy for games`
      );

      assert.ok(
        !content.includes('CREATE POLICY "Owners, admins, designers can insert themes"'),
        `${name} must not contain vulnerable insert policy for game_themes`
      );
      assert.ok(
        !content.includes('CREATE POLICY "Owners, admins, designers can update themes"'),
        `${name} must not contain vulnerable update policy for game_themes`
      );
      assert.ok(
        !content.includes('CREATE POLICY "Owners and admins can delete themes"'),
        `${name} must not contain vulnerable delete policy for game_themes`
      );

      assert.ok(
        content.includes('REVOKE INSERT, UPDATE, DELETE ON public.games FROM authenticated'),
        `${name} must revoke client mutations on games`
      );
      assert.ok(
        content.includes('REVOKE INSERT, UPDATE, DELETE ON public.game_themes FROM authenticated'),
        `${name} must revoke client mutations on game_themes`
      );
    }
  });

  // --------------------------------------------------------------------------
  // SECTION 2: Worker API Attack Scenarios & Boundary Enforcements
  // --------------------------------------------------------------------------
  console.log('\n--- Section 2: Worker API Attack Scenarios & Guard Verification ---');

  const workerEnv = {
    JWT_SECRET: '0123456789abcdef0123456789abcdef',
    SUPABASE_URL: 'https://placeholder.supabase.co',
    SUPABASE_ANON_KEY: 'placeholder-anon-key',
    SUPABASE_SERVICE_ROLE_KEY: 'placeholder-service-key',
    NODE_ENV: 'development',
  };

  const user = await createUser({
    email: `game_theme_owner_${Date.now()}@example.com`,
    name: 'Game Theme Organizer',
    is_developer: false,
  }, workerEnv);

  const otherUser = await createUser({
    email: `other_org_owner_${Date.now()}@example.com`,
    name: 'Other Org Owner',
    is_developer: false,
  }, workerEnv);

  const org = await createOrganization({
    name: 'Alpha Interactive Org',
    owner_id: user.id,
  }, workerEnv);

  const otherOrg = await createOrganization({
    name: 'Beta Foreign Org',
    owner_id: otherUser.id,
  }, workerEnv);

  const games = await getAvailableGamesForStudio(org.id, workerEnv);
  const catchBrandGame = games.find((g) => g.game_type === 'catch-brand') || games[0];
  const memoryMatchGame = games.find((g) => g.game_type === 'memory-match') || games[1] || await createGame({
    organization_id: org.id,
    name: 'Memory Match Game',
    game_type: 'memory-match',
  }, workerEnv);

  // System theme (read-only template)
  const systemTheme = await createTheme({
    organization_id: null,
    game_id: catchBrandGame.id,
    name: 'System Default Catch Theme',
    is_system: true,
  }, workerEnv);

  // Organization-owned theme
  const orgTheme = await createTheme({
    organization_id: org.id,
    game_id: catchBrandGame.id,
    name: 'Org Custom Catch Theme',
    is_system: false,
  }, workerEnv);

  const token = await signAppToken(
    user.id,
    org.id,
    'owner',
    workerEnv.JWT_SECRET,
    workerEnv
  );

  const otherToken = await signAppToken(
    otherUser.id,
    otherOrg.id,
    'owner',
    workerEnv.JWT_SECRET,
    workerEnv
  );

  await test('2a. Worker rejects PUT /api/themes/:id attempting cross-game tampering (game_id alteration)', async () => {
    // Attack: Switch Catch The Brand theme to Memory Match game
    const req = new Request(`http://localhost/api/themes/${orgTheme.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        name: 'Tampered Theme',
        game_id: memoryMatchGame.id, // Forbidden alteration!
      }),
    });

    const res = await worker.fetch(req, workerEnv, {} as any);
    assert.strictEqual(res.status, 400, 'Must respond with 400 Bad Request');
    const json = (await res.json()) as any;
    assert.ok(
      json.error && json.error.includes('immutable'),
      `Error must indicate game association is immutable, got: ${json.error}`
    );
  });

  await test('2b. Worker rejects PUT /api/themes/:id attempting privilege escalation to system theme (is_system = true)', async () => {
    // Attack: Mark organization theme as system theme
    const req = new Request(`http://localhost/api/themes/${orgTheme.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        name: 'Escalated System Theme',
        is_system: true, // Forbidden alteration!
      }),
    });

    const res = await worker.fetch(req, workerEnv, {} as any);
    assert.strictEqual(res.status, 400, 'Must respond with 400 Bad Request');
    const json = (await res.json()) as any;
    assert.ok(
      json.error && json.error.includes('is_system'),
      `Error must indicate is_system cannot be modified, got: ${json.error}`
    );
  });

  await test('2c. Worker rejects PUT /api/themes/:id attempting tenant hijacking (organization_id alteration)', async () => {
    // Attack: Reassign organization_id to another org
    const req = new Request(`http://localhost/api/themes/${orgTheme.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        name: 'Hijacked Theme',
        organization_id: otherOrg.id, // Forbidden alteration!
      }),
    });

    const res = await worker.fetch(req, workerEnv, {} as any);
    assert.strictEqual(res.status, 400, 'Must respond with 400 Bad Request');
    const json = (await res.json()) as any;
    assert.ok(
      json.error && json.error.includes('organization_id'),
      `Error must indicate organization_id cannot be modified, got: ${json.error}`
    );
  });

  await test('2d. Worker rejects PUT /api/themes/:id attempting ownership_type alteration', async () => {
    const req = new Request(`http://localhost/api/themes/${orgTheme.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        name: 'Tampered Ownership Theme',
        ownership_type: 'system', // Forbidden alteration!
      }),
    });

    const res = await worker.fetch(req, workerEnv, {} as any);
    assert.strictEqual(res.status, 400, 'Must respond with 400 Bad Request');
    const json = (await res.json()) as any;
    assert.ok(
      json.error && json.error.includes('ownership_type'),
      `Error must indicate ownership_type cannot be modified, got: ${json.error}`
    );
  });

  await test('2e. Worker rejects PUT /api/themes/:id on system themes (read-only template protection)', async () => {
    // Non-developer attempting to edit a system theme
    const req = new Request(`http://localhost/api/themes/${systemTheme.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        name: 'Tampered System Theme',
      }),
    });

    const res = await worker.fetch(req, workerEnv, {} as any);
    assert.strictEqual(res.status, 403, 'Must respond with 403 Forbidden');
    const json = (await res.json()) as any;
    assert.ok(
      json.error && json.error.includes('System themes are read-only'),
      `Error must state system themes are read-only, got: ${json.error}`
    );
  });

  await test('2f. Worker rejects DELETE /api/themes/:id on system themes', async () => {
    const req = new Request(`http://localhost/api/themes/${systemTheme.id}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const res = await worker.fetch(req, workerEnv, {} as any);
    assert.strictEqual(res.status, 403, 'Must respond with 403 Forbidden');
    const json = (await res.json()) as any;
    assert.ok(
      json.error && json.error.includes('System themes are read-only'),
      `Error must state system themes cannot be deleted, got: ${json.error}`
    );
  });

  await test('2g. Worker rejects DELETE /api/themes/:id across tenant boundaries', async () => {
    // Other org attempting to delete Alpha Org's theme
    const req = new Request(`http://localhost/api/themes/${orgTheme.id}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${otherToken}`,
      },
    });

    const res = await worker.fetch(req, workerEnv, {} as any);
    assert.strictEqual(res.status, 403, 'Must respond with 403 Forbidden');
  });

  await test('2h. Worker rejects POST /api/themes attempting to create a system theme directly', async () => {
    const req = new Request('http://localhost/api/themes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        game_id: catchBrandGame.id,
        name: 'Unauthorized Global Theme',
        is_system: true, // Non-developer cannot create system theme!
      }),
    });

    const res = await worker.fetch(req, workerEnv, {} as any);
    assert.strictEqual(res.status, 403, 'Must respond with 403 Forbidden');
    const json = (await res.json()) as any;
    assert.ok(
      json.error && json.error.includes('Only developer admins can create system themes'),
      `Got: ${json.error}`
    );
  });

  await test('2i. Worker rejects PUT /api/games/:id/customization altering structural columns', async () => {
    const req = new Request(`http://localhost/api/games/${catchBrandGame.id}/customization`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        organization_id: otherOrg.id,
        game_type: 'memory-match',
        slug: 'hacked-slug',
        is_system: true,
      }),
    });

    const res = await worker.fetch(req, workerEnv, {} as any);
    assert.strictEqual(res.status, 400, 'Must respond with 400 Bad Request');
    const json = (await res.json()) as any;
    assert.ok(
      json.error && json.error.includes('structural columns'),
      `Got: ${json.error}`
    );
  });

  // --------------------------------------------------------------------------
  // SECTION 3: Legitimate Mutation Operations Succeed
  // --------------------------------------------------------------------------
  console.log('\n--- Section 3: Legitimate Mutation Operations Succeed ---');

  let newlyCreatedThemeId: string;

  await test('3a. Legitimate POST /api/themes creates an organization theme', async () => {
    const req = new Request('http://localhost/api/themes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        game_id: catchBrandGame.id,
        name: 'Legitimate Summer Fiesta Theme',
        styling: { primary_color: '#FF5733' },
      }),
    });

    const res = await worker.fetch(req, workerEnv, {} as any);
    assert.strictEqual(res.status, 201, `Expected 201, got ${res.status}`);
    const json = (await res.json()) as any;
    assert.strictEqual(json.name, 'Legitimate Summer Fiesta Theme');
    assert.strictEqual(json.organization_id, org.id);
    assert.strictEqual(json.game_id, catchBrandGame.id);
    assert.strictEqual(json.is_system, false);
    newlyCreatedThemeId = json.id;
  });

  await test('3b. Legitimate PUT /api/themes/:id updates styling and assets', async () => {
    const req = new Request(`http://localhost/api/themes/${newlyCreatedThemeId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        name: 'Updated Summer Fiesta Theme',
        styling: { primary_color: '#00AAFF', font_family: 'Inter' },
        items_config: [{ id: 'item_1', name: 'Pineapple', score: 10 }],
      }),
    });

    const res = await worker.fetch(req, workerEnv, {} as any);
    assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
    const json = (await res.json()) as any;
    assert.strictEqual(json.name, 'Updated Summer Fiesta Theme');
    assert.strictEqual(json.styling.primary_color, '#00AAFF');
  });

  await test('3c. Legitimate PUT /api/games/:id/customization updates game settings', async () => {
    const req = new Request(`http://localhost/api/games/${catchBrandGame.id}/customization`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        name: 'Brand Catch Special Edition',
        settings: { duration: 60, difficulty: 'hard' },
      }),
    });

    const res = await worker.fetch(req, workerEnv, {} as any);
    assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
    const json = (await res.json()) as any;
    assert.strictEqual(json.name, 'Brand Catch Special Edition');
  });

  await test('3d. Legitimate DELETE /api/themes/:id removes organization theme', async () => {
    const req = new Request(`http://localhost/api/themes/${newlyCreatedThemeId}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const res = await worker.fetch(req, workerEnv, {} as any);
    assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);

    const fetched = await getThemeById(newlyCreatedThemeId, workerEnv);
    assert.strictEqual(fetched, null, 'Deleted theme must no longer exist');
  });

  await test('3e. Legitimate POST /api/themes creates Memory Match theme with user exact payload', async () => {
    const req = new Request('http://localhost/api/themes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        name: 'ewf',
        slug: 'ewf',
        game_id: memoryMatchGame.id,
        game_slug: 'memory-match',
        game_type: 'memory-match',
        background_url: null,
        basket_config: null,
        items_config: [],
        branding: {
          gameTitle: 'EWF',
          subtitle: 'Flip and match pairs in ewf!',
          logoUrl: null,
          clientLogoUrl: null,
        },
        layout: {
          clientLogo: { visible: true, x: 4, y: 4, width: 14 },
          scoreHud: { visible: true, x: 4, y: 15, width: 18 },
        },
        physics_config: {
          gameDurationSeconds: 45,
          baseFallSpeed: 0,
          fallSpeedMultiplier: 1,
          spawnIntervalMin: 0,
        },
        sounds_config: {
          soundVolume: 0.8,
          soundEnabled: true,
          bgmEnabled: true,
        },
        visuals_config: {
          cardBackUrl: null,
          cardFrontBg: '#0f172a',
          cardFrontBgOpacity: 0.95,
          particleGood: 'particle_gold',
        },
        description: 'Custom Memory Match theme: ewf',
      }),
    });

    const res = await worker.fetch(req, workerEnv, {} as any);
    assert.strictEqual(res.status, 201, `Expected 201, got ${res.status}`);
    const json = (await res.json()) as any;
    assert.strictEqual(json.name, 'ewf');
    assert.strictEqual(json.game_type, 'memory-match');
    assert.strictEqual(json.organization_id, org.id);
  });

  console.log('\n===============================================================');
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log('===============================================================');

  if (failed > 0) {
    process.exit(1);
  }
  process.exit(0);
}

runGamesThemesBackendWriteOnlyTests().catch((err) => {
  console.error('Test execution error:', err);
  process.exit(1);
});
