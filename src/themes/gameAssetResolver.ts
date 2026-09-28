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
    clean.startsWith('/assets/themes/') ||
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
      slug === 'default' || slug === 'carnival' || slug === 'christmas-rush' || slug === 'cny-fortune' || slug === 'halloween-spooky' || slug === 'spooky-halloween' || slug === 'mango-festival' || slug === 'mango-harvest'
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Single canonical asset theme resolver.
 * Determines the filesystem-safe canonical asset theme directory ID ('default', 'carnival', 'christmas', 'cny', 'halloween', 'mango').
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
    if (clean.includes('christmas')) return 'christmas';
    if (clean.includes('cny') || clean.includes('chinese-new-year') || clean.includes('lunar')) return 'cny';
    if (clean.includes('carnival')) return 'carnival';
    if (clean.includes('halloween') || clean.includes('spooky')) return 'halloween';
    if (clean.includes('mango')) return 'mango';
    return 'default';
  }

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
      if (cleanExplicit === 'christmas' || cleanExplicit === 'cny' || cleanExplicit === 'carnival' || cleanExplicit === 'default' || cleanExplicit === 'halloween' || cleanExplicit === 'mango') {
        return cleanExplicit;
      }
    }
  }

  // 2. Check slug
  const slug = String(theme.slug || '').toLowerCase().trim();
  if (slug) {
    if (THEME_ASSET_ALIASES[slug]) return THEME_ASSET_ALIASES[slug];
    if (slug.includes('christmas')) return 'christmas';
    if (slug.includes('cny') || slug.includes('chinese-new-year') || slug.includes('lunar')) return 'cny';
    if (slug.includes('carnival')) return 'carnival';
    if (slug.includes('halloween') || slug.includes('spooky')) return 'halloween';
    if (slug.includes('mango')) return 'mango';
  }

  // 3. Check name / title
  const name = String(theme.name || theme.branding?.gameTitle || '').toLowerCase().trim();
  if (name) {
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
    if (baseId.includes('christmas')) return 'christmas';
    if (baseId.includes('cny') || baseId.includes('chinese-new-year') || baseId.includes('lunar')) return 'cny';
    if (baseId.includes('carnival')) return 'carnival';
    if (baseId.includes('halloween')) return 'halloween';
    if (baseId.includes('mango')) return 'mango';
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
};

/**
 * Canonical game type normalizer.
 * Maps aliases (e.g. 'reaction-time' -> 'reaction-tap', 'catch-the-brand' -> 'catch-brand')
 */
export function normalizeGameType(gameType?: string | null): string {
  if (!gameType) return 'catch-brand';
  const clean = String(gameType).trim().toLowerCase();
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

  // Check ID / slug heuristics
  const id = String(theme.id || theme.base_theme_id || theme.slug || '').toLowerCase();
  if (id.includes('memory')) return 'memory-match';
  if (id.includes('reaction')) return 'reaction-tap';
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

  const filename = manifest[assetType];
  if (!filename) return null;

  const canonicalTheme = getCanonicalAssetThemeId(themeId);
  const knownThemes = KNOWN_THEME_FOLDERS[normGame];
  const effectiveThemeId = knownThemes && knownThemes.has(canonicalTheme) ? canonicalTheme : 'default';

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

  return resolveGameAsset({ gameType, themeId, assetType: 'background' }) ||
    `/assets/games/${gameType}/themes/default/background.png`;
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
