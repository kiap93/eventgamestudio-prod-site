import React, { useState } from 'react';
import { useLocalization } from '../../context/LocalizationContext';
import {
  Settings,
  Volume2,
  VolumeX,
  Pause,
  Play,
  Square,
  Maximize2,
  Minimize2,
} from 'lucide-react';

export interface GameControlBarProps {
  id?: string;
  disabled?: boolean;
  isMuted?: boolean;
  isPaused?: boolean;
  isFullscreen?: boolean;
  uiScale?: number;
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
  uiScale,
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
  const { t } = useLocalization();
  const [activeTooltip, setActiveTooltip] = useState<ControlKey | null>(null);

  // Proportional scaling when uiScale is provided (clamped for optimal usability)
  const scaled = uiScale !== undefined ? {
    btnSize: Math.max(20, Math.min(40, Math.round(28 * uiScale))),
    iconSize: Math.max(10, Math.min(18, Math.round(13 * uiScale))),
    barPadding: Math.max(2, Math.min(8, Math.round(4 * uiScale))),
    barGap: Math.max(2, Math.min(8, Math.round(4 * uiScale))),
    barRadius: Math.max(6, Math.min(14, Math.round(10 * uiScale))),
    btnRadius: Math.max(4, Math.min(10, Math.round(7 * uiScale))),
  } : null;

  // Canonical tooltips
  const resolvedSettingsTooltip =
    settingsTooltip ||
    (disabled
      ? t('studio.timerSettingTip', undefined, 'Game settings are configured in the Studio editor. Adjust the Timer setting in the game editor to change the game duration.')
      : t('studio.gameSettings', undefined, 'Game Settings & Themes'));

  const resolvedSoundTooltip =
    soundTooltip ||
    (disabled
      ? t('studio.soundControlPreview', undefined, 'Sound control (preview only / disabled in simulation)')
      : isMuted
      ? t('studio.clickToUnmute', undefined, 'Unmute Sound')
      : t('studio.clickToMute', undefined, 'Mute Sound'));

  const resolvedPauseTooltip =
    pauseTooltip ||
    (disabled
      ? t('studio.pausePreview', undefined, 'Pause game (preview only / disabled in simulation)')
      : isPaused
      ? t('game.resume')
      : t('game.pause'));

  const resolvedStopTooltip =
    stopTooltip ||
    (disabled
      ? t('studio.stopPreview', undefined, 'Stop game (preview only / disabled in simulation)')
      : t('game.stopGame'));

  const resolvedFullscreenTooltip =
    fullscreenTooltip ||
    (disabled
      ? t('studio.fullscreenPreview', undefined, 'Fullscreen (preview only / disabled in simulation)')
      : isFullscreen
      ? t('common.exitFullscreen')
      : t('common.fullscreen'));

