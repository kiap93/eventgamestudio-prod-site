import React, { useState, useEffect } from 'react';
import { GameTheme, getThemeGameType } from '../../themes/types';
import {
  GameLayoutConfig,
  LayoutElementKey,
  LAYOUT_ELEMENTS_META,
  DEFAULT_GAME_LAYOUT,
  DEFAULT_CATCH_BRAND_LAYOUT,
  normalizeGameLayout,
  getLayoutElementKeys,
  getDefaultUILayout,
} from '../../themes/layout';
import { getEffectiveGameLayout, getEditableGameLayout } from '../../themes/responsive';
import {
  Trophy,
  Clock,
  Megaphone,
  Image as ImageIcon,
  Move,
  Footprints,
  Sparkles,
} from 'lucide-react';

export interface GameLayoutHudOverlayProps {
  layout?: GameLayoutConfig;
  theme: GameTheme;
  gameType?: string;
  isPortrait?: boolean;
  score?: number;
  moves?: number;
  pairs?: number;
  totalPairs?: number;
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
  uiScale?: number;
}

export interface CatchBrandHudPositionParams {
  key: LayoutElementKey;
  elem: { x: number; y: number; width?: number; visible?: boolean };
  meta: { defaultWidth: number };
  layoutSource?: GameLayoutConfig;
  effectiveIsPortrait: boolean;
  clientLogoUrl?: string | null;
  logoLoadError?: boolean;
  isVisible: boolean;
}

export function calculateCatchBrandHudPosition({
  key,
  elem,
  meta,
  layoutSource,
  effectiveIsPortrait,
  clientLogoUrl,
  logoLoadError,
  isVisible,
}: CatchBrandHudPositionParams): {
  posX: number;
  posY: number;
  widthPercent: number;
  hasCustomValue: boolean;
} {
  const isPortraitCustom = Boolean(
    layoutSource?.portraitLayout?.[key] &&
    typeof layoutSource.portraitLayout[key].x === 'number' &&
    !isNaN(layoutSource.portraitLayout[key].x) &&
    typeof layoutSource.portraitLayout[key].y === 'number' &&
    !isNaN(layoutSource.portraitLayout[key].y)
  );

  const baseCustomElem = (layoutSource as any)?.[key];
  const defaultRef = DEFAULT_CATCH_BRAND_LAYOUT[key];

  // Helper to recognize legacy default coordinates that should be migrated rather than treated as genuine custom positions
  const isLegacyCatchDefault = (k: LayoutElementKey, el: { x: number; y: number; width?: number }) => {
    if (k === 'scoreHud') {
      return (Math.abs(el.x - 3.5) < 0.6 || Math.abs(el.x - 4) < 0.6) &&
             (Math.abs(el.y - 11) < 0.6 || Math.abs(el.y - 12) < 0.6);
    }
    if (k === 'timer') {
      return (
        (el.x >= 70 && el.y <= 12) ||
        (Math.abs(el.x - 79.5) < 2.0 && (Math.abs(el.y - 3.5) < 1.0 || Math.abs(el.y - 11) < 1.0)) ||
        (Math.abs(el.x - 78) < 1.5 || Math.abs(el.x - 80) < 1.5)
      );
    }
    if (k === 'clientLogo') {
      return (Math.abs(el.x - 3.5) < 0.2 && Math.abs(el.y - 3.5) < 0.2) ||
             (Math.abs(el.x - 41) < 0.6 && Math.abs(el.y - 9.5) < 0.6) ||
             (Math.abs(el.x - 4) < 0.6 && Math.abs(el.y - 4) < 0.6);
    }
    return false;
  };

  const isBaseCustom = Boolean(
    baseCustomElem &&
    typeof baseCustomElem.x === 'number' &&
    !isNaN(baseCustomElem.x) &&
    typeof baseCustomElem.y === 'number' &&
    !isNaN(baseCustomElem.y) &&
    !isLegacyCatchDefault(key, baseCustomElem) &&
    (
      !defaultRef ||
      baseCustomElem.x !== defaultRef.x ||
      baseCustomElem.y !== defaultRef.y ||
      (typeof baseCustomElem.width === 'number' && defaultRef.width && baseCustomElem.width !== defaultRef.width)
    )
  );

  const hasCustomValue = effectiveIsPortrait
    ? isPortraitCustom
    : isBaseCustom;

  let posX = elem.x;
  let posY = elem.y;
  let widthPercent = elem.width || meta.defaultWidth;

  if (hasCustomValue) {
    // If a custom value in landscape places timer directly into the row 1 control bar collision zone (posY < 8.5), safeguard it to row 2
    if (!effectiveIsPortrait && key === 'timer' && posX >= 72 && posY < 8.5) {
      posX = 79.5;
      posY = 10.5;
    }
    // Follow customization position
    return {
      posX,
      posY,
      widthPercent,
      hasCustomValue: true,
    };
  }

  // Stable Default UI positioning (Score HUD and Timer NEVER shift based on logo presence)
  if (!effectiveIsPortrait) {
    // Landscape simulation default UI
    if (key === 'gameTitle') {
      // Top row: centered horizontally
      widthPercent = Math.max(26, Math.min(36, widthPercent));
      posX = (100 - widthPercent) / 2;
      posY = 3.5;
    } else if (key === 'clientLogo') {
      // Second row: left-side secondary branding position below score HUD
      widthPercent = Math.max(14, Math.min(24, elem.width || 18));
      posX = 3.5;
      posY = 9.5;
    } else if (key === 'scoreHud') {
      // Top row: top-left
      posX = 3.5;
      posY = 3.5;
      widthPercent = Math.max(15, Math.min(22, widthPercent));
    } else if (key === 'timer') {
      // Second row: centered horizontally beneath Game Title
      widthPercent = Math.max(15, Math.min(22, widthPercent));
      posX = 79.5;
      posY = 10.5;
    } else if (key === 'footerSponsor') {
      widthPercent = Math.max(48, Math.min(65, widthPercent));
      posX = (100 - widthPercent) / 2;
      posY = 92;
    }
  } else {
    // Portrait simulation default UI (stable positions regardless of logo existence)
    if (key === 'gameTitle') {
      // First row: centered horizontally
      widthPercent = Math.max(45, Math.min(60, widthPercent));
      posX = (100 - widthPercent) / 2;
      posY = 2.5;
    } else if (key === 'clientLogo') {
      // Second row: centered horizontally below game title
      widthPercent = Math.max(24, Math.min(36, elem.width || 28));
      posX = (100 - widthPercent) / 2;
      posY = 7.5;
    } else if (key === 'scoreHud') {
      // Fixed default: side-by-side with timer at y=13%
      posX = 4;
      posY = 13;
      widthPercent = 44;
    } else if (key === 'timer') {
      // Fixed default: side-by-side with score at y=13%
      posX = 52;
      posY = 13;
      widthPercent = 44;
    } else if (key === 'footerSponsor') {
      widthPercent = Math.max(70, Math.min(88, widthPercent));
      posX = (100 - widthPercent) / 2;
      posY = 94;
    }
  }

  return {
    posX,
    posY,
    widthPercent,
    hasCustomValue: false,
  };
}

