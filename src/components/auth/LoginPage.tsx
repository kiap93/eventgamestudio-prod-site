import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { apiFetch } from '../../lib/api';
import { Gamepad2, ShieldAlert, Sparkles, Trophy, Zap, AlertCircle } from 'lucide-react';
import { useLocalization } from '../../context/LocalizationContext';
import { LanguageSelector } from '../common/LanguageSelector';

declare global {
  interface Window {
    google?: any;
  }
}

export const LoginPage: React.FC = () => {
  const { login } = useAuth();
  const { t } = useLocalization();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clientId, setClientId] = useState<string>(
    import.meta.env.VITE_GOOGLE_CLIENT_ID || ''
  );
  const googleBtnRef = useRef<HTMLDivElement>(null);
  const isDev = import.meta.env.DEV;

  useEffect(() => {
    if (!clientId) {
      apiFetch('/api/config')
        .then((res) => res.json())
        .then((data) => {
          if (data.googleClientId) {
            setClientId(data.googleClientId);
          }
        })
        .catch(() => {});
    }
  }, [clientId]);

  const handleCredentialResponse = async (credential: string) => {
    setLoading(true);
    setError(null);
    try {
      await login(credential);
    } catch (err: any) {
      console.error('Google Sign-in failed:', err);
      setError(err?.message || t('errors.generic'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!clientId) return;

    let interval: any;

    const initGsi = () => {
      if (window.google?.accounts?.id) {
        try {
          window.google.accounts.id.initialize({
            client_id: clientId,
            callback: (response: { credential: string }) => {
              if (response?.credential) {
                handleCredentialResponse(response.credential);
              }
            },
            auto_select: false,
          });

          if (googleBtnRef.current) {
            googleBtnRef.current.innerHTML = '';
            window.google.accounts.id.renderButton(googleBtnRef.current, {
              theme: 'filled_blue',
              size: 'large',
              shape: 'rectangular',
              text: 'continue_with',
              width: 320,
            });
          }
        } catch (err) {
          console.error('Failed to initialize Google Sign-In:', err);
        }
        return true;
      }
      return false;
    };

    if (!initGsi()) {
      interval = setInterval(() => {
        if (initGsi()) {
          clearInterval(interval);
        }
      }, 200);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [clientId]);

  const handleDevLogin = (devEmail: string = 'organizer@eventgamestudio.com', devName: string = 'Studio Organizer') => {
    if (!isDev) return;
    const mockToken = `mock_google_id_token_${devEmail.replace(/[^a-zA-Z0-9]/g, '_')}`;
    handleCredentialResponse(mockToken);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-center items-center p-4 relative overflow-hidden font-sans">
      {/* Background glow effects */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 left-1/3 w-80 h-80 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Top Language Selector */}
      <div className="absolute top-4 right-4 z-20">
        <LanguageSelector variant="compact" />
      </div>

      <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-8 sm:p-10 shadow-2xl relative z-10 flex flex-col items-center text-center">
        {/* Logo and Branding */}
        <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 mb-6 shadow-inner">
          <Gamepad2 className="w-8 h-8" />
        </div>

        <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white mb-2">
          Event Game Studio
        </h1>

        <p className="text-sm text-slate-400 mb-8 leading-relaxed">
          {t('auth.signInToContinue')}
        </p>

        {/* Feature Highlights */}
        <div className="w-full grid grid-cols-3 gap-2.5 mb-8 text-left">
          <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-2.5 flex flex-col items-center text-center">
            <Sparkles className="w-4 h-4 text-amber-400 mb-1" />
            <span className="text-[11px] font-bold text-slate-200">{t('nav.themes')}</span>
          </div>
          <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-2.5 flex flex-col items-center text-center">
            <Zap className="w-4 h-4 text-emerald-400 mb-1" />
            <span className="text-[11px] font-bold text-slate-200">{t('landing.instantSetup')}</span>
          </div>
          <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-2.5 flex flex-col items-center text-center">
            <Trophy className="w-4 h-4 text-amber-400 mb-1" />
            <span className="text-[11px] font-bold text-slate-200">{t('nav.leaderboard')}</span>
          </div>
        </div>

        {/* Error message */}
        {error && (
          <div className="w-full mb-6 p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-400 text-xs flex items-center gap-2 text-left">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Google Sign-In Container */}
        <div className="w-full flex flex-col items-center">
          <div
            ref={googleBtnRef}
            className="w-full min-h-[44px] flex items-center justify-center"
          />

          {!clientId && !window.google && (
            <p className="text-xs text-slate-500 mt-2">
              {t('common.loading')}
            </p>
          )}

          {loading && (
            <div className="flex items-center gap-2 text-xs text-amber-400 mt-4 animate-pulse">
              <div className="w-3.5 h-3.5 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
              <span>{t('auth.signingIn')}</span>
            </div>
          )}
        </div>

        {/* Development Quick-Login Helper */}
        {isDev && (
          <div className="w-full mt-8 pt-6 border-t border-slate-800/80">
            <p className="text-[11px] font-mono text-slate-500 uppercase tracking-wider mb-3">
              Development Test Login
            </p>
            <div className="flex flex-col gap-2 w-full">
              <button
                type="button"
                onClick={() => handleDevLogin('organizer@eventgamestudio.com', 'Dev Organizer')}
                className="w-full py-2 px-3 bg-slate-800 hover:bg-slate-750 text-slate-300 font-semibold text-xs rounded-xl border border-slate-700 transition-colors flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>Sign in as Organizer (Dev)</span>
              </button>
              <button
                type="button"
                onClick={() => handleDevLogin('kiap93.KMJ@gmail.com', 'Developer Admin')}
                className="w-full py-2 px-3 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 font-semibold text-xs rounded-xl border border-emerald-500/30 transition-colors flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>Sign in as Admin (kiap93.KMJ@gmail.com)</span>
              </button>
            </div>
          </div>
        )}

        {/* Footer info */}
        <p className="text-[11px] text-slate-500 mt-8">
          By signing in, you agree to Event Game Studio's Terms of Service and Privacy Policy.
        </p>
      </div>
    </div>
  );
};
