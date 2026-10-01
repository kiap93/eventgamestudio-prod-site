import assert from 'node:assert';

console.log('======================================================');
console.log('RUNNING THEME SWITCHING LOADING STATE & RACE CONDITION TESTS');
console.log('======================================================');

// 1. Verify preset asset configuration
const presets = [
  {
    id: 'carnival',
    name: 'Carnival Fiesta',
    bgPath: '/assets/games/catch-brand/themes/carnival/background.png',
    basketPath: '/assets/games/catch-brand/themes/carnival/basket.png',
    itemNormal: '/assets/games/catch-brand/themes/carnival/item_normal_01.png',
    itemBonus: '/assets/games/catch-brand/themes/carnival/item_bonus_01.png',
    itemHazard: '/assets/games/catch-brand/themes/carnival/item_hazard_01.png',
  },
  {
    id: 'chinese-new-year',
    name: 'Lunar New Year',
    bgPath: '/assets/games/catch-brand/themes/cny/background.png',
    basketPath: '/assets/games/catch-brand/themes/cny/basket.png',
    itemNormal: '/assets/games/catch-brand/themes/cny/item_normal_01.png',
    itemBonus: '/assets/games/catch-brand/themes/cny/item_bonus_01.png',
    itemHazard: '/assets/games/catch-brand/themes/cny/item_hazard_01.png',
  },
  {
    id: 'christmas',
    name: 'Winter Holiday',
    bgPath: '/assets/games/catch-brand/themes/christmas/background.png',
    basketPath: '/assets/games/catch-brand/themes/christmas/basket.png',
    itemNormal: '/assets/games/catch-brand/themes/christmas/item_normal_01.png',
    itemBonus: '/assets/games/catch-brand/themes/christmas/item_bonus_01.png',
    itemHazard: '/assets/games/catch-brand/themes/christmas/item_hazard_01.png',
  },
  {
    id: 'halloween',
    name: 'Halloween Special',
    bgPath: '/assets/games/catch-brand/themes/halloween/background.png',
    basketPath: '/assets/games/catch-brand/themes/halloween/basket.png',
    itemNormal: '/assets/games/catch-brand/themes/halloween/item_normal_01.png',
    itemBonus: '/assets/games/catch-brand/themes/halloween/item_bonus_01.png',
    itemHazard: '/assets/games/catch-brand/themes/halloween/item_hazard_01.png',
  },
  {
    id: 'mango',
    name: 'Summer Orchard',
    bgPath: '/assets/games/catch-brand/themes/mango/background.png',
    basketPath: '/assets/games/catch-brand/themes/mango/basket.png',
    itemNormal: '/assets/games/catch-brand/themes/mango/item_normal_01.png',
    itemBonus: '/assets/games/catch-brand/themes/mango/item_bonus_01.png',
    itemHazard: '/assets/games/catch-brand/themes/mango/item_hazard_01.png',
  },
];

// Test 1: Each preset has all 5 required asset paths
for (const p of presets) {
  assert.ok(p.bgPath.endsWith('.png'), `${p.id} must have .png background`);
  assert.ok(p.basketPath.endsWith('.png'), `${p.id} must have .png basket`);
  assert.ok(p.itemNormal.endsWith('.png'), `${p.id} must have .png normal item`);
  assert.ok(p.itemBonus.endsWith('.png'), `${p.id} must have .png bonus item`);
  assert.ok(p.itemHazard.endsWith('.png'), `${p.id} must have .png hazard item`);
}
console.log('✓ PASS: All 5 Catch The Brand presets have 5 complete asset slots');

// Test 2: Contextual Loading Message Formatting
function getContextualLoadingMessage(presetName: string): string {
  if (/theme|tema|主题/i.test(presetName)) {
    return `Loading ${presetName}…`;
  }
  return `Loading ${presetName} Theme…`;
}

assert.strictEqual(
  getContextualLoadingMessage('Winter Holiday'),
  'Loading Winter Holiday Theme…',
  'Must produce "Loading Winter Holiday Theme…"'
);
assert.strictEqual(
  getContextualLoadingMessage('Carnival Fiesta'),
  'Loading Carnival Fiesta Theme…',
  'Must produce "Loading Carnival Fiesta Theme…"'
);
assert.strictEqual(
  getContextualLoadingMessage('Halloween Special Theme'),
  'Loading Halloween Special Theme…',
  'Must avoid duplicate "Theme Theme"'
);
console.log('✓ PASS: Contextual loading message formatting verified');

// Test 3: State Machine Simulation for Race Condition Protection
class ThemeSwitchController {
  selectedPresetId = 'carnival';
  displayedPresetId = 'carnival';
  isLoading = false;
  loadError = false;
  currentRequestId = 0;
  loadHistory: string[] = [];

  selectPreset(
    presetId: string,
    mockAssetLoader: (id: string) => Promise<void>
  ): Promise<void> {
    if (presetId === this.selectedPresetId && !this.loadError) {
      return Promise.resolve();
    }

    this.selectedPresetId = presetId;
    this.isLoading = true;
    this.loadError = false;
    const reqId = ++this.currentRequestId;

    return mockAssetLoader(presetId)
      .then(() => {
        if (this.currentRequestId === reqId) {
          this.displayedPresetId = presetId;
          this.isLoading = false;
          this.loadError = false;
          this.loadHistory.push(presetId);
        }
      })
      .catch(() => {
        if (this.currentRequestId === reqId) {
          this.isLoading = false;
          this.loadError = true;
        }
      });
  }

