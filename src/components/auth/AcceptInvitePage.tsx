import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { apiFetch } from '../../lib/api';
import { UserCheck, ShieldAlert, Building2, KeyRound } from 'lucide-react';
import { useLocalization } from '../../context/LocalizationContext';
import { LanguageSelector } from '../common/LanguageSelector';

export const AcceptInvitePage: React.FC = () => {
  const { login } = useAuth();
  const { t } = useLocalization();
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [invitationInfo, setInvitationInfo] = useState<{
    invitationId: string;
    email: string;
    role: string;
    organizationName: string;
    organizationId: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);
  const googleBtnRef = useRef<HTMLDivElement>(null);

  const [clientId, setClientId] = useState<string>(import.meta.env.VITE_GOOGLE_CLIENT_ID || '');
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

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const inviteToken = urlParams.get('token');
    if (!inviteToken) {
      setError(t('auth.invalidInvitation'));
      setLoading(false);
      return;
    }
    setToken(inviteToken);

    apiFetch(`/api/invitations/verify?token=${encodeURIComponent(inviteToken)}`)
      .then(async (res) => {
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || t('auth.invalidInvitation'));
        }
        return res.json();
      })
      .then((data) => {
        setInvitationInfo(data);
      })
      .catch((err: any) => {
        setError(err.message);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [t]);

  const handleAcceptToken = async (idTokenToUse: string) => {
    if (!token || !invitationInfo) return;
    setAccepting(true);
    setError(null);

    try {
      const res = await apiFetch('/api/invitations/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          idToken: idTokenToUse,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to accept invitation');
      }

      const data = await res.json();
      localStorage.setItem('app_token', data.token);
      window.location.href = '/';
    } catch (err: any) {
      setError(err.message);
      setAccepting(false);
    }
  };

  useEffect(() => {
    if (!invitationInfo || !clientId) return;

    let interval: any;

    const initGsi = () => {
      if (window.google?.accounts?.id) {
        try {
          window.google.accounts.id.initialize({
            client_id: clientId,
            callback: (response: { credential: string }) => {
              if (response?.credential) {
                handleAcceptToken(response.credential);
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
              width: 300,
            });
          }
        } catch (err) {
          console.error('Failed to init GSI in accept invite:', err);
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
  }, [invitationInfo, clientId]);

  const handleDevAccept = () => {
    if (!isDev || !invitationInfo) return;
    const mockToken = `mock_google_id_token_${invitationInfo.email.replace(/[^a-zA-Z0-9]/g, '_')}`;
    handleAcceptToken(mockToken);
  };

  if (loading) {
    return (
      <div className="min-w-screen min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4 font-sans">
        <div className="flex items-center gap-3 text-amber-400 font-bold">
          <div className="w-6 h-6 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
          <span>{t('common.loading')}</span>
        </div>
      </div>
    );
  }

  if (error && !invitationInfo) {
    return (
      <div className="min-w-screen min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-4 font-sans">
        <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center space-y-4 shadow-2xl">
          <div className="inline-flex p-3 bg-rose-500/10 border border-rose-500/30 rounded-2xl text-rose-400">
            <ShieldAlert className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold text-slate-100">{t('common.error')}</h2>
          <p className="text-sm text-slate-400 leading-relaxed">{error || t('auth.invalidInvitation')}</p>
          <a
            href="/"
            className="inline-block bg-slate-800 hover:bg-slate-700 text-slate-200 px-5 py-2.5 rounded-xl text-sm font-medium transition-colors"
          >
            {t('nav.login')}
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-w-screen min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-4 font-sans relative">
      <div className="absolute top-4 right-4 z-20">
        <LanguageSelector variant="compact" />
      </div>

      <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-2xl space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex p-3.5 bg-amber-500/10 border border-amber-500/30 rounded-2xl text-amber-400 mb-2">
            <Building2 className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold text-slate-100">{t('auth.invitationTitle')}</h1>
          <p className="text-xs text-slate-400">
            {t('auth.invitationSubtitle', { orgName: invitationInfo?.organizationName, role: invitationInfo?.role })}
          </p>
        </div>

        {error && (
          <div className="p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 text-xs flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{error}</span>
          </div>
        )}

        <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-2 text-xs">
          <div className="flex justify-between items-center border-b border-slate-800 pb-2">
            <span className="text-slate-400">{t('auth.email')}:</span>
            <span className="font-semibold text-slate-200">{invitationInfo?.email}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-slate-400">{t('common.role')}:</span>
            <span className="uppercase font-bold text-amber-400 tracking-wider bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/30">
              {invitationInfo?.role}
            </span>
          </div>
        </div>

        <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-[11px] text-amber-200/90 leading-relaxed">
          🔒 Server verifies that your Google Account email strictly matches{' '}
          <strong>{invitationInfo?.email}</strong> before granting access.
        </div>

        <div className="flex flex-col items-center gap-4">
          {accepting ? (
            <div className="flex items-center gap-3 py-3 text-emerald-400 font-bold text-sm">
              <div className="w-5 h-5 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
              <span>{t('auth.acceptingInvite')}</span>
            </div>
          ) : clientId ? (
            <div className="w-full flex justify-center">
              <div ref={googleBtnRef} className="min-h-[44px]" />
            </div>
          ) : (
            <div className="w-full p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl text-xs space-y-2 text-center">
              <div className="flex items-center justify-center gap-2 text-amber-400 font-bold">
                <KeyRound className="w-4 h-4" />
                <span>Google OAuth Client ID Needed</span>
              </div>
              <p className="text-slate-300 leading-relaxed text-[11px]">
                Please configure <code className="bg-slate-950 px-1.5 py-0.5 rounded text-amber-300">VITE_GOOGLE_CLIENT_ID</code> in your <code className="bg-slate-950 px-1.5 py-0.5 rounded text-amber-300">.env</code> file.
              </p>
            </div>
          )}

          {isDev && (
            <div className="w-full pt-3 border-t border-slate-800 text-center">
              <button
                onClick={handleDevAccept}
                disabled={accepting}
                className="w-full bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs py-2.5 px-4 rounded-xl font-medium border border-slate-700 transition-colors cursor-pointer"
              >
                Dev Test Accept as {invitationInfo?.email}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
