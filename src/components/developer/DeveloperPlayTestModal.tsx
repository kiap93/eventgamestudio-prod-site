import React, { useState, useEffect } from 'react';
import { useLocalization } from '../../context/LocalizationContext';
import { GameTheme } from '../../themes/types';
import { GameShell } from '../shell/GameShell';
import { X, Play, RotateCcw, Sparkles, Monitor, Smartphone, Maximize2, Minimize2 } from 'lucide-react';

interface DeveloperPlayTestModalProps {
  theme: GameTheme;
  gameName?: string;
  onClose: () => void;
}

export const DeveloperPlayTestModal: React.FC<DeveloperPlayTestModalProps> = ({
  theme,
  gameName = 'Catch The Brand',
  onClose,
}) => {
  const { t } = useLocalization();
  const [key, setKey] = useState<number>(Date.now());
  const [deviceFrame, setDeviceFrame] = useState<'desktop' | 'mobile'>('desktop');
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(
        !!document.fullscreenElement || !!(document as any).webkitFullscreenElement
      );
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    document.addEventListener('webkitfullscreenchange', handleFsChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFsChange);
      document.removeEventListener('webkitfullscreenchange', handleFsChange);
    };
  }, []);

  const handleToggleFullscreen = () => {
    const isCurrentlyFs =
      !!document.fullscreenElement || !!(document as any).webkitFullscreenElement;
    if (!isCurrentlyFs && !isFullscreen) {
      if (document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen().catch(() => {});
      } else if ((document.documentElement as any).webkitRequestFullscreen) {
        (document.documentElement as any).webkitRequestFullscreen();
      }
      setIsFullscreen(true);
    } else {
      if (document.fullscreenElement || (document as any).webkitFullscreenElement) {
        if (document.exitFullscreen) {
          document.exitFullscreen().catch(() => {});
        } else if ((document as any).webkitExitFullscreen) {
          (document as any).webkitExitFullscreen();
        }
      }
      setIsFullscreen(false);
    }
  };

  const handleRestart = () => {
    setKey(Date.now());
  };

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200 ${
        isFullscreen ? 'p-0' : 'p-4'
      }`}
    >
      <div
        className={`relative flex flex-col bg-slate-900 border border-slate-700/80 shadow-2xl overflow-hidden ${
          isFullscreen
            ? 'w-full h-full max-w-none max-h-none rounded-none border-none'
            : 'w-full max-w-5xl xl:max-w-6xl h-[92vh] max-h-[900px] rounded-2xl'
        }`}
      >
        {/* Top Header Bar */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-800/90 border-b border-slate-700">
          <div className="flex items-center space-x-3">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              <Play className="w-4 h-4 fill-emerald-400" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-xs font-semibold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  {t('developer.devTestRunner')}
                </span>
                <span className="text-xs text-slate-400 font-medium">{gameName}</span>
              </div>
              <h2 className="text-base font-bold text-white tracking-tight">{theme.name}</h2>
            </div>
          </div>

          {/* Center Device Frame Toggles */}
          <div className="hidden sm:flex items-center bg-slate-950/60 p-1 rounded-lg border border-slate-700">
            <button
              onClick={() => setDeviceFrame('desktop')}
              className={`flex items-center space-x-1.5 px-3 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                deviceFrame === 'desktop'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Monitor className="w-3.5 h-3.5" />
              <span>{t('developer.fullArea')}</span>
            </button>
            <button
              onClick={() => setDeviceFrame('mobile')}
              className={`flex items-center space-x-1.5 px-3 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                deviceFrame === 'mobile'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span>{t('developer.mobileSim')}</span>
            </button>
          </div>

          {/* Right Action Controls */}
          <div className="flex items-center space-x-2">
            <button
              onClick={handleRestart}
              className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-medium text-slate-200 bg-slate-700/60 hover:bg-slate-700 border border-slate-600 rounded-lg transition-colors cursor-pointer"
              title={t('developer.restartGame')}
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span className="hidden md:inline">{t('developer.restart')}</span>
            </button>

            <button
              onClick={handleToggleFullscreen}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700/60 rounded-lg transition-colors cursor-pointer"
              title={isFullscreen ? t('developer.exitFullscreen') : t('developer.fullscreen')}
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>

            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-700/60 rounded-lg transition-colors ml-2 cursor-pointer"
              title={t('developer.closeTestRunner')}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Game Canvas Container */}
        <div className="flex-1 relative flex items-center justify-center bg-slate-950 overflow-hidden p-0">
          <div
            className={`transition-all duration-300 h-full w-full flex items-center justify-center ${
              deviceFrame === 'mobile'
                ? 'max-w-[420px] rounded-2xl border-4 border-slate-700 shadow-2xl overflow-hidden bg-black'
                : 'max-w-full'
            }`}
          >
            <div className="relative w-full h-full">
              <GameShell
                key={key}
                customTheme={theme}
                showCabinetFooter={false}
                isFullscreen={isFullscreen}
                onToggleFullscreen={handleToggleFullscreen}
              />
            </div>
          </div>
        </div>

        {/* Bottom Inspector Bar */}
        <div className="flex items-center justify-between px-6 py-2.5 bg-slate-900 border-t border-slate-800 text-xs text-slate-400">
          <div className="flex items-center space-x-4">
            <span className="flex items-center space-x-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>{t('developer.themeIdLabel')} <code className="text-slate-300 font-mono">{theme.id}</code></span>
            </span>
            <span className="hidden sm:inline text-slate-600">|</span>
            <span className="hidden sm:inline">{t('developer.itemsCountLabel')} <strong className="text-slate-200">{theme.items_config?.length || 0}</strong></span>
            <span className="hidden sm:inline text-slate-600">|</span>
            <span className="hidden sm:inline">{t('developer.fallSpeedLabel')} <strong className="text-slate-200">{theme.physics_config?.baseFallSpeed || 500}px/s</strong></span>
          </div>

          <div className="flex items-center space-x-3 font-mono">
            <span className="text-emerald-400 font-bold">{t('developer.gameModeTestPlay')}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
