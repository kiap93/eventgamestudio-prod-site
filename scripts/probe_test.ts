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

  const buttons = Array.from(container.querySelectorAll('button'));
  const startBtn = buttons.find((b) => b.textContent?.includes('START') || b.textContent?.includes('Start') || b.className?.includes('start-btn'));
  console.log('Start button found:', Boolean(startBtn), startBtn?.textContent?.trim());

  if (startBtn) {
    await act(async () => {
      startBtn.click();
    });

    for (let i = 0; i < 5; i++) {
      await act(async () => {
        await new Promise((r) => setTimeout(r, 900));
      });
    }

    console.log('After countdown:');
    console.log('Has SCORE:', container.innerHTML.includes('SCORE'));
    console.log('Has Start Screen:', container.innerHTML.includes('MATCH-3 CASCADE'));

    const fsButtons = Array.from(container.querySelectorAll('button')).filter(
      (b) => b.title?.toLowerCase().includes('fullscreen') || b.querySelector('svg.lucide-maximize2')
    );
    console.log('Fullscreen buttons found:', fsButtons.length);
    const fsBtn = fsButtons[0];
    if (fsBtn) {
      console.log('Clicking Fullscreen button...');
      await act(async () => {
        fsBtn.click();
      });
    }

    console.log('After Fullscreen Entry:');
    console.log('Has SCORE in fullscreen:', container.innerHTML.includes('SCORE'));
    console.log('Has Start Screen in fullscreen:', container.innerHTML.includes('MATCH-3 CASCADE'));

    await act(async () => {
      await (win.document as any).exitFullscreen();
    });

    console.log('After Fullscreen Exit:');
    console.log('Has SCORE after exit:', container.innerHTML.includes('SCORE'));
    console.log('Has Start Screen after exit:', container.innerHTML.includes('MATCH-3 CASCADE'));
  }

  root.unmount();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
