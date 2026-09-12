import React, { useState } from 'react';
import {
  StartScreenElement,
  StartCardElement,
  StartTextElement,
  StartTitleElement,
  StartDescriptionElement,
  StartImageElement,
  StartButtonElement,
  StartBadgeElement,
  StartRulesElement,
  StartIconElement,
  StartKeyboardHintsElement,
  StartGroupElement,
  StartLeaderboardElement,
  StartScreenGameMeta,
} from './startScreenTypes';
import {
  Play,
  Trophy,
  HelpCircle,
  Settings,
  Grid3X3,
  Zap,
  Sparkles,
  Clock,
  Layers,
  Gamepad2,
  Image as ImageIcon,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import { GameTheme } from '../../themes/types';

export interface StartElementContentProps {
  element: StartScreenElement;
  parentWidth: number;
  parentHeight: number;
  gameMeta?: StartScreenGameMeta;
  theme?: Partial<GameTheme> | null;
  onStartGame?: () => void;
  onShowLeaderboard?: () => void;
  onShowGuide?: () => void;
  onOpenSettings?: () => void;
  renderChild?: (child: StartScreenElement, parentWidth: number, parentHeight: number) => React.ReactNode;
  isSimulation?: boolean;
  isEditor?: boolean;
  gameType?: string;
}

/**
 * Safe Image Component with fallback placeholder to prevent broken images from crashing the screen.
 */
export const SafeImage: React.FC<{
  src: string | null | undefined;
  alt?: string;
  className?: string;
  style?: React.CSSProperties;
  objectFit?: 'contain' | 'cover' | 'fill' | 'none' | 'scale-down';
}> = ({ src, alt = '', className = '', style = {}, objectFit = 'contain' }) => {
  const [hasError, setHasError] = useState(false);

  if (!src || hasError) {
    return (
      <div
        className={`w-full h-full flex items-center justify-center bg-slate-800/60 border border-slate-700/50 rounded-xl text-slate-400 p-2 ${className}`}
        style={style}
      >
        <ImageIcon className="w-6 h-6 opacity-40 shrink-0" />
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      className={`w-full h-full ${className}`}
      style={{
        objectFit,
        ...style,
      }}
      onError={() => setHasError(true)}
      loading="lazy"
    />
  );
};

export const StartElementContent: React.FC<StartElementContentProps> = ({
  element,
  parentWidth,
  parentHeight,
  gameMeta,
  theme,
  onStartGame = () => {},
  onShowLeaderboard = () => {},
  onShowGuide = () => {},
  onOpenSettings = () => {},
  renderChild,
  isSimulation = false,
  isEditor = false,
  gameType,
}) => {
  if (!element || typeof element !== 'object') {
    return null;
  }

  const isSim = isSimulation || isEditor;

  // Gracefully handle unknown elements without crashing
  const elType = element.type;

  switch (elType) {
    case 'card': {
      const cardEl = element as StartCardElement;
      const style = cardEl.style || {};
      const cardRadius = typeof style.borderRadius === 'number' ? style.borderRadius : 24;
      const radiusPx = `${cardRadius}px`;
      const borderWidth = typeof style.borderWidth === 'number' ? style.borderWidth : 1;
      const borderColor = style.borderColor || '#334155';
      const backgroundColor = style.backgroundColor || 'rgba(15, 23, 42, 0.85)';

      // Resolve theme background fallback for rich card appearance
      const themeBgUrl =
        (theme as any)?.background_url ||
        (theme as any)?.backgroundUrl ||
        (theme as any)?.theme_assets?.background ||
        (theme as any)?.background ||
        null;
      const cardBgImage =
        style.backgroundImageUrl !== undefined
          ? style.backgroundImageUrl
          : themeBgUrl;

      const hasShadow = style.shadow !== false;

      return (
        <div
          className="card-wrapper relative w-full h-full"
          style={{
            borderRadius: radiusPx,
            overflow: 'hidden',
            isolation: 'isolate',
            WebkitMaskImage: '-webkit-radial-gradient(white, black)',
            boxShadow: hasShadow ? '0 25px 50px -12px rgba(0, 0, 0, 0.7)' : undefined,
          }}
        >
          {/* Ensure pseudo-elements inherit matching radius */}
          <style>{`
            .card-wrapper, .card-wrapper * {
              --card-radius: ${radiusPx};
            }
            .card-wrapper::before, .card-wrapper::after,
            .card-background::before, .card-background::after,
            .card-background-image::before, .card-background-image::after,
            .card-overlay::before, .card-overlay::after,
            .card-content::before, .card-content::after,
            .card-outline::before, .card-outline::after {
              border-radius: inherit;
            }
          `}</style>

          {/* 1. Base Card Background Layer */}
          <div
            className="card-background absolute inset-0 w-full h-full pointer-events-none"
            style={{
              borderRadius: radiusPx,
              backgroundColor,
              overflow: 'hidden',
            }}
          />

          {/* 2. Theme / Custom Background Image Layer */}
          {cardBgImage && (
            <div
              className="card-background-image absolute inset-0 w-full h-full pointer-events-none"
              style={{
                borderRadius: radiusPx,
                backgroundImage: `url("${cardBgImage}")`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                backgroundRepeat: 'no-repeat',
                overflow: 'hidden',
              }}
            />
          )}

          {/* 3. Dark Overlay / Backdrop Blur Layer */}
          <div
            className="card-overlay absolute inset-0 w-full h-full pointer-events-none"
            style={{
              borderRadius: radiusPx,
              backgroundColor: cardBgImage ? backgroundColor : undefined,
              backdropFilter: style.backdropBlur ? 'blur(8px)' : undefined,
              WebkitBackdropFilter: style.backdropBlur ? 'blur(8px)' : undefined,
              overflow: 'hidden',
            }}
          />

          {/* 4. Child Content Clipping Container */}
          <div
            className="card-content relative z-10 w-full h-full"
            style={{
              borderRadius: radiusPx,
              overflow: 'hidden',
            }}
          >
            {Array.isArray(cardEl.children) &&
              cardEl.children.map((child) =>
                renderChild ? renderChild(child, cardEl.width, cardEl.height) : null
              )}
          </div>

          {/* 5. Border / Outline Layer */}
          {borderWidth > 0 && (
            <div
              className="card-outline absolute inset-0 w-full h-full pointer-events-none z-20"
              style={{
                borderRadius: radiusPx,
                borderWidth: `${borderWidth}px`,
                borderStyle: 'solid',
                borderColor,
                boxSizing: 'border-box',
              }}
            />
          )}
        </div>
      );
    }

    case 'group': {
      const groupEl = element as StartGroupElement;
      return (
        <div className="relative w-full h-full">
          {Array.isArray(groupEl.children) &&
            groupEl.children.map((child) =>
              renderChild ? renderChild(child, groupEl.width, groupEl.height) : null
            )}
        </div>
      );
    }

    case 'text':
    case 'title':
    case 'description': {
      const textEl = element as StartTextElement | StartTitleElement | StartDescriptionElement;
      const s = textEl.style || {};

      // Dynamic text template resolution
      let displayedText = textEl.text || '';
      if (displayedText.includes('{gameTitle}') && gameMeta?.gameTitle) {
        displayedText = displayedText.replace(/{gameTitle}/g, gameMeta.gameTitle);
      }
      if (displayedText.includes('{gameSubtitle}') && gameMeta?.gameSubtitle) {
        displayedText = displayedText.replace(/{gameSubtitle}/g, gameMeta.gameSubtitle);
      }
      if (displayedText.includes('{totalPairs}')) {
        const pairs = gameMeta?.totalPairs ?? 8;
        displayedText = displayedText.replace(/{totalPairs}/g, String(pairs));
      }
      if (displayedText.includes('{totalCards}')) {
        const cards = gameMeta?.totalCards ?? 16;
        displayedText = displayedText.replace(/{totalCards}/g, String(cards));
      }
      if (displayedText.includes('{duration}')) {
        const dur = gameMeta?.duration ?? 45;
        displayedText = displayedText.replace(/{duration}/g, `${dur}s`);
      }
      if (displayedText.includes('{rows}')) {
        displayedText = displayedText.replace(/{rows}/g, String(gameMeta?.rows ?? 4));
      }
      if (displayedText.includes('{cols}')) {
        displayedText = displayedText.replace(/{cols}/g, String(gameMeta?.cols ?? 4));
      }
      // Dynamic fallback for the standard instruction string when gameMeta provides totalPairs
      if (/Flip cards, find all \d+ matching pairs/i.test(displayedText) && gameMeta?.totalPairs) {
        displayedText = displayedText.replace(
          /Flip cards, find all \d+ matching pairs/i,
          `Flip cards, find all ${gameMeta.totalPairs} matching pairs`
        );
      }

      // Proportional font sizing based on logical parent dimensions & game UI scale
      const baseFontSize = s.fontSize ?? 16;
      const calculatedFontSize = `${baseFontSize}px`;

      return (
        <div
          className="w-full h-full flex items-center select-none"
          style={{
            justifyContent:
              s.textAlign === 'center'
                ? 'center'
                : s.textAlign === 'right'
                ? 'flex-end'
                : 'flex-start',
            fontFamily: s.fontFamily || 'inherit',
            fontSize: calculatedFontSize,
            fontWeight: s.fontWeight || 500,
            fontStyle: s.fontStyle || 'normal',
            color: s.color || '#ffffff',
            letterSpacing: s.letterSpacing ? `${s.letterSpacing}px` : undefined,
            lineHeight: s.lineHeight || 1.3,
            textTransform: s.textTransform || 'none',
            textShadow: s.textShadow || undefined,
            textAlign: s.textAlign || 'center',
            wordBreak: 'break-word',
          }}
        >
          {displayedText}
        </div>
      );
    }

    case 'image': {
      const imgEl = element as StartImageElement;
      const s = imgEl.style || {};

      // Resolve dynamic bindings like {logo}, {catcher}, {good_item}, {bad_item}
      let resolvedUrl = imgEl.imageUrl;
      if (!resolvedUrl || resolvedUrl === '{logo}') {
        resolvedUrl = gameMeta?.logoUrl || theme?.branding?.clientLogoUrl || theme?.clientLogo || theme?.logo || null;
      } else if (resolvedUrl === '{catcher}' || resolvedUrl === '{basket}') {
        resolvedUrl = gameMeta?.catcherImg || (theme as any)?.catcher || (theme as any)?.basket || null;
      } else if (resolvedUrl === '{good_item}' || resolvedUrl === '{reward}' || resolvedUrl === '{falling_item}') {
        resolvedUrl = gameMeta?.goodItemImg || gameMeta?.fallingItemImg || (theme as any)?.drop_items?.find((i: any) => i.type === 'normal' || i.type === 'good')?.url || null;
      } else if (resolvedUrl === '{bad_item}' || resolvedUrl === '{hazard}') {
        resolvedUrl = gameMeta?.badItemImg || gameMeta?.badFallingItemImg || (theme as any)?.drop_items?.find((i: any) => i.type === 'hazard' || i.type === 'bad')?.url || null;
      }

      return (
        <div
          className="w-full h-full overflow-hidden flex items-center justify-center select-none"
          style={{
            borderRadius: s.borderRadius ? `${s.borderRadius >= 100 ? 9999 : s.borderRadius}px` : undefined,
            borderWidth: s.borderWidth ? `${s.borderWidth}px` : undefined,
            borderColor: s.borderColor,
          }}
        >
          <SafeImage
            src={resolvedUrl}
            alt={imgEl.alt || 'Start Screen Artwork'}
            objectFit={imgEl.objectFit || s.objectFit || 'contain'}
          />
        </div>
      );
    }

    case 'button': {
      const btnEl = element as StartButtonElement;
      const s = btnEl.style || {};
      const rawAction = btnEl.action || 'start';
      const action =
        rawAction === 'startGame'
          ? 'start'
          : rawAction === 'viewLeaderboard'
          ? 'leaderboard'
          : rawAction === 'howToPlay'
          ? 'guide'
          : rawAction;

      const handleClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        // Guard only for visual editor canvas and static preview where clicks are intentionally disabled
        if (isEditor || isSimulation) {
          return;
        }

        try {
          if (action === 'start') {
            onStartGame?.();
          } else if (action === 'leaderboard') {
            onShowLeaderboard?.();
          } else if (action === 'guide') {
            onShowGuide?.();
          } else if (action === 'settings') {
            onOpenSettings?.();
          } else {
            // Default start
            onStartGame?.();
          }
        } catch (err) {
          console.warn('[StartElementContent] Button action callback failed safely:', err);
        }
      };

      const isStartAction = action === 'start';
      const baseBg = isStartAction ? (s.backgroundColor || '#10b981') : (s.backgroundColor || 'transparent');
      const textColor = s.textColor || (isStartAction ? '#020617' : '#f59e0b');
      const baseFontSize = s.fontSize ?? (isStartAction ? 22 : 14);
      const calculatedFontSize = `${baseFontSize}px`;

      let iconNode: React.ReactNode = null;
      if (btnEl.icon === 'Play' || (!btnEl.icon && isStartAction)) {
        iconNode = <Play className="w-[1em] h-[1em] fill-current" />;
      } else if (btnEl.icon === 'Trophy') {
        iconNode = <Trophy className="w-[1em] h-[1em]" />;
      } else if (btnEl.icon === 'HelpCircle') {
        iconNode = <HelpCircle className="w-[1em] h-[1em]" />;
      } else if (btnEl.icon === 'Settings') {
        iconNode = <Settings className="w-[1em] h-[1em]" />;
      }

      return (
        <button
          type="button"
          onClick={handleClick}
          onPointerDown={(e) => e.stopPropagation()}
          className={`w-full h-full flex items-center justify-center gap-2 font-bold cursor-pointer transition-all ${
            isStartAction
              ? 'shadow-lg hover:scale-102 active:scale-98'
              : 'hover:opacity-80'
          }`}
          style={{
            backgroundColor: s.gradient
              ? undefined
              : baseBg,
            backgroundImage: s.gradient
              ? `linear-gradient(to right, ${s.gradientFrom || '#10b981'}, ${s.gradientTo || '#0d9488'})`
              : undefined,
            color: textColor,
            fontSize: calculatedFontSize,
            fontWeight: s.fontWeight || (isStartAction ? 900 : 700),
            borderRadius: s.borderRadius ? `${s.borderRadius >= 100 ? 9999 : s.borderRadius}px` : '16px',
            borderWidth: s.borderWidth ? `${s.borderWidth}px` : undefined,
            borderColor: s.borderColor,
            boxShadow: s.shadow ? '0 10px 25px -5px rgba(0, 0, 0, 0.4)' : undefined,
          }}
        >
          {iconNode}
          <span>{btnEl.text}</span>
        </button>
      );
    }

    case 'badge': {
      const badgeEl = element as StartBadgeElement;
      const s = badgeEl.style || {};

      // Dynamic Metric Binding (Grid, Pairs, Timer, Rounds, Lights)
      let resolvedValue = badgeEl.value || '';
      let resolvedLabel = badgeEl.label || '';

      if (badgeEl.metric === 'grid') {
        resolvedLabel = badgeEl.label || 'GRID';
        const totalCards = gameMeta?.totalCards ?? ((gameMeta?.rows || 4) * (gameMeta?.cols || 4));
        resolvedValue = badgeEl.value && !/^\d+\s*Cards$/i.test(badgeEl.value) && !badgeEl.value.includes('AUTO')
          ? badgeEl.value
          : `${totalCards} Cards`;
      } else if (badgeEl.metric === 'pairs') {
        resolvedLabel = badgeEl.label || 'PAIRS';
        const totalCards = gameMeta?.totalCards ?? 16;
        const totalPairs = gameMeta?.totalPairs ?? Math.floor(totalCards / 2);
        resolvedValue = badgeEl.value && !/^\d+\s*Pairs$/i.test(badgeEl.value) && !badgeEl.value.includes('AUTO')
          ? badgeEl.value
          : `${totalPairs} Pairs`;
      } else if (badgeEl.metric === 'timer' || badgeEl.metric === 'duration') {
        resolvedLabel = badgeEl.label || 'TIMER';
        const duration = gameMeta?.duration ?? 45;
        resolvedValue = badgeEl.value && !/^\d+s$/i.test(badgeEl.value) && !badgeEl.value.includes('AUTO')
          ? badgeEl.value
          : `${duration}s`;
      } else if (badgeEl.metric === 'rounds') {
        resolvedLabel = badgeEl.label || 'ROUNDS';
        const rounds = gameMeta?.roundsCount ?? 5;
        resolvedValue = badgeEl.value && !/^\d+\s*Rounds$/i.test(badgeEl.value) && !badgeEl.value.includes('AUTO')
          ? badgeEl.value
          : `${rounds} Rounds`;
      } else if (badgeEl.metric === 'lights') {
        resolvedLabel = badgeEl.label || 'GANTRY';
        const lights = gameMeta?.lightCount ?? 5;
        resolvedValue = badgeEl.value && !/^\d+\s*Lights$/i.test(badgeEl.value) && !badgeEl.value.includes('AUTO')
          ? badgeEl.value
          : `${lights} Lights`;
      }

      return (
        <div
          className="w-full h-full flex flex-col items-center justify-center p-2 rounded-2xl select-none"
          style={{
            backgroundColor: s.backgroundColor || 'rgba(2, 6, 23, 0.8)',
            borderColor: s.borderColor || '#1e293b',
            borderWidth: `${s.borderWidth ?? 1}px`,
            borderRadius: s.borderRadius ? `${s.borderRadius >= 100 ? 9999 : s.borderRadius}px` : '16px',
          }}
        >
          <span
            className="font-bold uppercase tracking-wider block"
            style={{
              color: s.labelColor || '#64748b',
              fontSize: '11px',
            }}
          >
            {resolvedLabel}
          </span>
          <span
            className="font-black font-mono block truncate"
            style={{
              color: s.valueColor || '#f59e0b',
              fontSize: '14px',
            }}
          >
            {resolvedValue}
          </span>
        </div>
      );
    }

    case 'rules': {
      const rulesEl = element as StartRulesElement;

      if (rulesEl.ruleType === 'catch-brand' || (!rulesEl.ruleType && (gameMeta?.goodItemImg || gameMeta?.fallingItemImg || gameType === 'catch-brand'))) {
        const goodImg = gameMeta?.goodItemImg || gameMeta?.fallingItemImg || rulesEl.goodItemImg;
        const badImg = gameMeta?.badItemImg || gameMeta?.badFallingItemImg || rulesEl.badItemImg;
        const goodTitle = gameMeta?.fallingItemName || rulesEl.goodItemTitle || 'Target Item';
        const badTitle = gameMeta?.badFallingItemName || rulesEl.badItemTitle || 'Hazard Item';

        return (
          <div className="w-full h-full grid grid-cols-2 gap-3 select-none">
            {/* Good Item Card */}
            <div className="bg-emerald-950/60 border border-emerald-500/40 rounded-2xl p-2.5 flex flex-col items-center justify-center text-center">
              <div className="w-12 h-12 rounded-full bg-emerald-900/60 border border-emerald-400/60 flex items-center justify-center p-1.5 mb-1.5 overflow-hidden shrink-0">
                <SafeImage src={goodImg} alt={goodTitle} objectFit="contain" />
              </div>
              <span className="text-emerald-300 font-bold text-xs truncate max-w-full">
                {goodTitle}
              </span>
              <span className="text-emerald-400 font-black text-sm tracking-wide">
                {rulesEl.goodItemSubtitle || '+10 POINTS'}
              </span>
            </div>

            {/* Bad Item Card */}
            <div className="bg-rose-950/60 border border-rose-500/40 rounded-2xl p-2.5 flex flex-col items-center justify-center text-center">
              <div className="w-12 h-12 rounded-full bg-rose-900/60 border border-rose-400/60 flex items-center justify-center p-1.5 mb-1.5 overflow-hidden shrink-0">
                <SafeImage src={badImg} alt={badTitle} objectFit="contain" />
              </div>
              <span className="text-rose-300 font-bold text-xs truncate max-w-full">
                {badTitle}
              </span>
              <span className="text-rose-400 font-black text-sm tracking-wide">
                {rulesEl.badItemSubtitle || '-10 POINTS'}
              </span>
            </div>
          </div>
        );
      }

      if (rulesEl.ruleType === 'memory-match' || (!rulesEl.ruleType && gameType === 'memory-match')) {
        return (
          <div className="w-full h-full grid grid-cols-2 gap-3 select-none">
            <div className="bg-amber-950/50 border border-amber-500/40 rounded-2xl p-2.5 flex flex-col items-center justify-center text-center">
              <div className="w-10 h-10 rounded-xl bg-amber-900/60 border border-amber-400/60 flex items-center justify-center p-1.5 mb-1.5 overflow-hidden shrink-0">
                <Sparkles className="w-5 h-5 text-amber-300" />
              </div>
              <span className="text-amber-300 font-bold text-xs">Match Pairs</span>
              <span className="text-amber-400/90 font-medium text-[11px]">+POINTS FOR MATCH</span>
            </div>
            <div className="bg-slate-900/70 border border-slate-700/50 rounded-2xl p-2.5 flex flex-col items-center justify-center text-center">
              <div className="w-10 h-10 rounded-xl bg-slate-800/80 border border-slate-600/60 flex items-center justify-center p-1.5 mb-1.5 overflow-hidden shrink-0">
                <Clock className="w-5 h-5 text-slate-300" />
              </div>
              <span className="text-slate-300 font-bold text-xs">Beat Timer</span>
              <span className="text-slate-400 font-medium text-[11px]">COMBO STREAK BONUS</span>
            </div>
          </div>
        );
      }

      if (
        rulesEl.ruleType === 'reaction-tap' ||
        (rulesEl.ruleType as string) === 'reaction-time' ||
        (!rulesEl.ruleType && (gameType === 'reaction-tap' || gameType === 'reaction-time'))
      ) {
        return (
          <div className="w-full h-full grid grid-cols-2 gap-3 select-none">
            <div className="bg-emerald-950/50 border border-emerald-500/40 rounded-2xl p-2.5 flex flex-col items-center justify-center text-center">
              <div className="w-10 h-10 rounded-xl bg-emerald-900/60 border border-emerald-400/60 flex items-center justify-center p-1.5 mb-1.5 overflow-hidden shrink-0">
                <Zap className="w-5 h-5 text-emerald-300" />
              </div>
              <span className="text-emerald-300 font-bold text-xs">Tap On Green</span>
              <span className="text-emerald-400/90 font-medium text-[11px]">FASTEST MILLISECONDS</span>
            </div>
            <div className="bg-rose-950/50 border border-rose-500/40 rounded-2xl p-2.5 flex flex-col items-center justify-center text-center">
              <div className="w-10 h-10 rounded-xl bg-rose-900/60 border border-rose-400/60 flex items-center justify-center p-1.5 mb-1.5 overflow-hidden shrink-0">
                <AlertTriangle className="w-5 h-5 text-rose-300" />
              </div>
              <span className="text-rose-300 font-bold text-xs">Jump Start</span>
              <span className="text-rose-400 font-medium text-[11px]">PENALTY FOR EARLY TAP</span>
            </div>
          </div>
        );
      }

      // Generic rules display
      return (
        <div className="w-full h-full flex items-center justify-center p-3 bg-slate-900/80 border border-slate-800 rounded-2xl text-center text-slate-300 text-xs">
          <span>{rulesEl.goodItemTitle || 'Follow instructions to play and win!'}</span>
        </div>
      );
    }

    case 'icon': {
      const iconEl = element as StartIconElement;
      let IconComponent = Grid3X3;
      if (iconEl.iconName === 'Zap') IconComponent = Zap;
      else if (iconEl.iconName === 'Gamepad2') IconComponent = Gamepad2;
      else if (iconEl.iconName === 'Sparkles') IconComponent = Sparkles;
      else if (iconEl.iconName === 'Clock') IconComponent = Clock;
      else if (iconEl.iconName === 'Layers') IconComponent = Layers;
      else if (iconEl.iconName === 'Trophy') IconComponent = Trophy;
      else if (iconEl.iconName === 'Play') IconComponent = Play;
      else if (iconEl.iconName === 'CheckCircle2') IconComponent = CheckCircle2;
      else if (iconEl.iconName === 'AlertTriangle') IconComponent = AlertTriangle;
      else if (iconEl.iconName === 'HelpCircle') IconComponent = HelpCircle;
      else if (iconEl.iconName === 'Settings') IconComponent = Settings;

      return (
        <div
          className="w-full h-full rounded-2xl flex items-center justify-center select-none"
          style={{
            backgroundColor: iconEl.backgroundColor || 'rgba(245, 158, 11, 0.15)',
            borderColor: iconEl.borderColor || 'rgba(245, 158, 11, 0.4)',
            borderWidth: '1px',
            color: iconEl.iconColor || '#f59e0b',
          }}
        >
          <IconComponent className="w-1/2 h-1/2" />
        </div>
      );
    }

    case 'keyboard-hints': {
      const kbEl = element as StartKeyboardHintsElement;
      const keys = kbEl.keys || ['← →', 'A D'];

      return (
        <div className="w-full h-full flex items-center gap-2 text-slate-400 text-xs select-none">
          {keys.map((k, i) => (
            <React.Fragment key={i}>
              <kbd className="px-2 py-0.5 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 font-mono text-[11px]">
                {k}
              </kbd>
              {i < keys.length - 1 && <span>/</span>}
            </React.Fragment>
          ))}
        </div>
      );
    }

    case 'leaderboard': {
      const lbEl = element as StartLeaderboardElement;
      const s = lbEl.style || {};
      return (
        <div
          className="w-full h-full flex flex-col p-3 rounded-2xl select-none"
          style={{
            backgroundColor: s.backgroundColor || 'rgba(2, 6, 23, 0.85)',
            borderColor: s.borderColor || '#334155',
            borderWidth: `${s.borderWidth ?? 1}px`,
            borderRadius: s.borderRadius ? `${s.borderRadius >= 100 ? 9999 : s.borderRadius}px` : '18px',
          }}
        >
          {lbEl.showHeader !== false && (
            <div className="text-xs font-bold uppercase tracking-wider text-amber-400 mb-2 flex items-center gap-1.5">
              <Trophy className="w-3.5 h-3.5" />
              <span>{lbEl.headerText || 'TOP HIGH SCORES'}</span>
            </div>
          )}
          <div className="space-y-1.5 flex-1 flex flex-col justify-center">
            {['1. ACE - 2,450', '2. NEO - 1,980', '3. MAX - 1,620'].slice(0, lbEl.maxRows || 3).map((row, i) => (
              <div key={i} className="flex justify-between text-xs font-mono text-slate-300 bg-slate-800/50 px-2 py-1 rounded">
                <span>{row.split(' - ')[0]}</span>
                <span className="text-amber-300 font-bold">{row.split(' - ')[1]}</span>
              </div>
            ))}
          </div>
        </div>
      );
    }

    default: {
      if (process.env.NODE_ENV !== 'production') {
        console.warn(`[StartElementContent] Unknown Start Screen element type: "${(element as any)?.type}"`);
      }
      return (
        <div className="w-full h-full flex items-center justify-center bg-slate-800/40 border border-dashed border-slate-700/60 rounded-xl p-2 text-slate-400 text-xs font-mono select-none">
          <span>{(element as any)?.type || 'Custom Element'}</span>
        </div>
      );
    }
  }
};
