import React, { useState } from 'react';
import { GameTheme } from '../../../themes';
import { useLocalization } from '../../../context/LocalizationContext';
import {
  Match3GameConfig,
  Match3Objective,
  DEFAULT_MATCH3_CONFIG,
  DEFAULT_TILE_DEFINITIONS,
  TileVisualDefinition,
} from '../../../games/match-3/types';
import { match3Sounds } from '../../../games/match-3/match3Sounds';
import {
  Sparkles,
  Clock,
  Grid,
  Zap,
  Bomb,
  Rocket,
  Flame,
  Shuffle,
  Trophy,
  Sliders,
  CheckCircle2,
  Diamond,
  Hexagon,
  Shield,
  Sun,
  Circle,
  Droplet,
  Heart,
  Star,
  Upload,
  Image as ImageIcon,
  Trash2,
  Crown,
  Boxes,
  Volume2,
  VolumeX,
  Target,
  Play,
  Square,
  Music,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  HelpCircle,
} from 'lucide-react';

interface Match3CustomizerProps {
  theme: GameTheme;
  onChange: (updated: GameTheme) => void;
  onUploadAsset?: (file: File, fieldKey: string) => Promise<string>;
  uploadingAsset?: string | null;
}

const AVAILABLE_SYMBOLS = [
  { id: 'Diamond', label: 'Diamond', icon: Diamond },
  { id: 'Hexagon', label: 'Hexagon', icon: Hexagon },
  { id: 'Shield', label: 'Shield', icon: Shield },
  { id: 'Sun', label: 'Sun', icon: Sun },
  { id: 'Circle', label: 'Orb', icon: Circle },
  { id: 'Droplet', label: 'Teardrop', icon: Droplet },
  { id: 'Heart', label: 'Heart', icon: Heart },
  { id: 'Star', label: 'Star', icon: Star },
  { id: 'Sparkles', label: 'Sparkles', icon: Sparkles },
  { id: 'Zap', label: 'Lightning', icon: Zap },
  { id: 'Crown', label: 'Crown', icon: Crown },
];

/**
 * Match-3 Gameplay Customizer (rendered in Theme Editor -> Gameplay tab)
 */
