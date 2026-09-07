import React from 'react';
import {
  StartScreenElement,
  StartScreenCardElement,
  StartScreenGroupElement,
  StartScreenTextElement,
  StartScreenTitleElement,
  StartScreenDescriptionElement,
  StartScreenImageElement,
  StartScreenButtonElement,
  StartScreenBadgeElement,
  StartScreenRulesElement,
  StartScreenIconElement,
  StartScreenLeaderboardElement,
} from './startScreenTypes';
import {
  Play,
  Trophy,
  HelpCircle,
  Settings,
  Sparkles,
  Zap,
  Grid3X3,
  Clock,
  Layers,
  Award,
  ChevronRight,
  ShieldAlert,
  Flame,
  CheckCircle,
} from 'lucide-react';
import { GameTheme } from '../../themes/types';
import { EventLeaderboardEntry } from '../../types';

export interface StartElementGameMeta {
  rows?: number;
  cols?: number;
  totalCards?: number;
  totalPairs?: number;
  duration?: number;
  roundsCount?: number;
  lightCount?: number;
  goodItemName?: string;
  goodItemImg?: string;
  badItemName?: string;
  badItemImg?: string;
  fallingItemName?: string;
  badFallingItemName?: string;
}

export interface StartElementContentProps {
  element: StartScreenElement;
  parentWidth: number;
  parentHeight: number;
  theme?: Partial<GameTheme>;
  gameMeta?: StartElementGameMeta;
  gameType?: string;
  isSimulation?: boolean;
  isEditor?: boolean;
  onAction?: (action: string) => void;
  leaderboardScores?: EventLeaderboardEntry[];
  renderChild?: (child: StartScreenElement, parentWidth: number, parentHeight: number) => React.ReactNode;
}