export const GameLayoutHudOverlay: React.FC<GameLayoutHudOverlayProps> = ({
  layout: rawLayout,
  theme,
  gameType: explicitGameType,
  isPortrait: explicitIsPortrait,
  score = 0,
  moves = 0,
  pairs = 0,
  totalPairs = 8,
  timeRemaining = 20,
  editableLayout = false,
  selectedElementKey = null,
  onSelectElementKey,
  onElementPointerDown,
  className = '',
  uiScale,
}) => {
  const resolvedGameType = explicitGameType || getThemeGameType(theme);
  const isCatch = resolvedGameType === 'catch-brand';
  const effectiveScale = isCatch && uiScale !== undefined
    ? Math.max(0.3, Math.min(2.5, uiScale))
    : 1.0;
  const effectiveIsPortrait =
    typeof explicitIsPortrait === 'boolean'
      ? explicitIsPortrait
      : (theme?.layout?.orientation === 'portrait');
  const layout = getEditableGameLayout(theme?.layout || rawLayout, effectiveIsPortrait, resolvedGameType);
  const defaultLayout = getEditableGameLayout(getDefaultUILayout(resolvedGameType), effectiveIsPortrait, resolvedGameType);
  const activeElementKeys = getLayoutElementKeys(resolvedGameType).filter(
    (k) => k !== 'memoryCardBoard'
  );
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
    (resolvedGameType === 'memory-match' ? 'MEMORY MATCH' : 'CATCH THE BRAND');

  const sponsorSubtitle =
    theme?.branding?.subtitle ||
    theme?.subtitle ||
    'Official Event Arcade Challenge';

  // Scaled dimensions for Catch the Brand and Memory Match HUD elements
  const hudMetrics = (isCatch || resolvedGameType === 'memory-match') ? {
    hudPadX: Math.max(6, Math.min(14, Math.round(8 * effectiveScale))),
    hudPadY: Math.max(2, Math.min(8, Math.round(4 * effectiveScale))),
    hudRadius: Math.max(8, Math.min(16, Math.round(10 * effectiveScale))),
    hudBorder: Math.max(1, Math.min(2.5, 1.5 * effectiveScale)),
    labelFont: Math.max(9, Math.min(13, Math.round(10 * effectiveScale))),
    valFont: Math.max(11, Math.min(18, Math.round(14 * effectiveScale))),
    iconSize: Math.max(10, Math.min(16, Math.round(12 * effectiveScale))),
    titleFont: Math.max(10, Math.min(15, Math.round(12 * effectiveScale))),
    titlePadX: Math.max(6, Math.min(14, Math.round(8 * effectiveScale))),
    titlePadY: Math.max(2, Math.min(6, Math.round(3.5 * effectiveScale))),
    titleRadius: Math.max(6, Math.min(12, Math.round(8 * effectiveScale))),
    footerFont: Math.max(9, Math.min(13, Math.round(10 * effectiveScale))),
    footerPadX: Math.max(8, Math.min(16, Math.round(10 * effectiveScale))),
    footerPadY: Math.max(2, Math.min(6, Math.round(3 * effectiveScale))),
  } : null;

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
                style={
                  isCatch
                    ? { maxHeight: `${Math.max(20, Math.round(42 * effectiveScale))}px` }
                    : undefined
                }
                className="max-h-11 w-full object-contain drop-shadow pointer-events-none select-none"
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
        if (hudMetrics) {
          return (
            <div
              style={{
                paddingLeft: `${hudMetrics.hudPadX}px`,
                paddingRight: `${hudMetrics.hudPadX}px`,
                paddingTop: `${hudMetrics.hudPadY}px`,
                paddingBottom: `${hudMetrics.hudPadY}px`,
                borderRadius: `${hudMetrics.hudRadius}px`,
                borderWidth: `${hudMetrics.hudBorder}px`,
              }}
              className="w-full bg-[#0c2012]/85 backdrop-blur-sm border-[#b2c833] shadow-lg text-white flex items-center justify-between pointer-events-none select-none overflow-hidden"
            >
              <span
                style={{ fontSize: `${hudMetrics.labelFont}px` }}
                className="font-mono font-bold text-slate-300 flex items-center gap-1 shrink-0"
              >
                <Trophy
                  style={{ width: `${hudMetrics.iconSize}px`, height: `${hudMetrics.iconSize}px` }}
                  className="text-amber-400 shrink-0"
                />{' '}
                SCORE
              </span>
              <span
                style={{ color: hudColor, fontSize: `${hudMetrics.valFont}px` }}
                className="font-mono font-black ml-1 shrink-0"
              >
                {score}
              </span>
            </div>
          );
        }
        return (
          <div className="w-full bg-[#0c2012]/85 backdrop-blur-sm border-2 border-[#b2c833] rounded-xl sm:rounded-2xl px-2 sm:px-3 py-0.5 sm:py-1.5 shadow-lg text-white flex items-center justify-between pointer-events-none select-none overflow-hidden">
            <span className="text-[10px] sm:text-xs font-mono font-bold text-slate-300 flex items-center gap-1 shrink-0">
              <Trophy className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-amber-400 shrink-0" /> SCORE
            </span>
            <span
              style={{ color: hudColor }}
              className="text-xs sm:text-base font-mono font-black ml-1 shrink-0"
            >
              {score}
            </span>
          </div>
        );

      case 'movesHud':
        if (hudMetrics) {
          return (
            <div
              style={{
                paddingLeft: `${hudMetrics.hudPadX}px`,
                paddingRight: `${hudMetrics.hudPadX}px`,
                paddingTop: `${hudMetrics.hudPadY}px`,
                paddingBottom: `${hudMetrics.hudPadY}px`,
                borderRadius: `${hudMetrics.hudRadius}px`,
                borderWidth: `${hudMetrics.hudBorder}px`,
              }}
              className="w-full bg-[#0c2012]/85 backdrop-blur-sm border-[#b2c833] shadow-lg text-white flex items-center justify-between pointer-events-none select-none overflow-hidden"
            >
              <span
                style={{ fontSize: `${hudMetrics.labelFont}px` }}
                className="font-mono font-bold text-slate-300 flex items-center gap-1 shrink-0"
              >
                <Footprints
                  style={{ width: `${hudMetrics.iconSize}px`, height: `${hudMetrics.iconSize}px` }}
                  className="text-sky-400 shrink-0"
                />{' '}
                MOVES
              </span>
              <span
                style={{ color: hudColor, fontSize: `${hudMetrics.valFont}px` }}
                className="font-mono font-black ml-1 shrink-0"
              >
                {moves}
              </span>
            </div>
          );
        }
        return (
          <div className="w-full bg-[#0c2012]/85 backdrop-blur-sm border-2 border-[#b2c833] rounded-xl sm:rounded-2xl px-2 sm:px-3 py-0.5 sm:py-1.5 shadow-lg text-white flex items-center justify-between pointer-events-none select-none overflow-hidden">
            <span className="text-[10px] sm:text-xs font-mono font-bold text-slate-300 flex items-center gap-1 shrink-0">
              <Footprints className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-sky-400 shrink-0" /> MOVES
            </span>
            <span
              style={{ color: hudColor }}
              className="text-xs sm:text-base font-mono font-black ml-1 shrink-0"
            >
              {moves}
            </span>
          </div>
        );

      case 'pairsHud':
        if (hudMetrics) {
          return (
            <div
              style={{
                paddingLeft: `${hudMetrics.hudPadX}px`,
                paddingRight: `${hudMetrics.hudPadX}px`,
                paddingTop: `${hudMetrics.hudPadY}px`,
                paddingBottom: `${hudMetrics.hudPadY}px`,
                borderRadius: `${hudMetrics.hudRadius}px`,
                borderWidth: `${hudMetrics.hudBorder}px`,
              }}
              className="w-full bg-[#0c2012]/85 backdrop-blur-sm border-[#b2c833] shadow-lg text-white flex items-center justify-between pointer-events-none select-none overflow-hidden"
            >
              <span
                style={{ fontSize: `${hudMetrics.labelFont}px` }}
                className="font-mono font-bold text-slate-300 flex items-center gap-1 shrink-0"
              >
                <Sparkles
                  style={{ width: `${hudMetrics.iconSize}px`, height: `${hudMetrics.iconSize}px` }}
                  className="text-emerald-400 shrink-0"
                />{' '}
                PAIRS
              </span>
              <span
                style={{ color: hudColor, fontSize: `${hudMetrics.valFont}px` }}
                className="font-mono font-black ml-1 shrink-0"
              >
                {pairs}/{totalPairs}
              </span>
            </div>
          );
        }
        return (
          <div className="w-full bg-[#0c2012]/85 backdrop-blur-sm border-2 border-[#b2c833] rounded-xl sm:rounded-2xl px-2 sm:px-3 py-0.5 sm:py-1.5 shadow-lg text-white flex items-center justify-between pointer-events-none select-none overflow-hidden">
            <span className="text-[10px] sm:text-xs font-mono font-bold text-slate-300 flex items-center gap-1 shrink-0">
              <Sparkles className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-emerald-400 shrink-0" /> PAIRS
            </span>
            <span
              style={{ color: hudColor }}
              className="text-xs sm:text-base font-mono font-black ml-1 shrink-0"
            >
              {pairs}/{totalPairs}
            </span>
          </div>
        );

      case 'timer':
        if (hudMetrics) {
          return (
            <div
              style={{
                paddingLeft: `${hudMetrics.hudPadX}px`,
                paddingRight: `${hudMetrics.hudPadX}px`,
                paddingTop: `${hudMetrics.hudPadY}px`,
                paddingBottom: `${hudMetrics.hudPadY}px`,
                borderRadius: `${hudMetrics.hudRadius}px`,
                borderWidth: `${hudMetrics.hudBorder}px`,
              }}
              className="w-full bg-[#0c2012]/85 backdrop-blur-sm border-[#b2c833] shadow-lg text-white flex items-center justify-between pointer-events-none select-none overflow-hidden"
            >
              <span
                style={{ fontSize: `${hudMetrics.labelFont}px` }}
                className="font-mono font-bold text-slate-300 flex items-center gap-1 shrink-0"
              >
                <Clock
                  style={{ width: `${hudMetrics.iconSize}px`, height: `${hudMetrics.iconSize}px` }}
                  className="text-teal-400 shrink-0"
                />{' '}
                TIME
              </span>
              <span
                style={{ fontSize: `${hudMetrics.valFont}px` }}
                className={`font-mono font-black ml-1 shrink-0 ${
                  timeRemaining <= 10 ? 'text-rose-400 animate-pulse' : 'text-amber-400'
                }`}
              >
                {timeRemaining}s
              </span>
            </div>
          );
        }
        return (
          <div className="w-full bg-[#0c2012]/85 backdrop-blur-sm border-2 border-[#b2c833] rounded-xl sm:rounded-2xl px-2 sm:px-3 py-0.5 sm:py-1.5 shadow-lg text-white flex items-center justify-between pointer-events-none select-none overflow-hidden">
            <span className="text-[10px] sm:text-xs font-mono font-bold text-slate-300 flex items-center gap-1 shrink-0">
              <Clock className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-teal-400 shrink-0" /> TIME
            </span>
            <span
              className={`text-xs sm:text-base font-mono font-black ml-1 shrink-0 ${
                timeRemaining <= 10 ? 'text-rose-400 animate-pulse' : 'text-amber-400'
              }`}
            >
              {timeRemaining}s
            </span>
          </div>
        );

      case 'gameTitle':
        if (hudMetrics) {
          return (
            <div
              style={{
                paddingLeft: `${hudMetrics.titlePadX}px`,
                paddingRight: `${hudMetrics.titlePadX}px`,
                paddingTop: `${hudMetrics.titlePadY}px`,
                paddingBottom: `${hudMetrics.titlePadY}px`,
                borderRadius: `${hudMetrics.titleRadius}px`,
              }}
              className="w-full bg-slate-950/80 backdrop-blur-sm border border-slate-700/80 shadow-md text-center pointer-events-none select-none overflow-hidden"
            >
              <div
                style={{ color: accentColor, fontSize: `${hudMetrics.titleFont}px` }}
                className="font-black uppercase tracking-wider truncate"
              >
                {gameTitle}
              </div>
            </div>
          );
        }
        return (
          <div className="w-full bg-slate-950/80 backdrop-blur-sm border border-slate-700/80 rounded-lg sm:rounded-xl px-2 sm:px-3 py-0.5 sm:py-1 shadow-md text-center pointer-events-none select-none overflow-hidden">
            <div
              style={{ color: accentColor }}
              className="font-black text-[10px] sm:text-xs uppercase tracking-wider truncate"
            >
              {gameTitle}
            </div>
          </div>
        );

      case 'footerSponsor':
        if (hudMetrics) {
          return (
            <div
              style={{
                paddingLeft: `${hudMetrics.footerPadX}px`,
                paddingRight: `${hudMetrics.footerPadX}px`,
                paddingTop: `${hudMetrics.footerPadY}px`,
                paddingBottom: `${hudMetrics.footerPadY}px`,
              }}
              className="w-full bg-slate-950/80 backdrop-blur-sm border border-slate-700/80 rounded-full shadow-md text-center flex items-center justify-center gap-1.5 pointer-events-none select-none overflow-hidden"
            >
              <Megaphone
                style={{ width: `${hudMetrics.iconSize}px`, height: `${hudMetrics.iconSize}px` }}
                className="text-amber-400 shrink-0"
              />
              <span
                style={{ fontSize: `${hudMetrics.footerFont}px` }}
                className="text-slate-300 font-sans truncate"
              >
                {sponsorSubtitle}
              </span>
            </div>
          );
        }
        return (
          <div className="w-full bg-slate-950/80 backdrop-blur-sm border border-slate-700/80 rounded-full px-2 sm:px-3 py-0.5 sm:py-1 shadow-md text-center flex items-center justify-center gap-1.5 pointer-events-none select-none overflow-hidden">
            <Megaphone className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-amber-400 shrink-0" />
            <span className="text-[10px] sm:text-[11px] text-slate-300 font-sans truncate">
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
      {activeElementKeys.map((key) => {
        const meta = LAYOUT_ELEMENTS_META[key];
        const elem = layout[key] || defaultLayout[key] || DEFAULT_GAME_LAYOUT[key];
        if (!elem) return null;
        const isSelected = selectedElementKey === key;
        const isVisible = elem.visible;
        let widthPercent = elem.width || meta.defaultWidth;
        let posX = elem.x;
        let posY = elem.y;

        // In live game simulation for Catch the Brand:
        // if customization already have value, game hud ui should follow customization position, else default ui
        if (isCatch && !editableLayout) {
          const layoutSource = theme?.layout || (rawLayout as GameLayoutConfig | undefined);
          const computed = calculateCatchBrandHudPosition({
            key,
            elem,
            meta,
            layoutSource,
            effectiveIsPortrait,
            clientLogoUrl,
            logoLoadError,
            isVisible,
          });
          posX = computed.posX;
          posY = computed.posY;
          widthPercent = computed.widthPercent;
        }

        // In live game mode (non-editable), if invisible, don't render
        if (!editableLayout && !isVisible) return null;

        // If client logo has no valid URL, is errored, or is disabled:
        if (key === 'clientLogo') {
          if (!clientLogoUrl || logoLoadError || !isVisible) {
            if (!editableLayout) {
              return null;
            }
          }
        }

        return (
          <div
            key={key}
            style={{
              position: 'absolute',
              left: `${posX}%`,
              top: `${posY}%`,
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
