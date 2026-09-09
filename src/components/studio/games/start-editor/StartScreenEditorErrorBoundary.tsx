import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RotateCcw, X, RefreshCw } from 'lucide-react';

export interface StartScreenEditorErrorBoundaryProps {
  children: ReactNode;
  onResetLayout?: () => void;
  onClose?: () => void;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class StartScreenEditorErrorBoundary extends React.Component<StartScreenEditorErrorBoundaryProps, State> {
  props: StartScreenEditorErrorBoundaryProps;
  state: State = {
    hasError: false,
  };
  setState!: (state: Partial<State> | ((prevState: State) => Partial<State>)) => void;

  constructor(props: StartScreenEditorErrorBoundaryProps) {
    super(props);
    this.props = props;
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[StartScreenEditorErrorBoundary] Captured editor workspace error:', error, errorInfo);
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: undefined });
  };

  private handleReset = () => {
    this.props.onResetLayout?.();
    this.setState({ hasError: false, error: undefined });
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center w-full h-full min-h-[500px] p-6 bg-slate-950 text-slate-100 select-none">
          <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-5 text-center">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>

            <div className="space-y-1.5">
              <h3 className="text-base font-bold text-white">Start Screen Editor Notice</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                The visual editor encountered an unexpected issue while rendering this layout. You can reset to the recommended default layout or close the editor.
              </p>
              {this.state.error && (
                <div className="mt-2 p-2 bg-slate-950 border border-slate-800 rounded-lg text-left overflow-x-auto max-h-24">
                  <code className="text-[11px] font-mono text-rose-400">
                    {this.state.error.message || String(this.state.error)}
                  </code>
                </div>
              )}
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-2.5 pt-2">
              <button
                type="button"
                onClick={this.handleRetry}
                className="w-full sm:w-auto px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl border border-slate-700 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Retry</span>
              </button>

              {this.props.onResetLayout && (
                <button
                  type="button"
                  onClick={this.handleReset}
                  className="w-full sm:w-auto px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold rounded-xl transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow-md shadow-amber-500/10"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reset to Defaults</span>
                </button>
              )}

              {this.props.onClose && (
                <button
                  type="button"
                  onClick={this.props.onClose}
                  className="w-full sm:w-auto px-4 py-2 bg-slate-950 hover:bg-slate-800 text-slate-300 text-xs font-semibold rounded-xl border border-slate-800 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>Close Editor</span>
                </button>
              )}
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
