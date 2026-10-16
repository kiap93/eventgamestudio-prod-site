import assert from 'node:assert';
import { Window } from 'happy-dom';

const win = new Window({
  url: 'https://eventgamestudio.com/developer/games/match-3',
  width: 1280,
  height: 800,
});

const mockContext = {
  fillStyle: '',
  fillRect: () => {},
  putImageData: () => {},
  getImageData: () => ({ data: [0, 0, 0, 0] }),
  drawImage: () => {},
};
(win.HTMLCanvasElement.prototype as any).getContext = () => mockContext;

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
(globalThis as any).window = win;
(globalThis as any).document = win.document;
(globalThis as any).navigator = win.navigator;
(globalThis as any).Element = win.Element;
(globalThis as any).HTMLElement = win.HTMLElement;
(globalThis as any).HTMLDivElement = win.HTMLDivElement;
(globalThis as any).HTMLCanvasElement = win.HTMLCanvasElement;
(globalThis as any).HTMLVideoElement = win.HTMLVideoElement;
(globalThis as any).Image = win.Image;
(globalThis as any).requestAnimationFrame = (cb: any) => setTimeout(cb, 16);
(globalThis as any).cancelAnimationFrame = (id: any) => clearTimeout(id);
(globalThis as any).customElements = win.customElements;
(globalThis as any).Event = win.Event;
(globalThis as any).CustomEvent = win.CustomEvent;
(globalThis as any).MouseEvent = win.MouseEvent;
(globalThis as any).KeyboardEvent = win.KeyboardEvent;

// Mock Pointer Capture API
(win.Element.prototype as any).setPointerCapture = function () {};
(win.Element.prototype as any).releasePointerCapture = function () {};

// Mock fetch for auth session
(win as any).fetch = async () => ({
  ok: true,
  status: 200,
  json: async () => ({ user: { is_developer: true }, organization: null }),
  headers: new Headers(),
});
(globalThis as any).fetch = (win as any).fetch;

// Mock Fullscreen API
(win.Element.prototype as any).requestFullscreen = async function () {
  Object.defineProperty(win.document, 'fullscreenElement', {
    value: this,
    configurable: true,
  });
  win.document.dispatchEvent(new win.Event('fullscreenchange'));
};

(win.document as any).exitFullscreen = async function () {
  Object.defineProperty(win.document, 'fullscreenElement', {
    value: null,
    configurable: true,
  });
  win.document.dispatchEvent(new win.Event('fullscreenchange'));
};

Object.defineProperty(win.document, 'fullscreenElement', {
  value: null,
  configurable: true,
});

