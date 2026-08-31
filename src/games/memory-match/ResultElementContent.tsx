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
} from './types';
import { Award, RotateCcw, LogOut, Image as ImageIcon } from 'lucide-react';
import { ResultScreenStats } from './ResultScreenRenderer';

export const FONT_FAMILY_PRESETS = [
  { label: 'System Default', value: 'inherit' },
  { label: 'Inter (Clean Sans)', value: "'Inter', sans-serif" },
  { label: 'Roboto (Modern Sans)', value: "'Roboto', sans-serif" },
  { label: 'Poppins (Geometric)', value: "'Poppins', sans-serif" },
  { label: 'Montserrat (Bold Clean)', value: "'Montserrat', sans-serif" },
  { label: 'Orbitron (Sci-Fi Arcade)', value: "'Orbitron', sans-serif" },
  { label: 'Press Start 2P (Pixel 8-Bit)', value: "'Press Start 2P', monospace" },
  { label: 'Playfair Display (Luxury Serif)', value: "'Playfair Display', serif" },
  { label: 'Cinzel (Mythic Fantasy)', value: "'Cinzel', serif" },
  { label: 'Bebas Neue (Impact Display)', value: "'Bebas Neue', sans-serif" },
  { label: 'Fredoka (Playful Rounded)', value: "'Fredoka', sans-serif" },
  { label: 'JetBrains Mono (Monospace)', value: "'JetBrains Mono', monospace" },
  { label: 'Georgia (Editorial Serif)', value: 'Georgia, serif' },
  { label: 'Impact (Poster Heavy)', value: 'Impact, sans-serif' },
];

export interface ResultElementContentProps {
  element: ResultScreenElement;
  parentWidth: number;
  parentHeight: number;
  stats?: ResultScreenStats;
  isSimulation?: boolean;
  onAction?: (action: string) => void;
  renderChild?: (child: ResultScreenElement, parentW: number, parentH: number) => React.ReactNode;
}

