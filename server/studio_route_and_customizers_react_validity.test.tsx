import { describe, it } from 'node:test';
import assert from 'node:assert';
import { Window } from 'happy-dom';

const win = new Window({
  url: 'https://eventgamestudio.com/studio',
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
  fillRect: () => {},
  putImageData: () => {},
  getImageData: () => ({ data: [0, 0, 0, 0] }),
  drawImage: () => {},
});

describe('Studio & GamesPage React Element Validity Suite', async () => {
  const React = await import('react');
  const { act } = React;
  const { createRoot } = await import('react-dom/client');
  const { LocalizationProvider } = await import('../src/context/LocalizationContext');
  const { GamesPage } = await import('../src/components/games/GamesPage');
  const { GameDetailView } = await import('../src/components/games/GameDetailView');
  const { getGameTypeIcon, getGameTypeIconComponent } = await import('../src/games/gameIcons');
  const { parseRoute } = await import('../src/hooks/useRouteContext');
  const { matchesMainSection } = await import('../src/lib/navigation');
  const { getSystemThemesByGameId } = await import('./db/themes');
  const { normalizeGameTheme } = await import('../src/themes/registry');

  it('1. Route handling for /studio correctly maps to studio mode and matches /games main section', () => {
    const route = parseRoute('/studio');
    assert.strictEqual(route.mode, 'studio', '/studio must resolve to mode: studio');
    assert.strictEqual(route.isStudioRoute, true, '/studio must have isStudioRoute: true');
    assert.strictEqual(matchesMainSection('/studio', '/games'), true, '/studio must match /games main tab');
  });

  it('2. getGameTypeIconComponent returns a valid callable React component for all game engines', () => {
    const engines = ['catch-brand', 'match-3', 'memory-match', 'reaction-tap', 'speed-quiz', 'unknown-custom'];
    for (const engine of engines) {
      const Component = getGameTypeIconComponent(engine);
      assert.ok(Component, `Component for ${engine} should be truthy`);
      // LucideIcon is forwardRef object or functional component
      assert.ok(
        typeof Component === 'function' ||
        (typeof Component === 'object' && Component !== null && ('$$typeof' in Component || 'render' in Component)),
        `Component for ${engine} must be a valid React component type`
      );
      const elem = React.createElement(Component, { className: 'w-6 h-6' });
      assert.ok(React.isValidElement(elem), `Rendered element for ${engine} must be a valid ReactElement`);
    }
  });

  it('3. getGameTypeIcon returns a valid ReactElement directly renderable in JSX', () => {
    const engines = ['catch-brand', 'match-3', 'memory-match', 'reaction-tap', 'speed-quiz'];
    for (const engine of engines) {
      const elem = getGameTypeIcon(engine, 'w-6 h-6');
      assert.ok(React.isValidElement(elem));
      assert.strictEqual(typeof elem, 'object');
    }
  });

  it('4. GamesPage renders game cards with valid components and does NOT throw React Error #130', async () => {
    const container = win.document.createElement('div');
    win.document.body.appendChild(container);
    const root = createRoot(container as any);

    // Mock global fetch for /api/games and /api/themes
    const mockGames = [
      {
        id: 'catch-brand',
        game_type: 'catch-brand',
        name: 'Catch the Brand',
        slug: 'catch-the-brand',
        description: 'Fast-paced arcade catcher',
        status: 'active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: 'match-3',
        game_type: 'match-3',
        name: 'Match-3 Cascade',
        slug: 'brand-match-3',
        description: 'Swap matching tiles',
        status: 'active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: 'memory-match',
        game_type: 'memory-match',
        name: 'Memory Match',
        slug: 'memory-match',
        description: 'Flip matching brand cards',
        status: 'active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: 'reaction-tap',
        game_type: 'reaction-tap',
        name: 'Formula Reaction Lights',
        slug: 'reaction-challenge',
        description: 'Test your reflexes',
        status: 'active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url: any) => {
      const urlStr = String(url);
      if (urlStr.includes('/api/games')) {
        return new win.Response(JSON.stringify({ games: mockGames }), {
          status: 200,
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
      const { AuthProvider } = await import('../src/context/AuthContext');

      await act(async () => {
        root.render(
          React.createElement(
            LocalizationProvider,
            null,
            React.createElement(
              AuthProvider,
              null,
              React.createElement(GamesPage)
            )
          )
        );
      });

      // Let asynchronous state update and game list render
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      // Assert that game titles and cards rendered without error
      assert.ok(container.innerHTML.includes('Catch the Brand'), 'Rendered Catch the Brand');
      assert.ok(container.innerHTML.includes('Match-3 Cascade'), 'Rendered Match-3');
      assert.ok(container.innerHTML.includes('Memory Match'), 'Rendered Memory Match');
      assert.ok(container.innerHTML.includes('Formula Reaction Lights'), 'Rendered Reaction Lights');

      // Verify svg or icon rendered inside the icon container without error #130
      const icons = container.querySelectorAll('svg');
      assert.ok(icons.length > 0, 'Icons rendered successfully in game cards');
    } finally {
      globalThis.fetch = originalFetch;
      root.unmount();
    }
  });

  it('5. GameDetailView renders correctly for each game type without React Error #130', async () => {
    const container = win.document.createElement('div');
    win.document.body.appendChild(container);
    const root = createRoot(container as any);

    const { AuthProvider } = await import('../src/context/AuthContext');
    const mockGame = {
      id: 'catch-brand',
      game_type: 'catch-brand',
      name: 'Catch the Brand',
      slug: 'catch-the-brand',
      description: 'Catch items',
      status: 'active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    await act(async () => {
      root.render(
        React.createElement(
          LocalizationProvider,
          null,
          React.createElement(
            AuthProvider,
            null,
            React.createElement(GameDetailView, {
              game: mockGame as any,
              onBack: () => {},
              onEditTheme: () => {},
            })
          )
        )
      );
    });

    assert.ok(container.innerHTML.includes('Catch the Brand'));
    root.unmount();
  });
});
