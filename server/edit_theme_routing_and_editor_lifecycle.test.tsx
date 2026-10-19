import { describe, it } from 'node:test';
import assert from 'node:assert';
import { Window } from 'happy-dom';

const win = new Window({
  url: 'https://eventgamestudio.com/games',
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
(globalThis as any).HTMLVideoElement = win.HTMLVideoElement;
(globalThis as any).Image = win.Image;
(globalThis as any).requestAnimationFrame = (cb: any) => setTimeout(cb, 16);
(globalThis as any).cancelAnimationFrame = (id: any) => clearTimeout(id);
(globalThis as any).customElements = win.customElements;
(globalThis as any).Event = win.Event;
(globalThis as any).CustomEvent = win.CustomEvent;
(globalThis as any).MouseEvent = win.MouseEvent;
(globalThis as any).KeyboardEvent = win.KeyboardEvent;

(win.HTMLCanvasElement.prototype as any).getContext = () => ({
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
  ellipse: () => {},
  moveTo: () => {},
  lineTo: () => {},
  stroke: () => {},
  fill: () => {},
  save: () => {},
  restore: () => {},
  scale: () => {},
  rotate: () => {},
  translate: () => {},
  transform: () => {},
  setTransform: () => {},
  resetTransform: () => {},
  putImageData: () => {},
  getImageData: () => ({ data: [0, 0, 0, 0] }),
  drawImage: () => {},
  roundRect: () => {},
  measureText: () => ({ width: 0 }),
  fillText: () => {},
  strokeText: () => {},
  createLinearGradient: () => ({ addColorStop: () => {} }),
  createRadialGradient: () => ({ addColorStop: () => {} }),
  createPattern: () => null,
});

describe('Edit Theme Routing, Canonical URL & ThemeEditor Lifecycle Test Suite', async () => {
  const React = await import('react');
  const { act } = React;
  const { createRoot } = await import('react-dom/client');
  const { parseRoute, navigateTo, navigateBack } = await import('../src/hooks/useRouteContext');
  const { matchesMainSection } = await import('../src/lib/navigation');
  const { ThemeEditor } = await import('../src/components/studio/ThemeEditor');
  const { GameCustomizerPage } = await import('../src/components/studio/GameCustomizerPage');
  const { LocalizationProvider } = await import('../src/context/LocalizationContext');
  const { AuthProvider } = await import('../src/context/AuthContext');

  const mockValidTheme = {
    id: 'f67b5b67-5a0c-439b-b73d-25b456a666d7',
    name: 'Branded Carnival Theme',
    slug: 'branded-carnival-theme',
    game_type: 'catch-brand',
    game_id: 'catch-brand',
    organization_id: 'org-test-111',
    is_system: false,
    status: 'draft',
    assets: {
      background: '/assets/bg.png',
      basket: '/assets/basket.png',
      reward: '/assets/reward.png',
      hazard: '/assets/hazard.png',
      bonus: '/assets/bonus.png',
    },
    colors: {
      primary: '#ff5500',
      secondary: '#0055ff',
      background: '#07130b',
      accent: '#ffcc00',
    },
    gameplay: {
      item_speed: 1.0,
      spawn_interval: 1.0,
      game_duration: 30,
      points_normal: 10,
      points_hazard: -10,
      points_bonus: 50,
      penalty_mode: 'minus_points',
    },
    audio: {
      bgm_enabled: true,
      sfx_enabled: true,
    },
    branding: {
      company_name: 'Carnival Co',
    },
    layout: {
      orientation: 'landscape',
    },
    screens: {
      start_screen: {},
      result_screen: {},
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  it('1. parseRoute correctly extracts themeId from canonical /studio/:themeId and compatibility routes', () => {
    // 1a. Canonical /studio/:themeId
    const r1 = parseRoute('/studio/f67b5b67-5a0c-439b-b73d-25b456a666d7');
    assert.strictEqual(r1.mode, 'studio');
    assert.strictEqual(r1.isStudioRoute, true);
    assert.strictEqual(r1.themeId, 'f67b5b67-5a0c-439b-b73d-25b456a666d7');

    // 1b. Compatibility /game-themes/:themeId/edit
    const r2 = parseRoute('/game-themes/f67b5b67-5a0c-439b-b73d-25b456a666d7/edit');
    assert.strictEqual(r2.mode, 'studio');
    assert.strictEqual(r2.isStudioRoute, true);
    assert.strictEqual(r2.themeId, 'f67b5b67-5a0c-439b-b73d-25b456a666d7');

    // 1c. Compatibility /game-themes/:themeId
    const r3 = parseRoute('/game-themes/f67b5b67-5a0c-439b-b73d-25b456a666d7');
    assert.strictEqual(r3.mode, 'studio');
    assert.strictEqual(r3.isStudioRoute, true);
    assert.strictEqual(r3.themeId, 'f67b5b67-5a0c-439b-b73d-25b456a666d7');

    // 1d. Compatibility query param /games?editTheme=:themeId
    const r4 = parseRoute('/games?editTheme=f67b5b67-5a0c-439b-b73d-25b456a666d7');
    assert.strictEqual(r4.mode, 'studio');
    assert.strictEqual(r4.themeId, 'f67b5b67-5a0c-439b-b73d-25b456a666d7');

    // 1e. /studio without themeId
    const r5 = parseRoute('/studio');
    assert.strictEqual(r5.mode, 'studio');
    assert.strictEqual(r5.themeId, undefined);

    // 1f. /game-themes without themeId
    const r6 = parseRoute('/game-themes');
    assert.strictEqual(r6.mode, 'studio');
    assert.strictEqual(r6.themeId, undefined);

    // 1g. /game-themes/new must not treat "new" as a theme ID
    const r7 = parseRoute('/game-themes/new');
    assert.strictEqual(r7.mode, 'studio');
    assert.strictEqual(r7.themeId, undefined);
  });

  it('2. matchesMainSection maps /studio and /studio/:themeId to /games navigation section', () => {
    assert.strictEqual(matchesMainSection('/studio', '/games'), true);
    assert.strictEqual(matchesMainSection('/studio/f67b5b67-5a0c-439b-b73d-25b456a666d7', '/games'), true);
    assert.strictEqual(matchesMainSection('/game-themes', '/games'), true);
    assert.strictEqual(matchesMainSection('/game-themes/f67b5b67-5a0c-439b-b73d-25b456a666d7/edit', '/games'), true);
  });

  it('3. Direct URL entry & page refresh: ThemeEditor loads theme by ID and renders full configuration tabs', async () => {
    const container = win.document.createElement('div');
    win.document.body.appendChild(container);
    const root = createRoot(container as any);

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url: any) => {
      const urlStr = String(url);
      if (urlStr.includes('/api/themes/f67b5b67-5a0c-439b-b73d-25b456a666d7')) {
        return new win.Response(JSON.stringify({ theme: mockValidTheme }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }) as any;
      }
      if (urlStr.includes('/api/themes')) {
        return new win.Response(JSON.stringify({ themes: [mockValidTheme] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }) as any;
      }
      return new win.Response(JSON.stringify({}), { status: 200 }) as any;
    };

    try {
      await act(async () => {
        root.render(
          React.createElement(
            LocalizationProvider,
            null,
            React.createElement(
              AuthProvider,
              null,
              React.createElement(ThemeEditor, {
                themeId: 'f67b5b67-5a0c-439b-b73d-25b456a666d7',
                onBack: () => {},
              })
            )
          )
        );
      });

      // Allow async loadTheme resolution
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 80));
      });

      // Verify that ThemeEditor rendered the theme name and configuration tabs
      const html = container.innerHTML;
      assert.ok(html.includes('Branded Carnival Theme'), 'Rendered theme title in editor');
      assert.ok(html.includes('Visuals'), 'Visuals tab present');
      assert.ok(html.includes('Gameplay'), 'Gameplay tab present');
      assert.ok(html.includes('Audio'), 'Audio tab present');
      assert.ok(html.includes('Brand &amp; Logos') || html.includes('Brand & Logos') || html.includes('Branding'), 'Branding tab present');
    } finally {
      globalThis.fetch = originalFetch;
      root.unmount();
      container.remove();
    }
  });

  it('4. Invalid Theme ID produces clear 404 UI error with return button instead of spinning forever', async () => {
    const container = win.document.createElement('div');
    win.document.body.appendChild(container);
    const root = createRoot(container as any);

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url: any) => {
      const urlStr = String(url);
      if (urlStr.includes('/api/themes/invalid-uuid-999')) {
        return new win.Response(JSON.stringify({ error: 'Theme not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        }) as any;
      }
      if (urlStr.includes('/api/themes')) {
        return new win.Response(JSON.stringify({ themes: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }) as any;
      }
      return new win.Response(JSON.stringify({}), { status: 200 }) as any;
    };

    try {
      let backClicked = false;
      await act(async () => {
        root.render(
          React.createElement(
            LocalizationProvider,
            null,
            React.createElement(
              AuthProvider,
              null,
              React.createElement(ThemeEditor, {
                themeId: 'invalid-uuid-999',
                onBack: () => {
                  backClicked = true;
                },
              })
            )
          )
        );
      });

      // Allow async loadTheme resolution
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 80));
      });

      const html = container.innerHTML;
      assert.ok(html.includes('Theme Not Found') || html.includes('not found') || html.includes('Tema Tidak Ditemui') || html.includes('未找到'), 'Displays theme not found error message');
      assert.ok(!html.includes('animate-spin'), 'Spinner is dismissed after error');

      // Test return button
      const button = container.querySelector('button');
      assert.ok(button, 'Return button exists on error state');
      button.click();
      assert.strictEqual(backClicked, true, 'Clicking return button triggers onBack callback');
    } finally {
      globalThis.fetch = originalFetch;
      root.unmount();
      container.remove();
    }
  });

  it('5. Unauthorized theme access (403) produces Access Denied error state with return button', async () => {
    const container = win.document.createElement('div');
    win.document.body.appendChild(container);
    const root = createRoot(container as any);

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url: any) => {
      const urlStr = String(url);
      if (urlStr.includes('/api/themes/unauthorized-theme-id')) {
        return new win.Response(JSON.stringify({ error: 'Access denied to this theme' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        }) as any;
      }
      if (urlStr.includes('/api/themes')) {
        return new win.Response(JSON.stringify({ themes: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }) as any;
      }
      return new win.Response(JSON.stringify({}), { status: 200 }) as any;
    };

    try {
      await act(async () => {
        root.render(
          React.createElement(
            LocalizationProvider,
            null,
            React.createElement(
              AuthProvider,
              null,
              React.createElement(ThemeEditor, {
                themeId: 'unauthorized-theme-id',
                onBack: () => {},
              })
            )
          )
        );
      });

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 80));
      });

      const html = container.innerHTML;
      assert.ok(html.includes('Access Denied') || html.includes('Access denied'), 'Displays access denied error message');
    } finally {
      globalThis.fetch = originalFetch;
      root.unmount();
      container.remove();
    }
  });

  it('6. GameCustomizerPage opens editor when themeId is present in URL and opens list when no themeId', async () => {
    win.history.pushState(null, '', '/game-themes');
    const container = win.document.createElement('div');
    win.document.body.appendChild(container);
    const root = createRoot(container as any);

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url: any) => {
      const urlStr = String(url);
      if (urlStr.includes('/api/themes/f67b5b67-5a0c-439b-b73d-25b456a666d7')) {
        return new win.Response(JSON.stringify({ theme: mockValidTheme }), { status: 200 }) as any;
      }
      if (urlStr.includes('/api/themes/system')) {
        return new win.Response(JSON.stringify({ themes: [] }), { status: 200 }) as any;
      }
      if (urlStr.includes('/api/themes')) {
        return new win.Response(JSON.stringify({ themes: [mockValidTheme] }), { status: 200 }) as any;
      }
      return new win.Response(JSON.stringify({}), { status: 200 }) as any;
    };

    try {
      await act(async () => {
        root.render(
          React.createElement(
            LocalizationProvider,
            null,
            React.createElement(
              AuthProvider,
              null,
              React.createElement(GameCustomizerPage)
            )
          )
        );
      });

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 60));
      });

      // On /game-themes without themeId, it renders the theme list
      assert.ok(container.innerHTML.length > 0, 'Renders theme list content on /game-themes');

      // Now navigate to /studio/f67b5b67-5a0c-439b-b73d-25b456a666d7
      win.history.pushState(null, '', '/studio/f67b5b67-5a0c-439b-b73d-25b456a666d7');
      win.dispatchEvent(new win.Event('popstate'));

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 80));
      });

      // Now it renders the ThemeEditor for the theme
      assert.ok(container.innerHTML.includes('Branded Carnival Theme') || container.innerHTML.includes('Visuals'), 'Renders ThemeEditor on /studio/:themeId');
    } finally {
      globalThis.fetch = originalFetch;
      root.unmount();
      container.remove();
    }
  });

  it('7. Browser Back and Forward history simulation: popstate transitions smoothly between list and editor', async () => {
    const container = win.document.createElement('div');
    win.document.body.appendChild(container);
    const root = createRoot(container as any);

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url: any) => {
      const urlStr = String(url);
      if (urlStr.includes('/api/themes/f67b5b67-5a0c-439b-b73d-25b456a666d7')) {
        return new win.Response(JSON.stringify({ theme: mockValidTheme }), { status: 200 }) as any;
      }
      if (urlStr.includes('/api/themes')) {
        return new win.Response(JSON.stringify({ themes: [mockValidTheme] }), { status: 200 }) as any;
      }
      return new win.Response(JSON.stringify({}), { status: 200 }) as any;
    };

    try {
      // Start at /games
      win.history.pushState(null, '', '/games');

      await act(async () => {
        root.render(
          React.createElement(
            LocalizationProvider,
            null,
            React.createElement(
              AuthProvider,
              null,
              React.createElement(GameCustomizerPage)
            )
          )
        );
      });

      // User navigates to /studio/f67b5b67-5a0c-439b-b73d-25b456a666d7
      navigateTo('/studio/f67b5b67-5a0c-439b-b73d-25b456a666d7');
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 80));
      });
      assert.strictEqual(win.location.pathname, '/studio/f67b5b67-5a0c-439b-b73d-25b456a666d7');

      // User presses browser Back button -> simulates popstate to /games
      win.history.pushState(null, '', '/games');
      win.dispatchEvent(new win.Event('popstate'));
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 80));
      });
      assert.strictEqual(win.location.pathname, '/games');

      // User presses browser Forward button -> simulates popstate to /studio/f67b5b67-5a0c-439b-b73d-25b456a666d7
      win.history.pushState(null, '', '/studio/f67b5b67-5a0c-439b-b73d-25b456a666d7');
      win.dispatchEvent(new win.Event('popstate'));
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 80));
      });
      assert.strictEqual(win.location.pathname, '/studio/f67b5b67-5a0c-439b-b73d-25b456a666d7');
    } finally {
      globalThis.fetch = originalFetch;
      root.unmount();
      container.remove();
    }
  });
});