async function run() {
  const React = await import('react');
  const { act } = React;
  const { createRoot } = await import('react-dom/client');
  const { DeveloperPlayTestModal } = await import('./src/components/developer/DeveloperPlayTestModal');
  const { getSystemThemesByGameId } = await import('./server/db/themes');
  const { getGameById } = await import('./server/db/games');
  const { normalizeGameTheme } = await import('./src/themes/registry');
  const { LocalizationProvider } = await import('./src/context/LocalizationContext');
  const { AuthProvider } = await import('./src/context/AuthContext');

  console.log('=== MATCH-3 FULLSCREEN SYNCHRONIZATION & LIFECYCLE REGRESSION TEST ===\n');

  const m3Game = await getGameById('match-3');
  const m3Themes = await getSystemThemesByGameId('match-3');
  const theme = normalizeGameTheme(m3Themes[0]);

  const container = win.document.createElement('div');
  win.document.body.appendChild(container);
  const root = createRoot(container as any);

  await act(async () => {
    root.render(
      React.createElement(
        LocalizationProvider,
        null,
        React.createElement(
          AuthProvider,
          null,
          React.createElement(DeveloperPlayTestModal, {
            theme,
            gameName: m3Game?.name || 'Match-3',
            gameType: 'match-3',
            game: m3Game,
            onClose: () => {},
          })
        )
      )
    );
  });

  // State inspection helper functions
  const getStartButton = () => {
    const buttons = Array.from(container.querySelectorAll('button'));
    return buttons.find((b) => b.textContent?.includes('START') || b.textContent?.includes('Start'));
  };

  const isStartScreenVisible = () => Boolean(getStartButton());

  const getScoreNumber = (): number => {
    const scoreHeader = Array.from(container.querySelectorAll('span')).find((s) => s.textContent?.trim() === 'SCORE');
    const scoreValEl = scoreHeader?.parentElement?.querySelector('span.text-amber-400');
    if (!scoreValEl || !scoreValEl.textContent) return 0;
    return parseInt(scoreValEl.textContent.replace(/,/g, '').trim(), 10) || 0;
  };

  const getTimeNumber = (): number => {
    const timeHeader = Array.from(container.querySelectorAll('span')).find((s) => s.textContent?.trim() === 'TIME');
    const timeValEl = timeHeader?.parentElement?.querySelector('span:not(.text-slate-400)');
    if (!timeValEl || !timeValEl.textContent) return 0;
    return parseInt(timeValEl.textContent.replace(/[^\d]/g, '').trim(), 10) || 0;
  };

  const getTiles = (): any[] => {
    const grid = container.querySelector('main .grid');
    if (!grid) return [];
    return Array.from(grid.children) as any[];
  };

  const getTileSignatures = (): string[] => {
    return getTiles().map((t) => t.getAttribute('style') || '');
  };

  // 1. Initial State Assertions
  console.log('1. Checking Initial Modal & Start Screen State...');
  const startBtn = getStartButton();
  assert.ok(startBtn, 'Start button must be rendered on initial load');
  assert.strictEqual(isStartScreenVisible(), true, 'Start screen must be visible before starting game');
  console.log('✓ PASS: Modal rendered with Start Screen.');

  // 2. Start Game & Countdown
  console.log('\n2. Starting game and waiting for countdown (3, 2, 1, GO)...');
  await act(async () => {
    startBtn.click();
  });

  // Countdown timer passes (3, 2, 1, 0, playing)
  for (let i = 0; i < 5; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 900));
    });
  }

  // Verify gameplay has begun
  assert.strictEqual(isStartScreenVisible(), false, 'Start screen must not be visible during active gameplay');
  const tiles = getTiles();
  assert.strictEqual(tiles.length, 64, 'Active 8x8 Match-3 grid with 64 tiles must be rendered');
  const initialScore = getScoreNumber();
  const initialTime = getTimeNumber();
  assert.strictEqual(initialScore, 0, 'Initial score must be 0');
  assert.ok(initialTime >= 55 && initialTime <= 60, `Initial timer should be close to 60s, got ${initialTime}s`);

  // Capture mounted DOM element references to verify instance continuity
  const mountedGridEl = container.querySelector('main .grid');
  const mountedMainEl = container.querySelector('main');
  assert.ok(mountedGridEl, 'Mounted grid element must exist');
  assert.ok(mountedMainEl, 'Mounted main element must exist');
  console.log(`✓ PASS: Gameplay active. Grid: 64 tiles, Score: ${initialScore}, Time: ${initialTime}s`);

  // 3. Make an interactive move on the board to advance score
  console.log('\n3. Making an interactive tile swap on the board...');
  let moveSuccess = false;
  let scoreAfterMove = 0;

  // Try adjacent swaps until a valid match resolves
  for (let r = 0; r < 8 && !moveSuccess; r++) {
    for (let c = 0; c < 7 && !moveSuccess; c++) {
      const currentTiles = getTiles();
      const idx1 = r * 8 + c;
      const idx2 = r * 8 + c + 1;
      const t1 = currentTiles[idx1];
      const t2 = currentTiles[idx2];
      if (!t1 || !t2) continue;

      await act(async () => {
        // Dispatch pointerdown and pointerup on tile 1
        const evDown1 = new win.Event('pointerdown', { bubbles: true, cancelable: true });
        Object.assign(evDown1, { pointerId: 1, clientX: 100, clientY: 100 });
        t1.dispatchEvent(evDown1 as any);

        const evUp1 = new win.Event('pointerup', { bubbles: true, cancelable: true });
        Object.assign(evUp1, { pointerId: 1, clientX: 100, clientY: 100 });
        t1.dispatchEvent(evUp1 as any);

        // Dispatch pointerdown and pointerup on adjacent tile 2
        const evDown2 = new win.Event('pointerdown', { bubbles: true, cancelable: true });
        Object.assign(evDown2, { pointerId: 1, clientX: 150, clientY: 100 });
        t2.dispatchEvent(evDown2 as any);

        const evUp2 = new win.Event('pointerup', { bubbles: true, cancelable: true });
        Object.assign(evUp2, { pointerId: 1, clientX: 150, clientY: 100 });
        t2.dispatchEvent(evUp2 as any);
      });

      // Allow swap animation and match cascade to resolve
      await act(async () => {
        await new Promise((r) => setTimeout(r, 600));
      });

      const currentScore = getScoreNumber();
      if (currentScore > 0) {
        moveSuccess = true;
        console.log(`Found valid swap at (${r},${c}) <-> (${r},${c+1}), swap initiated`);
        break;
      }
    }
  }

  assert.ok(moveSuccess, 'A valid swap move must succeed on initial board');

  // Allow all cascade and drop animations to completely settle
  await act(async () => {
    await new Promise((r) => setTimeout(r, 2000));
  });

  scoreAfterMove = getScoreNumber();
  assert.ok(scoreAfterMove > 0, `Score must be > 0 after resolved swap cascade, got ${scoreAfterMove}`);
  const tilesAfterMove = getTileSignatures();
  const timeBeforeFs = getTimeNumber();
  console.log(`✓ PASS: Move and all cascades completed. Score: ${scoreAfterMove}, Time: ${timeBeforeFs}s`);

  // 4. Enter Fullscreen Mode
  console.log('\n4. Triggering Fullscreen Entry...');
  const fsBtn = Array.from(container.querySelectorAll('button')).find(
    (b) => b.title?.toLowerCase().includes('fullscreen')
  );
  assert.ok(fsBtn, 'Fullscreen toggle button must be present in UI');

  await act(async () => {
    fsBtn.click();
  });

  // Let timer and layout tick for 2 seconds while in fullscreen
  await act(async () => {
    await new Promise((r) => setTimeout(r, 2100));
  });

  console.log('Validating state while Fullscreen is active:');
  assert.ok((win.document as any).fullscreenElement, 'Document fullscreenElement must be active');
  assert.strictEqual(container.querySelector('main .grid'), mountedGridEl, 'Match-3 grid DOM instance must remain mounted across fullscreen entry');
  assert.strictEqual(container.querySelector('main'), mountedMainEl, 'Match-3 main DOM instance must remain mounted across fullscreen entry');
  assert.strictEqual(isStartScreenVisible(), false, 'Game must NOT return to Start Screen upon entering fullscreen');
  assert.strictEqual(getTiles().length, 64, 'Active board grid must remain visible in fullscreen');
  assert.strictEqual(getScoreNumber(), scoreAfterMove, `Score must be preserved in fullscreen (expected ${scoreAfterMove}, got ${getScoreNumber()})`);

  const timeInFs = getTimeNumber();
  assert.ok(timeInFs < timeBeforeFs, `Timer must continue progressing during fullscreen (was ${timeBeforeFs}s, now ${timeInFs}s)`);
  assert.ok(timeBeforeFs - timeInFs <= 4, `Timer progress should match elapsed time within tolerance (elapsed ~2s, diff: ${timeBeforeFs - timeInFs}s)`);

  const tilesInFs = getTileSignatures();
  assert.deepStrictEqual(tilesInFs, tilesAfterMove, 'Board tile identities and contents must remain identical in fullscreen');
  console.log(`✓ PASS: Fullscreen entered cleanly. Same session, score ${scoreAfterMove} preserved, timer advanced to ${timeInFs}s.`);

  // 5. Exit Fullscreen Mode
  console.log('\n5. Triggering Fullscreen Exit...');
  const exitFsBtn = Array.from(container.querySelectorAll('button')).find(
    (b) => b.title?.toLowerCase().includes('exit fullscreen')
  );

  await act(async () => {
    if (exitFsBtn) exitFsBtn.click();
    else await (win.document as any).exitFullscreen();
  });

  // Let timer tick for 2 seconds after exiting fullscreen
  await act(async () => {
    await new Promise((r) => setTimeout(r, 2100));
  });

  console.log('Validating state after Fullscreen is exited:');
  assert.strictEqual((win.document as any).fullscreenElement, null, 'Document fullscreenElement must be null after exit');
  assert.strictEqual(container.querySelector('main .grid'), mountedGridEl, 'Match-3 grid DOM instance must remain mounted across fullscreen exit');
  assert.strictEqual(container.querySelector('main'), mountedMainEl, 'Match-3 main DOM instance must remain mounted across fullscreen exit');
  assert.strictEqual(isStartScreenVisible(), false, 'Game must NOT return to Start Screen after exiting fullscreen');
  assert.strictEqual(getTiles().length, 64, 'Active board grid must remain visible after exiting fullscreen');
  assert.strictEqual(getScoreNumber(), scoreAfterMove, `Score must remain preserved after exiting fullscreen (expected ${scoreAfterMove}, got ${getScoreNumber()})`);

  const timeAfterExit = getTimeNumber();
  assert.ok(timeAfterExit < timeInFs, `Timer must continue progressing after exiting fullscreen (was ${timeInFs}s, now ${timeAfterExit}s)`);
  assert.ok(timeInFs - timeAfterExit <= 4, `Timer progress after exit should match elapsed time within tolerance (elapsed ~2s, diff: ${timeInFs - timeAfterExit}s)`);

  const tilesAfterExit = getTileSignatures();
  assert.deepStrictEqual(tilesAfterExit, tilesAfterMove, 'Board tile identities and contents must remain identical after exiting fullscreen');
  console.log(`✓ PASS: Fullscreen exited cleanly. Same session, score ${scoreAfterMove} preserved, timer advanced to ${timeAfterExit}s.`);

  // 5b. Match-3 In-Game HUD Fullscreen Toggle Button Verification
  console.log('\n5b. Testing Match-3 HUD Toolbar Fullscreen Toggle Button...');
  const hudFsBtn = (Array.from(container.querySelectorAll('header button')) as any[]).find(
    (b) => b.title?.toLowerCase().includes('fullscreen')
  );
  assert.ok(hudFsBtn, 'Match-3 HUD toolbar fullscreen button must be present');

  await act(async () => {
    hudFsBtn.click();
  });

  assert.ok((win.document as any).fullscreenElement, 'HUD button must enter fullscreen');
  assert.strictEqual(container.querySelector('main .grid'), mountedGridEl, 'Match-3 grid DOM instance must remain mounted');
  assert.strictEqual(getScoreNumber(), scoreAfterMove, 'Score must remain preserved via HUD toggle');
  assert.strictEqual(getTiles().length, 64, 'Active board must remain visible via HUD toggle');

  const hudExitFsBtn = (Array.from(container.querySelectorAll('header button')) as any[]).find(
    (b) => b.title?.toLowerCase().includes('exit fullscreen')
  );
  assert.ok(hudExitFsBtn, 'Match-3 HUD toolbar exit fullscreen button must be present in fullscreen mode');

  await act(async () => {
    hudExitFsBtn.click();
  });

  assert.strictEqual((win.document as any).fullscreenElement, null, 'HUD button must exit fullscreen');
  assert.strictEqual(container.querySelector('main .grid'), mountedGridEl, 'Match-3 grid DOM instance must remain mounted after HUD exit');
  assert.strictEqual(getScoreNumber(), scoreAfterMove, 'Score must remain preserved after HUD exit');
  assert.strictEqual(getTiles().length, 64, 'Active board must remain visible after HUD exit');
  console.log('✓ PASS: In-Game HUD Fullscreen Toggle Button verified.');

  // 6. Intentional Restart Verification
  console.log('\n6. Testing intentional Restart action...');
  const restartBtn = Array.from(container.querySelectorAll('button')).find(
    (b) => b.title?.toLowerCase().includes('restart') || b.textContent?.toLowerCase().includes('restart')
  );
  assert.ok(restartBtn, 'Restart button must be present in developer test modal');

  await act(async () => {
    restartBtn.click();
  });

  // Allow re-render and remount
  await act(async () => {
    await new Promise((r) => setTimeout(r, 200));
  });

  console.log('Validating state after intentional Restart:');
  assert.notStrictEqual(container.querySelector('main .grid'), mountedGridEl, 'Previous game grid must be unmounted on restart');
  assert.strictEqual(isStartScreenVisible(), true, 'Game MUST return to Start Screen after intentional restart');
  console.log('✓ PASS: Intentional restart properly resets the game session.');

  await act(async () => {
    root.unmount();
  });
  console.log('\n======================================================');
  console.log(' ALL MATCH-3 FULLSCREEN SYNCHRONIZATION ASSERTIONS PASSED!');
  console.log('======================================================\n');
  process.exit(0);
}

run().catch((err) => {
  console.error('\n❌ REGRESSION FAILURE:', err);
  process.exit(1);
});
