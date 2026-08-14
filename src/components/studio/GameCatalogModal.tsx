import React from 'react';
import { getAllGameDefinitions } from '../../games/registry';
import { Gamepad2, Zap, Grid3X3, HelpCircle, Users, Clock, CheckCircle2, Sparkles, X } from 'lucide-react';

interface GameCatalogModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedGameType?: string;
}

export const GameCatalogModal: React.FC<GameCatalogModalProps> = ({
  isOpen,
  onClose,
  selectedGameType = 'catch-brand',
}) => {
  if (!isOpen) return null;

  const games = getAllGameDefinitions();

  const getIcon = (iconName: string) => {
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
              <p className="text-xs text-slate-400">Available interactive game engines and event formats</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-xl transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Game Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {games.map((game) => {
            const isCurrent = game.id === selectedGameType;

            return (
              <div
                key={game.id}
                className={`p-5 rounded-2xl border transition-all relative flex flex-col justify-between space-y-4 ${
                  isCurrent
                    ? 'bg-amber-500/10 border-amber-500/50 shadow-lg shadow-amber-500/5'
                    : game.isAvailable
                    ? 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                    : 'bg-slate-950/30 border-slate-800/60 opacity-75'
                }`}
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-amber-400">
                      {getIcon(game.iconName)}
                    </div>
                    {isCurrent ? (
                      <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" /> ACTIVE ENGINE
                      </span>
                    ) : game.comingSoon ? (
                      <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-slate-800 text-slate-400 border border-slate-700">
                        COMING SOON
                      </span>
                    ) : (
                      <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                        AVAILABLE
                      </span>
                    )}
                  </div>

                  <h3 className="font-bold text-base text-slate-100">{game.name}</h3>
                  <p className="text-xs text-slate-400 leading-relaxed">{game.description}</p>
                </div>

                <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
                  <span className="flex items-center gap-1">
                    <Users className="w-3.5 h-3.5 text-slate-500" />
                    {game.minPlayers === game.maxPlayers ? `${game.minPlayers} Player` : `${game.minPlayers}-${game.maxPlayers} Players`}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-slate-500" />
                    {game.defaultDurationSeconds}s Default
                  </span>
                  <span className="uppercase text-[9px] font-bold px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-400">
                    {game.category}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="flex justify-end pt-2">
          <button
            onClick={onClose}
            className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs rounded-xl transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
