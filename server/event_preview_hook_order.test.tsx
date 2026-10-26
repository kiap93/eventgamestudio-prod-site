import '../src/components/developer/setup_test_dom';
import React from 'react';
import assert from 'node:assert';
import { Window } from 'happy-dom';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

// Setup full DOM environment for React rendering
const win = new Window({
  url: 'https://eventgamestudio.com/events/a18973ee-cde8-4a55-969f-2994a9d4de16/preview',
  width: 1280,
  height: 800,
});

(globalThis as any).window = win;
(globalThis as any).document = win.document;
(globalThis as any).navigator = win.navigator;
(globalThis as any).Element = win.Element;
(globalThis as any).HTMLElement = win.HTMLElement;
(globalThis as any).HTMLDivElement = win.HTMLDivElement;
(globalThis as any).HTMLCanvasElement = win.HTMLCanvasElement;
(globalThis as any).requestAnimationFrame = (cb: any) => setTimeout(cb, 16);
(globalThis as any).cancelAnimationFrame = (id: any) => clearTimeout(id);

const mockCtx = {
  fillStyle: '',
  strokeStyle: '',
  lineWidth: 1,
  fillRect: () => {},
  clearRect: () => {},
  strokeRect: () => {},
  beginPath: () => {},
  closePath: () => {},
  arc: () => {},
  arcTo: () => {},
  stroke: () => {},
  fill: () => {},
  save: () => {},
  restore: () => {},
  scale: () => {},
  rotate: () => {},
  translate: () => {},
  drawImage: () => {},
  measureText: () => ({ width: 0 }),
  fillText: () => {},
  strokeText: () => {},
  getImageData: () => ({ data: [0, 0, 0, 0] }),
  putImageData: () => {},
  createImageData: () => ({ data: [] }),
  setTransform: () => {},
  resetTransform: () => {},
  transform: () => {},
  canvas: { width: 800, height: 600 },
};

(win.HTMLCanvasElement.prototype as any).getContext = () => mockCtx;
(globalThis as any).HTMLCanvasElement.prototype.getContext = () => mockCtx;

const origWinCreateElement = win.document.createElement.bind(win.document);
(win.document as any).createElement = (tagName: string, options?: any) => {
  const el = origWinCreateElement(tagName, options);
  if (tagName.toLowerCase() === 'canvas') {
    (el as any).getContext = () => mockCtx;
  }
  return el;
};

const origDocCreateElement = (globalThis as any).document.createElement.bind((globalThis as any).document);
((globalThis as any).document as any).createElement = (tagName: string, options?: any) => {
  const el = origDocCreateElement(tagName, options);
  if (tagName.toLowerCase() === 'canvas') {
    (el as any).getContext = () => mockCtx;
  }
  return el;
};

// Mock Phaser.Game for headless testing environment
import Phaser from 'phaser';
(Phaser as any).Game = class MockGame {
  events = {
    once: (event: string, fn: Function) => { fn(); },
    on: () => {},
    off: () => {},
    emit: () => {},
  };
  scale = {
    resize: () => {},
  };
  scene = {
    getScene: () => ({
      events: {
        once: (event: string, fn: Function) => { fn(); },
        on: () => {},
        off: () => {},
      },
      scene: { restart: () => {} },
      applySettings: () => {},
      resizeLayout: () => {},
      startNewGame: () => {},
    }),
  };
  destroy() {}
};

// Spy on soundManager.stopAll
import { soundManager } from '../src/game/systems/SoundManager';
import { match3Sounds } from '../src/games/match-3/match3Sounds';
import { memorySounds } from '../src/games/memory-match/memorySounds';

let soundManagerStopAllCalls = 0;
let match3StopAllCalls = 0;
let memorySoundsStopAllCalls = 0;

const origSoundManagerStopAll = soundManager.stopAll.bind(soundManager);
soundManager.stopAll = () => {
  soundManagerStopAllCalls++;
  return origSoundManagerStopAll();
};

const origMatch3StopAll = match3Sounds.stopAll.bind(match3Sounds);
match3Sounds.stopAll = () => {
  match3StopAllCalls++;
  return origMatch3StopAll();
};

const origMemoryStopAll = memorySounds.stopAll.bind(memorySounds);
memorySounds.stopAll = () => {
  memorySoundsStopAllCalls++;
  return origMemoryStopAll();
};

// Mock global fetch
let mockApiResponse: any = null;
let mockApiDelayMs = 20;

globalThis.fetch = async (url: any) => {
  await new Promise((r) => setTimeout(r, mockApiDelayMs));
  return {
    ok: true,
    json: async () => mockApiResponse,
  } as any;
};

// Import component under test
import { AuthProvider } from '../src/context/AuthContext';
import { EventPreviewGameView } from '../src/components/events/EventPreviewGameView';

console.log('======================================================');
console.log('RUNNING EVENT PREVIEW REACT HOOK ORDER & AUDIO TESTS');
console.log('======================================================');

