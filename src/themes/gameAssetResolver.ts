/**
 * Event Game Studio — Game Asset Resolver
 *
 * Centralized, game-aware asset resolver establishing strict game-scoped asset boundaries.
 * Canonical hierarchy:
 *   /assets/games/{gameType}/themes/{themeId}/{filename}
 *
 * Fallback priority:
 *   1. Explicit custom asset URL (from theme configuration)
 *   2. Theme-specific game asset (/assets/games/{gameType}/themes/{themeId}/{filename})
 *   3. Game default theme asset (/assets/games/{gameType}/themes/default/{filename})
 *   4. Procedural fallback / empty string where appropriate
 *
 * Invariant:
 *   Assets are game-scoped. A theme NEVER inherits assets from another game type.
 *   Memory Match and Reaction Tap never load Catch the Brand baskets or items.
 */

import { GameTheme } from './types';

export type GameAssetType =
  | 'background'
  | 'catcher'
  | 'goodItem'
  | 'hazardItem'
  | 'bonusItem'
  | 'cardBack'
  | 'pair01'
  | 'pair02'
  | 'pair03'
  | 'pair04'
  | 'pair05'
  | 'pair06'
  | 'pair07'
  | 'pair08';

/**
 * Game-specific asset file contract.
 * Each game explicitly defines which asset types it supports and their standard filenames.
 */
export const GAME_ASSET_MANIFEST: Record<string, Partial<Record<GameAssetType, string>>> = {
  'catch-brand': {
    background: 'background.png',
    catcher: 'basket.png',
    goodItem: 'item_normal_01.png',
    hazardItem: 'item_hazard_01.png',
    bonusItem: 'item_bonus_01.png',
  },
  'memory-match': {
    background: 'background.png',
    cardBack: 'cardback.png',
    pair01: 'pair01.png',
    pair02: 'pair02.png',
    pair03: 'pair03.png',
    pair04: 'pair04.png',
    pair05: 'pair05.png',
    pair06: 'pair06.png',
    pair07: 'pair07.png',
    pair08: 'pair08.png',
  },
  'reaction-tap': {
    background: 'background.png',
  },
  'match-3': {
    background: 'background.png',
  },
  'random-target': {
    background: 'background.png',
    catcher: 'pistol.png',
    goodItem: 'bandit.png',
    hazardItem: 'merchant.png',
  },
};

/**
 * Canonical theme aliases map for Catch The Brand themes.
 * Normalizes legacy slugs and alternative names to URL-safe canonical asset directories.
 */
export const THEME_ASSET_ALIASES: Record<string, string> = {
  'christmas-rush': 'christmas',
  'christmas': 'christmas',
  'cny-fortune': 'cny',
  'cny': 'cny',
  'chinese-new-year': 'cny',
  'lunar-new-year': 'cny',
  'lunar-new-year-fortune': 'cny',
  'carnival': 'carnival',
  'carnival-fiesta': 'carnival',
  'halloween': 'halloween',
  'halloween-spooky': 'halloween',
  'spooky-halloween': 'halloween',
  'mango': 'mango',
  'mango-festival': 'mango',
  'mango-harvest': 'mango',
  'default': 'default',
  'durian': 'default',
  'catch-brand': 'default',
  // Random Target Arcade Themes
  'random-target': 'desert-quick-draw',
  'desert-quick-draw': 'desert-quick-draw',
  'ocean-treasure-hunt': 'ocean-treasure-hunt',
  // Match-3 Classic & Cartoon Themes
  'match-3': 'default',
  'match-3-default': 'default',
  'match-3-cascade': 'default',
  'cute-animals': 'cute-animals',
  'match-3-cute-animals': 'cute-animals',
  'super-heroes': 'super-heroes',
  'match-3-super-heroes': 'super-heroes',
  'fantasy-creatures': 'fantasy-creatures',
  'match-3-fantasy-creatures': 'fantasy-creatures',
  'space-explorers': 'space-explorers',
  'match-3-space-explorers': 'space-explorers',
  'food-characters': 'food-characters',
  'match-3-food-characters': 'food-characters',
  'ocean-friends': 'ocean-friends',
  'match-3-ocean-friends': 'ocean-friends',
  'robot-friends': 'robot-friends',
  'match-3-robot-friends': 'robot-friends',
  'princess-fairytale': 'princess-fairytale',
  'match-3-princess-fairytale': 'princess-fairytale',
};

