import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { apiFetch } from '../../lib/api';
import { navigateTo } from '../../hooks/useRouteContext';
import { maskEmail } from '../../lib/maskEmail';
import {
  ShieldCheck,
  Gamepad2,
  AlertTriangle,
  KeyRound,
  ArrowLeft,
  Mail,
  Lock,
  Eye,
  EyeOff,
  CheckCircle2,
  RefreshCw,
  Send,
  Clock,
  Info,
  ShieldAlert, 
  Sparkles, 
  Trophy, 
  Zap, 
  AlertCircle
} from 'lucide-react';
import { useLocalization } from '../../context/LocalizationContext';
import { LanguageSelector } from '../common/LanguageSelector';

declare global {
  interface Window {
    google?: any;
  }
}

type AuthMode = 'signin' | 'signup' | 'forgot_password' | 'verification_pending' | 'unverified_recovery';

export const LoginPage: React.FC = () => {
  const {
    login,
    loginWithEmail,
    registerWithEmail,
    resendVerificationEmail,
    requestPasswordReset,
    isAuthenticated,
    isLoading,
  } = useAuth();

  const [authMode, setAuthMode] = useState<AuthMode>('signin');

  // Common form inputs
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const { t } = useLocalization();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Unverified account state (for login attempts with unverified email)
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null);
  const [resendingVerification, setResendingVerification] = useState(false);
  const [resendStatusMessage, setResendStatusMessage] = useState<string | null>(null);
  const [resendErrorMessage, setResendErrorMessage] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState<number>(0);

  // Resend cooldown timer
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  const [gsiLoaded, setGsiLoaded] = useState(false);
  const [clientId, setClientId] = useState<string>(
    import.meta.env.VITE_GOOGLE_CLIENT_ID || ''
  );
  const googleBtnRef = useRef<HTMLDivElement>(null);
  const isDev = import.meta.env.DEV;

  // Password validation rules
  const hasMinLength = password.length >= 8;
  const hasLetter = /[a-zA-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const passwordsMatch = password.length > 0 && password === confirmPassword;

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
        setGsiLoaded(true);
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
  }, [clientId, login, authMode]);

   useEffect(() => {
    if ((authMode === 'signin' || authMode === 'signup') && window.google?.accounts?.id && googleBtnRef.current && clientId) {
      googleBtnRef.current.innerHTML = '';
      window.google.accounts.id.renderButton(googleBtnRef.current, {
        theme: 'filled_blue',
        size: 'large',
        shape: 'rectangular',
        text: 'continue_with',
        width: 320,
      });
    }
  }, [authMode, clientId]);

   const handleDevMockLogin = async (mockEmail: string) => {
    if (!isDev) return;
    setLoading(true);
    setError(null);
    try {
      const mockToken = `mock_google_id_token_${mockEmail.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
      await login(mockToken);
      const redirectUrl = new URLSearchParams(window.location.search).get('redirect') || '/events';
      navigateTo(redirectUrl);
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

  // Email & Password Sign In
  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError('Email and password are required');
      return;
    }

    setLoading(true);
    setError(null);
    setResendStatusMessage(null);
    setResendErrorMessage(null);

    try {
      const result = await loginWithEmail(email.trim(), password);
      if (result.unverified || result.code === 'EMAIL_NOT_VERIFIED') {
        setUnverifiedEmail(result.email || email.trim());
        setError(null);
        setAuthMode('unverified_recovery');
        return;
      }
      if (!result.success) {
        setError(result.error || 'Invalid email or password');
        return;
      }
      const redirectUrl = new URLSearchParams(window.location.search).get('redirect') || '/events';
      navigateTo(redirectUrl);
    } catch (err: any) {
      if (
        err.code === 'EMAIL_NOT_VERIFIED' ||
        err.unverified ||
        (err.message && /verify your email/i.test(err.message))
      ) {
        setUnverifiedEmail(err.email || email.trim());
        setError(null);
        setAuthMode('unverified_recovery');
        return;
      }
      setError(err.message || 'Invalid email or password');
    } finally {
      setLoading(false);
    }
  };

  // Normal Email/Password Registration
  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setResendStatusMessage(null);
    setResendErrorMessage(null);

    if (!email.trim()) {
      setError('Please enter your email address');
      return;
    }

    if (!hasMinLength || !hasLetter || !hasNumber) {
      setError('Password must be at least 8 characters long and contain at least one letter and one number.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);

    try {
      const res = await registerWithEmail(email.trim(), password, confirmPassword);
      const registeredEmail = res.email || email.trim();
      setUnverifiedEmail(registeredEmail);
      sessionStorage.setItem('pending_verification_email', registeredEmail);
      // Immediately navigate to the Verify Email page with the registered email preserved
      navigateTo(`/verify-email?email=${encodeURIComponent(registeredEmail)}`);
    } catch (err: any) {
      setError(err.message || 'Failed to create account');
    } finally {
      setLoading(false);
    }
  };

  // Resend verification email
  const handleResendVerification = async (targetEmail: string) => {
    if (!targetEmail || resendingVerification || resendCooldown > 0) return;
    setResendingVerification(true);
    setResendStatusMessage(null);
    setResendErrorMessage(null);
    setError(null);

    try {
      const res = await resendVerificationEmail(targetEmail);
      if (res.already_verified) {
        setResendStatusMessage('This email is already verified. Please sign in to your account.');
        return;
      }
      setResendStatusMessage(
        res.message || 'Verification email sent. Please check your inbox and Spam/Junk folder.'
      );
      setResendCooldown(60);
    } catch (err: any) {
      setResendErrorMessage(err.message || "We couldn't send the verification email. Please try again.");
    } finally {
      setResendingVerification(false);
    }
  };

  // Forgot password request
  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setError('Please enter your email address');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const res = await requestPasswordReset(email.trim());
      setSuccessMessage(
        res.message || 'If an account with that email exists, a password reset link has been sent.'
      );
    } catch (err: any) {
      setError(err.message || 'Failed to request password reset');
    } finally {
      setLoading(false);
    }
  };


 return (
    <div className="min-w-screen min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-center items-center p-4 relative overflow-hidden font-sans">
      {/* Background glowing ambient circles */}
      <div className="absolute -top-32 -left-32 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-32 -right-32 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Top back navigation link */}
      <div className="w-full max-w-md mb-4 flex items-center justify-start z-10">
        <button
          onClick={() => navigateTo('/')}
          className="inline-flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-amber-400 transition-colors py-2 px-3 rounded-xl bg-slate-900/80 hover:bg-slate-900 border border-slate-800 hover:border-amber-500/30 group cursor-pointer shadow-md"
        >
          <ArrowLeft className="w-4 h-4 transform group-hover:-translate-x-1 transition-transform text-amber-400" />
          <span>Back to EventGameStudio</span>
        </button>
      </div>

      <div className="max-w-md w-full bg-slate-900/90 border border-slate-800 rounded-2xl p-8 shadow-2xl relative z-10 backdrop-blur-md">
        {/* Brand Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center p-3 bg-amber-500/10 border border-amber-500/30 rounded-2xl mb-3 text-amber-400">
            <Gamepad2 className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-amber-400">
            Event Game Studio
          </h1>
          <p className="text-slate-400 text-xs mt-1">
            Multi-Tenant Custom Game Platform for Enterprise & Brands
          </p>
        </div>

        {/* Global Error Banner */}
        {error && (
          <div className="mb-5 p-4 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 text-xs flex items-start gap-3 shadow-lg shadow-rose-950/20">
            <AlertTriangle className="w-5 h-5 shrink-0 text-rose-400 mt-0.5" />
            <div className="flex-1 space-y-1">
              <div className="font-bold text-rose-200 text-sm">
                {authMode === 'signup' ? 'Registration failed' : 'Authentication Notice'}
              </div>
              <p className="leading-relaxed text-slate-200">{error}</p>
              {authMode === 'signup' && (
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => setError(null)}
                    className="inline-flex items-center gap-1.5 px-3 py-1 bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-rose-200 font-semibold rounded-lg text-[11px] transition-colors cursor-pointer"
                  >
                    Try Again
                  </button>
                </div>
              )}
              {/* If unverified email was previously encountered, provide direct link to verification recovery */}
              {authMode === 'signin' && unverifiedEmail && (
                <div className="mt-2.5 pt-2 border-t border-rose-500/20 flex flex-col gap-1.5">
                  <p className="text-[11px] text-slate-300">
                    Did not receive the verification email?
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setError(null);
                      setAuthMode('unverified_recovery');
                    }}
                    className="self-start text-[11px] font-semibold text-amber-400 hover:text-amber-300 underline cursor-pointer"
                  >
                    Go to email verification recovery
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* VIEW 1a: DEDICATED UNVERIFIED ACCOUNT RECOVERY STATE */}
        {/* ========================================================================= */}
        {authMode === 'unverified_recovery' ? (
          <div className="text-center py-4 space-y-6">
            <div className="inline-flex items-center justify-center p-4 bg-amber-500/10 border border-amber-500/30 rounded-2xl text-amber-400">
              <Mail className="w-10 h-10" />
            </div>

            <div className="space-y-2">
              <h2 className="text-xl font-bold text-white tracking-tight">Email verification required</h2>
              <p className="text-xs text-amber-300 font-semibold leading-relaxed">
                Your email address has not been verified.
              </p>
              <p className="text-xs text-slate-300 leading-relaxed">
                Please check your inbox and Spam/Junk folder.
              </p>
              {unverifiedEmail && (
                <div className="inline-block bg-slate-950/80 border border-slate-800 px-3.5 py-1.5 rounded-lg text-amber-400 font-mono text-xs mt-1 shadow-inner">
                  {unverifiedEmail}
                </div>
              )}
            </div>

            <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 text-left text-xs text-slate-400 space-y-2.5">
              <div className="text-slate-300 font-semibold flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span>Mandatory Email Verification</span>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                For security, accounts and promotional benefits remain inactive until your email address is verified.
              </p>
              <div className="pt-2 border-t border-slate-800/80 flex items-start gap-2 text-slate-300 text-[11px]">
                <Info className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
                <span className="leading-relaxed">Please check your inbox and Spam/Junk folder.</span>
              </div>
            </div>

            {resendStatusMessage && (
              <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-300 text-xs flex items-start gap-2.5 shadow-lg shadow-emerald-950/20 text-left">
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400 mt-0.5" />
                <div className="space-y-0.5">
                  <div className="font-semibold text-emerald-200">Verification email sent.</div>
                  <div className="text-[11px] text-emerald-300/90 leading-relaxed">
                    Please check your inbox and spam folder.
                  </div>
                </div>
              </div>
            )}

            {resendErrorMessage && (
              <div className="p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 text-xs flex items-start gap-2.5 shadow-lg shadow-rose-950/20 text-left">
                <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
                <div className="space-y-0.5">
                  <div className="font-semibold text-rose-200">Unable to send verification email</div>
                  <div className="text-[11px] text-rose-300/90 leading-relaxed">{resendErrorMessage}</div>
                </div>
              </div>
            )}

            <div className="bg-slate-950/40 border border-slate-800/80 rounded-xl p-4 space-y-3">
              <button
                type="button"
                onClick={() => handleResendVerification(unverifiedEmail || email)}
                disabled={resendingVerification || resendCooldown > 0}
                className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold rounded-xl transition-all shadow-lg shadow-amber-500/20 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {resendingVerification ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Sending...</span>
                  </>
                ) : resendCooldown > 0 ? (
                  <>
                    <Clock className="w-3.5 h-3.5" />
                    <span>Resend available in {resendCooldown}s</span>
                  </>
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5" />
                    <span>{t('common.resendVerificationEmail')}</span>
                  </>
                )}
              </button>
              <p className="text-[11px] text-slate-400">
                Please also check your Spam/Junk folder.
              </p>
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={() => {
                  setAuthMode('signin');
                  setError(null);
                  setSuccessMessage(null);
                  setResendStatusMessage(null);
                  setResendErrorMessage(null);
                }}
                className="w-full py-2.5 text-xs text-slate-400 hover:text-slate-200 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back to Sign In</span>
              </button>
            </div>
          </div>
        ) : authMode === 'verification_pending' ? (
          /* ========================================================================= */
          /* VIEW 1b: REGISTRATION / VERIFICATION PENDING STATE */
          /* ========================================================================= */
          <div className="text-center py-4 space-y-6">
            <div className="inline-flex items-center justify-center p-4 bg-amber-500/10 border border-amber-500/30 rounded-2xl text-amber-400">
              <Mail className="w-10 h-10" />
            </div>

            <div className="space-y-2">
              <h2 className="text-xl font-bold text-white tracking-tight">Check your email</h2>
              {unverifiedEmail ? (
                <p className="text-xs text-slate-300 leading-relaxed">
                  We sent a verification link to{' '}
                  <span className="font-mono text-amber-400 font-semibold">{maskEmail(unverifiedEmail)}</span>.
                </p>
              ) : (
                <p className="text-xs text-slate-300 leading-relaxed">
                  Account created. Please check your email and click the verification link to continue.
                </p>
              )}
            </div>

            <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 text-left text-xs text-slate-400 space-y-2.5">
              <div className="text-slate-300 font-semibold flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span>Mandatory Email Verification</span>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                For security, accounts and promotional benefits remain inactive until your email address is verified.
              </p>
              <div className="pt-2 border-t border-slate-800/80 flex items-start gap-2 text-slate-300 text-[11px]">
                <Info className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
                <span className="leading-relaxed">Please also check your Spam/Junk folder.</span>
              </div>
            </div>

            {resendStatusMessage && (
              <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-300 text-xs flex items-start gap-2.5 shadow-lg shadow-emerald-950/20 text-left">
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400 mt-0.5" />
                <div className="space-y-0.5">
                  <div className="font-semibold text-emerald-200">Verification email sent.</div>
                  <div className="text-[11px] text-emerald-300/90 leading-relaxed">
                    Please check your inbox and spam folder.
                  </div>
                </div>
              </div>
            )}

            {resendErrorMessage && (
              <div className="p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 text-xs flex items-start gap-2.5 shadow-lg shadow-rose-950/20 text-left">
                <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
                <div className="space-y-0.5">
                  <div className="font-semibold text-rose-200">Unable to send verification email</div>
                  <div className="text-[11px] text-rose-300/90 leading-relaxed">{resendErrorMessage}</div>
                </div>
              </div>
            )}

            <div className="bg-slate-950/40 border border-slate-800/80 rounded-xl p-4 space-y-3">
              <p className="text-xs text-slate-300 font-medium">Didn't receive the email?</p>
              {unverifiedEmail && (
                <button
                  type="button"
                  onClick={() => handleResendVerification(unverifiedEmail)}
                  disabled={resendingVerification || resendCooldown > 0}
                  className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold rounded-xl transition-all shadow-lg shadow-amber-500/20 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  {resendingVerification ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Sending...</span>
                    </>
                  ) : resendCooldown > 0 ? (
                    <>
                      <Clock className="w-3.5 h-3.5" />
                      <span>Resend available in {resendCooldown}s</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-3.5 h-3.5" />
                      <span>{t('common.resendVerificationEmail')}</span>
                    </>
                  )}
                </button>
              )}
              <p className="text-[11px] text-slate-400">
                Please also check your Spam/Junk folder.
              </p>
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={() => {
                  setAuthMode('signin');
                  setError(null);
                  setSuccessMessage(null);
                  setResendStatusMessage(null);
                  setResendErrorMessage(null);
                }}
                className="w-full py-2.5 text-xs text-slate-400 hover:text-slate-200 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>{t('common.backToLogin')}</span>
              </button>
            </div>
          </div>
        ) : authMode === 'forgot_password' ? (
          /* ========================================================================= */
          /* VIEW 2: FORGOT PASSWORD REQUEST */
          /* ========================================================================= */
          <div className="space-y-5">
            <div className="text-center space-y-1">
              <h2 className="text-lg font-bold text-white">Reset Password</h2>
              <p className="text-xs text-slate-400">
                Enter your account email to receive a password reset link.
              </p>
            </div>

            {successMessage ? (
              <div className="space-y-5">
                <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-300 text-xs flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                  <span className="leading-relaxed">{successMessage}</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode('signin');
                    setSuccessMessage(null);
                    setError(null);
                  }}
                  className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-amber-400 text-xs font-semibold rounded-xl border border-amber-500/20 transition-colors"
                >
                  {t('common.returnToSignIn')}
                </button>
              </div>
            ) : (
              <form onSubmit={handleForgotPassword} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Email Address
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                      <Mail className="w-4 h-4" />
                    </div>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@company.com"
                      className="w-full bg-slate-950/80 border border-slate-700 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 rounded-xl pl-9 pr-3 py-2.5 text-xs text-slate-200 outline-none transition-all placeholder:text-slate-600"
                      required
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl transition-all shadow-lg shadow-amber-500/20 disabled:opacity-50 cursor-pointer"
                >
                  {loading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                      <span>Sending link...</span>
                    </>
                  ) : (
                    <span>Send Reset Link</span>
                  )}
                </button>

                <div className="text-center pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setAuthMode('signin');
                      setError(null);
                    }}
                    className="text-xs text-slate-400 hover:text-amber-400 underline transition-colors"
                  >
                    Back to Sign In
                  </button>
                </div>
              </form>
            )}
          </div>
        ) : (
          /* ========================================================================= */
          /* VIEW 3: SIGN IN / SIGN UP TABS & FORM */
          /* ========================================================================= */
          <div className="space-y-5">
            {/* Mode Switch Tabs */}
            <div className="grid grid-cols-2 p-1 bg-slate-950/80 border border-slate-800 rounded-xl text-xs font-semibold">
              <button
                type="button"
                onClick={() => {
                  setAuthMode('signin');
                  setError(null);
                }}
                className={`py-2 rounded-lg transition-colors cursor-pointer ${
                  authMode === 'signin'
                    ? 'bg-amber-500 text-slate-950 shadow-md font-bold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => {
                  setAuthMode('signup');
                  setError(null);
                }}
                className={`py-2 rounded-lg transition-colors cursor-pointer ${
                  authMode === 'signup'
                    ? 'bg-amber-500 text-slate-950 shadow-md font-bold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Create Account
              </button>
            </div>

            {/* Email/Password Form */}
            <form onSubmit={authMode === 'signin' ? handleSignIn : handleSignUp} className="space-y-3.5">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Email Address
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                    <Mail className="w-4 h-4" />
                  </div>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@company.com"
                    className="w-full bg-slate-950/80 border border-slate-700 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 rounded-xl pl-9 pr-3 py-2.5 text-xs text-slate-200 outline-none transition-all placeholder:text-slate-600"
                    required
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-medium text-slate-300">
                    Password
                  </label>
                  {authMode === 'signin' && (
                    <button
                      type="button"
                      onClick={() => {
                        setAuthMode('forgot_password');
                        setError(null);
                      }}
                      className="text-[11px] text-amber-400 hover:text-amber-300 transition-colors"
                    >
                      Forgot password?
                    </button>
                  )}
                </div>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                    <Lock className="w-4 h-4" />
                  </div>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-slate-950/80 border border-slate-700 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 rounded-xl pl-9 pr-10 py-2.5 text-xs text-slate-200 outline-none transition-all placeholder:text-slate-600"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-500 hover:text-slate-300"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Extra Confirm Password Field for Sign Up */}
              {authMode === 'signup' && (
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Confirm Password
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                      <Lock className="w-4 h-4" />
                    </div>
                    <input
                      type={showConfirmPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full bg-slate-950/80 border border-slate-700 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 rounded-xl pl-9 pr-10 py-2.5 text-xs text-slate-200 outline-none transition-all placeholder:text-slate-600"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-500 hover:text-slate-300"
                    >
                      {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              )}

              {/* Password checklist for Sign Up */}
              {authMode === 'signup' && (
                <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3 text-[11px] space-y-1">
                  <div className="text-slate-400 font-semibold mb-0.5">Password requirements:</div>
                  <div className={`flex items-center gap-1.5 ${hasMinLength ? 'text-emerald-400' : 'text-slate-500'}`}>
                    <div className={`w-1.5 h-1.5 rounded-full ${hasMinLength ? 'bg-emerald-400' : 'bg-slate-600'}`} />
                    <span>8+ characters</span>
                  </div>
                  <div className={`flex items-center gap-1.5 ${hasLetter ? 'text-emerald-400' : 'text-slate-500'}`}>
                    <div className={`w-1.5 h-1.5 rounded-full ${hasLetter ? 'bg-emerald-400' : 'bg-slate-600'}`} />
                    <span>At least one letter</span>
                  </div>
                  <div className={`flex items-center gap-1.5 ${hasNumber ? 'text-emerald-400' : 'text-slate-500'}`}>
                    <div className={`w-1.5 h-1.5 rounded-full ${hasNumber ? 'bg-emerald-400' : 'bg-slate-600'}`} />
                    <span>At least one number</span>
                  </div>
                  {confirmPassword.length > 0 && (
                    <div className={`flex items-center gap-1.5 ${passwordsMatch ? 'text-emerald-400' : 'text-rose-400'}`}>
                      <div className={`w-1.5 h-1.5 rounded-full ${passwordsMatch ? 'bg-emerald-400' : 'bg-rose-500'}`} />
                      <span>{passwordsMatch ? 'Passwords match' : 'Passwords do not match'}</span>
                    </div>
                  )}
                </div>
              )}

              <button
                type="submit"
                disabled={loading || (authMode === 'signup' && (!hasMinLength || !hasLetter || !hasNumber || !passwordsMatch))}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl transition-all shadow-lg shadow-amber-500/20 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                    <span>{authMode === 'signin' ? 'Signing in...' : 'Creating account...'}</span>
                  </>
                ) : (
                  <span>{authMode === 'signin' ? 'Sign In with Email' : 'Create Account'}</span>
                )}
              </button>
            </form>

            {/* Divider */}
            <div className="relative my-4">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-800" />
              </div>
              <div className="relative flex justify-center text-[10px] uppercase font-bold text-slate-500">
                <span className="bg-slate-900 px-3">Or continue with</span>
              </div>
            </div>

            {/* Google OAuth Section */}
            <div className="space-y-3 flex flex-col items-center">
              {clientId ? (
                <div className="w-full flex flex-col items-center gap-2.5">
                  <div ref={googleBtnRef} className="flex justify-center min-h-[44px]" />
                  {!gsiLoaded && (
                    <div className="text-xs text-slate-500 animate-pulse">
                      Loading Google Sign-In SDK...
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={triggerGooglePrompt}
                    className="text-xs text-slate-400 hover:text-amber-400 underline transition-colors pt-0.5"
                  >
                    Or click here for Google One Tap Prompt
                  </button>
                </div>
              ) : (
                <div className="w-full p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-xs space-y-1.5">
                  <div className="flex items-center gap-1.5 text-amber-400 font-bold text-[11px]">
                    <KeyRound className="w-3.5 h-3.5" />
                    <span>Google OAuth Optional</span>
                  </div>
                  <p className="text-slate-300 leading-relaxed text-[10px]">
                    Google OAuth client ID is not configured. Email & password registration and login are fully available!
                  </p>
                </div>
              )}

              {/* Dev Mode Sign-In Option */}
              {isDev && (
                <div className="w-full pt-3 border-t border-slate-800 space-y-2">
                  <div className="text-[10px] uppercase font-bold text-slate-500 tracking-wider text-center">
                    Development Mode Test Sign-In
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => handleDevMockLogin('company.owner')}
                      disabled={loading}
                      className="bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs py-1.5 px-2.5 rounded-lg font-medium transition-colors border border-slate-700 cursor-pointer"
                    >
                      Test Owner
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDevMockLogin('staff.designer')}
                      disabled={loading}
                      className="bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs py-1.5 px-2.5 rounded-lg font-medium transition-colors border border-slate-700 cursor-pointer"
                    >
                      Test Staff
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Security Footer */}
        <div className="mt-6 pt-4 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-500">
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>Encrypted Authentication</span>
          </div>
          <span>Event Game Studio</span>
        </div>
      </div>
    </div>
  );
};