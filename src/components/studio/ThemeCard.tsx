import React, { useState, useRef, useEffect } from 'react';
import { GameTheme } from '../../themes';
import { getThemeGameType } from '../../themes/types';
import { getGameTypeIcon, formatGameTypeName } from '../../games';
import {
  Palette,
  Edit3,
  MoreVertical,
  Copy,
  Trash2,
  Sparkles,
  Calendar,
  Layers,
  ImageOff,
  Play,
  ShieldCheck,
  CheckCircle2,
} from 'lucide-react';

interface ThemeCardProps {
  theme: GameTheme;
  onPlay: (theme: GameTheme) => void;
  onEdit?: (themeId: string) => void;
  onDuplicate?: (themeId: string) => void;
  onDelete?: (themeId: string) => void;
  onClone?: (theme: GameTheme) => void;
  isSystem?: boolean;
  isViewer?: boolean;
  isOnlyTheme?: boolean;
}

export const ThemeCard: React.FC<ThemeCardProps> = ({
  theme,
  onPlay,
  onEdit,
  onDuplicate,
  onDelete,
  onClone,
  isSystem,
  isViewer = false,
  isOnlyTheme = false,
}) => {
  const [showMenu, setShowMenu] = useState(false);
  const [openUpward, setOpenUpward] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  const isSystemTheme =
    isSystem ?? Boolean(theme.is_system || (theme as any).ownership_type === 'system' || !(theme as any).organization_id);

  const handleToggleMenu = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!showMenu && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      setOpenUpward(spaceBelow < 220);
    }
    setShowMenu((prev) => !prev);
  };

  // Close menu on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    };
    if (showMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showMenu]);

  // Format updated date if available
  const formattedDate = React.useMemo(() => {
    const rawDate = (theme as any).updated_at || (theme as any).created_at;
    if (rawDate) {
      try {
        const d = new Date(rawDate);
        if (!isNaN(d.getTime())) {
          return d.toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          });
        }
      } catch (e) {
        // ignore date parse error
      }
    }
    return null;
  }, [(theme as any).updated_at, (theme as any).created_at]);

  const backgroundUrl = theme.background_url || theme.background;
  const isCustomImage = backgroundUrl && (backgroundUrl.startsWith('http') || backgroundUrl.startsWith('/') || backgroundUrl.startsWith('data:'));

  const itemsCount = theme.items_config ? theme.items_config.filter((i) => i.enabled).length : 0;
  const duration = theme.physics_config?.gameDurationSeconds || 20;

  const themeGameType = getThemeGameType(theme);
  const isCatcherTheme = themeGameType === 'catch-brand';
  const isReactionTheme = themeGameType === 'reaction-tap';
  const isMemoryTheme = themeGameType === 'memory-match';

  return (
    <div
      className={`relative bg-slate-900 border ${
        isSystemTheme ? 'border-indigo-500/30 hover:border-indigo-500/60' : 'border-slate-800/90 hover:border-slate-700/90'
      } rounded-3xl shadow-xl hover:shadow-2xl transition-all duration-300 flex flex-col group ${showMenu ? 'z-30' : 'z-0'}`}
    >
      {/* Background Image Preview Header */}
      <div className="relative aspect-video w-full bg-slate-950 overflow-hidden rounded-t-3xl border-b border-slate-800/80">
        {isCustomImage ? (
          <img
            src={backgroundUrl}
            alt={theme.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            referrerPolicy="no-referrer"
            onError={(e) => {
              (e.target as HTMLElement).style.display = 'none';
            }}
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-slate-500 p-4 bg-gradient-to-br from-slate-900 to-slate-950">
            <ImageOff className="w-8 h-8 mb-2 opacity-50 text-slate-400" />
            <span className="text-xs font-semibold text-slate-400">No background</span>
            <span className="text-[10px] text-slate-500 mt-0.5">Upload custom image in editor</span>
          </div>
        )}

        {/* Distinctive Ownership & Status Badges (Top-Left) */}
        <div className="absolute top-3 left-3 z-10 flex flex-wrap items-center gap-1.5">
          {isSystemTheme ? (
            <span className="px-2.5 py-1 rounded-full bg-indigo-950/90 text-indigo-300 border border-indigo-500/50 text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 shadow-md backdrop-blur-md">
              <Sparkles className="w-3 h-3 text-indigo-400" />
              <span>SYSTEM / DEFAULT THEME</span>
            </span>
          ) : (
            <span className="px-2.5 py-1 rounded-full bg-slate-950/90 text-amber-300 border border-amber-500/40 text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 shadow-md backdrop-blur-md">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
              <span>MY THEME</span>
            </span>
          )}

          {theme.status === 'draft' && !isSystemTheme && (
            <span className="px-2 py-0.5 rounded-full bg-slate-950/80 text-amber-300 border border-amber-500/40 text-[10px] font-semibold">
              Draft
            </span>
          )}
          {theme.status === 'archived' && (
            <span className="px-2 py-0.5 rounded-full bg-slate-950/80 text-slate-400 border border-slate-700/80 text-[10px] font-semibold">
              Archived
            </span>
          )}
          {(theme as any).is_default && (
            <span className="px-2 py-0.5 rounded-full bg-emerald-950/90 text-emerald-300 border border-emerald-500/40 text-[10px] font-bold">
              Default
            </span>
          )}
        </div>

        {/* Game Engine Type Badge (Top-Right) */}
        <div className="absolute top-3 right-3 z-10 pointer-events-none">
          <span className="px-2.5 py-1 rounded-full bg-slate-950/90 text-slate-300 border border-slate-700/80 text-[10px] font-bold flex items-center gap-1 shadow-md backdrop-blur-md">
            {getGameTypeIcon(themeGameType, 'w-3 h-3 text-amber-400')}
            <span className="uppercase tracking-wider">{formatGameTypeName(themeGameType)}</span>
          </span>
        </div>

        {/* Quick Play Hover Overlay */}
        <div
          onClick={() => onPlay(theme)}
          className="absolute inset-0 bg-slate-950/60 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center cursor-pointer backdrop-blur-[2px] z-10"
          title="Click to preview game"
        >
          <div className="w-12 h-12 rounded-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 flex items-center justify-center shadow-2xl transform scale-90 group-hover:scale-100 transition-transform active:scale-95">
            <Play className="w-5 h-5 fill-current ml-0.5" />
          </div>
        </div>

        {/* Quick Catcher Preview Overlay (Bottom-Right) - STRICTLY for Catch The Brand ONLY */}
        {theme.basket_config?.imageUrl && isCatcherTheme && (
          <div className="absolute bottom-2 right-2 z-20 bg-slate-950/80 border border-slate-800 p-1.5 rounded-xl backdrop-blur-md flex items-center gap-1.5 shadow-md pointer-events-none">
            <img
              src={theme.basket_config.imageUrl}
              alt={theme.basket_config.name || 'Basket'}
              className="w-6 h-6 object-contain"
              referrerPolicy="no-referrer"
            />
            <span className="text-[10px] font-bold text-slate-300 pr-1 max-w-[80px] truncate">
              {theme.basket_config.name || 'Catcher'}
            </span>
          </div>
        )}
      </div>

      {/* Card Content Body */}
      <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
        <div className="space-y-2">
          <div className="flex items-start justify-between gap-2">
            <h3
              onClick={() => {
                if (!isSystemTheme && onEdit) {
                  onEdit(theme.id);
                } else {
                  onPlay(theme);
                }
              }}
              className={`text-base font-black text-slate-100 transition-colors line-clamp-1 ${
                !isSystemTheme ? 'group-hover:text-amber-400 cursor-pointer' : 'cursor-default'
              }`}
              title={theme.name}
            >
              {theme.name}
            </h3>

            {/* More Actions Menu Button (Only for Customer-Owned themes) */}
            {!isSystemTheme && (
              <div className="relative" ref={menuRef}>
                <button
                  ref={buttonRef}
                  type="button"
                  onClick={handleToggleMenu}
                  className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-xl transition-colors"
                  title="Theme Actions"
                >
                  <MoreVertical className="w-4 h-4" />
                </button>

                {showMenu && (
                  <div
                    className={`absolute right-0 w-52 bg-slate-950 border border-slate-800 rounded-2xl shadow-2xl p-2 z-50 space-y-1 ${
                      openUpward ? 'bottom-full mb-1.5' : 'top-full mt-1.5'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setShowMenu(false);
                        onPlay(theme);
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-bold text-emerald-400 hover:bg-emerald-500/10 rounded-xl transition-colors text-left"
                    >
                      <Play className="w-3.5 h-3.5 fill-current shrink-0" />
                      <span className="whitespace-nowrap">Preview</span>
                    </button>

                    {onEdit && (
                      <button
                        type="button"
                        onClick={() => {
                          setShowMenu(false);
                          onEdit(theme.id);
                        }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800 rounded-xl transition-colors text-left"
                      >
                        <Edit3 className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                        <span className="whitespace-nowrap">Edit Theme</span>
                      </button>
                    )}

                    {onDuplicate && (
                      <button
                        type="button"
                        onClick={() => {
                          setShowMenu(false);
                          onDuplicate(theme.id);
                        }}
                        disabled={isViewer}
                        className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800 rounded-xl transition-colors text-left disabled:opacity-50"
                      >
                        <Copy className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                        <span className="whitespace-nowrap">Duplicate</span>
                      </button>
                    )}

                    {!isOnlyTheme && onDelete && (
                      <div className="border-t border-slate-800/80 pt-1 mt-1">
                        <button
                          type="button"
                          onClick={() => {
                            setShowMenu(false);
                            onDelete(theme.id);
                          }}
                          disabled={isViewer}
                          className="w-full flex items-center gap-2.5 px-3 py-2.5 text-xs font-semibold text-rose-400 hover:bg-rose-500/10 rounded-xl transition-colors text-left disabled:opacity-50"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                          <span className="whitespace-nowrap">Delete Theme</span>
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          <p className="text-xs text-slate-400 line-clamp-1">
            {theme.branding?.gameTitle || theme.description || (isSystemTheme ? 'System default preset theme' : 'Event game theme customization')}
          </p>

          {/* Theme Meta Pills */}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {isReactionTheme ? (
              <span className="text-[11px] font-medium text-slate-400 bg-slate-950/80 px-2.5 py-1 rounded-lg border border-slate-800 flex items-center gap-1.5">
                {getGameTypeIcon('reaction-tap', 'w-3 h-3 text-amber-400')}
                <span>Formula Reflex</span>
              </span>
            ) : isMemoryTheme ? (
              <span className="text-[11px] font-medium text-slate-400 bg-slate-950/80 px-2.5 py-1 rounded-lg border border-slate-800 flex items-center gap-1.5">
                {getGameTypeIcon('memory-match', 'w-3 h-3 text-indigo-400')}
                <span>{theme.items_config?.length || 0} Card Pairs</span>
              </span>
            ) : (
              <span className="text-[11px] font-medium text-slate-400 bg-slate-950/80 px-2.5 py-1 rounded-lg border border-slate-800 flex items-center gap-1.5">
                <Sparkles className="w-3 h-3 text-amber-400" />
                <span>{itemsCount} Collectibles</span>
              </span>
            )}

            <span className="text-[11px] font-medium text-slate-400 bg-slate-950/80 px-2.5 py-1 rounded-lg border border-slate-800 flex items-center gap-1.5">
              <Layers className="w-3 h-3 text-sky-400" />
              <span>{duration}s Round</span>
            </span>

            {formattedDate && (
              <span className="text-[11px] font-medium text-slate-500 flex items-center gap-1 ml-auto">
                <Calendar className="w-3 h-3 opacity-60" />
                <span>{formattedDate}</span>
              </span>
            )}
          </div>
        </div>

        {/* Primary Action Buttons */}
        <div className="pt-2 border-t border-slate-800/80 flex items-center gap-2">
          {isSystemTheme ? (
            /* System Theme Actions: Preview + Clone */
            <>
              <button
                type="button"
                onClick={() => onPlay(theme)}
                className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 active:scale-[0.98] text-slate-200 hover:text-white font-bold text-xs rounded-xl transition-all border border-slate-700 flex items-center justify-center gap-1.5 shadow-sm"
                title="Preview game with this system theme"
              >
                <Play className="w-3.5 h-3.5 fill-current text-emerald-400" />
                <span>Preview</span>
              </button>

              <button
                type="button"
                onClick={() => onClone?.(theme)}
                disabled={isViewer}
                className="flex-1 py-2.5 bg-amber-500 hover:bg-amber-400 active:scale-[0.98] text-slate-950 font-black text-xs rounded-xl transition-all shadow-md shadow-amber-500/10 flex items-center justify-center gap-1.5 disabled:opacity-50"
                title="Clone this system theme into your organization"
              >
                <Copy className="w-3.5 h-3.5 stroke-[2.5]" />
                <span>Clone</span>
              </button>
            </>
          ) : (
            /* Customer-Owned (MY THEME) Actions: Preview + Edit (and Delete/Duplicate preserved in menu/buttons) */
            <>
              <button
                type="button"
                onClick={() => onPlay(theme)}
                className="flex-1 py-2.5 bg-emerald-500 hover:bg-emerald-400 active:scale-[0.98] text-slate-950 font-black text-xs rounded-xl transition-all shadow-md shadow-emerald-500/10 flex items-center justify-center gap-1.5"
                title="Preview game with this theme"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Preview</span>
              </button>

              {onEdit && (
                <button
                  type="button"
                  onClick={() => onEdit(theme.id)}
                  className="px-3.5 py-2.5 bg-slate-800 hover:bg-slate-700 active:scale-[0.98] text-slate-200 hover:text-white font-bold text-xs rounded-xl transition-all border border-slate-700 flex items-center justify-center gap-1.5"
                  title="Customize theme settings"
                >
                  <Edit3 className="w-3.5 h-3.5 text-amber-400" />
                  <span>Edit</span>
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

