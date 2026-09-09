import React from 'react';
import {
  LucideIcon,
  ShoppingBasket,
  Zap,
  Grid3X3,
  Gamepad2,
  HelpCircle,
} from 'lucide-react';

/**
 * Canonical game engine types supported across Event Game Studio.
 */
export type CanonicalGameType = 'catch-brand' | 'reaction-tap' | 'memory-match' | 'speed-quiz';

/**
 * Normalizes a game type, slug, or name to its canonical identifier.
 * Returns an empty string if null, undefined, or unrecognized.
 */
export function normalizeGameType(gameType?: string | null): string {
  if (!gameType) return '';
  const normalized = gameType.trim().toLowerCase().replace(/_/g, '-');

  if (
    normalized === 'reaction-tap' ||
    normalized === 'reaction-time' ||
    normalized.includes('reaction') ||
    normalized.includes('reflex')
  ) {
    return 'reaction-tap';
  }

  if (
    normalized === 'memory-match' ||
    normalized.includes('memory') ||
    normalized.includes('match')
  ) {
    return 'memory-match';
  }

  if (
    normalized === 'catch-brand' ||
    normalized.includes('catch') ||
    normalized.includes('catcher') ||
    normalized.includes('basket')
  ) {
    return 'catch-brand';
  }

  if (
    normalized === 'speed-quiz' ||
    normalized.includes('quiz') ||
    normalized.includes('trivia')
  ) {
    return 'speed-quiz';
  }

  return normalized;
}

/**
 * Resolves the appropriate LucideIcon component for a game type or icon name.
 * 
 * Rules:
 * - 'catch-brand' -> ShoppingBasket (Catcher basket)
 * - 'reaction-tap' -> Zap (Reaction speed lightning bolt)
 * - 'memory-match' -> Grid3X3 (Memory grid cards)
 * - 'speed-quiz' -> HelpCircle (Timed trivia quiz)
 * - Unknown / generic -> Gamepad2 (Neutral generic game controller)
 * 
 * NOTE: Catch The Brand / ShoppingBasket is NEVER used as the fallback for unknown games.
 */
export function getGameTypeIconComponent(gameTypeOrIconName?: string | null): LucideIcon {
  if (!gameTypeOrIconName) {
    return Gamepad2;
  }

  const raw = gameTypeOrIconName.trim();
  const canonical = normalizeGameType(raw);

  // 1. Check canonical game types
  if (canonical === 'reaction-tap') {
    return Zap;
  }
  if (canonical === 'memory-match') {
    return Grid3X3;
  }
  if (canonical === 'catch-brand') {
    return ShoppingBasket;
  }
  if (canonical === 'speed-quiz') {
    return HelpCircle;
  }

  // 2. Check direct Lucide icon names if passed (e.g. from database icon_name field)
  const lower = raw.toLowerCase();
  if (lower === 'zap' || lower === 'timer' || lower === 'gauge') {
    return Zap;
  }
  if (lower === 'grid3x3' || lower === 'grid' || lower === 'layers') {
    return Grid3X3;
  }
  if (lower === 'shoppingbasket' || lower === 'basket') {
    return ShoppingBasket;
  }
  if (lower === 'helpcircle' || lower === 'quiz') {
    return HelpCircle;
  }

  // 3. Neutral generic game controller fallback for unknown or new game types
  return Gamepad2;
}

/**
 * Returns the default icon name string stored in database schemas for a game type.
 */
export function getDefaultGameTypeIconName(gameType?: string | null): string {
  const canonical = normalizeGameType(gameType);
  switch (canonical) {
    case 'reaction-tap':
      return 'Zap';
    case 'memory-match':
      return 'Grid3X3';
    case 'catch-brand':
      return 'ShoppingBasket';
    case 'speed-quiz':
      return 'HelpCircle';
    default:
      return 'Gamepad2';
  }
}

/**
 * Convenience helper rendering a sized React JSX icon element for a game type or icon name.
 */
export function getGameTypeIcon(
  gameTypeOrIconName?: string | null,
  className: string = 'w-5 h-5'
): React.ReactElement {
  const IconComponent = getGameTypeIconComponent(gameTypeOrIconName);
  return <IconComponent className={className} />;
}

/**
 * Human-readable formatted display name for a game type.
 */
export function formatGameTypeName(gameType?: string | null): string {
  const canonical = normalizeGameType(gameType);
  switch (canonical) {
    case 'reaction-tap':
      return 'Reaction Tap';
    case 'memory-match':
      return 'Memory Match';
    case 'catch-brand':
      return 'Catch The Brand';
    case 'speed-quiz':
      return 'Speed Quiz';
    default:
      if (!gameType) return 'Custom Game';
      return gameType
        .split(/[-_]/)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' ');
  }
}