/**
 * Checks if a string is a standard UUID.
 */
export function isUUID(str: string | null | undefined): boolean {
  if (!str || typeof str !== 'string') return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str.trim());
}

/**
 * Checks if an asset URL points to a deprecated, legacy, or stale path that should not be used.
 */
export function isStaleAssetUrl(url?: string | null): boolean {
  if (!url || typeof url !== 'string') return false;
  const clean = url.trim().toLowerCase();
  return (
    clean === '/assets/background.png' ||
    clean.startsWith('/assets/themes/') ||
    clean.startsWith('assets/themes/') ||
    clean.startsWith('/public/assets/themes/') ||
    clean.startsWith('public/assets/themes/') ||
    clean.startsWith('/assets/game/') ||
    clean.startsWith('assets/game/') ||
    clean.includes('/catch-the-brand/themes/') ||
    clean.startsWith('/assets/christmas_') ||
    clean.startsWith('/assets/cny_') ||
    clean.startsWith('/assets/santa_') ||
    clean.startsWith('/assets/fortune_') ||
    clean.startsWith('/assets/angpow') ||
    clean.startsWith('/assets/firecracker') ||
    clean.startsWith('/assets/gold_ingot') ||
    clean.startsWith('/assets/halloween_') ||
    clean.startsWith('/assets/mango_') ||
    clean.startsWith('/assets/pumpkin_') ||
    clean.startsWith('/assets/fruit_crate') ||
    clean.startsWith('/assets/ripe_mango') ||
    clean.startsWith('/assets/sour_mango') ||
    clean.startsWith('/assets/honey_mango') ||
    clean.startsWith('/assets/spooky_candy') ||
    clean.startsWith('/assets/poison_spider') ||
    clean.startsWith('/assets/golden_skull') ||
    clean.includes('bandit_target_1792994318514') ||
    clean.includes('merchant_target_1792994318429') ||
    clean.includes('western_pistol_1792994340847') ||
    clean.includes('desert_arcade_bg_1792994317277') ||
    clean.endsWith('/desert-quick-draw/target_positive.png') ||
    clean.endsWith('/desert-quick-draw/target_negative.png') ||
    clean.endsWith('/desert-quick-draw/tool_gun.png') ||
    clean.includes('treasure_target_1792994339565') ||
    clean.includes('shark_target_1792994339948') ||
    clean.includes('fishing_rod_1792994341884') ||
    clean.includes('ocean_arcade_bg_1792994317724') ||
    clean.endsWith('/ocean-treasure-hunt/target_positive.png') ||
    clean.endsWith('/ocean-treasure-hunt/target_negative.png') ||
    clean.endsWith('/ocean-treasure-hunt/tool_net.png') ||
    clean.includes('/games/random-target/themes/default/') ||
    clean.includes('lunar new year') ||
    clean.startsWith('theme_')
  );
}

/**
 * Checks if a theme record represents a system-provided template.
 */
export function isSystemTheme(theme?: any): boolean {
  if (!theme) return false;
  if (theme.is_system || theme.is_system_theme || theme.ownership_type === 'system') return true;
  if (!theme.organization_id) {
    const id = String(theme.id || '').toLowerCase();
    const slug = String(theme.slug || '').toLowerCase();
    if (
      id === 'default' || id === 'carnival' || id === 'christmas' || id === 'chinese-new-year' || id === 'cny' || id === 'halloween' || id === 'mango' ||
      id === 'random-target' || id === 'desert-quick-draw' || id === 'ocean-treasure-hunt' ||
      id === 'match-3' || id === 'cute-animals' || id === 'super-heroes' || id === 'fantasy-creatures' || id === 'space-explorers' || id === 'food-characters' || id === 'ocean-friends' || id === 'robot-friends' || id === 'princess-fairytale' ||
      slug === 'default' || slug === 'carnival' || slug === 'christmas-rush' || slug === 'cny-fortune' || slug === 'halloween-spooky' || slug === 'spooky-halloween' || slug === 'mango-festival' || slug === 'mango-harvest' ||
      slug === 'random-target' || slug === 'desert-quick-draw' || slug === 'ocean-treasure-hunt' ||
      slug === 'match-3' || slug === 'cute-animals' || slug === 'super-heroes' || slug === 'fantasy-creatures' || slug === 'space-explorers' || slug === 'food-characters' || slug === 'ocean-friends' || slug === 'robot-friends' || slug === 'princess-fairytale' ||
      slug === 'match-3-cute-animals' || slug === 'match-3-super-heroes' || slug === 'match-3-fantasy-creatures' || slug === 'match-3-space-explorers' || slug === 'match-3-food-characters' || slug === 'match-3-ocean-friends' || slug === 'match-3-robot-friends' || slug === 'match-3-princess-fairytale'
    ) {
      return true;
    }
  }
  return false;
}

