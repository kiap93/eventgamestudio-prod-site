import assert from 'node:assert';
import {
  matchesMainSection,
  MAIN_NAVIGATION_ITEMS,
  handleMainTabNavigation,
} from '../src/lib/navigation';
import { navigateTo } from '../src/hooks/useRouteContext';

// Setup minimal DOM mocks for node environment
class MockLocation {
  pathname: string = '/';
  search: string = '';
  origin: string = 'http://localhost:3000';

  get href() {
    return this.origin + this.pathname + this.search;
  }
}

class MockHistory {
  private stack: { state: any; url: string }[] = [];
  private index = -1;

  pushState(state: any, title: string, url: string) {
    this.stack.push({ state, url });
    this.index = this.stack.length - 1;
    const urlObj = new URL(url, 'http://localhost:3000');
    (global as any).window.location.pathname = urlObj.pathname;
    (global as any).window.location.search = urlObj.search;
  }

  replaceState(state: any, title: string, url: string) {
    if (this.index >= 0) {
      this.stack[this.index] = { state, url };
    } else {
      this.stack.push({ state, url });
      this.index = 0;
    }
    const urlObj = new URL(url, 'http://localhost:3000');
    (global as any).window.location.pathname = urlObj.pathname;
    (global as any).window.location.search = urlObj.search;
  }
}

class MockEventTarget {
  private listeners = new Map<string, Function[]>();

  addEventListener(type: string, listener: Function) {
    const list = this.listeners.get(type) || [];
    list.push(listener);
    this.listeners.set(type, list);
  }

  removeEventListener(type: string, listener: Function) {
    const list = this.listeners.get(type) || [];
    this.listeners.set(type, list.filter((l) => l !== listener));
  }

  dispatchEvent(event: { type: string }) {
    const list = this.listeners.get(event.type) || [];
    for (const listener of list) {
      listener(event);
    }
    return true;
  }
}

const mockWindow = new MockEventTarget() as any;
mockWindow.location = new MockLocation();
mockWindow.history = new MockHistory();
mockWindow.sessionStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};

(global as any).window = mockWindow;
(global as any).Event = class {
  constructor(public type: string) {}
};

console.log('--- RUNNING GLOBAL NAVIGATION ACTIVE TAB TESTS ---');

// Test 1: Navigation items configuration
console.log('Test 1: Main navigation items are properly configured');
assert.strictEqual(MAIN_NAVIGATION_ITEMS.length, 3);
assert.deepStrictEqual(
  MAIN_NAVIGATION_ITEMS.map((item) => ({ id: item.id, href: item.href, label: item.label })),
  [
    { id: 'events', href: '/events', label: 'Events' },
    { id: 'games', href: '/games', label: 'Games' },
    { id: 'team', href: '/team', label: 'Team' },
  ]
);

// Test 2: Active tab detection (matchesMainSection) for nested and root routes
console.log('Test 2: matchesMainSection preserves active styling for root and nested routes');

// Games section
assert.strictEqual(matchesMainSection('/games', '/games'), true, 'Root /games should match /games');
assert.strictEqual(matchesMainSection('/games/catch-brand', '/games'), true, 'Game detail /games/:id should match /games');
assert.strictEqual(matchesMainSection('/games/catch-brand/themes/carnival', '/games'), true, 'Theme view should match /games');
assert.strictEqual(matchesMainSection('/games/catch-brand/themes/carnival/edit', '/games'), true, 'Theme editor should match /games');
assert.strictEqual(matchesMainSection('/game-themes/carnival/edit', '/games'), true, 'Legacy theme editor should match /games');
assert.strictEqual(matchesMainSection('/studio', '/games'), true, 'Studio route should match /games');
assert.strictEqual(matchesMainSection('/games?editTheme=thm_123', '/games'), true, 'Query param should match /games');

// Events section
assert.strictEqual(matchesMainSection('/events', '/events'), true, 'Root /events should match /events');
assert.strictEqual(matchesMainSection('/events/evt_123', '/events'), true, 'Event detail should match /events');
assert.strictEqual(matchesMainSection('/events/evt_123/showcase', '/events'), true, 'Event showcase should match /events');
assert.strictEqual(matchesMainSection('/events/evt_123/preview', '/events'), true, 'Event preview should match /events');
assert.strictEqual(matchesMainSection('/events?create=true', '/events'), true, 'Events query param should match /events');

// Team section
assert.strictEqual(matchesMainSection('/team', '/team'), true, 'Root /team should match /team');
assert.strictEqual(matchesMainSection('/team/settings', '/team'), true, 'Team settings should match /team');
assert.strictEqual(matchesMainSection('/team/members', '/team'), true, 'Team members should match /team');

// Cross-section isolation
assert.strictEqual(matchesMainSection('/events', '/games'), false, '/events must NOT match /games');
assert.strictEqual(matchesMainSection('/games', '/events'), false, '/games must NOT match /events');
assert.strictEqual(matchesMainSection('/team', '/games'), false, '/team must NOT match /games');
assert.strictEqual(matchesMainSection('/games', '/team'), false, '/games must NOT match /team');

// Test 3: Navigation Behavior Simulation
console.log('Test 3: Clicking active main tab navigates back to root landing route');

let popstateCount = 0;
window.addEventListener('popstate', () => {
  popstateCount++;
});

// Scenario A: Games -> Theme Editor -> click Games
window.location.pathname = '/games/catch-brand/themes/carnival/edit';
window.location.search = '';
assert.strictEqual(matchesMainSection(window.location.pathname, '/games'), true, 'Games tab is visually active');
handleMainTabNavigation('/games');
assert.strictEqual(window.location.pathname, '/games', 'Clicking Games from Theme Editor must navigate to /games');
assert.strictEqual(window.location.search, '');

// Scenario B: Games -> Game Detail (Theme list) -> click Games
window.location.pathname = '/games/catch-brand';
window.location.search = '';
assert.strictEqual(matchesMainSection(window.location.pathname, '/games'), true, 'Games tab is visually active');
handleMainTabNavigation('/games');
assert.strictEqual(window.location.pathname, '/games', 'Clicking Games from Game Detail must navigate to /games');

// Scenario C: Events -> Event Detail / Showcase -> click Events
window.location.pathname = '/events/evt_abc123/showcase';
window.location.search = '';
assert.strictEqual(matchesMainSection(window.location.pathname, '/events'), true, 'Events tab is visually active');
handleMainTabNavigation('/events');
assert.strictEqual(window.location.pathname, '/events', 'Clicking Events from Event Detail/Showcase must navigate to /events');

// Scenario D: Team -> Team Settings -> click Team
window.location.pathname = '/team/settings';
window.location.search = '';
assert.strictEqual(matchesMainSection(window.location.pathname, '/team'), true, 'Team tab is visually active');
handleMainTabNavigation('/team');
assert.strictEqual(window.location.pathname, '/team', 'Clicking Team from Team Settings must navigate to /team');

// Scenario E: Already on /games -> click Games stays on /games
window.location.pathname = '/games';
window.location.search = '';
const currentPopCount = popstateCount;
handleMainTabNavigation('/games');
assert.strictEqual(window.location.pathname, '/games', 'Clicking Games while already on /games stays on /games');
assert.strictEqual(popstateCount, currentPopCount + 1, 'Popstate dispatched to reset any local modals');

console.log('--- ALL GLOBAL NAVIGATION ACTIVE TAB TESTS PASSED SUCCESSFULLY! ---');
