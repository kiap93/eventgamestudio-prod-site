import React, { useState } from 'react';
import { GameTheme } from '../../themes/types';
import { GameShell } from '../shell/GameShell';
import { X, Play, RotateCcw, Volume2, VolumeX, Sparkles, Monitor, Smartphone } from 'lucide-react';

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
  const [key, setKey] = useState<number>(Date.now());
  const [deviceFrame, setDeviceFrame] = useState<'desktop' | 'mobile'>('desktop');

  const handleRestart = () => {
    setKey(Date.now());
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="relative flex flex-col w-full max-w-5xl h-[92vh] max-h-[900px] bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden">
        {/* Top Header Bar */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-800/90 border-b border-slate-700">
          <div className="flex items-center space-x-3">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              <Play className="w-4 h-4 fill-emerald-400" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-xs font-semibold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  DEVELOPER TEST RUNNER
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
              className={`flex items-center space-x-1.5 px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                deviceFrame === 'desktop'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Monitor className="w-3.5 h-3.5" />
              <span>Full Area</span>
            </button>
            <button
              onClick={() => setDeviceFrame('mobile')}
              className={`flex items-center space-x-1.5 px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                deviceFrame === 'mobile'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span>Mobile Simulation</span>
            </button>
          </div>

          {/* Right Action Controls */}
          <div className="flex items-center space-x-2">
            <button
              onClick={handleRestart}
              className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-medium text-slate-200 bg-slate-700/60 hover:bg-slate-700 border border-slate-600 rounded-lg transition-colors"
              title="Restart Game"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Restart</span>
            </button>

            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-700/60 rounded-lg transition-colors ml-2"
              title="Close Test Runner"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Game Canvas Container */}
        <div className="flex-1 relative flex items-center justify-center bg-slate-950 overflow-hidden p-2 sm:p-4">
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
              />
            </div>
          </div>
        </div>

        {/* Bottom Inspector Bar */}
        <div className="flex items-center justify-between px-6 py-2.5 bg-slate-900 border-t border-slate-800 text-xs text-slate-400">
          <div className="flex items-center space-x-4">
            <span className="flex items-center space-x-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>Theme ID: <code className="text-slate-300 font-mono">{theme.id}</code></span>
            </span>
            <span className="hidden sm:inline text-slate-600">|</span>
            <span className="hidden sm:inline">Items: <strong className="text-slate-200">{theme.items_config?.length || 0}</strong></span>
            <span className="hidden sm:inline text-slate-600">|</span>
            <span className="hidden sm:inline">Fall Speed: <strong className="text-slate-200">{theme.physics_config?.baseFallSpeed || 500}px/s</strong></span>
          </div>

          <div className="flex items-center space-x-3 font-mono">
            <span className="text-emerald-400 font-bold">Game Mode: Test Play</span>
          </div>
        </div>
      </div>
    </div>
  );
};
