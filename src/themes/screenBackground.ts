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
  screenConfig: MemoryMatchStartScreenConfig | MemoryMatchResultScreenConfig | undefined,
  activeTheme?: Partial<GameTheme> | null
): ResolvedScreenBackground {
  const backgroundType: ScreenBackgroundType =
    screenConfig?.backgroundType === 'color' ||
    screenConfig?.backgroundType === 'image' ||
    screenConfig?.backgroundType === 'theme'
      ? screenConfig.backgroundType
      : 'theme';

  const backgroundColor =
    screenConfig?.backgroundColor && typeof screenConfig.backgroundColor === 'string'
      ? screenConfig.backgroundColor
      : '#0f172a';

  const backgroundOverlayOpacity =
    typeof screenConfig?.backgroundOverlayOpacity === 'number'
      ? Math.max(0, Math.min(1, screenConfig.backgroundOverlayOpacity))
      : 0.3;

  let backgroundImageUrl: string | null = null;
  let resolvedCssBgImage: string | undefined = undefined;

  if (backgroundType === 'image') {
    if (screenConfig?.backgroundImageUrl) {
      backgroundImageUrl = screenConfig.backgroundImageUrl;
      resolvedCssBgImage = `url("${screenConfig.backgroundImageUrl}")`;
    }
  } else if (backgroundType === 'theme') {
    const themeBg = activeTheme?.background_url || activeTheme?.background;
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
