/**
 * Organization Last Login Tracking Test Suite
 * 
 * Verifies:
 * 1. recordUserAndOrganizationLogin updates user.last_login_at.
 * 2. recordUserAndOrganizationLogin updates organization.last_login_at and organization.last_login_user_id for owner.
 * 3. recordUserAndOrganizationLogin updates organization.last_login_at and organization.last_login_user_id for members.
 * 4. Multi-organization membership updates all relevant organizations on login.
 * 5. Unrelated organizations remain unaffected.
 * 6. Never-logged-in organizations have last_login_at: null.
 * 7. getAllOrganizationsForDeveloper includes last_login_at, last_login_user_id, last_login_user_name, last_login_user_email.
 * 8. getOrganizationDetailForDeveloper includes last_login_at and last_login_user.
 * 9. formatLastLoginDate formats timestamps in Asia/Singapore (UTC+8) and safely handles null.
 * 10. Non-blocking error resilience: invalid input does not throw.
 */

import assert from 'node:assert';
import {
  recordUserAndOrganizationLogin,
  getAllOrganizationsForDeveloper,
  getOrganizationDetailForDeveloper,
  localOrgsCache,
} from './db/organizations.js';
import { localUsersCache } from './db/users.js';
import { localMembersCache } from './db/members.js';
import { formatLastLoginDate } from '../src/components/developer/DeveloperOrganizationsList.js';

console.log('--- Starting Organization Last Login Tracking Tests ---');

