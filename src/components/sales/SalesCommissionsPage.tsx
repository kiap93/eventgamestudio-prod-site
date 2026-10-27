import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useLocalization } from '../../context/LocalizationContext';
import { apiFetch } from '../../lib/api';
import { SalesNavbar } from './SalesNavbar';
import { SEO } from '../common/SEO';
import { SalesPartnerTranslationModal } from './SalesPartnerTranslationModal';
import {
  SalesCommission,
  PartnerCommissionSummary,
  SalesOpportunity,
  CustomerAttribution,
} from '../../types/sales';
import {
  Coins,
  Clock,
  CheckCircle2,
  AlertCircle,
  Calendar,
  Sparkles,
  TrendingUp,
  FileText,
  Plus,
  RefreshCw,
  ExternalLink,
  ShieldCheck,
  Building2,
  Layers,
  ArrowRight,
  Info,
  X,
  BadgeAlert,
} from 'lucide-react';

export const SalesCommissionsPage: React.FC = () => {
  const { currentUser, isSalesPartner, isLoading, isAuthenticated } = useAuth();
  const { t } = useLocalization();
  const [commissions, setCommissions] = useState<SalesCommission[]>([]);
  const [summary, setSummary] = useState<PartnerCommissionSummary | null>(null);
  const [attributionWindows, setAttributionWindows] = useState<any[]>([]);
  const [opportunities, setOpportunities] = useState<SalesOpportunity[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // New Opportunity Modal State
  const [showOpportunityModal, setShowOpportunityModal] = useState<boolean>(false);
  const [showTranslatorModal, setShowTranslatorModal] = useState<boolean>(false);
  const [submittingOpportunity, setSubmittingOpportunity] = useState<boolean>(false);
  const [opportunityForm, setOpportunityForm] = useState({
    organizationId: '',
    title: '',
    description: '',
    expectedEventDate: '',
  });

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);

      const [commRes, oppRes, attrRes] = await Promise.all([
        apiFetch('/api/sales/commissions'),
        apiFetch('/api/sales/opportunities'),
        apiFetch('/api/sales/attribution-summary'),
      ]);

      if (!commRes.ok) throw new Error('Failed to load commission ledger');
      const commData = await commRes.json();
      setCommissions(commData.commissions || []);
      setSummary(commData.summary || null);

      if (oppRes.ok) {
        const oppData = await oppRes.json();
        setOpportunities(oppData.opportunities || []);
      }

      if (attrRes.ok) {
        const attrData = await attrRes.json();
        setAttributionWindows(attrData.summary || []);
      }
    } catch (err: any) {
      setError(err.message || 'Error loading commissions data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isLoading || !isAuthenticated || !isSalesPartner) {
      if (!isLoading && (!isAuthenticated || !isSalesPartner)) {
        setLoading(false);
      }
      return;
    }
    fetchData();
  }, [isLoading, isAuthenticated, isSalesPartner]);

  const handleCreateOpportunity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!opportunityForm.organizationId || !opportunityForm.title.trim()) {
      alert('Please select an organization and enter a title');
      return;
    }

    try {
      setSubmittingOpportunity(true);
      const res = await apiFetch('/api/sales/opportunities', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(opportunityForm),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to submit sales opportunity request');
      }

      setShowOpportunityModal(false);
      setOpportunityForm({
        organizationId: '',
        title: '',
        description: '',
        expectedEventDate: '',
      });
      fetchData();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSubmittingOpportunity(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'paid':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
            <CheckCircle2 className="w-3 h-3" /> {t('sales.commissions.statusPaid')}
          </span>
        );
      case 'approved':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30">
            <CheckCircle2 className="w-3 h-3" /> {t('sales.commissions.statusApproved')}
          </span>
        );
      case 'pending_review':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-500/15 text-blue-400 border border-blue-500/30">
            <Clock className="w-3 h-3" /> {t('sales.commissions.statusPending')}
          </span>
        );
      case 'clawback':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-500/15 text-rose-400 border border-rose-500/30">
            <AlertCircle className="w-3 h-3" /> Clawback
          </span>
        );
      case 'voided':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-800 text-slate-400 border border-slate-700">
            <AlertCircle className="w-3 h-3" /> {t('sales.commissions.statusCancelled')}
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded text-xs bg-slate-800 text-slate-300">
            {status}
          </span>
        );
    }
  };

  const formatRateBadgeLabel = (baseLabel: string, defaultPercent: number, actualRate?: number) => {
    if (typeof actualRate === 'number' && Number.isFinite(actualRate)) {
      const actualPercent = Math.round(actualRate * 10000) / 100;
      if (Math.abs(actualPercent - defaultPercent) > 0.01) {
        return baseLabel.replace(`${defaultPercent}%`, `${actualPercent}%`);
      }
    }
    return baseLabel;
  };

  const getOrderTypeBadge = (orderType: string, commissionRate?: number) => {
    switch (orderType) {
      case 'first_order':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">
            {formatRateBadgeLabel(t('sales.customers.firstOrderRate'), 10, commissionRate)}
          </span>
        );
      case 'repeat_order':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
            {formatRateBadgeLabel(t('sales.customers.repeatOrderRate'), 5, commissionRate)}
          </span>
        );
      case 'approved_opportunity': {
        const oppPct =
          typeof commissionRate === 'number' && Number.isFinite(commissionRate)
            ? `${Math.round(commissionRate * 10000) / 100}%`
            : '5%';
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold bg-purple-500/15 text-purple-300 border border-purple-500/30">
            Opportunity ({oppPct})
          </span>
        );
      }
      default:
        return <span className="text-xs text-slate-400">{orderType}</span>;
    }
  };

  return (
    <div className="min-w-screen min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-amber-500 selection:text-slate-950">
      <SEO robots="noindex, follow" title={`${t('sales.commissions.title')} | ${t('sales.nav.brandTitle')}`} />
      <SalesNavbar activeSection="commissions" />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Header & Refresh */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-6">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>{t('sales.commissions.ledgerTitle')}</span>
            </div>
            <h1 className="text-3xl font-black text-white tracking-tight">{t('sales.commissions.title')}</h1>
            <p className="text-sm text-slate-400">
              {t('sales.commissions.subtitle')}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={fetchData}
              disabled={loading}
              className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white text-xs font-semibold flex items-center gap-2 cursor-pointer transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>{loading ? t('sales.dashboard.refreshing') : t('sales.dashboard.refresh')}</span>
            </button>
            <button
              onClick={() => setShowOpportunityModal(true)}
              className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors shadow-md shadow-amber-500/10"
            >
              <Plus className="w-4 h-4" />
              <span>{t('sales.commissions.requestOpportunity')}</span>
            </button>
          </div>
        </div>

        {error && (
          <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm flex items-center gap-3">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* 1. Performance Metrics Summary */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Total Earned */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-2">
            <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
              <span>{t('sales.commissions.totalCommission')}</span>
              <Coins className="w-4 h-4 text-amber-400" />
            </div>
            <div className="text-2xl font-black text-white tracking-tight">
              RM{(summary?.total_earned || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className="text-[11px] text-slate-400">
              {t('sales.dashboard.metrics.totalEarnedDesc')}
            </div>
          </div>

          {/* Card 2: Ready for Payout */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-2">
            <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
              <span>{t('sales.commissions.approvedUnpaid')}</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-2xl font-black text-emerald-400 tracking-tight">
              RM{(summary?.ready_for_payout || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className="text-[11px] text-slate-400">
              {t('sales.dashboard.metrics.readyForPayoutDesc')}
            </div>
          </div>

          {/* Card 3: Pending Review */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-2">
            <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
              <span>{t('sales.commissions.pendingReview')}</span>
              <Clock className="w-4 h-4 text-blue-400" />
            </div>
            <div className="text-2xl font-black text-blue-400 tracking-tight">
              RM{(summary?.pending_review || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className="text-[11px] text-slate-400">
              {t('sales.referrals.step3Desc')}
            </div>
          </div>

          {/* Card 4: Total Paid Out */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-2">
            <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
              <span>{t('sales.commissions.paidOut')}</span>
              <TrendingUp className="w-4 h-4 text-slate-400" />
            </div>
            <div className="text-2xl font-black text-white tracking-tight">
              RM{(summary?.total_paid || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className="text-[11px] text-slate-400">
              {t('sales.commissions.payoutThresholdNotice')}
            </div>
          </div>
        </div>

        {/* 2. Commissions Ledger Table */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Coins className="w-4 h-4 text-amber-400" />
              <span>{t('sales.commissions.ledgerTitle')}</span>
            </h2>
          </div>

          {loading ? (
            <div className="p-12 text-center text-slate-400">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto text-amber-400 mb-2" />
              <span>{t('sales.dashboard.refreshing')}</span>
            </div>
          ) : commissions.length === 0 ? (
            <div className="p-12 text-center text-slate-400 space-y-2">
              <Coins className="w-8 h-8 text-slate-600 mx-auto" />
              <div className="font-semibold">{t('sales.commissions.emptyLedger')}</div>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                {t('sales.dashboard.noRecentActivity')}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-950/60 text-slate-400 uppercase tracking-wider text-[11px] border-b border-slate-800 font-semibold">
                  <tr>
                    <th className="px-4 py-3">{t('sales.commissions.eventCol')}</th>
                    <th className="px-4 py-3">{t('sales.commissions.clientCol')}</th>
                    <th className="px-4 py-3">{t('sales.commissions.rateCol')}</th>
                    <th className="px-4 py-3">{t('sales.commissions.grossCol')}</th>
                    <th className="px-4 py-3">{t('sales.commissions.netCol')}</th>
                    <th className="px-4 py-3">{t('sales.commissions.statusCol')}</th>
                    <th className="px-4 py-3">{t('sales.commissions.dateCol')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80">
                  {commissions.map((comm) => (
                    <tr key={comm.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="px-4 py-3 font-semibold text-white">
                        {comm.event?.name || 'Event Activation'}
                        <div className="text-[10px] text-slate-500 font-normal">
                          Order #{comm.order_id ? comm.order_id.slice(0, 8) : comm.id.slice(0, 8)}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-200">
                          {comm.organization?.name || 'Organization'}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {getOrderTypeBadge(comm.order_type, comm.commission_rate)}
                      </td>
                      <td className="px-4 py-3 font-mono text-slate-300">
                        RM{Number(comm.cash_collected_amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-3 font-mono font-bold text-amber-400">
                        RM{Number(comm.commission_amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-3">
                        {getStatusBadge(comm.status)}
                      </td>
                      <td className="px-4 py-3 text-slate-400">
                        {new Date(comm.created_at).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* 3. Opportunities Section */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-purple-400" />
                <span>{t('sales.commissions.opportunityModalTitle')}</span>
              </h2>
              <p className="text-xs text-slate-400">
                {t('sales.commissions.requestOpportunityDesc')}
              </p>
            </div>
            <button
              onClick={() => setShowOpportunityModal(true)}
              className="px-3 py-1.5 rounded-lg bg-purple-500/15 hover:bg-purple-500/25 border border-purple-500/30 text-purple-300 text-xs font-semibold cursor-pointer transition-colors"
            >
              + {t('sales.commissions.requestOpportunity')}
            </button>
          </div>

          {opportunities.length === 0 ? (
            <div className="p-8 text-center bg-slate-950/50 rounded-xl border border-slate-800/80 space-y-1">
              <div className="text-xs font-medium text-slate-400">{t('sales.commissions.emptyLedger')}</div>
              <div className="text-[11px] text-slate-500">
                {t('sales.commissions.requestOpportunityDesc')}
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-950/60 text-slate-400 uppercase tracking-wider text-[11px] border-b border-slate-800 font-semibold">
                  <tr>
                    <th className="px-4 py-3">{t('sales.commissions.opportunityTitleLabel')}</th>
                    <th className="px-4 py-3">{t('sales.commissions.clientCol')}</th>
                    <th className="px-4 py-3">{t('sales.commissions.statusCol')}</th>
                    <th className="px-4 py-3">{t('sales.customers.windowCol')}</th>
                    <th className="px-4 py-3">{t('sales.commissions.opportunityDescLabel')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80">
                  {opportunities.map((opp) => (
                    <tr key={opp.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="px-4 py-3 font-semibold text-white">
                        {opp.title}
                        {opp.description && (
                          <div className="text-[11px] text-slate-400 font-normal mt-0.5">
                            {opp.description}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-300">
                        {opp.organization?.name || 'Organization'}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            opp.status === 'approved'
                              ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                              : opp.status === 'consumed'
                              ? 'bg-blue-500/15 text-blue-400 border border-blue-500/30'
                              : opp.status === 'rejected'
                              ? 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                              : opp.status === 'expired'
                              ? 'bg-slate-800 text-slate-400 border border-slate-700'
                              : 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                          }`}
                        >
                          {opp.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-400">
                        {opp.valid_until ? (
                          <span>Valid until {new Date(opp.valid_until).toLocaleDateString()}</span>
                        ) : (
                          <span>—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-400 max-w-xs truncate">
                        {opp.decision_notes || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {/* Request Opportunity Modal */}
      {showOpportunityModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 space-y-5 shadow-2xl relative">
            <button
              onClick={() => setShowOpportunityModal(false)}
              className="absolute top-5 right-5 text-slate-400 hover:text-white cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="space-y-1">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-amber-400" />
                <span>{t('sales.commissions.opportunityModalTitle')}</span>
              </h3>
              <p className="text-xs text-slate-400">
                {t('sales.commissions.requestOpportunityDesc')}
              </p>
            </div>

            <form onSubmit={handleCreateOpportunity} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  {t('sales.commissions.opportunityOrgLabel')} *
                </label>
                <select
                  value={opportunityForm.organizationId}
                  onChange={(e) => setOpportunityForm({ ...opportunityForm, organizationId: e.target.value })}
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-slate-100 focus:outline-none focus:border-amber-500"
                >
                  <option value="">{t('sales.commissions.selectOrgPlaceholder')}</option>
                  {attributionWindows.map((win) => (
                    <option key={win.organization_id} value={win.organization_id}>
                      {win.organization_name} {win.is_window_expired ? '(Window Expired)' : `(${win.days_remaining}d remaining)`}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  {t('sales.commissions.opportunityTitleLabel')} *
                </label>
                <input
                  type="text"
                  placeholder={t('sales.commissions.opportunityEventPlaceholder')}
                  value={opportunityForm.title}
                  onChange={(e) => setOpportunityForm({ ...opportunityForm, title: e.target.value })}
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-slate-100 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  {t('sales.commissions.opportunityDateLabel')}
                </label>
                <input
                  type="date"
                  value={opportunityForm.expectedEventDate}
                  onChange={(e) => setOpportunityForm({ ...opportunityForm, expectedEventDate: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-slate-100 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-semibold text-slate-300">
                    {t('sales.commissions.opportunityDescLabel')}
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowTranslatorModal(true)}
                    className="text-xs font-semibold text-amber-400 hover:text-amber-300 flex items-center gap-1 cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>{t('sales.commissions.translateNotes')}</span>
                  </button>
                </div>
                <textarea
                  rows={3}
                  placeholder={t('sales.commissions.opportunityNotesPlaceholder')}
                  value={opportunityForm.description}
                  onChange={(e) => setOpportunityForm({ ...opportunityForm, description: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-slate-100 focus:outline-none focus:border-amber-500 resize-none"
                />
              </div>

              <div className="pt-2 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowOpportunityModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 cursor-pointer"
                >
                  {t('sales.commissions.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={submittingOpportunity}
                  className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold cursor-pointer transition-colors shadow-md shadow-amber-500/10"
                >
                  {submittingOpportunity ? t('sales.commissions.submitting') : t('sales.commissions.submitOpportunity')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* AI Translator for Opportunity Notes */}
      <SalesPartnerTranslationModal
        isOpen={showTranslatorModal}
        onClose={() => setShowTranslatorModal(false)}
        initialText={opportunityForm.description}
        context="sales_opportunity_notes"
      />
    </div>
  );
};
