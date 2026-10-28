import React, { useState, useMemo } from 'react';
import { GameTheme } from '../../../themes';
import { useLocalization } from '../../../context/LocalizationContext';
import {
  RandomTargetGameConfig,
  TargetDefinition,
  ToolDefinition,
  DEFAULT_DESERT_CONFIG,
  DEFAULT_OCEAN_CONFIG,
  isOceanTreasureHuntTheme,
  normalizeRandomTargetConfig,
} from '../../../games/random-target/types';
import { randomTargetSounds } from '../../../games/random-target/randomTargetSounds';
import {
  Crosshair,
  Clock,
  Sparkles,
  Zap,
  Volume2,
  VolumeX,
  AlertTriangle,
  Play,
  RotateCcw,
  Sliders,
  Shield,
  Upload,
  RefreshCw,
  Maximize2,
  Palette,
  Tv,
  CheckCircle2,
} from 'lucide-react';
import { ResultScreenVisualEditorModal, ResultScreenBasicEditor } from './result-editor';
import { ResultScreenRenderer } from '../../../games/shared/ResultScreenRenderer';
import { StartScreenVisualEditorModal } from './start-editor/StartScreenVisualEditorModal';
import { StartScreenRenderer } from '../../../games/shared/StartScreenRenderer';
import { StartScreenBasicEditor } from './start-editor/StartScreenBasicEditor';
import { getStartScreenConfig, saveStartScreenConfig } from '../../../games/shared/startScreenResolver';
import { StartScreenConfig } from '../../../games/shared/startScreenTypes';
import {
  ResultScreenConfig,
  DEFAULT_RESULT_SCREEN_CONFIG,
} from '../../../games/shared/resultScreenTypes';

interface RandomTargetCustomizerProps {
  theme: GameTheme;
  onChange: (updated: GameTheme) => void;
  onUploadAsset?: (file: File, fieldKey: string) => Promise<string>;
  uploadingAsset?: string | null;
}

const ALLOWED_MIME_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
const ALLOWED_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp'];

/**
 * Gameplay settings editor for Random Target Arcade
 */
