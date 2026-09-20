import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import {
  createOrganization,
  getOwnerOrganizationCount,
  MAX_ORGANIZATIONS_PER_OWNER,
  localOrgsCache,
} from './db/organizations.js';
import { isOperationalError } from './errors.js';

console.log('========================================================================');
console.log('Running Owner Organization Limit Verification (Database RPC, Trigger & Application)');
console.log('========================================================================\n');

function resetTestData() {
  localOrgsCache.clear();
}

async function runTests() {
  // Test 1: Verify Constants
  console.log('Test 1: Verify MAX_ORGANIZATIONS_PER_OWNER constant');
  assert.strictEqual(
    MAX_ORGANIZATIONS_PER_OWNER,
    5,
    'MAX_ORGANIZATIONS_PER_OWNER must be configured to 5'
  );
  console.log('  ✓ MAX_ORGANIZATIONS_PER_OWNER is 5');

  // Test 2: Schema, Trigger and RPC Invariants
  console.log('\nTest 2: Verify Database Schema, Trigger, and Migration Files');
  const schemaPath = path.resolve(process.cwd(), 'supabase/schema.sql');
  const schemaContent = fs.readFileSync(schemaPath, 'utf8');

  assert.ok(
    schemaContent.includes('check_owner_organization_limit()'),
    'supabase/schema.sql must contain check_owner_organization_limit function'
  );
  assert.ok(
    schemaContent.includes('trg_enforce_owner_organization_limit'),
    'supabase/schema.sql must contain trg_enforce_owner_organization_limit trigger'
  );
  assert.ok(
    schemaContent.includes('v_existing_org_count >= 5'),
    'supabase/schema.sql create_organization_atomic must contain limit check v_existing_org_count >= 5'
  );
  assert.ok(
    schemaContent.includes('ORGANIZATION_LIMIT_REACHED'),
    'supabase/schema.sql must return ORGANIZATION_LIMIT_REACHED error code'
  );

  const migrationPath = path.resolve(
    process.cwd(),
    'supabase/migrations/20260924000000_enforce_owner_organization_limit.sql'
  );
  assert.ok(
    fs.existsSync(migrationPath),
    'Migration 20260924000000_enforce_owner_organization_limit.sql must exist'
  );

  const migrationsMdPath = path.resolve(process.cwd(), 'supabase/MIGRATIONS.md');
  const migrationsMdContent = fs.readFileSync(migrationsMdPath, 'utf8');
  assert.ok(
    migrationsMdContent.includes('20260924000000_enforce_owner_organization_limit.sql'),
    'supabase/MIGRATIONS.md must register the migration'
  );
  console.log('  ✓ Schema, trigger, and migration definitions verified');

  // Test 3: Operational Error Handling
  console.log('\nTest 3: Operational Error Recognition in server/errors.ts');
  const orgLimitError = {
    code: 'ORGANIZATION_LIMIT_REACHED',
    message: 'You have reached the maximum limit of 5 organizations.',
  };
  assert.strictEqual(
    isOperationalError(orgLimitError),
    true,
    'ORGANIZATION_LIMIT_REACHED must be recognized as an operational error'
  );

  const triggerError = {
    message: 'Owner has reached the maximum organization limit (5 organizations max)',
  };
  assert.strictEqual(
    isOperationalError(triggerError),
    true,
    'Trigger organization limit message must be recognized as an operational error'
  );
  console.log('  ✓ Error handling correctly identifies organization limit errors as safe operational messages');

  // Test 4: Creation Lifecycle up to Limit (5 Organizations)
  console.log('\nTest 4: Creating up to 5 Organizations for an Owner');
  resetTestData();

  const testOwnerId = 'owner-uuid-1234';

  assert.strictEqual(
    await getOwnerOrganizationCount(testOwnerId),
    0,
    'Initial count should be 0'
  );

  // Create 1st org
  const org1 = await createOrganization({
    name: 'Owner Workspace 1',
    owner_id: testOwnerId,
    country_code: 'MY',
  });
  assert.ok(org1.id, 'Org 1 should have an ID');
  assert.strictEqual(
    await getOwnerOrganizationCount(testOwnerId),
    1,
    'Count should be 1'
  );
  console.log('  ✓ Org 1 created successfully');

  // Create 2nd org
  const org2 = await createOrganization({
    name: 'Owner Workspace 2',
    owner_id: testOwnerId,
    country_code: 'SG',
  });
  assert.ok(org2.id, 'Org 2 should have an ID');
  assert.strictEqual(
    await getOwnerOrganizationCount(testOwnerId),
    2,
    'Count should be 2'
  );
  console.log('  ✓ Org 2 created successfully');

  // Create 3rd org
  const org3 = await createOrganization({
    name: 'Owner Workspace 3',
    owner_id: testOwnerId,
    country_code: 'MY',
  });
  assert.ok(org3.id, 'Org 3 should have an ID');
  assert.strictEqual(
    await getOwnerOrganizationCount(testOwnerId),
    3,
    'Count should be 3'
  );
  console.log('  ✓ Org 3 created successfully');

  // Create 4th org
  const org4 = await createOrganization({
    name: 'Owner Workspace 4',
    owner_id: testOwnerId,
    country_code: 'TH',
  });
  assert.ok(org4.id, 'Org 4 should have an ID');
  assert.strictEqual(
    await getOwnerOrganizationCount(testOwnerId),
    4,
    'Count should be 4'
  );
  console.log('  ✓ Org 4 created successfully');

  // Create 5th org (at limit)
  const org5 = await createOrganization({
    name: 'Owner Workspace 5',
    owner_id: testOwnerId,
    country_code: 'ID',
  });
  assert.ok(org5.id, 'Org 5 should have an ID');
  assert.strictEqual(
    await getOwnerOrganizationCount(testOwnerId),
    5,
    'Count should be 5'
  );
  console.log('  ✓ Org 5 created successfully (exact boundary)');

  // Test 5: Attempting to create 6th organization must fail
  console.log('\nTest 5: Attempting to create 6th Organization must fail with ORGANIZATION_LIMIT_REACHED');
  let creationFailed = false;
  let errorCode = '';
  let errorStatus = 0;

  try {
    await createOrganization({
      name: 'Owner Workspace 6 (Should Fail)',
      owner_id: testOwnerId,
      country_code: 'MY',
    });
  } catch (err: any) {
    creationFailed = true;
    errorCode = err.code || '';
    errorStatus = err.status || 0;
    console.log(`  ✓ 6th organization rejected with status ${errorStatus}: "${err.message}" (code: ${errorCode})`);
  }

  assert.strictEqual(creationFailed, true, 'Creating 6th organization must fail');
  assert.strictEqual(errorCode, 'ORGANIZATION_LIMIT_REACHED', 'Error code must be ORGANIZATION_LIMIT_REACHED');
  assert.strictEqual(errorStatus, 422, 'HTTP status must be 422');

  // Verify count remains 5
  assert.strictEqual(
    await getOwnerOrganizationCount(testOwnerId),
    5,
    'Count must remain strictly at 5'
  );

  // Test 6: Another owner can still create their own organizations
  console.log('\nTest 6: Another owner is not impacted by testOwnerId reaching limit');
  const secondOwnerId = 'owner-uuid-5678';
  const secondOwnerOrg = await createOrganization({
    name: 'Second Owner Workspace 1',
    owner_id: secondOwnerId,
    country_code: 'SG',
  });
  assert.ok(secondOwnerOrg.id, 'Second owner should be able to create their organization');
  assert.strictEqual(
    await getOwnerOrganizationCount(secondOwnerId),
    1,
    'Second owner count should be 1'
  );
  console.log('  ✓ Second owner created workspace cleanly without cross-tenant interference');

  console.log('\n========================================================================');
  console.log('All Owner Organization Limit tests PASSED successfully!');
  console.log('========================================================================');
}

runTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