export const StartElementContent: React.FC<StartElementContentProps> = ({
  element,
  parentWidth,
  parentHeight,
  theme,
  gameMeta,
  gameType = 'memory-match',
  isSimulation = false,
  isEditor = false,
  onAction,
  leaderboardScores,
  renderChild,
}) => {
  // 1. CARD CONTAINER
  if (element.type === 'card') {
    const cardEl = element as StartScreenCardElement;
    const style = cardEl.style || {};

    const cardStyles: React.CSSProperties = {
      width: '100%',
      height: '100%',
      backgroundColor: style.backgroundColor || 'rgba(15, 23, 42, 0.95)',
      backgroundImage: style.backgroundImageUrl ? `url(${style.backgroundImageUrl})` : undefined,
      backgroundSize: style.backgroundSize || 'cover',
      backgroundPosition: style.backgroundPosition || 'center',
      backgroundRepeat: style.backgroundRepeat || 'no-repeat',
      borderWidth: style.borderWidth !== undefined ? `${style.borderWidth}px` : '1px',
      borderStyle: 'solid',
      borderColor: style.borderColor || '#334155',
      borderRadius: style.borderRadius !== undefined ? `${style.borderRadius}px` : '24px',
      boxShadow: style.shadow
        ? '0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 30px rgba(245, 158, 11, 0.1)'
        : undefined,
      backdropFilter: style.backdropBlur !== false ? 'blur(12px)' : undefined,
      boxSizing: 'border-box',
      position: 'relative',
      overflow: 'hidden',
    };

    return (
      <div style={cardStyles} className="w-full h-full">
        {cardEl.children &&
          cardEl.children.map((child) =>
            renderChild ? renderChild(child, cardEl.width, cardEl.height) : null
          )}
      </div>
    );
  }

  // 2. GROUP CONTAINER
  if (element.type === 'group') {
    const groupEl = element as StartScreenGroupElement;
    return (
      <div className="w-full h-full relative">
        {groupEl.children &&
          groupEl.children.map((child) =>
            renderChild ? renderChild(child, groupEl.width, groupEl.height) : null
          )}
      </div>
    );
  }

  // 3. IMAGE ELEMENT
  if (element.type === 'image') {
    const imgEl = element as StartScreenImageElement;
    const style = imgEl.style || {};
    const imgUrl = imgEl.imageUrl || theme?.clientLogo || theme?.logo;

    if (!imgUrl) {
      return (
        <div
          className="w-full h-full flex flex-col items-center justify-center bg-slate-900/60 border border-dashed border-slate-700 rounded-xl p-2 text-center"
          style={{
            borderRadius: style.borderRadius !== undefined ? `${style.borderRadius}px` : '12px',
          }}
        >
          <Sparkles className="w-6 h-6 text-slate-500 mb-1" />
          <span className="text-[11px] text-slate-400 font-medium">Image Placeholder</span>
        </div>
      );
    }

    return (
      <img
        src={imgUrl}
        alt="Visual element"
        className="w-full h-full select-none pointer-events-none"
        style={{
          objectFit: imgEl.objectFit || style.objectFit || 'contain',
          objectPosition: imgEl.objectPosition || style.objectPosition || 'center',
          borderRadius: style.borderRadius !== undefined ? `${style.borderRadius}px` : undefined,
          borderWidth: style.borderWidth !== undefined ? `${style.borderWidth}px` : undefined,
          borderStyle: style.borderWidth ? 'solid' : undefined,
          borderColor: style.borderColor,
          boxShadow: style.shadow ? '0 10px 25px -5px rgba(0, 0, 0, 0.4)' : undefined,
          opacity: style.opacity ?? 1,
        }}
      />
    );
  }

  // 4. TEXT ELEMENT
  if (element.type === 'text') {
    const textEl = element as StartScreenTextElement;
    const style = textEl.style || {};

    return (
      <div
        className="w-full h-full flex items-center select-none"
        style={{
          justifyContent:
            style.textAlign === 'center'
              ? 'center'
              : style.textAlign === 'right'
              ? 'flex-end'
              : 'flex-start',
        }}
      >
        <p
          style={{
            fontFamily: style.fontFamily || 'inherit',
            fontSize: style.fontSize ? `${style.fontSize}px` : '14px',
            fontWeight: style.fontWeight || 500,
            fontStyle: style.fontStyle || 'normal',
            color: style.color || '#cbd5e1',
            textAlign: style.textAlign || 'center',
            lineHeight: style.lineHeight || 1.4,
            letterSpacing: style.letterSpacing ? `${style.letterSpacing}px` : undefined,
            textTransform: style.textTransform || 'none',
            textDecoration: style.textDecoration || 'none',
            textShadow: style.textShadow,
            opacity: style.opacity ?? 1,
            margin: 0,
          }}
        >
          {textEl.text}
        </p>
      </div>
    );
  }

  // 5. TITLE ELEMENT
  if (element.type === 'title') {
    const titleEl = element as StartScreenTitleElement;
    const style = titleEl.style || {};
    const titleText = titleEl.text || theme?.name || 'Memory Match';

    return (
      <div
        className="w-full h-full flex items-center select-none"
        style={{
          justifyContent:
            style.textAlign === 'left'
              ? 'flex-start'
              : style.textAlign === 'right'
              ? 'flex-end'
              : 'center',
        }}
      >
        <h1
          style={{
            fontFamily: style.fontFamily || 'inherit',
            fontSize: style.fontSize ? `${style.fontSize}px` : '36px',
            fontWeight: style.fontWeight || '900',
            fontStyle: style.fontStyle || 'normal',
            color: style.color || '#ffffff',
            textAlign: style.textAlign || 'center',
            letterSpacing: style.letterSpacing ? `${style.letterSpacing}px` : '1.5px',
            textTransform: style.textTransform || 'uppercase',
            textShadow: style.textShadow || '0 4px 16px rgba(0,0,0,0.6)',
            lineHeight: 1.15,
            margin: 0,
          }}
        >
          {titleText}
        </h1>
      </div>
    );
  }

  // 6. DESCRIPTION ELEMENT
  if (element.type === 'description') {
    const descEl = element as StartScreenDescriptionElement;
    const style = descEl.style || {};
    const descText =
      descEl.text ||
      theme?.description ||
      (gameType === 'reaction-tap'
        ? 'When the lights go out, tap as fast as you can!'
        : gameType === 'catch-brand'
        ? 'Catch positive brand items and avoid hazards!'
        : 'Flip cards, match identical pairs, and beat the clock!');

    return (
      <div
        className="w-full h-full flex items-center select-none"
        style={{
          justifyContent:
            style.textAlign === 'left'
              ? 'flex-start'
              : style.textAlign === 'right'
              ? 'flex-end'
              : 'center',
        }}
      >
        <p
          style={{
            fontFamily: style.fontFamily || 'inherit',
            fontSize: style.fontSize ? `${style.fontSize}px` : '15px',
            fontWeight: style.fontWeight || 500,
            color: style.color || '#cbd5e1',
            textAlign: style.textAlign || 'center',
            lineHeight: 1.5,
            letterSpacing: style.letterSpacing ? `${style.letterSpacing}px` : undefined,
            margin: 0,
          }}
        >
          {descText}
        </p>
      </div>
    );
  }

  // 7. BADGE ELEMENT
  if (element.type === 'badge') {
    const badgeEl = element as StartScreenBadgeElement;
    const style = badgeEl.style || {};

    let resolvedLabel = badgeEl.label;
    let resolvedValue = badgeEl.value;
    let IconComponent: React.ElementType = Sparkles;

    switch (badgeEl.metric) {
      case 'grid':
        IconComponent = Grid3X3;
        resolvedLabel = resolvedLabel || 'GRID';
        resolvedValue =
          resolvedValue ||
          (gameMeta?.rows && gameMeta?.cols
            ? `${gameMeta.rows}×${gameMeta.cols} (${gameMeta.totalCards || gameMeta.rows * gameMeta.cols} Cards)`
            : '4×4 Cards');
        break;
      case 'pairs':
        IconComponent = Layers;
        resolvedLabel = resolvedLabel || 'PAIRS';
        resolvedValue =
          resolvedValue ||
          (gameMeta?.totalPairs ? `${gameMeta.totalPairs} Pairs` : '8 Pairs');
        break;
      case 'timer':
        IconComponent = Clock;
        resolvedLabel = resolvedLabel || 'TIMER';
        resolvedValue =
          resolvedValue ||
          (gameMeta?.duration ? `${gameMeta.duration}s` : '45s');
        break;
      case 'rounds':
        IconComponent = Zap;
        resolvedLabel = resolvedLabel || 'ROUNDS';
        resolvedValue =
          resolvedValue ||
          (gameMeta?.roundsCount ? `${gameMeta.roundsCount} Rounds` : '5 Rounds');
        break;
      case 'lights':
        IconComponent = Sparkles;
        resolvedLabel = resolvedLabel || 'LIGHTS';
        resolvedValue =
          resolvedValue ||
          (gameMeta?.lightCount ? `${gameMeta.lightCount} Lights` : '5 Lights');
        break;
      case 'target-item':
        IconComponent = CheckCircle;
        resolvedLabel = resolvedLabel || 'TARGET';
        resolvedValue = resolvedValue || (gameMeta?.fallingItemName || '+10 PTS');
        break;
      case 'hazard-item':
        IconComponent = ShieldAlert;
        resolvedLabel = resolvedLabel || 'HAZARD';
        resolvedValue = resolvedValue || (gameMeta?.badFallingItemName || '-10 PTS');
        break;
      default:
        IconComponent = Sparkles;
        resolvedLabel = resolvedLabel || 'INFO';
        resolvedValue = resolvedValue || badgeEl.customText || 'Ready';
        break;
    }

    const isHorizontal = style.layout === 'horizontal';

    return (
      <div
        className="w-full h-full flex items-center justify-center p-2 box-border select-none"
        style={{
          backgroundColor: style.backgroundColor || 'rgba(2, 6, 23, 0.85)',
          borderWidth: style.borderWidth !== undefined ? `${style.borderWidth}px` : '1px',
          borderStyle: 'solid',
          borderColor: style.borderColor || '#334155',
          borderRadius: style.borderRadius !== undefined ? `${style.borderRadius}px` : '16px',
        }}
      >
        <div
          className={`flex items-center ${
            isHorizontal ? 'flex-row gap-2' : 'flex-col gap-1 text-center'
          }`}
        >
          {style.showLabel !== false && resolvedLabel && (
            <span
              style={{
                fontSize: style.fontSize ? `${Math.max(9, style.fontSize - 6)}px` : '11px',
                fontWeight: 700,
                color: style.labelColor || '#94a3b8',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
              }}
            >
              {resolvedLabel}
            </span>
          )}
          <span
            style={{
              fontSize: style.fontSize ? `${style.fontSize}px` : '16px',
              fontWeight: 800,
              color: style.valueColor || '#fbbf24',
              letterSpacing: '0.02em',
            }}
          >
            {resolvedValue}
          </span>
        </div>
      </div>
    );
  }

  // 8. BUTTON ELEMENT
  if (element.type === 'button') {
    const btnEl = element as StartScreenButtonElement;
    const style = btnEl.style || {};

    let IconComp: React.ElementType | null = Play;
    if (btnEl.iconName === 'trophy') IconComp = Trophy;
    else if (btnEl.iconName === 'help') IconComp = HelpCircle;
    else if (btnEl.iconName === 'settings') IconComp = Settings;
    else if (btnEl.iconName === 'none') IconComp = null;

    const isPulse = style.pulse && !isEditor;

    const handleClick = (e: React.MouseEvent) => {
      if (isEditor) return;
      e.stopPropagation();
      if (onAction) {
        onAction(btnEl.action);
      }
    };

    return (
      <button
        type="button"
        onClick={handleClick}
        disabled={isEditor}
        className={`w-full h-full flex items-center justify-center gap-2 select-none font-black transition-all ${
          isEditor ? 'cursor-move' : 'cursor-pointer hover:brightness-110 active:scale-95 shadow-xl'
        } ${isPulse ? 'animate-pulse' : ''}`}
        style={{
          backgroundColor: style.backgroundColor || '#f59e0b',
          color: style.textColor || '#020617',
          fontSize: style.fontSize ? `${style.fontSize}px` : '20px',
          fontWeight: style.fontWeight || '900',
          fontFamily: style.fontFamily || 'inherit',
          borderRadius: style.borderRadius !== undefined ? `${style.borderRadius}px` : '18px',
          borderWidth: style.borderWidth !== undefined ? `${style.borderWidth}px` : '0px',
          borderStyle: style.borderWidth ? 'solid' : undefined,
          borderColor: style.borderColor,
          letterSpacing: style.letterSpacing ? `${style.letterSpacing}px` : '1px',
          textTransform: style.textTransform || 'uppercase',
          boxShadow: style.shadow
            ? '0 12px 25px -4px rgba(245, 158, 11, 0.4), 0 4px 10px -2px rgba(0, 0, 0, 0.3)'
            : undefined,
        }}
      >
        {IconComp && (
          <IconComp
            className="shrink-0 fill-current"
            style={{
              width: style.fontSize ? `${Math.max(14, style.fontSize * 0.9)}px` : '18px',
              height: style.fontSize ? `${Math.max(14, style.fontSize * 0.9)}px` : '18px',
            }}
          />
        )}
        <span>{btnEl.text}</span>
      </button>
    );
  }

  // 9. RULES ELEMENT
  if (element.type === 'rules') {
    const rulesEl = element as StartScreenRulesElement;
    const style = rulesEl.style || {};

    if (rulesEl.gameType === 'catch-brand' || gameType === 'catch-brand') {
      const goodName = gameMeta?.fallingItemName || 'Brand Target';
      const badName = gameMeta?.badFallingItemName || 'Hazard';
      const goodImg = gameMeta?.goodItemImg || theme?.basket;
      const badImg = gameMeta?.badItemImg;

      return (
        <div
          className="w-full h-full grid grid-cols-2 gap-3 p-3 select-none"
          style={{
            backgroundColor: style.backgroundColor || 'rgba(2, 6, 23, 0.8)',
            borderWidth: style.borderWidth !== undefined ? `${style.borderWidth}px` : '1px',
            borderStyle: 'solid',
            borderColor: style.borderColor || '#334155',
            borderRadius: style.borderRadius !== undefined ? `${style.borderRadius}px` : '18px',
          }}
        >
          {/* Good Item Card */}
          <div className="bg-emerald-950/60 border border-emerald-500/40 rounded-xl p-2 flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-full bg-emerald-900/80 border border-emerald-400 flex items-center justify-center p-1 shrink-0 overflow-hidden">
              {goodImg ? (
                <img src={goodImg} alt={goodName} className="w-full h-full object-contain" />
              ) : (
                <Sparkles className="w-5 h-5 text-emerald-300" />
              )}
            </div>
            <div className="min-w-0">
              <span className="text-emerald-300 font-bold text-xs truncate block">{goodName}</span>
              <span className="text-emerald-400 font-black text-sm block">+10 PTS</span>
            </div>
          </div>

          {/* Bad Item Card */}
          <div className="bg-rose-950/60 border border-rose-500/40 rounded-xl p-2 flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-full bg-rose-900/80 border border-rose-400 flex items-center justify-center p-1 shrink-0 overflow-hidden">
              {badImg ? (
                <img src={badImg} alt={badName} className="w-full h-full object-contain" />
              ) : (
                <ShieldAlert className="w-5 h-5 text-rose-300" />
              )}
            </div>
            <div className="min-w-0">
              <span className="text-rose-300 font-bold text-xs truncate block">{badName}</span>
              <span className="text-rose-400 font-black text-sm block">-10 PTS</span>
            </div>
          </div>
        </div>
      );
    }

    // Default Rules Text Card
    return (
      <div
        className="w-full h-full flex flex-col items-center justify-center p-3 select-none text-center"
        style={{
          backgroundColor: style.backgroundColor || 'rgba(2, 6, 23, 0.8)',
          borderWidth: style.borderWidth !== undefined ? `${style.borderWidth}px` : '1px',
          borderStyle: 'solid',
          borderColor: style.borderColor || '#334155',
          borderRadius: style.borderRadius !== undefined ? `${style.borderRadius}px` : '18px',
        }}
      >
        <span className="text-xs font-bold text-amber-400 uppercase tracking-wider mb-1">
          {rulesEl.title || 'HOW TO PLAY'}
        </span>
        <p className="text-xs text-slate-300 leading-relaxed max-w-md">
          {rulesEl.description ||
            (gameType === 'reaction-tap'
              ? 'Wait for red lights to sequence and go out. Tap instantly to record fastest reaction!'
              : 'Flip matching cards to clear the board before the countdown expires!')}
        </p>
      </div>
    );
  }

  // 10. ICON ELEMENT
  if (element.type === 'icon') {
    const iconEl = element as StartScreenIconElement;
    const style = iconEl.style || {};

    let IconC = Grid3X3;
    if (iconEl.iconName === 'Zap') IconC = Zap;
    else if (iconEl.iconName === 'Sparkles') IconC = Sparkles;
    else if (iconEl.iconName === 'Trophy') IconC = Trophy;
    else if (iconEl.iconName === 'Award') IconC = Award;

    return (
      <div
        className="w-full h-full flex items-center justify-center select-none"
        style={{
          backgroundColor: style.backgroundColor || 'rgba(245, 158, 11, 0.15)',
          borderWidth: style.borderWidth !== undefined ? `${style.borderWidth}px` : '2px',
          borderStyle: 'solid',
          borderColor: style.borderColor || 'rgba(245, 158, 11, 0.4)',
          borderRadius: style.borderRadius !== undefined ? `${style.borderRadius}px` : '24px',
          boxShadow: style.shadow
            ? '0 10px 20px -3px rgba(245, 158, 11, 0.3)'
            : undefined,
        }}
      >
        {iconEl.imageUrl ? (
          <img
            src={iconEl.imageUrl}
            alt="Emblem"
            className="w-3/4 h-3/4 object-contain"
          />
        ) : (
          <IconC
            className="w-3/5 h-3/5"
            style={{ color: style.iconColor || '#fbbf24' }}
          />
        )}
      </div>
    );
  }

  // 11. LEADERBOARD PREVIEW ELEMENT
  if (element.type === 'leaderboard') {
    const lbEl = element as StartScreenLeaderboardElement;
    const style = lbEl.style || {};
    const maxRows = lbEl.maxRows || 3;

    const scores =
      leaderboardScores && leaderboardScores.length > 0
        ? leaderboardScores.slice(0, maxRows)
        : [
            { id: '1', rank: 1, player_name: 'Alex R.', score: 1250 },
            { id: '2', rank: 2, player_name: 'Jordan K.', score: 1100 },
            { id: '3', rank: 3, player_name: 'Taylor M.', score: 950 },
          ].slice(0, maxRows);

    return (
      <div
        className="w-full h-full flex flex-col p-3 box-border select-none overflow-hidden"
        style={{
          backgroundColor: style.backgroundColor || 'rgba(2, 6, 23, 0.85)',
          borderWidth: style.borderWidth !== undefined ? `${style.borderWidth}px` : '1px',
          borderStyle: 'solid',
          borderColor: style.borderColor || '#334155',
          borderRadius: style.borderRadius !== undefined ? `${style.borderRadius}px` : '18px',
        }}
      >
        {style.showHeader !== false && (
          <div className="flex items-center justify-between pb-2 mb-1 border-b border-slate-800">
            <span className="text-[11px] font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
              <Trophy className="w-3.5 h-3.5" />
              <span>{lbEl.headerText || 'TOP PLAYERS'}</span>
            </span>
            <span className="text-[10px] text-slate-400 font-mono">HIGH SCORES</span>
          </div>
        )}

        <div className="flex-1 space-y-1 overflow-hidden">
          {scores.map((s, idx) => (
            <div
              key={s.id || idx}
              className="flex items-center justify-between px-2 py-1 rounded-lg bg-slate-900/60 text-xs font-mono"
            >
              <div className="flex items-center gap-2">
                <span
                  className="font-black w-4 text-center"
                  style={{
                    color:
                      idx === 0
                        ? '#fbbf24'
                        : idx === 1
                        ? '#cbd5e1'
                        : idx === 2
                        ? '#d97706'
                        : style.rankColor || '#94a3b8',
                  }}
                >
                  {s.rank || idx + 1}
                </span>
                <span className="text-slate-200 truncate max-w-[120px]">
                  {s.player_name || 'Player'}
                </span>
              </div>
              <span
                className="font-bold"
                style={{ color: style.scoreColor || '#38bdf8' }}
              >
                {s.score}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return null;
};
