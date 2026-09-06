import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import worker from '../worker.js';
import { signAppToken } from './auth.js';
import { createUser } from './db/users.js';
import { createOrganization } from './db/organizations.js';
import { addMember } from './db/members.js';

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

async function runOrganizationBackendWriteOnlyTests() {
  console.log('======================================================');
  console.log('Running Organizations & Membership Backend-Write-Only Tests');
  console.log('======================================================\n');

  const migrationPath = path.resolve(
    process.cwd(),
    'supabase/migrations/20260904070000_organizations_members_backend_write_only.sql'
  );
  const schemaPath = path.resolve(process.cwd(), 'supabase/schema.sql');

  // --------------------------------------------------------------------------
  // SECTION 1: Migration & Schema Policy Hardening
  // --------------------------------------------------------------------------
  console.log('--- Section 1: Migration & Schema Policy Hardening ---');

  await test('1a. Migration 20260904070000_organizations_members_backend_write_only.sql exists', () => {
    assert.ok(fs.existsSync(migrationPath), 'Migration file must exist');
  });

  await test('1b. Migration drops vulnerable client mutation policies on organizations, members, and invitations', () => {
    const content = fs.readFileSync(migrationPath, 'utf-8');

    // organizations
    assert.ok(
      content.includes('DROP POLICY IF EXISTS "Authenticated users can create organizations" ON public.organizations'),
      'Must drop client create organization policy'
    );
    assert.ok(
      content.includes('DROP POLICY IF EXISTS "Owners and admins can update organization" ON public.organizations'),
      'Must drop client update organization policy'
    );
    assert.ok(
      content.includes('DROP POLICY IF EXISTS "Owners and admins can delete organization" ON public.organizations'),
      'Must drop client delete organization policy'
    );

    // organization_members
    assert.ok(
      content.includes('DROP POLICY IF EXISTS "Owners and admins can manage members" ON public.organization_members'),
      'Must drop client manage members policy'
    );
    assert.ok(
      content.includes('DROP POLICY IF EXISTS "Owners and admins can update member roles" ON public.organization_members'),
      'Must drop client update member roles policy'
    );
    assert.ok(
      content.includes('DROP POLICY IF EXISTS "Owners and admins can remove members" ON public.organization_members'),
      'Must drop client remove members policy'
    );

    // organization_invitations
    assert.ok(
      content.includes('DROP POLICY IF EXISTS "Owners and admins can create invitations" ON public.organization_invitations'),
      'Must drop client create invitations policy'
    );
    assert.ok(
      content.includes('DROP POLICY IF EXISTS "Owners and admins can delete invitations" ON public.organization_invitations'),
      'Must drop client delete invitations policy'
    );
    assert.ok(
      content.includes('DROP POLICY IF EXISTS "Owners and admins can update invitations" ON public.organization_invitations'),
      'Must drop client update invitations policy'
    );
  });

  await test('1c. Migration revokes direct table mutation privileges from client roles', () => {
    const content = fs.readFileSync(migrationPath, 'utf-8');
    assert.ok(
      content.includes('REVOKE INSERT, UPDATE, DELETE ON public.organizations FROM authenticated;'),
      'Must revoke authenticated mutations on organizations'
    );
    assert.ok(
      content.includes('REVOKE INSERT, UPDATE, DELETE ON public.organizations FROM anon;'),
      'Must revoke anon mutations on organizations'
    );
    assert.ok(
      content.includes('REVOKE INSERT, UPDATE, DELETE ON public.organization_members FROM authenticated;'),
      'Must revoke authenticated mutations on organization_members'
    );
    assert.ok(
      content.includes('REVOKE INSERT, UPDATE, DELETE ON public.organization_members FROM anon;'),
      'Must revoke anon mutations on organization_members'
    );
    assert.ok(
      content.includes('REVOKE INSERT, UPDATE, DELETE ON public.organization_invitations FROM authenticated;'),
      'Must revoke authenticated mutations on organization_invitations'
    );
    assert.ok(
      content.includes('REVOKE INSERT, UPDATE, DELETE ON public.organization_invitations FROM anon;'),
      'Must revoke anon mutations on organization_invitations'
    );
    assert.ok(
      content.includes('GRANT SELECT ON public.organizations TO authenticated;'),
      'Must preserve SELECT for organizations'
    );
    assert.ok(
      content.includes('GRANT SELECT ON public.organization_members TO authenticated;'),
      'Must preserve SELECT for organization_members'
    );
    assert.ok(
      content.includes('GRANT SELECT ON public.organization_invitations TO authenticated;'),
      'Must preserve SELECT for organization_invitations'
    );
  });

  await test('1d. Migration installs defense-in-depth triggers on organizations, members, and invitations', () => {
    const content = fs.readFileSync(migrationPath, 'utf-8');
    assert.ok(
      content.includes('prevent_organization_unauthorized_client_mutations'),
      'Must create trigger for organizations'
    );
    assert.ok(
      content.includes('prevent_organization_member_unauthorized_client_mutations'),
      'Must create trigger for organization_members'
    );
    assert.ok(
      content.includes('prevent_organization_invitation_unauthorized_client_mutations'),
      'Must create trigger for organization_invitations'
    );
  });

  await test('1e. Canonical schema.sql does not contain vulnerable client mutation policies and enforces revocation', () => {
    const schema = fs.readFileSync(schemaPath, 'utf-8');

    assert.ok(
      !schema.includes('CREATE POLICY "Authenticated users can create organizations"'),
      'schema.sql must not contain vulnerable create organization policy'
    );
    assert.ok(
      !schema.includes('CREATE POLICY "Owners and admins can manage members"'),
      'schema.sql must not contain vulnerable manage members policy'
    );
    assert.ok(
      !schema.includes('CREATE POLICY "Owners and admins can update member roles"'),
      'schema.sql must not contain vulnerable update member roles policy'
    );
    assert.ok(
      !schema.includes('CREATE POLICY "Owners and admins can create invitations"'),
      'schema.sql must not contain vulnerable create invitations policy'
    );
    assert.ok(
      schema.includes('REVOKE INSERT, UPDATE, DELETE ON public.organizations FROM authenticated;'),
      'schema.sql must revoke client mutations on organizations'
    );
    assert.ok(
      schema.includes('REVOKE INSERT, UPDATE, DELETE ON public.organization_members FROM authenticated;'),
      'schema.sql must revoke client mutations on organization_members'
    );
    assert.ok(
      schema.includes('REVOKE INSERT, UPDATE, DELETE ON public.organization_invitations FROM authenticated;'),
      'schema.sql must revoke client mutations on organization_invitations'
    );
  });

  await test('1f. Database trigger enforces strict immutability on owner_id during UPDATE', () => {
    const migration = fs.readFileSync(migrationPath, 'utf-8');
    const schema = fs.readFileSync(schemaPath, 'utf-8');

    for (const [name, content] of [['migration', migration], ['schema.sql', schema]]) {
      assert.ok(
        content.includes('IF NEW.owner_id IS DISTINCT FROM OLD.owner_id THEN'),
        `${name} must check if NEW.owner_id IS DISTINCT FROM OLD.owner_id`
      );
      assert.ok(
        content.includes('Organization ownership cannot be changed directly'),
        `${name} must explicitly prohibit direct ownership changes`
      );
    }
  });

  // --------------------------------------------------------------------------
  // SECTION 2: Worker API Authorization Scenarios
  // --------------------------------------------------------------------------
  console.log('\n--- Section 2: Worker API Authorization Scenarios ---');

  const env = {
    JWT_SECRET: 'test-jwt-secret-for-org-tests-at-least-32-chars-long',
  };

  // Seed test users
  const ownerUser = await createUser({
    email: 'org-owner@example.com',
    name: 'Org Owner',
    is_developer: false,
  });

  const adminUser = await createUser({
    email: 'org-admin@example.com',
    name: 'Org Admin',
    is_developer: false,
  });

  const memberUser = await createUser({
    email: 'org-member@example.com',
    name: 'Org Member',
    is_developer: false,
  });

  const outsiderUser = await createUser({
    email: 'outsider@example.com',
    name: 'Outsider User',
    is_developer: false,
  });

  const org = await createOrganization({
    name: 'Acme Events Corp',
    owner_id: ownerUser.id,
  });

  // Add members
  const ownerMember = await addMember({
    organization_id: org.id,
    user_id: ownerUser.id,
    role: 'owner',
  });

  const adminMember = await addMember({
    organization_id: org.id,
    user_id: adminUser.id,
    role: 'admin',
  });

  const regularMember = await addMember({
    organization_id: org.id,
    user_id: memberUser.id,
    role: 'viewer',
  });

  const ownerToken = await signAppToken(ownerUser.id, org.id, 'owner', undefined, env);
  const adminToken = await signAppToken(adminUser.id, org.id, 'admin', undefined, env);
  const regularToken = await signAppToken(memberUser.id, org.id, 'viewer', undefined, env);
  const outsiderToken = await signAppToken(outsiderUser.id, org.id, 'viewer', undefined, env);

  await test('2a. Outsider cannot view organization members', async () => {
    const req = new Request(`https://api.example.com/api/organizations/${org.id}/members`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${outsiderToken}`,
      },
    });
    const res = await worker.fetch(req, env);
    assert.strictEqual(res.status, 403, 'Outsider must be forbidden');
  });

  await test('2b. Outsider cannot create invitations', async () => {
    const req = new Request(`https://api.example.com/api/organizations/${org.id}/invitations`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${outsiderToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email: 'newguy@example.com', role: 'designer' }),
    });
    const res = await worker.fetch(req, env);
    assert.strictEqual(res.status, 403, 'Outsider cannot invite');
  });

  await test('2c. Regular member cannot remove members', async () => {
    const req = new Request(`https://api.example.com/api/organizations/${org.id}/members/${adminMember.id}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${regularToken}`,
      },
    });
    const res = await worker.fetch(req, env);
    assert.strictEqual(res.status, 403, 'Regular member cannot remove members');
  });

  await test('2d. Admin cannot remove organization owner', async () => {
    const req = new Request(`https://api.example.com/api/organizations/${org.id}/members/${ownerMember.id}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${adminToken}`,
      },
    });
    const res = await worker.fetch(req, env);
    assert.strictEqual(res.status, 403, 'Cannot remove owner');
  });

  await test('2e. Admin cannot update another admin or promote to owner', async () => {
    const req = new Request(`https://api.example.com/api/organizations/${org.id}/members/${adminMember.id}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ role: 'owner' }),
    });
    const res = await worker.fetch(req, env);
    assert.strictEqual(res.status, 403, 'Admin cannot promote or alter admin role');
  });

  await test('2f. Outsider cannot update organization metadata', async () => {
    const req = new Request(`https://api.example.com/api/organizations/${org.id}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${outsiderToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: 'Hacked Organization' }),
    });
    const res = await worker.fetch(req, env);
    assert.strictEqual(res.status, 403, 'Outsider cannot update org');
  });

  await test('2g. Cannot tamper with organization id, owner_id, or slug', async () => {
    const req = new Request(`https://api.example.com/api/organizations/${org.id}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${ownerToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ owner_id: outsiderUser.id }),
    });
    const res = await worker.fetch(req, env);
    assert.strictEqual(res.status, 403, 'Cannot tamper with owner_id');
  });

  await test('2h. Owner can update organization metadata', async () => {
    const req = new Request(`https://api.example.com/api/organizations/${org.id}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${ownerToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: 'Acme Super Events' }),
    });
    const res = await worker.fetch(req, env);
    assert.strictEqual(res.status, 200, 'Owner can update org name');
    const data = await res.json();
    assert.strictEqual(data.organization.name, 'Acme Super Events');
  });

  await test('2i. Owner can update member role', async () => {
    const req = new Request(`https://api.example.com/api/organizations/${org.id}/members/${regularMember.id}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${ownerToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ role: 'designer' }),
    });
    const res = await worker.fetch(req, env);
    assert.strictEqual(res.status, 200, 'Owner can update member role');
    const data = await res.json();
    assert.strictEqual(data.member.role, 'designer');
  });

  // --------------------------------------------------------------------------
  // Summary
  // --------------------------------------------------------------------------
  console.log('\n======================================================');
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log('======================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runOrganizationBackendWriteOnlyTests();
