import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  StartScreenConfig,
  StartScreenElement,
  StartScreenCardElement,
  StartScreenGroupElement,
  DEFAULT_START_CANVAS_CONFIG,
  generateDefaultStartScreenElements,
} from './startScreenTypes';
import { StartElementContent, StartElementGameMeta } from './StartElementContent';
import { resolveScreenBackground } from '../../themes/screenBackground';
import { GameTheme } from '../../themes/types';
import { EventLeaderboardEntry } from '../../types';

export interface StartScreenRendererProps {
  startConfig?: Partial<StartScreenConfig>;
  theme?: Partial<GameTheme>;
  gameMeta?: StartElementGameMeta;
  gameType?: string;
  onStartGame?: () => void;
  onAction?: (action: string) => void;
  onShowLeaderboard?: () => void;
  onShowGuide?: () => void;
  leaderboardScores?: EventLeaderboardEntry[];
  className?: string;
  isSimulation?: boolean;
  isEventPreview?: boolean;
  isEventTest?: boolean;
}

export const StartScreenRenderer: React.FC<StartScreenRendererProps> = ({
  startConfig,
  theme = {},
  gameMeta,
  gameType = 'memory-match',
  onStartGame,
  onAction,
  onShowLeaderboard,
  onShowGuide,
  leaderboardScores,
  className = '',
  isSimulation = false,
  isEventPreview = false,
  isEventTest = false,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState<number>(1);

  // Logical canvas dimensions
  const canvasWidth = startConfig?.canvas?.width || DEFAULT_START_CANVAS_CONFIG.width;
  const canvasHeight = startConfig?.canvas?.height || DEFAULT_START_CANVAS_CONFIG.height;

  // Background resolution
  const bg = resolveScreenBackground(startConfig, theme);

  // Derive elements with automatic fallback for existing / unconfigured themes
  const elements: StartScreenElement[] =
    startConfig?.elements && startConfig.elements.length > 0
      ? startConfig.elements
      : generateDefaultStartScreenElements(startConfig, theme, gameType);

  // Responsive scale tracking (1000x1000 canvas to container size)
  const updateScale = useCallback(() => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    // Use containment scale
    const scaleX = rect.width / canvasWidth;
    const scaleY = rect.height / canvasHeight;
    const nextScale = Math.min(scaleX, scaleY);
    setScale(nextScale > 0 ? nextScale : 1);
  }, [canvasWidth, canvasHeight]);

  useEffect(() => {
    updateScale();
    if (!containerRef.current) return;

    const ro = new ResizeObserver(() => {
      updateScale();
    });
    ro.observe(containerRef.current);

    window.addEventListener('resize', updateScale);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', updateScale);
    };
  }, [updateScale]);

  // Handle actions dispatched by buttons
  const handleAction = useCallback(
    (action: string) => {
      if (action === 'startGame') {
        if (onStartGame) onStartGame();
      } else if (action === 'viewLeaderboard') {
        if (onShowLeaderboard) onShowLeaderboard();
        else if (onAction) onAction(action);
      } else if (action === 'howToPlay') {
        if (onShowGuide) onShowGuide();
        else if (onAction) onAction(action);
      } else if (onAction) {
        onAction(action);
      }
    },
    [onStartGame, onShowLeaderboard, onShowGuide, onAction]
  );

  // Recursive element renderer
  const renderElement = (
    el: StartScreenElement,
    parentWidth: number,
    parentHeight: number
  ): React.ReactNode => {
    if (el.visible === false) return null;

    const leftPercent = `${(el.x / parentWidth) * 100}%`;
    const topPercent = `${(el.y / parentHeight) * 100}%`;
    const widthPercent = `${(el.width / parentWidth) * 100}%`;
    const heightPercent = `${(el.height / parentHeight) * 100}%`;

    const commonStyle: React.CSSProperties = {
      position: 'absolute',
      left: leftPercent,
      top: topPercent,
      width: widthPercent,
      height: heightPercent,
      opacity: el.opacity ?? 1,
      zIndex: el.zIndex ?? 1,
      transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
      boxSizing: 'border-box',
    };

    return (
      <div key={el.id} id={`start-el-${el.id}`} style={commonStyle}>
        <StartElementContent
          element={el}
          parentWidth={parentWidth}
          parentHeight={parentHeight}
          theme={theme}
          gameMeta={gameMeta}
          gameType={gameType}
          isSimulation={isSimulation}
          isEditor={false}
          onAction={handleAction}
          leaderboardScores={leaderboardScores}
          renderChild={(child, pW, pH) => renderElement(child, pW, pH)}
        />
      </div>
    );
  };

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-full overflow-hidden flex items-center justify-center select-none ${className}`}
      style={bg.containerStyle}
    >
      {/* Background Overlay Layer */}
      <div
        className="absolute inset-0 w-full h-full pointer-events-none"
        style={bg.overlayStyle}
      />

      {/* Logical Canvas (1000x1000 scaled to container) */}
      <div
        style={{
          width: `${canvasWidth}px`,
          height: `${canvasHeight}px`,
          transform: `scale(${scale})`,
          transformOrigin: 'center center',
        }}
        className="relative shrink-0 pointer-events-auto"
      >
        {elements.map((el) => renderElement(el, canvasWidth, canvasHeight))}
      </div>
    </div>
  );
};