const MATCH3_CANONICAL_IDS = [
  'cute-animals',
  'super-heroes',
  'fantasy-creatures',
  'space-explorers',
  'food-characters',
  'ocean-friends',
  'robot-friends',
  'princess-fairytale',
];

function resolveMatch3CanonicalAssetThemeId(str: string): string | null {
  for (const m3Id of MATCH3_CANONICAL_IDS) {
    if (str === m3Id || str === `match-3-${m3Id}` || str.includes(m3Id)) {
      return m3Id;
    }
  }
  if (str.includes('animal')) return 'cute-animals';
  if (str.includes('hero')) return 'super-heroes';
  if (str.includes('creature') || str.includes('dragon') || str.includes('unicorn')) return 'fantasy-creatures';
  if (str.includes('space') || str.includes('astro') || str.includes('rocket')) return 'space-explorers';
  if (str.includes('food') || str.includes('snack') || str.includes('burger')) return 'food-characters';
  if (str.includes('ocean') || str.includes('marine') || str.includes('sea')) return 'ocean-friends';
  if (str.includes('robot') || str.includes('bot')) return 'robot-friends';
  if (str.includes('princess') || str.includes('fairytale')) return 'princess-fairytale';
  return null;
}

/**
 * Single canonical asset theme resolver.
 * Determines the filesystem-safe canonical asset theme directory ID ('default', 'carnival', 'christmas', 'cny', 'halloween', 'mango', etc.).
 * Resolves reliably from metadata, slug, name, or canonical IDs without ever returning a database UUID.
 */
