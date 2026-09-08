import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Play, AlertTriangle } from 'lucide-react';

export interface StartScreenErrorBoundaryProps {
  children: ReactNode;
  gameTitle?: string;
  gameSubtitle?: string;
  onStartGame: () => void;
  onShowLeaderboard?: () => void;
  onShowGuide?: () => void;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class StartScreenErrorBoundary extends React.Component<StartScreenErrorBoundaryProps, State> {
  props: StartScreenErrorBoundaryProps;
  state: State = {
    hasError: false,
  };

  constructor(props: StartScreenErrorBoundaryProps) {
    super(props);
    this.props = props;
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[StartScreenErrorBoundary] Captured error rendering Start Screen:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      const title = this.props.gameTitle || 'EVENT GAME';
      const subtitle =
        this.props.gameSubtitle ||
        'Welcome! Press the button below to start playing.';

      return (
        <div className="absolute inset-0 w-full h-full flex items-center justify-center p-4 bg-slate-950/95 z-50 select-none overflow-hidden animate-in fade-in duration-200">
          <div className="max-w-md w-full bg-slate-900 border-2 border-amber-500/80 rounded-3xl p-6 sm:p-8 text-center shadow-2xl relative space-y-5">
            <div className="flex items-center justify-center gap-1.5 text-amber-400 text-xs font-mono uppercase tracking-wider bg-amber-500/10 border border-amber-500/20 py-1 px-3 rounded-full mx-auto w-fit">
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>Safe Start Mode</span>
            </div>

            <div className="space-y-2">
              <h1 className="text-2xl sm:text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-amber-300 via-amber-100 to-amber-400 uppercase tracking-wide">
                {title}
              </h1>
              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed max-w-xs mx-auto">
                {subtitle}
              </p>
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={this.props.onStartGame}
                className="w-full py-3.5 px-6 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 font-black text-lg sm:text-xl rounded-2xl shadow-[0_0_20px_rgba(16,185,129,0.4)] transition-all transform hover:scale-105 active:scale-95 flex items-center justify-center gap-2 cursor-pointer"
              >
                <Play className="w-5 h-5 fill-slate-950" />
                <span>START GAME</span>
              </button>
            </div>

            {(this.props.onShowLeaderboard || this.props.onShowGuide) && (
              <div className="flex items-center justify-center gap-4 pt-2 border-t border-slate-800/80 text-xs font-semibold text-amber-400">
                {this.props.onShowLeaderboard && (
                  <button
                    type="button"
                    onClick={this.props.onShowLeaderboard}
                    className="hover:underline cursor-pointer"
                  >
                    High Scores
                  </button>
                )}
                {this.props.onShowGuide && (
                  <button
                    type="button"
                    onClick={this.props.onShowGuide}
                    className="hover:underline cursor-pointer"
                  >
                    Game Guide
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