export const Match3GameplayCustomizer: React.FC<Match3CustomizerProps> = ({
  theme,
  onChange,
}) => {
  const { t } = useLocalization();

  const currentConfig: Match3GameConfig = {
    ...DEFAULT_MATCH3_CONFIG,
    ...((theme.game_config as Match3GameConfig) || {}),
  };

  const rawTileDefs: TileVisualDefinition[] = DEFAULT_TILE_DEFINITIONS.map((def, idx) => {
    const existing = (theme.game_config as any)?.tileDefinitions?.[idx];
    return existing ? { ...def, ...existing } : def;
  });

  const activeTileDefs = rawTileDefs.slice(0, currentConfig.tileTypesCount || 6);

  const currentObjective: Match3Objective = {
    type: 'score',
    targetScore: 10000,
    targetTileType: 'tile-01',
    targetCollectCount: 30,
    targetHazardCount: currentConfig.hazardConfig?.initialCount || 3,
    ...(currentConfig.objective || {}),
  };

  const updateConfig = (updates: Partial<Match3GameConfig>) => {
    const nextConfig: Match3GameConfig = {
      ...currentConfig,
      ...updates,
    };
    if (typeof onChange === 'function') {
      onChange({
        ...theme,
        physics_config: {
          ...(theme.physics_config || {}),
          gameDurationSeconds: nextConfig.gameDurationSeconds,
        },
        game_config: nextConfig as any,
      });
    }
  };

  const updateObjective = (updates: Partial<Match3Objective>) => {
    const nextObjective: Match3Objective = {
      ...currentObjective,
      ...updates,
    };

    // If switching to remove objective and hazards are currently disabled, enable them
    let nextHazardConfig = currentConfig.hazardConfig;
    if (updates.type === 'remove' && (!nextHazardConfig || !nextHazardConfig.enabled)) {
      nextHazardConfig = {
        ...(nextHazardConfig || DEFAULT_MATCH3_CONFIG.hazardConfig),
        enabled: true,
      };
    }

    updateConfig({
      objective: nextObjective,
      ...(nextHazardConfig ? { hazardConfig: nextHazardConfig } : {}),
    });
  };

  const updateScoring = (updates: Partial<typeof currentConfig.scoring>) => {
    updateConfig({
      scoring: {
        ...currentConfig.scoring,
        ...updates,
      },
    });
  };

  return (
    <div className="space-y-6">
      {/* 1. Core Match Rules & Timing */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6 space-y-5 shadow-lg">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-amber-500/10 border border-amber-500/30 rounded-2xl text-amber-400">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm sm:text-base font-bold text-slate-100">
              {t('studio.match3RulesTitle', undefined, 'Match-3 Round Rules & Duration')}
            </h3>
            <p className="text-xs text-slate-400">
              {t('studio.match3RulesDesc', undefined, 'Configure round countdown, grid board dimension, and tile palette count')}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Game Duration */}
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-amber-400" />
                Duration
              </span>
              <span className="text-amber-400 font-bold font-mono text-sm">
                {currentConfig.gameDurationSeconds}s
              </span>
            </div>
            <input
              type="range"
              min={20}
              max={180}
              step={5}
              value={currentConfig.gameDurationSeconds}
              onChange={(e) => updateConfig({ gameDurationSeconds: parseInt(e.target.value, 10) })}
              className="w-full accent-amber-500"
            />
            <div className="flex justify-between text-[10px] text-slate-500 font-mono">
              <span>30s Fast</span>
              <span>60s Standard</span>
              <span>120s Extended</span>
            </div>
          </div>

          {/* Grid Size */}
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <Grid className="w-3.5 h-3.5 text-cyan-400" />
                Grid Dimension
              </span>
              <span className="text-cyan-400 font-bold font-mono text-sm">
                {currentConfig.cols} × {currentConfig.rows}
              </span>
            </div>
            <select
              value={`${currentConfig.cols}x${currentConfig.rows}`}
              onChange={(e) => {
                const [cols, rows] = e.target.value.split('x').map(Number);
                updateConfig({ cols, rows });
              }}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-slate-200 outline-none focus:border-cyan-400"
            >
              <option value="6x6">6 × 6 (Quick / Compact)</option>
              <option value="7x7">7 × 7 (Balanced)</option>
              <option value="8x8">8 × 8 (Classic Standard)</option>
              <option value="9x9">9 × 9 (Expert Wide)</option>
            </select>
            <p className="text-[10px] text-slate-500">
              8×8 is the universal tournament standard.
            </p>
          </div>

          {/* Tile Types Count */}
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                Tile Palette
              </span>
              <span className="text-purple-400 font-bold font-mono text-sm">
                {currentConfig.tileTypesCount} Types
              </span>
            </div>
            <input
              type="range"
              min={4}
              max={8}
              step={1}
              value={currentConfig.tileTypesCount}
              onChange={(e) => updateConfig({ tileTypesCount: parseInt(e.target.value, 10) })}
              className="w-full accent-purple-500"
            />
            <div className="flex justify-between text-[10px] text-slate-500 font-mono">
              <span>4 (Easy combos)</span>
              <span>6 (Default)</span>
              <span>8 (Challenging)</span>
            </div>
          </div>

          {/* Minimum Match Requirement */}
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <Boxes className="w-3.5 h-3.5 text-emerald-400" />
                Minimum Match
              </span>
              <span className="text-emerald-400 font-bold font-mono text-sm">
                {currentConfig.minimumMatch || 3} in a row
              </span>
            </div>
            <select
              value={currentConfig.minimumMatch || 3}
              onChange={(e) => updateConfig({ minimumMatch: parseInt(e.target.value, 10) || 3 })}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-slate-200 outline-none focus:border-emerald-400"
            >
              <option value={3}>3 in a row (Classic standard)</option>
              <option value={4}>4 in a row (Challenging)</option>
              <option value={5}>5 in a row (Hardcore line-clear)</option>
            </select>
            <p className="text-[10px] text-slate-500">
              Minimum adjacent tiles required to clear.
            </p>
          </div>
        </div>
      </div>

      {/* 2. Round Objective & Victory Conditions */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6 space-y-5 shadow-lg">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-amber-500/10 border border-amber-500/30 rounded-2xl text-amber-400">
            <Target className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm sm:text-base font-bold text-slate-100">
              Round Objective & Victory Condition
            </h3>
            <p className="text-xs text-slate-400">
              Select the primary gameplay goal that determines player victory before the timer expires
            </p>
          </div>
        </div>

        {/* Objective Type Selector Pills */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <button
            type="button"
            onClick={() => updateObjective({ type: 'score' })}
            className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-2 ${
              currentObjective.type === 'score'
                ? 'bg-amber-500/15 border-amber-500/70 text-slate-100 ring-2 ring-amber-400/40 shadow-lg'
                : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold flex items-center gap-2">
                <Trophy className="w-4 h-4 text-amber-400" />
                Target Score
              </span>
              {currentObjective.type === 'score' && (
                <CheckCircle2 className="w-4 h-4 text-amber-400" />
              )}
            </div>
            <p className="text-[11px] text-slate-400 leading-snug">
              Achieve a high score milestone before round time expires.
            </p>
          </button>

          <button
            type="button"
            onClick={() => updateObjective({ type: 'collect' })}
            className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-2 ${
              currentObjective.type === 'collect'
                ? 'bg-amber-500/15 border-amber-500/70 text-slate-100 ring-2 ring-amber-400/40 shadow-lg'
                : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-purple-400" />
                Item Collection
              </span>
              {currentObjective.type === 'collect' && (
                <CheckCircle2 className="w-4 h-4 text-purple-400" />
              )}
            </div>
            <p className="text-[11px] text-slate-400 leading-snug">
              Collect a quota of specific branded tiles or product icons.
            </p>
          </button>

          <button
            type="button"
            onClick={() => updateObjective({ type: 'remove' })}
            className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-2 ${
              currentObjective.type === 'remove'
                ? 'bg-amber-500/15 border-amber-500/70 text-slate-100 ring-2 ring-amber-400/40 shadow-lg'
                : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold flex items-center gap-2">
                <Shield className="w-4 h-4 text-rose-400" />
                Clear Obstacles
              </span>
              {currentObjective.type === 'remove' && (
                <CheckCircle2 className="w-4 h-4 text-rose-400" />
              )}
            </div>
            <p className="text-[11px] text-slate-400 leading-snug">
              Clear all stone, ice, or bubble obstacles from the grid.
            </p>
          </button>
        </div>

        {/* Detailed Controls for Selected Objective */}
        {currentObjective.type === 'score' && (
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-200 flex items-center gap-2">
                <Trophy className="w-4 h-4 text-amber-400" />
                Score Milestone Goal
              </span>
              <span className="text-amber-400 font-mono font-bold text-sm">
                {(currentObjective.targetScore || 10000).toLocaleString()} pts
              </span>
            </div>
            <div className="flex items-center gap-3">
              <input
                type="number"
                min={1000}
                max={100000}
                step={1000}
                value={currentObjective.targetScore || 10000}
                onChange={(e) =>
                  updateObjective({ targetScore: parseInt(e.target.value, 10) || 10000 })
                }
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-amber-400 font-mono font-bold outline-none focus:border-amber-400"
              />
              <div className="flex gap-1.5 shrink-0">
                {[5000, 10000, 25000, 50000].map((val) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => updateObjective({ targetScore: val })}
                    className="px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg text-[10px] font-mono text-slate-300 font-bold transition-colors cursor-pointer"
                  >
                    {(val / 1000)}k
                  </button>
                ))}
              </div>
            </div>
            <p className="text-[11px] text-slate-500">
              When the round timer ends or target score is reached, victory is awarded and celebrated on the tournament result screen.
            </p>
          </div>
        )}

        {currentObjective.type === 'collect' && (
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4">
            <div className="space-y-2">
              <span className="text-xs font-bold text-slate-200 block">
                Target Collection Tile
              </span>
              <p className="text-[11px] text-slate-400">
                Choose which item sprite or branded tile players must match and gather:
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2 pt-1">
                {activeTileDefs.map((tile) => {
                  const isSelected = (currentObjective.targetTileType || 'tile-01') === tile.id;
                  const IconComp = AVAILABLE_SYMBOLS.find((s) => s.id === tile.symbol)?.icon || Diamond;
                  return (
                    <button
                      key={tile.id}
                      type="button"
                      onClick={() => updateObjective({ targetTileType: tile.id })}
                      className={`p-2.5 rounded-xl border flex flex-col items-center gap-1.5 transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-purple-500/20 border-purple-400 ring-2 ring-purple-400/40 text-purple-300 shadow-md'
                          : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {(() => {
                        const hasTileCustomSprite = Boolean(
                          tile.imageUrl &&
                          typeof tile.imageUrl === 'string' &&
                          tile.imageUrl.trim() !== ''
                        );
                        return (
                          <div
                            className="w-9 h-9 rounded-lg flex items-center justify-center overflow-hidden"
                            style={{
                              background: hasTileCustomSprite ? 'transparent' : tile.bgColor,
                              borderColor: hasTileCustomSprite ? 'transparent' : tile.borderColor,
                              borderWidth: hasTileCustomSprite ? '0px' : '1px',
                              borderStyle: 'solid',
                            }}
                          >
                            {hasTileCustomSprite ? (
                              <img
                                src={tile.imageUrl!}
                                alt={tile.name}
                                className="w-full h-full object-cover pointer-events-none select-none"
                              />
                            ) : (
                              <IconComp className="w-5 h-5 text-white" />
                            )}
                          </div>
                        );
                      })()}
                      <span className="text-[10px] font-bold truncate max-w-full">{tile.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2 pt-2 border-t border-slate-800/80">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-200">
                  Collection Quota Target
                </span>
                <span className="text-purple-400 font-mono font-bold text-sm">
                  {currentObjective.targetCollectCount || 30} Tiles
                </span>
              </div>
              <input
                type="range"
                min={10}
                max={100}
                step={5}
                value={currentObjective.targetCollectCount || 30}
                onChange={(e) =>
                  updateObjective({ targetCollectCount: parseInt(e.target.value, 10) || 30 })
                }
                className="w-full accent-purple-500"
              />
              <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                <span>15 Casual</span>
                <span>30 Standard</span>
                <span>60 Challenge</span>
              </div>
            </div>
          </div>
        )}

        {currentObjective.type === 'remove' && (
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4">
            <div className="flex items-start gap-3 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-xs text-amber-300">
              <Shield className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                Obstacle removal objective requires board hazards to be active. Hazards have been automatically enabled in your theme configuration.
              </span>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-200">
                  Target Obstacles to Remove
                </span>
                <span className="text-rose-400 font-mono font-bold text-sm">
                  {currentObjective.targetHazardCount || 3} Obstacles
                </span>
              </div>
              <input
                type="range"
                min={1}
                max={Math.max(1, currentConfig.hazardConfig?.initialCount || 8)}
                step={1}
                value={Math.min(
                  currentObjective.targetHazardCount || 3,
                  currentConfig.hazardConfig?.initialCount || 8
                )}
                onChange={(e) =>
                  updateObjective({ targetHazardCount: parseInt(e.target.value, 10) || 3 })
                }
                className="w-full accent-rose-500"
              />
              <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                <span>1 Quick</span>
                <span>3 Balanced</span>
                <span>{currentConfig.hazardConfig?.initialCount || 8} Full Clear</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 3. Gameplay Mechanics & Special Features Toggles */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6 space-y-5 shadow-lg">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl text-emerald-400">
            <Sliders className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm sm:text-base font-bold text-slate-100">
              Gameplay Mechanics & Special Tiles
            </h3>
            <p className="text-xs text-slate-400">
              Control cascades, chain combos, special tile generation, and dead-end shuffles
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Cascades / Gravity */}
          <div className="flex items-center justify-between p-4 bg-slate-950 border border-slate-800 rounded-2xl">
            <div className="space-y-0.5">
              <span className="text-xs font-bold text-slate-200 block">Cascading Gravity</span>
              <p className="text-[11px] text-slate-400">
                New tiles drop automatically to fill cleared gaps and chain matches
              </p>
            </div>
            <input
              type="checkbox"
              checked={currentConfig.cascadeEnabled}
              onChange={(e) => updateConfig({ cascadeEnabled: e.target.checked })}
              className="w-5 h-5 accent-emerald-500 cursor-pointer"
            />
          </div>

          {/* Combos */}
          <div className="flex items-center justify-between p-4 bg-slate-950 border border-slate-800 rounded-2xl">
            <div className="space-y-0.5">
              <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                <Flame className="w-3.5 h-3.5 text-rose-400" />
                Chain Combos & Multipliers
              </span>
              <p className="text-[11px] text-slate-400">
                Reward players with increasing point multipliers for consecutive cascades
              </p>
            </div>
            <input
              type="checkbox"
              checked={currentConfig.comboEnabled}
              onChange={(e) => updateConfig({ comboEnabled: e.target.checked })}
              className="w-5 h-5 accent-emerald-500 cursor-pointer"
            />
          </div>

          {/* Special Tiles */}
          <div className="flex items-center justify-between p-4 bg-slate-950 border border-slate-800 rounded-2xl">
            <div className="space-y-0.5">
              <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-amber-400" />
                Special Tiles (Rockets, Bombs, Color Bombs)
              </span>
              <p className="text-[11px] text-slate-400">
                Create 4-tile Rockets, T/L Bombs, and 5-tile Color Bombs
              </p>
            </div>
            <input
              type="checkbox"
              checked={currentConfig.specialTilesEnabled}
              onChange={(e) => updateConfig({ specialTilesEnabled: e.target.checked })}
              className="w-5 h-5 accent-emerald-500 cursor-pointer"
            />
          </div>

          {/* Auto-Shuffle when no moves */}
          <div className="flex items-center justify-between p-4 bg-slate-950 border border-slate-800 rounded-2xl">
            <div className="space-y-0.5">
              <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                <Shuffle className="w-3.5 h-3.5 text-cyan-400" />
                Auto-Shuffle When No Moves
              </span>
              <p className="text-[11px] text-slate-400">
                Automatically reshuffle the board when player has no valid swaps remaining
              </p>
            </div>
            <input
              type="checkbox"
              checked={currentConfig.shuffleWhenNoMoves}
              onChange={(e) => updateConfig({ shuffleWhenNoMoves: e.target.checked })}
              className="w-5 h-5 accent-emerald-500 cursor-pointer"
            />
          </div>
        </div>
      </div>

      {/* 4. Authoritative Scoring & Multipliers */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6 space-y-5 shadow-lg">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-amber-500/10 border border-amber-500/30 rounded-2xl text-amber-400">
            <Trophy className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm sm:text-base font-bold text-slate-100">
              Deterministic Scoring Configuration
            </h3>
            <p className="text-xs text-slate-400">
              Configure points awarded for matches, special tile detonations, and combo multipliers
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
          <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-1">
            <span className="text-[10px] text-slate-400 font-bold block uppercase">3-Match</span>
            <input
              type="number"
              min={10}
              max={1000}
              value={currentConfig.scoring.match3Points}
              onChange={(e) => updateScoring({ match3Points: parseInt(e.target.value, 10) || 100 })}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-amber-400 font-mono font-bold"
            />
          </div>

          <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-1">
            <span className="text-[10px] text-slate-400 font-bold block uppercase">4-Match</span>
            <input
              type="number"
              min={20}
              max={2000}
              value={currentConfig.scoring.match4Points}
              onChange={(e) => updateScoring({ match4Points: parseInt(e.target.value, 10) || 180 })}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-amber-400 font-mono font-bold"
            />
          </div>

          <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-1">
            <span className="text-[10px] text-slate-400 font-bold block uppercase">5-Match</span>
            <input
              type="number"
              min={50}
              max={5000}
              value={currentConfig.scoring.match5Points}
              onChange={(e) => updateScoring({ match5Points: parseInt(e.target.value, 10) || 300 })}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-amber-400 font-mono font-bold"
            />
          </div>

          <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-1">
            <span className="text-[10px] text-slate-400 font-bold block uppercase">Rocket Clear</span>
            <input
              type="number"
              min={20}
              max={3000}
              value={currentConfig.scoring.rocketPoints}
              onChange={(e) => updateScoring({ rocketPoints: parseInt(e.target.value, 10) || 250 })}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-amber-400 font-mono font-bold"
            />
          </div>

          <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-1">
            <span className="text-[10px] text-slate-400 font-bold block uppercase">Bomb Detonate</span>
            <input
              type="number"
              min={20}
              max={3000}
              value={currentConfig.scoring.bombPoints}
              onChange={(e) => updateScoring({ bombPoints: parseInt(e.target.value, 10) || 250 })}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-amber-400 font-mono font-bold"
            />
          </div>

          <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-1">
            <span className="text-[10px] text-slate-400 font-bold block uppercase">Color Bomb</span>
            <input
              type="number"
              min={50}
              max={5000}
              value={currentConfig.scoring.colorBombPoints}
              onChange={(e) => updateScoring({ colorBombPoints: parseInt(e.target.value, 10) || 500 })}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-amber-400 font-mono font-bold"
            />
          </div>
        </div>

        {/* Combo Multipliers Breakdown */}
        <div className="p-4 bg-slate-950/80 border border-slate-800 rounded-2xl flex flex-wrap items-center justify-between gap-3 text-xs">
          <span className="font-bold text-slate-300">Cascade Multipliers:</span>
          <div className="flex flex-wrap items-center gap-2 font-mono">
            <span className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 text-slate-300">
              Combo 1: <strong>1.0×</strong>
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400">
              Combo 2: <strong>1.5×</strong>
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-orange-500/10 border border-orange-500/30 text-orange-400">
              Combo 3: <strong>2.0×</strong>
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400">
              Combo 4: <strong>2.5×</strong>
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-purple-500/20 border border-purple-500/40 text-purple-300 font-black">
              Combo 5+: <strong>3.0×</strong>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

/**
 * Match-3 Tiles Customizer (rendered in Theme Editor -> Items tab)
 */
export const Match3TilesCustomizer: React.FC<Match3CustomizerProps> = ({
  theme,
  onChange,
  onUploadAsset,
  uploadingAsset,
}) => {
  const { t } = useLocalization();

  const currentConfig: Match3GameConfig = {
    ...DEFAULT_MATCH3_CONFIG,
    ...((theme.game_config as Match3GameConfig) || {}),
  };

  const rawTileDefs: TileVisualDefinition[] = DEFAULT_TILE_DEFINITIONS.map((def, idx) => {
    const existing = (theme.game_config as any)?.tileDefinitions?.[idx];
    return existing ? { ...def, ...existing } : def;
  });

  const activeTileDefs = rawTileDefs.slice(0, currentConfig.tileTypesCount || 6);

  const [selectedTileIndex, setSelectedTileIndex] = useState<number>(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isLocalUploading, setIsLocalUploading] = useState<boolean>(false);
  const selectedTile = activeTileDefs[selectedTileIndex] || activeTileDefs[0];

  const updateTile = (index: number, updates: Partial<TileVisualDefinition>) => {
    const nextDefs = [...rawTileDefs];
    nextDefs[index] = {
      ...nextDefs[index],
      ...updates,
    };

    const nextConfig: Match3GameConfig = {
      ...currentConfig,
      tileDefinitions: nextDefs,
    };

    if (typeof onChange === 'function') {
      onChange({
        ...theme,
        game_config: nextConfig as any,
      });
    }
  };

  const handleUploadImage = async (file: File) => {
    setUploadError(null);
    if (!file) return;

    // Prevent duplicate upload submissions
    if (isLocalUploading || uploadingAsset === `m3_tile_${selectedTileIndex}`) {
      return;
    }

    // Allowed extensions and MIME types
    const allowedExtensions = ['.svg', '.png', '.jpg', '.jpeg', '.webp'];
    const allowedMimeTypes = ['image/svg+xml', 'image/png', 'image/jpeg', 'image/webp', 'image/jpg'];

    const dotIdx = file.name.lastIndexOf('.');
    const ext = dotIdx !== -1 ? file.name.slice(dotIdx).toLowerCase() : '';
    const mime = (file.type || '').toLowerCase();

    const isExtAllowed = allowedExtensions.includes(ext);
    const isMimeAllowed = !mime || allowedMimeTypes.includes(mime);

    if (!isExtAllowed || !isMimeAllowed) {
      setUploadError(
        'Unsupported file format. Please upload an SVG, PNG, JPG/JPEG, or WEBP image (.svg, .png, .jpg, .jpeg, .webp).'
      );
      return;
    }

    // 10MB client-side limit
    const maxSizeBytes = 10 * 1024 * 1024;
    if (file.size > maxSizeBytes) {
      const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
      setUploadError(`File is too large (${sizeMb}MB). Maximum allowed tile image size is 10MB.`);
      return;
    }

    if (typeof onUploadAsset !== 'function') {
      setUploadError('Asset uploader is not available.');
      return;
    }

    setIsLocalUploading(true);
    try {
      const fieldKey = `m3_tile_${selectedTileIndex}`;
      const uploadResult = await onUploadAsset(file, fieldKey);

      // Support both string URL and object response { url, path }
      let publicUrl: string | null = null;
      let storagePath: string | undefined = undefined;

      if (typeof uploadResult === 'string' && uploadResult.trim()) {
        publicUrl = uploadResult.trim();
      } else if (uploadResult && typeof uploadResult === 'object') {
        const candidate = (uploadResult as any).url || (uploadResult as any).publicUrl;
        if (typeof candidate === 'string' && candidate.trim()) {
          publicUrl = candidate.trim();
        }
        if ((uploadResult as any).path) {
          storagePath = (uploadResult as any).path;
        }
      }

      if (!publicUrl) {
        throw new Error('Upload succeeded but no valid image URL was returned.');
      }

      // Update the tile definition, preserving existing properties and adding imageUrl & imagePath
      updateTile(selectedTileIndex, {
        imageUrl: publicUrl,
        ...(storagePath ? { imagePath: storagePath } : {}),
      });
      setUploadError(null);
    } catch (err: any) {
      setUploadError(`Upload failed: ${err.message || 'Network error'}`);
    } finally {
      setIsLocalUploading(false);
    }
  };

  const renderIcon = (name: string, className: string = 'w-5 h-5') => {
    const found = AVAILABLE_SYMBOLS.find((s) => s.id === name);
    const Comp = found?.icon || Diamond;
    return <Comp className={className} />;
  };

  const isUploadingThisTile = isLocalUploading || uploadingAsset === `m3_tile_${selectedTileIndex}`;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-lg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-amber-500/10 border border-amber-500/30 rounded-2xl text-amber-400">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm sm:text-base font-bold text-slate-100">
              Match-3 Tile Palette & Artwork
            </h3>
            <p className="text-xs text-slate-400">
              Customize colors, symbols, or upload custom branded icons/product sprites for each tile type
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="px-3 py-1.5 rounded-xl text-xs font-bold bg-amber-500/10 border border-amber-500/30 text-amber-400">
            {activeTileDefs.length} Active Tile Types
          </span>
        </div>
      </div>

      {/* Tiles Carousel / Selector */}
      <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3">
        {activeTileDefs.map((tile, idx) => {
          const isSelected = idx === selectedTileIndex;
          return (
            <div
              key={tile.id}
              onClick={() => {
                setSelectedTileIndex(idx);
                setUploadError(null);
              }}
              className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex flex-col items-center gap-2.5 select-none ${
                isSelected
                  ? 'bg-amber-500/10 border-amber-500/60 shadow-lg shadow-amber-500/10 scale-102 ring-2 ring-amber-400/40'
                  : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
              }`}
            >
              {(() => {
                const hasTileCustomSprite = Boolean(
                  tile.imageUrl &&
                  typeof tile.imageUrl === 'string' &&
                  tile.imageUrl.trim() !== ''
                );
                return (
                  <div
                    className={`w-14 h-14 rounded-xl flex items-center justify-center relative overflow-hidden ${
                      hasTileCustomSprite ? '' : 'shadow-md'
                    }`}
                    style={{
                      background: hasTileCustomSprite ? 'transparent' : tile.bgColor,
                      borderColor: hasTileCustomSprite ? 'transparent' : tile.borderColor,
                      borderWidth: hasTileCustomSprite ? '0px' : '2px',
                      borderStyle: 'solid',
                      boxShadow: hasTileCustomSprite ? 'none' : `0 4px 10px ${tile.glowColor}`,
                    }}
                  >
                    {hasTileCustomSprite ? (
                      <img
                        src={tile.imageUrl!}
                        alt={tile.name}
                        className="w-full h-full object-cover pointer-events-none select-none"
                      />
                    ) : (
                      <div className="text-white drop-shadow">
                        {renderIcon(tile.symbol, 'w-7 h-7 stroke-[2.5]')}
                      </div>
                    )}
                  </div>
                );
              })()}
              <div className="text-center w-full">
                <span className="text-xs font-bold text-slate-200 block truncate">
                  {tile.name}
                </span>
                <span className="text-[10px] text-slate-500 font-mono block">
                  #{idx + 1} • {tile.symbol}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Selected Tile Inspector Card */}
      {selectedTile && (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6 space-y-6 shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <div className="flex items-center gap-3">
              {(() => {
                const hasSelectedCustomSprite = Boolean(
                  selectedTile.imageUrl &&
                  typeof selectedTile.imageUrl === 'string' &&
                  selectedTile.imageUrl.trim() !== ''
                );
                return (
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center overflow-hidden ${
                      hasSelectedCustomSprite ? '' : 'text-white'
                    }`}
                    style={{
                      background: hasSelectedCustomSprite ? 'transparent' : selectedTile.bgColor,
                      borderColor: hasSelectedCustomSprite ? 'transparent' : selectedTile.borderColor,
                      borderWidth: hasSelectedCustomSprite ? '0px' : '2px',
                      borderStyle: 'solid',
                    }}
                  >
                    {hasSelectedCustomSprite ? (
                      <img
                        src={selectedTile.imageUrl!}
                        alt={selectedTile.name}
                        className="w-full h-full object-cover pointer-events-none select-none"
                      />
                    ) : (
                      renderIcon(selectedTile.symbol, 'w-5 h-5')
                    )}
                  </div>
                );
              })()}
              <div>
                <h4 className="text-sm font-bold text-slate-100">
                  Customizing: {selectedTile.name} (Tile #{selectedTileIndex + 1})
                </h4>
                <p className="text-xs text-slate-400">
                  Modify tile display name, geometric symbol, colors, or upload a custom image
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left: Metadata & Colors */}
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Tile Display Name
                </label>
                <input
                  type="text"
                  value={selectedTile.name}
                  onChange={(e) => updateTile(selectedTileIndex, { name: e.target.value })}
                  placeholder="e.g. Ruby Gem, Brand Soda, Golden Sneaker"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-100 outline-none focus:border-amber-400 font-medium"
                />
              </div>

              {/* Symbol Picker */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-2">
                  Geometric Symbol Icon
                </label>
                <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                  {AVAILABLE_SYMBOLS.map((s) => {
                    const isPicked = selectedTile.symbol === s.id;
                    const IconComp = s.icon;
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => updateTile(selectedTileIndex, { symbol: s.id })}
                        className={`p-2 rounded-xl border flex flex-col items-center gap-1 transition-all cursor-pointer ${
                          isPicked
                            ? 'bg-amber-500/20 border-amber-400 text-amber-300 shadow-md'
                            : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                        }`}
                        title={s.label}
                      >
                        <IconComp className="w-4 h-4" />
                        <span className="text-[9px] font-mono truncate max-w-full">{s.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Colors */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Accent Color
                  </label>
                  <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5">
                    <input
                      type="color"
                      value={selectedTile.color}
                      onChange={(e) => {
                        const c = e.target.value;
                        updateTile(selectedTileIndex, {
                          color: c,
                          bgColor: `linear-gradient(135deg, ${c}, ${c}dd)`,
                          borderColor: c,
                          glowColor: `${c}88`,
                        });
                      }}
                      className="w-6 h-6 rounded cursor-pointer border-none bg-transparent"
                    />
                    <span className="text-xs font-mono text-slate-300">{selectedTile.color}</span>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Glow Shadow Color
                  </label>
                  <input
                    type="text"
                    value={selectedTile.glowColor}
                    onChange={(e) => updateTile(selectedTileIndex, { glowColor: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-200 font-mono"
                  />
                </div>
              </div>
            </div>

            {/* Right: Custom Uploaded Artwork */}
            <div className="space-y-4 bg-slate-950 border border-slate-800 rounded-2xl p-5 flex flex-col justify-between">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                    <Upload className="w-4 h-4 text-amber-400" />
                    Custom Brand Tile Artwork
                  </span>
                  {selectedTile.imageUrl && (
                    <button
                      type="button"
                      onClick={() => updateTile(selectedTileIndex, { imageUrl: null })}
                      className="text-xs text-rose-400 hover:text-rose-300 flex items-center gap-1 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Remove Custom Sprite
                    </button>
                  )}
                </div>
                <p className="text-xs text-slate-400">
                  Upload an SVG, PNG, JPG/JPEG, or WEBP logo/sprite to replace the geometric shape with your branded asset.
                </p>
              </div>

              {/* Upload Drop Zone / Preview */}
              <div className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-slate-800 rounded-2xl bg-slate-900/40 relative">
                {isUploadingThisTile ? (
                  <div className="flex flex-col items-center gap-2 text-amber-400">
                    <div className="w-8 h-8 border-3 border-amber-400 border-t-transparent rounded-full animate-spin" />
                    <span className="text-xs font-bold">Uploading custom sprite...</span>
                  </div>
                ) : selectedTile.imageUrl ? (
                  <div className="flex flex-col items-center gap-2">
                    <img
                      src={selectedTile.imageUrl}
                      alt={selectedTile.name}
                      className="w-20 h-20 object-contain drop-shadow-lg"
                    />
                    <span className="text-xs font-bold text-emerald-400 flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Custom Sprite Active
                    </span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2 text-slate-500">
                    <ImageIcon className="w-10 h-10 opacity-50" />
                    <span className="text-xs text-slate-400">No custom sprite uploaded</span>
                  </div>
                )}

                <label className={`mt-4 px-4 py-2 bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-slate-950 font-bold text-xs rounded-xl shadow-md transition-all cursor-pointer ${isUploadingThisTile ? 'opacity-50 pointer-events-none' : ''}`}>
                  <span>{isUploadingThisTile ? 'Uploading...' : selectedTile.imageUrl ? 'Replace Artwork' : 'Upload Tile Sprite'}</span>
                  <input
                    type="file"
                    accept="image/svg+xml,image/png,image/jpeg,image/webp,.svg,.png,.jpg,.jpeg,.webp"
                    disabled={isUploadingThisTile}
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        handleUploadImage(file);
                        e.target.value = '';
                      }
                    }}
                  />
                </label>

                {uploadError && (
                  <div className="mt-3 p-2.5 bg-rose-500/10 border border-rose-500/30 rounded-xl flex items-start gap-2 text-rose-300 text-xs w-full">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
                    <span className="flex-1 leading-relaxed">{uploadError}</span>
                    <button
                      type="button"
                      onClick={() => setUploadError(null)}
                      className="text-rose-400 hover:text-rose-200 cursor-pointer ml-1 font-bold"
                      aria-label="Dismiss error"
                    >
                      ✕
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Special Tiles Visual Overview Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6 space-y-4 shadow-lg">
        <div className="flex items-center gap-2 text-slate-200">
          <Zap className="w-4 h-4 text-amber-400" />
          <h4 className="text-sm font-bold">Special Tiles Visual Guide</h4>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-2xl space-y-1.5">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-amber-500/20 text-amber-300 rounded-lg">
                <Rocket className="w-4 h-4 transform -rotate-90" />
              </div>
              <span className="text-xs font-bold text-slate-200">Horizontal Rocket</span>
            </div>
            <p className="text-[11px] text-slate-400">Created from 4 horizontal tiles. Clears entire row.</p>
          </div>

          <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-2xl space-y-1.5">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-amber-500/20 text-amber-300 rounded-lg">
                <Rocket className="w-4 h-4" />
              </div>
              <span className="text-xs font-bold text-slate-200">Vertical Rocket</span>
            </div>
            <p className="text-[11px] text-slate-400">Created from 4 vertical tiles. Clears entire column.</p>
          </div>

          <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-2xl space-y-1.5">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-rose-500/20 text-rose-300 rounded-lg">
                <Bomb className="w-4 h-4" />
              </div>
              <span className="text-xs font-bold text-slate-200">Explosive Bomb</span>
            </div>
            <p className="text-[11px] text-slate-400">Created from T or L matches. Clears 3×3 perimeter.</p>
          </div>

          <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-2xl space-y-1.5">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-purple-500/20 text-purple-300 rounded-lg">
                <Sparkles className="w-4 h-4" />
              </div>
              <span className="text-xs font-bold text-slate-200">Color Bomb</span>
            </div>
            <p className="text-[11px] text-slate-400">Created from 5 in a row. Clears all tiles of matching type.</p>
          </div>
        </div>
      </div>
    </div>
  );
};

/**
 * Match-3 Hazards Customizer (rendered in Theme Editor -> Hazards section or Gameplay tab)
 */
export const Match3HazardsCustomizer: React.FC<Match3CustomizerProps> = ({
  theme,
  onChange,
}) => {
  const currentConfig: Match3GameConfig = {
    ...DEFAULT_MATCH3_CONFIG,
    ...((theme.game_config as Match3GameConfig) || {}),
  };

  const hazardConfig = currentConfig.hazardConfig || DEFAULT_MATCH3_CONFIG.hazardConfig;

  const updateHazardConfig = (updates: Partial<typeof hazardConfig>) => {
    const nextHazard = {
      ...hazardConfig,
      ...updates,
    };
    const nextConfig: Match3GameConfig = {
      ...currentConfig,
      hazardConfig: nextHazard,
    };
    if (typeof onChange === 'function') {
      onChange({
        ...theme,
        game_config: nextConfig as any,
      });
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6 space-y-5 shadow-lg">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-rose-500/10 border border-rose-500/30 rounded-2xl text-rose-400">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm sm:text-base font-bold text-slate-100">
              Board Obstacles & Hazards
            </h3>
            <p className="text-xs text-slate-400">
              Configure impassable obstacle tiles (Stone, Ice, Bubble) cleared by adjacent matches or direct line matches
            </p>
          </div>
        </div>

        <label className="flex items-center gap-2 cursor-pointer bg-slate-950 px-3.5 py-1.5 rounded-xl border border-slate-800">
          <span className="text-xs font-bold text-slate-300">Enable Hazards</span>
          <input
            type="checkbox"
            checked={hazardConfig.enabled}
            onChange={(e) => updateHazardConfig({ enabled: e.target.checked })}
            className="w-4 h-4 accent-rose-500 cursor-pointer"
          />
        </label>
      </div>

      {hazardConfig.enabled && (
        <div className="space-y-4 pt-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Hazard Type */}
            <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-2">
              <span className="text-xs font-semibold text-slate-300 block">Hazard Type</span>
              <select
                value={hazardConfig.type}
                onChange={(e) => updateHazardConfig({ type: e.target.value as any })}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-slate-200 outline-none focus:border-rose-400"
              >
                <option value="stone">Stone Block (Solid Gray Obstacle)</option>
                <option value="ice">Ice Frost (Cyan Frost Shield)</option>
                <option value="bubble">Bubble Shield (Translucent Emerald)</option>
              </select>
              <p className="text-[10px] text-slate-500">
                Visual appearance and obstacle theme on the grid.
              </p>
            </div>

            {/* Initial Count */}
            <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-300">Initial Obstacles</span>
                <span className="text-rose-400 font-bold font-mono text-sm">
                  {hazardConfig.initialCount} Tiles
                </span>
              </div>
              <input
                type="range"
                min={1}
                max={8}
                step={1}
                value={hazardConfig.initialCount}
                onChange={(e) => updateHazardConfig({ initialCount: parseInt(e.target.value, 10) || 3 })}
                className="w-full accent-rose-500"
              />
              <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                <span>1 Light</span>
                <span>3 Balanced</span>
                <span>8 Heavy</span>
              </div>
            </div>

            {/* Clear Condition Selector */}
            <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-2">
              <span className="text-xs font-semibold text-slate-300 block">Clear Mechanic</span>
              <select
                value={hazardConfig.clearCondition || 'adjacent_match'}
                onChange={(e) => updateHazardConfig({ clearCondition: e.target.value as any })}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-slate-200 outline-none focus:border-rose-400"
              >
                <option value="adjacent_match">Adjacent Match Blast (Immovable)</option>
                <option value="direct_match">Direct Line Match (Swappable)</option>
              </select>
              <p className="text-[10px] text-slate-500">
                {hazardConfig.clearCondition === 'direct_match'
                  ? 'Hazard tile can be swapped and is cleared by 3+ match.'
                  : 'Obstacle blocks swapping; cleared by adjacent matches.'}
              </p>
            </div>

            {/* Points Penalty */}
            <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-300">Points Penalty</span>
                <span className="text-rose-400 font-bold font-mono text-sm">
                  {hazardConfig.pointsPenalty ? `-${hazardConfig.pointsPenalty} pts` : '0 pts'}
                </span>
              </div>
              <input
                type="number"
                min={0}
                max={500}
                step={25}
                value={hazardConfig.pointsPenalty || 0}
                onChange={(e) =>
                  updateHazardConfig({ pointsPenalty: Math.max(0, parseInt(e.target.value, 10) || 0) })
                }
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-slate-200 outline-none focus:border-rose-400 font-mono font-bold"
              />
              <p className="text-[10px] text-slate-500">
                Deducted from score when cleared (0 for no penalty).
              </p>
            </div>
          </div>

          {/* Mechanic Explanatory Banner */}
          <div className="p-3.5 bg-slate-950 border border-slate-800/80 rounded-2xl flex items-start gap-3 text-xs">
            <HelpCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <div className="space-y-1 text-slate-400">
              <p className="font-semibold text-slate-200">
                {hazardConfig.clearCondition === 'direct_match'
                  ? 'Direct Line Match Mechanics'
                  : 'Adjacent Match Blast Mechanics'}
              </p>
              <p className="text-[11px] leading-relaxed">
                {hazardConfig.clearCondition === 'direct_match'
                  ? 'Players can swap hazard-encased tiles with adjacent items. Making a line of 3 or more matching items clears the hazard and scores points. Special rockets and bombs also obliterate hazards in their path.'
                  : 'Hazard tiles act as stationary grid obstacles and cannot be swapped directly. Matching any adjacent tiles detonates the obstacle. Rocket and bomb blast shockwaves also destroy obstacle tiles.'}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * Match-3 Full Audio Settings Editor (rendered in Theme Editor -> Audio tab)
 */
export const Match3AudioEditor: React.FC<Match3CustomizerProps> = ({
  theme,
  onChange,
  onUploadAsset,
  uploadingAsset,
}) => {
  const { t } = useLocalization();

  const sounds = theme.sounds_config || {
    soundVolume: 0.8,
    sfxVolume: 1.0,
    bgmVolume: 0.8,
    soundEnabled: true,
    bgmEnabled: true,
    bgmUrl: null,
    swapUrl: null,
    matchUrl: null,
    bombUrl: null,
    specialUrl: null,
    hazardClearUrl: null,
    gameOverUrl: null,
  };

  const [isPlayingBgm, setIsPlayingBgm] = useState<boolean>(false);
  const [showCustomAudioUrls, setShowCustomAudioUrls] = useState<boolean>(false);
  const [activeUploadField, setActiveUploadField] = useState<string | null>(null);

  const [audioUploadError, setAudioUploadError] = useState<string | null>(null);

  const handleUpdateSounds = (updates: Partial<typeof sounds>) => {
    const nextSounds = {
      ...sounds,
      ...updates,
    };
    if (typeof onChange === 'function') {
      onChange({
        ...theme,
        sounds_config: nextSounds,
        game_config: {
          ...((theme.game_config as any) || {}),
          soundEnabled: nextSounds.soundEnabled,
          soundVolume: nextSounds.soundVolume,
          bgmEnabled: nextSounds.bgmEnabled,
        },
      });
    }

    // Sync directly into sound manager runtime
    match3Sounds.loadThemeSounds(nextSounds);
  };

  const handleToggleBgmSample = () => {
    if (isPlayingBgm) {
      match3Sounds.stopBgm();
      setIsPlayingBgm(false);
    } else {
      match3Sounds.loadThemeSounds(sounds);
      match3Sounds.startBgm();
      setIsPlayingBgm(true);
    }
  };

  const handleUploadAudio = async (file: File, soundKey: string) => {
    if (typeof onUploadAsset !== 'function') return;
    setAudioUploadError(null);
    try {
      setActiveUploadField(soundKey);
      const res = await onUploadAsset(file, soundKey);
      const url = typeof res === 'string' ? res : (res as any)?.url;
      if (url && typeof url === 'string') {
        handleUpdateSounds({ [soundKey]: url });
      }
    } catch (err: any) {
      setAudioUploadError(`Audio upload failed: ${err.message || 'Network error'}`);
    } finally {
      setActiveUploadField(null);
    }
  };

  const playPreview = (url: string | null | undefined, synthCallback: () => void) => {
    if (url && typeof Audio !== 'undefined') {
      try {
        const audio = new Audio(url);
        audio.volume = Math.max(0, Math.min(1, (sounds.soundVolume ?? 0.8) * (sounds.sfxVolume ?? 1.0)));
        audio.play().catch(() => synthCallback());
      } catch {
        synthCallback();
      }
    } else {
      synthCallback();
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. Master Audio Controls & Volume */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6 space-y-5 shadow-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-500/10 border border-amber-500/30 rounded-2xl text-amber-400">
              <Volume2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-slate-100">
                Match-3 Audio & Soundscape Engine
              </h3>
              <p className="text-xs text-slate-400">
                Zero-latency synthesized audio effects & background music arpeggiator
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleUpdateSounds({ soundEnabled: !sounds.soundEnabled })}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                sounds.soundEnabled
                  ? 'bg-emerald-600 text-slate-950 shadow-md'
                  : 'bg-slate-800 text-slate-400'
              }`}
            >
              {sounds.soundEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
              <span>{sounds.soundEnabled ? 'Audio Active' : 'All Muted'}</span>
            </button>
          </div>
        </div>

        {/* Volume Sliders Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Master Volume */}
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-2">
            <div className="flex justify-between items-center text-xs">
              <span className="font-semibold text-slate-300">Master Volume</span>
              <span className="text-amber-400 font-bold font-mono">
                {Math.round((sounds.soundVolume ?? 0.8) * 100)}%
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={sounds.soundVolume ?? 0.8}
              onChange={(e) =>
                handleUpdateSounds({
                  soundVolume: parseFloat(e.target.value) || 0.8,
                })
              }
              className="w-full accent-amber-500 cursor-pointer"
            />
            <p className="text-[10px] text-slate-500">Overall master output level.</p>
          </div>

          {/* Sound FX Volume */}
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-2">
            <div className="flex justify-between items-center text-xs">
              <span className="font-semibold text-slate-300">Sound FX Volume</span>
              <span className="text-purple-400 font-bold font-mono">
                {Math.round((sounds.sfxVolume ?? 1.0) * 100)}%
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={sounds.sfxVolume ?? 1.0}
              onChange={(e) =>
                handleUpdateSounds({
                  sfxVolume: parseFloat(e.target.value) || 1.0,
                })
              }
              className="w-full accent-purple-500 cursor-pointer"
            />
            <p className="text-[10px] text-slate-500">Swaps, chimes, bombs, and cascades.</p>
          </div>

          {/* Background Music Volume */}
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-2">
            <div className="flex justify-between items-center text-xs">
              <span className="font-semibold text-slate-300 flex items-center gap-1.5">
                <Music className="w-3.5 h-3.5 text-cyan-400" />
                BGM Arpeggiator
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => handleUpdateSounds({ bgmEnabled: !sounds.bgmEnabled })}
                  className={`px-2 py-0.5 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
                    sounds.bgmEnabled
                      ? 'bg-emerald-600 text-slate-950 shadow-sm'
                      : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  {sounds.bgmEnabled ? 'ON' : 'OFF'}
                </button>
                <button
                  type="button"
                  onClick={handleToggleBgmSample}
                  className={`px-2 py-0.5 rounded-lg text-[10px] font-bold flex items-center gap-1 transition-all cursor-pointer ${
                    isPlayingBgm
                      ? 'bg-rose-500 text-slate-100 animate-pulse'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  {isPlayingBgm ? <Square className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                  <span>{isPlayingBgm ? 'Stop' : 'Test'}</span>
                </button>
              </div>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={sounds.bgmVolume ?? 0.8}
              onChange={(e) =>
                handleUpdateSounds({
                  bgmVolume: parseFloat(e.target.value) || 0.8,
                })
              }
              className="w-full accent-cyan-500 cursor-pointer"
            />
            <p className="text-[10px] text-slate-500">Procedural pentatonic chiptune music.</p>
          </div>
        </div>
      </div>

      {/* 2. Interactive Sound Effects Tester */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6 space-y-4 shadow-lg">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-purple-500/10 border border-purple-500/30 rounded-2xl text-purple-400">
            <Zap className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm sm:text-base font-bold text-slate-100">Interactive Sound Event Previews</h3>
            <p className="text-xs text-slate-400">
              Test zero-latency Web Audio synthesizers and custom uploaded sound assets
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 pt-1">
          <button
            type="button"
            onClick={() => playPreview(sounds.swapUrl, () => match3Sounds.playSwap())}
            className="p-3 bg-slate-950 hover:bg-slate-800 active:scale-95 border border-slate-800 hover:border-amber-500/40 rounded-2xl flex flex-col items-center gap-1.5 text-center transition-all text-xs font-bold text-slate-200 cursor-pointer"
          >
            <Sparkles className="w-4 h-4 text-amber-400" />
            <span>Tile Swap</span>
          </button>

          <button
            type="button"
            onClick={() => playPreview(sounds.matchUrl, () => match3Sounds.playMatch(1))}
            className="p-3 bg-slate-950 hover:bg-slate-800 active:scale-95 border border-slate-800 hover:border-emerald-500/40 rounded-2xl flex flex-col items-center gap-1.5 text-center transition-all text-xs font-bold text-slate-200 cursor-pointer"
          >
            <Trophy className="w-4 h-4 text-emerald-400" />
            <span>Match Chime</span>
          </button>

          <button
            type="button"
            onClick={() => playPreview(sounds.specialUrl, () => match3Sounds.playRocket())}
            className="p-3 bg-slate-950 hover:bg-slate-800 active:scale-95 border border-slate-800 hover:border-sky-500/40 rounded-2xl flex flex-col items-center gap-1.5 text-center transition-all text-xs font-bold text-slate-200 cursor-pointer"
          >
            <Rocket className="w-4 h-4 text-sky-400" />
            <span>Rocket Fire</span>
          </button>

          <button
            type="button"
            onClick={() => playPreview(sounds.bombUrl, () => match3Sounds.playBomb())}
            className="p-3 bg-slate-950 hover:bg-slate-800 active:scale-95 border border-slate-800 hover:border-rose-500/40 rounded-2xl flex flex-col items-center gap-1.5 text-center transition-all text-xs font-bold text-slate-200 cursor-pointer"
          >
            <Bomb className="w-4 h-4 text-rose-400" />
            <span>Bomb Detonate</span>
          </button>

          <button
            type="button"
            onClick={() => playPreview(sounds.specialUrl, () => match3Sounds.playColorBomb())}
            className="p-3 bg-slate-950 hover:bg-slate-800 active:scale-95 border border-slate-800 hover:border-purple-500/40 rounded-2xl flex flex-col items-center gap-1.5 text-center transition-all text-xs font-bold text-slate-200 cursor-pointer"
          >
            <Sparkles className="w-4 h-4 text-purple-400" />
            <span>Color Bomb</span>
          </button>

          <button
            type="button"
            onClick={() => match3Sounds.playDoubleBombDetonation()}
            className="p-3 bg-slate-950 hover:bg-slate-800 active:scale-95 border border-slate-800 hover:border-rose-500/40 rounded-2xl flex flex-col items-center gap-1.5 text-center transition-all text-xs font-bold text-slate-200 cursor-pointer"
          >
            <Bomb className="w-4 h-4 text-rose-400" />
            <span>Mega Bomb</span>
          </button>

          <button
            type="button"
            onClick={() => match3Sounds.playDoubleRocketFire()}
            className="p-3 bg-slate-950 hover:bg-slate-800 active:scale-95 border border-slate-800 hover:border-cyan-500/40 rounded-2xl flex flex-col items-center gap-1.5 text-center transition-all text-xs font-bold text-slate-200 cursor-pointer"
          >
            <Rocket className="w-4 h-4 text-cyan-400" />
            <span>Crossfire Rocket</span>
          </button>

          <button
            type="button"
            onClick={() => match3Sounds.playShuffle()}
            className="p-3 bg-slate-950 hover:bg-slate-800 active:scale-95 border border-slate-800 hover:border-blue-500/40 rounded-2xl flex flex-col items-center gap-1.5 text-center transition-all text-xs font-bold text-slate-200 cursor-pointer"
          >
            <Shuffle className="w-4 h-4 text-blue-400" />
            <span>Board Shuffle</span>
          </button>

          <button
            type="button"
            onClick={() => playPreview(sounds.hazardClearUrl, () => match3Sounds.playHazardClear())}
            className="p-3 bg-slate-950 hover:bg-slate-800 active:scale-95 border border-slate-800 hover:border-emerald-500/40 rounded-2xl flex flex-col items-center gap-1.5 text-center transition-all text-xs font-bold text-slate-200 cursor-pointer"
          >
            <Shield className="w-4 h-4 text-emerald-400" />
            <span>Obstacle Clear</span>
          </button>

          <button
            type="button"
            onClick={() => playPreview(sounds.gameOverUrl, () => match3Sounds.playGameOver())}
            className="p-3 bg-slate-950 hover:bg-slate-800 active:scale-95 border border-slate-800 hover:border-orange-500/40 rounded-2xl flex flex-col items-center gap-1.5 text-center transition-all text-xs font-bold text-slate-200 cursor-pointer"
          >
            <Clock className="w-4 h-4 text-orange-400" />
            <span>Game Over</span>
          </button>
        </div>
      </div>

      {/* 3. Custom Audio Asset URLs & File Uploads */}
      <div className="border border-slate-800 rounded-3xl overflow-hidden bg-slate-950/60 shadow-lg">
        <button
          type="button"
          onClick={() => setShowCustomAudioUrls(!showCustomAudioUrls)}
          className="w-full px-5 py-4 bg-slate-900 hover:bg-slate-800/80 flex items-center justify-between text-xs font-bold text-slate-300 transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-2.5">
            <Music className="w-4 h-4 text-amber-400" />
            <span className="text-sm">Custom Audio Assets & Music Tracks (Optional)</span>
          </div>
          <div className="flex items-center gap-1.5 text-slate-400">
            <span className="text-xs font-normal">
              {showCustomAudioUrls ? 'Hide Options' : 'Show Advanced Audio Options'}
            </span>
            {showCustomAudioUrls ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </div>
        </button>

        {showCustomAudioUrls && (
          <div className="p-5 border-t border-slate-800 space-y-4 text-xs">
            <p className="text-xs text-slate-400">
              Provide direct URLs or upload your own MP3, WAV, or OGG audio files. If blank, zero-latency Web Audio synthesizer sound effects will play automatically.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Custom BGM */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                    <Music className="w-3.5 h-3.5 text-cyan-400" />
                    Custom Background Music (BGM)
                  </label>
                  {sounds.bgmUrl && (
                    <button
                      type="button"
                      onClick={() => handleUpdateSounds({ bgmUrl: null })}
                      className="text-[11px] text-rose-400 hover:text-rose-300 flex items-center gap-1 cursor-pointer"
                    >
                      <Trash2 className="w-3 h-3" /> Remove
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={sounds.bgmUrl || ''}
                    onChange={(e) => handleUpdateSounds({ bgmUrl: e.target.value })}
                    placeholder="https://example.com/soundtrack.mp3"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-slate-200 focus:border-cyan-400 outline-none text-xs"
                  />
                  <label className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl transition-all cursor-pointer shrink-0">
                    <span>{activeUploadField === 'm3_bgm' ? '...' : 'Upload'}</span>
                    <input
                      type="file"
                      accept="audio/mpeg,audio/mp3,audio/wav,audio/ogg"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleUploadAudio(f, 'm3_bgm');
                      }}
                    />
                  </label>
                </div>
              </div>

              {/* Custom Tile Swap */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                    Custom Tile Swap SFX
                  </label>
                  {sounds.swapUrl && (
                    <button
                      type="button"
                      onClick={() => handleUpdateSounds({ swapUrl: null })}
                      className="text-[11px] text-rose-400 hover:text-rose-300 flex items-center gap-1 cursor-pointer"
                    >
                      <Trash2 className="w-3 h-3" /> Remove
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={sounds.swapUrl || ''}
                    onChange={(e) => handleUpdateSounds({ swapUrl: e.target.value })}
                    placeholder="https://example.com/swap.mp3"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-slate-200 focus:border-amber-400 outline-none text-xs"
                  />
                  <label className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl transition-all cursor-pointer shrink-0">
                    <span>{activeUploadField === 'm3_swap' ? '...' : 'Upload'}</span>
                    <input
                      type="file"
                      accept="audio/mpeg,audio/mp3,audio/wav,audio/ogg"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleUploadAudio(f, 'm3_swap');
                      }}
                    />
                  </label>
                </div>
              </div>

              {/* Custom Match Chime */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                    <Trophy className="w-3.5 h-3.5 text-emerald-400" />
                    Custom Match Chime SFX
                  </label>
                  {sounds.matchUrl && (
                    <button
                      type="button"
                      onClick={() => handleUpdateSounds({ matchUrl: null })}
                      className="text-[11px] text-rose-400 hover:text-rose-300 flex items-center gap-1 cursor-pointer"
                    >
                      <Trash2 className="w-3 h-3" /> Remove
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={sounds.matchUrl || ''}
                    onChange={(e) => handleUpdateSounds({ matchUrl: e.target.value })}
                    placeholder="https://example.com/match.mp3"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-slate-200 focus:border-emerald-400 outline-none text-xs"
                  />
                  <label className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl transition-all cursor-pointer shrink-0">
                    <span>{activeUploadField === 'm3_match' ? '...' : 'Upload'}</span>
                    <input
                      type="file"
                      accept="audio/mpeg,audio/mp3,audio/wav,audio/ogg"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleUploadAudio(f, 'm3_match');
                      }}
                    />
                  </label>
                </div>
              </div>

              {/* Custom Bomb Detonation */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                    <Bomb className="w-3.5 h-3.5 text-rose-400" />
                    Custom Bomb Explosion SFX
                  </label>
                  {sounds.bombUrl && (
                    <button
                      type="button"
                      onClick={() => handleUpdateSounds({ bombUrl: null })}
                      className="text-[11px] text-rose-400 hover:text-rose-300 flex items-center gap-1 cursor-pointer"
                    >
                      <Trash2 className="w-3 h-3" /> Remove
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={sounds.bombUrl || ''}
                    onChange={(e) => handleUpdateSounds({ bombUrl: e.target.value })}
                    placeholder="https://example.com/bomb.mp3"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-slate-200 focus:border-rose-400 outline-none text-xs"
                  />
                  <label className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl transition-all cursor-pointer shrink-0">
                    <span>{activeUploadField === 'm3_bomb' ? '...' : 'Upload'}</span>
                    <input
                      type="file"
                      accept="audio/mpeg,audio/mp3,audio/wav,audio/ogg"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleUploadAudio(f, 'm3_bomb');
                      }}
                    />
                  </label>
                </div>
              </div>

              {/* Custom Obstacle Clear */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                    <Shield className="w-3.5 h-3.5 text-emerald-400" />
                    Custom Obstacle Clear SFX
                  </label>
                  {sounds.hazardClearUrl && (
                    <button
                      type="button"
                      onClick={() => handleUpdateSounds({ hazardClearUrl: null })}
                      className="text-[11px] text-rose-400 hover:text-rose-300 flex items-center gap-1 cursor-pointer"
                    >
                      <Trash2 className="w-3 h-3" /> Remove
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={sounds.hazardClearUrl || ''}
                    onChange={(e) => handleUpdateSounds({ hazardClearUrl: e.target.value })}
                    placeholder="https://example.com/break.mp3"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-slate-200 focus:border-emerald-400 outline-none text-xs"
                  />
                  <label className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl transition-all cursor-pointer shrink-0">
                    <span>{activeUploadField === 'm3_hazard' ? '...' : 'Upload'}</span>
                    <input
                      type="file"
                      accept="audio/mpeg,audio/mp3,audio/wav,audio/ogg"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleUploadAudio(f, 'm3_hazard');
                      }}
                    />
                  </label>
                </div>
              </div>

              {/* Custom Game Over Jingle */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-orange-400" />
                    Custom Game Over Jingle
                  </label>
                  {sounds.gameOverUrl && (
                    <button
                      type="button"
                      onClick={() => handleUpdateSounds({ gameOverUrl: null })}
                      className="text-[11px] text-rose-400 hover:text-rose-300 flex items-center gap-1 cursor-pointer"
                    >
                      <Trash2 className="w-3 h-3" /> Remove
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={sounds.gameOverUrl || ''}
                    onChange={(e) => handleUpdateSounds({ gameOverUrl: e.target.value })}
                    placeholder="https://example.com/gameover.mp3"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-slate-200 focus:border-orange-400 outline-none text-xs"
                  />
                  <label className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl transition-all cursor-pointer shrink-0">
                    <span>{activeUploadField === 'm3_gameover' ? '...' : 'Upload'}</span>
                    <input
                      type="file"
                      accept="audio/mpeg,audio/mp3,audio/wav,audio/ogg"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleUploadAudio(f, 'm3_gameover');
                      }}
                    />
                  </label>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

/**
 * Backward-compatible Match3AudioTester export
 */
export const Match3AudioTester: React.FC = () => {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-4 shadow-lg">
      <div className="flex items-center gap-2">
        <span className="p-2 bg-amber-500/10 text-amber-400 rounded-xl border border-amber-500/20">
          <Volume2 className="w-4 h-4" />
        </span>
        <div>
          <h3 className="text-sm font-bold text-slate-100">Match-3 Sound FX Previews</h3>
          <p className="text-xs text-slate-400">
            Synthesized zero-latency Web Audio sound effects crafted for cascade matching
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
        <button
          type="button"
          onClick={() => match3Sounds.playSwap()}
          className="p-3 bg-slate-950 hover:bg-slate-800 active:scale-95 border border-slate-800 hover:border-amber-500/40 rounded-2xl flex flex-col items-center gap-1.5 text-center transition-all text-xs font-bold text-slate-200 cursor-pointer"
        >
          <Sparkles className="w-4 h-4 text-amber-400" />
          <span>Tile Swap</span>
        </button>

        <button
          type="button"
          onClick={() => match3Sounds.playMatch(1)}
          className="p-3 bg-slate-950 hover:bg-slate-800 active:scale-95 border border-slate-800 hover:border-emerald-500/40 rounded-2xl flex flex-col items-center gap-1.5 text-center transition-all text-xs font-bold text-slate-200 cursor-pointer"
        >
          <Trophy className="w-4 h-4 text-emerald-400" />
          <span>Match Chime</span>
        </button>

        <button
          type="button"
          onClick={() => match3Sounds.playDoubleBombDetonation()}
          className="p-3 bg-slate-950 hover:bg-slate-800 active:scale-95 border border-slate-800 hover:border-rose-500/40 rounded-2xl flex flex-col items-center gap-1.5 text-center transition-all text-xs font-bold text-slate-200 cursor-pointer"
        >
          <Bomb className="w-4 h-4 text-rose-400" />
          <span>Mega Bomb Blast</span>
        </button>

        <button
          type="button"
          onClick={() => match3Sounds.playDoubleRocketFire()}
          className="p-3 bg-slate-950 hover:bg-slate-800 active:scale-95 border border-slate-800 hover:border-sky-500/40 rounded-2xl flex flex-col items-center gap-1.5 text-center transition-all text-xs font-bold text-slate-200 cursor-pointer"
        >
          <Rocket className="w-4 h-4 text-sky-400" />
          <span>Crossfire Rocket</span>
        </button>
      </div>
    </div>
  );
};
