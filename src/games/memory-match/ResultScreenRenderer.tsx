import React from 'react';
import {
  ResultScreenElement,
  ResultCardElement,
  ResultGroupElement,
  ResultTextElement,
  ResultImageElement,
  ResultScoreElement,
  ResultMovesElement,
  ResultPairsElement,
  ResultTimeElement,
  ResultAccuracyElement,
  ResultButtonElement,
  MemoryMatchResultScreenConfig,
  generateDefaultResultScreenElements,
} from './types';
import { resolveScreenBackground } from '../../themes/screenBackground';
import { GameTheme } from '../../themes/types';
import { Trophy, RotateCcw, Award, RotateCw, Layers, Zap, Clock, Sparkles, LogOut } from 'lucide-react';

export interface ResultScreenStats {
  score: number;
  moves: number;
  matchedPairsCount: number;
  totalPairs: number;
  accuracyPercent: number;
  timeElapsedSeconds?: number;
  isVictory?: boolean;
}

export interface ResultScreenRendererProps {
  resultConfig?: MemoryMatchResultScreenConfig | null;
  stats: ResultScreenStats;
  theme?: Partial<GameTheme> | null;
  onAction?: (action: 'playAgain' | 'exit' | string) => void;
  leaderboardSlot?: React.ReactNode;
  className?: string;
  isSimulation?: boolean;
}

