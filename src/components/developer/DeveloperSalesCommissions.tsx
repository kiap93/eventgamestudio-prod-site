import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useLocalization } from '../../context/LocalizationContext';
import {
  SalesCommissionWithDetails,
  SalesOpportunityWithDetails,
  SalesPayoutBatch,
  PlatformSalesCommissionSettings,
  SalesCommissionAuditLogRecord,
} from '../../types/sales';
import {
  Coins,
  CheckCircle2,
  Clock,
  AlertCircle,
  Search,
  Filter,
  Plus,
  RefreshCw,
  FileText,
  DollarSign,
  Building2,
  Calendar,
  Sparkles,
  Check,
  X,
  History,
  Edit2,
  Ban,
  TrendingUp,
  Settings,
  ShieldCheck,
  ChevronRight,
  ExternalLink,
} from 'lucide-react';

export const DeveloperSalesCommissions: React.FC = () => {
  const { currentUser } = useAuth();
  const { t } = useLocalization();
  const [activeTab, setActiveTab] = useState<'commissions' | 'opportunities' | 'payouts' | 'settings'>('commissions');

  // Commissions State
  const [commissions, setCommissions] = useState<SalesCommissionWithDetails[]>([]);
  const [commissionsTotal, setCommissionsTotal] = useState<number>(0);
  const [commissionsTotalAmount, setCommissionsTotalAmount] = useState<number>(0);
  const [commissionStatusFilter, setCommissionStatusFilter] = useState<string>('all');
  const [commissionOrderTypeFilter, setCommissionOrderTypeFilter] = useState<string>('all');
  const [commissionSearch, setCommissionSearch] = useState<string>('');
  const [loadingCommissions, setLoadingCommissions] = useState<boolean>(false);

  // Opportunities State
  const [opportunities, setOpportunities] = useState<SalesOpportunityWithDetails[]>([]);
  const [opportunityStatusFilter, setOpportunityStatusFilter] = useState<string>('all');
  const [loadingOpportunities, setLoadingOpportunities] = useState<boolean>(false);

  // Payout Batches State
  const [payoutBatches, setPayoutBatches] = useState<SalesPayoutBatch[]>([]);
  const [readyForPayoutData, setReadyForPayoutData] = useState<any>(null);
  const [loadingPayouts, setLoadingPayouts] = useState<boolean>(false);
  const [selectedCommissionIds, setSelectedCommissionIds] = useState<Set<string>>(new Set());

  // Settings State
  const [settings, setSettings] = useState<PlatformSalesCommissionSettings | null>(null);
  const [savingSettings, setSavingSettings] = useState<boolean>(false);
  const [settingsForm, setSettingsForm] = useState({
    first_order_commission_rate: 0.10,
    repeat_order_commission_rate: 0.05,
    repeat_window_months: 12,
    require_delivery_completion: true,
    minimum_payout_amount: 100,
  });

  // Action Modals
  const [auditModalCommission, setAuditModalCommission] = useState<SalesCommissionWithDetails | null>(null);
  const [auditLogs, setAuditLogs] = useState<SalesCommissionAuditLogRecord[]>([]);
  const [loadingAuditLogs, setLoadingAuditLogs] = useState<boolean>(false);

  const [voidModalCommission, setVoidModalCommission] = useState<SalesCommissionWithDetails | null>(null);
  const [voidReason, setVoidReason] = useState<string>('');
  const [actionLoading, setActionLoading] = useState<boolean>(false);

  const [adjustModalCommission, setAdjustModalCommission] = useState<SalesCommissionWithDetails | null>(null);
  const [adjustAmount, setAdjustAmount] = useState<string>('');
  const [adjustReason, setAdjustReason] = useState<string>('');

  const [approveOpportunityModal, setApproveOpportunityModal] = useState<SalesOpportunityWithDetails | null>(null);
  const [oppValidDays, setOppValidDays] = useState<number>(90);
  const [oppDecisionNotes, setOppDecisionNotes] = useState<string>('');

  const [rejectOpportunityModal, setRejectOpportunityModal] = useState<SalesOpportunityWithDetails | null>(null);
  const [oppRejectReason, setOppRejectReason] = useState<string>('');

  const [settleBatchModal, setSettleBatchModal] = useState<SalesPayoutBatch | null>(null);
  const [paymentReference, setPaymentReference] = useState<string>('');
  const [paymentNotes, setPaymentNotes] = useState<string>('');

  const getAuthHeaders = (): Record<string, string> => {
    const token =
      localStorage.getItem('app_token') ||
      sessionStorage.getItem('app_token') ||
      localStorage.getItem('auth_token') ||
      sessionStorage.getItem('auth_token');
    return {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  };

  // Fetch Commissions
  const fetchCommissions = async () => {
    try {
      setLoadingCommissions(true);
      const params = new URLSearchParams();
      if (commissionStatusFilter !== 'all') params.set('status', commissionStatusFilter);
      if (commissionOrderTypeFilter !== 'all') params.set('order_type', commissionOrderTypeFilter);
      if (commissionSearch.trim()) params.set('search', commissionSearch.trim());

      const res = await fetch(`/api/developer/sales-commissions?${params.toString()}`, {
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setCommissions(data.commissions || []);
        setCommissionsTotal(data.total || 0);
        setCommissionsTotalAmount(data.total_amount || 0);
      }
    } catch (err) {
      console.error('Failed to fetch commissions:', err);
    } finally {
      setLoadingCommissions(false);
    }
  };

  // Fetch Opportunities
  const fetchOpportunities = async () => {
    try {
      setLoadingOpportunities(true);
      const params = new URLSearchParams();
      if (opportunityStatusFilter !== 'all') params.set('status', opportunityStatusFilter);

      const res = await fetch(`/api/developer/sales-opportunities?${params.toString()}`, {
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setOpportunities(data.opportunities || []);
      }
    } catch (err) {
      console.error('Failed to fetch opportunities:', err);
    } finally {
      setLoadingOpportunities(false);
    }
  };

  // Fetch Payouts
  const fetchPayouts = async () => {
    try {
      setLoadingPayouts(true);
      const [batchesRes, readyRes] = await Promise.all([
        fetch('/api/developer/sales-payouts/batches', { headers: getAuthHeaders() }),
        fetch('/api/developer/sales-payouts/ready', { headers: getAuthHeaders() }),
      ]);
      if (batchesRes.ok) {
        const bData = await batchesRes.json();
        setPayoutBatches(bData.batches || []);
      }
      if (readyRes.ok) {
        const rData = await readyRes.json();
        setReadyForPayoutData(rData);
      }
    } catch (err) {
      console.error('Failed to fetch payouts:', err);
    } finally {
      setLoadingPayouts(false);
    }
  };

  // Fetch Settings
  const fetchSettings = async () => {
    try {
      const res = await fetch('/api/developer/sales-commissions/settings', {
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.settings) {
          setSettings(data.settings);
          setSettingsForm({
            first_order_commission_rate: data.settings.first_order_commission_rate,
            repeat_order_commission_rate: data.settings.repeat_order_commission_rate,
            repeat_window_months: data.settings.repeat_window_months,
            require_delivery_completion: data.settings.require_delivery_completion,
            minimum_payout_amount: data.settings.minimum_payout_amount,
          });
        }
      }
    } catch (err) {
      console.error('Failed to fetch settings:', err);
    }
  };

  useEffect(() => {
    if (activeTab === 'commissions') fetchCommissions();
    if (activeTab === 'opportunities') fetchOpportunities();
    if (activeTab === 'payouts') fetchPayouts();
    if (activeTab === 'settings') fetchSettings();
  }, [activeTab]);

  // Actions
  const handleApproveCommission = async (commission: SalesCommissionWithDetails) => {
    if (!confirm(`Approve commission of RM${commission.commission_amount.toFixed(2)} for ${commission.partner?.name || 'Partner'}?\n\nNote: Event delivery completion will be verified.`)) {
      return;
    }
    try {
      setActionLoading(true);
      const res = await fetch(`/api/developer/sales-commissions/${commission.id}/approve`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ notes: 'Approved via Developer Admin' }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to approve commission');
      }
      fetchCommissions();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleVoidCommission = async () => {
    if (!voidModalCommission || !voidReason.trim()) {
      alert('A void reason is required');
      return;
    }
    try {
      setActionLoading(true);
      const res = await fetch(`/api/developer/sales-commissions/${voidModalCommission.id}/void`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ reason: voidReason.trim() }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to void commission');
      }
      setVoidModalCommission(null);
      setVoidReason('');
      fetchCommissions();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleAdjustCommission = async () => {
    if (!adjustModalCommission) return;
    const num = parseFloat(adjustAmount);
    if (isNaN(num) || num < 0) {
      alert('Please enter a valid non-negative amount');
      return;
    }
    if (!adjustReason.trim()) {
      alert('An adjustment reason is required for auditable records');
      return;
    }
    try {
      setActionLoading(true);
      const res = await fetch(`/api/developer/sales-commissions/${adjustModalCommission.id}/adjust`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ newAmount: num, reason: adjustReason.trim() }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to adjust commission');
      }
      setAdjustModalCommission(null);
      setAdjustAmount('');
      setAdjustReason('');
      fetchCommissions();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleOpenAuditModal = async (commission: SalesCommissionWithDetails) => {
    setAuditModalCommission(commission);
    setLoadingAuditLogs(true);
    try {
      const res = await fetch(`/api/developer/sales-commissions/${commission.id}/audit-logs`, {
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setAuditLogs(data.logs || []);
      }
    } catch (err) {
      console.error('Failed to load audit logs:', err);
    } finally {
      setLoadingAuditLogs(false);
    }
  };

  const handleApproveOpportunity = async () => {
    if (!approveOpportunityModal) return;
    try {
      setActionLoading(true);
      const validUntil = new Date();
      validUntil.setDate(validUntil.getDate() + oppValidDays);

      const res = await fetch(`/api/developer/sales-opportunities/${approveOpportunityModal.id}/approve`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          validUntil: validUntil.toISOString(),
          decisionNotes: oppDecisionNotes.trim() || 'Approved by Admin',
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to approve opportunity');
      setApproveOpportunityModal(null);
      setOppDecisionNotes('');
      fetchOpportunities();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleRejectOpportunity = async () => {
    if (!rejectOpportunityModal || !oppRejectReason.trim()) {
      alert('Please enter a rejection reason');
      return;
    }
    try {
      setActionLoading(true);
      const res = await fetch(`/api/developer/sales-opportunities/${rejectOpportunityModal.id}/reject`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ reason: oppRejectReason.trim() }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to reject opportunity');
      setRejectOpportunityModal(null);
      setOppRejectReason('');
      fetchOpportunities();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleCreatePayoutBatch = async () => {
    const ids = Array.from(selectedCommissionIds);
    if (ids.length === 0) {
      alert('Please select at least one approved commission to create a batch');
      return;
    }
    try {
      setActionLoading(true);
      const res = await fetch('/api/developer/sales-payouts/batches', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          commissionIds: ids,
          notes: 'Payout batch created from ready commissions',
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to create payout batch');
      setSelectedCommissionIds(new Set());
      fetchPayouts();
      alert(`Created Payout Batch ${data.batch.batch_reference} with ${ids.length} commissions totaling RM${data.batch.total_amount.toFixed(2)}`);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleSettleBatch = async () => {
    if (!settleBatchModal || !paymentReference.trim()) {
      alert('A payment reference number is required');
      return;
    }
    try {
      setActionLoading(true);
      const res = await fetch(`/api/developer/sales-payouts/batches/${settleBatchModal.id}/pay`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          paymentReference: paymentReference.trim(),
          notes: paymentNotes.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to settle payout batch');
      setSettleBatchModal(null);
      setPaymentReference('');
      setPaymentNotes('');
      fetchPayouts();
      alert(`Batch ${settleBatchModal.batch_reference} settled! All associated commissions marked as PAID.`);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSavingSettings(true);
      const res = await fetch('/api/developer/sales-commissions/settings', {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify(settingsForm),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to update settings');
      setSettings(data.settings);
      alert('Platform commission settings updated successfully');
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSavingSettings(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <Coins className="w-3.5 h-3.5" />
            <span>{t('dev.commissions.badge', undefined, 'Phase 5 — Financial Governance')}</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
            {t('dev.commissions.title', undefined, 'Sales Commissions & Payouts')}
          </h1>
          <p className="text-xs sm:text-sm text-slate-400">
            {t('dev.commissions.subtitle', undefined, 'Manage authoritative commission calculations, post-12-month opportunities, bank payout batches, and immutable audit trails.')}
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-900 border border-slate-800 text-xs font-semibold">
          <button
            onClick={() => setActiveTab('commissions')}
            className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
              activeTab === 'commissions'
                ? 'bg-emerald-500 text-slate-950 font-bold'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            {t('dev.commissions.tabCommissions', undefined, 'Commissions')}
          </button>
          <button
            onClick={() => setActiveTab('opportunities')}
            className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
              activeTab === 'opportunities'
                ? 'bg-emerald-500 text-slate-950 font-bold'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            {t('dev.commissions.tabOpportunities', undefined, 'Opportunities')}
          </button>
          <button
            onClick={() => setActiveTab('payouts')}
            className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
              activeTab === 'payouts'
                ? 'bg-emerald-500 text-slate-950 font-bold'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            {t('dev.commissions.tabPayouts', undefined, 'Payout Batches')}
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
              activeTab === 'settings'
                ? 'bg-emerald-500 text-slate-950 font-bold'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            {t('common.settings', undefined, 'Settings')}
          </button>
        </div>
      </div>

      {/* TAB 1: COMMISSIONS LEDGER */}
      {activeTab === 'commissions' && (
        <div className="space-y-5">
          {/* Filters Bar */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col md:flex-row gap-3 items-center justify-between">
            <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
              {/* Status Filter */}
              <select
                value={commissionStatusFilter}
                onChange={(e) => setCommissionStatusFilter(e.target.value)}
                className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
              >
                <option value="all">{t('dev.commissions.allStatuses', undefined, 'All Statuses')}</option>
                <option value="pending_review">{t('dev.commissions.statusPendingReview', undefined, 'Pending Review')}</option>
                <option value="approved">{t('dev.commissions.statusApproved', undefined, 'Approved')}</option>
                <option value="paid">{t('dev.commissions.statusPaid', undefined, 'Paid')}</option>
                <option value="voided">{t('dev.commissions.statusVoided', undefined, 'Voided')}</option>
                <option value="clawback">{t('dev.commissions.statusClawback', undefined, 'Clawback')}</option>
              </select>

              {/* Order Type Filter */}
              <select
                value={commissionOrderTypeFilter}
                onChange={(e) => setCommissionOrderTypeFilter(e.target.value)}
                className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
              >
                <option value="all">{t('dev.commissions.allOrderTypes', undefined, 'All Order Types')}</option>
                <option value="first_order">{t('dev.commissions.typeFirstOrder', undefined, 'First Order (10%)')}</option>
                <option value="repeat_order">{t('dev.commissions.typeRepeatOrder', undefined, 'Repeat Order (5%)')}</option>
                <option value="approved_opportunity">{t('dev.commissions.typeApprovedOpportunity', undefined, 'Pre-Approved Opportunity (5%)')}</option>
              </select>

              {/* Search */}
              <div className="relative flex-1 md:w-64">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="text"
                  placeholder={t('dev.commissions.searchPlaceholder', undefined, 'Search event, org, partner...')}
                  value={commissionSearch}
                  onChange={(e) => setCommissionSearch(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && fetchCommissions()}
                  className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <button
                onClick={fetchCommissions}
                disabled={loadingCommissions}
                className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 cursor-pointer flex items-center gap-1.5"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingCommissions ? 'animate-spin' : ''}`} />
                <span>{t('common.filter', undefined, 'Filter')}</span>
              </button>
            </div>

            <div className="text-xs text-slate-400 font-medium">
              {t('common.total', undefined, 'Total')}: <span className="font-bold text-white">{commissionsTotal}</span> {t('dev.commissions.records', undefined, 'records')} | {t('dev.commissions.sum', undefined, 'Sum')}:{' '}
              <span className="font-bold text-amber-400">RM{commissionsTotalAmount.toFixed(2)}</span>
            </div>
          </div>

          {/* Table */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
            {commissions.length === 0 ? (
              <div className="p-12 text-center text-slate-400 space-y-2">
                <FileText className="w-10 h-10 text-slate-600 mx-auto" />
                <div className="text-sm font-semibold text-slate-300">{t('dev.commissions.noCommissionsFound', undefined, 'No commissions matching filters')}</div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-950/70 text-slate-400 uppercase tracking-wider text-[11px] border-b border-slate-800 font-semibold">
                    <tr>
                      <th className="px-4 py-3.5">{t('dev.commissions.colPartner', undefined, 'Partner')}</th>
                      <th className="px-4 py-3.5">{t('dev.commissions.colClientEvent', undefined, 'Client & Event')}</th>
                      <th className="px-4 py-3.5">{t('dev.commissions.colOrderType', undefined, 'Order Type')}</th>
                      <th className="px-4 py-3.5 text-right">{t('dev.commissions.colCashRevenue', undefined, 'Cash Revenue')}</th>
                      <th className="px-4 py-3.5 text-right">{t('dev.commissions.colCommission', undefined, 'Commission')}</th>
                      <th className="px-4 py-3.5 text-center">{t('common.status', undefined, 'Status')}</th>
                      <th className="px-4 py-3.5 text-center">{t('dev.commissions.colDelivery', undefined, 'Delivery')}</th>
                      <th className="px-4 py-3.5 text-right">{t('common.actions', undefined, 'Actions')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80">
                    {commissions.map((comm) => (
                      <tr key={comm.id} className="hover:bg-slate-800/40 transition-colors">
                        <td className="px-4 py-3.5">
                          <div className="font-bold text-white">
                            {comm.partner?.name || 'Partner'}
                          </div>
                          <div className="text-[11px] text-slate-400 font-mono">
                            {comm.partner?.email || comm.sales_partner_id.slice(0, 8)}
                          </div>
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="font-semibold text-slate-200">
                            {comm.event?.name || `Event #${comm.event_id.slice(0, 8)}`}
                          </div>
                          <div className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
                            <Building2 className="w-3 h-3 text-slate-500" />
                            <span>{comm.organization?.name || 'Organization'}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3.5">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                              comm.order_type === 'first_order'
                                ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                                : comm.order_type === 'repeat_order'
                                ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                                : 'bg-purple-500/15 text-purple-300 border border-purple-500/30'
                            }`}
                          >
                            {comm.order_type === 'first_order'
                              ? t('dev.commissions.badgeFirstOrder', undefined, '1st Order (10%)').replace(
                                  '10%',
                                  `${Math.round((comm.commission_rate ?? 0.10) * 10000) / 100}%`
                                )
                              : comm.order_type === 'repeat_order'
                              ? t('dev.commissions.badgeRepeatOrder', undefined, 'Repeat (5%)').replace(
                                  '5%',
                                  `${Math.round((comm.commission_rate ?? 0.05) * 10000) / 100}%`
                                )
                              : t('dev.commissions.badgeOpportunity', undefined, 'Opportunity (5%)').replace(
                                  '5%',
                                  `${Math.round((comm.commission_rate ?? 0.05) * 10000) / 100}%`
                                )}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-right font-mono text-slate-200">
                          RM{comm.cash_collected_amount.toFixed(2)}
                          {comm.promo_discount_amount > 0 && (
                            <div className="text-[10px] text-slate-500">
                              (RM{comm.promo_discount_amount.toFixed(2)} credit)
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3.5 text-right font-mono font-bold text-amber-400">
                          RM{comm.commission_amount.toFixed(2)}
                          {comm.original_commission_amount && comm.original_commission_amount !== comm.commission_amount && (
                            <div className="text-[10px] text-slate-500 font-normal">
                              Orig: RM{comm.original_commission_amount.toFixed(2)}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3.5 text-center">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                              comm.status === 'paid'
                                ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                                : comm.status === 'approved'
                                ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                                : comm.status === 'pending_review'
                                ? 'bg-blue-500/15 text-blue-400 border border-blue-500/30'
                                : comm.status === 'clawback'
                                ? 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                                : 'bg-slate-800 text-slate-400 border border-slate-700'
                            }`}
                          >
                            {comm.status.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-center">
                          {comm.event?.event_status === 'COMPLETED' || comm.event?.status === 'completed' ? (
                            <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                              {t('dev.commissions.delivered', undefined, 'Delivered')}
                            </span>
                          ) : (
                            <span className="text-[10px] font-medium text-slate-400 bg-slate-800 px-2 py-0.5 rounded">
                              {comm.event?.event_status || comm.event?.status || 'Active'}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3.5 text-right space-x-1.5 whitespace-nowrap">
                          {comm.status === 'pending_review' && (
                            <button
                              onClick={() => handleApproveCommission(comm)}
                              className="px-2.5 py-1 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 text-xs font-semibold cursor-pointer border border-emerald-500/30"
                              title={t('dev.commissions.approveTooltip', undefined, 'Approve Commission (Requires Completed Event Delivery)')}
                            >
                              {t('common.approve', undefined, 'Approve')}
                            </button>
                          )}
                          {comm.status !== 'paid' && comm.status !== 'voided' && (
                            <button
                              onClick={() => {
                                setAdjustModalCommission(comm);
                                setAdjustAmount(comm.commission_amount.toString());
                              }}
                              className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs cursor-pointer border border-slate-700"
                              title={t('dev.commissions.adjustTooltip', undefined, 'Adjust Commission (Auditable append-only)')}
                            >
                              {t('dev.commissions.adjust', undefined, 'Adjust')}
                            </button>
                          )}
                          {comm.status !== 'paid' && comm.status !== 'voided' && (
                            <button
                              onClick={() => setVoidModalCommission(comm)}
                              className="px-2 py-1 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 text-rose-400 text-xs cursor-pointer border border-rose-500/30"
                              title={t('dev.commissions.voidTooltip', undefined, 'Void Commission')}
                            >
                              {t('dev.commissions.void', undefined, 'Void')}
                            </button>
                          )}
                          <button
                            onClick={() => handleOpenAuditModal(comm)}
                            className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white text-xs cursor-pointer"
                            title={t('dev.commissions.viewAuditHistory', undefined, 'View Audit History')}
                          >
                            <History className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: OPPORTUNITIES REVIEW */}
      {activeTab === 'opportunities' && (
        <div className="space-y-5">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <select
                value={opportunityStatusFilter}
                onChange={(e) => setOpportunityStatusFilter(e.target.value)}
                className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
              >
                <option value="all">{t('dev.commissions.allStatuses', undefined, 'All Statuses')}</option>
                <option value="pending">{t('dev.commissions.statusPendingApproval', undefined, 'Pending Approval')}</option>
                <option value="approved">{t('dev.commissions.statusApproved', undefined, 'Approved')}</option>
                <option value="consumed">{t('dev.commissions.statusConsumed', undefined, 'Consumed')}</option>
                <option value="rejected">{t('dev.commissions.statusRejected', undefined, 'Rejected')}</option>
                <option value="expired">{t('dev.commissions.statusExpired', undefined, 'Expired')}</option>
              </select>

              <button
                onClick={fetchOpportunities}
                disabled={loadingOpportunities}
                className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 cursor-pointer flex items-center gap-1.5"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingOpportunities ? 'animate-spin' : ''}`} />
                <span>{t('common.refresh', undefined, 'Refresh')}</span>
              </button>
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
            {opportunities.length === 0 ? (
              <div className="p-12 text-center text-slate-400 space-y-2">
                <Sparkles className="w-10 h-10 text-slate-600 mx-auto" />
                <div className="text-sm font-semibold text-slate-300">{t('dev.commissions.noOpportunities', undefined, 'No opportunity requests')}</div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-950/70 text-slate-400 uppercase tracking-wider text-[11px] border-b border-slate-800 font-semibold">
                    <tr>
                      <th className="px-4 py-3.5">{t('dev.commissions.colPartner', undefined, 'Partner')}</th>
                      <th className="px-4 py-3.5">{t('dev.commissions.colClientOrg', undefined, 'Client Organization')}</th>
                      <th className="px-4 py-3.5">{t('dev.commissions.colOppTitle', undefined, 'Opportunity Title')}</th>
                      <th className="px-4 py-3.5">{t('dev.commissions.colExpectedDate', undefined, 'Expected Date')}</th>
                      <th className="px-4 py-3.5">{t('common.status', undefined, 'Status')}</th>
                      <th className="px-4 py-3.5">{t('dev.commissions.colValidity', undefined, 'Validity')}</th>
                      <th className="px-4 py-3.5 text-right">{t('common.actions', undefined, 'Actions')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80">
                    {opportunities.map((opp) => (
                      <tr key={opp.id} className="hover:bg-slate-800/40 transition-colors">
                        <td className="px-4 py-3.5">
                          <div className="font-bold text-white">{opp.partner?.name || 'Partner'}</div>
                          <div className="text-[11px] text-slate-400">{opp.partner?.email || ''}</div>
                        </td>
                        <td className="px-4 py-3.5 font-semibold text-slate-200">
                          {opp.organization?.name || 'Organization'}
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="font-semibold text-white">{opp.title}</div>
                          {opp.description && (
                            <div className="text-[11px] text-slate-400 line-clamp-1">{opp.description}</div>
                          )}
                        </td>
                        <td className="px-4 py-3.5 text-slate-400">
                          {opp.expected_event_date || '—'}
                        </td>
                        <td className="px-4 py-3.5">
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
                        <td className="px-4 py-3.5 text-slate-400">
                          {opp.valid_until ? new Date(opp.valid_until).toLocaleDateString() : '—'}
                        </td>
                        <td className="px-4 py-3.5 text-right space-x-2">
                          {opp.status === 'pending' && (
                            <>
                              <button
                                onClick={() => setApproveOpportunityModal(opp)}
                                className="px-2.5 py-1 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 text-xs font-semibold cursor-pointer border border-emerald-500/30"
                              >
                                {t('common.approve', undefined, 'Approve')}
                              </button>
                              <button
                                onClick={() => setRejectOpportunityModal(opp)}
                                className="px-2.5 py-1 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 text-rose-400 text-xs font-semibold cursor-pointer border border-rose-500/30"
                              >
                                {t('common.reject', undefined, 'Reject')}
                              </button>
                            </>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: PAYOUT BATCHES */}
      {activeTab === 'payouts' && (
        <div className="space-y-6">
          {/* Section A: Approved Commissions Ready for Batching */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>{t('dev.commissions.readyForPayoutTitle', undefined, 'Approved Commissions Ready for Payout')}</span>
                </h2>
                <p className="text-xs text-slate-400">
                  {t('dev.commissions.readyForPayoutSubtitle', undefined, 'Commissions approved after verified event delivery. Group and create a batch to prepare bank transfer.')}
                </p>
              </div>

              <div className="flex items-center gap-3">
                <span className="text-xs text-slate-300 font-mono">
                  {t('common.selected', undefined, 'Selected')}: <span className="text-amber-400 font-bold">{selectedCommissionIds.size}</span>
                </span>
                <button
                  onClick={handleCreatePayoutBatch}
                  disabled={selectedCommissionIds.size === 0 || actionLoading}
                  className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 text-xs font-bold cursor-pointer transition-colors"
                >
                  {t('dev.commissions.createPayoutBatch', undefined, 'Create Payout Batch')}
                </button>
              </div>
            </div>

            {readyForPayoutData?.partners?.length === 0 ? (
              <div className="p-8 text-center bg-slate-950/50 rounded-xl border border-slate-800/80 text-xs text-slate-400">
                {t('dev.commissions.noApprovedCommissions', undefined, 'No approved commissions awaiting payout batching.')}
              </div>
            ) : (
              <div className="space-y-3">
                {readyForPayoutData?.partners?.map((p: any) => (
                  <div
                    key={p.partner.id}
                    className="p-4 bg-slate-950/70 border border-slate-800 rounded-xl space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-white">{p.partner.name}</span>
                        <span className="text-xs text-slate-400">({p.partner.email})</span>
                      </div>
                      <div className="text-right">
                        <span className="text-sm font-black text-amber-400">RM{p.total_amount.toFixed(2)}</span>
                        <span className="text-xs text-slate-500 ml-2">({p.commission_count} items)</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                      {p.commissions.map((comm: any) => {
                        const isSelected = selectedCommissionIds.has(comm.id);
                        return (
                          <div
                            key={comm.id}
                            onClick={() => {
                              const next = new Set(selectedCommissionIds);
                              if (isSelected) next.delete(comm.id);
                              else next.add(comm.id);
                              setSelectedCommissionIds(next);
                            }}
                            className={`p-2.5 rounded-lg border text-xs cursor-pointer flex items-center justify-between transition-colors ${
                              isSelected
                                ? 'bg-amber-500/10 border-amber-500/50 text-slate-200'
                                : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
                            }`}
                          >
                            <div>
                              <div className="font-semibold text-white">Event #{comm.event_id.slice(0, 8)}</div>
                              <div className="text-[10px] text-slate-500">{comm.order_type}</div>
                            </div>
                            <div className="text-right font-mono font-bold text-amber-400">
                              RM{comm.commission_amount.toFixed(2)}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Section B: Existing Payout Batches */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <FileText className="w-4 h-4 text-amber-400" />
                <span>{t('dev.commissions.payoutBatchRecords', undefined, 'Payout Batch Records')}</span>
              </h3>
            </div>

            {payoutBatches.length === 0 ? (
              <div className="p-10 text-center text-slate-400 text-xs">
                {t('dev.commissions.noPayoutBatches', undefined, 'No payout batches created yet.')}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-950/70 text-slate-400 uppercase tracking-wider text-[11px] border-b border-slate-800 font-semibold">
                    <tr>
                      <th className="px-4 py-3.5">{t('dev.commissions.colBatchRef', undefined, 'Batch Reference')}</th>
                      <th className="px-4 py-3.5 text-right">{t('dev.commissions.colTotalAmount', undefined, 'Total Amount')}</th>
                      <th className="px-4 py-3.5 text-center">{t('dev.commissions.colItems', undefined, 'Items')}</th>
                      <th className="px-4 py-3.5 text-center">{t('dev.commissions.colPartners', undefined, 'Partners')}</th>
                      <th className="px-4 py-3.5 text-center">{t('common.status', undefined, 'Status')}</th>
                      <th className="px-4 py-3.5">{t('dev.commissions.colPaymentRef', undefined, 'Payment Ref')}</th>
                      <th className="px-4 py-3.5 text-right">{t('common.actions', undefined, 'Actions')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80">
                    {payoutBatches.map((b) => (
                      <tr key={b.id} className="hover:bg-slate-800/40 transition-colors">
                        <td className="px-4 py-3.5 font-mono font-bold text-white">
                          {b.batch_reference}
                        </td>
                        <td className="px-4 py-3.5 text-right font-mono font-bold text-emerald-400">
                          RM{b.total_amount.toFixed(2)}
                        </td>
                        <td className="px-4 py-3.5 text-center">{b.total_commissions}</td>
                        <td className="px-4 py-3.5 text-center">{b.total_partners}</td>
                        <td className="px-4 py-3.5 text-center">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                              b.status === 'paid'
                                ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                                : 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                            }`}
                          >
                            {b.status}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 font-mono text-slate-400">
                          {b.payment_reference || '—'}
                        </td>
                        <td className="px-4 py-3.5 text-right">
                          {b.status !== 'paid' && (
                            <button
                              onClick={() => setSettleBatchModal(b)}
                              className="px-3 py-1 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs cursor-pointer"
                            >
                              {t('dev.commissions.markPaid', undefined, 'Mark Paid')}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 4: PLATFORM COMMISSION SETTINGS */}
      {activeTab === 'settings' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-2xl space-y-6">
          <div className="space-y-1">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Settings className="w-5 h-5 text-amber-400" />
              <span>{t('dev.commissions.settingsTitle', undefined, 'Platform Commission Settings')}</span>
            </h2>
            <p className="text-xs text-slate-400">
              {t('dev.commissions.settingsSubtitle', undefined, 'Configure baseline rates, repeat commission window duration, and safety delivery requirements.')}
            </p>
          </div>

          <form onSubmit={handleSaveSettings} className="space-y-4 text-xs">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block font-semibold text-slate-300">
                  {t('dev.commissions.firstOrderRateLabel', undefined, 'First-Order Commission Rate (Default: 0.10 for 10%)')}
                </label>
                <span className="font-mono font-bold text-amber-400">
                  {Number.isFinite(settingsForm.first_order_commission_rate)
                    ? `${Math.round(settingsForm.first_order_commission_rate * 10000) / 100}%`
                    : '10%'}
                </span>
              </div>
              <input
                type="number"
                step="0.01"
                min="0"
                max="0.50"
                value={settingsForm.first_order_commission_rate}
                onChange={(e) =>
                  setSettingsForm({ ...settingsForm, first_order_commission_rate: parseFloat(e.target.value) })
                }
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-slate-100 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block font-semibold text-slate-300">
                  {t('dev.commissions.repeatOrderRateLabel', undefined, 'Repeat-Order Commission Rate (Default: 0.05 for 5%)')}
                </label>
                <span className="font-mono font-bold text-emerald-400">
                  {Number.isFinite(settingsForm.repeat_order_commission_rate)
                    ? `${Math.round(settingsForm.repeat_order_commission_rate * 10000) / 100}%`
                    : '5%'}
                </span>
              </div>
              <input
                type="number"
                step="0.01"
                min="0"
                max="0.50"
                value={settingsForm.repeat_order_commission_rate}
                onChange={(e) =>
                  setSettingsForm({ ...settingsForm, repeat_order_commission_rate: parseFloat(e.target.value) })
                }
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-slate-100 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-300 mb-1">
                {t('dev.commissions.repeatWindowLabel', undefined, 'Repeat Commission Window Duration (Months)')}
              </label>
              <input
                type="number"
                min="1"
                max="60"
                value={settingsForm.repeat_window_months}
                onChange={(e) =>
                  setSettingsForm({ ...settingsForm, repeat_window_months: parseInt(e.target.value, 10) })
                }
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-slate-100 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div className="pt-2">
              <label className="flex items-center gap-2 cursor-pointer text-slate-300">
                <input
                  type="checkbox"
                  checked={settingsForm.require_delivery_completion}
                  onChange={(e) =>
                    setSettingsForm({ ...settingsForm, require_delivery_completion: e.target.checked })
                  }
                  className="rounded bg-slate-950 border-slate-800 text-emerald-500 focus:ring-0"
                />
                <span className="font-semibold">
                  {t('dev.commissions.requireDeliveryLabel', undefined, 'Require Event Delivery Completion before commission becomes payable (Safer Policy)')}
                </span>
              </label>
              <p className="text-[11px] text-slate-500 mt-1 pl-6">
                {t('dev.commissions.requireDeliveryDesc', undefined, "When enabled, commissions remain pending_review until the event's lifecycle status transitions to COMPLETED.")}
              </p>
            </div>

            <div className="pt-4 flex justify-end">
              <button
                type="submit"
                disabled={savingSettings}
                className="px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs cursor-pointer transition-colors"
              >
                {savingSettings ? t('common.saving', undefined, 'Saving...') : t('common.saveSettings', undefined, 'Save Settings')}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL 1: AUDIT TRAIL MODAL */}
      {auditModalCommission && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-xl w-full p-6 space-y-4 shadow-2xl relative">
            <button
              onClick={() => setAuditModalCommission(null)}
              className="absolute top-5 right-5 text-slate-400 hover:text-white cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="space-y-1">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <History className="w-4 h-4 text-amber-400" />
                <span>{t('dev.commissions.auditModalTitle', undefined, 'Immutable Commission Audit Trail')}</span>
              </h3>
              <p className="text-xs text-slate-400">
                Commission ID: <span className="font-mono text-slate-300">{auditModalCommission.id}</span>
              </p>
            </div>

            {loadingAuditLogs ? (
              <div className="p-8 text-center text-xs text-slate-400">{t('dev.commissions.loadingAuditHistory', undefined, 'Loading audit history...')}</div>
            ) : auditLogs.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500">{t('dev.commissions.noAuditLogsFound', undefined, 'No audit log records found')}</div>
            ) : (
              <div className="space-y-3 max-h-96 overflow-y-auto pr-2">
                {auditLogs.map((log) => (
                  <div key={log.id} className="p-3 bg-slate-950 border border-slate-800 rounded-xl text-xs space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-white uppercase text-[10px] px-2 py-0.5 rounded bg-slate-800">
                        {log.action}
                      </span>
                      <span className="text-[11px] text-slate-500 font-mono">
                        {new Date(log.created_at).toLocaleString()}
                      </span>
                    </div>
                    {log.reason && (
                      <div className="text-slate-300 text-xs mt-1">
                        <span className="text-slate-500">{t('common.reason', undefined, 'Reason')}:</span> {log.reason}
                      </div>
                    )}
                    {log.previous_amount !== null && log.new_amount !== null && log.previous_amount !== log.new_amount && (
                      <div className="text-[11px] text-amber-400">
                        Amount adjusted: RM{log.previous_amount?.toFixed(2)} → RM{log.new_amount?.toFixed(2)}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL 2: VOID COMMISSION */}
      {voidModalCommission && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl relative">
            <button
              onClick={() => setVoidModalCommission(null)}
              className="absolute top-5 right-5 text-slate-400 hover:text-white cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Ban className="w-4 h-4 text-rose-400" />
              <span>{t('dev.commissions.voidModalTitle', undefined, 'Void Commission')}</span>
            </h3>

            <p className="text-xs text-slate-400">
              {t('dev.commissions.voidModalDesc', { amount: voidModalCommission.commission_amount.toFixed(2) }, `Voiding commission of RM${voidModalCommission.commission_amount.toFixed(2)}. An auditable reason is required.`)}
            </p>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">{t('common.reason', undefined, 'Reason')} *</label>
              <textarea
                rows={3}
                placeholder={t('dev.commissions.voidReasonPlaceholder', undefined, 'Reason for voiding...')}
                value={voidReason}
                onChange={(e) => setVoidReason(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-100 focus:outline-none focus:border-rose-500 resize-none"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setVoidModalCommission(null)}
                className="px-3.5 py-1.5 rounded-lg bg-slate-800 text-xs text-slate-300 cursor-pointer"
              >
                {t('common.cancel', undefined, 'Cancel')}
              </button>
              <button
                onClick={handleVoidCommission}
                disabled={actionLoading || !voidReason.trim()}
                className="px-4 py-1.5 rounded-lg bg-rose-500 hover:bg-rose-600 text-white font-bold text-xs cursor-pointer disabled:opacity-50"
              >
                {actionLoading ? t('dev.commissions.voiding', undefined, 'Voiding...') : t('dev.commissions.confirmVoid', undefined, 'Confirm Void')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: ADJUST COMMISSION */}
      {adjustModalCommission && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl relative">
            <button
              onClick={() => setAdjustModalCommission(null)}
              className="absolute top-5 right-5 text-slate-400 hover:text-white cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Edit2 className="w-4 h-4 text-amber-400" />
              <span>{t('dev.commissions.adjustModalTitle', undefined, 'Adjust Commission Amount')}</span>
            </h3>

            <p className="text-xs text-slate-400">
              The original calculation of RM{adjustModalCommission.original_commission_amount?.toFixed(2) || adjustModalCommission.commission_amount.toFixed(2)} will be preserved. An append-only adjustment will be recorded.
            </p>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">{t('dev.commissions.newAmountLabel', undefined, 'New Amount (RM)')} *</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={adjustAmount}
                  onChange={(e) => setAdjustAmount(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-100 focus:outline-none focus:border-amber-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">{t('dev.commissions.adjustReasonLabel', undefined, 'Reason for Adjustment')} *</label>
                <textarea
                  rows={3}
                  placeholder={t('dev.commissions.adjustReasonPlaceholder', undefined, 'Justification for adjustment...')}
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-100 focus:outline-none focus:border-amber-500 resize-none"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setAdjustModalCommission(null)}
                className="px-3.5 py-1.5 rounded-lg bg-slate-800 text-xs text-slate-300 cursor-pointer"
              >
                {t('common.cancel', undefined, 'Cancel')}
              </button>
              <button
                onClick={handleAdjustCommission}
                disabled={actionLoading || !adjustReason.trim()}
                className="px-4 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs cursor-pointer disabled:opacity-50"
              >
                {actionLoading ? t('common.saving', undefined, 'Saving...') : t('dev.commissions.saveAdjustment', undefined, 'Save Adjustment')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: APPROVE OPPORTUNITY */}
      {approveOpportunityModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl relative">
            <button
              onClick={() => setApproveOpportunityModal(null)}
              className="absolute top-5 right-5 text-slate-400 hover:text-white cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-emerald-400" />
              <span>{t('dev.commissions.approveOppTitle', undefined, 'Approve Sales Opportunity')}</span>
            </h3>

            <p className="text-xs text-slate-400">
              Granting 5% repeat commission eligibility for {approveOpportunityModal.organization?.name} on future orders within the validity window.
            </p>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-300 mb-1">{t('dev.commissions.validityWindowDays', undefined, 'Validity Window (Days)')}</label>
                <input
                  type="number"
                  min="1"
                  max="365"
                  value={oppValidDays}
                  onChange={(e) => setOppValidDays(parseInt(e.target.value, 10))}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-300 mb-1">{t('dev.commissions.decisionNotes', undefined, 'Decision Notes')}</label>
                <textarea
                  rows={2}
                  placeholder="Notes..."
                  value={oppDecisionNotes}
                  onChange={(e) => setOppDecisionNotes(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-100 focus:outline-none focus:border-emerald-500 resize-none"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setApproveOpportunityModal(null)}
                className="px-3.5 py-1.5 rounded-lg bg-slate-800 text-xs text-slate-300 cursor-pointer"
              >
                {t('common.cancel', undefined, 'Cancel')}
              </button>
              <button
                onClick={handleApproveOpportunity}
                disabled={actionLoading}
                className="px-4 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs cursor-pointer"
              >
                {actionLoading ? t('dev.commissions.approving', undefined, 'Approving...') : t('dev.commissions.approveOpportunity', undefined, 'Approve Opportunity')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 5: REJECT OPPORTUNITY */}
      {rejectOpportunityModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl relative">
            <button
              onClick={() => setRejectOpportunityModal(null)}
              className="absolute top-5 right-5 text-slate-400 hover:text-white cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Ban className="w-4 h-4 text-rose-400" />
              <span>{t('dev.commissions.rejectOppTitle', undefined, 'Reject Sales Opportunity')}</span>
            </h3>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">{t('dev.commissions.reasonForRejection', undefined, 'Reason for Rejection')} *</label>
              <textarea
                rows={3}
                placeholder="Reason..."
                value={oppRejectReason}
                onChange={(e) => setOppRejectReason(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-100 focus:outline-none focus:border-rose-500 resize-none"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setRejectOpportunityModal(null)}
                className="px-3.5 py-1.5 rounded-lg bg-slate-800 text-xs text-slate-300 cursor-pointer"
              >
                {t('common.cancel', undefined, 'Cancel')}
              </button>
              <button
                onClick={handleRejectOpportunity}
                disabled={actionLoading || !oppRejectReason.trim()}
                className="px-4 py-1.5 rounded-lg bg-rose-500 hover:bg-rose-600 text-white font-bold text-xs cursor-pointer disabled:opacity-50"
              >
                {actionLoading ? t('dev.commissions.rejecting', undefined, 'Rejecting...') : t('dev.commissions.rejectOpportunity', undefined, 'Reject Opportunity')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 6: SETTLE PAYOUT BATCH */}
      {settleBatchModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl relative">
            <button
              onClick={() => setSettleBatchModal(null)}
              className="absolute top-5 right-5 text-slate-400 hover:text-white cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>{t('dev.commissions.settleBatchTitle', undefined, 'Settle Payout Batch')}</span>
            </h3>

            <p className="text-xs text-slate-400">
              Settling batch <span className="font-mono text-white">{settleBatchModal.batch_reference}</span> (RM{settleBatchModal.total_amount.toFixed(2)}). All associated commissions will be transitioned to PAID.
            </p>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-300 mb-1">{t('dev.commissions.bankPaymentRefLabel', undefined, 'Bank Payment Reference / Txn ID')} *</label>
                <input
                  type="text"
                  placeholder="e.g. MAYBANK-TXN-98421482"
                  value={paymentReference}
                  onChange={(e) => setPaymentReference(e.target.value)}
                  required
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-100 focus:outline-none focus:border-emerald-500 font-mono"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-300 mb-1">{t('common.notes', undefined, 'Notes')}</label>
                <textarea
                  rows={2}
                  placeholder="Disbursement notes..."
                  value={paymentNotes}
                  onChange={(e) => setPaymentNotes(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-100 focus:outline-none focus:border-emerald-500 resize-none"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setSettleBatchModal(null)}
                className="px-3.5 py-1.5 rounded-lg bg-slate-800 text-xs text-slate-300 cursor-pointer"
              >
                {t('common.cancel', undefined, 'Cancel')}
              </button>
              <button
                onClick={handleSettleBatch}
                disabled={actionLoading || !paymentReference.trim()}
                className="px-4 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs cursor-pointer disabled:opacity-50"
              >
                {actionLoading ? t('dev.commissions.settling', undefined, 'Settling...') : t('dev.commissions.confirmSettle', undefined, 'Confirm Settle')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
