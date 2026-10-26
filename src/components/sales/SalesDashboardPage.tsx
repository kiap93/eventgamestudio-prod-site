import React, { useState, useEffect } from 'react';
import { SalesNavbar } from './SalesNavbar';
import { SEO } from '../common/SEO';
import { navigateTo } from '../../hooks/useRouteContext';
import { useAuth } from '../../context/AuthContext';
import { useLocalization } from '../../context/LocalizationContext';
import { apiFetch } from '../../lib/api';
import {
  SalesDashboardSummary,
  SalesPartnerCustomer,
  SalesCommission,
  SalesDashboardNextAction,
} from '../../types/sales';
import {
  ShieldCheck,
  Building2,
  Users,
  Coins,
  Clock,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  RefreshCw,
  Share2,
  Gamepad2,
  Sparkles,
  Info,
  Calendar,
  ExternalLink,
  ChevronRight,
  TrendingUp,
  Award,
  Zap,
} from 'lucide-react';

export const SalesDashboardPage: React.FC = () => {
  const { currentUser, isSalesPartner, isLoading, isAuthenticated } = useAuth();
  const { t } = useLocalization();
  const [summary, setSummary] = useState<SalesDashboardSummary | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchDashboardData = async () => {
    try {
      setError(null);
      const res = await apiFetch('/api/sales/dashboard-summary');
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to load sales partner dashboard');
      }

      const data = await res.json();
      setSummary(data.summary || null);
    } catch (err: any) {
      setError(err?.message || 'Error loading dashboard statistics');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (isLoading || !isAuthenticated || !isSalesPartner) {
      if (!isLoading && (!isAuthenticated || !isSalesPartner)) {
        setLoading(false);
      }
      return;
    }
    fetchDashboardData();
  }, [isLoading, isAuthenticated, isSalesPartner]);

  const handleRefresh = () => {
    if (isLoading || !isAuthenticated || !isSalesPartner) return;
    setRefreshing(true);
    fetchDashboardData();
  };

  const formatCurrency = (amount: number, currency: string = 'MYR') => {
    return `${currency === 'MYR' ? 'RM' : currency} ${amount.toLocaleString('en-MY', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  const getNextActionBadge = (variant?: 'warning' | 'info' | 'success') => {
    switch (variant) {
      case 'warning':
        return 'bg-amber-500/15 text-amber-400 border-amber-500/30';
      case 'success':
        return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30';
      case 'info':
      default:
        return 'bg-blue-500/15 text-blue-400 border-blue-500/30';
    }
  };

  return (
    <div className="min-w-screen min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-amber-500 selection:text-slate-950">
      <SEO robots="noindex, follow" title={`${t('sales.dashboard.title')} | ${t('sales.nav.brandTitle')}`} />
      <SalesNavbar activeSection="portal" />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Header with Title & Action Controls */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-800/80 pb-6">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 mb-1">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>{t('sales.dashboard.activeStatus')} {t('sales.nav.partner')}</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              {t('sales.dashboard.title')}
            </h1>
            <p className="text-sm text-slate-400 max-w-2xl">
              {t('sales.dashboard.subtitle')}
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={handleRefresh}
              disabled={loading || refreshing}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-850 border border-slate-800 text-xs font-semibold text-slate-200 hover:text-white transition-all disabled:opacity-50 cursor-pointer"
              title={t('sales.dashboard.refresh')}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              <span>{refreshing ? t('sales.dashboard.refreshing') : t('sales.dashboard.refresh')}</span>
            </button>
            <button
              onClick={() => navigateTo('/sales/referrals')}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-450 text-slate-950 text-xs font-bold transition-all shadow-md shadow-amber-500/10 cursor-pointer"
            >
              <Share2 className="w-3.5 h-3.5" />
              <span>{t('sales.referrals.yourReferralUrl')}</span>
            </button>
          </div>
        </div>

        {/* Error State */}
        {error && (
          <div className="bg-rose-500/10 border border-rose-500/30 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
              <div>
                <h4 className="text-sm font-bold text-rose-300">{t('sales.aiTranslator.errorTitle')}</h4>
                <p className="text-xs text-rose-400/80">{error}</p>
              </div>
            </div>
            <button
              onClick={handleRefresh}
              className="px-4 py-2 bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 text-xs font-semibold rounded-xl border border-rose-500/40 transition-colors shrink-0 cursor-pointer"
            >
              {t('sales.aiTranslator.retry')}
            </button>
          </div>
        )}

        {/* Loading Skeleton */}
        {loading && !summary && (
          <div className="space-y-6 animate-pulse">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="h-32 bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
                  <div className="w-8 h-8 rounded-lg bg-slate-800" />
                  <div className="h-4 bg-slate-800 rounded w-2/3" />
                  <div className="h-6 bg-slate-800 rounded w-1/2" />
                </div>
              ))}
            </div>
            <div className="h-48 bg-slate-900 border border-slate-800 rounded-2xl" />
          </div>
        )}

        {/* Data View */}
        {summary && (
          <>
            {/* 1. Summary Metrics Cards (6 Primary Cards) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
              {/* Card 1: Total Attributed Customers */}
              <div
                onClick={() => navigateTo('/sales/customers?status=approved')}
                className="bg-slate-900/90 border border-slate-800 hover:border-amber-500/50 rounded-2xl p-4 space-y-3 cursor-pointer transition-all hover:scale-[1.01] shadow-xl group"
              >
                <div className="flex items-center justify-between">
                  <div className="w-9 h-9 rounded-xl bg-amber-500/15 text-amber-400 flex items-center justify-center group-hover:bg-amber-500 group-hover:text-slate-950 transition-colors">
                    <Users className="w-4 h-4" />
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-amber-400 group-hover:translate-x-0.5 transition-all" />
                </div>
                <div>
                  <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                    {t('sales.dashboard.metrics.activeCustomers')}
                  </div>
                  <div className="text-2xl font-black text-white mt-1">
                    {summary.total_attributed_customers}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1">
                    {t('sales.dashboard.metrics.activeCustomersDesc')}
                  </div>
                </div>
              </div>

              {/* Card 2: Pending Attribution Reviews */}
              <div
                onClick={() => navigateTo('/sales/referrals?status=pending')}
                className="bg-slate-900/90 border border-slate-800 hover:border-amber-500/50 rounded-2xl p-4 space-y-3 cursor-pointer transition-all hover:scale-[1.01] shadow-xl group"
              >
                <div className="flex items-center justify-between">
                  <div className="w-9 h-9 rounded-xl bg-blue-500/15 text-blue-400 flex items-center justify-center group-hover:bg-blue-500 group-hover:text-slate-950 transition-colors">
                    <Clock className="w-4 h-4" />
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-blue-400 group-hover:translate-x-0.5 transition-all" />
                </div>
                <div>
                  <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                    {t('sales.commissions.pendingReview')}
                  </div>
                  <div className="text-2xl font-black text-white mt-1">
                    {summary.pending_attributions}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1">
                    {t('sales.referrals.step2Desc')}
                  </div>
                </div>
              </div>

              {/* Card 3: Total Recorded Commissions */}
              <div
                onClick={() => navigateTo('/sales/commissions')}
                className="bg-slate-900/90 border border-slate-800 hover:border-amber-500/50 rounded-2xl p-4 space-y-3 cursor-pointer transition-all hover:scale-[1.01] shadow-xl group"
              >
                <div className="flex items-center justify-between">
                  <div className="w-9 h-9 rounded-xl bg-purple-500/15 text-purple-400 flex items-center justify-center group-hover:bg-purple-500 group-hover:text-slate-950 transition-colors">
                    <Coins className="w-4 h-4" />
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-purple-400 group-hover:translate-x-0.5 transition-all" />
                </div>
                <div>
                  <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                    {t('sales.dashboard.metrics.totalEarned')}
                  </div>
                  <div className="text-2xl font-black text-white mt-1">
                    {formatCurrency(summary.total_commissions_earned, summary.currency)}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1">
                    {t('sales.dashboard.metrics.totalEarnedDesc')}
                  </div>
                </div>
              </div>

              {/* Card 4: Commissions Pending Review */}
              <div
                onClick={() => navigateTo('/sales/commissions?status=pending_review')}
                className="bg-slate-900/90 border border-slate-800 hover:border-amber-500/50 rounded-2xl p-4 space-y-3 cursor-pointer transition-all hover:scale-[1.01] shadow-xl group"
              >
                <div className="flex items-center justify-between">
                  <div className="w-9 h-9 rounded-xl bg-amber-500/15 text-amber-400 flex items-center justify-center group-hover:bg-amber-500 group-hover:text-slate-950 transition-colors">
                    <Clock className="w-4 h-4" />
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-amber-400 group-hover:translate-x-0.5 transition-all" />
                </div>
                <div>
                  <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                    {t('sales.commissions.pendingReview')}
                  </div>
                  <div className="text-2xl font-black text-white mt-1">
                    {formatCurrency(summary.commissions_pending_review, summary.currency)}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1">
                    {summary.commissions_pending_review_count} {t('sales.commissions.statusPending')}
                  </div>
                </div>
              </div>

              {/* Card 5: Approved Awaiting Payout */}
              <div
                onClick={() => navigateTo('/sales/commissions?status=approved')}
                className="bg-slate-900/90 border border-slate-800 hover:border-amber-500/50 rounded-2xl p-4 space-y-3 cursor-pointer transition-all hover:scale-[1.01] shadow-xl group"
              >
                <div className="flex items-center justify-between">
                  <div className="w-9 h-9 rounded-xl bg-emerald-500/15 text-emerald-400 flex items-center justify-center group-hover:bg-emerald-500 group-hover:text-slate-950 transition-colors">
                    <CheckCircle2 className="w-4 h-4" />
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-emerald-400 group-hover:translate-x-0.5 transition-all" />
                </div>
                <div>
                  <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                    {t('sales.dashboard.metrics.readyForPayout')}
                  </div>
                  <div className="text-2xl font-black text-white mt-1">
                    {formatCurrency(summary.approved_awaiting_payout, summary.currency)}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1">
                    {t('sales.dashboard.metrics.readyForPayoutDesc')}
                  </div>
                </div>
              </div>

              {/* Card 6: Total Commissions Paid */}
              <div
                onClick={() => navigateTo('/sales/commissions?status=paid')}
                className="bg-slate-900/90 border border-slate-800 hover:border-amber-500/50 rounded-2xl p-4 space-y-3 cursor-pointer transition-all hover:scale-[1.01] shadow-xl group"
              >
                <div className="flex items-center justify-between">
                  <div className="w-9 h-9 rounded-xl bg-teal-500/15 text-teal-400 flex items-center justify-center group-hover:bg-teal-500 group-hover:text-slate-950 transition-colors">
                    <Award className="w-4 h-4" />
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-teal-400 group-hover:translate-x-0.5 transition-all" />
                </div>
                <div>
                  <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                    {t('sales.commissions.paidOut')}
                  </div>
                  <div className="text-2xl font-black text-white mt-1">
                    {formatCurrency(summary.total_commissions_paid, summary.currency)}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1">
                    {summary.total_commissions_paid_count} {t('sales.commissions.statusPaid')}
                  </div>
                </div>
              </div>
            </div>

            {/* 2. Next Actions Section */}
            {summary.next_actions && summary.next_actions.length > 0 && (
              <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 space-y-4">
                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-amber-400" />
                  <h2 className="text-base font-bold text-white tracking-tight">
                    {t('sales.dashboard.quickActions')}
                  </h2>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {summary.next_actions.map((action) => (
                    <div
                      key={action.id}
                      className="bg-slate-950/80 border border-slate-800/80 hover:border-slate-700 rounded-xl p-4.5 flex flex-col justify-between gap-3 transition-colors"
                    >
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${getNextActionBadge(
                              action.badge_variant
                            )}`}
                          >
                            {action.type.replace('_', ' ')}
                          </span>
                        </div>
                        <h4 className="text-sm font-bold text-white">{action.title}</h4>
                        <p className="text-xs text-slate-400 leading-relaxed">
                          {action.description}
                        </p>
                      </div>

                      <div className="pt-2 border-t border-slate-900 flex justify-end">
                        <button
                          onClick={() => navigateTo(action.action_url)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-450 text-slate-950 font-bold text-xs transition-colors cursor-pointer"
                        >
                          <span>{action.action_label}</span>
                          <ArrowRight className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 3. Quick Navigation Hub (5 Workspace Modules) */}
            <div className="space-y-3">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider px-1">
                {t('sales.nav.portalSubtitle')}
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                {/* 1. Customers Module */}
                <div
                  onClick={() => navigateTo('/sales/customers')}
                  className="bg-slate-900 border border-slate-800 hover:border-amber-500/50 rounded-2xl p-5 space-y-3 cursor-pointer transition-all hover:scale-[1.01] shadow-xl group"
                >
                  <div className="w-10 h-10 rounded-xl bg-amber-500/15 text-amber-400 flex items-center justify-center group-hover:bg-amber-500 group-hover:text-slate-950 transition-colors">
                    <Users className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-white group-hover:text-amber-400 transition-colors">
                      {t('sales.nav.customers')}
                    </h4>
                    <p className="text-xs text-slate-400 mt-1 line-clamp-2">
                      {t('sales.customers.subtitle')}
                    </p>
                  </div>
                  <div className="text-xs font-bold text-amber-400 inline-flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                    <span>{t('sales.customers.title')}</span>
                    <span>→</span>
                  </div>
                </div>

                {/* 2. Referrals Module */}
                <div
                  onClick={() => navigateTo('/sales/referrals')}
                  className="bg-slate-900 border border-slate-800 hover:border-amber-500/50 rounded-2xl p-5 space-y-3 cursor-pointer transition-all hover:scale-[1.01] shadow-xl group"
                >
                  <div className="w-10 h-10 rounded-xl bg-amber-500/15 text-amber-400 flex items-center justify-center group-hover:bg-amber-500 group-hover:text-slate-950 transition-colors">
                    <Share2 className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-white group-hover:text-amber-400 transition-colors">
                      {t('sales.nav.referrals')}
                    </h4>
                    <p className="text-xs text-slate-400 mt-1 line-clamp-2">
                      {t('sales.referrals.subtitle')}
                    </p>
                  </div>
                  <div className="text-xs font-bold text-amber-400 inline-flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                    <span>{t('sales.referrals.title')}</span>
                    <span>→</span>
                  </div>
                </div>

                {/* 3. Commissions Module */}
                <div
                  onClick={() => navigateTo('/sales/commissions')}
                  className="bg-slate-900 border border-slate-800 hover:border-amber-500/50 rounded-2xl p-5 space-y-3 cursor-pointer transition-all hover:scale-[1.01] shadow-xl group"
                >
                  <div className="w-10 h-10 rounded-xl bg-amber-500/15 text-amber-400 flex items-center justify-center group-hover:bg-amber-500 group-hover:text-slate-950 transition-colors">
                    <Coins className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-white group-hover:text-amber-400 transition-colors">
                      {t('sales.nav.commissions')}
                    </h4>
                    <p className="text-xs text-slate-400 mt-1 line-clamp-2">
                      {t('sales.commissions.subtitle')}
                    </p>
                  </div>
                  <div className="text-xs font-bold text-amber-400 inline-flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                    <span>{t('sales.dashboard.viewCommissions')}</span>
                    <span>→</span>
                  </div>
                </div>

                {/* 4. Game Catalogue Module */}
                <div
                  onClick={() => navigateTo('/sales/games')}
                  className="bg-slate-900 border border-slate-800 hover:border-amber-500/50 rounded-2xl p-5 space-y-3 cursor-pointer transition-all hover:scale-[1.01] shadow-xl group"
                >
                  <div className="w-10 h-10 rounded-xl bg-amber-500/15 text-amber-400 flex items-center justify-center group-hover:bg-amber-500 group-hover:text-slate-950 transition-colors">
                    <Gamepad2 className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-white group-hover:text-amber-400 transition-colors">
                      {t('sales.nav.games')}
                    </h4>
                    <p className="text-xs text-slate-400 mt-1 line-clamp-2">
                      {t('sales.games.subtitle')}
                    </p>
                  </div>
                  <div className="text-xs font-bold text-amber-400 inline-flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                    <span>{t('sales.dashboard.browseCatalogue')}</span>
                    <span>→</span>
                  </div>
                </div>

                {/* 5. Customer Workspace Switch */}
                <div
                  onClick={() => navigateTo('/events')}
                  className="bg-slate-900/60 border border-slate-800 hover:border-slate-700 rounded-2xl p-5 space-y-3 cursor-pointer transition-all hover:scale-[1.01] shadow-xl group"
                >
                  <div className="w-10 h-10 rounded-xl bg-slate-800 text-slate-300 flex items-center justify-center group-hover:bg-slate-700 group-hover:text-white transition-colors">
                    <Building2 className="w-5 h-5 text-amber-400" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-white">
                      {t('sales.nav.customerWorkspace')}
                    </h4>
                    <p className="text-xs text-slate-400 mt-1 line-clamp-2">
                      {t('sales.dashboard.subtitle')}
                    </p>
                  </div>
                  <div className="text-xs font-bold text-slate-400 inline-flex items-center gap-1 group-hover:text-slate-200 transition-colors">
                    <span>{t('sales.nav.workspace')}</span>
                    <ExternalLink className="w-3 h-3" />
                  </div>
                </div>
              </div>
            </div>

            {/* 4. Recent Attributed Customers & Recent Commissions Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Recent Attributed Customers */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-amber-400" />
                    <h3 className="text-base font-bold text-white">{t('sales.referrals.recentAttributions')}</h3>
                  </div>
                  <button
                    onClick={() => navigateTo('/sales/customers')}
                    className="text-xs font-bold text-amber-400 hover:text-amber-300 transition-colors cursor-pointer"
                  >
                    {t('sales.dashboard.viewAllCustomers')} →
                  </button>
                </div>

                {summary.recent_customers && summary.recent_customers.length > 0 ? (
                  <div className="divide-y divide-slate-800/80">
                    {summary.recent_customers.map((cust) => (
                      <div
                        key={cust.id}
                        onClick={() => navigateTo('/sales/customers')}
                        className="py-3 flex items-center justify-between gap-3 hover:bg-slate-850/50 px-2 rounded-xl transition-colors cursor-pointer"
                      >
                        <div className="min-w-0 space-y-0.5">
                          <div className="flex items-center gap-2">
                            <h5 className="text-sm font-bold text-white truncate max-w-[200px]">
                              {cust.organization_name}
                            </h5>
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                                cust.attribution_status === 'approved'
                                  ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                                  : cust.attribution_status === 'pending'
                                  ? 'bg-blue-500/15 text-blue-400 border-blue-500/30'
                                  : 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                              }`}
                            >
                              {cust.attribution_status}
                            </span>
                          </div>
                          <div className="text-xs text-slate-400 flex items-center gap-3">
                            <span>{cust.total_events} {t('sales.customers.eventsCol')}</span>
                            <span>•</span>
                            <span className="text-amber-400 font-medium">
                              {t('sales.customers.earnedCommission')}: {formatCurrency(cust.total_commissions_earned, cust.currency)}
                            </span>
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <span className="text-xs font-semibold text-slate-400">
                            {new Date(cust.established_at || cust.created_at).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-8 text-center space-y-2">
                    <p className="text-xs text-slate-400">{t('sales.customers.emptyState')}</p>
                    <button
                      onClick={() => navigateTo('/sales/referrals')}
                      className="px-3 py-1.5 bg-amber-500/15 text-amber-400 hover:bg-amber-500 hover:text-slate-950 rounded-xl text-xs font-bold transition-all cursor-pointer"
                    >
                      {t('sales.referrals.copyLink')}
                    </button>
                  </div>
                )}
              </div>

              {/* Recent Commissions */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Coins className="w-4 h-4 text-amber-400" />
                    <h3 className="text-base font-bold text-white">{t('sales.dashboard.recentActivity')}</h3>
                  </div>
                  <button
                    onClick={() => navigateTo('/sales/commissions')}
                    className="text-xs font-bold text-amber-400 hover:text-amber-300 transition-colors cursor-pointer"
                  >
                    {t('sales.dashboard.viewAllCommissions')} →
                  </button>
                </div>

                {summary.recent_commissions && summary.recent_commissions.length > 0 ? (
                  <div className="divide-y divide-slate-800/80">
                    {summary.recent_commissions.map((comm) => (
                      <div
                        key={comm.id}
                        onClick={() => navigateTo('/sales/commissions')}
                        className="py-3 flex items-center justify-between gap-3 hover:bg-slate-850/50 px-2 rounded-xl transition-colors cursor-pointer"
                      >
                        <div className="min-w-0 space-y-0.5">
                          <div className="flex items-center gap-2">
                            <h5 className="text-sm font-bold text-white truncate max-w-[180px]">
                              {comm.organization?.name || 'Client Order'}
                            </h5>
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">
                              {comm.order_type === 'first_order'
                                ? t('sales.customers.firstOrderRate')
                                : comm.order_type === 'repeat_order'
                                ? t('sales.customers.repeatOrderRate')
                                : 'Opportunity'}
                            </span>
                          </div>
                          <div className="text-xs text-slate-400">
                            {t('sales.customers.spendCol')}: {formatCurrency(comm.cash_collected_amount, comm.currency)}
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <div className="text-sm font-black text-amber-400">
                            +{formatCurrency(comm.commission_amount, comm.currency)}
                          </div>
                          <span
                            className={`text-[10px] font-semibold ${
                              comm.status === 'paid'
                                ? 'text-emerald-400'
                                : comm.status === 'approved'
                                ? 'text-amber-400'
                                : 'text-blue-400'
                            }`}
                          >
                            {comm.status.replace('_', ' ')}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-8 text-center space-y-2">
                    <p className="text-xs text-slate-400">{t('sales.commissions.emptyLedger')}</p>
                    <p className="text-[11px] text-slate-500">
                      {t('sales.dashboard.noRecentActivity')}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* 5. Policy Explanations & Financial Guardrails Banner */}
            <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-5 text-xs text-slate-400 space-y-2">
              <div className="flex items-center gap-2 font-bold text-slate-300">
                <Info className="w-4 h-4 text-amber-400" />
                <span>{t('sales.referrals.attributionHowItWorks')}</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2 text-[11px] leading-relaxed">
                <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-850">
                  <span className="font-bold text-amber-400 block mb-0.5">{t('sales.apply.benefit1Title')}</span>
                  {t('sales.apply.benefit1Desc')}
                </div>
                <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-850">
                  <span className="font-bold text-amber-400 block mb-0.5">{t('sales.apply.benefit2Title')}</span>
                  {t('sales.apply.benefit2Desc')}
                </div>
                <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-850">
                  <span className="font-bold text-amber-400 block mb-0.5">{t('sales.apply.benefit3Title')}</span>
                  {t('sales.apply.benefit3Desc')}
                </div>
                <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-850">
                  <span className="font-bold text-amber-400 block mb-0.5">{t('sales.apply.benefit4Title')}</span>
                  {t('sales.apply.benefit4Desc')}
                </div>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
};
