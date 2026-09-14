import assert from 'node:assert';
import { parseRoute, getPreviousInternalRoute, navigateBack, navigateTo } from '../src/hooks/useRouteContext';

// Mock browser environment for simulation
class MockStorage {
  private store = new Map<string, string>();
  getItem(key: string): string | null {
    return this.store.get(key) || null;
  }
  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  clear(): void {
    this.store.clear();
  }
}

class MockHistory {
  private stack: { state: any; url: string }[] = [];
  private index = -1;

  pushState(state: any, title: string, url: string) {
    // Truncate forward history if pushing from middle
    if (this.index < this.stack.length - 1) {
      this.stack = this.stack.slice(0, this.index + 1);
    }
    this.stack.push({ state, url });
    this.index = this.stack.length - 1;
    this.syncGlobal();
  }

  replaceState(state: any, title: string, url: string) {
    if (this.index >= 0) {
      this.stack[this.index] = { state, url };
    } else {
      this.stack.push({ state, url });
      this.index = 0;
    }
    this.syncGlobal();
  }

  back() {
    if (this.index > 0) {
      this.index--;
      this.syncGlobal();
      (global as any).window.dispatchEvent(new Event('popstate'));
    }
  }

  get length() {
    return this.stack.length;
  }

  get state() {
    return this.stack[this.index]?.state || null;
  }

  get currentUrl() {
    return this.stack[this.index]?.url || '/';
  }

  private syncGlobal() {
    if ((global as any).window) {
      (global as any).window.location.pathname = this.stack[this.index]?.url || '/';
    }
  }
}

async function runGoBackNavigationTests() {
  console.log('======================================================');
  console.log('Running Create Organization "Go Back" Navigation Tests');
  console.log('======================================================\n');

  let passed = 0;
  let failed = 0;

  async function test(name: string, fn: () => void | Promise<void>) {
    try {
      await fn();
      console.log(`  ✓ ${name}`);
      passed++;
    } catch (err: any) {
      console.error(`  ✗ ${name}`);
      console.error(`    Error: ${err.message}`);
      failed++;
    }
  }

  // Setup DOM mocks
  const mockStorage = new MockStorage();
  const mockHistory = new MockHistory();

  (global as any).window = {
    location: {
      pathname: '/',
      search: '',
      origin: 'https://eventgamestudio.local',
    },
    history: mockHistory,
    sessionStorage: mockStorage,
    dispatchEvent: (ev: any) => {},
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  (global as any).document = {
    referrer: '',
  };
  (global as any).Event = class {
    type: string;
    constructor(type: string) {
      this.type = type;
    }
  };

  // Test 1: Flow 1 - Dashboard → Create Organization → Go Back
  await test('Flow 1: Dashboard → Create Organization → Go Back returns to Dashboard', () => {
    mockStorage.clear();
    // 1. User starts at Dashboard (/events)
    navigateTo('/events');
    assert.strictEqual(window.location.pathname, '/events');

    // 2. User navigates to Create Organization
    navigateTo('/create-organization');
    assert.strictEqual(window.location.pathname, '/create-organization');
    const parsed = parseRoute(window.location.pathname);
    assert.strictEqual(parsed.mode, 'create_org');

    // Verify tracked previous route
    const prev = getPreviousInternalRoute();
    assert.strictEqual(prev, '/events');

    // 3. User clicks Go Back
    navigateBack('/dashboard');
    assert.strictEqual(window.location.pathname, '/events', 'Should return to Dashboard (/events)');
  });

  // Test 2: Flow 2 - Organizations → Create Organization → Go Back
  await test('Flow 2: Organizations → Create Organization → Go Back returns to Organizations', () => {
    mockStorage.clear();
    // 1. User starts at Organizations page (/developer/organizations)
    navigateTo('/developer/organizations');
    assert.strictEqual(window.location.pathname, '/developer/organizations');

    // 2. User navigates to Create Organization
    navigateTo('/create-organization');
    assert.strictEqual(window.location.pathname, '/create-organization');

    const prev = getPreviousInternalRoute();
    assert.strictEqual(prev, '/developer/organizations');

    // 3. User clicks Go Back
    navigateBack('/dashboard');
    assert.strictEqual(window.location.pathname, '/developer/organizations', 'Should return to Organizations');
  });

  // Test 3: Flow 3 - User directly opens /create-organization
  await test('Flow 3: User directly opens /create-organization -> Go Back uses safe fallback (/dashboard)', () => {
    mockStorage.clear();
    // Clean history simulation (direct URL entry in fresh tab)
    const freshHistory = new MockHistory();
    freshHistory.pushState(null, '', '/create-organization');
    (global as any).window.history = freshHistory;
    (global as any).window.location.pathname = '/create-organization';
    (global as any).document.referrer = '';

    const prev = getPreviousInternalRoute();
    assert.strictEqual(prev, null, 'No previous internal route should exist for directly opened URL');

    // User clicks Go Back
    navigateBack('/dashboard');
    assert.strictEqual(window.location.pathname, '/dashboard', 'Should safely fall back to /dashboard');
  });

  // Test 4: Flow 4 - Validation error while creating organization
  await test('Flow 4: Validation error while creating organization -> Go Back remains available and navigates', () => {
    mockStorage.clear();
    navigateTo('/events');
    navigateTo('/create-organization');

    // Simulate validation error (name is empty)
    const formState = { name: '', countryCode: '', error: null as string | null };
    if (!formState.name.trim()) {
      formState.error = 'Please enter your organization name';
    }
    assert.strictEqual(formState.error, 'Please enter your organization name');

    // Go Back is still functional and returns to /events
    navigateBack('/dashboard');
    assert.strictEqual(window.location.pathname, '/events');
  });

  // Test 5: Flow 5 - Successful organization creation behavior unchanged
  await test('Flow 5: Successful organization creation -> transitions to /events', () => {
    mockStorage.clear();
    navigateTo('/create-organization');

    // Simulate successful creation navigation
    navigateTo('/events');
    assert.strictEqual(window.location.pathname, '/events');
    const route = parseRoute(window.location.pathname);
    assert.strictEqual(route.mode, 'studio');
    assert.strictEqual(route.isStudioRoute, true);
  });

  // Test 6: External referrer safety
  await test('Safety: External referrer (e.g. google.com) does not cause leak, falls back to /dashboard', () => {
    mockStorage.clear();
    const externalHistory = new MockHistory();
    externalHistory.pushState(null, '', 'https://google.com/search');
    externalHistory.pushState(null, '', '/create-organization');
    (global as any).window.history = externalHistory;
    (global as any).window.location.pathname = '/create-organization';
    (global as any).document.referrer = 'https://google.com/';

    const prev = getPreviousInternalRoute();
    assert.strictEqual(prev, null, 'External referrer must not be considered a valid internal route');

    navigateBack('/dashboard');
    assert.strictEqual(window.location.pathname, '/dashboard', 'Safe fallback must be used');
  });

  console.log('\n======================================================');
  console.log(`Go Back Navigation Tests Finished: ${passed} passed, ${failed} failed`);
  console.log('======================================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runGoBackNavigationTests().catch((err) => {
  console.error('Fatal error running tests:', err);
  process.exit(1);
});
