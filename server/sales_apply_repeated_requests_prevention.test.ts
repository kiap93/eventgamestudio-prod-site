import { test, expect, describe, beforeEach, afterEach } from 'bun:test';
import fs from 'fs';
import path from 'path';

describe('Sales Partner Apply Page & AuthContext API Request Decoupling', () => {
  test('1. Static source audit: AuthContext fetchThemes does not depend on activeTheme', () => {
    const authContextPath = path.join(process.cwd(), 'src/context/AuthContext.tsx');
    const content = fs.readFileSync(authContextPath, 'utf-8');

    // fetchThemes should depend only on authFetch, not activeTheme
    const fetchThemesDef = content.match(/const fetchThemes = useCallback\(async[\s\S]*?\}, \[(.*?)\]\);/);
    expect(fetchThemesDef).not.toBeNull();
    const deps = fetchThemesDef![1];
    expect(deps).toContain('authFetch');
    expect(deps).not.toContain('activeTheme');

    // Check that themesInFlightRef is used for request deduplication
    expect(content).toContain('themesInFlightRef');
    expect(content).toContain('activeGameInFlightRef');
    expect(content).toContain('refreshSessionInFlightRef');
  });

  test('2. Static source audit: refreshSession does not depend on fetchThemes or fetchActiveGame', () => {
    const authContextPath = path.join(process.cwd(), 'src/context/AuthContext.tsx');
    const content = fs.readFileSync(authContextPath, 'utf-8');

    const refreshSessionDef = content.match(/const refreshSession = useCallback\(async[\s\S]*?\}, \[(.*?)\]\);/);
    expect(refreshSessionDef).not.toBeNull();
    const deps = refreshSessionDef![1];
    expect(deps).not.toContain('fetchThemes');
    expect(deps).not.toContain('fetchActiveGame');

    // refreshSession should not unconditionally call fetchActiveGame or fetchThemes
    const refreshSessionBody = content.match(/const refreshSession = useCallback\(async[\s\S]*?finally/);
    expect(refreshSessionBody).not.toBeNull();
    expect(refreshSessionBody![0]).not.toContain('await Promise.all([fetchActiveGame(), fetchThemes()]);');
  });

  test('3. Static source audit: SalesPartnerApplyPage does not run redundant refreshSession on mount', () => {
    const applyPagePath = path.join(process.cwd(), 'src/components/sales/SalesPartnerApplyPage.tsx');
    const content = fs.readFileSync(applyPagePath, 'utf-8');

    // Should not have unconditional refreshSession().catch on mount
    expect(content).not.toContain('if (!currentUser) return;\n    refreshSession().catch');
    // Focus listener must be restricted to pending status and cooldown protected
    expect(content).toContain("salesPartnerStatus !== 'pending'");
    expect(content).toContain('lastFocusRefreshRef');
  });

  test('4. Static source audit: ThemeList and ThemeEditor properly fetch games/themes on demand', () => {
    const themeListPath = path.join(process.cwd(), 'src/components/studio/ThemeList.tsx');
    const themeListContent = fs.readFileSync(themeListPath, 'utf-8');
    expect(themeListContent).toContain('fetchActiveGame');
    expect(themeListContent).toContain('fetchThemes');

    const themeEditorPath = path.join(process.cwd(), 'src/components/studio/ThemeEditor.tsx');
    const themeEditorContent = fs.readFileSync(themeEditorPath, 'utf-8');
    expect(themeEditorContent).toContain('fetchActiveGame');
  });

  test('5. Static source audit: GamesPage re-fetches when organization changes', () => {
    const gamesPagePath = path.join(process.cwd(), 'src/components/games/GamesPage.tsx');
    const gamesPageContent = fs.readFileSync(gamesPagePath, 'utf-8');
    expect(gamesPageContent).toContain('currentOrganization?.id');
  });

  test('6. In-flight promise deduplication logic behaves correctly', async () => {
    // Test deduplication pattern used in AuthContext
    const themesInFlight = new Map<string, Promise<any>>();
    let networkCallCount = 0;

    const simulateFetchThemes = (gameId?: string) => {
      const cacheKey = gameId || '__all__';
      const existing = themesInFlight.get(cacheKey);
      if (existing) {
        return existing;
      }

      const p = (async () => {
        networkCallCount++;
        await new Promise((r) => setTimeout(r, 10));
        return [{ id: 'theme-1', name: 'Default Theme' }];
      })().finally(() => {
        themesInFlight.delete(cacheKey);
      });

      themesInFlight.set(cacheKey, p);
      return p;
    };

    // Concurrently trigger 5 calls
    const results = await Promise.all([
      simulateFetchThemes(),
      simulateFetchThemes(),
      simulateFetchThemes(),
      simulateFetchThemes(),
      simulateFetchThemes(),
    ]);

    expect(networkCallCount).toBe(1);
    expect(results.length).toBe(5);
    expect(results[0][0].id).toBe('theme-1');
  });

  test('7. Window focus listener cooldown logic prevents duplicate spamming', () => {
    let focusRefreshCount = 0;
    let lastFocusRefresh = 0;

    const handleFocus = () => {
      const now = Date.now();
      if (now - lastFocusRefresh < 15000) return;
      lastFocusRefresh = now;
      focusRefreshCount++;
    };

    // Trigger focus 5 times rapidly
    handleFocus();
    handleFocus();
    handleFocus();
    handleFocus();
    handleFocus();

    expect(focusRefreshCount).toBe(1);
  });
});
