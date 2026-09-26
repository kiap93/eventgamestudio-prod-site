import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { navigateTo } from '../../hooks/useRouteContext';
import {
  CheckCircle2,
  AlertTriangle,
  Mail,
  ArrowRight,
  ArrowLeft,
  RefreshCw,
  Send,
} from 'lucide-react';

export const VerifyEmailPage: React.FC = () => {
  const { verifyEmail, resendVerificationEmail, isAuthenticated, currentOrganization } = useAuth();
  const [verifying, setVerifying] = useState(true);
  const [success, setSuccess] = useState(false);
  const [message, setMessage] = useState<string>('');
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Resend state
  const [resendEmail, setResendEmail] = useState<string>('');
  const [resending, setResending] = useState(false);
  const [resendSuccessMessage, setResendSuccessMessage] = useState<string | null>(null);
  const [resendError, setResendError] = useState<string | null>(null);

  const verificationAttemptedRef = useRef(false);

  useEffect(() => {
    if (verificationAttemptedRef.current) return;
    verificationAttemptedRef.current = true;

    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');

    if (!token || !token.trim()) {
      setVerifying(false);
      setErrorCode('MISSING_TOKEN');
      setErrorMessage('No verification token found. Please check the link from your email.');
      return;
    }

    const runVerification = async () => {
      try {
        setVerifying(true);
        const result = await verifyEmail(token.trim());
        setSuccess(true);
        setMessage(result.message || 'Email verified successfully!');
      } catch (err: any) {
        setSuccess(false);
        setErrorCode(err.code || 'VERIFICATION_FAILED');
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
  }, [verifyEmail]);

  const handleContinue = () => {
    if (currentOrganization) {
      navigateTo('/events');
    } else {
      navigateTo('/create-organization');
    }
  };

  const handleResend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resendEmail.trim()) {
      setResendError('Please enter your email address');
      return;
    }

    setResending(true);
    setResendError(null);
    setResendSuccessMessage(null);

    try {
      const res = await resendVerificationEmail(resendEmail.trim());
      setResendSuccessMessage(
        res.message || 'If an account requires email verification, a verification email has been sent.'
      );
    } catch (err: any) {
      setResendError(err.message || 'Failed to resend verification email');
    } finally {
      setResending(false);
    }
  };

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
          <span>Back to Sign In</span>
        </button>
      </div>

      <div className="max-w-md w-full bg-slate-900/90 border border-slate-800 rounded-2xl p-8 shadow-2xl relative z-10 backdrop-blur-md">
        {/* State 1: Verifying in progress */}
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

        {/* State 2: Verification Successful */}
        {!verifying && success && (
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

        {/* State 3: Verification Failed / Expired / Invalid */}
        {!verifying && !success && (
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

            {/* Resend Form */}
            <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 space-y-3">
              <div className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <Mail className="w-4 h-4 text-amber-400" />
                <span>Request a new verification link</span>
              </div>

              {resendSuccessMessage ? (
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-300 text-xs">
                  {resendSuccessMessage}
                </div>
              ) : (
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

                  {resendError && (
                    <p className="text-[11px] text-rose-400">{resendError}</p>
                  )}

                  <button
                    type="submit"
                    disabled={resending}
                    className="w-full flex items-center justify-center gap-2 py-2 px-3 bg-slate-800 hover:bg-slate-700 text-amber-400 font-semibold text-xs rounded-lg transition-colors border border-amber-500/20 disabled:opacity-50 cursor-pointer"
                  >
                    {resending ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Send className="w-3.5 h-3.5" />
                    )}
                    <span>{resending ? 'Sending...' : 'Resend Verification Email'}</span>
                  </button>
                </form>
              )}
            </div>

            <div className="text-center pt-2">
              <button
                onClick={() => navigateTo('/login')}
                className="text-xs text-slate-400 hover:text-amber-400 underline transition-colors"
              >
                Return to Sign In
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