export const ResultElementContent: React.FC<ResultElementContentProps> = ({
  element: el,
  parentWidth,
  parentHeight,
  stats,
  isSimulation = false,
  onAction,
  renderChild,
}) => {
  switch (el.type) {
    case 'card': {
      const cardEl = el as ResultCardElement;
      const style = cardEl.style;
      return (
        <div
          style={{
            width: '100%',
            height: '100%',
            backgroundColor: style?.backgroundColor || 'rgba(15, 23, 42, 0.95)',
            backgroundImage: style?.backgroundImageUrl ? `url(${style.backgroundImageUrl})` : undefined,
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
            position: 'relative',
            overflow: 'hidden',
            containerType: 'inline-size',
          }}
          className="transition-all"
        >
          {Array.isArray(cardEl.children) &&
            renderChild &&
            cardEl.children.map((child) => renderChild(child, cardEl.width, cardEl.height))}
        </div>
      );
    }

    case 'group': {
      const groupEl = el as ResultGroupElement;
      return (
        <div className="w-full h-full relative" style={{ containerType: 'inline-size' }}>
          {Array.isArray(groupEl.children) &&
            renderChild &&
            groupEl.children.map((child) => renderChild(child, groupEl.width, groupEl.height))}
        </div>
      );
    }

    case 'text': {
      const textEl = el as ResultTextElement;
      const textStyle = textEl.style;

      // Vertical alignment mapping
      const verticalAlign = textStyle?.verticalAlign || 'center';
      const alignItems =
        verticalAlign === 'top'
          ? 'flex-start'
          : verticalAlign === 'bottom'
          ? 'flex-end'
          : 'center';

      // Horizontal alignment mapping
      const textAlign = textStyle?.textAlign || 'center';
      const justifyContent =
        textAlign === 'left'
          ? 'flex-start'
          : textAlign === 'right'
          ? 'flex-end'
          : textAlign === 'justify'
          ? 'stretch'
          : 'center';

      const fontSize = textStyle?.fontSize
        ? `clamp(8px, ${(textStyle.fontSize / parentWidth) * 100}cqi, ${textStyle.fontSize * 1.8}px)`
        : 'clamp(11px, 3.2cqi, 40px)';

      return (
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems,
            justifyContent,
            overflow: 'hidden',
            boxSizing: 'border-box',
            padding: '2px',
          }}
          className="select-none pointer-events-none"
        >
          <div
            style={{
              width: '100%',
              maxWidth: '100%',
              color: textStyle?.color || '#ffffff',
              fontFamily: textStyle?.fontFamily || 'inherit',
              fontSize,
              fontWeight: textStyle?.fontWeight || 'bold',
              fontStyle: textStyle?.fontStyle || 'normal',
              lineHeight: textStyle?.lineHeight ?? 1.2,
              letterSpacing: textStyle?.letterSpacing ? `${textStyle.letterSpacing}px` : undefined,
              textTransform: textStyle?.textTransform || 'none',
              textDecoration: textStyle?.textDecoration || 'none',
              textShadow: textStyle?.textShadow || undefined,
              textAlign,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              overflowWrap: 'break-word',
              opacity: typeof textStyle?.opacity === 'number' ? textStyle.opacity : undefined,
            }}
          >
            {textEl.text}
          </div>
        </div>
      );
    }

    case 'image': {
      const imgEl = el as ResultImageElement;
      return (
        <div className="w-full h-full flex items-center justify-center overflow-hidden pointer-events-none select-none">
          {imgEl.imageUrl ? (
            <img
              src={imgEl.imageUrl}
              alt=""
              className="w-full h-full select-none pointer-events-none"
              style={{ objectFit: imgEl.objectFit || 'contain' }}
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-slate-800/40 rounded-xl text-slate-500 border border-slate-700/50">
              <ImageIcon className="w-8 h-8 opacity-40" />
            </div>
          )}
        </div>
      );
    }

    case 'score':
    case 'moves':
    case 'pairs':
    case 'time':
    case 'accuracy': {
      const statEl = el as
        | ResultScoreElement
        | ResultMovesElement
        | ResultPairsElement
        | ResultTimeElement
        | ResultAccuracyElement;
      const style = statEl.style;

      // Extract default labels & values
      let defaultLabel = 'STAT';
      let defaultValueColor = '#fbbf24';
      let valueDisplay = '0';

      if (el.type === 'score') {
        defaultLabel = 'SCORE';
        defaultValueColor = '#fbbf24';
        valueDisplay = stats?.score !== undefined ? stats.score.toLocaleString() : '1,250';
      } else if (el.type === 'moves') {
        defaultLabel = 'MOVES';
        defaultValueColor = '#67e8f9';
        valueDisplay = stats?.moves !== undefined ? String(stats.moves) : '14';
      } else if (el.type === 'pairs') {
        defaultLabel = 'PAIRS';
        defaultValueColor = '#34d399';
        valueDisplay =
          stats?.matchedPairsCount !== undefined
            ? `${stats.matchedPairsCount}/${stats.totalPairs}`
            : '8/8';
      } else if (el.type === 'time') {
        defaultLabel = 'TIME';
        defaultValueColor = '#38bdf8';
        valueDisplay =
          stats?.timeElapsedSeconds !== undefined
            ? `${stats.timeElapsedSeconds}s`
            : '24s';
      } else if (el.type === 'accuracy') {
        defaultLabel = 'ACCURACY';
        defaultValueColor = '#c084fc';
        valueDisplay =
          stats?.accuracyPercent !== undefined
            ? `${stats.accuracyPercent}%`
            : '88%';
      }

      const labelText = statEl.label || defaultLabel;
      const isHorizontal = style?.layout === 'horizontal';

      // Alignment handling
      const textAlign = style?.textAlign || 'center';
      const verticalAlign = style?.verticalAlign || 'center';

      let containerAlignItems = 'center';
      let containerJustifyContent = 'center';

      if (!isHorizontal) {
        // Vertical layout (column)
        containerAlignItems =
          textAlign === 'left' ? 'flex-start' : textAlign === 'right' ? 'flex-end' : 'center';
        containerJustifyContent =
          verticalAlign === 'top'
            ? 'flex-start'
            : verticalAlign === 'bottom'
            ? 'flex-end'
            : 'center';
      } else {
        // Horizontal layout (row)
        containerJustifyContent =
          textAlign === 'left' ? 'flex-start' : textAlign === 'right' ? 'flex-end' : 'center';
        containerAlignItems =
          verticalAlign === 'top'
            ? 'flex-start'
            : verticalAlign === 'bottom'
            ? 'flex-end'
            : 'center';
      }

      // Label Typography
      const labelFontFamily = style?.labelFontFamily || 'inherit';
      const labelFontSize = style?.labelFontSize
        ? `clamp(8px, ${(style.labelFontSize / parentWidth) * 100}cqi, 32px)`
        : 'clamp(9px, 1.2cqi, 16px)';
      const labelFontWeight = style?.labelFontWeight || 'bold';
      const labelFontStyle = style?.labelFontStyle || 'normal';
      const labelColor = style?.labelColor || '#94a3b8';
      const labelLetterSpacing = style?.labelLetterSpacing
        ? `${style.labelLetterSpacing}px`
        : '0.05em';
      const labelTextTransform = style?.labelTextTransform || 'uppercase';

      // Value Typography
      const valueFontFamily = style?.valueFontFamily || 'monospace';
      const valueFontSize = style?.valueFontSize
        ? `clamp(10px, ${(style.valueFontSize / parentWidth) * 100}cqi, 64px)`
        : style?.fontSize
        ? `clamp(10px, ${(style.fontSize / parentWidth) * 100}cqi, 64px)`
        : 'clamp(14px, 2.2cqi, 48px)';
      const valueFontWeight = style?.valueFontWeight || '900';
      const valueFontStyle = style?.valueFontStyle || 'normal';
      const valueColor = style?.valueColor || defaultValueColor;
      const valueLetterSpacing = style?.valueLetterSpacing
        ? `${style.valueLetterSpacing}px`
        : undefined;
      const valueTextTransform = style?.valueTextTransform || 'none';
      const valueLineHeight = style?.valueLineHeight ?? 1;

      return (
        <div
          style={{
            width: '100%',
            height: '100%',
            backgroundColor: style?.backgroundColor || 'rgba(2, 6, 23, 0.85)',
            borderColor: style?.borderColor || '#334155',
            borderWidth:
              typeof style?.borderWidth === 'number'
                ? `${(style.borderWidth / parentWidth) * 100}cqi`
                : '1px',
            borderStyle: style?.borderWidth === 0 ? 'none' : 'solid',
            borderRadius:
              typeof style?.borderRadius === 'number'
                ? `${(style.borderRadius / parentHeight) * 100}%`
                : '16px',
            display: 'flex',
            flexDirection: isHorizontal ? 'row' : 'column',
            alignItems: containerAlignItems,
            justifyContent: containerJustifyContent,
            gap:
              typeof style?.gap === 'number'
                ? `${style.gap}px`
                : isHorizontal
                ? '8px'
                : '2px',
            padding: '4px 8px',
            boxSizing: 'border-box',
            overflow: 'hidden',
          }}
          className="shadow-inner pointer-events-none select-none"
        >
          {style?.showLabel !== false && (
            <span
              style={{
                color: labelColor,
                fontFamily: labelFontFamily,
                fontSize: labelFontSize,
                fontWeight: labelFontWeight,
                fontStyle: labelFontStyle,
                letterSpacing: labelLetterSpacing,
                textTransform: labelTextTransform,
                textAlign,
                lineHeight: 1.2,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                overflowWrap: 'break-word',
                maxWidth: isHorizontal ? '50%' : '100%',
              }}
              className="block truncate"
            >
              {labelText}
            </span>
          )}
          <span
            style={{
              color: valueColor,
              fontFamily: valueFontFamily,
              fontSize: valueFontSize,
              fontWeight: valueFontWeight,
              fontStyle: valueFontStyle,
              letterSpacing: valueLetterSpacing,
              textTransform: valueTextTransform,
              lineHeight: valueLineHeight,
              textAlign,
              whiteSpace: 'nowrap',
              wordBreak: 'break-word',
              overflowWrap: 'break-word',
              maxWidth: isHorizontal && style?.showLabel !== false ? '50%' : '100%',
            }}
            className="block tracking-tight truncate"
          >
            {valueDisplay}
          </span>
        </div>
      );
    }

    case 'button': {
      const btnEl = el as ResultButtonElement;
      const style = btnEl.style;

      const fontSize = style?.fontSize
        ? `clamp(10px, ${(style.fontSize / parentWidth) * 100}cqi, 36px)`
        : 'clamp(11px, 1.3cqi, 26px)';

      return (
        <button
          type="button"
          onClick={() => onAction?.(btnEl.action)}
          disabled={isSimulation}
          style={{
            width: '100%',
            height: '100%',
            backgroundColor: style?.backgroundColor || '#f59e0b',
            color: style?.textColor || '#020617',
            borderColor: style?.borderColor,
            borderWidth: typeof style?.borderWidth === 'number' ? `${style.borderWidth}px` : undefined,
            borderStyle:
              typeof style?.borderWidth === 'number' && style.borderWidth > 0 ? 'solid' : undefined,
            borderRadius:
              typeof style?.borderRadius === 'number'
                ? `${(style.borderRadius / parentHeight) * 100}%`
                : '18px',
            fontFamily: style?.fontFamily || 'inherit',
            fontSize,
            fontWeight: style?.fontWeight || '900',
            fontStyle: style?.fontStyle || 'normal',
            letterSpacing: style?.letterSpacing ? `${style.letterSpacing}px` : '0.05em',
            textTransform: style?.textTransform || 'uppercase',
            boxShadow:
              style?.shadow !== false ? '0 10px 25px -5px rgba(245, 158, 11, 0.4)' : undefined,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            cursor: isSimulation ? 'default' : 'pointer',
            padding: '4px 12px',
            boxSizing: 'border-box',
            overflow: 'hidden',
          }}
          className="transition-all hover:brightness-110 active:scale-95 select-none"
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
