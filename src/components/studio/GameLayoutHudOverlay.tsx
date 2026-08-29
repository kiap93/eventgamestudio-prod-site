import React, { useState, useEffect } from 'react';
import { GameTheme } from '../../themes/types';
import {
  GameLayoutConfig,
  LayoutElementKey,
  LAYOUT_ELEMENT_KEYS,
  LAYOUT_ELEMENTS_META,
  DEFAULT_GAME_LAYOUT,
  normalizeGameLayout,
} from '../../themes/layout';
import {
  Trophy,
  Clock,
  Megaphone,
  Image as ImageIcon,
  Move,
} from 'lucide-react';

export interface GameLayoutHudOverlayProps {
  layout?: GameLayoutConfig;
  theme: GameTheme;
  score?: number;
  timeRemaining?: number;
  editableLayout?: boolean;
  selectedElementKey?: LayoutElementKey | null;
  onSelectElementKey?: (key: LayoutElementKey) => void;
  onElementPointerDown?: (
    key: LayoutElementKey,
    isResize: boolean,
    e: React.PointerEvent<HTMLDivElement>
  ) => void;
  className?: string;
}

export const GameLayoutHudOverlay: React.FC<GameLayoutHudOverlayProps> = ({
  layout: rawLayout,
  theme,
  score = 0,
  timeRemaining = 20,
  editableLayout = false,
  selectedElementKey = null,
  onSelectElementKey,
  onElementPointerDown,
  className = '',
}) => {
  const layout = normalizeGameLayout(rawLayout || theme?.layout);
  const [logoLoadError, setLogoLoadError] = useState(false);

  const clientLogoUrl =
    theme?.branding?.clientLogoUrl ||
    theme?.clientLogo ||
    theme?.branding?.logoUrl ||
    theme?.logo ||
    null;

  // Reset logo error when logo url changes
  useEffect(() => {
    setLogoLoadError(false);
  }, [clientLogoUrl]);

  const hudColor = theme?.branding?.hudColor || '#c8e038';
  const accentColor =
    theme?.branding?.accentColor ||
    theme?.visuals_config?.accentColor ||
    '#10b981';

  const gameTitle =
    theme?.branding?.gameTitle ||
    theme?.gameTitle ||
    theme?.name ||
    'MEMORY MATCH';

  const sponsorSubtitle =
    theme?.branding?.subtitle ||
    theme?.subtitle ||
    'Official Event Arcade Challenge';

  const renderElementContent = (key: LayoutElementKey) => {
    switch (key) {
      case 'clientLogo': {
        const hasValidLogo = clientLogoUrl && !logoLoadError;
        if (hasValidLogo) {
          return (
            <div className="w-full h-full flex items-center justify-center p-0.5 pointer-events-none select-none">
              <img
                src={clientLogoUrl!}
                alt="Client Logo"
                draggable={false}
                className="max-h-8 sm:max-h-11 md:max-h-12 w-full object-contain drop-shadow pointer-events-none select-none"
                onError={() => setLogoLoadError(true)}
              />
            </div>
          );
        }

        // Fallback brand container when logo is missing or errored (useful in studio editor)
        if (editableLayout) {
          return (
            <div className="w-full bg-slate-900/90 backdrop-blur-sm border border-emerald-500/60 rounded-xl px-2 py-1 flex items-center justify-center gap-1.5 shadow-md pointer-events-none select-none">
              <ImageIcon className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span className="text-[10px] font-bold text-emerald-300 uppercase tracking-wider truncate">
                Client Logo
              </span>
            </div>
          );
        }

        return null;
      }

      case 'scoreHud':
        return (
          <div className="w-full bg-[#0c2012]/85 backdrop-blur-sm border-2 border-[#b2c833] rounded-2xl px-2.5 sm:px-3.5 py-1 sm:py-1.5 shadow-lg text-white flex items-center justify-between pointer-events-none select-none">
            <span className="text-[11px] sm:text-xs md:text-sm font-mono font-bold text-slate-300 flex items-center gap-1">
              <Trophy className="w-3.5 h-3.5 text-amber-400 shrink-0" /> SCORE
            </span>
            <span
              style={{ color: hudColor }}
              className="text-sm sm:text-base md:text-lg font-mono font-black ml-1.5 shrink-0"
            >
              {score}
            </span>
          </div>
        );

      case 'timer':
        return (
          <div className="w-full bg-[#0c2012]/85 backdrop-blur-sm border-2 border-[#b2c833] rounded-2xl px-2.5 sm:px-3.5 py-1 sm:py-1.5 shadow-lg text-white flex items-center justify-between pointer-events-none select-none">
            <span className="text-[11px] sm:text-xs md:text-sm font-mono font-bold text-slate-300 flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-teal-400 shrink-0" /> TIME
            </span>
            <span
              className={`text-sm sm:text-base md:text-lg font-mono font-black ml-1.5 shrink-0 ${
                timeRemaining <= 10 ? 'text-rose-400 animate-pulse' : 'text-amber-400'
              }`}
            >
              {timeRemaining}s
            </span>
          </div>
        );

      case 'gameTitle':
        return (
          <div className="w-full bg-slate-950/80 backdrop-blur-sm border border-slate-700/80 rounded-xl px-2.5 sm:px-3 py-0.5 sm:py-1 shadow-md text-center pointer-events-none select-none">
            <div
              style={{ color: accentColor }}
              className="font-black text-[11px] sm:text-xs md:text-sm uppercase tracking-wider truncate"
            >
              {gameTitle}
            </div>
          </div>
        );

      case 'footerSponsor':
        return (
          <div className="w-full bg-slate-950/80 backdrop-blur-sm border border-slate-700/80 rounded-full px-2.5 sm:px-3 py-0.5 sm:py-1 shadow-md text-center flex items-center justify-center gap-1.5 pointer-events-none select-none">
            <Megaphone className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span className="text-[9px] sm:text-[10px] md:text-xs text-slate-300 font-sans truncate">
              {sponsorSubtitle}
            </span>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div
      className={`absolute inset-0 pointer-events-none select-none z-35 overflow-visible ${className}`}
    >
      {LAYOUT_ELEMENT_KEYS.map((key) => {
        const meta = LAYOUT_ELEMENTS_META[key];
        const elem = layout[key] || DEFAULT_GAME_LAYOUT[key];
        const isSelected = selectedElementKey === key;
        const isVisible = elem.visible;
        const widthPercent = elem.width || meta.defaultWidth;

        // In live game mode (non-editable), if invisible, don't render
        if (!editableLayout && !isVisible) return null;

        // In live game mode, if client logo has no valid URL, don't render
        if (!editableLayout && key === 'clientLogo' && (!clientLogoUrl || logoLoadError)) {
          return null;
        }

        return (
          <div
            key={key}
            style={{
              position: 'absolute',
              left: `${elem.x}%`,
              top: `${elem.y}%`,
              width: `${widthPercent}%`,
              zIndex: isSelected ? 45 : 35,
              touchAction: 'none',
            }}
            onClick={(e) => {
              if (editableLayout) {
                e.stopPropagation();
                onSelectElementKey?.(key);
              }
            }}
            onPointerDown={(e) => {
              if (editableLayout && onElementPointerDown) {
                onElementPointerDown(key, false, e);
              }
            }}
            className={`transition-shadow select-none group/elem ${
              editableLayout
                ? `cursor-move touch-none pointer-events-auto ${
                    isSelected
                      ? 'ring-2 ring-amber-400 ring-offset-2 ring-offset-slate-950 rounded-xl shadow-2xl'
                      : 'hover:ring-1 hover:ring-slate-400/60 rounded-xl'
                  } ${!isVisible ? 'opacity-40 border border-dashed border-rose-400/70' : ''}`
                : 'pointer-events-none'
            }`}
          >
            {/* Element Body */}
            {renderElementContent(key)}

            {/* Studio Edit Mode Badges and Resize Handles */}
            {editableLayout && isSelected && (
              <>
                {/* Top Selection Label Tag */}
                <div className="absolute -top-5 left-0 bg-amber-500 text-slate-950 px-1.5 py-0.5 rounded text-[9px] font-mono font-black shadow pointer-events-none whitespace-nowrap z-50 flex items-center gap-1">
                  <Move className="w-2.5 h-2.5" />
                  <span>{meta.shortName}</span>
                  <span>
                    ({Math.round(elem.x)}%, {Math.round(elem.y)}%)
                  </span>
                </div>

                {/* Right Resize Handle */}
                <div
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    if (onElementPointerDown) {
                      onElementPointerDown(key, true, e);
                    }
                  }}
                  className="absolute -right-2 top-1/2 -translate-y-1/2 w-4 h-6 bg-amber-400 hover:bg-amber-300 border border-slate-900 rounded cursor-ew-resize flex items-center justify-center shadow-lg z-50 transition-transform active:scale-110"
                  title="Drag to resize width"
                >
                  <div className="w-0.5 h-3 bg-slate-950 rounded-full" />
                </div>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
};