export function getCanonicalAssetThemeId(theme?: Partial<GameTheme> | string | any): string {
  if (!theme) return 'default';

  // If passed as a string
  if (typeof theme === 'string') {
    const clean = theme.trim().toLowerCase();
    if (isUUID(clean)) {
      return 'default';
    }
    if (THEME_ASSET_ALIASES[clean]) {
      return THEME_ASSET_ALIASES[clean];
    }
    if (clean.includes('quick-draw') || clean.includes('desert')) return 'desert-quick-draw';
    if (clean.includes('treasure-hunt')) return 'ocean-treasure-hunt';
    const m3Match = resolveMatch3CanonicalAssetThemeId(clean);
    if (m3Match) return m3Match;

    if (clean.includes('christmas')) return 'christmas';
    if (clean.includes('cny') || clean.includes('chinese-new-year') || clean.includes('lunar')) return 'cny';
    if (clean.includes('carnival')) return 'carnival';
    if (clean.includes('halloween') || clean.includes('spooky')) return 'halloween';
    if (clean.includes('mango')) return 'mango';
    return 'default';
  }

  const gameTypeHint = String(theme.game_type || theme.game_slug || theme.game_id || '').toLowerCase();
  const isRandomTargetThemeObj =
    gameTypeHint.includes('random-target') ||
    Boolean(theme.game_config?.positiveTarget || theme.game_config?.negativeTarget || theme.game_config?.interactionTool);

  // 1. Explicit canonical asset theme metadata if present
  const explicitAssetTheme = (
    theme.asset_theme_id ||
    theme.assetThemeId ||
    theme.canonical_asset_theme_id ||
    theme.canonicalAssetThemeId
  );
  if (explicitAssetTheme && typeof explicitAssetTheme === 'string') {
    const cleanExplicit = explicitAssetTheme.trim().toLowerCase();
    if (!isUUID(cleanExplicit)) {
      if (THEME_ASSET_ALIASES[cleanExplicit]) return THEME_ASSET_ALIASES[cleanExplicit];
      if (cleanExplicit.includes('quick-draw') || cleanExplicit.includes('desert')) return 'desert-quick-draw';
      if (cleanExplicit.includes('treasure-hunt') || (isRandomTargetThemeObj && cleanExplicit.includes('ocean'))) return 'ocean-treasure-hunt';
      const m3Match = resolveMatch3CanonicalAssetThemeId(cleanExplicit);
      if (m3Match) return m3Match;
      if (cleanExplicit === 'christmas' || cleanExplicit === 'cny' || cleanExplicit === 'carnival' || cleanExplicit === 'default' || cleanExplicit === 'halloween' || cleanExplicit === 'mango') {
        return cleanExplicit;
      }
    }
  }

  // 2. Check slug
  const slug = String(theme.slug || '').toLowerCase().trim();
  if (slug) {
    if (THEME_ASSET_ALIASES[slug]) return THEME_ASSET_ALIASES[slug];
    if (slug.includes('quick-draw') || slug.includes('desert')) return 'desert-quick-draw';
    if (slug.includes('treasure-hunt') || (isRandomTargetThemeObj && slug.includes('ocean'))) return 'ocean-treasure-hunt';
    const m3Match = resolveMatch3CanonicalAssetThemeId(slug);
    if (m3Match) return m3Match;
    if (slug.includes('christmas')) return 'christmas';
    if (slug.includes('cny') || slug.includes('chinese-new-year') || slug.includes('lunar')) return 'cny';
    if (slug.includes('carnival')) return 'carnival';
    if (slug.includes('halloween') || slug.includes('spooky')) return 'halloween';
    if (slug.includes('mango')) return 'mango';
  }

  // 3. Check name / title
  const name = String(theme.name || theme.branding?.gameTitle || '').toLowerCase().trim();
  if (name) {
    if (name.includes('quick draw') || name.includes('desert')) return 'desert-quick-draw';
    if (name.includes('treasure hunt') || (isRandomTargetThemeObj && name.includes('ocean'))) return 'ocean-treasure-hunt';
    const m3Match = resolveMatch3CanonicalAssetThemeId(name);
    if (m3Match) return m3Match;
    if (name.includes('christmas')) return 'christmas';
    if (name.includes('lunar') || name.includes('chinese new year') || name.includes('cny') || name.includes('angpow') || name.includes('fortune')) return 'cny';
    if (name.includes('carnival')) return 'carnival';
    if (name.includes('halloween') || name.includes('spooky')) return 'halloween';
    if (name.includes('mango')) return 'mango';
  }

  // 4. Check ID if it is a known canonical theme ID (and NOT a UUID)
  const id = String(theme.id || '').toLowerCase().trim();
  if (id && !isUUID(id)) {
    if (THEME_ASSET_ALIASES[id]) return THEME_ASSET_ALIASES[id];
    if (id.includes('quick-draw') || id.includes('desert')) return 'desert-quick-draw';
    if (id.includes('treasure-hunt') || (isRandomTargetThemeObj && id.includes('ocean'))) return 'ocean-treasure-hunt';
    const m3Match = resolveMatch3CanonicalAssetThemeId(id);
    if (m3Match) return m3Match;
    if (id.includes('christmas')) return 'christmas';
    if (id.includes('chinese-new-year') || id.includes('cny') || id.includes('lunar')) return 'cny';
    if (id.includes('carnival')) return 'carnival';
    if (id.includes('halloween')) return 'halloween';
    if (id.includes('mango')) return 'mango';
  }

  // 5. Check base_theme_id if not a UUID
  const baseId = String(theme.base_theme_id || theme.baseThemeId || '').toLowerCase().trim();
  if (baseId && !isUUID(baseId)) {
    if (THEME_ASSET_ALIASES[baseId]) return THEME_ASSET_ALIASES[baseId];
    if (baseId.includes('quick-draw') || baseId.includes('desert')) return 'desert-quick-draw';
    if (baseId.includes('treasure-hunt') || (isRandomTargetThemeObj && baseId.includes('ocean'))) return 'ocean-treasure-hunt';
    const m3Match = resolveMatch3CanonicalAssetThemeId(baseId);
    if (m3Match) return m3Match;
    if (baseId.includes('christmas')) return 'christmas';
    if (baseId.includes('cny') || baseId.includes('chinese-new-year') || baseId.includes('lunar')) return 'cny';
    if (baseId.includes('carnival')) return 'carnival';
    if (baseId.includes('halloween')) return 'halloween';
    if (baseId.includes('mango')) return 'mango';
  }

  // 6. Game type fallback for random-target
  if (isRandomTargetThemeObj) {
    const gc = theme.game_config || {};
    const themeType = String(gc.themeType || theme.themeType || '').toLowerCase();
    const bgUrl = String(theme.background_url || theme.background || '').toLowerCase();
    const toolType = String(gc.interactionTool?.type || '').toLowerCase();
    const toolId = String(gc.interactionTool?.id || '').toLowerCase();
    const toolImg = String(gc.interactionTool?.imageUrl || '').toLowerCase();
    const posId = String(gc.positiveTarget?.id || '').toLowerCase();
    const posImg = String(gc.positiveTarget?.imageUrl || '').toLowerCase();
    if (
      themeType === 'ocean-treasure-hunt' ||
      bgUrl.includes('/ocean-treasure-hunt/') ||
      toolType === 'fishing-rod' ||
      toolType === 'net' ||
      toolId === 'ocean-fishing-rod' ||
      toolImg.includes('/ocean-treasure-hunt/') ||
      posId === 'ocean-treasure' ||
      posImg.includes('/ocean-treasure-hunt/')
    ) {
      return 'ocean-treasure-hunt';
    }
    return 'desert-quick-draw';
  }

  return 'default';
}