async function runTests() {
  const container = win.document.createElement('div');
  win.document.body.appendChild(container);
  const root = createRoot(container as any);

  try {
    // 1. Test transition from loading to loaded without React Hook Order violation
    console.log('Test 1: Transition from loading to loaded state...');
    soundManagerStopAllCalls = 0;
    match3StopAllCalls = 0;
    memorySoundsStopAllCalls = 0;

    mockApiResponse = {
      event: {
        id: 'a18973ee-cde8-4a55-969f-2994a9d4de16',
        name: 'Tech Day 2026',
        status: 'scheduled',
        event_status: 'SCHEDULED',
        payment_status: 'PAID',
        start_date: '2026-11-01',
        end_date: '2026-11-02',
        public_token: 'tok-techday-2026',
        game: {
          id: 'game-cb-1',
          name: 'Catch The Brand',
          slug: 'catch-brand',
          game_type: 'catch-brand',
        },
        game_theme: {
          id: 'theme-cb-1',
          name: 'Carnival',
        },
      },
    };

    // Render initial loading state
    await act(async () => {
      root.render(
        <AuthProvider>
          <EventPreviewGameView eventId="a18973ee-cde8-4a55-969f-2994a9d4de16" />
        </AuthProvider>
      );
    });

    // Check loading indicator rendered
    assert(
      container.innerHTML.includes('Event ID:') || container.innerHTML.includes('animate-spin'),
      'Should display loading state on initial render'
    );
    console.log('✓ PASS: Initial loading state rendered cleanly without errors');

    // Wait for mock fetch to complete and transition to loaded state
    await act(async () => {
      await new Promise((r) => setTimeout(r, 60));
    });

    // Verify loaded content rendered without React Hook mismatch crash
    assert(
      container.innerHTML.includes('preview-testing-overlay') ||
      container.innerHTML.includes('preview-shell') ||
      container.innerHTML.includes('Tech Day 2026'),
      'Loaded preview state should render successfully after loading'
    );
    console.log('✓ PASS: Component transitioned from loading to loaded with zero hook order violations');

    // 2. Test unmount audio cleanup
    console.log('Test 2: Audio cleanup on unmount for Catch The Brand...');
    await act(async () => {
      root.unmount();
    });

    assert.strictEqual(
      soundManagerStopAllCalls > 0,
      true,
      `soundManager.stopAll should have been called on unmount. Calls: ${soundManagerStopAllCalls}`
    );
    assert.strictEqual(
      match3StopAllCalls,
      0,
      `match3Sounds.stopAll should NOT have been called when unmounting Catch The Brand. Calls: ${match3StopAllCalls}`
    );
    assert.strictEqual(
      memorySoundsStopAllCalls,
      0,
      `memorySounds.stopAll should NOT have been called when unmounting Catch The Brand. Calls: ${memorySoundsStopAllCalls}`
    );
    console.log('✓ PASS: Audio cleanup cleanly invoked for specific game engine (soundManager) on unmount');

    // 3. Test unmount during loading state does not stop other games
    console.log('Test 3: Unmount during loading state does not trigger unwanted audio stops...');
    soundManagerStopAllCalls = 0;
    match3StopAllCalls = 0;
    memorySoundsStopAllCalls = 0;

    const container2 = win.document.createElement('div');
    win.document.body.appendChild(container2);
    const root2 = createRoot(container2 as any);

    // Set delay longer than unmount
    mockApiDelayMs = 5000;
    await act(async () => {
      root2.render(
        <AuthProvider>
          <EventPreviewGameView eventId="a18973ee-cde8-4a55-969f-2994a9d4de16" />
        </AuthProvider>
      );
    });

    // Immediately unmount while still loading
    await act(async () => {
      root2.unmount();
    });

    assert.strictEqual(
      soundManagerStopAllCalls,
      0,
      `soundManager.stopAll should NOT be called when unmounting before event loads. Calls: ${soundManagerStopAllCalls}`
    );
    assert.strictEqual(
      match3StopAllCalls,
      0,
      `match3Sounds.stopAll should NOT be called when unmounting before event loads. Calls: ${match3StopAllCalls}`
    );
    console.log('✓ PASS: Unmounting during loading state does not touch audio or stop unrelated games');

    // 4. Test Match-3 event preview audio cleanup on unmount
    console.log('Test 4: Match-3 event preview audio cleanup on unmount...');
    soundManagerStopAllCalls = 0;
    match3StopAllCalls = 0;
    memorySoundsStopAllCalls = 0;

    mockApiResponse = {
      event: {
        id: 'a18973ee-cde8-4a55-969f-2994a9d4de16',
        name: 'Match 3 Spectacular',
        status: 'scheduled',
        event_status: 'SCHEDULED',
        payment_status: 'PAID',
        start_date: '2026-11-01',
        end_date: '2026-11-02',
        public_token: 'tok-match3-2026',
        game: {
          id: 'game-m3-1',
          name: 'Match 3',
          slug: 'match-3',
          game_type: 'match-3',
        },
        game_theme: {
          id: 'theme-m3-1',
          name: 'Default Match 3',
          game_type: 'match-3',
        },
      },
    };

    mockApiDelayMs = 20;
    const container3 = win.document.createElement('div');
    win.document.body.appendChild(container3);
    const root3 = createRoot(container3 as any);

    await act(async () => {
      root3.render(
        <AuthProvider>
          <EventPreviewGameView eventId="a18973ee-cde8-4a55-969f-2994a9d4de16" />
        </AuthProvider>
      );
    });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 60));
    });

    await act(async () => {
      root3.unmount();
    });

    assert.strictEqual(
      match3StopAllCalls > 0,
      true,
      `match3Sounds.stopAll should have been called on unmount for Match-3 event. Calls: ${match3StopAllCalls}`
    );
    assert.strictEqual(
      soundManagerStopAllCalls,
      0,
      `soundManager.stopAll should NOT have been called on unmount for Match-3 event. Calls: ${soundManagerStopAllCalls}`
    );
    console.log('✓ PASS: Audio cleanup cleanly invoked match3Sounds.stopAll for match-3 event');

    console.log('======================================================');
    console.log('ALL EVENT PREVIEW HOOK ORDER & AUDIO TESTS PASSED!');
    console.log('======================================================');
    process.exit(0);
  } catch (err) {
    console.error('❌ Test failed with error:', err);
    process.exit(1);
  }
}

runTests();
