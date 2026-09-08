import assert from 'node:assert';
import { PERMISSIONS, hasRolePermission, verifyOrgMembershipAndPermission, signAppToken } from './auth';
import { createUser, createOrganization, addMember, createEvent, createTheme } from './db';
import worker from '../worker';

console.log('======================================================');
console.log('Running Granular Event Mutation Permissions Tests');
console.log('======================================================\n');

async function runTests() {
  const workerEnv = {
    JWT_SECRET: '0123456789abcdef0123456789abcdef',
    SUPABASE_URL: 'https://placeholder.supabase.co',
    SUPABASE_ANON_KEY: 'placeholder-anon-key',
    SUPABASE_SERVICE_ROLE_KEY: 'placeholder-service-key',
    NODE_ENV: 'development',
  };

  // --------------------------------------------------------------------------
  // SECTION 1: Static Role & Permission Matrix Verification
  // --------------------------------------------------------------------------
  console.log('--- Section 1: Role & Permission Matrix Verification ---');

  // Test 1: Owner has all event permissions
  const expectedOwnerEventPerms = [
    'event.view',
    'event.create',
    'event.edit',
    'event.cancel',
    'event.pay',
    'event.manage',
  ];
  for (const perm of expectedOwnerEventPerms) {
    assert.ok(
      PERMISSIONS.owner.includes(perm),
      `Owner role must include permission: ${perm}`
    );
    assert.ok(
      hasRolePermission('owner', perm),
      `hasRolePermission('owner', '${perm}') must return true`
    );
  }
  console.log('  ✓ 1a. Owner possesses all granular event permissions');

  // Test 2: Admin has all event permissions
  for (const perm of expectedOwnerEventPerms) {
    assert.ok(
      PERMISSIONS.admin.includes(perm),
      `Admin role must include permission: ${perm}`
    );
    assert.ok(
      hasRolePermission('admin', perm),
      `hasRolePermission('admin', '${perm}') must return true`
    );
  }
  console.log('  ✓ 1b. Admin possesses all granular event permissions');

  // Test 3: Designer has event.view but CANNOT mutate event configuration
  assert.ok(
    PERMISSIONS.designer.includes('event.view'),
    'Designer role must include event.view'
  );
  assert.ok(
    hasRolePermission('designer', 'event.view'),
    'hasRolePermission(\'designer\', \'event.view\') must return true'
  );

  const restrictedEventPermsForDesigner = [
    'event.create',
    'event.edit',
    'event.cancel',
    'event.pay',
    'event.manage',
  ];
  for (const perm of restrictedEventPermsForDesigner) {
    assert.ok(
      !PERMISSIONS.designer.includes(perm),
      `Designer role MUST NOT include event mutation permission: ${perm}`
    );
    assert.strictEqual(
      hasRolePermission('designer', perm),
      false,
      `hasRolePermission('designer', '${perm}') must return false`
    );
  }
  console.log('  ✓ 1c. Designer has event.view but is strictly excluded from event mutation permissions');

  // Test 4: Designer retains game/theme editing capabilities
  const designerGamePerms = [
    'game.view',
    'game.items.view',
    'game.background.edit',
    'game.items.edit',
    'game.basket.edit',
    'game.settings.edit',
  ];
  for (const perm of designerGamePerms) {
    assert.ok(
      PERMISSIONS.designer.includes(perm),
      `Designer role must retain game editing permission: ${perm}`
    );
    assert.ok(
      hasRolePermission('designer', perm),
      `hasRolePermission('designer', '${perm}') must return true`
    );
  }
  console.log('  ✓ 1d. Designer retains full game & theme customization permissions');

  // Test 5: Viewer is view-only
  assert.ok(PERMISSIONS.viewer.includes('event.view'), 'Viewer must have event.view');
  assert.ok(PERMISSIONS.viewer.includes('game.view'), 'Viewer must have game.view');
  for (const perm of [...restrictedEventPermsForDesigner, 'game.items.edit']) {
    assert.ok(!PERMISSIONS.viewer.includes(perm), `Viewer must not have permission: ${perm}`);
    assert.strictEqual(hasRolePermission('viewer', perm), false);
  }
  console.log('  ✓ 1e. Viewer is restricted to read-only access');

  // --------------------------------------------------------------------------
  // SECTION 2: Dynamic Membership & Permission Verification
  // --------------------------------------------------------------------------
  console.log('\n--- Section 2: Dynamic Membership & Permission Checks ---');

  const ownerUser = await createUser({
    email: `owner_${Date.now()}@example.com`,
    name: 'Org Owner',
    is_developer: false,
  }, workerEnv);

  const org = await createOrganization({
    name: 'Permissions Test Org',
    owner_id: ownerUser.id,
  }, workerEnv);

  const adminUser = await createUser({
    email: `admin_${Date.now()}@example.com`,
    name: 'Org Admin',
    is_developer: false,
  }, workerEnv);
  await addMember({ organization_id: org.id, user_id: adminUser.id, role: 'admin' }, workerEnv);

  const designerUser = await createUser({
    email: `designer_${Date.now()}@example.com`,
    name: 'Org Designer',
    is_developer: false,
  }, workerEnv);
  await addMember({ organization_id: org.id, user_id: designerUser.id, role: 'designer' }, workerEnv);

  const viewerUser = await createUser({
    email: `viewer_${Date.now()}@example.com`,
    name: 'Org Viewer',
    is_developer: false,
  }, workerEnv);
  await addMember({ organization_id: org.id, user_id: viewerUser.id, role: 'viewer' }, workerEnv);

  // Test verifyOrgMembershipAndPermission for Owner on event.edit
  const ownerCheck = await verifyOrgMembershipAndPermission(ownerUser.id, org.id, 'event.edit', workerEnv);
  assert.strictEqual(ownerCheck.isMember, true);
  assert.strictEqual(ownerCheck.hasPermission, true);
  assert.strictEqual(ownerCheck.role, 'owner');

  // Test verifyOrgMembershipAndPermission for Admin on event.create
  const adminCheck = await verifyOrgMembershipAndPermission(adminUser.id, org.id, 'event.create', workerEnv);
  assert.strictEqual(adminCheck.isMember, true);
  assert.strictEqual(adminCheck.hasPermission, true);
  assert.strictEqual(adminCheck.role, 'admin');

  // Test verifyOrgMembershipAndPermission for Designer on event.edit
  const designerEditCheck = await verifyOrgMembershipAndPermission(designerUser.id, org.id, 'event.edit', workerEnv);
  assert.strictEqual(designerEditCheck.isMember, true);
  assert.strictEqual(designerEditCheck.hasPermission, false);
  assert.strictEqual(designerEditCheck.role, 'designer');

  // Test verifyOrgMembershipAndPermission for Designer on event.view
  const designerViewCheck = await verifyOrgMembershipAndPermission(designerUser.id, org.id, 'event.view', workerEnv);
  assert.strictEqual(designerViewCheck.isMember, true);
  assert.strictEqual(designerViewCheck.hasPermission, true);
  assert.strictEqual(designerViewCheck.role, 'designer');

  // Test verifyOrgMembershipAndPermission for Designer on game.items.edit
  const designerGameCheck = await verifyOrgMembershipAndPermission(designerUser.id, org.id, 'game.items.edit', workerEnv);
  assert.strictEqual(designerGameCheck.isMember, true);
  assert.strictEqual(designerGameCheck.hasPermission, true);

  console.log('  ✓ 2a. verifyOrgMembershipAndPermission correctly computes hasPermission per role');

  // --------------------------------------------------------------------------
  // SECTION 3: HTTP API Worker Enforcement
  // --------------------------------------------------------------------------
  console.log('\n--- Section 3: HTTP API Worker Enforcement ---');

  // Create a theme first
  const theme = await createTheme({
    organization_id: org.id,
    game_id: 'catch-brand',
    name: 'Test Theme',
  }, workerEnv);

  // Create an event as Owner
  const event = await createEvent({
    organization_id: org.id,
    game_id: 'catch-brand',
    game_theme_id: theme.id,
    name: 'Annual Gala',
    start_date: '2026-10-01',
    end_date: '2026-10-02',
    event_price: 1900,
    payment_status: 'UNPAID',
    event_status: 'DRAFT',
    created_by: ownerUser.id,
  }, workerEnv);

  const designerJwt = await signAppToken(designerUser.id, org.id, 'designer', workerEnv.JWT_SECRET, workerEnv);
  const ownerJwt = await signAppToken(ownerUser.id, org.id, 'owner', workerEnv.JWT_SECRET, workerEnv);

  // Test 3a: Designer cannot modify event configuration (PUT /api/events/:eventId)
  const designerPutRes = await worker.fetch(
    new Request(`https://api.eventgamestudio.local/api/events/${event.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${designerJwt}`,
      },
      body: JSON.stringify({
        name: 'Hacked by Designer',
        start_date: '2026-11-01',
      }),
    }),
    workerEnv
  );
  assert.strictEqual(
    designerPutRes.status,
    403,
    'Designer attempting PUT /api/events/:id must be rejected with 403 Forbidden'
  );
  const designerPutBody = await designerPutRes.json() as any;
  assert.ok(
    designerPutBody.error.toLowerCase().includes('permission denied') ||
    designerPutBody.error.toLowerCase().includes('only owners and admins'),
    `Error message should explain permission requirement, got: ${designerPutBody.error}`
  );
  console.log('  ✓ 3a. Designer blocked from modifying event configuration (PUT /api/events/:id)');

  // Test 3b: Designer cannot create events (POST /api/events)
  const designerCreateRes = await worker.fetch(
    new Request('https://api.eventgamestudio.local/api/events', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${designerJwt}`,
      },
      body: JSON.stringify({
        name: 'Designer Rogue Event',
        game_id: 'catch-brand',
        game_theme_id: theme.id,
        start_date: '2026-12-01',
        end_date: '2026-12-02',
      }),
    }),
    workerEnv
  );
  assert.strictEqual(
    designerCreateRes.status,
    403,
    'Designer attempting POST /api/events must be rejected with 403 Forbidden'
  );
  console.log('  ✓ 3b. Designer blocked from creating events (POST /api/events)');

  // Test 3c: Designer cannot pay for events (POST /api/events/:id/pay)
  const designerPayRes = await worker.fetch(
    new Request(`https://api.eventgamestudio.local/api/events/${event.id}/pay`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${designerJwt}`,
      },
      body: JSON.stringify({
        payment_mode: 'FULL_PAID',
      }),
    }),
    workerEnv
  );
  assert.strictEqual(
    designerPayRes.status,
    403,
    'Designer attempting POST /api/events/:id/pay must be rejected with 403 Forbidden'
  );
  console.log('  ✓ 3c. Designer blocked from initiating event payments (POST /api/events/:id/pay)');

  // Test 3d: Designer cannot cancel events (POST /api/events/:id/cancel)
  const designerCancelRes = await worker.fetch(
    new Request(`https://api.eventgamestudio.local/api/events/${event.id}/cancel`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${designerJwt}`,
      },
      body: JSON.stringify({
        cancel_reason: 'Testing cancellation',
      }),
    }),
    workerEnv
  );
  assert.strictEqual(
    designerCancelRes.status,
    403,
    'Designer attempting POST /api/events/:id/cancel must be rejected with 403 Forbidden'
  );
  console.log('  ✓ 3d. Designer blocked from cancelling events (POST /api/events/:id/cancel)');

  // Test 3e: Designer cannot delete events (DELETE /api/events/:id)
  const designerDeleteRes = await worker.fetch(
    new Request(`https://api.eventgamestudio.local/api/events/${event.id}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${designerJwt}`,
      },
    }),
    workerEnv
  );
  assert.strictEqual(
    designerDeleteRes.status,
    403,
    'Designer attempting DELETE /api/events/:id must be rejected with 403 Forbidden'
  );
  console.log('  ✓ 3e. Designer blocked from deleting events (DELETE /api/events/:id)');

  // Test 3f: Designer CAN view events (GET /api/events)
  const designerGetEventsRes = await worker.fetch(
    new Request('https://api.eventgamestudio.local/api/events', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${designerJwt}`,
      },
    }),
    workerEnv
  );
  assert.strictEqual(
    designerGetEventsRes.status,
    200,
    'Designer must be able to view events (GET /api/events)'
  );
  console.log('  ✓ 3f. Designer allowed to view events (GET /api/events)');

  // Test 3g: Designer CAN edit game themes (PUT /api/themes/:themeId)
  const designerThemeRes = await worker.fetch(
    new Request(`https://api.eventgamestudio.local/api/themes/${theme.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${designerJwt}`,
      },
      body: JSON.stringify({
        name: 'Updated Theme by Designer',
      }),
    }),
    workerEnv
  );
  assert.strictEqual(
    designerThemeRes.status,
    200,
    'Designer must be permitted to edit game themes'
  );
  console.log('  ✓ 3g. Designer successfully modifies game theme (PUT /api/themes/:id)');

  // Test 3h: Owner CAN modify event configuration (PUT /api/events/:id)
  const ownerPutRes = await worker.fetch(
    new Request(`https://api.eventgamestudio.local/api/events/${event.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ownerJwt}`,
      },
      body: JSON.stringify({
        name: 'Renamed by Owner',
      }),
    }),
    workerEnv
  );
  assert.strictEqual(
    ownerPutRes.status,
    200,
    'Owner must be allowed to edit event configuration'
  );
  const ownerPutBody = await ownerPutRes.json() as any;
  assert.strictEqual(ownerPutBody.event.name, 'Renamed by Owner');
  console.log('  ✓ 3h. Owner successfully modifies event configuration (PUT /api/events/:id)');

  // Test 3i: Designer blocked from creating showcase (POST /api/events/:id/showcase)
  const completedEvent = await createEvent({
    organization_id: org.id,
    game_id: 'catch-brand',
    game_theme_id: theme.id,
    name: 'Completed Gala',
    start_date: '2026-09-01',
    end_date: '2026-09-02',
    event_price: 1900,
    payment_status: 'PAID',
    event_status: 'COMPLETED',
    created_by: ownerUser.id,
  }, workerEnv);

  const designerShowcaseRes = await worker.fetch(
    new Request(`https://api.eventgamestudio.local/api/events/${completedEvent.id}/showcase`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${designerJwt}`,
      },
      body: JSON.stringify({
        title: 'Unauthorized Showcase',
      }),
    }),
    workerEnv
  );
  assert.strictEqual(
    designerShowcaseRes.status,
    403,
    'Designer must be blocked from creating event showcase'
  );
  console.log('  ✓ 3i. Designer blocked from creating event showcase (POST /api/events/:id/showcase)');

  // Test 3j: Owner can create event showcase (POST /api/events/:id/showcase)
  const ownerShowcaseRes = await worker.fetch(
    new Request(`https://api.eventgamestudio.local/api/events/${completedEvent.id}/showcase`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ownerJwt}`,
      },
      body: JSON.stringify({
        title: 'Official Gala Showcase',
      }),
    }),
    workerEnv
  );
  assert.strictEqual(
    ownerShowcaseRes.status,
    201,
    'Owner must be allowed to create event showcase'
  );
  console.log('  ✓ 3j. Owner successfully creates event showcase (POST /api/events/:id/showcase)');

  console.log('\n======================================================');
  console.log('All Granular Event Permission Tests Passed Successfully!');
  console.log('======================================================');
}

runTests().catch((err) => {
  console.error('Test failure:', err);
  process.exit(1);
});
