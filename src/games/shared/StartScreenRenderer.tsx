import React from 'react';
import {
  StartScreenConfig,
  StartScreenElement,
  StartScreenGameMeta,
} from './startScreenTypes';
import { resolveScreenBackground } from '../../themes/screenBackground';
import { GameTheme, getThemeGameType } from '../../themes/types';
import { StartElementContent } from './StartElementContent';
import {
  getStartScreenConfig,
  normalizeStartScreenConfigForStage,
  needsStartScreenElementNormalization,
  resolveGameMetaForStartScreen,
} from './startScreenResolver';
import { StartScreenErrorBoundary } from './StartScreenErrorBoundary';

export interface StartScreenRendererProps {
  startConfig?: StartScreenConfig | null;
  config?: StartScreenConfig | null;
  theme?: Partial<GameTheme> | null;
  gameType?: string;
  targetDimensions?: {
    width: number;
    height: number;
  };
  gameMeta?: StartScreenGameMeta;
  onStartGame: () => void;
  onShowLeaderboard?: () => void;
  onShowGuide?: () => void;
  onOpenSettings?: () => void;
  className?: string;
  isSimulation?: boolean;
  isEventPreview?: boolean;
  isEventTest?: boolean;
  suppressBackground?: boolean;
}

const StartScreenContent: React.FC<StartScreenRendererProps> = ({
  startConfig,
  config,
  theme,
  gameType,
  targetDimensions,
  gameMeta,
  onStartGame,
  onShowLeaderboard,
  onShowGuide,
  onOpenSettings,
  className = '',
  isSimulation = false,
  suppressBackground = false,
}) => {
  const targetGameType = gameType || (theme ? getThemeGameType(theme) : 'catch-brand');
  const effectiveMeta = resolveGameMetaForStartScreen(theme, targetGameType, gameMeta);

  // Authoritative config resolution
  const resolvedConfig = getStartScreenConfig(
    theme,
    targetGameType,
    effectiveMeta,
    targetDimensions
  );

  // Merge any caller-provided startConfig (or legacy config prop) if present
  const inputConfig = startConfig || config;
  let mergedConfig: StartScreenConfig = {
    ...resolvedConfig,
    ...(inputConfig || {}),
    canvas: inputConfig?.canvas || resolvedConfig.canvas,
    background: inputConfig?.background || resolvedConfig.background,
    elements: (inputConfig?.elements && inputConfig.elements.length > 0)
      ? inputConfig.elements
      : resolvedConfig.elements,
  };

  // If configuration needs normalization to match targetDimensions, normalize for all games
  const stageTargetW = targetDimensions?.width || 1024;
  const stageTargetH = targetDimensions?.height || 576;
  if (needsStartScreenElementNormalization(mergedConfig, stageTargetW, stageTargetH)) {
    mergedConfig = normalizeStartScreenConfigForStage(
      mergedConfig,
      stageTargetW,
      stageTargetH
    );
  }

  const finalConfig = mergedConfig;
  const bg = resolveScreenBackground(finalConfig as any, theme);
  const canvasWidth =
    Number.isFinite(finalConfig?.canvas?.width) && (finalConfig?.canvas?.width ?? 0) > 0
      ? (finalConfig?.canvas?.width ?? 1024)
      : 1024;
  const canvasHeight =
    Number.isFinite(finalConfig?.canvas?.height) && (finalConfig?.canvas?.height ?? 0) > 0
      ? (finalConfig?.canvas?.height ?? 576)
      : 576;

  const elements: StartScreenElement[] = Array.isArray(finalConfig.elements)
    ? finalConfig.elements
    : [];

  // Recursive element renderer respecting ROOT vs CARD/GROUP coordinates
  const renderElement = (
    el: StartScreenElement,
    parentW: number,
    parentH: number,
    isRoot: boolean = false
  ): React.ReactNode => {
    if (!el || el.visible === false) return null;

    const safeParentW = Number.isFinite(parentW) && parentW > 0 ? parentW : 1000;
    const safeParentH = Number.isFinite(parentH) && parentH > 0 ? parentH : 1000;

    const x = Number.isFinite(el.x) ? el.x : 0;
    const y = Number.isFinite(el.y) ? el.y : 0;
    const w = Number.isFinite(el.width) && el.width > 0 ? el.width : 100;
    const h = Number.isFinite(el.height) && el.height > 0 ? el.height : 40;

    const leftPercent = `${(x / safeParentW) * 100}%`;
    const topPercent = `${(y / safeParentH) * 100}%`;
    const widthPercent = `${(w / safeParentW) * 100}%`;
    const heightPercent = `${(h / safeParentH) * 100}%`;

    const commonStyle: React.CSSProperties = {
      position: 'absolute',
      left: leftPercent,
      top: topPercent,
      width: widthPercent,
      height: heightPercent,
      opacity: Number.isFinite(el.opacity) ? el.opacity : 1,
      zIndex: Number.isFinite(el.zIndex) ? el.zIndex : 1,
      transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
      boxSizing: 'border-box',
    };

    return (
      <div key={el.id} id={el.id} style={commonStyle}>
        <StartElementContent
          element={el}
          parentWidth={safeParentW}
          parentHeight={safeParentH}
          gameMeta={effectiveMeta}
          theme={theme}
          onStartGame={onStartGame}
          onShowLeaderboard={onShowLeaderboard}
          onShowGuide={onShowGuide}
          onOpenSettings={onOpenSettings}
          renderChild={(child, childParentW, childParentH) =>
            renderElement(child, childParentW, childParentH, false)
          }
          isSimulation={isSimulation}
        />
      </div>
    );
  };

  return (
    <div
      className={`absolute inset-0 w-full h-full flex items-center justify-center overflow-hidden select-none z-40 ${className}`}
      style={{
        ...(!suppressBackground ? bg.containerStyle : {}),
        zIndex: 40,
      }}
    >
      {/* Background Overlay */}
      {!suppressBackground && (
        <div className="absolute inset-0 pointer-events-none" style={bg.overlayStyle} />
      )}

      {/* Game Stage Logical Canvas - fills game-ui-layer without competing aspect ratio */}
      <div className="relative w-full h-full overflow-hidden">
        {elements.map((el) => renderElement(el, canvasWidth, canvasHeight, true))}
      </div>
    </div>
  );
};

export const StartScreenRenderer: React.FC<StartScreenRendererProps> = (props) => {
  return (
    <StartScreenErrorBoundary
      gameTitle={props.gameMeta?.gameTitle || props.theme?.name}
      gameSubtitle={props.gameMeta?.gameSubtitle}
      onStartGame={props.onStartGame}
      onShowLeaderboard={props.onShowLeaderboard}
      onShowGuide={props.onShowGuide}
    >
      <StartScreenContent {...props} />
    </StartScreenErrorBoundary>
  );
};
