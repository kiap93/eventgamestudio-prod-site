import React, { useState } from 'react';
import { GameTheme } from '../../themes/types';
import { soundManager } from '../../game/systems/SoundManager';
import { MemoryMatchAudioTester } from './games/MemoryMatchCustomizer';
import {
  Volume2,
  VolumeX,
  Play,
  Square,
  Sparkles,
  Flame,
  Star,
  Music,
  Sliders,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

interface AudioTabProps {
  theme: GameTheme;
  onChange: (updated: GameTheme) => void;
  gameType?: string;
}

export const AudioTab: React.FC<AudioTabProps> = ({ theme, onChange, gameType }) => {
  const [isPlayingBgmSample, setIsPlayingBgmSample] = useState(false);
  const [showCustomAudioUrls, setShowCustomAudioUrls] = useState(false);

  const resolvedGameType =
    (gameType || theme.game_type || theme.game_slug || '').toLowerCase();
  const isMemoryMatch =
    resolvedGameType === 'memory-match' ||
    theme.slug?.includes('memory') ||
    theme.base_theme_id === 'memory-carnival';

  const sounds = theme.sounds_config || {
    soundVolume: 0.8,
    soundEnabled: true,
    bgmEnabled: true,
    catchGoodUrl: null,
    catchBadUrl: null,
    catchBonusUrl: null,
    gameStartUrl: null,
    gameOverUrl: null,
    bgmUrl: null,
  };

  const handleUpdateSounds = (updates: Partial<typeof sounds>) => {
    onChange({
      ...theme,
      sounds_config: {
        ...sounds,
        ...updates,
      },
    });
  };

  const handleToggleBgmSample = () => {
    if (isPlayingBgmSample) {
      soundManager.stopBgm();
      setIsPlayingBgmSample(false);
    } else {
      soundManager.startBgm();
      setIsPlayingBgmSample(true);
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. MASTER VOLUME & SHARED AUDIO TOGGLES */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-5 shadow-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="p-2 bg-amber-500/10 text-amber-400 rounded-xl border border-amber-500/20">
              <Volume2 className="w-4 h-4" />
            </span>
            <div>
              <h3 className="text-sm font-bold text-slate-100">Audio & Soundscapes</h3>
              <p className="text-xs text-slate-400">
                Web Audio procedural synthesis and real-time game sound effects
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleUpdateSounds({ soundEnabled: !sounds.soundEnabled })}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all ${
                sounds.soundEnabled
                  ? 'bg-emerald-600 text-slate-950 shadow-md'
                  : 'bg-slate-800 text-slate-400'
              }`}
            >
              {sounds.soundEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
              <span>{sounds.soundEnabled ? 'Audio Enabled' : 'Muted'}</span>
            </button>
          </div>
        </div>

        {/* Volume Slider & BGM Melody Style */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-2">
            <div className="flex justify-between items-center text-xs">
              <span className="font-semibold text-slate-300">Master Sound Volume</span>
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
            <p className="text-[11px] text-slate-500">
              Output gain multiplier for all in-game sound synthesis
            </p>
          </div>

          {/* Background Chiptune Melody Toggle & Preview */}
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 flex flex-col justify-between space-y-2">
            <div className="flex justify-between items-center text-xs">
              <span className="font-semibold text-slate-300 flex items-center gap-1.5">
                <Music className="w-3.5 h-3.5 text-purple-400" />
                Retro BGM Melody
              </span>
              <button
                type="button"
                onClick={() => handleUpdateSounds({ bgmEnabled: !sounds.bgmEnabled })}
                className={`px-2 py-0.5 rounded-lg text-[10px] font-bold border transition-colors ${
                  sounds.bgmEnabled
                    ? 'bg-purple-500/10 text-purple-400 border-purple-500/30'
                    : 'bg-slate-800 text-slate-500 border-slate-700'
                }`}
              >
                {sounds.bgmEnabled ? 'Enabled' : 'Disabled'}
              </button>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={handleToggleBgmSample}
                className={`flex-1 py-1.5 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all ${
                  isPlayingBgmSample
                    ? 'bg-rose-600 text-white animate-pulse'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
                }`}
              >
                {isPlayingBgmSample ? (
                  <>
                    <Square className="w-3 h-3 fill-current" />
                    <span>Stop Preview</span>
                  </>
                ) : (
                  <>
                    <Play className="w-3 h-3 fill-current" />
                    <span>Test BGM Melody</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 2. GAME-SPECIFIC AUDIO TESTER / SOUND FX */}
      {isMemoryMatch ? (
        <MemoryMatchAudioTester />
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-4 shadow-lg">
          <div className="flex items-center gap-2">
            <span className="p-2 bg-amber-500/10 text-amber-400 rounded-xl border border-amber-500/20">
              <Sparkles className="w-4 h-4" />
            </span>
            <div>
              <h3 className="text-sm font-bold text-slate-100">Catch Sound FX Triggers</h3>
              <p className="text-xs text-slate-400">
                Procedural dynamic audio feedback generated on collision events
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <button
              type="button"
              onClick={() => soundManager.playGreenCatch()}
              className="p-3 bg-slate-950 hover:bg-slate-850 active:scale-95 border border-slate-800 hover:border-emerald-500/40 rounded-2xl flex items-center justify-center gap-2 text-xs font-bold text-emerald-400 transition-all cursor-pointer"
            >
              <Sparkles className="w-4 h-4" />
              <span>Test Good Catch Chime</span>
            </button>

            <button
              type="button"
              onClick={() => soundManager.playOrangeCatch()}
              className="p-3 bg-slate-950 hover:bg-slate-850 active:scale-95 border border-slate-800 hover:border-rose-500/40 rounded-2xl flex items-center justify-center gap-2 text-xs font-bold text-rose-400 transition-all cursor-pointer"
            >
              <Flame className="w-4 h-4" />
              <span>Test Hazard Hit Buzzer</span>
            </button>

            <button
              type="button"
              onClick={() => soundManager.playGoldenCatch()}
              className="p-3 bg-slate-950 hover:bg-slate-850 active:scale-95 border border-slate-800 hover:border-amber-500/40 rounded-2xl flex items-center justify-center gap-2 text-xs font-bold text-amber-400 transition-all cursor-pointer"
            >
              <Star className="w-4 h-4" />
              <span>Test Golden Bonus Fanfare</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
