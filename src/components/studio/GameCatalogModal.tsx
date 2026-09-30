import React, { useState, useEffect } from 'react';
import { getAllGameDefinitions } from '../../games/registry';
import { getGameTypeIcon } from '../../games';
import { apiFetch } from '../../lib/api';
import { Gamepad2, Zap, Grid3X3, HelpCircle, Users, Clock, CheckCircle2, Sparkles, X, RefreshCw, Play } from 'lucide-react';
import { useLocalization } from '../../context/LocalizationContext';

interface GameCatalogModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedGameType?: string;
  onSelectGame?: (gameId: string) => void;
  onPlayDemo?: (gameId: string) => void;
}

interface PlatformGameItem {
  id: string;
  name: string;
  slug: string;
  game_type: string;
  description?: string | null;
  icon_name?: string | null;
  status: string;
  theme_count?: number;
}

export const GameCatalogModal: React.FC<GameCatalogModalProps> = ({
  isOpen,
  onClose,
  selectedGameType = 'catch-brand',
  onSelectGame,
  onPlayDemo,
}) => {
  const { t } = useLocalization();
  const [platformGames, setPlatformGames] = useState<PlatformGameItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    const fetchGames = async () => {
      try {
        setLoading(true);
        const res = await apiFetch('/api/games');
        if (res.ok) {
          const data = await res.json();
          setPlatformGames(data.games || []);
        }
      } catch (err) {
        console.error('Failed to load registered games for catalog:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchGames();
  }, [isOpen]);

  if (!isOpen) return null;

  const staticDefs = getAllGameDefinitions();

  const getIcon = (iconName?: string | null) => {
    switch (iconName) {
      case 'Zap':
        return <Zap className="w-5 h-5" />;
      case 'Grid3X3':
        return <Grid3X3 className="w-5 h-5" />;
      case 'HelpCircle':
        return <HelpCircle className="w-5 h-5" />;
      default:
        return <Gamepad2 className="w-5 h-5" />;
    }
  };

  // Combine registered games from Supabase with static engine definitions for enriched display
  const displayGames = platformGames.length > 0
    ? platformGames.map((pg) => {
        const matchingDef = staticDefs.find((d) => d.id === pg.game_type || d.id === pg.slug);
        return {
          id: pg.id,
          name: pg.name,
          slug: pg.slug,
          gameType: pg.game_type,
          description: pg.description || matchingDef?.description || 'Custom interactive brand game.',
          iconName: pg.icon_name || matchingDef?.iconName || (pg.game_type === 'reaction-tap' ? 'Zap' : pg.game_type === 'memory-match' ? 'Grid3X3' : pg.game_type === 'catch-brand' ? 'ShoppingBasket' : 'Gamepad2'),
          isAvailable: pg.status === 'active' && (matchingDef ? matchingDef.isAvailable : false),
          themeCount: pg.theme_count ?? 0,
          minPlayers: matchingDef?.minPlayers || 1,
          maxPlayers: matchingDef?.maxPlayers || 1,
          duration: matchingDef?.defaultDurationSeconds || 20,
          category: matchingDef?.category || 'Arcade',
        };
      })
    : staticDefs.map((def) => ({
        id: def.id,
        name: def.name,
        slug: def.id,
        gameType: def.id,
        description: def.description,
        iconName: def.iconName,
        isAvailable: def.isAvailable,
        themeCount: 1,
        minPlayers: def.minPlayers,
        maxPlayers: def.maxPlayers,
        duration: def.defaultDurationSeconds,
        category: def.category,
      }));

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-3xl w-full p-6 sm:p-8 shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-500/10 border border-amber-500/30 rounded-2xl text-amber-400">
              <Sparkles className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl sm:text-2xl font-black text-slate-100">Multi-Game Platform Catalog</h2>
              <p className="text-xs text-slate-400">Available interactive game engines registered by Developer / Admin</p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label={t('common.close')}
            className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Loading Indicator */}
        {loading ? (
          <div className="py-12 text-center text-slate-400 flex items-center justify-center gap-2">
            <RefreshCw className="w-5 h-5 animate-spin text-amber-400" />
            <span className="text-xs">Loading registered platform games...</span>
          </div>
        ) : (
          /* Game Cards Grid */
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {displayGames.map((game) => {
              const isCurrent = game.gameType === selectedGameType || game.id === selectedGameType;

              return (
                <div
                  key={game.id}
                  onClick={() => {
                    if (game.isAvailable && onSelectGame) {
                      onSelectGame(game.id);
                      onClose();
                    }
                  }}
                  className={`p-5 rounded-2xl border transition-all relative flex flex-col justify-between space-y-4 ${
                    isCurrent
                      ? 'bg-amber-500/10 border-amber-500/50 shadow-lg shadow-amber-500/5'
                      : game.isAvailable
                      ? 'bg-slate-950/60 border-slate-800 hover:border-slate-700 cursor-pointer'
                      : 'bg-slate-950/30 border-slate-800/60 opacity-75'
                  }`}
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-amber-400">
                        {getGameTypeIcon(game.gameType || game.iconName || game.slug, 'w-5 h-5')}
                      </div>
                      {isCurrent ? (
                        <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> ACTIVE ENGINE
                        </span>
                      ) : !game.isAvailable ? (
                        <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-slate-800 text-slate-400 border border-slate-700">
                          INACTIVE
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                          AVAILABLE ({game.themeCount} {game.themeCount === 1 ? 'Theme' : 'Themes'})
                        </span>
                      )}
                    </div>

                    <h3 className="font-bold text-base text-slate-100">{game.name}</h3>
                    <p className="text-xs text-slate-400 leading-relaxed">{game.description}</p>
                  </div>

                  <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400 gap-2">
                    <span className="flex items-center gap-1">
                      <Users className="w-3.5 h-3.5 text-slate-500" />
                      {game.minPlayers === game.maxPlayers ? `${game.minPlayers} Player` : `${game.minPlayers}-${game.maxPlayers} Players`}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-slate-500" />
                      {game.duration}s Default
                    </span>
                    {game.isAvailable && onPlayDemo ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onPlayDemo(game.gameType || game.slug || game.id);
                        }}
                        className="px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-[10px] flex items-center gap-1 transition-all cursor-pointer shadow-xs"
                      >
                        <Play className="w-2.5 h-2.5 fill-slate-950" />
                        <span>{t('landing.tryDemo')}</span>
                      </button>
                    ) : (
                      <span className="uppercase text-[9px] font-bold px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-400">
                        {game.category}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Footer */}
        <div className="flex justify-end pt-2">
          <button
            onClick={onClose}
            className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs rounded-xl transition-colors cursor-pointer"
          >
            {t('common.close')}
          </button>
        </div>
      </div>
    </div>
  );
};

