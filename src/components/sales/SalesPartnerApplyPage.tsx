import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useLocalization } from '../../context/LocalizationContext';
import { navigateTo } from '../../hooks/useRouteContext';
import { SEO } from '../common/SEO';
import {
  Briefcase,
  CheckCircle2,
  Clock,
  XCircle,
  AlertTriangle,
  ArrowRight,
  ShieldCheck,
  Gamepad2,
  Percent,
  Share2,
  Layers,
  Sparkles,
  ArrowLeft,
  Building2,
  Mail,
  User as UserIcon,
  Check,
  Info,
  RefreshCw,
} from 'lucide-react';

export const SalesPartnerApplyPage: React.FC = () => {
  const {
    currentUser,
    currentOrganization,
    salesPartner,
    isSalesPartner,
    salesPartnerStatus,
    applyForSalesPartner,
    refreshSession,
  } = useAuth();
  const { t } = useLocalization();

  // Form inputs
  const [agencyName, setAgencyName] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [agreedToTerms, setAgreedToTerms] = useState<boolean>(false);

  // Submission state
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);

  // Manual status refresh state
  const [isRefreshingStatus, setIsRefreshingStatus] = useState<boolean>(false);
  const [refreshNotice, setRefreshNotice] = useState<string | null>(null);

  // Auto-refresh partner status on mount or tab focus when user is authenticated
  React.useEffect(() => {
    if (!currentUser) return;
    refreshSession().catch(() => {});

    const handleFocus = () => {
      refreshSession().catch(() => {});
    };

    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [currentUser, refreshSession]);

  const handleManualRefresh = async () => {
    if (isRefreshingStatus) return;
    setIsRefreshingStatus(true);
    setRefreshNotice(null);
    try {
      await refreshSession();
      setRefreshNotice('Status checked with server.');
      setTimeout(() => setRefreshNotice(null), 3000);
    } catch {
      setRefreshNotice('Unable to check latest status. Please try again.');
      setTimeout(() => setRefreshNotice(null), 3000);
    } finally {
      setIsRefreshingStatus(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    if (!agreedToTerms) {
      setSubmitError('Please acknowledge the program terms and administrator review requirement.');
      return;
    }

    const trimmedAgency = agencyName.trim();
    const trimmedNotes = notes.trim();

    if (trimmedAgency.length > 150) {
      setSubmitError('Agency name cannot exceed 150 characters.');
      return;
    }

    if (trimmedNotes.length > 1000) {
      setSubmitError('Application details cannot exceed 1,000 characters.');
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);
    setSubmitSuccess(null);

    try {
      // Send structured applicant fields cleanly separated from internal admin notes
      const result = await applyForSalesPartner({
        agencyName: trimmedAgency || undefined,
        applicationNotes: trimmedNotes || undefined,
      });
      setSubmitSuccess(result.message || 'Application submitted successfully! Your application is now pending review.');
    } catch (err: any) {
      console.error('[SalesPartnerApplyPage] Failed to submit application:', err);
      setSubmitError(err.message || 'Failed to submit application. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatDate = (isoString?: string | null) => {
    if (!isoString) return 'Recently';
    try {
      const date = new Date(isoString);
      return new Intl.DateTimeFormat('en-SG', {
        timeZone: 'Asia/Singapore',
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(date);
    } catch {
      return isoString;
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      <SEO
        title="Become a Sales Partner | Event Game Studio"
        robots="noindex, follow"
        description="Join the Event Game Studio Sales Partner program to earn commissions pitching branded event games."
      />

      {/* Header */}
      <header className="bg-slate-900 border-b border-slate-800 sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigateTo(currentUser ? '/events' : '/')}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
              title={currentUser ? 'Return to Workspace' : 'Return to Home'}
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-400">
                <Briefcase className="w-5 h-5" />
              </div>
              <span className="font-bold text-sm tracking-tight text-white">
                Sales Partner Program
              </span>
            </div>
          </div>

          <button
            onClick={() => navigateTo(currentUser ? '/events' : '/')}
            className="text-xs font-semibold text-slate-400 hover:text-amber-400 transition-colors px-3 py-1.5 rounded-lg hover:bg-slate-800/60 cursor-pointer"
          >
            {currentUser ? 'Back to Workspace' : 'Back to Home'}
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-6 py-8 sm:py-12 space-y-8">
        {/* Hero Section */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Official Partner Network</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Partner with Event Game Studio
          </h1>
          <p className="text-sm text-slate-400 max-w-2xl mx-auto leading-relaxed">
            Pitch branded interactive mini-games to your corporate clients, exhibition booths, and brand activations.
            Earn transparent commissions on qualifying event bookings while keeping your customer workspace fully accessible.
          </p>
        </div>

        {/* Benefits Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 space-y-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Percent className="w-4 h-4" />
            </div>
            <h2 className="text-sm font-bold text-white">Transparent Commissions</h2>
            <p className="text-xs text-slate-400 leading-relaxed">
              Earn 10% on first qualifying client orders and 5% on repeat qualifying bookings within 12 months, subject to eligibility, approved exceptions, and authorized rate overrides.
            </p>
          </div>

          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 space-y-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <Gamepad2 className="w-4 h-4" />
            </div>
            <h2 className="text-sm font-bold text-white">Sales Game Catalogue</h2>
            <p className="text-xs text-slate-400 leading-relaxed">
              Access pitch-ready interactive demonstration games. Present live game mechanics directly to corporate event clients on tablet or desktop.
            </p>
          </div>

          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 space-y-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400">
              <Share2 className="w-4 h-4" />
            </div>
            <h2 className="text-sm font-bold text-white">Automated Attribution</h2>
            <p className="text-xs text-slate-400 leading-relaxed">
              Receive your dedicated partner referral link and coupon code. Real-time client attribution, statements, and transparent payout tracking.
            </p>
          </div>
        </div>

        {/* Dynamic Status / Application Container */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6">
          {/* STATE 1: ACTIVE PARTNER */}
          {salesPartnerStatus === 'active' && (
            <div className="space-y-6 text-center py-4">
              <div className="w-16 h-16 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-8 h-8" />
              </div>

              <div className="space-y-2">
                <span className="inline-block uppercase tracking-wider text-[11px] font-bold text-emerald-400 bg-emerald-500/15 border border-emerald-500/30 px-3 py-0.5 rounded-full">
                  Status: Active Partner
                </span>
                <h3 className="text-xl font-bold text-white">
                  You are an Authorized Sales Partner
                </h3>
                <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
                  Your Sales Partner access is active. You can explore approved demo games, share your unique referral links, and track commissions.
                </p>
              </div>

              <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
                <button
                  onClick={() => navigateTo('/sales/games')}
                  className="w-full sm:w-auto px-6 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl transition-all shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Gamepad2 className="w-4 h-4" />
                  <span>Open Sales Game Catalogue</span>
                </button>
                <button
                  onClick={() => navigateTo('/sales')}
                  className="w-full sm:w-auto px-6 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs rounded-xl transition-colors flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Share2 className="w-4 h-4 text-amber-400" />
                  <span>Sales Dashboard & Referrals</span>
                </button>
                <button
                  onClick={() => navigateTo('/events')}
                  className="w-full sm:w-auto px-6 py-2.5 bg-slate-950 hover:bg-slate-800 text-slate-400 hover:text-white font-semibold text-xs rounded-xl border border-slate-800 transition-colors cursor-pointer"
                >
                  <span>Events Workspace</span>
                </button>
              </div>
            </div>
          )}

          {/* STATE 2: PENDING REVIEW */}
          {salesPartnerStatus === 'pending' && (
            <div className="space-y-6 text-center py-4">
              <div className="w-16 h-16 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/40 flex items-center justify-center mx-auto">
                <Clock className="w-8 h-8 animate-pulse" />
              </div>

              <div className="space-y-2">
                <span className="inline-block uppercase tracking-wider text-[11px] font-bold text-amber-400 bg-amber-500/15 border border-amber-500/30 px-3 py-0.5 rounded-full">
                  Status: Application Pending Review
                </span>
                <h3 className="text-xl font-bold text-white">
                  Application Under Review
                </h3>
                <p className="text-xs text-slate-300 max-w-lg mx-auto leading-relaxed">
                  Your application has been received and is currently being reviewed by our developer administrator team.
                  Applications are typically verified within 1 business day.
                </p>
                {salesPartner?.applied_at && (
                  <p className="text-[11px] text-slate-500 font-mono">
                    Submitted on: {formatDate(salesPartner.applied_at)}
                  </p>
                )}
              </div>

              {/* Dual-role reassurance box */}
              <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 max-w-lg mx-auto text-left space-y-2">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-200">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <span>Dual-Role Safety Guarantee</span>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Your customer workspace, organization ({currentOrganization?.name || 'Workspace'}), games, themes, and event bookings remain 100% active and accessible.
                  Applying for a partner account never restricts your ability to host and manage events.
                </p>
              </div>

              {refreshNotice && (
                <div className="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2 max-w-xs mx-auto animate-in fade-in">
                  {refreshNotice}
                </div>
              )}

              <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
                <button
                  onClick={() => navigateTo('/events')}
                  className="w-full sm:w-auto px-6 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl transition-all shadow-lg shadow-amber-500/20 cursor-pointer"
                >
                  Return to Events Workspace
                </button>
                <button
                  onClick={handleManualRefresh}
                  disabled={isRefreshingStatus}
                  className="w-full sm:w-auto px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium text-xs rounded-xl transition-colors flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isRefreshingStatus ? 'animate-spin text-amber-400' : ''}`} />
                  <span>{isRefreshingStatus ? 'Checking Status...' : 'Check Status Update'}</span>
                </button>
              </div>
            </div>
          )}

          {/* STATE 3: SUSPENDED */}
          {salesPartnerStatus === 'suspended' && (
            <div className="space-y-6 text-center py-4">
              <div className="w-16 h-16 rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/40 flex items-center justify-center mx-auto">
                <AlertTriangle className="w-8 h-8" />
              </div>

              <div className="space-y-2">
                <span className="inline-block uppercase tracking-wider text-[11px] font-bold text-rose-400 bg-rose-500/15 border border-rose-500/30 px-3 py-0.5 rounded-full">
                  Status: Partner Access Suspended
                </span>
                <h3 className="text-xl font-bold text-white">
                  Sales Partner Access Suspended
                </h3>
                <p className="text-xs text-slate-400 max-w-lg mx-auto leading-relaxed">
                  Your Sales Partner privileges are currently suspended. If you believe this is an error or wish to request reinstatement, please reach out to our administration team.
                </p>
              </div>

              {/* Dual-role note */}
              <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 max-w-lg mx-auto text-left space-y-2">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-200">
                  <Info className="w-4 h-4 text-amber-400" />
                  <span>Customer Workspace Unaffected</span>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Your customer organization account, booked events, games, and themes remain completely unaffected and accessible.
                </p>
              </div>

              <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
                <button
                  onClick={() => navigateTo('/events')}
                  className="w-full sm:w-auto px-6 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl transition-all cursor-pointer"
                >
                  Return to Workspace
                </button>
                <button
                  onClick={() => navigateTo('/contact')}
                  className="w-full sm:w-auto px-6 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs rounded-xl transition-colors cursor-pointer"
                >
                  Contact Support
                </button>
              </div>
            </div>
          )}

          {/* STATE 4: REJECTED */}
          {salesPartnerStatus === 'rejected' && (
            <div className="space-y-6 text-center py-4">
              <div className="w-16 h-16 rounded-full bg-slate-800 text-rose-400 border border-rose-500/30 flex items-center justify-center mx-auto">
                <XCircle className="w-8 h-8" />
              </div>

              <div className="space-y-2">
                <span className="inline-block uppercase tracking-wider text-[11px] font-bold text-rose-400 bg-rose-500/15 border border-rose-500/30 px-3 py-0.5 rounded-full">
                  Status: Application Not Approved
                </span>
                <h3 className="text-xl font-bold text-white">
                  Application Not Approved
                </h3>
                <p className="text-xs text-slate-400 max-w-lg mx-auto leading-relaxed">
                  Thank you for your interest in the Event Game Studio Sales Partner program. Our administrator team has reviewed your application and was unable to approve it at this time.
                </p>
              </div>

              {/* Dual-role note */}
              <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 max-w-lg mx-auto text-left space-y-2">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-200">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>Customer Workspace Fully Active</span>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  You can continue to create branded games, customize themes, and launch events for your organization without any interruption.
                </p>
              </div>

              <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
                <button
                  onClick={() => navigateTo('/events')}
                  className="w-full sm:w-auto px-6 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl transition-all cursor-pointer"
                >
                  Return to Events Workspace
                </button>
                <button
                  onClick={() => navigateTo('/contact')}
                  className="w-full sm:w-auto px-6 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs rounded-xl transition-colors cursor-pointer"
                >
                  Inquire with Support
                </button>
              </div>
            </div>
          )}

          {/* STATE 5A: UNAUTHENTICATED VISITOR CALL TO ACTION */}
          {salesPartnerStatus === null && !currentUser && (
            <div className="space-y-6 text-center py-6">
              <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center mx-auto">
                <Briefcase className="w-7 h-7" />
              </div>

              <div className="space-y-2 max-w-md mx-auto">
                <h3 className="text-xl font-extrabold text-white">
                  Sign In to Submit Your Application
                </h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  An Event Game Studio account is required to link your authorized partner profile, referral coupons, and commission statements.
                  You will automatically return directly to this application after signing in.
                </p>
              </div>

              <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 max-w-lg mx-auto text-left space-y-2.5">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-200">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <span>Transparent Program Terms</span>
                </div>
                <ul className="text-[11px] text-slate-400 space-y-1.5 list-disc list-inside">
                  <li>10% on first qualifying client orders & 5% repeat qualifying orders within 12 months.</li>
                  <li>Developer Admin approval required prior to active portal access.</li>
                  <li>Customer workspace and event creation remain 100% independent.</li>
                </ul>
              </div>

              <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
                <button
                  onClick={() => {
                    const currentPath = typeof window !== 'undefined' ? (window.location.pathname || '/sales/apply') : '/sales/apply';
                    try { window.sessionStorage?.setItem('pending_auth_redirect', currentPath); } catch {}
                    navigateTo(`/login?redirect=${encodeURIComponent(currentPath)}`);
                  }}
                  className="w-full sm:w-auto px-6 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl transition-all shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2 cursor-pointer"
                >
                  <UserIcon className="w-4 h-4" />
                  <span>Sign In to Apply</span>
                </button>
                <button
                  onClick={() => {
                    const currentPath = typeof window !== 'undefined' ? (window.location.pathname || '/sales/apply') : '/sales/apply';
                    try { window.sessionStorage?.setItem('pending_auth_redirect', currentPath); } catch {}
                    navigateTo(`/login?mode=signup&redirect=${encodeURIComponent(currentPath)}`);
                  }}
                  className="w-full sm:w-auto px-6 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs rounded-xl transition-colors cursor-pointer"
                >
                  Create Free Account
                </button>
              </div>
            </div>
          )}

          {/* STATE 5B: APPLICATION FORM (when status is null / not applied and authenticated) */}
          {salesPartnerStatus === null && currentUser && (
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <Briefcase className="w-5 h-5 text-amber-400" />
                  <span>Sales Partner Application Form</span>
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Submit your details for review by the Developer Admin team. Applications are typically processed within 24 hours.
                </p>
              </div>

              {/* Success Notification */}
              {submitSuccess && (
                <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl text-emerald-300 text-xs flex items-start gap-3">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400 mt-0.5" />
                  <div className="space-y-1">
                    <div className="font-bold">Application Received!</div>
                    <div>{submitSuccess}</div>
                  </div>
                </div>
              )}

              {/* Error Notification */}
              {submitError && (
                <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-2xl text-rose-300 text-xs flex items-start gap-3">
                  <XCircle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
                  <div className="space-y-1">
                    <div className="font-bold">Submission Error</div>
                    <div>{submitError}</div>
                  </div>
                </div>
              )}

              {/* Applicant Identity Card */}
              <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-3">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
                  Applying Account Identity
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div className="flex items-center gap-2.5 text-slate-300">
                    <UserIcon className="w-4 h-4 text-amber-400 shrink-0" />
                    <span className="font-medium truncate">{currentUser?.name || 'Authorized User'}</span>
                  </div>
                  <div className="flex items-center gap-2.5 text-slate-300">
                    <Mail className="w-4 h-4 text-amber-400 shrink-0" />
                    <span className="font-medium truncate">{currentUser?.email}</span>
                  </div>
                </div>
              </div>

              {/* Form Inputs */}
              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-bold text-slate-300">
                      Agency, Event Company, or Trading Name <span className="text-slate-500 font-normal">(Optional)</span>
                    </label>
                    <span className="text-[10px] text-slate-500 font-mono">
                      {agencyName.length}/150
                    </span>
                  </div>
                  <div className="relative">
                    <Building2 className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      maxLength={150}
                      value={agencyName}
                      onChange={(e) => setAgencyName(e.target.value)}
                      placeholder="e.g. Apex Event Production / Creative Activations"
                      disabled={isSubmitting}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3.5 py-2.5 text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-amber-500 transition-colors"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-bold text-slate-300">
                      Experience & Target Event Clients <span className="text-slate-500 font-normal">(Optional)</span>
                    </label>
                    <span className="text-[10px] text-slate-500 font-mono">
                      {notes.length}/1000
                    </span>
                  </div>
                  <textarea
                    rows={3}
                    maxLength={1000}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Briefly describe the types of events or corporate clients you serve (e.g. roadshows, trade exhibitions, annual dinners, marketing campaigns)..."
                    disabled={isSubmitting}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-amber-500 transition-colors resize-none"
                  />
                </div>

                {/* Terms Agreement */}
                <label className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-950/80 border border-slate-800 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={agreedToTerms}
                    onChange={(e) => setAgreedToTerms(e.target.checked)}
                    disabled={isSubmitting}
                    className="mt-0.5 rounded border-slate-700 text-amber-500 focus:ring-amber-500 focus:ring-offset-slate-900"
                  />
                  <span className="text-xs text-slate-300 leading-relaxed select-none">
                    I understand that Sales Partner applications require Developer Admin review and approval before active portal access is granted.
                    My existing customer workspace and organization memberships will remain fully accessible.
                  </span>
                </label>
              </div>

              {/* Submit Buttons */}
              <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => navigateTo(currentOrganization ? '/events' : '/')}
                  disabled={isSubmitting}
                  className="w-full sm:w-auto px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white transition-colors cursor-pointer"
                >
                  {currentOrganization ? 'Cancel & Return to Workspace' : 'Cancel & Return to Home'}
                </button>

                <button
                  type="submit"
                  disabled={isSubmitting || !agreedToTerms}
                  className="w-full sm:w-auto px-6 py-2.5 bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-slate-950 font-bold text-xs rounded-xl transition-all shadow-lg shadow-amber-500/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer"
                >
                  {isSubmitting ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                      <span>Submitting Application...</span>
                    </>
                  ) : (
                    <>
                      <span>Submit Application</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </main>
    </div>
  );
};
