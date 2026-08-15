import React, { useState, useRef, useEffect } from 'react';
import { GameTheme } from '../../themes';
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
} from 'lucide-react';

interface ThemeCardProps {
  theme: GameTheme;
  onPlay: (theme: GameTheme) => void;
  onEdit: (themeId: string) => void;
  onDuplicate: (themeId: string) => void;
  onDelete: (themeId: string) => void;
  isViewer?: boolean;
  isOnlyTheme?: boolean;
}

export const ThemeCard: React.FC<ThemeCardProps> = ({
  theme,
  onPlay,
  onEdit,
  onDuplicate,
  onDelete,
  isViewer = false,
  isOnlyTheme = false,
}) => {
  const [showMenu, setShowMenu] = useState(false);
  const [openUpward, setOpenUpward] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);

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

  return (
    <div className={`relative bg-slate-900 border border-slate-800/90 hover:border-slate-700/90 rounded-3xl shadow-xl hover:shadow-2xl transition-all duration-300 flex flex-col group ${showMenu ? 'z-30' : 'z-0'}`}>
      {/* Background Image Preview Header */}
      <div className="relative aspect-video w-full bg-slate-950 overflow-hidden rounded-t-3xl border-b border-slate-800/80">
        {isCustomImage ? (
          <img
            src={backgroundUrl}
            alt={theme.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            referrerPolicy="no-referrer"
            onError={(e) => {
              // fallback if broken url
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

        {/* Status Badge (Top-Left) */}
        {theme.status === 'draft' && (
          <div className="absolute top-3 left-3 z-10">
            <span className="px-3 py-1 rounded-full bg-slate-950/80 text-amber-300 border border-amber-500/40 text-xs font-semibold flex items-center gap-1.5 shadow-md backdrop-blur-md">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
              <span>Draft</span>
            </span>
          </div>
        )}
        {theme.status === 'archived' && (
          <div className="absolute top-3 left-3 z-10">
            <span className="px-3 py-1 rounded-full bg-slate-950/80 text-slate-400 border border-slate-700/80 text-xs font-semibold flex items-center gap-1.5 shadow-md backdrop-blur-md">
              <span className="w-1.5 h-1.5 rounded-full bg-slate-500" />
              <span>Archived</span>
            </span>
          </div>
        )}

        {/* Quick Play Hover Overlay */}
        <div
          onClick={() => onPlay(theme)}
          className="absolute inset-0 bg-slate-950/60 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center cursor-pointer backdrop-blur-[2px] z-10"
          title="Click to play game"
        >
          <div className="w-12 h-12 rounded-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 flex items-center justify-center shadow-2xl transform scale-90 group-hover:scale-100 transition-transform active:scale-95">
            <Play className="w-5 h-5 fill-current ml-0.5" />
          </div>
        </div>

        {/* Quick Catcher Preview Overlay (Bottom-Right) */}
        {theme.basket_config?.imageUrl && (
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
              onClick={() => onEdit(theme.id)}
              className="text-base font-black text-slate-100 group-hover:text-amber-400 transition-colors cursor-pointer line-clamp-1"
              title={theme.name}
            >
              {theme.name}
            </h3>

            {/* More Actions Menu Button */}
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
                    <span className="whitespace-nowrap">Play Game</span>
                  </button>

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

                  {!isOnlyTheme && (
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
          </div>

          <p className="text-xs text-slate-400 line-clamp-1">
            {theme.branding?.gameTitle || theme.description || 'Event game theme customization'}
          </p>

          {/* Theme Meta Pills */}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <span className="text-[11px] font-medium text-slate-400 bg-slate-950/80 px-2.5 py-1 rounded-lg border border-slate-800 flex items-center gap-1.5">
              <Sparkles className="w-3 h-3 text-amber-400" />
              <span>{itemsCount} Collectibles</span>
            </span>

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

        {/* Primary Action Buttons: Play Game + Edit Theme */}
        <div className="pt-2 border-t border-slate-800/80 flex items-center gap-2">
          <button
            type="button"
            onClick={() => onPlay(theme)}
            className="flex-1 py-2.5 bg-emerald-500 hover:bg-emerald-400 active:scale-[0.98] text-slate-950 font-black text-xs rounded-xl transition-all shadow-md shadow-emerald-500/10 flex items-center justify-center gap-1.5"
            title="Play game with this theme"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>Play Game</span>
          </button>

          <button
            type="button"
            onClick={() => onEdit(theme.id)}
            className="px-3.5 py-2.5 bg-slate-800 hover:bg-slate-700 active:scale-[0.98] text-slate-200 hover:text-white font-bold text-xs rounded-xl transition-all border border-slate-700 flex items-center justify-center gap-1.5"
            title="Customize theme settings"
          >
            <Edit3 className="w-3.5 h-3.5 text-amber-400" />
            <span>Edit</span>
          </button>
        </div>
      </div>
    </div>
  );
};