async function runTests() {
  // Setup mock data in local memory caches
  const user1 = {
    id: 'user-login-test-1',
    google_id: 'google-sub-1',
    email: 'alice@example.com',
    name: 'Alice Organizer',
    avatar_url: null,
    is_developer: false,
    created_at: '2026-09-01T00:00:00Z',
    updated_at: '2026-09-01T00:00:00Z',
  };

  const user2 = {
    id: 'user-login-test-2',
    google_id: null,
    email: 'bob@example.com',
    name: 'Bob Member',
    avatar_url: null,
    is_developer: false,
    created_at: '2026-09-02T00:00:00Z',
    updated_at: '2026-09-02T00:00:00Z',
  };

  const org1 = {
    id: 'org-login-test-1',
    name: 'Alpha Events',
    slug: 'alpha-events',
    owner_id: user1.id,
    logo_url: null,
    country_code: 'MY',
    last_login_at: null,
    last_login_user_id: null,
    created_at: '2026-09-01T00:00:00Z',
    updated_at: '2026-09-01T00:00:00Z',
  };

  const org2 = {
    id: 'org-login-test-2',
    name: 'Beta Activations',
    slug: 'beta-activations',
    owner_id: 'other-owner-id',
    logo_url: null,
    country_code: 'SG',
    last_login_at: null,
    last_login_user_id: null,
    created_at: '2026-09-05T00:00:00Z',
    updated_at: '2026-09-05T00:00:00Z',
  };

  const org3Unrelated = {
    id: 'org-login-test-3',
    name: 'Gamma Productions',
    slug: 'gamma-productions',
    owner_id: 'stranger-id',
    logo_url: null,
    country_code: 'MY',
    last_login_at: null,
    last_login_user_id: null,
    created_at: '2026-09-10T00:00:00Z',
    updated_at: '2026-09-10T00:00:00Z',
  };

  localUsersCache.set(user1.id, { ...user1 });
  localUsersCache.set(user2.id, { ...user2 });
  localOrgsCache.set(org1.id, { ...org1 });
  localOrgsCache.set(org2.id, { ...org2 });
  localOrgsCache.set(org3Unrelated.id, { ...org3Unrelated });

  // User 1 is owner of Org 1, and member of Org 2
  localMembersCache.set('mem-1', { id: 'mem-1', organization_id: org1.id, user_id: user1.id, role: 'owner', created_at: '2026-09-01T00:00:00Z' });
  localMembersCache.set('mem-2', { id: 'mem-2', organization_id: org2.id, user_id: user1.id, role: 'admin', created_at: '2026-09-05T00:00:00Z' });
  localMembersCache.set('mem-3', { id: 'mem-3', organization_id: org2.id, user_id: user2.id, role: 'designer', created_at: '2026-09-06T00:00:00Z' });

  // Test 1: Prior to login, organizations show null last_login_at
  console.log('Test 1: Verify pristine state has null last_login_at');
  assert.strictEqual(localOrgsCache.get(org1.id)?.last_login_at, null);
  assert.strictEqual(localOrgsCache.get(org2.id)?.last_login_at, null);
  assert.strictEqual(localUsersCache.get(user1.id)?.last_login_at, undefined);
  console.log('✓ Test 1 passed: Pristine state shows null/undefined');

  // Test 2: Alice logs in - should update user1, org1 (as owner), and org2 (as member)
  console.log('Test 2: User1 login updates User1, Org1 (owner), and Org2 (member)');
  const loginTime1 = '2026-10-28T08:30:00.000Z';
  await recordUserAndOrganizationLogin(user1.id, loginTime1);

  const updatedUser1 = localUsersCache.get(user1.id);
  const updatedOrg1 = localOrgsCache.get(org1.id);
  const updatedOrg2 = localOrgsCache.get(org2.id);
  const updatedOrg3 = localOrgsCache.get(org3Unrelated.id);

  assert.strictEqual(updatedUser1?.last_login_at, loginTime1);
  assert.strictEqual(updatedOrg1?.last_login_at, loginTime1);
  assert.strictEqual(updatedOrg1?.last_login_user_id, user1.id);
  assert.strictEqual(updatedOrg2?.last_login_at, loginTime1);
  assert.strictEqual(updatedOrg2?.last_login_user_id, user1.id);

  // Unrelated Org 3 must remain untouched
  assert.strictEqual(updatedOrg3?.last_login_at, null);
  assert.strictEqual(updatedOrg3?.last_login_user_id, null);
  console.log('✓ Test 2 passed: Multi-org login recorded correctly for owner and member');

  // Test 3: Bob logs in later - only Org 2 (where Bob is a member) is updated
  console.log('Test 3: Bob login updates only Org 2 and records Bob as last_login_user_id');
  const loginTime2 = '2026-10-28T10:15:00.000Z';
  await recordUserAndOrganizationLogin(user2.id, loginTime2);

  const bobUser = localUsersCache.get(user2.id);
  const org1AfterBob = localOrgsCache.get(org1.id);
  const org2AfterBob = localOrgsCache.get(org2.id);

  assert.strictEqual(bobUser?.last_login_at, loginTime2);
  // Org 1 still has Alice's timestamp
  assert.strictEqual(org1AfterBob?.last_login_at, loginTime1);
  assert.strictEqual(org1AfterBob?.last_login_user_id, user1.id);
  // Org 2 now updated to Bob's timestamp
  assert.strictEqual(org2AfterBob?.last_login_at, loginTime2);
  assert.strictEqual(org2AfterBob?.last_login_user_id, user2.id);
  console.log('✓ Test 3 passed: Subsequent member login updates target org correctly');

  const testEnv = { SUPABASE_URL: '', SUPABASE_SERVICE_ROLE_KEY: '', NODE_ENV: 'test' };

  // Test 4: Developer Admin list aggregation includes last login details
  console.log('Test 4: getAllOrganizationsForDeveloper returns last login timestamps and users');
  const devList = await getAllOrganizationsForDeveloper(testEnv);
  const devOrg1 = devList.find((o) => o.id === org1.id);
  const devOrg2 = devList.find((o) => o.id === org2.id);
  const devOrg3 = devList.find((o) => o.id === org3Unrelated.id);

  assert.ok(devOrg1, 'Org 1 found in dev list');
  assert.strictEqual(devOrg1.last_login_at, loginTime1);
  assert.strictEqual(devOrg1.last_login_user_id, user1.id);
  assert.strictEqual(devOrg1.last_login_user_name, user1.name);
  assert.strictEqual(devOrg1.last_login_user_email, user1.email);

  assert.ok(devOrg2, 'Org 2 found in dev list');
  assert.strictEqual(devOrg2.last_login_at, loginTime2);
  assert.strictEqual(devOrg2.last_login_user_id, user2.id);
  assert.strictEqual(devOrg2.last_login_user_name, user2.name);
  assert.strictEqual(devOrg2.last_login_user_email, user2.email);

  assert.ok(devOrg3, 'Org 3 found in dev list');
  assert.strictEqual(devOrg3.last_login_at, null);
  assert.strictEqual(devOrg3.last_login_user_id, null);
  assert.strictEqual(devOrg3.last_login_user_name, null);
  console.log('✓ Test 4 passed: Developer list includes last login user name and email');

  // Test 5: Developer Admin detail endpoint includes last login data
  console.log('Test 5: getOrganizationDetailForDeveloper includes last login');
  const devDetail = await getOrganizationDetailForDeveloper(org2.id, testEnv);
  assert.ok(devDetail, 'Org 2 detail found');
  assert.strictEqual(devDetail.last_login_at, loginTime2);
  assert.strictEqual(devDetail.last_login_user?.id, user2.id);
  assert.strictEqual(devDetail.last_login_user?.name, user2.name);
  assert.strictEqual(devDetail.last_login_user?.email, user2.email);
  console.log('✓ Test 5 passed: Developer detail includes last login object');

  // Test 6: Timestamp formatting in Asia/Singapore (UTC+8)
  console.log('Test 6: formatLastLoginDate helper formats correctly in UTC+8');
  // UTC 2026-10-28 08:30:00 UTC -> Singapore 2026-10-28 16:30
  const formatted = formatLastLoginDate(loginTime1);
  assert.ok(formatted.includes('2026'), `Expected year 2026 in ${formatted}`);
  assert.ok(formatted.includes('16:30'), `Expected hour 16:30 (UTC+8) in ${formatted}`);

  // Safe handling of null and undefined
  assert.strictEqual(formatLastLoginDate(null), '');
  assert.strictEqual(formatLastLoginDate(undefined), '');
  assert.strictEqual(formatLastLoginDate('invalid-date'), '');
  console.log('✓ Test 6 passed: Date formatting is timezone-aware and handles null safely');

  // Test 7: Non-blocking resilience on empty/null userId
  console.log('Test 7: Empty or invalid userId does not throw');
  await recordUserAndOrganizationLogin('');
  await recordUserAndOrganizationLogin(null as any);
  console.log('✓ Test 7 passed: Empty input safely handled');

  console.log('\n--- ALL ORGANIZATION LAST LOGIN TRACKING TESTS PASSED ---');
}

runTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
