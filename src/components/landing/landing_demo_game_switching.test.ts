(globalThis as any).window = globalThis;
(globalThis as any).Image = class Image {};
(globalThis as any).HTMLCanvasElement = class HTMLCanvasElement {};
const mockContext = {
  fillStyle: '',
  fillRect: () => {},
  putImageData: () => {},
  getImageData: () => ({ data: [0, 0, 0, 0] }),
};
const mockCanvas = new (globalThis as any).HTMLCanvasElement();
mockCanvas.getContext = () => mockContext;

(globalThis as any).document = {
  createElement: () => mockCanvas,
  documentElement: {},
};

import assert from 'node:assert';

const { THEME_REGISTRY, getDefaultThemeForGameType } = await import('../../themes/registry');
const { getThemeGameType } = await import('../../themes/types');
const {
  getAvailableGameDefinitions,
  getGameDefinition,
  DEFAULT_GAME_TYPE,
} = await import('../../games/registry');
const { normalizeGameType } = await import('../../games/gameIcons');

console.log('======================================================');
console.log('RUNNING INTERACTIVE DEMO GAME SWITCHING TESTS');
console.log('======================================================');

// 1. Authoritative available games from registry
const availableGames = getAvailableGameDefinitions();
assert.ok(availableGames.length >= 3, 'Must have at least 3 active games in registry');

const gameIds = availableGames.map((g) => g.id);
assert.ok(gameIds.includes('catch-brand'), 'Registry must include catch-brand');
assert.ok(gameIds.includes('memory-match'), 'Registry must include memory-match');
assert.ok(gameIds.includes('reaction-tap'), 'Registry must include reaction-tap');
console.log('✓ PASS: getAvailableGameDefinitions returns all active games:', gameIds);

// 2. Normalize game type aliases
assert.strictEqual(normalizeGameType('catch-brand'), 'catch-brand');
assert.strictEqual(normalizeGameType('memory-match'), 'memory-match');
assert.strictEqual(normalizeGameType('reaction-tap'), 'reaction-tap');
assert.strictEqual(normalizeGameType('reaction-time'), 'reaction-tap');
assert.strictEqual(normalizeGameType('formula-reaction'), 'reaction-tap');
console.log('✓ PASS: normalizeGameType maps canonical identifiers and aliases correctly');

// 3. System demo themes deduplication & filtering
const rawCandidateThemes = Object.values(THEME_REGISTRY);
const uniqueThemes = Array.from(
  new Map(rawCandidateThemes.map((theme) => [theme.id, theme])).values()
);

const systemDemoThemes = uniqueThemes.filter((theme) => {
  const isSystemTheme = Boolean(
    theme.is_system_theme === true ||
    theme.is_system === true ||
    theme.ownership_type === 'system' ||
    (!theme.organization_id && (
      theme.id === 'default' ||
      theme.id === 'carnival' ||
      theme.id === 'christmas' ||
      theme.id === 'chinese-new-year' ||
      theme.id === 'halloween' ||
      theme.id === 'mango' ||
      theme.id === 'memory-match' ||
      theme.id === 'memory-carnival' ||
      theme.id === 'reaction-tap' ||
      theme.id === 'reaction-time'
    ))
  );
  if (theme.organization_id) return false;
  return isSystemTheme;
});

// 4. Per-game theme isolation
function getThemesForGame(gameId: string) {
  const canonicalGame = normalizeGameType(gameId);
  return systemDemoThemes.filter((theme) => {
    const themeGameType = normalizeGameType(getThemeGameType(theme));
    return themeGameType === canonicalGame;
  });
}

const catchThemes = getThemesForGame('catch-brand').map((t) => t.id);
assert.deepStrictEqual(
  catchThemes,
  ['default', 'carnival', 'christmas', 'chinese-new-year', 'halloween', 'mango'],
  'Catch the Brand themes must match standard system themes'
);
console.log('✓ PASS: Catch the Brand themes strictly isolated:', catchThemes);

const memoryThemes = getThemesForGame('memory-match').map((t) => t.id);
assert.ok(memoryThemes.includes('memory-match'), 'Memory Match must have memory-match theme');
assert.strictEqual(
  memoryThemes.some((id) => catchThemes.includes(id)),
  false,
  'Memory Match must NEVER include catch-brand themes'
);
console.log('✓ PASS: Memory Match themes strictly isolated:', memoryThemes);

const reactionThemes = getThemesForGame('reaction-tap').map((t) => t.id);
assert.ok(reactionThemes.includes('reaction-tap'), 'Reaction Tap must have reaction-tap theme');
assert.strictEqual(
  reactionThemes.some((id) => catchThemes.includes(id)),
  false,
  'Reaction Tap must NEVER include catch-brand themes'
);
console.log('✓ PASS: Reaction Tap themes strictly isolated:', reactionThemes);

// 5. Theme Fallback on Game Switching
function simulateGameSwitch(
  prevGameId: string,
  prevThemeId: string,
  nextGameId: string
): { nextGameId: string; nextThemeId: string } {
  const newCanonical = normalizeGameType(nextGameId);
  const currentThemeCandidate = THEME_REGISTRY[prevThemeId];
  const isThemeCompatible =
    currentThemeCandidate &&
    normalizeGameType(getThemeGameType(currentThemeCandidate)) === newCanonical;

  let nextThemeId: string;
  if (isThemeCompatible) {
    nextThemeId = prevThemeId;
  } else {
    const fallback = getDefaultThemeForGameType(newCanonical);
    nextThemeId = fallback.id;
  }

  return { nextGameId: newCanonical, nextThemeId };
}

// Switching from Catch the Brand (Mango theme) to Memory Match -> falls back to memory-match
const result1 = simulateGameSwitch('catch-brand', 'mango', 'memory-match');
assert.strictEqual(result1.nextGameId, 'memory-match');
assert.strictEqual(result1.nextThemeId, 'memory-match');
console.log('✓ PASS: Incompatible theme "mango" automatically falls back to "memory-match" on game switch');

// Switching from Memory Match to Reaction Tap -> falls back to reaction-tap
const result2 = simulateGameSwitch('memory-match', 'memory-match', 'reaction-tap');
assert.strictEqual(result2.nextGameId, 'reaction-tap');
assert.strictEqual(result2.nextThemeId, 'reaction-tap');
console.log('✓ PASS: Incompatible theme "memory-match" automatically falls back to "reaction-tap" on game switch');

// Switching from Reaction Tap to Catch the Brand -> falls back to defaultCatchBrandTheme.id ('default')
const result3 = simulateGameSwitch('reaction-tap', 'reaction-tap', 'catch-brand');
assert.strictEqual(result3.nextGameId, 'catch-brand');
assert.strictEqual(result3.nextThemeId, 'default');
console.log('✓ PASS: Incompatible theme "reaction-tap" automatically falls back to "default" for catch-brand');

// 6. Game Definition metadata
const catchDef = getGameDefinition('catch-brand');
assert.strictEqual(catchDef.name, 'Catch the Brand');

const memoryDef = getGameDefinition('memory-match');
assert.strictEqual(memoryDef.name, 'Brand Memory Match');

const reactionDef = getGameDefinition('reaction-tap');
assert.strictEqual(reactionDef.name, 'Formula Reaction Lights');
console.log('✓ PASS: getGameDefinition resolves exact canonical names');

console.log('======================================================');
console.log('ALL INTERACTIVE DEMO GAME SWITCHING TESTS PASSED!');
console.log('======================================================');