/**
 * Known themes that have dedicated asset subdirectories under
 * /assets/games/{gameType}/themes/{themeId}/
 * Any other theme ID falls back to 'default'.
 */
const KNOWN_THEME_FOLDERS: Record<string, Set<string>> = {
  'catch-brand': new Set([
    'default',
    'carnival',
    'christmas',
    'cny',
    'halloween',
    'mango',
  ]),
  'memory-match': new Set(['default']),
  'reaction-tap': new Set(['default']),
  'random-target': new Set([
    'desert-quick-draw',
    'ocean-treasure-hunt',
  ]),
  'match-3': new Set([
    'default',
    'cute-animals',
    'super-heroes',
    'fantasy-creatures',
    'space-explorers',
    'food-characters',
    'ocean-friends',
    'robot-friends',
    'princess-fairytale',
  ]),
};

/**
 * Canonical game type normalizer.
 * Maps aliases (e.g. 'reaction-time' -> 'reaction-tap', 'catch-the-brand' -> 'catch-brand')
 */
export function normalizeGameType(gameType?: string | null): string {
  if (!gameType) return 'catch-brand';
  const clean = String(gameType).trim().toLowerCase();
  if (
    clean === 'random-target' ||
    clean === 'random_target' ||
    clean === 'random-target-arcade' ||
    clean === 'desert-quick-draw' ||
    clean === 'ocean-treasure-hunt' ||
    clean.includes('random-target')
  ) {
    return 'random-target';
  }
  if (
    clean === 'match-3' ||
    clean === 'match3' ||
    clean === 'match 3' ||
    clean.includes('match-3') ||
    clean.includes('match3') ||
    clean.includes('cascade')
  ) {
    return 'match-3';
  }
  if (clean === 'reaction-time' || clean === 'reaction' || clean === 'reaction_tap') {
    return 'reaction-tap';
  }
  if (clean === 'memory' || clean === 'memory_match' || clean === 'memory-carnival') {
    return 'memory-match';
  }
  if (clean === 'catch' || clean === 'catch_brand' || clean === 'catch-the-brand' || clean === 'durian') {
    return 'catch-brand';
  }
  return clean;
}

/**
 * Extracts game type from a theme object reliably.
 */
