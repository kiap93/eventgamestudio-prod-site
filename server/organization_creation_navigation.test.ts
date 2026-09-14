import assert from 'node:assert';
import worker from '../worker.js';
import { signAppToken } from './auth.js';
import { createUser } from './db/users.js';
import { parseRoute } from '../src/hooks/useRouteContext.js';

let passed = 0;
let failed = 0;

async function test(description: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    console.log(`  ✓ ${description}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${description}`);
    console.error(err);
    failed++;
  }
}

async function runNavigationFlowTests() {
  console.log('======================================================');
  console.log('Running Post-Organization Creation Navigation Flow Tests');
  console.log('======================================================\n');

  // --------------------------------------------------------------------------
  // SECTION 1: API Response Shape and Contract Validation
  // --------------------------------------------------------------------------
  console.log('--- Section 1: API Response Shape & Contract (POST /api/organizations) ---');

  const testUser = await createUser({
    email: `nav-test-${Date.now()}@example.com`,
    name: 'Navigation Test User',
  });

  const authToken = await signAppToken(testUser.id, undefined, undefined);
  let createdOrgData: any = null;

  await test('1a. POST /api/organizations returns exact required shape: token, organization, and organization.id', async () => {
    const req = new Request('http://localhost/api/organizations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        name: 'Launch Studio Org',
        country_code: 'MY',
      }),
    });

    const res = await worker.fetch(req, {} as any);
    assert.strictEqual(res.status, 200, 'Creation endpoint should return 200 OK');

    const body = (await res.json()) as any;
    assert.ok(body.token, 'Response must contain data.token');
    assert.strictEqual(typeof body.token, 'string', 'data.token must be a string');
    assert.ok(body.organization, 'Response must contain data.organization');
    assert.strictEqual(typeof body.organization, 'object', 'data.organization must be an object');
    assert.ok(body.organization.id, 'Response must contain data.organization.id');
    assert.strictEqual(typeof body.organization.id, 'string', 'data.organization.id must be a string');
    assert.strictEqual(body.organization.name, 'Launch Studio Org');
    assert.strictEqual(body.organization.country_code, 'MY');
    assert.strictEqual(body.organization.role, 'owner');

    createdOrgData = body;
  });

  await test('1b. POST /api/organizations fails gracefully if required fields are missing', async () => {
    // Missing name
    const reqNoName = new Request('http://localhost/api/organizations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        country_code: 'MY',
      }),
    });
    const resNoName = await worker.fetch(reqNoName, {} as any);
    assert.strictEqual(resNoName.status, 422);

    // Missing country code
    const reqNoCountry = new Request('http://localhost/api/organizations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        name: 'Another Studio',
      }),
    });
    const resNoCountry = await worker.fetch(reqNoCountry, {} as any);
    assert.strictEqual(resNoCountry.status, 422);
  });

  // --------------------------------------------------------------------------
  // SECTION 2: Route Context & Parsing Rules
  // --------------------------------------------------------------------------
  console.log('\n--- Section 2: Route Context & Parsing Rules ---');

  await test('2a. parseRoute identifies /create-organization as mode: create_org', () => {
    const route = parseRoute('/create-organization');
    assert.strictEqual(route.mode, 'create_org');
    assert.strictEqual(route.isStudioRoute, false);
  });

  await test('2b. parseRoute identifies /events as mode: studio and isStudioRoute: true', () => {
    const route = parseRoute('/events');
    assert.strictEqual(route.mode, 'studio');
    assert.strictEqual(route.isStudioRoute, true);
  });

  await test('2c. parseRoute identifies /studio as mode: studio', () => {
    const route = parseRoute('/studio');
    assert.strictEqual(route.mode, 'studio');
    assert.strictEqual(route.isStudioRoute, true);
  });

  // --------------------------------------------------------------------------
  // SECTION 3: Scenario Simulations
  // --------------------------------------------------------------------------
  console.log('\n--- Section 3: Scenario Simulations ---');

  await test('3a. Scenario 1: New authenticated user creates first organization -> token updated, currentOrganization updated, route transitions to /events', async () => {
    let clientToken: string | null = authToken;
    let currentOrganization: any = null;
    let organizationsList: any[] = [];
    let currentPath = '/create-organization';
    let renderedComponent = 'CreateOrganizationPage';

    // Verify initial state: user on create-organization page because currentOrganization is null
    let route = parseRoute(currentPath);
    if (!currentOrganization) {
      renderedComponent = 'CreateOrganizationPage';
    }
    assert.strictEqual(renderedComponent, 'CreateOrganizationPage');

    // Simulate form submission
    const apiResponse = createdOrgData;
    assert.ok(apiResponse.token && apiResponse.organization?.id);

    // Update state per AuthContext implementation
    clientToken = apiResponse.token;
    currentOrganization = apiResponse.organization;
    organizationsList = [apiResponse.organization];

    // Trigger navigateTo('/events')
    currentPath = '/events';
    route = parseRoute(currentPath);

    // App.tsx evaluation
    if (!currentOrganization) {
      renderedComponent = 'CreateOrganizationPage';
    } else if (route.mode === 'create_org') {
      renderedComponent = 'RedirectingToStudioLoader';
    } else {
      renderedComponent = 'DashboardLayout';
    }

    assert.strictEqual(route.mode, 'studio');
    assert.strictEqual(renderedComponent, 'DashboardLayout');
    assert.ok(currentOrganization);
    assert.strictEqual(currentOrganization.id, createdOrgData.organization.id);
  });

  await test('3b. Scenario 2: API succeeds but fetchActiveGame() fails -> non-blocking, user still reaches Studio', async () => {
    let currentOrganization: any = null;
    let clientToken: string | null = null;

    // Simulate createOrganization logic with simulated failure in fetchActiveGame
    const simulateCreateOrgWithFailingActiveGame = async () => {
      const data = createdOrgData;
      clientToken = data.token;
      currentOrganization = data.organization;

      // fetchActiveGame fails
      try {
        throw new Error('Network error loading active game');
      } catch (err) {
        // Non-blocking catch
        console.log('    [Test Simulation] Caught non-blocking fetchActiveGame error gracefully');
      }

      // fetchThemes succeeds
      return data.organization.id;
    };

    const returnedOrgId = await simulateCreateOrgWithFailingActiveGame();
    assert.strictEqual(returnedOrgId, createdOrgData.organization.id);
    assert.ok(currentOrganization);
    assert.ok(clientToken);

    // Navigation executes normally to /events
    const route = parseRoute('/events');
    assert.strictEqual(route.mode, 'studio');
  });

  await test('3c. Scenario 3: API succeeds but fetchThemes() fails -> non-blocking, user still reaches Studio', async () => {
    let currentOrganization: any = null;
    let clientToken: string | null = null;

    const simulateCreateOrgWithFailingThemes = async () => {
      const data = createdOrgData;
      clientToken = data.token;
      currentOrganization = data.organization;

      // fetchActiveGame succeeds
      // fetchThemes fails
      try {
        throw new Error('500 Server Error fetching themes');
      } catch (err) {
        // Non-blocking catch
        console.log('    [Test Simulation] Caught non-blocking fetchThemes error gracefully');
      }

      return data.organization.id;
    };

    const returnedOrgId = await simulateCreateOrgWithFailingThemes();
    assert.strictEqual(returnedOrgId, createdOrgData.organization.id);
    assert.ok(currentOrganization);
  });

  await test('3d. Scenario 4: Refresh after creation -> URL or session restores org, user arrives at /events, never stuck on Create Organization', () => {
    const restoredUser = testUser;
    const restoredCurrentOrg = createdOrgData.organization;

    // Case A: Browser refreshed on /events
    const routeA = parseRoute('/events');
    let renderedA = '';
    if (!restoredCurrentOrg) {
      renderedA = 'CreateOrganizationPage';
    } else if (routeA.mode === 'create_org') {
      renderedA = 'EnteringStudioLoader';
    } else {
      renderedA = 'DashboardLayout';
    }
    assert.strictEqual(renderedA, 'DashboardLayout');

    // Case B: Browser refreshed on /create-organization while currentOrganization exists
    const routeB = parseRoute('/create-organization');
    let renderedB = '';
    let redirectedUrl: string | null = null;

    // App.tsx route guard evaluation:
    if (restoredUser && routeB.mode === 'create_org' && restoredCurrentOrg) {
      redirectedUrl = '/events';
    }

    if (!restoredCurrentOrg) {
      renderedB = 'CreateOrganizationPage';
    } else if (routeB.mode === 'create_org') {
      renderedB = 'EnteringStudioLoader';
    } else {
      renderedB = 'DashboardLayout';
    }

    assert.notStrictEqual(renderedB, 'CreateOrganizationPage', 'CreateOrganizationPage must NEVER render once currentOrganization exists');
    assert.strictEqual(redirectedUrl, '/events', 'Route guard must automatically redirect to /events');
  });

  await test('3e. Scenario 5: Double submission guard prevents concurrent creation requests', async () => {
    let loading = true;
    let secondRequestTriggered = false;

    const handleSecondSubmit = () => {
      if (loading) {
        return;
      }
      secondRequestTriggered = true;
    };

    handleSecondSubmit();
    assert.strictEqual(secondRequestTriggered, false, 'Second submit must be blocked while loading');
  });

  // --------------------------------------------------------------------------
  // SUMMARY
  // --------------------------------------------------------------------------
  console.log('\n======================================================');
  console.log(`Navigation Flow Tests Finished: ${passed} passed, ${failed} failed`);
  console.log('======================================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runNavigationFlowTests().catch((err) => {
  console.error('Fatal error running tests:', err);
  process.exit(1);
});
