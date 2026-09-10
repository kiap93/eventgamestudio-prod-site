import React, { useState, useMemo } from 'react';
import {
  GameTheme,
  isReactionTheme,
} from '../../../themes';
import {
  ReactionGameConfig,
  DEFAULT_REACTION_CONFIG,
} from '../../../games/reaction-time/types';
import { reactionSounds } from '../../../games/reaction-time/reactionSounds';
import { ResultScreenVisualEditor } from './ResultScreenVisualEditor';
import { StartScreenVisualEditorModal } from './start-editor/StartScreenVisualEditorModal';
import { StartScreenRenderer } from '../../../games/shared/StartScreenRenderer';
import { getStartScreenConfig } from '../../../games/shared/startScreenResolver';
import { StartScreenConfig } from '../../../games/shared/startScreenTypes';
import {
  Zap,
  Clock,
  Sliders,
  Sparkles,
  Volume2,
  AlertTriangle,
  Play,
  RotateCcw,
  Palette,
  CheckCircle2,
  Maximize2,
  ExternalLink,
} from 'lucide-react';

interface ReactionGameCustomizerProps {
  theme: GameTheme;
  onChange: (updated: GameTheme) => void;
}

export const ReactionGameGameplayCustomizer: React.FC<ReactionGameCustomizerProps> = ({
  theme,
  onChange,
}) => {
  const currentConfig: ReactionGameConfig = {
    ...DEFAULT_REACTION_CONFIG,
    ...((theme.game_config as ReactionGameConfig) || {}),
  };

  const updateConfig = (updates: Partial<ReactionGameConfig>) => {
    const nextConfig = {
      ...currentConfig,
      ...updates,
    };
    onChange({
      ...theme,
      game_config: nextConfig as any,
    });
  };

  return (
    <div className="space-y-6">
      {/* Round & Sequence Timing Card */}
      <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-5 space-y-4">
        <div className="flex items-center gap-2 text-amber-400">
          <Clock className="w-5 h-5" />
          <h3 className="font-bold text-sm text-slate-100 uppercase tracking-wide">
            Test Rounds & Timing Rules
          </h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Number of Rounds */}
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1.5">
              Rounds Count: <span className="text-amber-400 font-mono">{currentConfig.roundsCount}</span>
            </label>
            <input
              type="range"
              min={1}
              max={10}
              step={1}
              value={currentConfig.roundsCount}
              onChange={(e) => updateConfig({ roundsCount: parseInt(e.target.value, 10) })}
              className="w-full accent-amber-500"
            />
            <div className="flex justify-between text-[10px] text-slate-500 mt-1 font-mono">
              <span>1 (Fast)</span>
              <span>5 (Standard)</span>
              <span>10 (Thorough)</span>
            </div>
          </div>

          {/* Number of Gantry Lights */}
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1.5">
              Gantry Lights: <span className="text-amber-400 font-mono">{currentConfig.lightCount} Lights</span>
            </label>
            <input
              type="range"
              min={3}
              max={5}
              step={1}
              value={currentConfig.lightCount}
              onChange={(e) => updateConfig({ lightCount: parseInt(e.target.value, 10) })}
              className="w-full accent-amber-500"
            />
            <div className="flex justify-between text-[10px] text-slate-500 mt-1 font-mono">
              <span>3 Lights</span>
              <span>4 Lights</span>
              <span>5 (F1 Classic)</span>
            </div>
          </div>

          {/* Sequence Interval */}
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1.5">
              Sequence Light Interval:{' '}
              <span className="text-amber-400 font-mono">{currentConfig.sequenceIntervalMs}ms</span>
            </label>
            <input
              type="range"
              min={400}
              max={1500}
              step={50}
              value={currentConfig.sequenceIntervalMs}
              onChange={(e) => updateConfig({ sequenceIntervalMs: parseInt(e.target.value, 10) })}
              className="w-full accent-amber-500"
            />
            <div className="flex justify-between text-[10px] text-slate-500 mt-1 font-mono">
              <span>400ms (Rapid)</span>
              <span>1000ms (Classic)</span>
              <span>1500ms (Deliberate)</span>
            </div>
          </div>

          {/* False Start Penalty Rule */}
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1.5">
              False Start / Jump Rule
            </label>
            <select
              value={currentConfig.falseStartRule}
              onChange={(e) => updateConfig({ falseStartRule: e.target.value as any })}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-amber-500 font-mono"
            >
              <option value="retry">Retry Round (Discard Jump Start)</option>
              <option value="penalty_1000ms">+1000ms Penalty Added</option>
              <option value="disqualify">Mark Round as Disqualified</option>
            </select>
          </div>
        </div>

        {/* Min & Max Random Delay */}
        <div className="pt-2 border-t border-slate-800/80">
          <label className="block text-xs font-semibold text-slate-400 mb-2">
            Random Delay Window Before GO:{' '}
            <span className="text-amber-400 font-mono">
              {currentConfig.minRandomDelayMs}ms — {currentConfig.maxRandomDelayMs}ms
            </span>
          </label>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <span className="text-[10px] text-slate-500 font-mono">Minimum Delay</span>
              <input
                type="number"
                min={500}
                max={3000}
                step={100}
                value={currentConfig.minRandomDelayMs}
                onChange={(e) =>
                  updateConfig({
                    minRandomDelayMs: Math.max(500, parseInt(e.target.value, 10) || 1000),
                  })
                }
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-slate-200 mt-1 font-mono"
              />
            </div>
            <div>
              <span className="text-[10px] text-slate-500 font-mono">Maximum Delay</span>
              <input
                type="number"
                min={1500}
                max={6000}
                step={100}
                value={currentConfig.maxRandomDelayMs}
                onChange={(e) =>
                  updateConfig({
                    maxRandomDelayMs: Math.max(
                      currentConfig.minRandomDelayMs + 500,
                      parseInt(e.target.value, 10) || 3000
                    ),
                  })
                }
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-slate-200 mt-1 font-mono"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Visual Light Styling Card */}
      <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-5 space-y-4">
        <div className="flex items-center gap-2 text-rose-400">
          <Palette className="w-5 h-5" />
          <h3 className="font-bold text-sm text-slate-100 uppercase tracking-wide">
            Gantry Lights Visual Design
          </h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Bulb Shape */}
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1.5">
              Bulb Shape
            </label>
            <select
              value={currentConfig.lightShape}
              onChange={(e) => updateConfig({ lightShape: e.target.value as any })}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-rose-500 font-mono"
            >
              <option value="circle">Circular Lens (Classic)</option>
              <option value="rounded">Rounded Square</option>
              <option value="pill">Vertical Capsule / Pill</option>
            </select>
          </div>

          {/* Go Signal Behavior */}
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1.5">
              Go Signal Action
            </label>
            <select
              value={currentConfig.lightGoBehavior}
              onChange={(e) => updateConfig({ lightGoBehavior: e.target.value as any })}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-rose-500 font-mono"
            >
              <option value="all-off">Lights Out (Formula 1 Standard)</option>
              <option value="all-green">All Turn Green</option>
            </select>
          </div>

          {/* Active Color */}
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1.5">
              Illuminated Bulb Color
            </label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={currentConfig.lightActiveColor || '#ef4444'}
                onChange={(e) => updateConfig({ lightActiveColor: e.target.value })}
                className="w-8 h-8 rounded-lg cursor-pointer bg-transparent border-0"
              />
              <span className="font-mono text-xs text-slate-300">
                {currentConfig.lightActiveColor || '#ef4444'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Audio Synthesis Preview Card */}
      <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-emerald-400">
            <Volume2 className="w-5 h-5" />
            <h3 className="font-bold text-sm text-slate-100 uppercase tracking-wide">
              Web Audio Sound Effects
            </h3>
          </div>
          <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300">
            <input
              type="checkbox"
              checked={currentConfig.soundEnabled}
              onChange={(e) => updateConfig({ soundEnabled: e.target.checked })}
              className="rounded accent-emerald-500"
            />
            <span>Audio Enabled</span>
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-2">
          <button
            onClick={() => reactionSounds.playLightTick(0)}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-mono rounded-xl border border-slate-700 flex items-center gap-1.5 transition-colors"
          >
            <Play className="w-3 h-3 text-rose-400" />
            <span>Light 1 Tick</span>
          </button>
          <button
            onClick={() => reactionSounds.playLightTick(4)}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-mono rounded-xl border border-slate-700 flex items-center gap-1.5 transition-colors"
          >
            <Play className="w-3 h-3 text-rose-400" />
            <span>Light 5 Tick</span>
          </button>
          <button
            onClick={() => reactionSounds.playGoChime()}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-mono rounded-xl border border-slate-700 flex items-center gap-1.5 transition-colors"
          >
            <Play className="w-3 h-3 text-emerald-400" />
            <span>Lights Out Chime</span>
          </button>
          <button
            onClick={() => reactionSounds.playFalseStart()}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-mono rounded-xl border border-slate-700 flex items-center gap-1.5 transition-colors"
          >
            <Play className="w-3 h-3 text-amber-400" />
            <span>False Start Buzz</span>
          </button>
          <button
            onClick={() => reactionSounds.playCelebration()}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-mono rounded-xl border border-slate-700 flex items-center gap-1.5 transition-colors"
          >
            <Play className="w-3 h-3 text-purple-400" />
            <span>Victory Fanfare</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export const ReactionScreensCustomizer: React.FC<{
  theme: GameTheme;
  onChange: (updated: GameTheme) => void;
  onUploadAsset?: (file: File, fieldKey: string) => Promise<string>;
  uploadingAsset?: string | null;
}> = ({ theme, onChange, onUploadAsset }) => {
  const [activeSubTab, setActiveSubTab] = useState<'start' | 'result'>('start');
  const [isStartEditorModalOpen, setIsStartEditorModalOpen] = useState(false);

  const reactionConfig: ReactionGameConfig = {
    ...DEFAULT_REACTION_CONFIG,
    ...((theme.game_config as ReactionGameConfig) || {}),
  };

  const reactionGameMeta = useMemo(() => ({
    roundsCount: reactionConfig.roundsCount || 5,
    lightCount: 5,
    duration: 30,
    gameTitle: theme.name || 'Reaction Tap',
    logoUrl: theme.branding?.clientLogoUrl || theme.clientLogo || theme.logo || null,
  }), [reactionConfig.roundsCount, theme.name, theme.branding, theme.clientLogo, theme.logo]);

  const startConfig = getStartScreenConfig(theme, 'reaction-tap', reactionGameMeta, { width: 1024, height: 576 });

  const resultConfig = reactionConfig.screens?.result || theme.screens?.result || {
    background: { type: 'solid', color: '#070b14' },
    elements: [],
  };

  const handleUpdateStartConfig = (updated: Partial<StartScreenConfig>) => {
    const nextStart = {
      ...startConfig,
      ...updated,
      canvas: updated.canvas || startConfig.canvas || { width: 1024, height: 576, coordinateSpace: 'landscape-1024x576', version: 2 },
    };
    const nextReactionConfig = {
      ...reactionConfig,
      screens: {
        ...(reactionConfig.screens || {}),
        start: nextStart,
      },
    };
    onChange({
      ...theme,
      game_config: nextReactionConfig as any,
      screens: {
        ...(theme.screens || {}),
        start: nextStart as any,
      },
    });
  };

  const handleUpdateResultConfig = (updated: any) => {
    const nextResult = {
      ...resultConfig,
      ...updated,
    };
    const nextReactionConfig = {
      ...reactionConfig,
      screens: {
        ...(reactionConfig.screens || {}),
        result: nextResult,
      },
    };
    onChange({
      ...theme,
      game_config: nextReactionConfig as any,
      screens: {
        ...(theme.screens || {}),
        result: nextResult as any,
      },
    });
  };

  return (
    <div className="space-y-6">
      {/* Subtabs Header */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveSubTab('start')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
              activeSubTab === 'start'
                ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                : 'bg-slate-900 text-slate-400 hover:text-slate-200 hover:bg-slate-800/80 border border-slate-800'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Start Screen Canvas</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab('result')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
              activeSubTab === 'result'
                ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                : 'bg-slate-900 text-slate-400 hover:text-slate-200 hover:bg-slate-800/80 border border-slate-800'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Result Screen Canvas</span>
          </button>
        </div>
      </div>

      {activeSubTab === 'start' ? (
        <div className="space-y-6">
          <div className="bg-slate-900/80 border border-slate-800/90 rounded-2xl p-6 relative overflow-hidden">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Palette className="w-4 h-4 text-amber-400" />
                  <span>Start Screen Visual Canvas Editor</span>
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Design the landing screen layout, start button, badges, and background using the 1024×576 visual canvas editor.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsStartEditorModalOpen(true)}
                className="px-4 py-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold text-xs rounded-xl shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2 transition-all cursor-pointer"
              >
                <Maximize2 className="w-4 h-4" />
                <span>Open Start Screen Editor</span>
              </button>
            </div>

            {/* Live Scaled Preview Frame */}
            <div className="flex flex-col items-center justify-center p-4 bg-slate-950/60 rounded-xl border border-slate-800/80">
              <div className="w-full max-w-[500px] aspect-[16/9] rounded-xl overflow-hidden border border-slate-700/60 shadow-2xl relative">
                <StartScreenRenderer
                  config={startConfig}
                  theme={theme}
                  gameType="reaction-tap"
                  targetDimensions={{ width: 1024, height: 576 }}
                  gameMeta={reactionGameMeta}
                  onStartGame={() => {}}
                  isSimulation={true}
                />
              </div>
              <span className="text-[11px] text-slate-500 mt-2 font-mono">
                Interactive Scaled Canvas Preview (1024 × 576)
              </span>
            </div>
          </div>

          <StartScreenVisualEditorModal
            isOpen={isStartEditorModalOpen}
            onClose={() => setIsStartEditorModalOpen(false)}
            startConfig={startConfig}
            theme={theme}
            gameType="reaction-tap"
            gameMeta={reactionGameMeta}
            onChange={handleUpdateStartConfig}
            onUploadAsset={onUploadAsset as any}
          />
        </div>
      ) : (
        <ResultScreenVisualEditor
          resultConfig={resultConfig as any}
          theme={theme}
          gameType="reaction-tap"
          onChange={handleUpdateResultConfig}
          onUploadAsset={onUploadAsset}
        />
      )}
    </div>
  );
};