function getThemeGameType(theme?: Partial<GameTheme> | any, fallback: string = 'catch-brand'): string {
  if (!theme) return normalizeGameType(fallback);

  if (theme.game_type) return normalizeGameType(theme.game_type);
  if (theme.game_slug) return normalizeGameType(theme.game_slug);
  if (theme.games?.game_type) return normalizeGameType(theme.games.game_type);
  if (theme.games?.slug) return normalizeGameType(theme.games.slug);

  // Check game_config markers
  const gc = theme.game_config as any;
  if (gc && (gc.positiveTarget || gc.negativeTarget || gc.interactionTool)) {
    return 'random-target';
  }
  if (
    gc &&
    (Array.isArray(gc.tileDefinitions) ||
      gc.match3Config ||
      gc.minimumMatch !== undefined ||
      gc.cascadeEnabled !== undefined ||
      gc.specialTilesEnabled !== undefined ||
      gc.tileTypesCount !== undefined ||
      (gc.rows !== undefined && gc.cols !== undefined && (gc.rows >= 3 || gc.cols >= 3)) ||
      gc.scoring?.match3Points !== undefined ||
      gc.screens?.start?.gameType === 'match-3')
  ) {
    return 'match-3';
  }

  // Check ID / slug heuristics
  const id = String(theme.id || theme.base_theme_id || theme.slug || '').toLowerCase();
  const name = String(theme.name || '').toLowerCase();
  if (id.includes('random-target') || id.includes('quick-draw') || id.includes('treasure-hunt') || name.includes('random target') || name.includes('quick draw') || name.includes('treasure hunt')) {
    return 'random-target';
  }
  if (id.includes('match-3') || id.includes('match3') || id.includes('cascade') || name.includes('match-3') || name.includes('match 3') || name.includes('match3')) {
    return 'match-3';
  }
  if (id.includes('memory') || name.includes('memory')) return 'memory-match';
  if (id.includes('reaction') || id.includes('reflex') || name.includes('reaction')) return 'reaction-tap';
  if (id.includes('catch') || id.includes('durian') || id.includes('carnival') || id.includes('cny') || id.includes('christmas') || id.includes('halloween') || id.includes('mango')) {
    return 'catch-brand';
  }

  return normalizeGameType(fallback);
}

/**
 * Extracts theme asset subdirectory ID for resolution.
 */
export function getAssetThemeId(theme?: Partial<GameTheme> | any): string {
  return getCanonicalAssetThemeId(theme);
}

export interface ResolveGameAssetParams {
  gameType?: string | null;
  themeId?: string | null;
  assetType: GameAssetType;
}

const RANDOM_TARGET_THEME_ASSET_MAP: Record<string, Partial<Record<GameAssetType, string>>> = {
  'desert-quick-draw': {
    background: 'background.png',
    catcher: 'pistol.png',
    goodItem: 'bandit.png',
    hazardItem: 'merchant.png',
  },
  'ocean-treasure-hunt': {
    background: 'background.png',
    catcher: 'fishing_rod.png',
    goodItem: 'treasure.png',
    hazardItem: 'shark.png',
  },
};

/**
 * Resolves a game-scoped asset path according to the canonical hierarchy:
 * /assets/games/{gameType}/themes/{themeId}/{filename}
 *
 * If the themeId doesn't have its own folder, falls back to 'default'.
 * Returns null if the requested assetType does not belong to the game's manifest.
 */
export function resolveGameAsset({
  gameType,
  themeId,
  assetType,
}: ResolveGameAssetParams): string | null {
  const normGame = normalizeGameType(gameType);
  const manifest = GAME_ASSET_MANIFEST[normGame];
  if (!manifest) return null;

  const canonicalTheme = getCanonicalAssetThemeId(themeId);
  const knownThemes = KNOWN_THEME_FOLDERS[normGame];
  const fallbackFolder = normGame === 'random-target' ? 'desert-quick-draw' : 'default';
  const effectiveThemeId = knownThemes && knownThemes.has(canonicalTheme) ? canonicalTheme : fallbackFolder;

  const filename =
    normGame === 'random-target'
      ? RANDOM_TARGET_THEME_ASSET_MAP[effectiveThemeId]?.[assetType] || manifest[assetType]
      : manifest[assetType];
  if (!filename) return null;

  return `/assets/games/${normGame}/themes/${effectiveThemeId}/${filename}`;
}

/**
 * High-level theme asset resolver accepting theme or themeId/slug and assetType.
 * Resolves standard asset contract paths (e.g. 'background', 'catcher', 'hazard', 'goodItem', etc.)
 *
 * Examples:
 *   resolveThemeAsset('halloween', 'background') => '/assets/games/catch-brand/themes/halloween/background.png'
 *   resolveThemeAsset('mango', 'hazard') => '/assets/games/catch-brand/themes/mango/item_hazard_01.png'
 */
