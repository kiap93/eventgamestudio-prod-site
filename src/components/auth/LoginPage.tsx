import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { ShieldCheck, Gamepad2, AlertTriangle, KeyRound } from 'lucide-react';

declare global {
  interface Window {
    google?: any;
  }
}

export const LoginPage: React.FC = () => {
  const { login } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gsiLoaded, setGsiLoaded] = useState(false);
  const [clientId, setClientId] = useState<string>(import.meta.env.VITE_GOOGLE_CLIENT_ID || '');
  const googleBtnRef = useRef<HTMLDivElement>(null);

  const isDev = import.meta.env.DEV;

  // Fetch client ID from server if not set at build time
  useEffect(() => {
    if (!clientId) {
      fetch('/api/config')
        .then((res) => res.json())
        .then((data) => {
          if (data.googleClientId) {
            setClientId(data.googleClientId);
          }
        })
        .catch(() => {});
    }
  }, [clientId]);

  useEffect(() => {
    let interval: any;

    const initGsi = () => {
      if (window.google?.accounts?.id) {
        setGsiLoaded(true);

        if (clientId) {
          try {
            window.google.accounts.id.initialize({
              client_id: clientId,
              callback: async (response: { credential: string }) => {
                if (!response.credential) return;
                setLoading(true);
                setError(null);
                try {
                  await login(response.credential);
                } catch (err: any) {
                  setError(err.message || 'Google authentication failed');
                } finally {
                  setLoading(false);
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
          } catch (err: any) {
            console.error('Failed to initialize Google Identity Services:', err);
          }
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
  }, [clientId, login]);

  // Dev mode mock login handler (strictly restricted to DEV environment)
  const handleDevMockLogin = async (email: string) => {
    if (!isDev) return;
    setLoading(true);
    setError(null);
    try {
      const mockToken = `mock_google_id_token_${email.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
      await login(mockToken);
    } catch (err: any) {
      setError(err.message || 'Mock sign in failed');
    } finally {
      setLoading(false);
    }
  };

  const triggerGooglePrompt = () => {
    if (window.google?.accounts?.id && clientId) {
      window.google.accounts.id.prompt();
    }
  };

  return (
    <div className="min-w-screen min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-center items-center p-4 relative overflow-hidden font-sans">
      {/* Background glowing ambient circles */}
      <div className="absolute -top-32 -left-32 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-32 -right-32 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-md w-full bg-slate-900/90 border border-slate-800 rounded-2xl p-8 shadow-2xl relative z-10 backdrop-blur-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center p-3 bg-amber-500/10 border border-amber-500/30 rounded-2xl mb-3 text-amber-400">
            <Gamepad2 className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-amber-400">
            Durian Catcher Studio
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Multi-Tenant Custom Game Platform for Enterprise & Brands
          </p>
        </div>

        {error && (
          <div className="mb-6 p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{error}</span>
          </div>
        )}

        <div className="space-y-6 flex flex-col items-center">
          {loading ? (
            <div className="flex items-center gap-3 py-4 text-amber-400">
              <div className="w-5 h-5 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
              <span className="text-sm font-semibold">Verifying Google Authentication...</span>
            </div>
          ) : clientId ? (
            <div className="w-full flex flex-col items-center gap-3">
              {/* Container for Google Identity Services Button */}
              <div ref={googleBtnRef} className="flex justify-center min-h-[44px]" />

              {!gsiLoaded && (
                <div className="text-xs text-slate-500 animate-pulse">
                  Loading Google Sign-In SDK...
                </div>
              )}

              <button
                onClick={triggerGooglePrompt}
                className="text-xs text-slate-400 hover:text-amber-400 underline transition-colors pt-1"
              >
                Or click here for Google One Tap Prompt
              </button>
            </div>
          ) : (
            <div className="w-full p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl text-xs space-y-2">
              <div className="flex items-center gap-2 text-amber-400 font-bold">
                <KeyRound className="w-4 h-4" />
                <span>Google OAuth Client ID Needed</span>
              </div>
              <p className="text-slate-300 leading-relaxed text-[11px]">
                Please configure <code className="bg-slate-950 px-1.5 py-0.5 rounded text-amber-300">VITE_GOOGLE_CLIENT_ID</code> in your <code className="bg-slate-950 px-1.5 py-0.5 rounded text-amber-300">.env</code> file with your Google OAuth Web Client ID.
              </p>
            </div>
          )}

          {/* Development Mode Sign-In Option (Strictly restricted to DEV environment) */}
          {isDev && (
            <div className="w-full pt-4 border-t border-slate-800 space-y-3">
              <div className="text-[10px] uppercase font-bold text-slate-500 tracking-wider text-center">
                Development Mode Test Sign-In
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => handleDevMockLogin('company.owner')}
                  disabled={loading}
                  className="bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs py-2 px-3 rounded-lg font-medium transition-colors border border-slate-700"
                >
                  Test Owner
                </button>
                <button
                  onClick={() => handleDevMockLogin('staff.designer')}
                  disabled={loading}
                  className="bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs py-2 px-3 rounded-lg font-medium transition-colors border border-slate-700"
                >
                  Test Staff
                </button>
              </div>
            </div>
          )}

          <div className="w-full bg-slate-950/60 border border-slate-800/80 rounded-xl p-3.5 text-xs text-slate-400 space-y-2">
            <div className="flex items-center gap-1.5 text-slate-300 font-medium">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>Real Server-Side Google ID Token Verification</span>
            </div>
            <p className="text-slate-400 leading-relaxed text-[11px]">
              Verifies cryptographically signed Google ID tokens, audience IDs, and organization access before issuing signed backend JWTs.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