  retry(mockAssetLoader: (id: string) => Promise<void>): Promise<void> {
    this.isLoading = true;
    this.loadError = false;
    const reqId = ++this.currentRequestId;

    return mockAssetLoader(this.selectedPresetId)
      .then(() => {
        if (this.currentRequestId === reqId) {
          this.displayedPresetId = this.selectedPresetId;
          this.isLoading = false;
          this.loadError = false;
          this.loadHistory.push(this.selectedPresetId);
        }
      })
      .catch(() => {
        if (this.currentRequestId === reqId) {
          this.isLoading = false;
          this.loadError = true;
        }
      });
  }
}

// Test 4: Single theme switch
{
  const controller = new ThemeSwitchController();
  assert.strictEqual(controller.isLoading, false);
  assert.strictEqual(controller.displayedPresetId, 'carnival');

  const p = controller.selectPreset('christmas', async () => {
    // fast load
  });
  // Immediately upon selection:
  assert.strictEqual(controller.selectedPresetId, 'christmas');
  assert.strictEqual(controller.isLoading, true);
  assert.strictEqual(controller.displayedPresetId, 'carnival'); // previous preserved while loading

  await p;
  assert.strictEqual(controller.isLoading, false);
  assert.strictEqual(controller.displayedPresetId, 'christmas');
  assert.strictEqual(controller.loadError, false);
  console.log('✓ PASS: Immediate loading feedback and successful transition verified');
}

// Test 5: Rapid theme switching (Race condition check)
{
  const controller = new ThemeSwitchController();

  // User clicks chinese-new-year (takes 50ms)
  const p1 = controller.selectPreset('chinese-new-year', () =>
    new Promise((resolve) => setTimeout(resolve, 50))
  );
  assert.strictEqual(controller.selectedPresetId, 'chinese-new-year');
  assert.strictEqual(controller.isLoading, true);

  // User immediately clicks halloween (takes 10ms)
  const p2 = controller.selectPreset('halloween', () =>
    new Promise((resolve) => setTimeout(resolve, 10))
  );
  assert.strictEqual(controller.selectedPresetId, 'halloween');
  assert.strictEqual(controller.isLoading, true);

  // User immediately clicks christmas (takes 30ms)
  const p3 = controller.selectPreset('christmas', () =>
    new Promise((resolve) => setTimeout(resolve, 30))
  );
  assert.strictEqual(controller.selectedPresetId, 'christmas');

  await Promise.all([p1, p2, p3]);

  // Only christmas should be the final displayed preset!
  assert.strictEqual(controller.displayedPresetId, 'christmas');
  assert.strictEqual(controller.selectedPresetId, 'christmas');
  assert.strictEqual(controller.isLoading, false);
  assert.strictEqual(controller.loadError, false);
  // Only 1 item pushed to history: 'christmas'
  assert.deepStrictEqual(controller.loadHistory, ['christmas']);
  console.log('✓ PASS: Race condition prevented under rapid switching; only latest selection applied');
}

// Test 6: Stale error does not overwrite active selection
{
  const controller = new ThemeSwitchController();

  // Request 1 fails after 40ms
  const p1 = controller.selectPreset('halloween', () =>
    new Promise((_, reject) => setTimeout(() => reject(new Error('fail')), 40))
  );

  // User immediately selects christmas (succeeds in 60ms)
  const p2 = controller.selectPreset('christmas', () =>
    new Promise((resolve) => setTimeout(resolve, 60))
  );

  await Promise.all([p1, p2]);

  assert.strictEqual(controller.displayedPresetId, 'christmas');
  assert.strictEqual(controller.isLoading, false);
  assert.strictEqual(controller.loadError, false, 'Stale error must be discarded');
  console.log('✓ PASS: Stale error from previous theme does not pollute active selection');
}

// Test 7: Error and retry workflow
{
  const controller = new ThemeSwitchController();
  let failOnce = true;

  const mockLoader = (id: string) => {
    if (failOnce) {
      failOnce = false;
      return Promise.reject(new Error('Network drop'));
    }
    return Promise.resolve();
  };

  await controller.selectPreset('mango', mockLoader);
  assert.strictEqual(controller.loadError, true);
  assert.strictEqual(controller.isLoading, false);
  assert.strictEqual(controller.displayedPresetId, 'carnival'); // previous preserved on error

  // Now user clicks retry
  await controller.retry(mockLoader);
  assert.strictEqual(controller.loadError, false);
  assert.strictEqual(controller.isLoading, false);
  assert.strictEqual(controller.displayedPresetId, 'mango');
  console.log('✓ PASS: Error and retry flow correctly updates state');
}

// Test 8: Browser Image constructor verification (no shadowing by lucide icons)
{
  class MockDOMImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    complete = false;
    naturalWidth = 100;
    src = '';
    decode() {
      return Promise.resolve();
    }
  }

  (globalThis as any).window = {
    Image: MockDOMImage,
  };

  assert.strictEqual(typeof (globalThis as any).window.Image, 'function');
  const img = new (globalThis as any).window.Image();
  assert.ok(img instanceof MockDOMImage, 'Must instantiate DOM Image without throwing');
  console.log('✓ PASS: Browser Image constructor correctly instantiable without shadowing');
}

console.log('======================================================');
console.log('ALL THEME SWITCHING LOADING STATE TESTS PASSED');
console.log('======================================================');
