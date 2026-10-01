import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { navigateTo } from '../../hooks/useRouteContext';
import { useLocalization } from '../../context/LocalizationContext';
import {
  KeyRound,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  ArrowLeft,
  Eye,
  EyeOff,
  Lock,
} from 'lucide-react';

export const ResetPasswordPage: React.FC = () => {
  const { t } = useLocalization();
  const { resetPassword, requestPasswordReset } = useAuth();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string>('');

  // Expired / Request new reset link state
  const [showRequestNew, setShowRequestNew] = useState(false);
  const [requestEmail, setRequestEmail] = useState('');
  const [requestSending, setRequestSending] = useState(false);
  const [requestSent, setRequestSent] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);

  const params = new URLSearchParams(window.location.search);
  const token = params.get('token');

  // Password validation helpers
  const hasMinLength = password.length >= 8;
  const hasLetter = /[a-zA-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const passwordsMatch = password.length > 0 && password === confirmPassword;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !token.trim()) {
      setError('Password reset token is missing. Please check your reset link.');
      return;
    }

    if (!hasMinLength || !hasLetter || !hasNumber) {
      setError('Password must be at least 8 characters long and contain at least one letter and one number.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await resetPassword(token.trim(), password, confirmPassword);
      setSuccess(true);
      setSuccessMessage(res.message || 'Password has been reset successfully! Please sign in with your new password.');
    } catch (err: any) {
      setError(err.message || 'Failed to reset password. The link may have expired or already been used.');
      if (err.code === 'EXPIRED_RESET_TOKEN' || err.code === 'INVALID_RESET_TOKEN') {
        setShowRequestNew(true);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRequestNewReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!requestEmail.trim()) {
      setRequestError('Please enter your email address');
      return;
    }

    setRequestSending(true);
    setRequestError(null);
    try {
      await requestPasswordReset(requestEmail.trim());
      setRequestSent(true);
    } catch (err: any) {
      setRequestError(err.message || 'Failed to send reset link');
    } finally {
      setRequestSending(false);
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
          <span>{t('auth.backToSignIn')}</span>
        </button>
      </div>

      <div className="max-w-md w-full bg-slate-900/90 border border-slate-800 rounded-2xl p-8 shadow-2xl relative z-10 backdrop-blur-md">
        {/* Success View */}
        {success ? (
          <div className="text-center py-6 space-y-6">
            <div className="inline-flex items-center justify-center p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl text-emerald-400">
              <CheckCircle2 className="w-10 h-10" />
            </div>

            <div className="space-y-2">
              <h1 className="text-2xl font-bold text-white tracking-tight">{t('auth.passwordResetComplete')}</h1>
              <p className="text-sm text-slate-300 leading-relaxed">
                {successMessage}
              </p>
            </div>

            <button
              onClick={() => navigateTo('/login')}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl transition-all shadow-lg shadow-amber-500/20 cursor-pointer"
            >
              <span>{t('auth.signInWithNewPassword')}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        ) : !token ? (
          /* Missing Token View */
          <div className="text-center py-6 space-y-5">
            <div className="inline-flex items-center justify-center p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-2xl text-rose-400">
              <AlertTriangle className="w-8 h-8" />
            </div>
            <h1 className="text-xl font-bold text-white">{t('auth.invalidResetLink')}</h1>
            <p className="text-xs text-slate-400 leading-relaxed">
              No password reset token was found in the link. Please request a new password reset link from the login page.
            </p>
            <button
              onClick={() => navigateTo('/login')}
              className="w-full py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-amber-400 text-xs font-semibold rounded-xl border border-amber-500/20 transition-colors cursor-pointer"
            >
              {t('common.returnToSignIn')}
            </button>
          </div>
        ) : (
          /* Normal Reset Form */
          <div className="space-y-6">
            <div className="text-center space-y-2">
              <div className="inline-flex items-center justify-center p-3 bg-amber-500/10 border border-amber-500/30 rounded-2xl text-amber-400">
                <KeyRound className="w-7 h-7" />
              </div>
              <h1 className="text-2xl font-bold text-white tracking-tight">{t('auth.resetPassword')}</h1>
              <p className="text-xs text-slate-400">
                {t('auth.chooseStrongPassword')}
              </p>
            </div>

            {error && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  {t('auth.newPassword')}
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                    <Lock className="w-4 h-4" />
                  </div>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={t('auth.enterNewPassword')}
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

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  {t('auth.confirmNewPassword')}
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                    <Lock className="w-4 h-4" />
                  </div>
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder={t('auth.reenterNewPassword')}
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

              {/* Password Requirements Checklist */}
              <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3 text-[11px] space-y-1.5">
                <div className="text-slate-400 font-semibold mb-1">{t('auth.passwordRequirements')}</div>
                <div className={`flex items-center gap-1.5 ${hasMinLength ? 'text-emerald-400' : 'text-slate-500'}`}>
                  <div className={`w-1.5 h-1.5 rounded-full ${hasMinLength ? 'bg-emerald-400' : 'bg-slate-600'}`} />
                  <span>{t('auth.atLeast8Chars')}</span>
                </div>
                <div className={`flex items-center gap-1.5 ${hasLetter ? 'text-emerald-400' : 'text-slate-500'}`}>
                  <div className={`w-1.5 h-1.5 rounded-full ${hasLetter ? 'bg-emerald-400' : 'bg-slate-600'}`} />
                  <span>{t('auth.atLeastOneLetter')}</span>
                </div>
                <div className={`flex items-center gap-1.5 ${hasNumber ? 'text-emerald-400' : 'text-slate-500'}`}>
                  <div className={`w-1.5 h-1.5 rounded-full ${hasNumber ? 'bg-emerald-400' : 'bg-slate-600'}`} />
                  <span>{t('auth.atLeastOneNumber')}</span>
                </div>
                {confirmPassword.length > 0 && (
                  <div className={`flex items-center gap-1.5 ${passwordsMatch ? 'text-emerald-400' : 'text-rose-400'}`}>
                    <div className={`w-1.5 h-1.5 rounded-full ${passwordsMatch ? 'bg-emerald-400' : 'bg-rose-500'}`} />
                    <span>{passwordsMatch ? t('auth.passwordsMatch') : t('auth.passwordsDoNotMatch')}</span>
                  </div>
                )}
              </div>

              <button
                type="submit"
                disabled={loading || !hasMinLength || !hasLetter || !hasNumber || !passwordsMatch}
                className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl transition-all shadow-lg shadow-amber-500/20 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer text-xs"
              >
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                    <span>{t('auth.resettingPassword')}</span>
                  </>
                ) : (
                  <span>{t('common.updatePassword')}</span>
                )}
              </button>
            </form>

            {/* Expired Token Recovery Section */}
            {showRequestNew && (
              <div className="mt-4 pt-4 border-t border-slate-800 space-y-3">
                <div className="text-xs font-semibold text-slate-300">
                  {t('auth.requestFreshResetLink')}
                </div>
                {requestSent ? (
                  <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-300 text-xs">
                    {t('auth.resetSentNotice')}
                  </div>
                ) : (
                  <form onSubmit={handleRequestNewReset} className="space-y-2">
                    <input
                      type="email"
                      value={requestEmail}
                      onChange={(e) => setRequestEmail(e.target.value)}
                      placeholder={t('auth.enterEmailAddress')}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 outline-none focus:border-amber-500"
                      required
                    />
                    {requestError && <p className="text-[11px] text-rose-400">{requestError}</p>}
                    <button
                      type="submit"
                      disabled={requestSending}
                      className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-amber-400 text-xs font-semibold rounded-lg border border-amber-500/20 transition-colors"
                    >
                      {requestSending ? 'Sending...' : 'Send New Reset Link'}
                    </button>
                  </form>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