  return (
    <div
      id={id}
      style={
        scaled
          ? {
              padding: `${scaled.barPadding}px`,
              gap: `${scaled.barGap}px`,
              borderRadius: `${scaled.barRadius}px`,
            }
          : undefined
      }
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onPointerMove={(e) => e.stopPropagation()}
      onMouseMove={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      className={`z-50 pointer-events-auto select-none inline-flex items-center w-fit gap-1 sm:gap-1.5 bg-slate-950/85 backdrop-blur-sm p-1 sm:p-1.5 rounded-xl border border-slate-700/80 shadow-lg ${
        className.includes('absolute') || className.includes('fixed') ? '' : 'relative'
      } ${className}`}
      role="toolbar"
      aria-label={t('studio.gameControls', undefined, 'Game Controls')}
    >
      {/* 1. SETTINGS BUTTON */}
      <div className="relative">
        <button
          id={`${id}-btn-settings`}
          type="button"
          disabled={disabled}
          aria-disabled={disabled}
          onClick={(e) => {
            e.stopPropagation();
            if (disabled) {
              e.preventDefault();
              return;
            }
            onSettingsClick?.();
          }}
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onMouseEnter={() => setActiveTooltip('settings')}
          onMouseLeave={() => setActiveTooltip((cur) => (cur === 'settings' ? null : cur))}
          onFocus={() => setActiveTooltip('settings')}
          onBlur={() => setActiveTooltip((cur) => (cur === 'settings' ? null : cur))}
          title={resolvedSettingsTooltip}
          style={
            scaled
              ? {
                  width: `${scaled.btnSize}px`,
                  height: `${scaled.btnSize}px`,
                  borderRadius: `${scaled.btnRadius}px`,
                  padding: 0,
                }
              : undefined
          }
          className={`p-1 sm:p-1.5 rounded-lg border transition-all flex items-center justify-center ${
            disabled
              ? 'bg-[#0c2012]/80 border-[#b2c833]/50 text-[#c8e038]/80 cursor-not-allowed opacity-90'
              : 'bg-[#0c2012]/90 border-[#b2c833] text-[#c8e038] hover:bg-[#1a3820] hover:border-[#c8e038] hover:text-[#e2f84c] active:scale-95 cursor-pointer shadow-sm'
          }`}
          aria-label={t('studio.gameSettings', undefined, 'Game Settings')}
        >
          <Settings
            style={
              scaled
                ? { width: `${scaled.iconSize}px`, height: `${scaled.iconSize}px` }
                : undefined
            }
            className="w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0"
          />
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
                <span>{t('studio.gameSettings', undefined, 'Game Settings')}</span>
              </div>
              {disabled && (
                <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 uppercase font-semibold">
                  {t('common.preview', undefined, 'Preview')}
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-300 leading-snug">
              {t('studio.gameSettings', undefined, 'Game settings are configured in the Studio editor.')}
            </p>
            <div className="mt-1.5 pt-1.5 border-t border-slate-800 text-[11px] text-amber-300 leading-snug flex items-start gap-1.5">
              <span className="shrink-0 text-amber-400 font-bold">⏱</span>
              <span>{t('studio.timerSettingTip', undefined, 'Adjust the Timer setting in the game editor to change the game duration.')}</span>
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
            e.stopPropagation();
            if (disabled) {
              e.preventDefault();
              return;
            }
            onToggleMute?.();
          }}
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onMouseEnter={() => setActiveTooltip('sound')}
          onMouseLeave={() => setActiveTooltip((cur) => (cur === 'sound' ? null : cur))}
          onFocus={() => setActiveTooltip('sound')}
          onBlur={() => setActiveTooltip((cur) => (cur === 'sound' ? null : cur))}
          title={resolvedSoundTooltip}
          style={
            scaled
              ? {
                  width: `${scaled.btnSize}px`,
                  height: `${scaled.btnSize}px`,
                  borderRadius: `${scaled.btnRadius}px`,
                  padding: 0,
                }
              : undefined
          }
          className={`p-1 sm:p-1.5 rounded-lg border transition-all flex items-center justify-center ${
            disabled
              ? 'bg-[#0c2012]/80 border-[#b2c833]/50 text-[#c8e038]/80 cursor-not-allowed opacity-90'
              : 'bg-[#0c2012]/90 border-[#b2c833] text-[#c8e038] hover:bg-[#1a3820] hover:border-[#c8e038] active:scale-95 cursor-pointer shadow-sm'
          }`}
          aria-label={isMuted ? t('studio.clickToUnmute', undefined, 'Unmute Sound') : t('studio.clickToMute', undefined, 'Mute Sound')}
        >
          {isMuted ? (
            <VolumeX
              style={
                scaled
                  ? { width: `${scaled.iconSize}px`, height: `${scaled.iconSize}px` }
                  : undefined
              }
              className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-slate-400 shrink-0"
            />
          ) : (
            <Volume2
              style={
                scaled
                  ? { width: `${scaled.iconSize}px`, height: `${scaled.iconSize}px` }
                  : undefined
              }
              className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-emerald-400 shrink-0"
            />
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
              <span>{t('studio.soundControl', undefined, 'Sound Control')}</span>
            </div>
            <p className="text-[11px] text-slate-300 leading-snug">
              {disabled
                ? t('studio.soundControlPreview', undefined, 'Sound control (preview only / disabled in simulation)')
                : isMuted
                ? t('studio.clickToUnmute', undefined, 'Click to unmute sound')
                : t('studio.clickToMute', undefined, 'Click to mute sound')}
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
            e.stopPropagation();
            if (disabled) {
              e.preventDefault();
              return;
            }
            onPauseResume?.();
          }}
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onMouseEnter={() => setActiveTooltip('pause')}
          onMouseLeave={() => setActiveTooltip((cur) => (cur === 'pause' ? null : cur))}
          onFocus={() => setActiveTooltip('pause')}
          onBlur={() => setActiveTooltip((cur) => (cur === 'pause' ? null : cur))}
          title={resolvedPauseTooltip}
          style={
            scaled
              ? {
                  width: `${scaled.btnSize}px`,
                  height: `${scaled.btnSize}px`,
                  borderRadius: `${scaled.btnRadius}px`,
                  padding: 0,
                }
              : undefined
          }
          className={`p-1 sm:p-1.5 rounded-lg border transition-all flex items-center justify-center ${
            disabled
              ? 'bg-[#0c2012]/80 border-[#b2c833]/50 text-[#c8e038]/80 cursor-not-allowed opacity-90'
              : isPaused
              ? 'bg-amber-400 text-slate-950 border-amber-300 hover:bg-amber-300 font-bold active:scale-95 cursor-pointer shadow-md'
              : 'bg-[#0c2012]/90 border-[#b2c833] text-[#c8e038] hover:bg-[#1a3820] hover:border-[#c8e038] active:scale-95 cursor-pointer shadow-sm'
          }`}
          aria-label={isPaused ? t('game.resume') : t('game.pause')}
        >
          {isPaused && !disabled ? (
            <Play
              style={
                scaled
                  ? { width: `${scaled.iconSize}px`, height: `${scaled.iconSize}px` }
                  : undefined
              }
              className="w-3 h-3 sm:w-3.5 sm:h-3.5 fill-slate-950 shrink-0"
            />
          ) : (
            <Pause
              style={
                scaled
                  ? { width: `${scaled.iconSize}px`, height: `${scaled.iconSize}px` }
                  : undefined
              }
              className="w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0"
            />
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
              <span>{t('game.pause')}</span>
            </div>
            <p className="text-[11px] text-slate-300 leading-snug">
              {disabled
                ? t('studio.pausePreview', undefined, 'Pause game (preview only / disabled in simulation)')
                : isPaused
                ? t('game.resume')
                : t('game.pause')}
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
            e.stopPropagation();
            if (disabled) {
              e.preventDefault();
              return;
            }
            onStop?.();
          }}
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onMouseEnter={() => setActiveTooltip('stop')}
          onMouseLeave={() => setActiveTooltip((cur) => (cur === 'stop' ? null : cur))}
          onFocus={() => setActiveTooltip('stop')}
          onBlur={() => setActiveTooltip((cur) => (cur === 'stop' ? null : cur))}
          title={resolvedStopTooltip}
          style={
            scaled
              ? {
                  width: `${scaled.btnSize}px`,
                  height: `${scaled.btnSize}px`,
                  borderRadius: `${scaled.btnRadius}px`,
                  padding: 0,
                }
              : undefined
          }
          className={`p-1 sm:p-1.5 rounded-lg border transition-all flex items-center justify-center ${
            disabled
              ? 'bg-[#0c2012]/80 border-rose-500/50 text-rose-400/80 cursor-not-allowed opacity-90'
              : 'bg-[#0c2012]/90 border-rose-500/80 text-rose-400 hover:bg-rose-950/80 hover:border-rose-400 active:scale-95 cursor-pointer shadow-sm'
          }`}
          aria-label={t('game.stopGame')}
        >
          <Square
            style={
              scaled
                ? { width: `${scaled.iconSize}px`, height: `${scaled.iconSize}px` }
                : undefined
            }
            className="w-3 h-3 sm:w-3.5 sm:h-3.5 fill-rose-400/80 shrink-0"
          />
        </button>

        {/* Stop Tooltip */}
        {activeTooltip === 'stop' && (
          <div
            id={`${id}-tooltip-stop`}
            className="absolute top-full right-0 mt-2 w-52 p-2 bg-slate-950/95 backdrop-blur-md border border-slate-700 rounded-xl shadow-2xl z-50 text-left pointer-events-none select-none"
          >
            <div className="flex items-center gap-1.5 text-xs font-bold text-rose-400 mb-0.5">
              <Square className="w-3.5 h-3.5 fill-rose-400" />
              <span>{t('game.stopGame')}</span>
            </div>
            <p className="text-[11px] text-slate-300 leading-snug">
              {disabled
                ? t('studio.stopPreview', undefined, 'Stop game (preview only / disabled in simulation)')
                : t('game.stopGame')}
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
            e.stopPropagation();
            if (disabled) {
              e.preventDefault();
              return;
            }
            onToggleFullscreen?.();
          }}
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onMouseEnter={() => setActiveTooltip('fullscreen')}
          onMouseLeave={() => setActiveTooltip((cur) => (cur === 'fullscreen' ? null : cur))}
          onFocus={() => setActiveTooltip('fullscreen')}
          onBlur={() => setActiveTooltip((cur) => (cur === 'fullscreen' ? null : cur))}
          title={resolvedFullscreenTooltip}
          style={
            scaled
              ? {
                  width: `${scaled.btnSize}px`,
                  height: `${scaled.btnSize}px`,
                  borderRadius: `${scaled.btnRadius}px`,
                  padding: 0,
                }
              : undefined
          }
          className={`p-1 sm:p-1.5 rounded-lg border transition-all font-mono font-bold flex items-center justify-center leading-none ${
            disabled
              ? 'bg-[#0c2012]/80 border-[#b2c833]/50 text-[#c8e038]/80 cursor-not-allowed opacity-90'
              : 'bg-[#0c2012]/90 border-[#b2c833] text-[#c8e038] hover:bg-[#1a3820] hover:border-[#c8e038] hover:text-[#e2f84c] active:scale-95 cursor-pointer shadow-sm'
          }`}
          aria-label={isFullscreen ? t('common.exitFullscreen') : t('common.fullscreen')}
        >
          {isFullscreen ? (
            <Minimize2
              style={
                scaled
                  ? { width: `${scaled.iconSize}px`, height: `${scaled.iconSize}px` }
                  : undefined
              }
              className="w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0"
            />
          ) : (
            <Maximize2
              style={
                scaled
                  ? { width: `${scaled.iconSize}px`, height: `${scaled.iconSize}px` }
                : undefined
              }
              className="w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0"
            />
          )}
        </button>

        {/* Fullscreen Tooltip */}
        {activeTooltip === 'fullscreen' && (
          <div
            id={`${id}-tooltip-fullscreen`}
            className="absolute top-full right-0 mt-2 w-52 p-2 bg-slate-950/95 backdrop-blur-md border border-slate-700 rounded-xl shadow-2xl z-50 text-left pointer-events-none select-none"
          >
            <div className="flex items-center gap-1.5 text-xs font-bold text-[#c8e038] mb-0.5">
              <span className="font-mono text-xs">⛶</span>
              <span>{t('common.fullscreen')}</span>
            </div>
            <p className="text-[11px] text-slate-300 leading-snug">
              {disabled
                ? t('studio.fullscreenPreview', undefined, 'Fullscreen (preview only / disabled in simulation)')
                : isFullscreen
                ? t('common.exitFullscreen')
                : t('common.fullscreen')}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
