import assert from 'node:assert';
import worker from '../worker.js';
import { signAppToken } from './auth.js';
import { createUser } from './db/users.js';
import { createOrganization, getOrganizationById } from './db/organizations.js';
import { addMember } from './db/members.js';
import {
  COUNTRIES,
  CountryItem,
  POPULAR_COUNTRY_CODES,
  isValidCountryCode,
  getCountryByCode,
  getCountryDisplayName,
  getDefaultTimezoneForCountry,
} from '../src/lib/countryUtils.js';

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

async function runOrganizationCountryTests() {
  console.log('======================================================');
  console.log('Running Organization Country Feature Tests');
  console.log('======================================================\n');

  // --------------------------------------------------------------------------
  // SECTION 1: Country Utilities & Validation
  // --------------------------------------------------------------------------
  console.log('--- Section 1: Country Utilities & Validation ---');

  await test('1a. Supported countries list contains valid CountryItem records with flag and currencyCode', () => {
    assert.ok(COUNTRIES.length >= 25, 'Should have comprehensive country list');
    for (const c of COUNTRIES) {
      assert.strictEqual(c.code.length, 2, `Country code ${c.code} must be 2 characters`);
      assert.strictEqual(c.code, c.code.toUpperCase(), `Country code ${c.code} must be uppercase`);
      assert.ok(c.name && c.name.length > 0, `Country ${c.code} must have a name`);
      assert.ok(c.flag && c.flag.length > 0, `Country ${c.code} must have a flag emoji`);
      assert.ok(c.defaultTimezone && c.defaultTimezone.includes('/'), `Country ${c.code} must have default timezone`);
      assert.ok(c.currencyCode && c.currencyCode.length === 3, `Country ${c.code} must have 3-letter currency code`);
    }
  });

  await test('1b. POPULAR_COUNTRY_CODES contains valid supported country codes', () => {
    assert.ok(POPULAR_COUNTRY_CODES.length > 0, 'Popular countries must not be empty');
    for (const code of POPULAR_COUNTRY_CODES) {
      assert.ok(isValidCountryCode(code), `Popular country code ${code} must be in COUNTRIES`);
    }
  });

  await test('1c. isValidCountryCode correctly identifies valid and invalid codes', () => {
    // Valid codes (case-insensitive)
    assert.strictEqual(isValidCountryCode('SG'), true);
    assert.strictEqual(isValidCountryCode('sg'), true);
    assert.strictEqual(isValidCountryCode('MY'), true);
    assert.strictEqual(isValidCountryCode('my'), true);
    assert.strictEqual(isValidCountryCode('US'), true);
    assert.strictEqual(isValidCountryCode('GB'), true);
    assert.strictEqual(isValidCountryCode('JP'), true);

    // Invalid codes
    assert.strictEqual(isValidCountryCode(''), false);
    assert.strictEqual(isValidCountryCode(null), false);
    assert.strictEqual(isValidCountryCode(undefined), false);
    assert.strictEqual(isValidCountryCode('ZZ'), false);
    assert.strictEqual(isValidCountryCode('XX'), false);
    assert.strictEqual(isValidCountryCode('SGP'), false);
    assert.strictEqual(isValidCountryCode('SINGAPORE'), false);
    assert.strictEqual(isValidCountryCode('12'), false);
  });

  await test('1d. getCountryByCode returns expected metadata', () => {
    const sg = getCountryByCode('SG');
    assert.ok(sg);
    assert.strictEqual(sg?.name, 'Singapore');
    assert.strictEqual(sg?.flag, '🇸🇬');
    assert.strictEqual(sg?.currencyCode, 'SGD');
    assert.strictEqual(sg?.defaultTimezone, 'Asia/Singapore');

    const my = getCountryByCode('my'); // Case insensitive
    assert.ok(my);
    assert.strictEqual(my?.name, 'Malaysia');
    assert.strictEqual(my?.flag, '🇲🇾');
    assert.strictEqual(my?.currencyCode, 'MYR');
  });

  await test('1e. getDefaultTimezoneForCountry returns country default or Singapore fallback', () => {
    assert.strictEqual(getDefaultTimezoneForCountry('JP'), 'Asia/Tokyo');
    assert.strictEqual(getDefaultTimezoneForCountry('MY'), 'Asia/Kuala_Lumpur');
    assert.strictEqual(getDefaultTimezoneForCountry('GB'), 'Europe/London');
    assert.strictEqual(getDefaultTimezoneForCountry(null), 'Asia/Singapore');
    assert.strictEqual(getDefaultTimezoneForCountry('UNKNOWN'), 'Asia/Singapore');
  });

  // --------------------------------------------------------------------------
  // SECTION 2: Organization Creation Flow & Country Requirement
  // --------------------------------------------------------------------------
  console.log('\n--- Section 2: Organization Creation Flow ---');

  const env = {
    JWT_SECRET: 'test-jwt-secret-for-org-country-tests-32-chars',
  };

  const testUser = await createUser({
    email: 'country_test_user@example.com',
    name: 'Country Test User',
    is_developer: false,
  });

  const memberUser = await createUser({
    email: 'country_member_user@example.com',
    name: 'Country Member User',
    is_developer: false,
  });

  const authHeader = `Bearer ${await signAppToken(testUser.id, 'temp-org', 'owner', undefined, env)}`;

  await test('2a. POST /api/organizations fails when country_code is missing', async () => {
    const req = new Request('http://localhost/api/organizations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: authHeader,
      },
      body: JSON.stringify({
        name: 'No Country Org',
      }),
    });

    const res = await worker.fetch(req, env);
    assert.strictEqual(res.status, 422);
    const data = (await res.json()) as any;
    assert.strictEqual(data.error, "Please select your organization's country.");
  });

  await test('2b. POST /api/organizations fails when country_code is empty or invalid', async () => {
    const req = new Request('http://localhost/api/organizations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: authHeader,
      },
      body: JSON.stringify({
        name: 'Invalid Country Org',
        country_code: 'INVALID',
      }),
    });

    const res = await worker.fetch(req, env);
    assert.strictEqual(res.status, 422);
    const data = (await res.json()) as any;
    assert.strictEqual(data.error, 'Invalid country code. Please select a valid country.');
  });

  let createdOrgId = '';

  await test('2c. POST /api/organizations succeeds with valid country_code and stores uppercase ISO code', async () => {
    const req = new Request('http://localhost/api/organizations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: authHeader,
      },
      body: JSON.stringify({
        name: 'Singapore Tech Events',
        country_code: 'sg', // lowercase input
      }),
    });

    const res = await worker.fetch(req, env);
    assert.ok(res.status === 200 || res.status === 201, `Status should be 200 or 201, got ${res.status}`);
    const data = (await res.json()) as any;
    assert.ok(data.organization);
    assert.strictEqual(data.organization.country_code, 'SG');
    createdOrgId = data.organization.id;

    // Verify stored record in database
    const orgRecord = await getOrganizationById(createdOrgId);
    assert.strictEqual(orgRecord?.country_code, 'SG');
  });

  // --------------------------------------------------------------------------
  // SECTION 3: Updating Organization Country & RBAC
  // --------------------------------------------------------------------------
  console.log('\n--- Section 3: Updating Organization Country & RBAC ---');

  await test('3a. Regular member cannot update organization country', async () => {
    assert.ok(createdOrgId, 'Organization must have been created');
    await addMember({
      organization_id: createdOrgId,
      user_id: memberUser.id,
      role: 'viewer',
    });

    const memberToken = await signAppToken(memberUser.id, createdOrgId, 'viewer', undefined, env);
    const req = new Request(`http://localhost/api/organizations/${createdOrgId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${memberToken}`,
      },
      body: JSON.stringify({
        country_code: 'MY',
      }),
    });

    const res = await worker.fetch(req, env);
    assert.strictEqual(res.status, 403);
  });

  await test('3b. Owner can update organization country to a valid code', async () => {
    const ownerToken = await signAppToken(testUser.id, createdOrgId, 'owner', undefined, env);
    const req = new Request(`http://localhost/api/organizations/${createdOrgId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ownerToken}`,
      },
      body: JSON.stringify({
        country_code: 'MY',
      }),
    });

    const res = await worker.fetch(req, env);
    assert.strictEqual(res.status, 200);
    const data = (await res.json()) as any;
    assert.strictEqual(data.organization.country_code, 'MY');

    const updated = await getOrganizationById(createdOrgId);
    assert.strictEqual(updated?.country_code, 'MY');
  });

  await test('3c. Owner updating country with invalid code is rejected with 422', async () => {
    const ownerToken = await signAppToken(testUser.id, createdOrgId, 'owner', undefined, env);
    const req = new Request(`http://localhost/api/organizations/${createdOrgId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ownerToken}`,
      },
      body: JSON.stringify({
        country_code: 'BAD_CODE',
      }),
    });

    const res = await worker.fetch(req, env);
    assert.strictEqual(res.status, 422);
    const data = (await res.json()) as any;
    assert.strictEqual(data.error, 'Invalid country code. Please select a valid country.');
  });

  // --------------------------------------------------------------------------
  // SECTION 4: Organization Switching & Session Consistency
  // --------------------------------------------------------------------------
  console.log('\n--- Section 4: Organization Switching & Session Consistency ---');

  await test('4a. POST /api/auth/switch-org returns activeOrganization with country_code and organizations list', async () => {
    const ownerToken = await signAppToken(testUser.id, createdOrgId, 'owner', undefined, env);
    const req = new Request('http://localhost/api/auth/switch-org', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ownerToken}`,
      },
      body: JSON.stringify({
        organizationId: createdOrgId,
      }),
    });

    const res = await worker.fetch(req, env);
    assert.strictEqual(res.status, 200);
    const data = (await res.json()) as any;
    assert.ok(data.activeOrganization);
    assert.strictEqual(data.activeOrganization.id, createdOrgId);
    assert.strictEqual(data.activeOrganization.country_code, 'MY');
    assert.ok(Array.isArray(data.organizations), 'Must return user organizations list');
    const matched = data.organizations.find((o: any) => o.id === createdOrgId);
    assert.strictEqual(matched?.country_code, 'MY');
  });

  console.log('\n======================================================');
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log('======================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runOrganizationCountryTests().catch((err) => {
  console.error('Fatal error running organization country tests:', err);
  process.exit(1);
});
