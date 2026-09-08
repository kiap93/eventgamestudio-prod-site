import React, { useState } from 'react';
import {
  Settings,
  Volume2,
  VolumeX,
  Pause,
  Play,
  Square,
  Maximize2,
} from 'lucide-react';

export interface GameControlBarProps {
  id?: string;
  disabled?: boolean;
  isMuted?: boolean;
  isPaused?: boolean;
  isFullscreen?: boolean;
  onSettingsClick?: () => void;
  onToggleMute?: () => void;
  onPauseResume?: () => void;
  onStop?: () => void;
  onToggleFullscreen?: () => void;
  settingsTooltip?: string;
  soundTooltip?: string;
  pauseTooltip?: string;
  stopTooltip?: string;
  fullscreenTooltip?: string;
  className?: string;
}

type ControlKey = 'settings' | 'sound' | 'pause' | 'stop' | 'fullscreen';

export const GameControlBar: React.FC<GameControlBarProps> = ({
  id = 'game-control-bar',
  disabled = false,
  isMuted = false,
  isPaused = false,
  isFullscreen = false,
  onSettingsClick,
  onToggleMute,
  onPauseResume,
  onStop,
  onToggleFullscreen,
  settingsTooltip,
  soundTooltip,
  pauseTooltip,
  stopTooltip,
  fullscreenTooltip,
  className = '',
}) => {
  const [activeTooltip, setActiveTooltip] = useState<ControlKey | null>(null);

  // Canonical tooltips
  const resolvedSettingsTooltip =
    settingsTooltip ||
    (disabled
      ? 'Game settings are configured in the Studio editor. Adjust the Timer setting in the game editor to change the game duration.'
      : 'Game Settings & Themes');

  const resolvedSoundTooltip =
    soundTooltip ||
    (disabled
      ? 'Sound control (preview only / disabled in simulation)'
      : isMuted
      ? 'Unmute Sound'
      : 'Mute Sound');

  const resolvedPauseTooltip =
    pauseTooltip ||
    (disabled
      ? 'Pause game (preview only / disabled in simulation)'
      : isPaused
      ? 'Resume Game'
      : 'Pause Game');

  const resolvedStopTooltip =
    stopTooltip ||
    (disabled
      ? 'Stop game (preview only / disabled in simulation)'
      : 'Stop Game / Return to Main Menu');

  const resolvedFullscreenTooltip =
    fullscreenTooltip ||
    (disabled
      ? 'Fullscreen (preview only / disabled in simulation)'
      : isFullscreen
      ? 'Exit Fullscreen'
      : 'Toggle Fullscreen');

  return (
    <div
      id={id}
      className={`z-40 pointer-events-auto select-none inline-flex items-center w-fit gap-1 sm:gap-1.5 bg-slate-950/85 backdrop-blur-sm p-1 sm:p-1.5 rounded-xl border border-slate-700/80 shadow-lg ${
        className.includes('absolute') || className.includes('fixed') ? '' : 'relative'
      } ${className}`}
      role="toolbar"
      aria-label="Game Controls"
    >
      {/* 1. SETTINGS BUTTON */}
      <div className="relative">
        <button
          id={`${id}-btn-settings`}
          type="button"
          disabled={disabled}
          aria-disabled={disabled}
          onClick={(e) => {
            if (disabled) {
              e.preventDefault();
              e.stopPropagation();
              return;
            }
            onSettingsClick?.();
          }}
          onMouseEnter={() => setActiveTooltip('settings')}
          onMouseLeave={() => setActiveTooltip((cur) => (cur === 'settings' ? null : cur))}
          onFocus={() => setActiveTooltip('settings')}
          onBlur={() => setActiveTooltip((cur) => (cur === 'settings' ? null : cur))}
          title={resolvedSettingsTooltip}
          className={`p-1 sm:p-1.5 rounded-lg border transition-all ${
            disabled
              ? 'bg-[#0c2012]/80 border-[#b2c833]/50 text-[#c8e038]/80 cursor-not-allowed opacity-90'
              : 'bg-[#0c2012]/90 border-[#b2c833] text-[#c8e038] hover:bg-[#1a3820] active:scale-95 cursor-pointer'
          }`}
          aria-label="Game Settings"
        >
          <Settings className="w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0" />
        </button>

        {/* Settings Rich Tooltip Popover */}
        {activeTooltip === 'settings' && (
          <div
            id={`${id}-tooltip-settings`}
            className="absolute top-full right-0 mt-2 w-64 p-2.5 bg-slate-950/95 backdrop-blur-md border border-slate-700 rounded-xl shadow-2xl z-50 text-left pointer-events-none select-none animate-in fade-in zoom-in-95 duration-100"
          >
            <div className="flex items-center justify-between gap-1.5 text-xs font-bold text-[#c8e038] mb-1">
              <div className="flex items-center gap-1.5">
                <Settings className="w-3.5 h-3.5 text-[#c8e038]" />
                <span>Game Settings</span>
              </div>
              {disabled && (
                <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 uppercase font-semibold">
                  Preview Only
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-300 leading-snug">
              Game settings are configured in the Studio editor.
            </p>
            <div className="mt-1.5 pt-1.5 border-t border-slate-800 text-[11px] text-amber-300 leading-snug flex items-start gap-1.5">
              <span className="shrink-0 text-amber-400 font-bold">⏱</span>
              <span>Adjust the Timer setting in the game editor to change the game duration.</span>
            </div>
          </div>
        )}
      </div>

      {/* 2. SOUND BUTTON */}
      <div className="relative">
        <button
          id={`${id}-btn-sound`}
          type="button"
          disabled={disabled}
          aria-disabled={disabled}
          onClick={(e) => {
            if (disabled) {
              e.preventDefault();
              e.stopPropagation();
              return;
            }
            onToggleMute?.();
          }}
          onMouseEnter={() => setActiveTooltip('sound')}
          onMouseLeave={() => setActiveTooltip((cur) => (cur === 'sound' ? null : cur))}
          onFocus={() => setActiveTooltip('sound')}
          onBlur={() => setActiveTooltip((cur) => (cur === 'sound' ? null : cur))}
          title={resolvedSoundTooltip}
          className={`p-1 sm:p-1.5 rounded-lg border transition-all ${
            disabled
              ? 'bg-[#0c2012]/80 border-[#b2c833]/50 text-[#c8e038]/80 cursor-not-allowed opacity-90'
              : 'bg-[#0c2012]/90 border-[#b2c833] text-[#c8e038] hover:bg-[#1a3820] active:scale-95 cursor-pointer'
          }`}
          aria-label={isMuted ? 'Unmute Sound' : 'Mute Sound'}
        >
          {isMuted ? (
            <VolumeX className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-slate-400 shrink-0" />
          ) : (
            <Volume2 className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-emerald-400 shrink-0" />
          )}
        </button>

        {/* Sound Tooltip */}
        {activeTooltip === 'sound' && (
          <div
            id={`${id}-tooltip-sound`}
            className="absolute top-full right-0 mt-2 w-52 p-2 bg-slate-950/95 backdrop-blur-md border border-slate-700 rounded-xl shadow-2xl z-50 text-left pointer-events-none select-none"
          >
            <div className="flex items-center gap-1.5 text-xs font-bold text-[#c8e038] mb-0.5">
              <Volume2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>Sound Control</span>
            </div>
            <p className="text-[11px] text-slate-300 leading-snug">
              {disabled
                ? 'Sound control (preview only / disabled in simulation)'
                : isMuted
                ? 'Click to unmute sound'
                : 'Click to mute sound'}
            </p>
          </div>
        )}
      </div>

      {/* 3. PAUSE / RESUME BUTTON */}
      <div className="relative">
        <button
          id={`${id}-btn-pause`}
          type="button"
          disabled={disabled}
          aria-disabled={disabled}
          onClick={(e) => {
            if (disabled) {
              e.preventDefault();
              e.stopPropagation();
              return;
            }
            onPauseResume?.();
          }}
          onMouseEnter={() => setActiveTooltip('pause')}
          onMouseLeave={() => setActiveTooltip((cur) => (cur === 'pause' ? null : cur))}
          onFocus={() => setActiveTooltip('pause')}
          onBlur={() => setActiveTooltip((cur) => (cur === 'pause' ? null : cur))}
          title={resolvedPauseTooltip}
          className={`p-1 sm:p-1.5 rounded-lg border transition-all ${
            disabled
              ? 'bg-[#0c2012]/80 border-[#b2c833]/50 text-[#c8e038]/80 cursor-not-allowed opacity-90'
              : isPaused
              ? 'bg-[#c8e038] text-[#0c2012] border-[#b2c833] font-bold cursor-pointer'
              : 'bg-[#0c2012]/90 border-[#b2c833] text-[#c8e038] hover:bg-[#1a3820] active:scale-95 cursor-pointer'
          }`}
          aria-label={isPaused ? 'Resume Game' : 'Pause Game'}
        >
          {isPaused && !disabled ? (
            <Play className="w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0" />
          ) : (
            <Pause className="w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0" />
          )}
        </button>

        {/* Pause Tooltip */}
        {activeTooltip === 'pause' && (
          <div
            id={`${id}-tooltip-pause`}
            className="absolute top-full right-0 mt-2 w-52 p-2 bg-slate-950/95 backdrop-blur-md border border-slate-700 rounded-xl shadow-2xl z-50 text-left pointer-events-none select-none"
          >
            <div className="flex items-center gap-1.5 text-xs font-bold text-[#c8e038] mb-0.5">
              <Pause className="w-3.5 h-3.5" />
              <span>Pause Game</span>
            </div>
            <p className="text-[11px] text-slate-300 leading-snug">
              {disabled
                ? 'Pause game (preview only / disabled in simulation)'
                : isPaused
                ? 'Resume active gameplay'
                : 'Pause active gameplay'}
            </p>
          </div>
        )}
      </div>

      {/* 4. STOP BUTTON */}
      <div className="relative">
        <button
          id={`${id}-btn-stop`}
          type="button"
          disabled={disabled}
          aria-disabled={disabled}
          onClick={(e) => {
            if (disabled) {
              e.preventDefault();
              e.stopPropagation();
              return;
            }
            onStop?.();
          }}
          onMouseEnter={() => setActiveTooltip('stop')}
          onMouseLeave={() => setActiveTooltip((cur) => (cur === 'stop' ? null : cur))}
          onFocus={() => setActiveTooltip('stop')}
          onBlur={() => setActiveTooltip((cur) => (cur === 'stop' ? null : cur))}
          title={resolvedStopTooltip}
          className={`p-1 sm:p-1.5 rounded-lg border transition-all flex items-center justify-center ${
            disabled
              ? 'bg-[#0c2012]/80 border-rose-500/50 text-rose-400/80 cursor-not-allowed opacity-90'
              : 'bg-[#0c2012]/90 border-rose-500/80 text-rose-400 hover:bg-rose-950 active:scale-95 cursor-pointer'
          }`}
          aria-label="Stop Game"
        >
          <Square className="w-3 h-3 sm:w-3.5 sm:h-3.5 fill-rose-400/80 shrink-0" />
        </button>

        {/* Stop Tooltip */}
        {activeTooltip === 'stop' && (
          <div
            id={`${id}-tooltip-stop`}
            className="absolute top-full right-0 mt-2 w-52 p-2 bg-slate-950/95 backdrop-blur-md border border-slate-700 rounded-xl shadow-2xl z-50 text-left pointer-events-none select-none"
          >
            <div className="flex items-center gap-1.5 text-xs font-bold text-rose-400 mb-0.5">
              <Square className="w-3.5 h-3.5 fill-rose-400" />
              <span>Stop Game</span>
            </div>
            <p className="text-[11px] text-slate-300 leading-snug">
              {disabled
                ? 'Stop game (preview only / disabled in simulation)'
                : 'Stop game and return to main menu'}
            </p>
          </div>
        )}
      </div>

      {/* 5. FULLSCREEN BUTTON */}
      <div className="relative">
        <button
          id={`${id}-btn-fullscreen`}
          type="button"
          disabled={disabled}
          aria-disabled={disabled}
          onClick={(e) => {
            if (disabled) {
              e.preventDefault();
              e.stopPropagation();
              return;
            }
            onToggleFullscreen?.();
          }}
          onMouseEnter={() => setActiveTooltip('fullscreen')}
          onMouseLeave={() => setActiveTooltip((cur) => (cur === 'fullscreen' ? null : cur))}
          onFocus={() => setActiveTooltip('fullscreen')}
          onBlur={() => setActiveTooltip((cur) => (cur === 'fullscreen' ? null : cur))}
          title={resolvedFullscreenTooltip}
          className={`p-1 sm:p-1.5 rounded-lg border transition-all font-mono font-bold flex items-center justify-center leading-none ${
            disabled
              ? 'bg-[#0c2012]/80 border-[#b2c833]/50 text-[#c8e038]/80 cursor-not-allowed opacity-90'
              : 'bg-[#0c2012]/90 border-[#b2c833] text-[#c8e038] hover:bg-[#1a3820] active:scale-95 cursor-pointer'
          }`}
          aria-label={isFullscreen ? 'Exit Fullscreen' : 'Toggle Fullscreen'}
        >
          <span className="text-[11px] sm:text-xs font-bold leading-none select-none">⛶</span>
        </button>

        {/* Fullscreen Tooltip */}
        {activeTooltip === 'fullscreen' && (
          <div
            id={`${id}-tooltip-fullscreen`}
            className="absolute top-full right-0 mt-2 w-52 p-2 bg-slate-950/95 backdrop-blur-md border border-slate-700 rounded-xl shadow-2xl z-50 text-left pointer-events-none select-none"
          >
            <div className="flex items-center gap-1.5 text-xs font-bold text-[#c8e038] mb-0.5">
              <span className="font-mono text-xs">⛶</span>
              <span>Fullscreen</span>
            </div>
            <p className="text-[11px] text-slate-300 leading-snug">
              {disabled
                ? 'Fullscreen (preview only / disabled in simulation)'
                : isFullscreen
                ? 'Exit fullscreen mode'
                : 'Toggle fullscreen game mode'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