export function resolveThemeAsset(
  theme?: Partial<GameTheme> | string | any,
  assetType?: GameAssetType | 'hazard' | 'good' | 'bonus' | 'basket' | string,
  fallbackGameType?: string
): string | null {
  const normGame = typeof theme === 'object' && theme ? getThemeGameType(theme, fallbackGameType) : normalizeGameType(fallbackGameType || 'catch-brand');
  const themeId = getCanonicalAssetThemeId(theme);

  let mappedAssetType: GameAssetType = (assetType || 'background') as GameAssetType;
  if (assetType === 'hazard' || assetType === 'bad' || assetType === 'hazardItem') {
    mappedAssetType = 'hazardItem';
  } else if (assetType === 'good' || assetType === 'normal' || assetType === 'goodItem') {
    mappedAssetType = 'goodItem';
  } else if (assetType === 'bonus' || assetType === 'bonusItem') {
    mappedAssetType = 'bonusItem';
  } else if (assetType === 'catcher' || assetType === 'basket') {
    mappedAssetType = 'catcher';
  } else if (assetType === 'background') {
    mappedAssetType = 'background';
  }

  return resolveGameAsset({
    gameType: normGame,
    themeId,
    assetType: mappedAssetType,
  });
}

/**
 * Resolves default background image for a given theme.
 * Respects explicit custom background_url for custom organization themes only.
 * For system themes or when background_url is stale/empty, resolves canonical game asset.
 */
export function resolveThemeDefaultBgImage(theme?: Partial<GameTheme> | any, fallbackGameType?: string): string {
  const gameType = getThemeGameType(theme, fallbackGameType);
  const themeId = getCanonicalAssetThemeId(theme);

  // If theme is NOT a system theme and has an explicit, non-stale custom background_url, preserve it
  if (!isSystemTheme(theme) && theme?.background_url && typeof theme.background_url === 'string') {
    const trimmed = theme.background_url.trim();
    if (trimmed !== '' && !isStaleAssetUrl(trimmed)) {
      return trimmed;
    }
  }

  const fallbackFolder = gameType === 'random-target' ? 'desert-quick-draw' : 'default';
  return resolveGameAsset({ gameType, themeId, assetType: 'background' }) ||
    `/assets/games/${gameType}/themes/${fallbackFolder}/background.png`;
}

/**
 * Resolves default catcher / basket image for a theme.
 * STRICT: Only valid for 'catch-brand'. Returns empty string for Memory Match and Reaction Tap.
 * For system themes or when imageUrl is stale/empty, resolves canonical game asset.
 */
export function resolveThemeDefaultBasketImage(theme?: Partial<GameTheme> | any, fallbackGameType?: string): string {
  const gameType = getThemeGameType(theme, fallbackGameType);
  if (gameType !== 'catch-brand') {
    return '';
  }

  const themeId = getCanonicalAssetThemeId(theme);

  // If theme is NOT a system theme and has an explicit, non-stale custom basket imageUrl, preserve it
  if (!isSystemTheme(theme) && theme?.basket_config?.imageUrl && typeof theme.basket_config.imageUrl === 'string') {
    const trimmed = theme.basket_config.imageUrl.trim();
    if (trimmed !== '' && !isStaleAssetUrl(trimmed)) {
      return trimmed;
    }
  }

  return resolveGameAsset({ gameType, themeId, assetType: 'catcher' }) ||
    '/assets/games/catch-brand/themes/default/basket.png';
}

/**
 * Resolves default drop item image for a theme.
 * STRICT: Only valid for 'catch-brand'. Returns empty string for Memory Match and Reaction Tap.
 * For system themes or when imageUrl is stale/empty, resolves canonical game asset.
 */
export function resolveThemeDefaultItemImage(
  theme?: Partial<GameTheme> | any,
  item?: { id?: string; isHazard?: boolean; isBonus?: boolean; imageUrl?: string | null } | any,
  fallbackGameType?: string
): string {
  const gameType = getThemeGameType(theme, fallbackGameType);
  if (gameType !== 'catch-brand') {
    return '';
  }

  const themeId = getCanonicalAssetThemeId(theme);

  // If theme is NOT a system theme and has an explicit, non-stale custom item imageUrl, preserve it
  if (!isSystemTheme(theme) && item?.imageUrl && typeof item.imageUrl === 'string') {
    const trimmed = item.imageUrl.trim();
    if (trimmed !== '' && !isStaleAssetUrl(trimmed)) {
      return trimmed;
    }
  }

  if (item?.isHazard) {
    return resolveGameAsset({ gameType, themeId, assetType: 'hazardItem' }) ||
      '/assets/games/catch-brand/themes/default/item_hazard_01.png';
  }
  if (item?.isBonus) {
    return resolveGameAsset({ gameType, themeId, assetType: 'bonusItem' }) ||
      '/assets/games/catch-brand/themes/default/item_bonus_01.png';
  }
  return resolveGameAsset({ gameType, themeId, assetType: 'goodItem' }) ||
    '/assets/games/catch-brand/themes/default/item_normal_01.png';
}