export const RandomTargetGameplayCustomizer: React.FC<RandomTargetCustomizerProps> = ({
  theme,
  onChange,
}) => {
  const { t } = useLocalization();
  const isOceanTheme = isOceanTreasureHuntTheme(theme);
  const baseDefault = isOceanTheme ? DEFAULT_OCEAN_CONFIG : DEFAULT_DESERT_CONFIG;

  const currentConfig: RandomTargetGameConfig = useMemo(() => {
    return normalizeRandomTargetConfig(theme.game_config, baseDefault);
  }, [theme.game_config, baseDefault]);

  const updateConfig = (updates: Partial<RandomTargetGameConfig>) => {
    const nextConfig: RandomTargetGameConfig = {
      ...currentConfig,
      ...updates,
    };
    onChange({
      ...theme,
      physics_config: {
        ...(theme.physics_config || {}),
        gameDurationSeconds: nextConfig.gameDurationSeconds,
      },
      game_config: nextConfig as any,
    });
  };

  const [isPlayingSound, setIsPlayingSound] = useState<string | null>(null);

  const testSound = (name: string, fn: () => void) => {
    setIsPlayingSound(name);
    try {
      fn();
    } catch (err) {
      console.warn('Sound play failed:', err);
    }
    setTimeout(() => setIsPlayingSound(null), 400);
  };

  return (
    <div className="space-y-6">
      {/* Round & Timing Rules Card */}
      <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-5 space-y-4">
        <div className="flex items-center gap-2 text-amber-400">
          <Clock className="w-5 h-5" />
          <h3 className="font-bold text-sm text-slate-100 uppercase tracking-wide">
            {t('randomTarget.timingRules', undefined, 'Event Round & Timing Settings')}
          </h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Game Duration */}
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1.5">
              {t('randomTarget.gameDuration', undefined, 'Round Duration')}:{' '}
              <span className="text-amber-400 font-mono">{currentConfig.gameDurationSeconds}s</span>
            </label>
            <input
              type="range"
              min={15}
              max={90}
              step={5}
              value={currentConfig.gameDurationSeconds}
              onChange={(e) => updateConfig({ gameDurationSeconds: parseInt(e.target.value, 10) })}
              className="w-full accent-amber-500"
            />
            <div className="flex justify-between text-[10px] text-slate-500 mt-1 font-mono">
              <span>15s (Sprint)</span>
              <span>30s (Booth Standard)</span>
              <span>90s (Extended)</span>
            </div>
          </div>

          {/* Max Simultaneous Targets */}
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1.5">
              {t('randomTarget.maxTargets', undefined, 'Max Simultaneous Targets')}:{' '}
              <span className="text-amber-400 font-mono">{currentConfig.maxSimultaneousTargets}</span>
            </label>
            <input
              type="range"
              min={1}
              max={6}
              step={1}
              value={currentConfig.maxSimultaneousTargets}
              onChange={(e) => updateConfig({ maxSimultaneousTargets: parseInt(e.target.value, 10) })}
              className="w-full accent-amber-500"
            />
            <div className="flex justify-between text-[10px] text-slate-500 mt-1 font-mono">
              <span>1 (Single)</span>
              <span>4 (Standard)</span>
              <span>6 (Fast Reflex)</span>
            </div>
          </div>

          {/* Initial Spawn Interval */}
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1.5">
              {t('randomTarget.initialInterval', undefined, 'Initial Spawn Interval')}:{' '}
              <span className="text-amber-400 font-mono">{currentConfig.initialSpawnIntervalMs}ms</span>
            </label>
            <input
              type="range"
              min={500}
              max={2000}
              step={50}
              value={currentConfig.initialSpawnIntervalMs}
              onChange={(e) => updateConfig({ initialSpawnIntervalMs: parseInt(e.target.value, 10) })}
              className="w-full accent-amber-500"
            />
            <div className="flex justify-between text-[10px] text-slate-500 mt-1 font-mono">
              <span>500ms (Rapid)</span>
              <span>1100ms (Default)</span>
              <span>2000ms (Gentle)</span>
            </div>
          </div>

          {/* Minimum Spawn Interval */}
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1.5">
              {t('randomTarget.minInterval', undefined, 'Minimum Spawn Interval')}:{' '}
              <span className="text-amber-400 font-mono">{currentConfig.minSpawnIntervalMs}ms</span>
            </label>
            <input
              type="range"
              min={300}
              max={1000}
              step={50}
              value={currentConfig.minSpawnIntervalMs}
              onChange={(e) => updateConfig({ minSpawnIntervalMs: parseInt(e.target.value, 10) })}
              className="w-full accent-amber-500"
            />
            <div className="flex justify-between text-[10px] text-slate-500 mt-1 font-mono">
              <span>300ms (High Reflex)</span>
              <span>500ms (Default)</span>
              <span>1000ms (Easy)</span>
            </div>
          </div>

          {/* Target Visible Lifetime */}
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1.5">
              {t('randomTarget.targetLifetime', undefined, 'Target Visible Lifetime')}:{' '}
              <span className="text-amber-400 font-mono">{currentConfig.targetLifetimeMs}ms</span>
            </label>
            <input
              type="range"
              min={800}
              max={3000}
              step={100}
              value={currentConfig.targetLifetimeMs}
              onChange={(e) => updateConfig({ targetLifetimeMs: parseInt(e.target.value, 10) })}
              className="w-full accent-amber-500"
            />
            <div className="flex justify-between text-[10px] text-slate-500 mt-1 font-mono">
              <span>800ms (High Reflex)</span>
              <span>1750ms (Default)</span>
              <span>3000ms (Casual)</span>
            </div>
          </div>

          {/* Minimum Target Lifetime */}
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1.5">
              {t('randomTarget.minTargetLifetime', undefined, 'Minimum Target Lifetime')}:{' '}
              <span className="text-amber-400 font-mono">{currentConfig.minTargetLifetimeMs}ms</span>
            </label>
            <input
              type="range"
              min={500}
              max={2000}
              step={50}
              value={currentConfig.minTargetLifetimeMs}
              onChange={(e) => updateConfig({ minTargetLifetimeMs: parseInt(e.target.value, 10) })}
              className="w-full accent-amber-500"
            />
            <div className="flex justify-between text-[10px] text-slate-500 mt-1 font-mono">
              <span>500ms (Fast Reflex)</span>
              <span>1050ms (Default)</span>
              <span>2000ms (Easy)</span>
            </div>
          </div>

          {/* Difficulty Progression */}
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1.5">
              {t('randomTarget.difficultyProgression', undefined, 'Difficulty Progression')}
            </label>
            <select
              value={currentConfig.difficultyProgression}
              onChange={(e) =>
                updateConfig({
                  difficultyProgression: e.target.value as 'linear' | 'exponential' | 'none',
                })
              }
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
            >
              <option value="linear">Linear (Gradually faster over round)</option>
              <option value="exponential">Exponential (Accelerates toward round end)</option>
              <option value="none">Constant (Steady spawn speed)</option>
            </select>
          </div>

          {/* Starting Score & Clamping */}
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1.5">
              {t('randomTarget.startingScore', undefined, 'Starting Score')}:{' '}
              <span className="text-amber-400 font-mono">{currentConfig.startingScore}</span>
            </label>
            <input
              type="number"
              min={0}
              max={500}
              value={currentConfig.startingScore}
              onChange={(e) => updateConfig({ startingScore: parseInt(e.target.value, 10) || 0 })}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
            />
          </div>
        </div>

        {/* Negative Score Clamping Switch */}
        <div className="flex items-center justify-between pt-2 border-t border-slate-800">
          <div>
            <span className="text-xs font-semibold text-slate-200">
              {t('randomTarget.allowNegativeScore', undefined, 'Allow Negative Score (Can drop below 0)')}
            </span>
            <p className="text-[11px] text-slate-500">
              {t('randomTarget.allowNegativeDesc', undefined, 'When disabled, penalties clamp score at a minimum of 0.')}
            </p>
          </div>
          <button
            type="button"
            onClick={() => updateConfig({ allowNegativeScore: !currentConfig.allowNegativeScore })}
            className={`w-12 h-6 rounded-full transition-colors relative p-0.5 cursor-pointer ${
              currentConfig.allowNegativeScore ? 'bg-amber-500' : 'bg-slate-700'
            }`}
          >
            <div
              className={`w-5 h-5 rounded-full bg-white transition-transform ${
                currentConfig.allowNegativeScore ? 'translate-x-6' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
      </div>

      {/* Safe Play Area Configuration */}
      <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-5 space-y-4">
        <div className="flex items-center gap-2 text-amber-400">
          <Shield className="w-5 h-5" />
          <h3 className="font-bold text-sm text-slate-100 uppercase tracking-wide">
            {t('randomTarget.safePlayArea', undefined, 'Safe Play Area & HUD Exclusion Margins')}
          </h3>
        </div>

        <p className="text-xs text-slate-400">
          {t('randomTarget.safeAreaDesc', undefined, 'Defines the active canvas percentage where targets may spawn, avoiding HUD overlap and the interaction tool.')}
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div>
            <label className="block text-[11px] font-semibold text-slate-400 mb-1">
              Top Margin (HUD): <span className="text-amber-400 font-mono">{currentConfig.playArea.topPercent}%</span>
            </label>
            <input
              type="range"
              min={8}
              max={25}
              value={currentConfig.playArea.topPercent}
              onChange={(e) =>
                updateConfig({
                  playArea: { ...currentConfig.playArea, topPercent: parseInt(e.target.value, 10) },
                })
              }
              className="w-full accent-amber-500"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-400 mb-1">
              Bottom Margin: <span className="text-amber-400 font-mono">{currentConfig.playArea.bottomPercent}%</span>
            </label>
            <input
              type="range"
              min={60}
              max={88}
              value={currentConfig.playArea.bottomPercent}
              onChange={(e) =>
                updateConfig({
                  playArea: { ...currentConfig.playArea, bottomPercent: parseInt(e.target.value, 10) },
                })
              }
              className="w-full accent-amber-500"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-400 mb-1">
              Left Margin: <span className="text-amber-400 font-mono">{currentConfig.playArea.leftPercent}%</span>
            </label>
            <input
              type="range"
              min={4}
              max={20}
              value={currentConfig.playArea.leftPercent}
              onChange={(e) =>
                updateConfig({
                  playArea: { ...currentConfig.playArea, leftPercent: parseInt(e.target.value, 10) },
                })
              }
              className="w-full accent-amber-500"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-400 mb-1">
              Right Margin (Tool): <span className="text-amber-400 font-mono">{currentConfig.playArea.rightPercent}%</span>
            </label>
            <input
              type="range"
              min={65}
              max={88}
              value={currentConfig.playArea.rightPercent}
              onChange={(e) =>
                updateConfig({
                  playArea: { ...currentConfig.playArea, rightPercent: parseInt(e.target.value, 10) },
                })
              }
              className="w-full accent-amber-500"
            />
          </div>
        </div>
      </div>

      {/* Sound Effects & BGM Settings Card */}
      <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-5 space-y-4">
        <div className="flex items-center gap-2 text-amber-400">
          <Volume2 className="w-5 h-5" />
          <h3 className="font-bold text-sm text-slate-100 uppercase tracking-wide">
            {t('randomTarget.soundFx', undefined, 'Audio Synthesis & Sound Previews')}
          </h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1.5">
              {t('randomTarget.masterVolume', undefined, 'Master Audio Volume')}:{' '}
              <span className="text-amber-400 font-mono">
                {Math.round(currentConfig.soundVolume * 100)}%
              </span>
            </label>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={currentConfig.soundVolume}
              onChange={(e) => updateConfig({ soundVolume: parseFloat(e.target.value) })}
              className="w-full accent-amber-500"
            />
          </div>

          <div className="flex items-center gap-6 pt-2">
            <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-300">
              <input
                type="checkbox"
                checked={currentConfig.soundEnabled}
                onChange={(e) => updateConfig({ soundEnabled: e.target.checked })}
                className="w-4 h-4 rounded text-amber-500 accent-amber-500"
              />
              <span>{t('randomTarget.enableSoundFx', undefined, 'Enable Sound FX')}</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-300">
              <input
                type="checkbox"
                checked={currentConfig.bgmEnabled}
                onChange={(e) => updateConfig({ bgmEnabled: e.target.checked })}
                className="w-4 h-4 rounded text-amber-500 accent-amber-500"
              />
              <span>{t('randomTarget.enableBgm', undefined, 'Enable Background BGM')}</span>
            </label>
          </div>
        </div>

        <p className="text-xs text-slate-400 pt-2 border-t border-slate-800">
          {t(
            'randomTarget.soundDesc',
            undefined,
            'Preview procedural sound effects generated live via Web Audio API.'
          )}
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <button
            type="button"
            onClick={() => testSound('gunshot', () => randomTargetSounds.playGunshot())}
            className={`px-3 py-2 rounded-xl text-xs font-bold border flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              isPlayingSound === 'gunshot'
                ? 'bg-amber-500/20 border-amber-400 text-amber-300 ring-2 ring-amber-400/50'
                : 'bg-slate-800/80 border-slate-700 hover:bg-slate-700 text-slate-200'
            }`}
          >
            <Play className="w-3.5 h-3.5" />
            <span>Gunshot</span>
          </button>

          <button
            type="button"
            onClick={() => testSound('cast', () => randomTargetSounds.playCastWhistle())}
            className={`px-3 py-2 rounded-xl text-xs font-bold border flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              isPlayingSound === 'cast'
                ? 'bg-amber-500/20 border-amber-400 text-amber-300 ring-2 ring-amber-400/50'
                : 'bg-slate-800/80 border-slate-700 hover:bg-slate-700 text-slate-200'
            }`}
          >
            <Play className="w-3.5 h-3.5" />
            <span>Fishing Cast</span>
          </button>

          <button
            type="button"
            onClick={() => testSound('hit', () => randomTargetSounds.playPositiveHit())}
            className={`px-3 py-2 rounded-xl text-xs font-bold border flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              isPlayingSound === 'hit'
                ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300 ring-2 ring-emerald-400/50'
                : 'bg-slate-800/80 border-slate-700 hover:bg-slate-700 text-slate-200'
            }`}
          >
            <Play className="w-3.5 h-3.5" />
            <span>Positive Hit</span>
          </button>

          <button
            type="button"
            onClick={() => testSound('penalty', () => randomTargetSounds.playNegativePenalty())}
            className={`px-3 py-2 rounded-xl text-xs font-bold border flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              isPlayingSound === 'penalty'
                ? 'bg-rose-500/20 border-rose-400 text-rose-300 ring-2 ring-rose-400/50'
                : 'bg-slate-800/80 border-slate-700 hover:bg-slate-700 text-slate-200'
            }`}
          >
            <Play className="w-3.5 h-3.5" />
            <span>Penalty Buzz</span>
          </button>
        </div>
      </div>
    </div>
  );
};

/**
 * Targets & Sprites editor for Random Target Arcade
 */
export const RandomTargetTargetsCustomizer: React.FC<RandomTargetCustomizerProps> = ({
  theme,
  onChange,
  onUploadAsset,
  uploadingAsset,
}) => {
  const { t } = useLocalization();
  const isOceanTheme = isOceanTreasureHuntTheme(theme);
  const baseDefault = isOceanTheme ? DEFAULT_OCEAN_CONFIG : DEFAULT_DESERT_CONFIG;

  const currentConfig: RandomTargetGameConfig = useMemo(() => {
    return normalizeRandomTargetConfig(theme.game_config, baseDefault);
  }, [theme.game_config, baseDefault]);

  const updateConfig = (updates: Partial<RandomTargetGameConfig>) => {
    const nextConfig: RandomTargetGameConfig = {
      ...currentConfig,
      ...updates,
    };
    onChange({
      ...theme,
      game_config: nextConfig as any,
    });
  };

  const handleUpdatePositiveTarget = (updates: Partial<TargetDefinition>) => {
    updateConfig({
      positiveTarget: {
        ...currentConfig.positiveTarget,
        ...updates,
      },
    });
  };

  const handleUpdateNegativeTarget = (updates: Partial<TargetDefinition>) => {
    updateConfig({
      negativeTarget: {
        ...currentConfig.negativeTarget,
        ...updates,
      },
    });
  };

  const handleUpdateTool = (updates: Partial<ToolDefinition>) => {
    updateConfig({
      interactionTool: {
        ...currentConfig.interactionTool,
        ...updates,
      },
    });
  };

  const handleUploadImage = async (fieldKey: string, file: File) => {
    if (!onUploadAsset) return;
    try {
      const url = await onUploadAsset(file, fieldKey);
      if (fieldKey === 'positive_target') {
        handleUpdatePositiveTarget({ imageUrl: url });
      } else if (fieldKey === 'negative_target') {
        handleUpdateNegativeTarget({ imageUrl: url });
      } else if (fieldKey === 'interaction_tool') {
        handleUpdateTool({ imageUrl: url });
      }
    } catch (err: any) {
      console.error(`Upload failed for ${fieldKey}:`, err);
    }
  };

  const handleResetDefaults = () => {
    updateConfig({
      positiveTarget: { ...baseDefault.positiveTarget },
      negativeTarget: { ...baseDefault.negativeTarget },
      interactionTool: { ...baseDefault.interactionTool },
      playArea: { ...baseDefault.playArea },
    });
  };

  return (
    <div className="space-y-6">
      {/* Header bar with Reset Defaults */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-white uppercase tracking-wider">
            {t('randomTarget.targetsAndTools', undefined, 'Targets & Player Interaction Tool')}
          </h3>
          <p className="text-xs text-slate-400">
            {t('randomTarget.targetsDesc', undefined, 'Configure target graphics, point rewards, penalties, and aiming tool.')}
          </p>
        </div>
        <button
          type="button"
          onClick={handleResetDefaults}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors cursor-pointer"
          title="Reset targets and tool to theme defaults"
        >
          <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
          <span>{t('common.resetDefaults', undefined, 'Reset Defaults')}</span>
        </button>
      </div>

      {/* 1. Positive Target Card */}
      <div className="bg-slate-900/60 border border-emerald-500/30 rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-emerald-400">
            <Sparkles className="w-5 h-5" />
            <h4 className="font-bold text-sm text-slate-100 uppercase tracking-wide">
              {t('randomTarget.positiveTargetHeader', undefined, 'Positive Target (Hit to Score Points)')}
            </h4>
          </div>
          <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-mono">
            +{currentConfig.positiveTarget.score} PTS
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
          {/* Target Sprite Image & Upload */}
          <div className="flex flex-col items-center">
            <div className="w-24 h-24 rounded-2xl bg-slate-950 border border-emerald-500/40 flex items-center justify-center overflow-hidden relative group shadow-lg">
              <img
                src={currentConfig.positiveTarget.imageUrl}
                alt={currentConfig.positiveTarget.name}
                className="w-full h-full object-contain p-2 select-none"
              />
              {onUploadAsset && (
                <label className="absolute inset-0 bg-slate-950/80 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center cursor-pointer transition-opacity">
                  <Upload className="w-6 h-6 text-emerald-400 mb-1" />
                  <span className="text-[10px] text-emerald-300 font-bold">Replace Sprite</span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleUploadImage('positive_target', file);
                    }}
                  />
                </label>
              )}
            </div>
            <span className="text-[10px] text-slate-400 mt-1 font-mono">
              Size: {currentConfig.positiveTarget.size}px
            </span>
          </div>

          {/* Configuration Inputs */}
          <div className="md:col-span-2 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">
                  Target Name
                </label>
                <input
                  type="text"
                  value={currentConfig.positiveTarget.name}
                  onChange={(e) => handleUpdatePositiveTarget({ name: e.target.value })}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">
                  Score Award (+Points)
                </label>
                <input
                  type="number"
                  min={1}
                  max={200}
                  value={currentConfig.positiveTarget.score}
                  onChange={(e) =>
                    handleUpdatePositiveTarget({ score: Math.max(1, parseInt(e.target.value, 10) || 10) })
                  }
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-emerald-400 font-mono font-bold focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                  Spawn Weight: <span className="text-emerald-400 font-mono">{currentConfig.positiveTarget.spawnWeight}</span>
                </label>
                <input
                  type="range"
                  min={1}
                  max={100}
                  value={currentConfig.positiveTarget.spawnWeight}
                  onChange={(e) =>
                    handleUpdatePositiveTarget({ spawnWeight: parseInt(e.target.value, 10) })
                  }
                  className="w-full accent-emerald-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                  Target Size: <span className="text-emerald-400 font-mono">{currentConfig.positiveTarget.size}px</span>
                </label>
                <input
                  type="range"
                  min={60}
                  max={150}
                  step={2}
                  value={currentConfig.positiveTarget.size}
                  onChange={(e) =>
                    handleUpdatePositiveTarget({ size: parseInt(e.target.value, 10) })
                  }
                  className="w-full accent-emerald-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                  Hit Effect
                </label>
                <select
                  value={currentConfig.positiveTarget.hitEffectType}
                  onChange={(e) =>
                    handleUpdatePositiveTarget({
                      hitEffectType: e.target.value as any,
                    })
                  }
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500 capitalize"
                >
                  <option value="sparks">Golden Sparks</option>
                  <option value="sparkle">Glimmer Sparkle</option>
                  <option value="bubbles">Ocean Bubbles</option>
                  <option value="splash">Water Splash</option>
                  <option value="dust">Sand Dust</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Negative Penalty Target Card */}
      <div className="bg-slate-900/60 border border-rose-500/30 rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-rose-400">
            <AlertTriangle className="w-5 h-5" />
            <h4 className="font-bold text-sm text-slate-100 uppercase tracking-wide">
              {t('randomTarget.negativeTargetHeader', undefined, 'Penalty Target (Obstacle to Avoid)')}
            </h4>
          </div>
          <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-rose-500/20 text-rose-300 border border-rose-500/30 font-mono">
            {currentConfig.negativeTarget.score} PTS
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
          {/* Target Sprite Image & Upload */}
          <div className="flex flex-col items-center">
            <div className="w-24 h-24 rounded-2xl bg-slate-950 border border-rose-500/40 flex items-center justify-center overflow-hidden relative group shadow-lg">
              <img
                src={currentConfig.negativeTarget.imageUrl}
                alt={currentConfig.negativeTarget.name}
                className="w-full h-full object-contain p-2 select-none"
              />
              {onUploadAsset && (
                <label className="absolute inset-0 bg-slate-950/80 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center cursor-pointer transition-opacity">
                  <Upload className="w-6 h-6 text-rose-400 mb-1" />
                  <span className="text-[10px] text-rose-300 font-bold">Replace Sprite</span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleUploadImage('negative_target', file);
                    }}
                  />
                </label>
              )}
            </div>
            <span className="text-[10px] text-slate-400 mt-1 font-mono">
              Size: {currentConfig.negativeTarget.size}px
            </span>
          </div>

          {/* Configuration Inputs */}
          <div className="md:col-span-2 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">
                  Obstacle Name
                </label>
                <input
                  type="text"
                  value={currentConfig.negativeTarget.name}
                  onChange={(e) => handleUpdateNegativeTarget({ name: e.target.value })}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-rose-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">
                  Score Penalty (Deduction)
                </label>
                <input
                  type="number"
                  max={-1}
                  min={-200}
                  value={currentConfig.negativeTarget.score}
                  onChange={(e) => {
                    const rawVal = parseInt(e.target.value, 10) || -10;
                    handleUpdateNegativeTarget({ score: rawVal < 0 ? rawVal : -Math.abs(rawVal) });
                  }}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-rose-400 font-mono font-bold focus:outline-none focus:border-rose-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                  Spawn Weight: <span className="text-rose-400 font-mono">{currentConfig.negativeTarget.spawnWeight}</span>
                </label>
                <input
                  type="range"
                  min={1}
                  max={100}
                  value={currentConfig.negativeTarget.spawnWeight}
                  onChange={(e) =>
                    handleUpdateNegativeTarget({ spawnWeight: parseInt(e.target.value, 10) })
                  }
                  className="w-full accent-rose-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                  Obstacle Size: <span className="text-rose-400 font-mono">{currentConfig.negativeTarget.size}px</span>
                </label>
                <input
                  type="range"
                  min={60}
                  max={150}
                  step={2}
                  value={currentConfig.negativeTarget.size}
                  onChange={(e) =>
                    handleUpdateNegativeTarget({ size: parseInt(e.target.value, 10) })
                  }
                  className="w-full accent-rose-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                  Hit Effect
                </label>
                <select
                  value={currentConfig.negativeTarget.hitEffectType}
                  onChange={(e) =>
                    handleUpdateNegativeTarget({
                      hitEffectType: e.target.value as any,
                    })
                  }
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-rose-500 capitalize"
                >
                  <option value="dust">Sand Dust</option>
                  <option value="splash">Water Splash</option>
                  <option value="bubbles">Ocean Bubbles</option>
                  <option value="sparks">Rose Sparks</option>
                  <option value="sparkle">Flicker</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Player Interaction Tool Card */}
      <div className="bg-slate-900/60 border border-sky-500/30 rounded-2xl p-5 space-y-4">
        <div className="flex items-center gap-2 text-sky-400">
          <Crosshair className="w-5 h-5" />
          <h4 className="font-bold text-sm text-slate-100 uppercase tracking-wide">
            {t('randomTarget.toolArtwork', undefined, 'Player Interaction Tool Sprite & Aiming')}
          </h4>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
          {/* Tool Sprite Image & Upload */}
          <div className="flex flex-col items-center">
            <div className="w-28 h-28 rounded-2xl bg-slate-950 border border-sky-500/40 flex items-center justify-center overflow-hidden relative group shadow-lg">
              <img
                src={currentConfig.interactionTool.imageUrl}
                alt={currentConfig.interactionTool.name}
                className="w-full h-full object-contain p-2 select-none"
              />
              {onUploadAsset && (
                <label className="absolute inset-0 bg-slate-950/80 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center cursor-pointer transition-opacity">
                  <Upload className="w-6 h-6 text-sky-400 mb-1" />
                  <span className="text-[10px] text-sky-300 font-bold">Replace Sprite</span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleUploadImage('interaction_tool', file);
                    }}
                  />
                </label>
              )}
            </div>
            <span className="text-[10px] text-slate-400 mt-1 font-mono">
              Anchored: Bottom-Right
            </span>
          </div>

          {/* Configuration Inputs */}
          <div className="md:col-span-2 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">
                  Tool Display Name
                </label>
                <input
                  type="text"
                  value={currentConfig.interactionTool.name}
                  onChange={(e) => handleUpdateTool({ name: e.target.value })}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-sky-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">
                  Animation Archetype
                </label>
                <select
                  value={currentConfig.interactionTool.type}
                  onChange={(e) =>
                    handleUpdateTool({
                      type: e.target.value as 'pistol' | 'fishing-rod' | 'custom',
                    })
                  }
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-sky-500 font-mono"
                >
                  <option value="pistol">Pistol (Recoil & Muzzle Flash)</option>
                  <option value="fishing-rod">Fishing Rod (Cast & Line Tracer)</option>
                  <option value="custom">Custom Tool</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                  Tool Size: <span className="text-sky-400 font-mono">{currentConfig.interactionTool.size}px</span>
                </label>
                <input
                  type="range"
                  min={100}
                  max={260}
                  step={5}
                  value={currentConfig.interactionTool.size}
                  onChange={(e) => handleUpdateTool({ size: parseInt(e.target.value, 10) })}
                  className="w-full accent-sky-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                  Recoil Angle: <span className="text-sky-400 font-mono">{currentConfig.interactionTool.recoilAngleDeg}°</span>
                </label>
                <input
                  type="range"
                  min={-45}
                  max={0}
                  step={1}
                  value={currentConfig.interactionTool.recoilAngleDeg}
                  onChange={(e) => handleUpdateTool({ recoilAngleDeg: parseInt(e.target.value, 10) })}
                  className="w-full accent-sky-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                  Projectile Tracer
                </label>
                <select
                  value={currentConfig.interactionTool.projectileEffect}
                  onChange={(e) =>
                    handleUpdateTool({
                      projectileEffect: e.target.value as any,
                    })
                  }
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-sky-500"
                >
                  <option value="bullet-trail">Bullet Tracer Line</option>
                  <option value="fishing-line">Fishing Hook Line</option>
                  <option value="magic-spark">Magic Spark Beam</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

/**
 * Start & Result Screens Customizer for Random Target Arcade
 */
export const RandomTargetScreensCustomizer: React.FC<RandomTargetCustomizerProps> = ({
  theme,
  onChange,
  onUploadAsset,
  uploadingAsset,
}) => {
  const { t } = useLocalization();
  const [activeSubTab, setActiveSubTab] = useState<'start' | 'result'>('start');

  // Start Screen State
  const [isStartEditorModalOpen, setIsStartEditorModalOpen] = useState(false);
  const [startViewportPreset, setStartViewportPreset] = useState<
    'fit' | '1024x576' | '800x450' | '600x400' | '400x300'
  >('fit');
  const [startScaleInfo, setStartScaleInfo] = useState({ scale: 1, width: 1024, height: 576 });

  // Result Screen State
  const [isResultEditorModalOpen, setIsResultEditorModalOpen] = useState(false);
  const [resultViewportPreset, setResultViewportPreset] = useState<
    'fit' | '1024x576' | '800x450' | '600x400' | '400x300'
  >('fit');
  const [resultScaleInfo, setResultScaleInfo] = useState({ scale: 1, width: 1024, height: 576 });

  const startConfig: StartScreenConfig = useMemo(() => {
    return getStartScreenConfig(theme, 'random-target');
  }, [theme]);

  const resultConfig: ResultScreenConfig = useMemo(() => {
    const rawResult = (theme.game_config as any)?.screens?.result;
    if (rawResult && typeof rawResult === 'object') {
      return {
        ...DEFAULT_RESULT_SCREEN_CONFIG,
        ...rawResult,
        elements: Array.isArray(rawResult.elements)
          ? rawResult.elements
          : DEFAULT_RESULT_SCREEN_CONFIG.elements,
      };
    }
    return DEFAULT_RESULT_SCREEN_CONFIG;
  }, [theme]);

  const handleUpdateStartScreen = (updatedStartConfig: StartScreenConfig) => {
    const updatedTheme = saveStartScreenConfig(theme, updatedStartConfig);
    onChange(updatedTheme);
  };

  const handleUpdateResultScreen = (updatedResultConfig: ResultScreenConfig) => {
    const gc = (theme.game_config as any) || {};
    const nextTheme: GameTheme = {
      ...theme,
      game_config: {
        ...gc,
        screens: {
          ...(gc.screens || {}),
          result: updatedResultConfig,
        },
      },
    };
    onChange(nextTheme);
  };

  return (
    <div className="space-y-6">
      {/* Sub-tab Navigation */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
        <button
          type="button"
          onClick={() => setActiveSubTab('start')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeSubTab === 'start'
              ? 'bg-amber-500 text-slate-950 shadow-md ring-1 ring-amber-400'
              : 'bg-slate-900 text-slate-300 hover:bg-slate-800'
          }`}
        >
          <Play className="w-4 h-4" />
          <span>{t('customizers.startScreen', undefined, 'Start Screen')}</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('result')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeSubTab === 'result'
              ? 'bg-amber-500 text-slate-950 shadow-md ring-1 ring-amber-400'
              : 'bg-slate-900 text-slate-300 hover:bg-slate-800'
          }`}
        >
          <Tv className="w-4 h-4" />
          <span>{t('customizers.resultScreen', undefined, 'Result Screen')}</span>
        </button>
      </div>

      {/* START SCREEN SUB-TAB */}
      {activeSubTab === 'start' && (
        <div className="space-y-6">
          <StartScreenBasicEditor
            startConfig={startConfig}
            theme={theme}
            gameType="random-target"
            onChange={handleUpdateStartScreen}
            onUploadAsset={onUploadAsset as any}
            uploadingAsset={uploadingAsset}
          />

          {/* Visual Canvas Preview Frame */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-4 shadow-lg">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h4 className="text-sm font-bold text-white flex items-center gap-2">
                  <Palette className="w-4 h-4 text-amber-400" />
                  <span>{t('customizers.startScreenVisualEditor', undefined, 'Start Screen Visual Canvas Editor')}</span>
                </h4>
                <p className="text-xs text-slate-400 mt-1">
                  Interactive multi-layer visual design with drag-and-drop elements and live responsive scaling.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsStartEditorModalOpen(true)}
                className="px-4 py-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold text-xs rounded-xl shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2 transition-all cursor-pointer shrink-0"
              >
                <Maximize2 className="w-4 h-4" />
                <span>{t('customizers.openStartScreenEditor', undefined, 'Open Start Screen Editor')}</span>
              </button>
            </div>

            {/* Scaled Preview Frame */}
            <div className="flex flex-col items-center justify-center p-4 bg-slate-950/60 rounded-xl border border-slate-800/80 gap-3">
              <div className="flex flex-wrap items-center justify-center gap-1.5 p-1 bg-slate-900/90 rounded-lg border border-slate-800 text-[11px] font-mono">
                <span className="text-slate-400 px-2 font-medium">Viewport:</span>
                {(
                  [
                    { id: 'fit', label: 'Fit (Auto)' },
                    { id: '1024x576', label: '1024 × 576 (1.0x)' },
                    { id: '800x450', label: '800 × 450 (0.781x)' },
                    { id: '600x400', label: '600 × 400 (0.586x)' },
                    { id: '400x300', label: '400 × 300 (0.391x)' },
                  ] as const
                ).map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => setStartViewportPreset(preset.id)}
                    className={`px-2 py-1 rounded transition-colors cursor-pointer ${
                      startViewportPreset === preset.id
                        ? 'bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>

              <div
                className="w-full flex items-center justify-center overflow-auto p-2"
                style={{ maxHeight: '600px' }}
              >
                <div
                  className="rounded-xl overflow-hidden border border-slate-700/60 shadow-2xl relative"
                  style={{
                    width:
                      startViewportPreset === '1024x576'
                        ? '1024px'
                        : startViewportPreset === '800x450'
                        ? '800px'
                        : startViewportPreset === '600x400'
                        ? '600px'
                        : startViewportPreset === '400x300'
                        ? '400px'
                        : '100%',
                    maxWidth: '100%',
                    height:
                      startViewportPreset === '1024x576'
                        ? '576px'
                        : startViewportPreset === '800x450'
                        ? '450px'
                        : startViewportPreset === '600x400'
                        ? '400px'
                        : startViewportPreset === '400x300'
                        ? '300px'
                        : undefined,
                    aspectRatio: startViewportPreset === 'fit' ? '16 / 9' : undefined,
                  }}
                >
                  <StartScreenRenderer
                    startConfig={startConfig}
                    theme={theme}
                    layout={theme.layout}
                    gameType="random-target"
                    onStartGame={() => {}}
                    isSimulation={true}
                    onScaleChange={(scale, w, h) => {
                      setStartScaleInfo({ scale, width: Math.round(w), height: Math.round(h) });
                    }}
                  />
                </div>
              </div>
            </div>
          </div>

          <StartScreenVisualEditorModal
            isOpen={isStartEditorModalOpen}
            onClose={() => setIsStartEditorModalOpen(false)}
            startConfig={startConfig}
            theme={theme}
            gameType="random-target"
            onChange={handleUpdateStartScreen}
            onUploadAsset={onUploadAsset as any}
          />
        </div>
      )}

      {/* RESULT SCREEN SUB-TAB */}
      {activeSubTab === 'result' && (
        <div className="space-y-6">
          <ResultScreenBasicEditor
            resultConfig={resultConfig as any}
            theme={theme}
            gameType="random-target"
            onChange={handleUpdateResultScreen}
            onUploadAsset={onUploadAsset as any}
            uploadingAsset={uploadingAsset}
          />

          {/* Visual Canvas Preview Frame */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-4 shadow-lg">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h4 className="text-sm font-bold text-white flex items-center gap-2">
                  <Palette className="w-4 h-4 text-amber-400" />
                  <span>{t('customizers.resultScreenVisualEditor', undefined, 'Result Screen Visual Canvas Editor')}</span>
                </h4>
                <p className="text-xs text-slate-400 mt-1">
                  Design result screen badges, final score metrics, accuracy display, and action buttons.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsResultEditorModalOpen(true)}
                className="px-4 py-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold text-xs rounded-xl shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2 transition-all cursor-pointer shrink-0"
              >
                <Maximize2 className="w-4 h-4" />
                <span>{t('customizers.openResultScreenEditor', undefined, 'Open Result Screen Editor')}</span>
              </button>
            </div>

            {/* Scaled Preview Frame */}
            <div className="flex flex-col items-center justify-center p-4 bg-slate-950/60 rounded-xl border border-slate-800/80 gap-3">
              <div className="flex flex-wrap items-center justify-center gap-1.5 p-1 bg-slate-900/90 rounded-lg border border-slate-800 text-[11px] font-mono">
                <span className="text-slate-400 px-2 font-medium">Viewport:</span>
                {(
                  [
                    { id: 'fit', label: 'Fit (Auto)' },
                    { id: '1024x576', label: '1024 × 576 (1.0x)' },
                    { id: '800x450', label: '800 × 450 (0.781x)' },
                    { id: '600x400', label: '600 × 400 (0.586x)' },
                    { id: '400x300', label: '400 × 300 (0.391x)' },
                  ] as const
                ).map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => setResultViewportPreset(preset.id)}
                    className={`px-2 py-1 rounded transition-colors cursor-pointer ${
                      resultViewportPreset === preset.id
                        ? 'bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>

              <div
                className="w-full flex items-center justify-center overflow-auto p-2"
                style={{ maxHeight: '600px' }}
              >
                <div
                  className="rounded-xl overflow-hidden border border-slate-700/60 shadow-2xl relative"
                  style={{
                    width:
                      resultViewportPreset === '1024x576'
                        ? '1024px'
                        : resultViewportPreset === '800x450'
                        ? '800px'
                        : resultViewportPreset === '600x400'
                        ? '600px'
                        : resultViewportPreset === '400x300'
                        ? '400px'
                        : '100%',
                    maxWidth: '100%',
                    height:
                      resultViewportPreset === '1024x576'
                        ? '576px'
                        : resultViewportPreset === '800x450'
                        ? '450px'
                        : resultViewportPreset === '600x400'
                        ? '400px'
                        : resultViewportPreset === '400x300'
                        ? '300px'
                        : undefined,
                    aspectRatio: resultViewportPreset === 'fit' ? '16 / 9' : undefined,
                  }}
                >
                  <ResultScreenRenderer
                    resultConfig={resultConfig as any}
                    theme={theme}
                    layout={theme.layout}
                    gameType="random-target"
                    stats={{
                      score: 280,
                      positiveHits: 28,
                      negativeHits: 2,
                      accuracy: 93,
                      timeElapsedSeconds: (theme.game_config as any)?.gameDurationSeconds || 30,
                      isVictory: true,
                      gameType: 'random-target',
                    }}
                    isSimulation={true}
                    onScaleChange={(scale, w, h) => {
                      setResultScaleInfo({ scale, width: Math.round(w), height: Math.round(h) });
                    }}
                  />
                </div>
              </div>
            </div>
          </div>

          <ResultScreenVisualEditorModal
            isOpen={isResultEditorModalOpen}
            onClose={() => setIsResultEditorModalOpen(false)}
            resultConfig={resultConfig as any}
            theme={theme}
            gameType="random-target"
            onChange={handleUpdateResultScreen}
            onUploadAsset={onUploadAsset as any}
          />
        </div>
      )}
    </div>
  );
};
