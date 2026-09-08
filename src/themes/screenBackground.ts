import React from 'react';
import {
  GameTheme,
  MemoryMatchStartScreenConfig,
  MemoryMatchResultScreenConfig,
  ScreenBackgroundType,
} from './types';

export interface ResolvedScreenBackground {
  backgroundType: ScreenBackgroundType;
  backgroundColor: string;
  backgroundImageUrl: string | null;
  backgroundOverlayOpacity: number;
  containerStyle: React.CSSProperties;
  overlayStyle: React.CSSProperties;
  hasImage: boolean;
}

/**
 * Reusable Screen Background Resolver for Game Screens (Start Screen & Result Screen)
 * Guarantees consistent background resolution across live game, simulation preview, and studio customizers.
 */
export function resolveScreenBackground(
  screenConfig: MemoryMatchStartScreenConfig | MemoryMatchResultScreenConfig | {
    backgroundType?: ScreenBackgroundType;
    backgroundColor?: string;
    backgroundImageUrl?: string | null;
    backgroundOverlayOpacity?: number;
    background?: {
      type?: ScreenBackgroundType;
      color?: string;
      imageUrl?: string | null;
      overlayOpacity?: number;
    };
    [key: string]: any;
  } | undefined,
  activeTheme?: Partial<GameTheme> | null
): ResolvedScreenBackground {
  const bgObj = screenConfig?.background;

  const backgroundType: ScreenBackgroundType =
    bgObj?.type ||
    (screenConfig?.backgroundType === 'color' ||
    screenConfig?.backgroundType === 'image' ||
    screenConfig?.backgroundType === 'theme'
      ? screenConfig.backgroundType
      : 'theme');

  const backgroundColor =
    bgObj?.color ||
    (screenConfig?.backgroundColor && typeof screenConfig.backgroundColor === 'string'
      ? screenConfig.backgroundColor
      : '#0f172a');

  const backgroundOverlayOpacity =
    typeof bgObj?.overlayOpacity === 'number'
      ? Math.max(0, Math.min(1, bgObj.overlayOpacity))
      : typeof screenConfig?.backgroundOverlayOpacity === 'number'
      ? Math.max(0, Math.min(1, screenConfig.backgroundOverlayOpacity))
      : 0.3;

  let backgroundImageUrl: string | null = null;
  let resolvedCssBgImage: string | undefined = undefined;

  if (backgroundType === 'image') {
    const customImg = bgObj?.imageUrl ?? screenConfig?.backgroundImageUrl;
    if (customImg) {
      backgroundImageUrl = customImg;
      resolvedCssBgImage = `url("${customImg}")`;
    }
  } else if (backgroundType === 'theme') {
    const themeBg =
      activeTheme?.background_url ||
      (activeTheme as any)?.backgroundUrl ||
      (activeTheme as any)?.theme_assets?.background ||
      activeTheme?.background;
    if (themeBg) {
      backgroundImageUrl = themeBg;
      resolvedCssBgImage = `url("${themeBg}")`;
    }
  }

  const containerStyle: React.CSSProperties = {
    backgroundColor,
    backgroundImage: resolvedCssBgImage,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat',
  };

  const overlayStyle: React.CSSProperties = {
    backgroundColor: `rgba(0, 0, 0, ${backgroundOverlayOpacity})`,
  };

  return {
    backgroundType,
    backgroundColor,
    backgroundImageUrl,
    backgroundOverlayOpacity,
    containerStyle,
    overlayStyle,
    hasImage: Boolean(resolvedCssBgImage),
  };
}
