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
 * Known themes that have dedicated asset subdirectories under
 * /assets/games/{gameType}/themes/{themeId}/
 * Any other theme ID falls back to 'default'.
 */
const KNOWN_THEME_FOLDERS: Record<string, Set<string>> = {
  'catch-brand': new Set(['default']),
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
  if (!theme) return 'default';
  const rawId = (theme.base_theme_id || theme.slug || theme.id || 'default').toLowerCase().trim();
  // Strip custom organization prefixes if any
  if (rawId.startsWith('theme-') || rawId.includes('custom')) {
    return 'default';
  }
  return rawId;
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

  const reqTheme = (themeId || 'default').toLowerCase().trim();
  const knownThemes = KNOWN_THEME_FOLDERS[normGame];
  const effectiveThemeId = knownThemes && knownThemes.has(reqTheme) ? reqTheme : 'default';

  return `/assets/games/${normGame}/themes/${effectiveThemeId}/${filename}`;
}

/**
 * Resolves default background image for a given theme.
 * Respects explicit theme background_url first.
 * If empty/missing, resolves game-specific default background.
 */
export function resolveThemeDefaultBgImage(theme?: Partial<GameTheme> | any, fallbackGameType?: string): string {
  if (theme?.background_url && typeof theme.background_url === 'string' && theme.background_url.trim() !== '') {
    const trimmed = theme.background_url.trim();
    // Do not return placeholder token names as paths
    if (!trimmed.startsWith('theme_')) {
      return trimmed;
    }
  }

  const gameType = getThemeGameType(theme, fallbackGameType);
  const themeId = getAssetThemeId(theme);

  return resolveGameAsset({ gameType, themeId, assetType: 'background' }) ||
    `/assets/games/${gameType}/themes/default/background.png`;
}

/**
 * Resolves default catcher / basket image for a theme.
 * STRICT: Only valid for 'catch-brand'. Returns empty string for Memory Match and Reaction Tap.
 */
export function resolveThemeDefaultBasketImage(theme?: Partial<GameTheme> | any, fallbackGameType?: string): string {
  const gameType = getThemeGameType(theme, fallbackGameType);
  if (gameType !== 'catch-brand') {
    return '';
  }

  if (theme?.basket_config?.imageUrl && typeof theme.basket_config.imageUrl === 'string' && theme.basket_config.imageUrl.trim() !== '') {
    return theme.basket_config.imageUrl.trim();
  }

  const themeId = getAssetThemeId(theme);
  return resolveGameAsset({ gameType, themeId, assetType: 'catcher' }) ||
    '/assets/games/catch-brand/themes/default/basket.png';
}

/**
 * Resolves default drop item image for a theme.
 * STRICT: Only valid for 'catch-brand'. Returns empty string for Memory Match and Reaction Tap.
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

  if (item?.imageUrl && typeof item.imageUrl === 'string' && item.imageUrl.trim() !== '') {
    return item.imageUrl.trim();
  }

  const themeId = getAssetThemeId(theme);

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
