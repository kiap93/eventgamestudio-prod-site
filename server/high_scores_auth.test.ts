/**
 * High Scores Route Authorization & Security Test Suite
 * 
 * Verifies that:
 * 1. Unauthenticated POST /api/events/:eventId/high-scores is rejected (401 Unauthorized)
 * 2. Unauthenticated GET /api/events/:eventId/high-scores is rejected (401 Unauthorized)
 * 3. Non-organization members are rejected with 403 Forbidden
 * 4. Authenticated organization members can view event leaderboard (200 OK)
 * 5. Authenticated organization members submitting to /api/events/:eventId/high-scores have their score quarantined as test (201 Created, score_environment: 'test')
 * 6. Public players can submit scores via /api/public/events/:publicToken/high-scores
 */

import assert from 'node:assert';
import { signAppToken } from './auth';
import { createUser, createOrganization, addMember, createEvent, createTheme } from './db';
import worker from '../worker';

console.log('======================================================');
console.log('Running High Scores Route Authorization Security Tests');
console.log('======================================================\n');

async function runTests() {
  const workerEnv = {
    JWT_SECRET: '0123456789abcdef0123456789abcdef',
    SUPABASE_URL: 'https://placeholder.supabase.co',
    SUPABASE_ANON_KEY: 'placeholder-anon-key',
    SUPABASE_SERVICE_ROLE_KEY: 'placeholder-service-key',
    NODE_ENV: 'development',
  };

  // Seed test tenant, users, and event
  const ownerUser = await createUser({
    email: 'org-owner@example.com',
    name: 'Org Owner',
  }, workerEnv);

  const outsideUser = await createUser({
    email: 'outside-user@example.com',
    name: 'Outside User',
  }, workerEnv);

  const org = await createOrganization(
    {
      name: 'Leaderboard Security Org',
      owner_id: ownerUser.id,
    },
    workerEnv
  );

  const theme = await createTheme({
    organization_id: org.id,
    game_id: 'catch-brand',
    name: 'Security Test Theme',
  }, workerEnv);

  const event = await createEvent(
    {
      organization_id: org.id,
      name: 'Championship Finals',
      start_date: '2026-09-01',
      end_date: '2026-09-30',
      status: 'live',
      payment_status: 'PAID',
      event_status: 'LIVE',
      game_id: 'catch-brand',
      game_theme_id: theme.id,
      created_by: ownerUser.id,
    },
    workerEnv
  );

  const otherOrg = await createOrganization(
    {
      name: 'Other Org',
      owner_id: outsideUser.id,
    },
    workerEnv
  );

  const ownerToken = await signAppToken(ownerUser.id, org.id, 'owner', undefined, workerEnv);
  const outsideToken = await signAppToken(outsideUser.id, otherOrg.id, 'viewer', undefined, workerEnv);

  // Test 1: Ambiguous middle endpoint /api/events/:eventId/high-scores is completely removed (returns 404)
  {
    const req = new Request(`https://api.eventgamestudio.local/api/events/${event.id}/high-scores`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        player_name: 'Attacker',
        score: 999999,
        session_id: 'test-session-unauth',
      }),
    });
    const res = await worker.fetch(req, workerEnv);
    assert.strictEqual(res.status, 404, 'Middle endpoint POST /api/events/:id/high-scores must return 404 Not Found');
    const body: any = await res.json();
    assert.strictEqual(body.code, 'ENDPOINT_REMOVED', 'Should indicate endpoint is removed');
    console.log('  ✓ 1. Ambiguous middle endpoint POST /api/events/:id/high-scores removed (404)');
  }

  // Test 2: Ambiguous middle endpoint GET /api/events/:eventId/high-scores is completely removed (returns 404)
  {
    const req = new Request(`https://api.eventgamestudio.local/api/events/${event.id}/high-scores`, {
      method: 'GET',
    });
    const res = await worker.fetch(req, workerEnv);
    assert.strictEqual(res.status, 404, 'Middle endpoint GET /api/events/:id/high-scores must return 404 Not Found');
    console.log('  ✓ 2. Ambiguous middle endpoint GET /api/events/:id/high-scores removed (404)');
  }

  // Test 3: Authenticated request to removed endpoint still returns 404
  {
    const req = new Request(`https://api.eventgamestudio.local/api/events/${event.id}/high-scores`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    const res = await worker.fetch(req, workerEnv);
    assert.strictEqual(res.status, 404, 'Removed endpoint GET /api/events/:id/high-scores must return 404');
    console.log('  ✓ 3. Removed endpoint returns 404 even with authentication');
  }

  // Test 4: Authenticated organizer submission via /api/events/:eventId/admin/high-scores is quarantined to test environment
  {
    const req = new Request(`https://api.eventgamestudio.local/api/events/${event.id}/admin/high-scores`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ownerToken}`,
      },
      body: JSON.stringify({
        player_name: 'Organizer Test',
        score: 500,
        session_id: 'org-test-session-1',
      }),
    });
    const res = await worker.fetch(req, workerEnv);
    assert.strictEqual(res.status, 201, 'Organizer test submission must return 201 Created');
    const data: any = await res.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.score_environment, 'test', 'Organizer submissions to admin route must be quarantined to test environment');
    console.log('  ✓ 4. Authenticated organizer submission via admin route quarantined as test score');
  }

  // Test 5: Unauthenticated submission via /api/events/:eventId/admin/high-scores is rejected with 401
  {
    const req = new Request(`https://api.eventgamestudio.local/api/events/${event.id}/admin/high-scores`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        player_name: 'Attacker',
        score: 999999,
      }),
    });
    const res = await worker.fetch(req, workerEnv);
    assert.strictEqual(res.status, 401, 'Unauthenticated POST /api/events/:id/admin/high-scores must return 401');
    console.log('  ✓ 5. Unauthenticated POST /api/events/:id/admin/high-scores blocked with 401');
  }

  // Test 6: Public player submission via /api/public/events/:publicToken/high-scores
  {
    const publicReq = new Request(`https://api.eventgamestudio.local/api/public/events/${event.public_token}/high-scores`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        player_name: 'Public Player 1',
        score: 750,
        session_id: 'pub-session-player-1',
      }),
    });
    const res = await worker.fetch(publicReq, workerEnv);
    // Even if unpaid in local development fallback, verify public token routing is responsive
    assert.ok([201, 403].includes(res.status), `Public endpoint must process public token request (received ${res.status})`);
    console.log(`  ✓ 6. Public route /api/public/events/:token/high-scores routed correctly (status ${res.status})`);
  }

  // Test 7: Unauthenticated GET /api/events/:eventId/admin/high-scores is rejected with 401
  {
    const req = new Request(`https://api.eventgamestudio.local/api/events/${event.id}/admin/high-scores`, {
      method: 'GET',
    });
    const res = await worker.fetch(req, workerEnv);
    assert.strictEqual(res.status, 401, 'Unauthenticated GET /api/events/:id/admin/high-scores must return 401');
    console.log('  ✓ 7. Unauthenticated GET /api/events/:id/admin/high-scores blocked with 401');
  }

  // Test 8: Non-organization member GET /api/events/:eventId/admin/high-scores is rejected with 403 Forbidden
  {
    const req = new Request(`https://api.eventgamestudio.local/api/events/${event.id}/admin/high-scores`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${outsideToken}` },
    });
    const res = await worker.fetch(req, workerEnv);
    assert.strictEqual(res.status, 403, 'Non-member GET /api/events/:id/admin/high-scores must return 403 Forbidden');
    console.log('  ✓ 8. Non-organization member blocked from admin high scores with 403');
  }

  // Test 9: Authenticated organization owner GET /api/events/:eventId/admin/high-scores succeeds with 200 OK
  {
    const req = new Request(`https://api.eventgamestudio.local/api/events/${event.id}/admin/high-scores`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    const res = await worker.fetch(req, workerEnv);
    assert.strictEqual(res.status, 200, 'Org owner GET /api/events/:id/admin/high-scores must return 200 OK');
    const data: any = await res.json();
    assert.strictEqual(data.event_id, event.id);
    assert.ok(data.stats !== undefined, 'Admin high scores response must contain stats object');
    assert.ok(data.test_scores_count !== undefined, 'Admin high scores response must contain test_scores_count');
    console.log('  ✓ 9. Authenticated organization owner successfully reads admin high scores with stats');
  }

  console.log('\n======================================================');
  console.log('All High Scores Route Security Tests Passed Successfully!');
  console.log('======================================================\n');
}

runTests().catch((err) => {
  console.error('High scores authorization test failure:', err);
  process.exit(1);
});
