import React, { useState } from 'react';
import { GameTheme, isMemoryMatchTheme, isMatch3Theme } from '../../themes';
import { soundManager } from '../../game/systems/SoundManager';
import { MemoryMatchAudioTester } from './games/MemoryMatchCustomizer';
import { Match3AudioEditor, Match3AudioTester } from './games/Match3Customizer';
import { match3Sounds } from '../../games/match-3/match3Sounds';
import { useLocalization } from '../../context/LocalizationContext';
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
  onUploadAsset?: (file: File, fieldKey: string) => Promise<string>;
  uploadingAsset?: string | null;
}

export const AudioTab: React.FC<AudioTabProps> = ({
  theme,
  onChange,
  onUploadAsset,
  uploadingAsset,
}) => {
  const { t } = useLocalization();
  const isMemoryMatch = isMemoryMatchTheme(theme);
  const isMatch3 = isMatch3Theme(theme);

  if (isMatch3) {
    return (
      <Match3AudioEditor
        theme={theme}
        onChange={onChange}
        onUploadAsset={onUploadAsset}
        uploadingAsset={uploadingAsset}
      />
    );
  }

  const [isPlayingBgmSample, setIsPlayingBgmSample] = useState(false);
  const [showCustomAudioUrls, setShowCustomAudioUrls] = useState(false);

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
    const nextSounds = {
      ...sounds,
      ...updates,
    };
    onChange({
      ...theme,
      sounds_config: nextSounds,
      // If Match-3, sync top-level sound attributes into game_config
      ...(isMatch3 && theme.game_config
        ? {
            game_config: {
              ...(theme.game_config as any),
              soundEnabled: nextSounds.soundEnabled,
              soundVolume: nextSounds.soundVolume,
              bgmEnabled: nextSounds.bgmEnabled,
            },
          }
        : {}),
    });
  };

  const handleToggleBgmSample = () => {
    if (isPlayingBgmSample) {
      if (isMatch3) {
        match3Sounds.stopBgm();
      } else {
        soundManager.stopBgm();
      }
      setIsPlayingBgmSample(false);
    } else {
      if (isMatch3) {
        match3Sounds.setVolume(sounds.soundVolume ?? 0.8);
        match3Sounds.startBgm();
      } else {
        soundManager.startBgm();
      }
      setIsPlayingBgmSample(true);
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. MASTER VOLUME & AUDIO PRESETS */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-5 shadow-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="p-2 bg-amber-500/10 text-amber-400 rounded-xl border border-amber-500/20">
              <Volume2 className="w-4 h-4" />
            </span>
            <div>
              <h3 className="text-sm font-bold text-slate-100">{t('studio.audioAndSoundscapes', undefined, 'Audio & Soundscapes')}</h3>
              <p className="text-xs text-slate-400">
                {t('studio.audioAndSoundscapesDesc', undefined, 'Procedural Web Audio synthesis and retro 8-bit sound effects (no heavy audio files required)')}
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
              <span>{sounds.soundEnabled ? t('studio.audioEnabled') : t('common.muted', undefined, 'Muted')}</span>
            </button>
          </div>
        </div>

        {/* Volume Slider & BGM Melody Style */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-2">
            <div className="flex justify-between items-center text-xs">
              <span className="font-semibold text-slate-300">{t('studio.masterSoundVolume', undefined, 'Master Sound Volume')}</span>
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
          </div>

          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-2">
            <div className="flex justify-between items-center text-xs">
              <span className="font-semibold text-slate-300 flex items-center gap-1.5">
                <Music className="w-3.5 h-3.5 text-amber-400" />
                {t('studio.bgmArpeggiator', undefined, 'Background Music (BGM)')}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleUpdateSounds({ bgmEnabled: !sounds.bgmEnabled })}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                    sounds.bgmEnabled
                      ? 'bg-emerald-600 text-slate-950 shadow-md'
                      : 'bg-slate-800 text-slate-400'
                  }`}
                  title="Toggle background music on or off"
                >
                  {sounds.bgmEnabled ? 'BGM ON' : 'BGM OFF'}
                </button>
                <button
                  type="button"
                  onClick={handleToggleBgmSample}
                  className={`px-2 py-0.5 rounded-lg text-[11px] font-bold flex items-center gap-1 transition-all ${
                    isPlayingBgmSample
                      ? 'bg-rose-500 text-slate-100 animate-pulse'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  {isPlayingBgmSample ? <Square className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                  <span>{isPlayingBgmSample ? t('studio.stopMusic', undefined, 'Stop') : t('studio.testMusic', undefined, 'Preview')}</span>
                </button>
              </div>
            </div>
            <p className="text-[11px] text-slate-500">
              {t('studio.proceduralChiptunesDesc', undefined, 'Procedural chip tunes synthesize dynamic chord arpeggios live in browser memory')}
            </p>
          </div>
        </div>
      </div>

      {/* 2. INTERACTIVE SOUND EFFECTS TESTER PALETTE */}
      {isMatch3 ? (
        <Match3AudioTester />
      ) : isMemoryMatch ? (
        <MemoryMatchAudioTester />
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-4 shadow-lg">
          <div>
            <h3 className="text-sm font-bold text-slate-100">{t('studio.tabs.soundEffectsTriggers')}</h3>
            <p className="text-xs text-slate-400">
              {t('studio.tabs.soundEffectsTriggersDesc')}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {/* Good Item Catch */}
            <div className="bg-slate-950 border border-slate-800 rounded-2xl p-3.5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <Sparkles className="w-4 h-4" />
                </span>
                <div>
                  <h4 className="text-xs font-bold text-slate-200">{t('studio.tabs.catchGoodItem')}</h4>
                  <p className="text-[10px] text-slate-400">{t('studio.tabs.highChimePluck')}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => soundManager.playGreenCatch()}
                className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl flex items-center gap-1 active:scale-95 transition-all"
              >
                <Play className="w-3 h-3 text-emerald-400" />
                <span>{t('common.test')}</span>
              </button>
            </div>

            {/* Hazard Catch */}
            <div className="bg-slate-950 border border-slate-800 rounded-2xl p-3.5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="p-1.5 rounded-lg bg-rose-500/10 text-rose-400 border border-rose-500/20">
                  <Flame className="w-4 h-4" />
                </span>
                <div>
                  <h4 className="text-xs font-bold text-slate-200">{t('studio.tabs.catchHazardBomb')}</h4>
                  <p className="text-[10px] text-slate-400">{t('studio.tabs.sawtoothLowBuzz')}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => soundManager.playOrangeCatch()}
                className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl flex items-center gap-1 active:scale-95 transition-all"
              >
                <Play className="w-3 h-3 text-rose-400" />
                <span>{t('common.test')}</span>
              </button>
            </div>

            {/* Bonus Catch */}
            <div className="bg-slate-950 border border-slate-800 rounded-2xl p-3.5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  <Star className="w-4 h-4" />
                </span>
                <div>
                  <h4 className="text-xs font-bold text-slate-200">{t('studio.tabs.catchBonusSpecial')}</h4>
                  <p className="text-[10px] text-slate-400">{t('studio.tabs.arpeggiatedTone')}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => soundManager.playGoldenCatch()}
                className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl flex items-center gap-1 active:scale-95 transition-all"
              >
                <Play className="w-3 h-3 text-amber-400" />
                <span>{t('common.test')}</span>
              </button>
            </div>

            {/* Game Start Fanfare */}
            <div className="bg-slate-950 border border-slate-800 rounded-2xl p-3.5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="p-1.5 rounded-lg bg-sky-500/10 text-sky-400 border border-sky-500/20">
                  <Play className="w-4 h-4" />
                </span>
                <div>
                  <h4 className="text-xs font-bold text-slate-200">{t('studio.tabs.startFanfare')}</h4>
                  <p className="text-[10px] text-slate-400">{t('studio.tabs.upbeatChime')}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => soundManager.playStart()}
                className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl flex items-center gap-1 active:scale-95 transition-all"
              >
                <Play className="w-3 h-3 text-sky-400" />
                <span>{t('common.test')}</span>
              </button>
            </div>

            {/* Countdown Beep */}
            <div className="bg-slate-950 border border-slate-800 rounded-2xl p-3.5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="p-1.5 rounded-lg bg-purple-500/10 text-purple-400 border border-purple-500/20">
                  <Music className="w-4 h-4" />
                </span>
                <div>
                  <h4 className="text-xs font-bold text-slate-200">{t('studio.tabs.countdownBeep')}</h4>
                  <p className="text-[10px] text-slate-400">{t('studio.tabs.countdownBeepDesc')}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => soundManager.playCountdownBeep(true)}
                className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl flex items-center gap-1 active:scale-95 transition-all"
              >
                <Play className="w-3 h-3 text-purple-400" />
                <span>{t('common.test')}</span>
              </button>
            </div>

            {/* Game Over Jingle */}
            <div className="bg-slate-950 border border-slate-800 rounded-2xl p-3.5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="p-1.5 rounded-lg bg-orange-500/10 text-orange-400 border border-orange-500/20">
                  <VolumeX className="w-4 h-4" />
                </span>
                <div>
                  <h4 className="text-xs font-bold text-slate-200">{t('studio.tabs.gameOverJingle')}</h4>
                  <p className="text-[10px] text-slate-400">{t('studio.tabs.descendingMinorTune')}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => soundManager.playGameOver()}
                className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl flex items-center gap-1 active:scale-95 transition-all"
              >
                <Play className="w-3 h-3 text-orange-400" />
                <span>{t('common.test')}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. COLLAPSIBLE CUSTOM AUDIO ASSET URLS */}
      <div className="border border-slate-800 rounded-2xl overflow-hidden bg-slate-950/50">
        <button
          type="button"
          onClick={() => setShowCustomAudioUrls(!showCustomAudioUrls)}
          className="w-full px-4 py-3 bg-slate-950 hover:bg-slate-900/80 flex items-center justify-between text-xs font-bold text-slate-300 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Sliders className="w-3.5 h-3.5 text-amber-400" />
            <span>{t('studio.tabs.customAudioUrls')}</span>
          </div>
          <div className="flex items-center gap-1 text-slate-400">
            <span className="text-[10px] font-normal">
              {showCustomAudioUrls ? t('common.hide') : t('common.showAdvanced')}
            </span>
            {showCustomAudioUrls ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </div>
        </button>

        {showCustomAudioUrls && (
          <div className="p-4 border-t border-slate-800 space-y-3 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-semibold text-slate-400">
                  {t('studio.tabs.customCatchGoodSound')}
                </label>
                <input
                  type="text"
                  value={sounds.catchGoodUrl || ''}
                  onChange={(e) => handleUpdateSounds({ catchGoodUrl: e.target.value })}
                  placeholder="https://example.com/chime.mp3"
                  className="w-full mt-1 bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-1.5 text-slate-200 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-400">
                  {t('studio.tabs.customCatchHazardSound')}
                </label>
                <input
                  type="text"
                  value={sounds.catchBadUrl || ''}
                  onChange={(e) => handleUpdateSounds({ catchBadUrl: e.target.value })}
                  placeholder="https://example.com/buzz.mp3"
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
