import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { navigateTo } from '../../hooks/useRouteContext';
import { maskEmail } from '../../lib/maskEmail';
import {
  CheckCircle2,
  AlertTriangle,
  Mail,
  ArrowRight,
  ArrowLeft,
  RefreshCw,
  Send,
  Clock,
  ShieldCheck,
  Info,
} from 'lucide-react';

export const VerifyEmailPage: React.FC = () => {
  const { verifyEmail, resendVerificationEmail, isAuthenticated, currentOrganization } = useAuth();

  const [searchParams] = useState(() => new URLSearchParams(window.location.search));
  const token = searchParams.get('token');
  const urlEmail = searchParams.get('email');

  // If token is present, we are in callback verification mode; if not, we are in post-registration "Check your email" mode
  const [verifying, setVerifying] = useState<boolean>(Boolean(token && token.trim()));
  const [success, setSuccess] = useState(false);
  const [message, setMessage] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Resend state
  const [resendEmail, setResendEmail] = useState<string>(() => {
    return (
      urlEmail ||
      sessionStorage.getItem('pending_verification_email') ||
      ''
    );
  });
  const [resending, setResending] = useState(false);
  const [resendSuccessMessage, setResendSuccessMessage] = useState<string | null>(null);
  const [resendError, setResendError] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState<number>(0);
  const [alreadyVerified, setAlreadyVerified] = useState(false);

  // Store registered email in sessionStorage if provided in URL
  useEffect(() => {
    if (urlEmail) {
      sessionStorage.setItem('pending_verification_email', urlEmail);
    }
  }, [urlEmail]);

  // Resend cooldown timer
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  const verificationAttemptedRef = useRef(false);

  // Token callback verification execution
  useEffect(() => {
    if (!token || !token.trim()) {
      setVerifying(false);
      return;
    }

    if (verificationAttemptedRef.current) return;
    verificationAttemptedRef.current = true;

    const runVerification = async () => {
      try {
        setVerifying(true);
        const result = await verifyEmail(token.trim());
        setSuccess(true);
        setMessage(result.message || 'Email verified successfully!');
        sessionStorage.removeItem('pending_verification_email');
      } catch (err: any) {
        setSuccess(false);
        setErrorMessage(
          err.message ||
            'We were unable to verify your email. The link may have expired or already been used.'
        );
        if (err.email) {
          setResendEmail(err.email);
        }
      } finally {
        setVerifying(false);
      }
    };

    runVerification();
  }, [token, verifyEmail]);

  const handleContinue = () => {
    if (currentOrganization) {
      navigateTo('/events');
    } else {
      navigateTo('/create-organization');
    }
  };

  const handleResend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const targetEmail = resendEmail.trim();
    if (!targetEmail || resending || resendCooldown > 0) {
      if (!targetEmail) setResendError('Please enter your email address');
      return;
    }

    setResending(true);
    setResendError(null);
    setResendSuccessMessage(null);
    setAlreadyVerified(false);

    try {
      const res = await resendVerificationEmail(targetEmail);
      if (res.already_verified) {
        setAlreadyVerified(true);
        setResendSuccessMessage('This email is already verified. Please sign in to your account.');
        return;
      }

      setResendSuccessMessage('Verification email sent. Please check your inbox.');
      setResendCooldown(60);
    } catch (err: any) {
      setResendError(err.message || "We couldn't send the verification email. Please try again.");
    } finally {
      setResending(false);
    }
  };

  const maskedDisplayEmail = resendEmail.trim() ? maskEmail(resendEmail.trim()) : '';

  return (
    <div className="min-w-screen min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-center items-center p-4 relative overflow-hidden font-sans">
      {/* Background ambient lighting */}
      <div className="absolute -top-32 -left-32 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-32 -right-32 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Top back navigation link */}
      <div className="w-full max-w-md mb-4 flex items-center justify-start z-10">
        <button
          onClick={() => navigateTo('/login')}
          className="inline-flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-amber-400 transition-colors py-2 px-3 rounded-xl bg-slate-900/80 hover:bg-slate-900 border border-slate-800 hover:border-amber-500/30 group cursor-pointer shadow-md"
        >
          <ArrowLeft className="w-4 h-4 transform group-hover:-translate-x-1 transition-transform text-amber-400" />
          <span>Back to Login</span>
        </button>
      </div>

      <div className="max-w-md w-full bg-slate-900/90 border border-slate-800 rounded-2xl p-8 shadow-2xl relative z-10 backdrop-blur-md">
        {/* ========================================================================= */}
        {/* CASE 1: VERIFYING IN PROGRESS (Token present) */}
        {/* ========================================================================= */}
        {verifying && (
          <div className="text-center py-8 space-y-4">
            <div className="inline-flex items-center justify-center p-4 bg-amber-500/10 border border-amber-500/30 rounded-2xl text-amber-400">
              <RefreshCw className="w-8 h-8 animate-spin" />
            </div>
            <h1 className="text-xl font-bold text-white">Verifying your email...</h1>
            <p className="text-sm text-slate-400">
              Please wait while we confirm your email address and activate your account.
            </p>
          </div>
        )}

        {/* ========================================================================= */}
        {/* CASE 2: VERIFICATION SUCCESSFUL (Token validated) */}
        {/* ========================================================================= */}
        {!verifying && token && success && (
          <div className="text-center py-6 space-y-6">
            <div className="inline-flex items-center justify-center p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl text-emerald-400">
              <CheckCircle2 className="w-10 h-10" />
            </div>

            <div className="space-y-2">
              <h1 className="text-2xl font-bold text-white tracking-tight">Email Verified!</h1>
              <p className="text-sm text-slate-300 leading-relaxed">
                {message || 'Your email has been verified successfully. Your account is now fully active.'}
              </p>
            </div>

            <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 text-xs text-slate-400 text-left space-y-1.5">
              <div className="text-slate-200 font-semibold flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>Account Activated</span>
              </div>
              <p>You can now create organizations, configure branded games, and launch live event tournaments.</p>
            </div>

            <button
              onClick={handleContinue}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl transition-all shadow-lg shadow-amber-500/20 cursor-pointer"
            >
              <span>{isAuthenticated ? 'Continue to Event Game Studio' : 'Sign In to Your Account'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* ========================================================================= */}
        {/* CASE 3: TOKEN FAILED / EXPIRED */}
        {/* ========================================================================= */}
        {!verifying && token && !success && (
          <div className="space-y-6">
            <div className="text-center space-y-3">
              <div className="inline-flex items-center justify-center p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-2xl text-rose-400">
                <AlertTriangle className="w-8 h-8" />
              </div>
              <h1 className="text-xl font-bold text-white">Verification Failed</h1>
              <p className="text-xs text-rose-300 bg-rose-950/40 border border-rose-900/50 p-3 rounded-xl leading-relaxed">
                {errorMessage}
              </p>
            </div>

            {/* Resend Section */}
            <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 space-y-3">
              <div className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <Mail className="w-4 h-4 text-amber-400" />
                <span>Request a new verification link</span>
              </div>

              {resendSuccessMessage && (
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-300 text-xs flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400 mt-0.5" />
                  <span className="leading-relaxed">{resendSuccessMessage}</span>
                </div>
              )}

              {resendError && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-lg text-rose-300 text-xs flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
                  <span className="leading-relaxed">{resendError}</span>
                </div>
              )}

              <form onSubmit={handleResend} className="space-y-3">
                <div>
                  <label className="block text-[11px] font-medium text-slate-400 mb-1">
                    Email Address
                  </label>
                  <input
                    type="email"
                    value={resendEmail}
                    onChange={(e) => setResendEmail(e.target.value)}
                    placeholder="you@company.com"
                    className="w-full bg-slate-900 border border-slate-700 focus:border-amber-500 rounded-lg px-3 py-2 text-xs text-slate-200 outline-none transition-colors"
                    required
                  />
                </div>

                <div className="flex items-center gap-1.5 text-[11px] text-slate-400 pt-0.5">
                  <Info className="w-3.5 h-3.5 shrink-0 text-amber-400" />
                  <span>Please also check your Spam/Junk folder.</span>
                </div>

                <button
                  type="submit"
                  disabled={resending || resendCooldown > 0}
                  className="w-full flex items-center justify-center gap-2 py-2.5 px-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl transition-all shadow-lg shadow-amber-500/20 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  {resending ? (
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
                      <span>Resend Verification Email</span>
                    </>
                  )}
                </button>
              </form>
            </div>

            <div className="text-center pt-2">
              <button
                onClick={() => navigateTo('/login')}
                className="text-xs text-slate-400 hover:text-amber-400 underline transition-colors"
              >
                Back to Login
              </button>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* CASE 4: POST-REGISTRATION "CHECK YOUR EMAIL" VIEW (No token) */}
        {/* ========================================================================= */}
        {!verifying && !token && (
          <div className="text-center py-4 space-y-6">
            <div className="inline-flex items-center justify-center p-4 bg-amber-500/10 border border-amber-500/30 rounded-2xl text-amber-400">
              <Mail className="w-10 h-10" />
            </div>

            <div className="space-y-2">
              <h1 className="text-2xl font-bold tracking-tight text-white">Check your email</h1>
              <p className="text-xs text-slate-300 leading-relaxed">
                {maskedDisplayEmail ? (
                  <>
                    We sent a verification link to{' '}
                    <span className="font-mono text-amber-400 font-semibold">{maskedDisplayEmail}</span>.
                  </>
                ) : (
                  'We sent a verification link to your registered email address.'
                )}
              </p>
            </div>

            {/* Security Notice */}
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

            {/* Feedback Notifications */}
            {resendSuccessMessage && (
              <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-300 text-xs flex items-start gap-2.5 shadow-lg shadow-emerald-950/20 text-left">
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400 mt-0.5" />
                <div className="space-y-0.5">
                  <div className="font-semibold text-emerald-200">
                    {alreadyVerified ? 'Already Verified' : 'Verification email sent.'}
                  </div>
                  <div className="text-[11px] text-emerald-300/90 leading-relaxed">
                    {alreadyVerified
                      ? 'This email is already verified. Please sign in to your account.'
                      : 'Please check your inbox and Spam/Junk folder.'}
                  </div>
                </div>
              </div>
            )}

            {alreadyVerified && (
              <button
                type="button"
                onClick={() => navigateTo('/login')}
                className="w-full py-2.5 px-4 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs rounded-xl transition-all shadow-lg shadow-emerald-500/20 cursor-pointer"
              >
                Sign In to Your Account
              </button>
            )}

            {resendError && (
              <div className="p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 text-xs flex items-start gap-2.5 shadow-lg shadow-rose-950/20 text-left">
                <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
                <div className="space-y-0.5">
                  <div className="font-semibold text-rose-200">Unable to send verification email</div>
                  <div className="text-[11px] text-rose-300/90 leading-relaxed">{resendError}</div>
                </div>
              </div>
            )}

            {/* Resend Action Card */}
            {!alreadyVerified && (
              <div className="bg-slate-950/40 border border-slate-800/80 rounded-xl p-4 space-y-3">
                <p className="text-xs text-slate-300 font-medium">Didn't receive the email?</p>

                {/* If email wasn't preserved, provide an input field */}
                {!resendEmail && (
                  <div>
                    <input
                      type="email"
                      value={resendEmail}
                      onChange={(e) => setResendEmail(e.target.value)}
                      placeholder="Enter your email address"
                      className="w-full bg-slate-900 border border-slate-700 focus:border-amber-500 rounded-lg px-3 py-2 text-xs text-slate-200 outline-none transition-colors mb-2 text-center"
                    />
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => handleResend()}
                  disabled={resending || resendCooldown > 0 || !resendEmail.trim()}
                  className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold rounded-xl transition-all shadow-lg shadow-amber-500/20 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  {resending ? (
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
                      <span>Resend Verification Email</span>
                    </>
                  )}
                </button>

                <p className="text-[11px] text-slate-400">
                  Please also check your Spam/Junk folder.
                </p>
              </div>
            )}

            <div className="pt-2">
              <button
                type="button"
                onClick={() => navigateTo('/login')}
                className="w-full py-2.5 text-xs text-slate-400 hover:text-slate-200 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back to Login</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
