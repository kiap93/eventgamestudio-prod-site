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

// Mock Fullscreen API on Element and Document
let currentFullscreenElement: any = null;

(win.Element.prototype as any).requestFullscreen = async function () {
  console.log('[MockFS] requestFullscreen called on tag:', this.tagName, 'class:', this.className?.slice?.(0, 40));
  currentFullscreenElement = this;
  Object.defineProperty(win.document, 'fullscreenElement', {
    value: this,
    configurable: true,
  });
  win.document.dispatchEvent(new win.Event('fullscreenchange'));
};

(win.document as any).exitFullscreen = async function () {
  console.log('[MockFS] exitFullscreen called');
  currentFullscreenElement = null;
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

async function main() {
  const React = await import('react');
  const { act } = React;
  const { createRoot } = await import('react-dom/client');
  const { DeveloperPlayTestModal } = await import('../src/components/developer/DeveloperPlayTestModal');
  const { getSystemThemesByGameId } = await import('../server/db/themes');
  const { getGameById } = await import('../server/db/games');
  const { normalizeGameTheme } = await import('../src/themes/registry');
  const { LocalizationProvider } = await import('../src/context/LocalizationContext');
  const { AuthProvider } = await import('../src/context/AuthContext');

  process.env.NODE_ENV = 'development';

  console.log('=== RUNNING MATCH-3 LIFECYCLE DIAGNOSTIC ===');
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

  console.log('Step 1: Modal mounted. Checking for Start button...');
  // Find Start button
  const buttons = Array.from(container.querySelectorAll('button'));
  console.log('Total buttons found in modal:', buttons.length);
  const startBtn = buttons.find((b) => b.textContent?.includes('START') || b.textContent?.includes('Start') || b.className?.includes('start-btn'));
  console.log('Start button found:', Boolean(startBtn), startBtn?.textContent?.trim());

  if (startBtn) {
    console.log('Step 2: Clicking Start button...');
    await act(async () => {
      startBtn.click();
    });

    console.log('Step 2a: Waiting for countdown timer (3.. 2.. 1.. GO)...');
    // Fast-forward countdown timeouts
    for (let i = 0; i < 5; i++) {
      await act(async () => {
        await new Promise((r) => setTimeout(r, 1000));
      });
    }

    console.log('After countdown, checking DOM content:');
    console.log('Has SCORE:', container.innerHTML.includes('SCORE'));
    console.log('Has Start Screen:', container.innerHTML.includes('MATCH-3 CASCADE'));

    console.log('\n--- Step 3: Triggering Fullscreen Entry ---');
    // Find fullscreen toggle button in modal or HUD
    const fsButtons = Array.from(container.querySelectorAll('button')).filter(
      (b) => b.title?.toLowerCase().includes('fullscreen') || b.querySelector('svg.lucide-maximize2')
    );
    console.log('Fullscreen buttons found:', fsButtons.length);
    const fsBtn = fsButtons[0];
    if (fsBtn) {
      console.log('Clicking Fullscreen button (title:', fsBtn.title, ')...');
      await act(async () => {
        fsBtn.click();
      });
    } else {
      console.log('Simulating direct requestFullscreen...');
      const modal = container.querySelector('.fixed.inset-0') as any;
      await act(async () => {
        await modal.requestFullscreen();
      });
    }

    console.log('\n--- Step 4: Fullscreen entered. Checking DOM state ---');
    console.log('document.fullscreenElement is:', (win.document as any).fullscreenElement?.tagName, (win.document as any).fullscreenElement?.className?.slice?.(0, 40));
    console.log('Has SCORE in fullscreen:', container.innerHTML.includes('SCORE'));
    console.log('Has Start Screen in fullscreen:', container.innerHTML.includes('MATCH-3 CASCADE'));

    console.log('\n--- Step 5: Triggering Fullscreen Exit ---');
    await act(async () => {
      await (win.document as any).exitFullscreen();
    });

    console.log('\n--- Step 6: Fullscreen exited. Checking DOM state ---');
    console.log('document.fullscreenElement is:', (win.document as any).fullscreenElement);
    console.log('Has SCORE after exit:', container.innerHTML.includes('SCORE'));
    console.log('Has Start Screen after exit:', container.innerHTML.includes('MATCH-3 CASCADE'));
  }
}

main().catch(console.error);