export const ResultScreenRenderer: React.FC<ResultScreenRendererProps> = ({
  resultConfig,
  stats,
  theme,
  onAction,
  leaderboardSlot,
  className = '',
  isSimulation = false,
}) => {
  const bg = resolveScreenBackground(resultConfig, theme);
  const canvasWidth = resultConfig?.canvas?.width || 1000;
  const canvasHeight = resultConfig?.canvas?.height || 1000;

  const elements: ResultScreenElement[] =
    Array.isArray(resultConfig?.elements) && resultConfig.elements.length > 0
      ? resultConfig.elements
      : generateDefaultResultScreenElements(resultConfig || undefined);

  // Recursive element renderer
  const renderElement = (
    el: ResultScreenElement,
    parentWidth: number,
    parentHeight: number,
    isRoot: boolean = false
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

    switch (el.type) {
      case 'card': {
        const cardEl = el as ResultCardElement;
        const style = cardEl.style;
        return (
          <div
            key={cardEl.id}
            id={cardEl.id}
            style={{
              ...commonStyle,
              backgroundColor: style?.backgroundColor || 'rgba(15, 23, 42, 0.95)',
              backgroundImage: style?.backgroundImageUrl
                ? `url(${style.backgroundImageUrl})`
                : undefined,
              backgroundSize: style?.backgroundSize || 'cover',
              backgroundPosition: style?.backgroundPosition || 'center',
              backgroundRepeat: style?.backgroundRepeat || 'no-repeat',
              borderWidth: typeof style?.borderWidth === 'number' ? `${(style.borderWidth / parentWidth) * 100}cqi` : '1px',
              borderStyle: 'solid',
              borderColor: style?.borderColor || '#334155',
              borderRadius: typeof style?.borderRadius === 'number' ? `${(style.borderRadius / parentWidth) * 100}cqi` : '24px',
              boxShadow:
                style?.shadow !== false
                  ? '0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.05)'
                  : undefined,
              backdropFilter: 'blur(12px)',
              overflow: 'hidden',
              containerType: 'inline-size',
            }}
            className="transition-all"
          >
            {/* Card Child Elements */}
            {Array.isArray(cardEl.children) &&
              cardEl.children.map((child) =>
                renderElement(child, cardEl.width, cardEl.height, false)
              )}
          </div>
        );
      }

      case 'group': {
        const groupEl = el as ResultGroupElement;
        return (
          <div key={groupEl.id} id={groupEl.id} style={commonStyle}>
            {Array.isArray(groupEl.children) &&
              groupEl.children.map((child) =>
                renderElement(child, groupEl.width, groupEl.height, false)
              )}
          </div>
        );
      }

      case 'text': {
        const textEl = el as ResultTextElement;
        const textStyle = textEl.style;
        return (
          <div
            key={textEl.id}
            id={textEl.id}
            style={{
              ...commonStyle,
              display: 'flex',
              alignItems: 'center',
              justifyContent:
                textStyle?.textAlign === 'left'
                  ? 'flex-start'
                  : textStyle?.textAlign === 'right'
                  ? 'flex-end'
                  : 'center',
              textAlign: textStyle?.textAlign || 'center',
              color: textStyle?.color || '#ffffff',
              fontFamily: textStyle?.fontFamily || 'inherit',
              fontSize: textStyle?.fontSize ? `clamp(11px, ${textStyle.fontSize * 0.55}cqi, 40px)` : '1.5cqi',
              fontWeight: textStyle?.fontWeight || 'bold',
              lineHeight: textStyle?.lineHeight ?? 1.2,
              letterSpacing: textStyle?.letterSpacing ? `${textStyle.letterSpacing}px` : undefined,
              userSelect: 'none',
            }}
            className="leading-tight truncate"
          >
            <span className="truncate w-full">{textEl.text}</span>
          </div>
        );
      }

      case 'image': {
        const imgEl = el as ResultImageElement;
        return (
          <div
            key={imgEl.id}
            id={imgEl.id}
            style={{
              ...commonStyle,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
            }}
          >
            {imgEl.imageUrl ? (
              <img
                src={imgEl.imageUrl}
                alt=""
                className="w-full h-full pointer-events-none select-none"
                style={{ objectFit: imgEl.objectFit || 'contain' }}
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-slate-800/40 rounded-xl text-slate-500">
                <Award className="w-1/2 h-1/2 opacity-40" />
              </div>
            )}
          </div>
        );
      }

      case 'score': {
        const statEl = el as ResultScoreElement;
        const style = statEl.style;
        return (
          <div
            key={statEl.id}
            id={statEl.id}
            style={{
              ...commonStyle,
              backgroundColor: style?.backgroundColor || 'rgba(2, 6, 23, 0.85)',
              borderColor: style?.borderColor || '#334155',
              borderWidth: '1px',
              borderStyle: 'solid',
              borderRadius: typeof style?.borderRadius === 'number' ? `${(style.borderRadius / parentHeight) * 100}%` : '16px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '4px 8px',
            }}
            className="shadow-inner text-center overflow-hidden"
          >
            {style?.showLabel !== false && (
              <span
                style={{
                  color: style?.labelColor || '#94a3b8',
                  textAlign: style?.textAlign || 'center',
                }}
                className="text-[10px] sm:text-xs font-bold uppercase tracking-wider block truncate w-full"
              >
                {statEl.label || 'SCORE'}
              </span>
            )}
            <span
              style={{
                color: style?.valueColor || '#fbbf24',
                fontSize: style?.fontSize ? `clamp(11px, ${style.fontSize * 0.55}cqi, 48px)` : undefined,
                textAlign: style?.textAlign || 'center',
              }}
              className="text-base sm:text-2xl font-black font-mono block tracking-tight truncate w-full"
            >
              {stats.score.toLocaleString()}
            </span>
          </div>
        );
      }

      case 'moves': {
        const statEl = el as ResultMovesElement;
        const style = statEl.style;
        return (
          <div
            key={statEl.id}
            id={statEl.id}
            style={{
              ...commonStyle,
              backgroundColor: style?.backgroundColor || 'rgba(2, 6, 23, 0.85)',
              borderColor: style?.borderColor || '#334155',
              borderWidth: '1px',
              borderStyle: 'solid',
              borderRadius: typeof style?.borderRadius === 'number' ? `${(style.borderRadius / parentHeight) * 100}%` : '16px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '4px 8px',
            }}
            className="shadow-inner text-center overflow-hidden"
          >
            {style?.showLabel !== false && (
              <span
                style={{
                  color: style?.labelColor || '#94a3b8',
                  textAlign: style?.textAlign || 'center',
                }}
                className="text-[10px] sm:text-xs font-bold uppercase tracking-wider block truncate w-full"
              >
                {statEl.label || 'MOVES'}
              </span>
            )}
            <span
              style={{
                color: style?.valueColor || '#67e8f9',
                fontSize: style?.fontSize ? `clamp(11px, ${style.fontSize * 0.55}cqi, 48px)` : undefined,
                textAlign: style?.textAlign || 'center',
              }}
              className="text-base sm:text-2xl font-black font-mono block tracking-tight truncate w-full"
            >
              {stats.moves}
            </span>
          </div>
        );
      }

      case 'pairs': {
        const statEl = el as ResultPairsElement;
        const style = statEl.style;
        return (
          <div
            key={statEl.id}
            id={statEl.id}
            style={{
              ...commonStyle,
              backgroundColor: style?.backgroundColor || 'rgba(2, 6, 23, 0.85)',
              borderColor: style?.borderColor || '#334155',
              borderWidth: '1px',
              borderStyle: 'solid',
              borderRadius: typeof style?.borderRadius === 'number' ? `${(style.borderRadius / parentHeight) * 100}%` : '16px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '4px 8px',
            }}
            className="shadow-inner text-center overflow-hidden"
          >
            {style?.showLabel !== false && (
              <span
                style={{
                  color: style?.labelColor || '#94a3b8',
                  textAlign: style?.textAlign || 'center',
                }}
                className="text-[10px] sm:text-xs font-bold uppercase tracking-wider block truncate w-full"
              >
                {statEl.label || 'PAIRS'}
              </span>
            )}
            <span
              style={{
                color: style?.valueColor || '#34d399',
                fontSize: style?.fontSize ? `clamp(11px, ${style.fontSize * 0.55}cqi, 48px)` : undefined,
                textAlign: style?.textAlign || 'center',
              }}
              className="text-base sm:text-2xl font-black font-mono block tracking-tight truncate w-full"
            >
              {stats.matchedPairsCount}/{stats.totalPairs}
            </span>
          </div>
        );
      }

      case 'accuracy': {
        const statEl = el as ResultAccuracyElement;
        const style = statEl.style;
        return (
          <div
            key={statEl.id}
            id={statEl.id}
            style={{
              ...commonStyle,
              backgroundColor: style?.backgroundColor || 'rgba(2, 6, 23, 0.85)',
              borderColor: style?.borderColor || '#334155',
              borderWidth: '1px',
              borderStyle: 'solid',
              borderRadius: typeof style?.borderRadius === 'number' ? `${(style.borderRadius / parentHeight) * 100}%` : '16px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '4px 8px',
            }}
            className="shadow-inner text-center overflow-hidden"
          >
            {style?.showLabel !== false && (
              <span
                style={{
                  color: style?.labelColor || '#94a3b8',
                  textAlign: style?.textAlign || 'center',
                }}
                className="text-[10px] sm:text-xs font-bold uppercase tracking-wider block truncate w-full"
              >
                {statEl.label || 'ACCURACY'}
              </span>
            )}
            <span
              style={{
                color: style?.valueColor || '#c084fc',
                fontSize: style?.fontSize ? `clamp(11px, ${style.fontSize * 0.55}cqi, 48px)` : undefined,
                textAlign: style?.textAlign || 'center',
              }}
              className="text-base sm:text-2xl font-black font-mono block tracking-tight truncate w-full"
            >
              {stats.accuracyPercent}%
            </span>
          </div>
        );
      }

      case 'time': {
        const statEl = el as ResultTimeElement;
        const style = statEl.style;
        return (
          <div
            key={statEl.id}
            id={statEl.id}
            style={{
              ...commonStyle,
              backgroundColor: style?.backgroundColor || 'rgba(2, 6, 23, 0.85)',
              borderColor: style?.borderColor || '#334155',
              borderWidth: '1px',
              borderStyle: 'solid',
              borderRadius: typeof style?.borderRadius === 'number' ? `${(style.borderRadius / parentHeight) * 100}%` : '16px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '4px 8px',
            }}
            className="shadow-inner text-center overflow-hidden"
          >
            {style?.showLabel !== false && (
              <span
                style={{
                  color: style?.labelColor || '#94a3b8',
                  textAlign: style?.textAlign || 'center',
                }}
                className="text-[10px] sm:text-xs font-bold uppercase tracking-wider block truncate w-full"
              >
                {statEl.label || 'TIME'}
              </span>
            )}
            <span
              style={{
                color: style?.valueColor || '#38bdf8',
                fontSize: style?.fontSize ? `clamp(11px, ${style.fontSize * 0.55}cqi, 48px)` : undefined,
                textAlign: style?.textAlign || 'center',
              }}
              className="text-base sm:text-2xl font-black font-mono block tracking-tight truncate w-full"
            >
              {stats.timeElapsedSeconds ?? 0}s
            </span>
          </div>
        );
      }

      case 'button': {
        const btnEl = el as ResultButtonElement;
        const style = btnEl.style;
        return (
          <button
            key={btnEl.id}
            id={btnEl.id}
            type="button"
            onClick={() => onAction?.(btnEl.action)}
            disabled={isSimulation}
            style={{
              ...commonStyle,
              backgroundColor: style?.backgroundColor || '#f59e0b',
              color: style?.textColor || '#020617',
              borderColor: style?.borderColor,
              borderWidth: typeof style?.borderWidth === 'number' ? `${style.borderWidth}px` : undefined,
              borderStyle: typeof style?.borderWidth === 'number' && style.borderWidth > 0 ? 'solid' : undefined,
              borderRadius: typeof style?.borderRadius === 'number' ? `${(style.borderRadius / parentHeight) * 100}%` : '18px',
              fontSize: style?.fontSize ? `clamp(12px, ${style.fontSize * 0.55}cqi, 26px)` : '1.3cqi',
              fontWeight: style?.fontWeight || '900',
              boxShadow:
                style?.shadow !== false
                  ? '0 10px 25px -5px rgba(245, 158, 11, 0.4)'
                  : undefined,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              cursor: isSimulation ? 'default' : 'pointer',
            }}
            className="uppercase tracking-wider transition-all hover:brightness-110 active:scale-95"
          >
            {btnEl.action === 'playAgain' && <RotateCcw className="w-4 h-4 shrink-0" />}
            {btnEl.action === 'exit' && <LogOut className="w-4 h-4 shrink-0" />}
            <span className="truncate">{btnEl.text}</span>
          </button>
        );
      }

      default:
        return null;
    }
  };

  return (
    <div
      className={`absolute inset-0 w-full h-full flex items-center justify-center overflow-hidden select-none ${className}`}
      style={bg.containerStyle}
    >
      {/* Background Overlay */}
      <div className="absolute inset-0 pointer-events-none" style={bg.overlayStyle} />

      {/* 1000 x 1000 Logical Canvas scaled responsively to fill container */}
      <div
        className="relative w-full h-full max-w-full max-h-full aspect-square"
        style={{
          containerType: 'inline-size',
        }}
      >
        {elements.map((el) => renderElement(el, canvasWidth, canvasHeight, true))}

        {/* Canvas-level Leaderboard Slot (if provided by live game) */}
        {leaderboardSlot && (
          <div
            style={{
              position: 'absolute',
              bottom: '5%',
              left: '10%',
              width: '80%',
              zIndex: 30,
            }}
          >
            {leaderboardSlot}
          </div>
        )}
      </div>
    </div>
  );
};
