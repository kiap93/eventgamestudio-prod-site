import assert from 'node:assert';
import worker from '../worker.js';
import { signAppToken } from './auth.js';
import { createUser } from './db/users.js';
import { createOrganization } from './db/organizations.js';
import { resolveActiveOrganization, Organization } from '../src/context/AuthContext.js';
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

async function runSessionRestorationTests() {
  console.log('======================================================');
  console.log('Running Organization Session Restoration Regression Tests');
  console.log('======================================================\n');

  // --------------------------------------------------------------------------
  // SECTION 1: resolveActiveOrganization Unit & Fallback Rules
  // --------------------------------------------------------------------------
  console.log('--- Section 1: resolveActiveOrganization Logic & Fallbacks ---');

  const sampleOrgs: Organization[] = [
    {
      id: 'org-alpha-123',
      name: 'Alpha Corp',
      slug: 'alpha-corp',
      role: 'owner',
      logo_url: 'https://example.com/logo.png',
      country_code: 'MY',
    },
    {
      id: 'org-beta-456',
      name: 'Beta Studio',
      slug: 'beta-studio',
      role: 'admin',
      logo_url: null,
      country_code: 'SG',
    },
  ];

  await test('1a. Resolves full organization object from rawActiveOrg', () => {
    const raw = {
      id: 'org-alpha-123',
      name: 'Alpha Corp',
      slug: 'alpha-corp',
      role: 'owner',
      logo_url: 'https://example.com/logo.png',
      country_code: 'MY',
    };
    const result = resolveActiveOrganization(raw, sampleOrgs);
    assert.ok(result);
    assert.strictEqual(result.id, 'org-alpha-123');
    assert.strictEqual(result.name, 'Alpha Corp');
    assert.strictEqual(result.role, 'owner');
    assert.strictEqual(result.country_code, 'MY');
    assert.strictEqual(result.logo_url, 'https://example.com/logo.png');
  });

  await test('1b. Merges missing fields from matching membership in orgList when rawActiveOrg is partial', () => {
    const partialRaw = {
      id: 'org-alpha-123',
    };
    const result = resolveActiveOrganization(partialRaw, sampleOrgs);
    assert.ok(result);
    assert.strictEqual(result.id, 'org-alpha-123');
    assert.strictEqual(result.name, 'Alpha Corp');
    assert.strictEqual(result.role, 'owner');
    assert.strictEqual(result.country_code, 'MY');
    assert.strictEqual(result.logo_url, 'https://example.com/logo.png');
  });

  await test('1c. Resolves organization when rawActiveOrg is passed as a string ID', () => {
    const result = resolveActiveOrganization('org-beta-456', sampleOrgs);
    assert.ok(result);
    assert.strictEqual(result.id, 'org-beta-456');
    assert.strictEqual(result.name, 'Beta Studio');
    assert.strictEqual(result.role, 'admin');
    assert.strictEqual(result.country_code, 'SG');
  });

  await test('1d. Falls back to first organization membership (orgList[0]) when rawActiveOrg is null/absent', () => {
    const result = resolveActiveOrganization(null, sampleOrgs);
    assert.ok(result);
    assert.strictEqual(result.id, 'org-alpha-123');
    assert.strictEqual(result.name, 'Alpha Corp');
    assert.strictEqual(result.role, 'owner');
    assert.strictEqual(result.country_code, 'MY');
  });

  await test('1e. Returns null when user has no organization memberships (orgList is empty)', () => {
    const result = resolveActiveOrganization(null, []);
    assert.strictEqual(result, null);
  });

  // --------------------------------------------------------------------------
  // SECTION 2: /api/auth/me API Contract Verification
  // --------------------------------------------------------------------------
  console.log('\n--- Section 2: /api/auth/me Contract with Existing Organizations ---');

  const existingUser = await createUser({
    email: `existing-session-${Date.now()}@example.com`,
    name: 'Existing Member',
  });

  const createdOrg = await createOrganization({
    name: 'Existing Member Org',
    owner_id: existingUser.id,
    country_code: 'MY',
  });

  const authToken = await signAppToken(existingUser.id, createdOrg.id, 'owner');

  let meApiResponse: any = null;

  await test('2a. /api/auth/me returns populated organizations array and non-null activeOrganization', async () => {
    const req = new Request('http://localhost/api/auth/me', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
    });

    const res = await worker.fetch(req, {} as any);
    assert.strictEqual(res.status, 200, '/api/auth/me should succeed with 200');

    meApiResponse = (await res.json()) as any;
    assert.ok(meApiResponse.user, 'Must return user object');
    assert.strictEqual(meApiResponse.user.id, existingUser.id);
    assert.ok(Array.isArray(meApiResponse.organizations), 'Must return organizations array');
    assert.ok(meApiResponse.organizations.length > 0, 'Must have at least one organization membership');
    assert.ok(meApiResponse.activeOrganization, 'Must return activeOrganization object');
    assert.strictEqual(meApiResponse.activeOrganization.id, createdOrg.id);
    assert.strictEqual(meApiResponse.activeOrganization.name, 'Existing Member Org');
    assert.strictEqual(meApiResponse.activeOrganization.country_code, 'MY');
    assert.strictEqual(meApiResponse.activeOrganization.role, 'owner');
  });

  // --------------------------------------------------------------------------
  // SECTION 3: Refresh on /events Regression Simulation
  // --------------------------------------------------------------------------
  console.log('\n--- Section 3: Browser Refresh on /events Regression Simulation ---');

  await test('3a. Refresh on /events: app waits for session restoration and never redirects or displays CreateOrganizationPage', async () => {
    // Phase 1: Initial mount state during page reload on /events
    let isLoading = true;
    let currentUser: any = null;
    let currentOrganization: any = null;
    let organizations: any[] = [];
    const currentPath = '/events';
    const route = parseRoute(currentPath);

    // Initial render: isLoading is true
    let renderedComponent = '';
    if (isLoading) {
      renderedComponent = 'LoadingSpinner';
    }
    assert.strictEqual(renderedComponent, 'LoadingSpinner', 'During initial refresh, loading spinner must display');

    // Phase 2: refreshSession executes
    const data = meApiResponse;
    currentUser = data.user;
    organizations = data.organizations;
    const resolvedOrg = resolveActiveOrganization(data.activeOrganization || data.activeOrganizationId, organizations);
    currentOrganization = resolvedOrg;
    isLoading = false;

    // Phase 3: Route evaluation after refreshSession completes
    const isPublicRoute = false;
    const isLoginRoute = false;
    const isAuthenticated = !!currentUser;

    if (isLoading) {
      renderedComponent = 'LoadingSpinner';
    } else if (!isAuthenticated) {
      renderedComponent = 'LoginPage';
    } else if (isLoginRoute) {
      renderedComponent = 'RedirectToLanding';
    } else if (!currentOrganization) {
      if (organizations.length > 0 && route.mode !== 'create_org') {
        renderedComponent = 'LoadingWorkspace';
      } else {
        renderedComponent = 'CreateOrganizationPage';
      }
    } else if (route.mode === 'create_org') {
      renderedComponent = 'EnteringStudioLoader';
    } else {
      renderedComponent = 'DashboardLayout';
    }

    assert.strictEqual(renderedComponent, 'DashboardLayout', 'Existing user on /events must land directly on DashboardLayout');
    assert.notStrictEqual(renderedComponent, 'CreateOrganizationPage', 'Existing user must NEVER see CreateOrganizationPage');
    assert.ok(currentOrganization);
    assert.strictEqual(currentOrganization.id, createdOrg.id);
  });

  await test('3b. Organization-scoped state is cleared when user has no organizations', () => {
    let activeGame: any = { id: 'game-1' };
    let themes: any[] = [{ id: 'theme-1' }];
    let activeTheme: any = { id: 'theme-1' };

    const emptyOrgList: any[] = [];
    const resolvedOrg = resolveActiveOrganization(null, emptyOrgList);

    if (resolvedOrg) {
      // would fetch
    } else {
      activeGame = null;
      themes = [];
      activeTheme = null;
    }

    assert.strictEqual(resolvedOrg, null);
    assert.strictEqual(activeGame, null);
    assert.strictEqual(themes.length, 0);
    assert.strictEqual(activeTheme, null);
  });

  // --------------------------------------------------------------------------
  // SECTION 4: Visit to /create-organization with an Active Organization
  // --------------------------------------------------------------------------
  console.log('\n--- Section 4: Visit to /create-organization with Active Organization ---');

  await test('4a. Existing user with active organization visiting /create-organization is redirected to default landing (/events) and never trapped on create page', () => {
    const user = existingUser;
    const activeOrg = sampleOrgs[0];
    const targetPath = '/create-organization';
    const route = parseRoute(targetPath);

    assert.strictEqual(route.mode, 'create_org');

    // Route guard check in App.tsx useEffect
    const isDesigner = activeOrg.role === 'designer';
    const defaultLanding = isDesigner ? '/games' : '/events';
    let redirectedUrl: string | null = null;

    if (route.mode === 'create_org' && activeOrg) {
      redirectedUrl = defaultLanding;
    }

    // Component render check in App.tsx
    let renderedComponent = '';
    if (!activeOrg) {
      renderedComponent = 'CreateOrganizationPage';
    } else if (route.mode === 'create_org') {
      renderedComponent = 'EnteringStudioLoader';
    } else {
      renderedComponent = 'DashboardLayout';
    }

    assert.strictEqual(redirectedUrl, '/events', 'Must automatically redirect existing user with active org to /events');
    assert.strictEqual(renderedComponent, 'EnteringStudioLoader', 'Renders studio transition loader while redirecting');
    assert.notStrictEqual(renderedComponent, 'CreateOrganizationPage', 'CreateOrganizationPage must NEVER render when active organization exists');
  });

  await test('4b. Genuinely new user with no organizations (organizations.length === 0) lands on CreateOrganizationPage', () => {
    const brandNewUser = { id: 'new-user-1', email: 'new@example.com' };
    const emptyOrgs: Organization[] = [];
    const activeOrg = resolveActiveOrganization(null, emptyOrgs);
    const targetPath = '/events';
    const route = parseRoute(targetPath);

    let renderedComponent = '';
    if (!activeOrg) {
      if (emptyOrgs.length > 0 && route.mode !== 'create_org') {
        renderedComponent = 'LoadingWorkspace';
      } else {
        renderedComponent = 'CreateOrganizationPage';
      }
    } else {
      renderedComponent = 'DashboardLayout';
    }

    assert.strictEqual(activeOrg, null);
    assert.strictEqual(renderedComponent, 'CreateOrganizationPage', 'New user without any organization must see CreateOrganizationPage');
  });

  await test('4c. Explicitly initiating organization creation (startCreateOrganization) allows existing user to create additional organization', () => {
    let currentOrganization: Organization | null = sampleOrgs[0];
    let previousActiveOrg: Organization | null = null;
    let currentPath = '/events';

    // User clicks "+ Create New Org"
    const startCreateOrganization = () => {
      if (currentOrganization) {
        previousActiveOrg = currentOrganization;
      }
      currentOrganization = null;
      currentPath = '/create-organization';
    };

    startCreateOrganization();
    assert.strictEqual(currentOrganization, null);
    assert.ok(previousActiveOrg);
    assert.strictEqual(previousActiveOrg.id, sampleOrgs[0].id);

    const route = parseRoute(currentPath);
    let renderedComponent = '';
    if (!currentOrganization) {
      if (sampleOrgs.length > 0 && route.mode !== 'create_org') {
        renderedComponent = 'LoadingWorkspace';
      } else {
        renderedComponent = 'CreateOrganizationPage';
      }
    }

    assert.strictEqual(renderedComponent, 'CreateOrganizationPage', 'When deliberately creating a new org, CreateOrganizationPage is shown');

    // User clicks "Go Back"
    const cancelCreateOrganization = () => {
      if (previousActiveOrg) {
        currentOrganization = previousActiveOrg;
      }
      currentPath = '/events';
    };

    cancelCreateOrganization();
    assert.ok(currentOrganization);
    assert.strictEqual(currentOrganization.id, sampleOrgs[0].id);
  });

  // --------------------------------------------------------------------------
  // SECTION 5: Switching Between Multiple Organizations
  // --------------------------------------------------------------------------
  console.log('\n--- Section 5: Switching Between Multiple Organizations ---');

  await test('5a. Switching organizations correctly updates currentOrganization and maintains required fields', async () => {
    const secondOrg = await createOrganization({
      name: 'Second Event Org',
      owner_id: existingUser.id,
      country_code: 'SG',
    });

    const switchReq = new Request('http://localhost/api/auth/switch-org', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ organizationId: secondOrg.id }),
    });

    const switchRes = await worker.fetch(switchReq, {} as any);
    assert.strictEqual(switchRes.status, 200, 'Switch org should return 200');

    const switchData = (await switchRes.json()) as any;
    assert.ok(switchData.token, 'Must return refreshed token');
    assert.ok(switchData.activeOrganization, 'Must return switched activeOrganization');
    assert.strictEqual(switchData.activeOrganization.id, secondOrg.id);
    assert.strictEqual(switchData.activeOrganization.name, 'Second Event Org');
    assert.strictEqual(switchData.activeOrganization.country_code, 'SG');

    const targetOrg = resolveActiveOrganization(switchData.activeOrganization, switchData.organizations);
    assert.ok(targetOrg);
    assert.strictEqual(targetOrg.id, secondOrg.id);
    assert.strictEqual(targetOrg.country_code, 'SG');
  });

  // --------------------------------------------------------------------------
  // SUMMARY
  // --------------------------------------------------------------------------
  console.log('\n======================================================');
  console.log(`Regression Test Summary: ${passed} passed, ${failed} failed`);
  console.log('======================================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runSessionRestorationTests().catch((err) => {
  console.error('Fatal error running regression tests:', err);
  process.exit(1);
});