/**
 * Resolves card-back image for Memory Match.
 * STRICT: Returns Memory Match card-back asset.
 */
export function resolveMemoryCardBack(theme?: Partial<GameTheme> | any): string {
  const gameConfig = theme?.game_config;
  const customCardBack =
    gameConfig?.cardBackUrl ||
    gameConfig?.card?.cardBackUrl ||
    theme?.visuals_config?.cardBackUrl;

  if (customCardBack && typeof customCardBack === 'string' && customCardBack.trim() !== '') {
    return customCardBack.trim();
  }

  const themeId = getAssetThemeId(theme);
  return resolveGameAsset({ gameType: 'memory-match', themeId, assetType: 'cardBack' }) ||
    '/assets/games/memory-match/themes/default/cardback.png';
}

/**
 * Resolves pair asset for Memory Match (pair01.png - pair08.png).
 * Accepts pair index (0-7) or pair ID/name.
 */
export function resolveMemoryPairAsset(
  pairIndexOrId: number | string,
  theme?: Partial<GameTheme> | any
): string {
  let index = 0;
  if (typeof pairIndexOrId === 'number') {
    index = pairIndexOrId;
  } else if (typeof pairIndexOrId === 'string') {
    const numMatch = pairIndexOrId.match(/\d+/);
    if (numMatch) {
      index = Math.max(0, parseInt(numMatch[0], 10) - 1);
    } else {
      // Hash string to index 0-7
      let hash = 0;
      for (let i = 0; i < pairIndexOrId.length; i++) {
        hash = (hash + pairIndexOrId.charCodeAt(i)) % 8;
      }
      index = hash;
    }
  }

  const normalizedIndex = (Math.abs(index) % 8) + 1;
  const assetKey = `pair0${normalizedIndex}` as GameAssetType;
  const themeId = getAssetThemeId(theme);

  return resolveGameAsset({ gameType: 'memory-match', themeId, assetType: assetKey }) ||
    `/assets/games/memory-match/themes/default/pair0${normalizedIndex}.png`;
}

/**
 * Development-time validation helper to verify expected assets exist in the manifest.
 */
export function validateGameThemeAssets(theme: Partial<GameTheme> | any): {
  valid: boolean;
  gameType: string;
  themeId: string;
  missing: string[];
  found: string[];
  log: string;
} {
  const gameType = getThemeGameType(theme);
  const themeId = getAssetThemeId(theme);
  const manifest = GAME_ASSET_MANIFEST[gameType];

  const found: string[] = [];
  const missing: string[] = [];

  if (!manifest) {
    missing.push(`Game type "${gameType}" not found in GAME_ASSET_MANIFEST`);
    return {
      valid: false,
      gameType,
      themeId,
      missing,
      found,
      log: `[Theme Asset Validation] ✗ Unknown game type "${gameType}"`,
    };
  }

  for (const [assetType, filename] of Object.entries(manifest)) {
    const resolvedPath = resolveGameAsset({
      gameType,
      themeId,
      assetType: assetType as GameAssetType,
    });
    if (resolvedPath) {
      found.push(`${assetType}: ${resolvedPath} (${filename})`);
    } else {
      missing.push(`${assetType}: ${filename}`);
    }
  }

  const logLines = [
    `[Theme Asset Validation]`,
    `Game: ${gameType}`,
    `Theme: ${themeId}`,
    '',
    ...found.map((f) => `✓ ${f}`),
    ...missing.map((m) => `⚠ Missing asset: ${m}`),
  ];

  return {
    valid: missing.length === 0,
    gameType,
    themeId,
    missing,
    found,
    log: logLines.join('\n'),
  };
}
