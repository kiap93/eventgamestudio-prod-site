import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { apiFetch } from '../../lib/api';
import {
  ShieldAlert,
  Building2,
  KeyRound,
  Mail,
  CheckCircle2,
  RefreshCw,
  Lock,
  ArrowRight,
  Eye,
  EyeOff,
  User,
} from 'lucide-react';
import { useLocalization } from '../../context/LocalizationContext';
import { LanguageSelector } from '../common/LanguageSelector';

export const AcceptInvitePage: React.FC = () => {
  const { login, isAuthenticated, currentUser } = useAuth();
  const { t } = useLocalization();
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [invitationInfo, setInvitationInfo] = useState<{
    invitationId: string;
    email: string;
    role: string;
    organizationName: string;
    organizationId: string;
    accountStatus?: 'new_user' | 'existing_password' | 'existing_google' | 'already_member';
    requiresPassword?: boolean;
    alreadyMember?: boolean;
    existingRole?: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Auth method selection: 'google' | 'email'
  const [activeMethod, setActiveMethod] = useState<'google' | 'email'>('google');

  // Google sign-in state
  const [accepting, setAccepting] = useState(false);
  const googleBtnRef = useRef<HTMLDivElement>(null);

  // Email verification state
  const [verificationCode, setVerificationCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [verifyingCode, setVerifyingCode] = useState(false);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Password validation rules (only required for new users who do not have an existing account)
  const requiresPassword = invitationInfo?.requiresPassword !== false;
  const hasMinLength = password.length >= 8;
  const hasLetter = /[a-zA-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const passwordsMatch = password.length > 0 && password === confirmPassword;
  const isPasswordValid = !requiresPassword || (hasMinLength && hasLetter && hasNumber && passwordsMatch);

  const [clientId, setClientId] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const runtimeEnv = (window as any).__ENV__;
      const id = runtimeEnv?.VITE_GOOGLE_CLIENT_ID || runtimeEnv?.GOOGLE_CLIENT_ID;
      if (typeof id === 'string' && id.trim()) return id.trim();
    }
    return import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
  });
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

  // Cooldown countdown timer
  useEffect(() => {
    if (cooldownSeconds <= 0) return;
    const interval = setInterval(() => {
      setCooldownSeconds((prev) => (prev > 1 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [cooldownSeconds]);

  // Load invitation info & check for url params
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const inviteToken = urlParams.get('token');
    const urlCode = urlParams.get('code');

    if (urlCode && /^\d{6}$/.test(urlCode.trim())) {
      setVerificationCode(urlCode.trim());
      setCodeSent(true);
      setActiveMethod('email');
    }

    if (!inviteToken) {
      setError(t('auth.invalidInvitation', undefined, 'This invitation is invalid or has expired.'));
      setLoading(false);
      return;
    }
    setToken(inviteToken);

    apiFetch(`/api/invitations/verify?token=${encodeURIComponent(inviteToken)}`)
      .then(async (res) => {
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || t('auth.invalidInvitation', undefined, 'This invitation is invalid or has expired.'));
        }
        return res.json();
      })
      .then((data) => {
        setInvitationInfo(data);
        if (data.email) {
          // Pre-populate name with email prefix
          const emailPrefix = data.email.split('@')[0];
          setName((prev) => (prev ? prev : emailPrefix));

          // If email is not a Gmail domain, default to 'email' verification method
          const isGmail = data.email.toLowerCase().endsWith('@gmail.com') || data.email.toLowerCase().endsWith('@googlemail.com');
          if (!isGmail && !urlParams.get('method')) {
            setActiveMethod('email');
          }
        }
      })
      .catch((err: any) => {
        setError(err.message);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [t]);

  // Handle Google Accept
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

  // Initialize Google Sign-in button
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
    }

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

  // Send Verification Code via Resend
  const handleSendCode = async () => {
    if (!token || !invitationInfo || sendingCode || cooldownSeconds > 0) return;
    setSendingCode(true);
    setError(null);
    setStatusMessage(null);

    try {
      const res = await apiFetch('/api/invitations/send-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 429 && data.remainingSeconds) {
          setCooldownSeconds(data.remainingSeconds);
        }
        throw new Error(data.error || 'Failed to send verification code');
      }

      setCodeSent(true);
      setCooldownSeconds(60);
      setStatusMessage(
        data.message ||
          `${t('auth.codeSentTo', undefined, 'We sent a 6-digit verification code to')} ${invitationInfo.email}`
      );
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSendingCode(false);
    }
  };

  // Verify Code and Accept Invitation
  const handleVerifyCode = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!token || !invitationInfo || verifyingCode) return;

    const cleanCode = verificationCode.trim();
    if (!cleanCode || cleanCode.length !== 6 || !/^\d{6}$/.test(cleanCode)) {
      setError(t('auth.enterVerificationCode', undefined, 'Enter 6-digit verification code'));
      return;
    }

    const needsPassword = invitationInfo.requiresPassword !== false;

    if (needsPassword) {
      if (!password) {
        setError(t('auth.passwordRequired', undefined, 'Password is required'));
        return;
      }

      if (password.length < 8) {
        setError(t('auth.passwordMinLength', undefined, 'Password must be at least 8 characters long'));
        return;
      }

      if (!hasLetter || !hasNumber) {
        setError(t('auth.passwordComplexity', undefined, 'Password must contain at least one letter and one number'));
        return;
      }

      if (password !== confirmPassword) {
        setError(t('auth.passwordsDoNotMatch', undefined, 'Passwords do not match'));
        return;
      }
    }

    setVerifyingCode(true);
    setError(null);
    setStatusMessage(null);

    try {
      const res = await apiFetch('/api/invitations/verify-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          code: cleanCode,
          ...(needsPassword ? { password, confirmPassword } : {}),
          name: name.trim() ? name.trim() : undefined,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.requiresPassword) {
          setInvitationInfo((prev) => (prev ? { ...prev, requiresPassword: true, accountStatus: 'new_user' } : prev));
        }
        throw new Error(data.error || 'Failed to verify code and accept invitation');
      }

      localStorage.setItem('app_token', data.token);
      if (data.alreadyMember) {
        setStatusMessage(data.message || t('auth.alreadyMemberNotice', undefined, 'You are already a member of this organization. Redirecting...'));
      }
      setTimeout(() => {
        window.location.href = '/';
      }, data.alreadyMember ? 1200 : 100);
    } catch (err: any) {
      setError(err.message);
      setVerifyingCode(false);
    }
  };

  // Dev mode helpers
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
          <span>{t('common.loading', undefined, 'Loading...')}</span>
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
          <h2 className="text-xl font-bold text-slate-100">{t('common.error', undefined, 'Error')}</h2>
          <p className="text-sm text-slate-400 leading-relaxed">{error || t('auth.invalidInvitation', undefined, 'This invitation is invalid or has expired.')}</p>
          <a
            href="/"
            className="inline-block bg-slate-800 hover:bg-slate-700 text-slate-200 px-5 py-2.5 rounded-xl text-sm font-medium transition-colors"
          >
            {t('nav.login', undefined, 'Log In')}
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

      <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-2xl space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex p-3.5 bg-amber-500/10 border border-amber-500/30 rounded-2xl text-amber-400 mb-1">
            <Building2 className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold text-slate-100">{t('auth.invitationTitle', undefined, "You've been invited!")}</h1>
          <p className="text-xs text-slate-400">
            {t('auth.invitationSubtitle', { orgName: invitationInfo?.organizationName, role: invitationInfo?.role }, `Join ${invitationInfo?.organizationName} as ${invitationInfo?.role} to collaborate on event games.`)}
          </p>
        </div>

        {/* Active Session Notice */}
        {isAuthenticated && currentUser && currentUser.email.toLowerCase() === invitationInfo?.email.toLowerCase() && (
          <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-[11px] text-emerald-300 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
            <span>
              Signed in as <strong>{currentUser.email}</strong>.
            </span>
          </div>
        )}

        {/* Already Member Notice */}
        {invitationInfo?.alreadyMember && (
          <div className="p-3.5 bg-amber-500/10 border border-amber-500/30 rounded-xl space-y-2 text-xs">
            <div className="flex items-center gap-2 text-amber-400 font-semibold">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{t('auth.alreadyMemberNotice', undefined, 'You are already a member of this organization.')}</span>
            </div>
            <p className="text-[11px] text-slate-300">
              Role: <strong className="uppercase text-amber-300">{invitationInfo.existingRole || invitationInfo.role}</strong>
            </p>
            <a
              href="/"
              className="inline-flex items-center gap-1.5 text-xs text-amber-400 hover:text-amber-300 underline font-medium"
            >
              <span>Go to Dashboard</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </a>
          </div>
        )}

        {/* Error message */}
        {error && (
          <div className="p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 text-xs flex items-start gap-2.5">
            <ShieldAlert className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
            <span className="leading-relaxed">{error}</span>
          </div>
        )}

        {/* Status message */}
        {statusMessage && (
          <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-300 text-xs flex items-start gap-2.5">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400 mt-0.5" />
            <span className="leading-relaxed">{statusMessage}</span>
          </div>
        )}

        {/* Invitation Details Summary Card */}
        <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 space-y-2.5 text-xs">
          <div className="flex justify-between items-center border-b border-slate-800 pb-2">
            <span className="text-slate-400">{t('auth.email', undefined, 'Email')}:</span>
            <div className="flex items-center gap-1.5 font-semibold text-slate-200">
              <Lock className="w-3 h-3 text-amber-400" />
              <span>{invitationInfo?.email}</span>
            </div>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-slate-400">{t('common.role', undefined, 'Role')}:</span>
            <span className="uppercase font-bold text-amber-400 tracking-wider bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/30">
              {invitationInfo?.role}
            </span>
          </div>
        </div>

        {/* Authentication Method Segmented Tabs */}
        <div className="grid grid-cols-2 p-1 bg-slate-950 border border-slate-800 rounded-xl text-xs font-semibold">
          <button
            type="button"
            onClick={() => {
              setActiveMethod('google');
              setError(null);
            }}
            className={`py-2 px-3 rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              activeMethod === 'google'
                ? 'bg-amber-500 text-slate-950 font-bold shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <span>Google</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveMethod('email');
              setError(null);
            }}
            className={`py-2 px-3 rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              activeMethod === 'email'
                ? 'bg-amber-500 text-slate-950 font-bold shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Mail className="w-3.5 h-3.5" />
            <span>Email Code</span>
          </button>
        </div>

        {/* METHOD 1: GOOGLE SIGN-IN */}
        <div className={activeMethod === 'google' ? 'block space-y-4' : 'hidden'}>
          <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-[11px] text-amber-200/90 leading-relaxed">
            🔒 {t('auth.googleAccountNotice', undefined, 'Google Account email must strictly match this invited email.')}{' '}
            <strong>{invitationInfo?.email}</strong>.
          </div>

          <div className="flex flex-col items-center gap-3">
            {clientId ? (
              <div className="w-full flex flex-col items-center gap-3">
                <div
                  className={`w-full flex justify-center transition-opacity duration-200 ${
                    accepting ? 'pointer-events-none opacity-60' : ''
                  }`}
                >
                  <div ref={googleBtnRef} className="min-h-[44px]" />
                </div>

                {accepting && (
                  <div className="flex items-center justify-center gap-2.5 py-1 text-emerald-400 font-bold text-xs">
                    <div className="w-4 h-4 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin shrink-0" />
                    <span>{t('auth.acceptingInvite', undefined, 'Accepting invitation...')}</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="w-full p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl text-xs space-y-2 text-center">
                <div className="flex items-center justify-center gap-2 text-amber-400 font-bold">
                  <KeyRound className="w-4 h-4" />
                  <span>{t('auth.googleClientIdNeeded', undefined, 'Google OAuth Client ID Needed')}</span>
                </div>
                <p className="text-slate-300 leading-relaxed text-[11px]">
                  {t('auth.googleOauthOptionalDesc', undefined, 'Google OAuth client ID is not configured. Email verification is fully available!')}
                </p>
              </div>
            )}

            {/* Provider Switch Prompt */}
            <div className="pt-2 text-center">
              <button
                type="button"
                onClick={() => setActiveMethod('email')}
                className="text-[11px] text-amber-400 hover:text-amber-300 underline underline-offset-2 transition-colors cursor-pointer"
              >
                {t('auth.nonGoogleNotice', undefined, 'Using Outlook, Yahoo, Hotmail, or a custom work email? Use Email Code to verify instantly.')}
              </button>
            </div>

            {isDev && (
              <div className="w-full pt-3 border-t border-slate-800 text-center">
                <button
                  type="button"
                  onClick={handleDevAccept}
                  disabled={accepting}
                  className="w-full bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs py-2 px-3 rounded-xl font-medium border border-slate-700 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Dev Test Accept as {invitationInfo?.email}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* METHOD 2: EMAIL VERIFICATION CODE (All Email Providers) */}
        <div className={activeMethod === 'email' ? 'block space-y-4' : 'hidden'}>
          <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-[11px] text-amber-200/90 leading-relaxed">
            ✉️ {t('auth.nonGoogleNotice', undefined, 'Using Outlook, Yahoo, Hotmail, or a custom work email? Use Email Code to verify instantly.')}
          </div>

          {!codeSent && !verificationCode ? (
            /* STEP 2A: REQUEST VERIFICATION CODE */
            <div className="space-y-4">
              <div className="p-4 bg-slate-950/80 border border-slate-800 rounded-xl text-center space-y-2">
                <div className="w-10 h-10 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 mx-auto">
                  <Mail className="w-5 h-5" />
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Click below to receive a single-use 6-digit verification code sent directly to <strong>{invitationInfo?.email}</strong>.
                </p>
                <p className="text-[11px] text-slate-500">
                  {t('auth.codeExpiryNotice', undefined, 'Code expires in 15 minutes. Single-use only.')}
                </p>
              </div>

              <button
                type="button"
                onClick={handleSendCode}
                disabled={sendingCode || cooldownSeconds > 0}
                className="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold py-3 px-4 rounded-xl text-xs transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed shadow-lg shadow-amber-500/20"
              >
                {sendingCode ? (
                  <>
                    <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                    <span>{t('auth.sendingCode', undefined, 'Sending code...')}</span>
                  </>
                ) : (
                  <>
                    <Mail className="w-4 h-4" />
                    <span>
                      {cooldownSeconds > 0
                        ? t('auth.resendAvailableIn', { seconds: cooldownSeconds }, `Resend available in ${cooldownSeconds}s`)
                        : t('auth.sendVerificationCode', undefined, 'Send Verification Code')}
                    </span>
                  </>
                )}
              </button>

              <div className="text-center">
                <button
                  type="button"
                  onClick={() => setCodeSent(true)}
                  className="text-[11px] text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
                >
                  Already have a code? Click here to enter
                </button>
              </div>
            </div>
          ) : (
            /* STEP 2B: ENTER VERIFICATION CODE & ACCEPT */
            <form onSubmit={handleVerifyCode} className="space-y-4">
              <div className="space-y-1.5">
                <div className="flex justify-between items-center text-xs">
                  <label className="text-slate-300 font-semibold flex items-center gap-1.5">
                    <span>{t('auth.verificationCode', undefined, 'Verification Code')}</span>
                    <span className="text-amber-400">*</span>
                  </label>
                  <span className="text-[10px] text-slate-400">6 digits</span>
                </div>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  autoComplete="one-time-code"
                  autoFocus
                  placeholder="123456"
                  value={verificationCode}
                  onChange={(e) => {
                    const cleaned = e.target.value.replace(/\D/g, '').slice(0, 6);
                    setVerificationCode(cleaned);
                  }}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 rounded-xl px-4 py-3 text-center text-2xl font-mono tracking-[0.35em] text-amber-400 placeholder:text-slate-700 outline-none transition-all"
                  required
                />
              </div>

              {/* Display Name & Password Fields: ONLY rendered for NEW accounts */}
              {requiresPassword ? (
                <>
                  {/* Display Name (optional) */}
                  <div className="space-y-1">
                    <label className="text-[11px] text-slate-300 font-medium flex items-center gap-1">
                      <User className="w-3 h-3 text-slate-400" />
                      <span>{t('auth.displayName', undefined, 'Display Name (optional)')}</span>
                    </label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Your Name"
                      className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-xl px-3.5 py-2 text-xs text-slate-200 outline-none transition-colors"
                    />
                  </div>

                  {/* Password Field (Required) */}
                  <div className="space-y-1">
                    <label className="text-[11px] text-slate-300 font-medium flex items-center justify-between">
                      <span className="flex items-center gap-1">
                        <Lock className="w-3 h-3 text-amber-400" />
                        <span>{t('auth.createPassword', undefined, 'Create Password')}</span>
                        <span className="text-amber-400">*</span>
                      </span>
                      <span className="text-[10px] text-slate-500">min. 8 chars</span>
                    </label>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Enter password (min 8 characters)"
                        className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-xl pl-3.5 pr-10 py-2.5 text-xs text-slate-200 outline-none transition-colors"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 p-1"
                        tabIndex={-1}
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    {/* Password requirements indicators */}
                    {password.length > 0 && (
                      <div className="flex items-center gap-3 pt-1 text-[10px]">
                        <span className={`flex items-center gap-1 ${hasMinLength ? 'text-emerald-400' : 'text-slate-500'}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${hasMinLength ? 'bg-emerald-400' : 'bg-slate-600'}`} />
                          8+ characters
                        </span>
                        <span className={`flex items-center gap-1 ${hasLetter ? 'text-emerald-400' : 'text-slate-500'}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${hasLetter ? 'bg-emerald-400' : 'bg-slate-600'}`} />
                          Letter
                        </span>
                        <span className={`flex items-center gap-1 ${hasNumber ? 'text-emerald-400' : 'text-slate-500'}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${hasNumber ? 'bg-emerald-400' : 'bg-slate-600'}`} />
                          Number
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Confirm Password Field (Required) */}
                  <div className="space-y-1">
                    <label className="text-[11px] text-slate-300 font-medium flex items-center justify-between">
                      <span className="flex items-center gap-1">
                        <Lock className="w-3 h-3 text-amber-400" />
                        <span>{t('auth.confirmPassword', undefined, 'Confirm Password')}</span>
                        <span className="text-amber-400">*</span>
                      </span>
                      {confirmPassword && (
                        <span className={`text-[10px] font-medium ${passwordsMatch ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {passwordsMatch ? 'Passwords match' : 'Passwords do not match'}
                        </span>
                      )}
                    </label>
                    <div className="relative">
                      <input
                        type={showConfirmPassword ? 'text' : 'password'}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Confirm password"
                        className={`w-full bg-slate-950 border rounded-xl pl-3.5 pr-10 py-2.5 text-xs text-slate-200 outline-none transition-colors ${
                          confirmPassword && !passwordsMatch ? 'border-rose-500/60 focus:border-rose-500' : 'border-slate-800 focus:border-amber-500'
                        }`}
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 p-1"
                        tabIndex={-1}
                        aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                      >
                        {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                /* Existing User Notice: NO password fields needed! */
                <div className="p-3.5 bg-slate-950/70 border border-slate-800 rounded-xl space-y-1.5 text-xs text-slate-300">
                  <div className="flex items-center gap-2 text-emerald-400 font-semibold text-xs">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span>{t('auth.existingAccountDetected', undefined, 'Existing Account Detected')}</span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    {t(
                      'auth.existingAccountNotice',
                      undefined,
                      'Your existing password and credentials will remain unchanged. Enter the 6-digit code sent to your email to verify and join.'
                    )}
                  </p>
                </div>
              )}

              {/* Submit Button */}
              <button
                type="submit"
                disabled={verifyingCode || verificationCode.trim().length !== 6 || !isPasswordValid}
                className="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold py-3 px-4 rounded-xl text-xs transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-amber-500/20"
              >
                {verifyingCode ? (
                  <>
                    <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                    <span>{t('auth.verifying', undefined, 'Verifying code...')}</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>
                      {invitationInfo?.alreadyMember
                        ? t('auth.confirmAndGoToDashboard', undefined, 'Confirm & Open Dashboard')
                        : requiresPassword
                        ? t('auth.createAccountAndAccept', undefined, 'Create Password & Accept Invitation')
                        : t('auth.verifyAndAccept', undefined, 'Verify & Accept Invitation')}
                    </span>
                  </>
                )}
              </button>

              {/* Resend Code Options */}
              <div className="flex items-center justify-between text-[11px] pt-1 text-slate-400">
                <button
                  type="button"
                  onClick={handleSendCode}
                  disabled={sendingCode || cooldownSeconds > 0}
                  className="flex items-center gap-1.5 hover:text-amber-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${sendingCode ? 'animate-spin' : ''}`} />
                  <span>
                    {cooldownSeconds > 0
                      ? t('auth.resendAvailableIn', { seconds: cooldownSeconds }, `Resend available in ${cooldownSeconds}s`)
                      : t('auth.resendCode', undefined, 'Resend code')}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setCodeSent(false);
                    setVerificationCode('');
                    setError(null);
                  }}
                  className="hover:text-slate-200 transition-colors cursor-pointer"
                >
                  Request new code
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
