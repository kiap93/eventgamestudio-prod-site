import { GameLayoutConfig, GameLayoutElement } from './types';

export type { GameLayoutConfig, GameLayoutElement };

/**
 * Standard default layout configuration (percentages 0-100 relative to viewport)
 */
export const DEFAULT_GAME_LAYOUT: GameLayoutConfig = {
  clientLogo: {
    visible: true,
    x: 4,
    y: 4,
    width: 14,
  },
  scoreHud: {
    visible: true,
    x: 4,
    y: 15,
    width: 18,
  },
  timer: {
    visible: true,
    x: 78,
    y: 4,
    width: 18,
  },
  gameTitle: {
    visible: true,
    x: 36,
    y: 4,
    width: 28,
  },
  footerSponsor: {
    visible: true,
    x: 32,
    y: 92,
    width: 36,
  },
};

export type LayoutElementKey = 'clientLogo' | 'scoreHud' | 'timer' | 'gameTitle' | 'footerSponsor';

export interface LayoutElementMeta {
  key: LayoutElementKey;
  label: string;
  shortName: string;
  description: string;
  iconName: string;
  defaultWidth: number;
  minWidth: number;
  maxWidth: number;
}

export const LAYOUT_ELEMENTS_META: Record<LayoutElementKey, LayoutElementMeta> = {
  clientLogo: {
    key: 'clientLogo',
    label: 'Client Logo',
    shortName: 'Logo',
    description: 'Event or client brand mark in the game viewport',
    iconName: 'Image',
    defaultWidth: 14,
    minWidth: 6,
    maxWidth: 40,
  },
  scoreHud: {
    key: 'scoreHud',
    label: 'Score HUD',
    shortName: 'Score',
    description: 'Current player score and point tally display',
    iconName: 'Trophy',
    defaultWidth: 18,
    minWidth: 10,
    maxWidth: 35,
  },
  timer: {
    key: 'timer',
    label: 'Timer',
    shortName: 'Time',
    description: 'Countdown time remaining in seconds',
    iconName: 'Timer',
    defaultWidth: 18,
    minWidth: 10,
    maxWidth: 35,
  },
  gameTitle: {
    key: 'gameTitle',
    label: 'Game Title',
    shortName: 'Title',
    description: 'Campaign game title heading badge',
    iconName: 'Type',
    defaultWidth: 28,
    minWidth: 14,
    maxWidth: 60,
  },
  footerSponsor: {
    key: 'footerSponsor',
    label: 'Footer / Sponsor',
    shortName: 'Footer',
    description: 'Promotional tagline, sponsor acknowledgment, or event disclaimer',
    iconName: 'Megaphone',
    defaultWidth: 36,
    minWidth: 15,
    maxWidth: 80,
  },
};

export const LAYOUT_ELEMENT_KEYS: LayoutElementKey[] = [
  'clientLogo',
  'scoreHud',
  'timer',
  'gameTitle',
  'footerSponsor',
];

/**
 * Normalizes a raw layout object (or undefined) into a full, valid GameLayoutConfig
 */
export function normalizeGameLayout(raw: any): GameLayoutConfig {
  if (!raw || typeof raw !== 'object') {
    return JSON.parse(JSON.stringify(DEFAULT_GAME_LAYOUT));
  }

  const normalizeElement = (key: LayoutElementKey, defaultEl: GameLayoutElement): GameLayoutElement => {
    const el = raw[key];
    if (!el || typeof el !== 'object') {
      return { ...defaultEl };
    }

    const visible = el.visible !== undefined ? !!el.visible : defaultEl.visible;
    const x = typeof el.x === 'number' && !isNaN(el.x) ? Math.max(0, Math.min(100, el.x)) : defaultEl.x;
    const y = typeof el.y === 'number' && !isNaN(el.y) ? Math.max(0, Math.min(100, el.y)) : defaultEl.y;
    const width =
      typeof el.width === 'number' && !isNaN(el.width)
        ? Math.max(4, Math.min(100, el.width))
        : defaultEl.width;
    const height =
      typeof el.height === 'number' && !isNaN(el.height)
        ? Math.max(2, Math.min(100, el.height))
        : defaultEl.height;

    return {
      visible,
      x,
      y,
      ...(width !== undefined ? { width } : {}),
      ...(height !== undefined ? { height } : {}),
    };
  };

  return {
    clientLogo: normalizeElement('clientLogo', DEFAULT_GAME_LAYOUT.clientLogo),
    scoreHud: normalizeElement('scoreHud', DEFAULT_GAME_LAYOUT.scoreHud),
    timer: normalizeElement('timer', DEFAULT_GAME_LAYOUT.timer),
    gameTitle: normalizeElement('gameTitle', DEFAULT_GAME_LAYOUT.gameTitle),
    footerSponsor: normalizeElement('footerSponsor', DEFAULT_GAME_LAYOUT.footerSponsor),
  };
}

export type QuickPositionAnchor =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'center-left'
  | 'center'
  | 'center-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right';

/**
 * Calculates percentage X & Y for quick 9-point placement grid
 */
export function getQuickPositionCoords(
  anchor: QuickPositionAnchor,
  elementWidth: number = 20,
  estimatedHeight: number = 8
): { x: number; y: number } {
  const pad = 4; // 4% padding from edge

  switch (anchor) {
    case 'top-left':
      return { x: pad, y: pad };
    case 'top-center':
      return { x: Math.max(0, (100 - elementWidth) / 2), y: pad };
    case 'top-right':
      return { x: Math.max(0, 100 - elementWidth - pad), y: pad };
    case 'center-left':
      return { x: pad, y: Math.max(0, (100 - estimatedHeight) / 2) };
    case 'center':
      return {
        x: Math.max(0, (100 - elementWidth) / 2),
        y: Math.max(0, (100 - estimatedHeight) / 2),
      };
    case 'center-right':
      return {
        x: Math.max(0, 100 - elementWidth - pad),
        y: Math.max(0, (100 - estimatedHeight) / 2),
      };
    case 'bottom-left':
      return { x: pad, y: Math.max(0, 100 - estimatedHeight - pad) };
    case 'bottom-center':
      return {
        x: Math.max(0, (100 - elementWidth) / 2),
        y: Math.max(0, 100 - estimatedHeight - pad),
      };
    case 'bottom-right':
      return {
        x: Math.max(0, 100 - elementWidth - pad),
        y: Math.max(0, 100 - estimatedHeight - pad),
      };
    default:
      return { x: pad, y: pad };
  }
}
