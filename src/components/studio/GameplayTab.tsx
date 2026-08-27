import React, { useState } from 'react';
import { GameTheme, ThemeDifficultyStage } from '../../themes/types';
import {
  Zap,
  Clock,
  Gauge,
  Sliders,
  ChevronDown,
  ChevronUp,
  Info,
  Flame,
  Star,
  Activity,
} from 'lucide-react';

interface GameplayTabProps {
  theme: GameTheme;
  onChange: (updated: GameTheme) => void;
}

export const GameplayTab: React.FC<GameplayTabProps> = ({ theme, onChange }) => {
  const [showAdvancedPhysics, setShowAdvancedPhysics] = useState(false);

  const physics = theme.physics_config || {
    gameDurationSeconds: 20,
    fallSpeedMultiplier: 0.7,
    baseFallSpeed: 500,
    basketSpeed: 600,
    spawnIntervalMin: 550,
    spawnIntervalMax: 1000,
    difficultyStages: [],
  };

  const handleUpdatePhysics = (updates: Partial<typeof physics>) => {
    onChange({
      ...theme,
      physics_config: {
        ...physics,
        ...updates,
      },
    });
  };

  const handleUpdateStage = (
    index: number,
    updates: Partial<ThemeDifficultyStage>
  ) => {
    const currentStages = [...(physics.difficultyStages || [])];
    if (currentStages[index]) {
      currentStages[index] = { ...currentStages[index], ...updates };
      handleUpdatePhysics({ difficultyStages: currentStages });
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. CORE MATCH PACE & SPEEDS */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-5 shadow-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="p-2 bg-amber-500/10 text-amber-400 rounded-xl border border-amber-500/20">
              <Zap className="w-4 h-4" />
            </span>
            <div>
              <h3 className="text-sm font-bold text-slate-100">Match Dynamics & Speed</h3>
              <p className="text-xs text-slate-400">
                Adjust game session duration, falling velocity, and catcher responsiveness
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Match Duration */}
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-amber-400" />
                Match Duration
              </span>
              <span className="text-amber-400 font-bold font-mono text-sm">
                {physics.gameDurationSeconds || 20}s
              </span>
            </div>
            <input
              type="range"
              min="10"
              max="60"
              step="5"
              value={physics.gameDurationSeconds || 20}
              onChange={(e) =>
                handleUpdatePhysics({
                  gameDurationSeconds: parseInt(e.target.value) || 20,
                })
              }
              className="w-full accent-amber-500 cursor-pointer"
            />
            <p className="text-[11px] text-slate-500">
              Session length before time expires
            </p>
          </div>

          {/* Falling Speed Multiplier */}
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <Gauge className="w-3.5 h-3.5 text-emerald-400" />
                Fall Velocity
              </span>
              <span className="text-emerald-400 font-bold font-mono text-sm">
                {(Number(physics?.fallSpeedMultiplier) || 0.7).toFixed(2)}x
              </span>
            </div>
            <input
              type="range"
              min="0.3"
              max="1.8"
              step="0.05"
              value={physics.fallSpeedMultiplier || 0.7}
              onChange={(e) =>
                handleUpdatePhysics({
                  fallSpeedMultiplier: parseFloat(e.target.value) || 0.7,
                })
              }
              className="w-full accent-emerald-500 cursor-pointer"
            />
            <p className="text-[11px] text-slate-500">
              Global gravity and falling acceleration
            </p>
          </div>

          {/* Basket Movement Speed */}
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5 text-sky-400" />
                Catcher Speed
              </span>
              <span className="text-sky-400 font-bold font-mono text-sm">
                {physics.basketSpeed || 600} px/s
              </span>
            </div>
            <input
              type="range"
              min="300"
              max="1000"
              step="50"
              value={physics.basketSpeed || 600}
              onChange={(e) =>
                handleUpdatePhysics({
                  basketSpeed: parseInt(e.target.value) || 600,
                })
              }
              className="w-full accent-sky-500 cursor-pointer"
            />
            <p className="text-[11px] text-slate-500">
              Player horizontal responsiveness
            </p>
          </div>
        </div>
      </div>

      {/* 2. PROGRESSIVE DIFFICULTY ESCALATION */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-4 shadow-lg">
        <div>
          <h3 className="text-sm font-bold text-slate-100">Progressive Difficulty Escalation</h3>
          <p className="text-xs text-slate-400">
            As the match countdown ticks down, the game smoothly ramps up speed and spawn rates
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {(physics.difficultyStages || []).map((stage, idx) => (
            <div
              key={idx}
              className="bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-3 relative overflow-hidden"
            >
              <div className="flex items-center justify-between">
                <span className="px-2 py-0.5 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20 text-xs font-black">
                  Stage {idx + 1}
                </span>
                <span className="text-[11px] font-mono text-slate-400">
                  Starts at {stage.timeThreshold}s
                </span>
              </div>

              <div>
                <input
                  type="text"
                  value={stage.stageName || `Stage ${idx + 1}`}
                  onChange={(e) => handleUpdateStage(idx, { stageName: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs font-bold text-slate-200 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="space-y-2 text-[11px] text-slate-400 pt-1 border-t border-slate-800/80">
                <div className="flex justify-between">
                  <span>Spawn Delay:</span>
                  <span className="text-slate-200 font-mono font-bold">{stage.spawnInterval}ms</span>
                </div>
                <div className="flex justify-between">
                  <span>Item Speed Range:</span>
                  <span className="text-slate-200 font-mono">{stage.speedMin} - {stage.speedMax} px/s</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="flex items-center gap-1 text-rose-400">
                    <Flame className="w-3 h-3" /> Hazard Ratio:
                  </span>
                  <span className="text-rose-400 font-mono font-bold">
                    {Math.round((stage.hazardRatio || 0.2) * 100)}%
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="flex items-center gap-1 text-amber-400">
                    <Star className="w-3 h-3" /> Bonus Ratio:
                  </span>
                  <span className="text-amber-400 font-mono font-bold">
                    {Math.round((stage.bonusRatio || 0.05) * 100)}%
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 3. COLLAPSIBLE ADVANCED PHYSICS */}
      <div className="border border-slate-800 rounded-2xl overflow-hidden bg-slate-950/50">
        <button
          type="button"
          onClick={() => setShowAdvancedPhysics(!showAdvancedPhysics)}
          className="w-full px-4 py-3 bg-slate-950 hover:bg-slate-900/80 flex items-center justify-between text-xs font-bold text-slate-300 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Sliders className="w-3.5 h-3.5 text-amber-400" />
            <span>Advanced Physics & Stage Interval Overrides</span>
          </div>
          <div className="flex items-center gap-1 text-slate-400">
            <span className="text-[10px] font-normal">
              {showAdvancedPhysics ? 'Hide' : 'Show Advanced'}
            </span>
            {showAdvancedPhysics ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </div>
        </button>

        {showAdvancedPhysics && (
          <div className="p-4 border-t border-slate-800 space-y-4 text-xs">
            <div className="bg-slate-900/60 border border-slate-800 p-3 rounded-xl flex items-start gap-2.5 text-slate-400 text-[11px]">
              <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <span>
                Override base velocities and spawn bounds directly for custom game modes.
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-[11px] font-semibold text-slate-400">Base Fall Velocity (px/s)</label>
                <input
                  type="number"
                  value={physics.baseFallSpeed || 500}
                  onChange={(e) =>
                    handleUpdatePhysics({ baseFallSpeed: parseInt(e.target.value) || 500 })
                  }
                  className="w-full mt-1 bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-1.5 text-slate-200 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-400">Min Spawn Interval (ms)</label>
                <input
                  type="number"
                  value={physics.spawnIntervalMin || 550}
                  onChange={(e) =>
                    handleUpdatePhysics({ spawnIntervalMin: parseInt(e.target.value) || 550 })
                  }
                  className="w-full mt-1 bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-1.5 text-slate-200 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-400">Max Spawn Interval (ms)</label>
                <input
                  type="number"
                  value={physics.spawnIntervalMax || 1000}
                  onChange={(e) =>
                    handleUpdatePhysics({ spawnIntervalMax: parseInt(e.target.value) || 1000 })
                  }
                  className="w-full mt-1 bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-1.5 text-slate-200 focus:outline-none"
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
