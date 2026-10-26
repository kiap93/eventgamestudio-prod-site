import React, { useState, useEffect, useMemo } from 'react';
import { apiFetch } from '../../lib/api';
import { CustomerAttribution, CustomerAttributionAuditLog, AttributionStatus } from '../../types/sales';
import { useLocalization } from '../../context/LocalizationContext';
import {
  Users,
  Search,
  Filter,
  RefreshCw,
  Eye,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  ArrowRightLeft,
  Building2,
  Share2,
  ShieldCheck,
  ShieldAlert,
  Info,
  Check,
  X,
  History,
  User,
  Mail,
  AlertOctagon,
  ExternalLink,
} from 'lucide-react';

interface SalesPartnerOption {
  id: string;
  user_id: string;
  name: string;
  email: string;
  status: string;
}

export const DeveloperSalesAttributions: React.FC = () => {
  const { t } = useLocalization();
  const [attributions, setAttributions] = useState<CustomerAttribution[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [flagFilter, setFlagFilter] = useState<'all' | 'competing' | 'self_referral' | 'existing_customer'>('all');

  // Active Partners for Reassignment
  const [activePartners, setActivePartners] = useState<SalesPartnerOption[]>([]);

  // Modals state
  const [inspectItem, setInspectItem] = useState<CustomerAttribution | null>(null);
  const [inspectAuditLogs, setInspectAuditLogs] = useState<CustomerAttributionAuditLog[]>([]);
  const [loadingAuditLogs, setLoadingAuditLogs] = useState<boolean>(false);

  const [approveItem, setApproveItem] = useState<CustomerAttribution | null>(null);
  const [approveReason, setApproveReason] = useState<string>('');
  const [approving, setApproving] = useState<boolean>(false);

  const [rejectItem, setRejectItem] = useState<CustomerAttribution | null>(null);
  const [rejectReason, setRejectReason] = useState<string>('');
  const [rejecting, setRejecting] = useState<boolean>(false);

  const [reassignItem, setReassignItem] = useState<CustomerAttribution | null>(null);
  const [reassignTargetUserId, setReassignTargetUserId] = useState<string>('');
  const [reassignReason, setReassignReason] = useState<string>('');
  const [reassigning, setReassigning] = useState<boolean>(false);

  // Fetch attributions and active partners
  const fetchData = async () => {
    try {
      setError(null);
      const [attrRes, partnersRes] = await Promise.all([
        apiFetch('/api/developer/sales-attributions'),
        apiFetch('/api/developer/sales-partners'),
      ]);

      if (!attrRes.ok) {
        const errData = await attrRes.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to load customer attributions');
      }

      const attrData = await attrRes.json();
      setAttributions(attrData.attributions || []);

      if (partnersRes.ok) {
        const partnersData = await partnersRes.json();
        const list = Array.isArray(partnersData.salesPartners)
          ? partnersData.salesPartners
          : Array.isArray(partnersData.partners)
          ? partnersData.partners
          : [];
        const activeOnly = list
          .filter((p: any) => p.status === 'active')
          .map((p: any) => ({
            id: p.id,
            user_id: p.user_id,
            name: p.user?.name || p.name || 'Sales Partner',
            email: p.user?.email || p.email || '',
            status: p.status,
          }));
        setActivePartners(activeOnly);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to load attributions');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Fetch audit logs when inspection drawer opens
  const openInspectModal = async (item: CustomerAttribution) => {
    setInspectItem(item);
    setInspectAuditLogs([]);
    setLoadingAuditLogs(true);
    try {
      const res = await apiFetch(`/api/developer/sales-attributions/${item.id}`);
      if (res.ok) {
        const data = await res.json();
        if (data.attribution) {
          setInspectItem(data.attribution);
        }
        setInspectAuditLogs(data.auditLogs || []);
      }
    } catch (err) {
      console.warn('Failed to fetch detailed attribution audit logs:', err);
    } finally {
      setLoadingAuditLogs(false);
    }
  };

  // Actions
  const handleApprove = async () => {
    if (!approveItem) return;
    setApproving(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/developer/sales-attributions/${approveItem.id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: approveReason.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to approve attribution');
      }
      setSuccessMessage(`Attribution for ${approveItem.referral_code} approved successfully`);
      setApproveItem(null);
      setApproveReason('');
      fetchData();
    } catch (err: any) {
      setError(err?.message || 'Approval failed');
    } finally {
      setApproving(false);
    }
  };

  const handleReject = async () => {
    if (!rejectItem) return;
    if (!rejectReason.trim()) {
      setError('A recorded rejection reason is required');
      return;
    }
    setRejecting(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/developer/sales-attributions/${rejectItem.id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: rejectReason.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to reject attribution');
      }
      setSuccessMessage(`Attribution for ${rejectItem.referral_code} rejected.`);
      setRejectItem(null);
      setRejectReason('');
      fetchData();
    } catch (err: any) {
      setError(err?.message || 'Rejection failed');
    } finally {
      setRejecting(false);
    }
  };

  const handleReassign = async () => {
    if (!reassignItem) return;
    if (!reassignTargetUserId) {
      setError('Please select a target active Sales Partner');
      return;
    }
    if (!reassignReason.trim()) {
      setError('A recorded reassignment reason is required');
      return;
    }
    setReassigning(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/developer/sales-attributions/${reassignItem.id}/reassign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          newPartnerUserId: reassignTargetUserId,
          reason: reassignReason.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to reassign attribution');
      }
      setSuccessMessage(`Attribution reallocated successfully.`);
      setReassignItem(null);
      setReassignTargetUserId('');
      setReassignReason('');
      fetchData();
    } catch (err: any) {
      setError(err?.message || 'Reassignment failed');
    } finally {
      setReassigning(false);
    }
  };

  // Metrics
  const totalCount = attributions.length;
  const approvedCount = attributions.filter((a) => a.status === 'approved').length;
  const pendingCount = attributions.filter((a) => a.status === 'pending').length;
  const needsReviewCount = attributions.filter((a) => a.status === 'needs_review').length;
  const rejectedCount = attributions.filter((a) => a.status === 'rejected').length;
  const competingCount = attributions.filter((a) => a.is_competing_claim).length;
  const selfReferralCount = attributions.filter((a) => a.is_self_referral).length;

  // Filtered List
  const filteredAttributions = useMemo(() => {
    return attributions.filter((a) => {
      if (statusFilter !== 'all' && a.status !== statusFilter) return false;
      if (flagFilter === 'competing' && !a.is_competing_claim) return false;
      if (flagFilter === 'self_referral' && !a.is_self_referral) return false;
      if (flagFilter === 'existing_customer' && !a.is_existing_customer) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchCode = a.referral_code?.toLowerCase().includes(q);
        const matchEmail = a.prospect_email?.toLowerCase().includes(q);
        const matchOrg = a.organization?.name?.toLowerCase().includes(q) || a.organization?.slug?.toLowerCase().includes(q);
        const matchUser = a.referred_user?.name?.toLowerCase().includes(q) || a.referred_user?.email?.toLowerCase().includes(q);
        const matchPartner = a.partner?.name?.toLowerCase().includes(q) || a.partner?.email?.toLowerCase().includes(q);
        const matchId = a.id?.toLowerCase().includes(q);
        if (!matchCode && !matchEmail && !matchOrg && !matchUser && !matchPartner && !matchId) {
          return false;
        }
      }
      return true;
    });
  }, [attributions, statusFilter, flagFilter, searchQuery]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'approved':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
            <CheckCircle2 className="w-3 h-3" />
            {t('dev.attributions.statusApproved', undefined, 'Approved')}
          </span>
        );
      case 'pending':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30">
            <Clock className="w-3 h-3" />
            {t('dev.attributions.statusPendingOrg', undefined, 'Pending Org')}
          </span>
        );
      case 'needs_review':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-500/15 text-purple-400 border border-purple-500/30 animate-pulse">
            <AlertTriangle className="w-3 h-3" />
            {t('dev.attributions.statusNeedsReview', undefined, 'Needs Review')}
          </span>
        );
      case 'rejected':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-500/15 text-rose-400 border border-rose-500/30">
            <XCircle className="w-3 h-3" />
            {t('dev.attributions.statusRejected', undefined, 'Rejected')}
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-800 text-slate-400 border border-slate-700">
            {status}
          </span>
        );
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Header Strip */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4" />
              {t('dev.attributions.badge', undefined, 'Administrative Governance')}
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            {t('dev.attributions.title', undefined, 'Sales Referrals & Attribution Management')}
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1 max-w-2xl">
            {t('dev.attributions.subtitle', undefined, 'Audit deterministic customer attribution records, resolve competing partner claims, enforce existing-customer boundaries, and execute authoritative reassignments.')}
          </p>
        </div>

        <button
          onClick={() => {
            setRefreshing(true);
            fetchData();
          }}
          disabled={refreshing}
          className="self-start sm:self-auto flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-850 border border-slate-800 text-xs font-semibold text-slate-300 hover:text-white transition-all cursor-pointer disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          <span>{t('dev.attributions.refreshRecords', undefined, 'Refresh Records')}</span>
        </button>
      </div>

      {/* Notifications */}
      {error && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <AlertOctagon className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            onClick={() => setError(null)}
            className="text-rose-400 hover:text-rose-200 text-xs font-bold cursor-pointer"
          >
            {t('common.dismiss', undefined, 'Dismiss')}
          </button>
        </div>
      )}

      {successMessage && (
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{successMessage}</span>
          </div>
          <button
            onClick={() => setSuccessMessage(null)}
            className="text-emerald-400 hover:text-emerald-200 text-xs font-bold cursor-pointer"
          >
            {t('common.dismiss', undefined, 'Dismiss')}
          </button>
        </div>
      )}

      {/* Metric Counters */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-1">
          <span className="text-xs text-slate-400 font-medium">{t('dev.attributions.totalCaptured', undefined, 'Total Captured')}</span>
          <div className="text-2xl font-black text-white">{totalCount}</div>
        </div>

        <div className="bg-slate-900 border border-purple-500/30 rounded-xl p-4 space-y-1 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs text-purple-400 font-medium">{t('dev.attributions.needsAdminReview', undefined, 'Needs Admin Review')}</span>
            {needsReviewCount > 0 && (
              <span className="w-2 h-2 rounded-full bg-purple-400 animate-ping" />
            )}
          </div>
          <div className="text-2xl font-black text-purple-400">{needsReviewCount}</div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-1">
          <span className="text-xs text-emerald-400 font-medium">{t('dev.attributions.approvedAttributions', undefined, 'Approved Attributions')}</span>
          <div className="text-2xl font-black text-emerald-400">{approvedCount}</div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-1">
          <span className="text-xs text-amber-400 font-medium">{t('dev.attributions.pendingOrgCreation', undefined, 'Pending Org Creation')}</span>
          <div className="text-2xl font-black text-amber-400">{pendingCount}</div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-1">
          <span className="text-xs text-rose-400 font-medium">{t('dev.attributions.rejectedConflicts', undefined, 'Rejected / Conflicts')}</span>
          <div className="text-2xl font-black text-rose-400">
            {rejectedCount}
            {(competingCount > 0 || selfReferralCount > 0) && (
              <span className="text-xs font-normal text-slate-500 ml-1.5">
                ({competingCount} comp / {selfReferralCount} self)
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="space-y-3">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
          {/* Status Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1">
            {[
              { id: 'all', label: `${t('common.all', undefined, 'All')} (${totalCount})` },
              { id: 'needs_review', label: `${t('dev.attributions.statusNeedsReview', undefined, 'Needs Review')} (${needsReviewCount})` },
              { id: 'approved', label: `${t('dev.attributions.statusApproved', undefined, 'Approved')} (${approvedCount})` },
              { id: 'pending', label: `${t('dev.attributions.statusPendingOrg', undefined, 'Pending Org')} (${pendingCount})` },
              { id: 'rejected', label: `${t('dev.attributions.statusRejected', undefined, 'Rejected')} (${rejectedCount})` },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setStatusFilter(tab.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                  statusFilter === tab.id
                    ? 'bg-emerald-500 text-slate-950 shadow-sm'
                    : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Search input */}
          <div className="relative min-w-[260px]">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('dev.attributions.searchPlaceholder', undefined, 'Search partner, customer, org, code...')}
              className="w-full bg-slate-900 border border-slate-800 focus:border-emerald-500 rounded-xl pl-9 pr-3 py-1.5 text-xs text-slate-200 outline-none transition-all placeholder:text-slate-500"
            />
          </div>
        </div>

        {/* Risk / Flag Chips */}
        <div className="flex items-center gap-2 text-xs">
          <span className="text-slate-500 text-[11px] font-semibold uppercase tracking-wider">{t('dev.attributions.flags', undefined, 'Flags')}:</span>
          {[
            { id: 'all', label: t('dev.attributions.allRecords', undefined, 'All Records') },
            { id: 'competing', label: `${t('dev.attributions.competingClaims', undefined, 'Competing Claims')} (${competingCount})` },
            { id: 'self_referral', label: `${t('dev.attributions.selfReferrals', undefined, 'Self-Referrals')} (${selfReferralCount})` },
            { id: 'existing_customer', label: t('dev.attributions.existingCustomers', undefined, 'Existing Customers') },
          ].map((chip) => (
            <button
              key={chip.id}
              onClick={() => setFlagFilter(chip.id as any)}
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer ${
                flagFilter === chip.id
                  ? 'bg-slate-800 text-white border border-slate-700'
                  : 'bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-900'
              }`}
            >
              {chip.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main Table */}
      {loading ? (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center space-y-3">
          <RefreshCw className="w-6 h-6 text-emerald-400 animate-spin mx-auto" />
          <p className="text-xs text-slate-400">{t('dev.attributions.loadingAttributions', undefined, 'Loading customer attributions...')}</p>
        </div>
      ) : filteredAttributions.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center space-y-3">
          <div className="w-12 h-12 rounded-xl bg-slate-800 flex items-center justify-center mx-auto text-slate-500">
            <Users className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-bold text-slate-300">{t('dev.attributions.noRecordsFound', undefined, 'No attribution records found')}</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            {searchQuery || statusFilter !== 'all' || flagFilter !== 'all'
              ? t('dev.attributions.tryModifyingFilters', undefined, 'Try modifying your search query or filter selections.')
              : t('dev.attributions.emptyStateDesc', undefined, 'When sales partners share referral codes and clients register, attributions will appear here.')}
          </p>
        </div>
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950/70 text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4 font-semibold">{t('dev.attributions.colReferralMethod', undefined, 'Referral & Method')}</th>
                  <th className="py-3 px-4 font-semibold">{t('dev.attributions.colSalesPartner', undefined, 'Sales Partner')}</th>
                  <th className="py-3 px-4 font-semibold">{t('dev.attributions.colReferredCustomer', undefined, 'Referred Customer')}</th>
                  <th className="py-3 px-4 font-semibold">{t('dev.attributions.colTargetOrg', undefined, 'Target Organization')}</th>
                  <th className="py-3 px-4 font-semibold">{t('dev.attributions.colStatusFlags', undefined, 'Status & Flags')}</th>
                  <th className="py-3 px-4 font-semibold">{t('dev.attributions.colCaptured', undefined, 'Captured')}</th>
                  <th className="py-3 px-4 font-semibold text-right">{t('common.actions', undefined, 'Actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {filteredAttributions.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-850/50 transition-colors">
                    {/* Referral & Method */}
                    <td className="py-3.5 px-4">
                      <div className="space-y-0.5">
                        <span className="font-mono text-amber-400 font-bold">{item.referral_code}</span>
                        <div className="text-[10px] text-slate-500 uppercase tracking-wider">
                          via {item.referral_method}
                        </div>
                      </div>
                    </td>

                    {/* Sales Partner */}
                    <td className="py-3.5 px-4">
                      <div className="space-y-0.5">
                        <div className="font-bold text-slate-200">
                          {item.partner?.name || 'Partner Account'}
                        </div>
                        <div className="text-[11px] text-slate-400 font-mono">
                          {item.partner?.email || item.partner_user_id}
                        </div>
                        {item.partner?.status && (
                          <span
                            className={`inline-block text-[9px] uppercase font-bold px-1.5 py-0.2 rounded ${
                              item.partner.status === 'active'
                                ? 'bg-emerald-500/10 text-emerald-400'
                                : 'bg-slate-800 text-slate-400'
                            }`}
                          >
                            {item.partner.status}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Referred Customer */}
                    <td className="py-3.5 px-4">
                      {item.referred_user ? (
                        <div className="space-y-0.5">
                          <div className="font-bold text-slate-200">{item.referred_user.name}</div>
                          <div className="text-[11px] text-slate-400 font-mono">
                            {item.referred_user.email}
                          </div>
                        </div>
                      ) : item.prospect_email ? (
                        <div className="space-y-0.5">
                          <div className="font-mono text-slate-300">{item.prospect_email}</div>
                          <span className="text-[10px] text-amber-400 italic">{t('dev.attributions.unregisteredLead', undefined, 'Unregistered Lead')}</span>
                        </div>
                      ) : (
                        <span className="text-slate-500 italic">{t('dev.attributions.anonymousVisit', undefined, 'Anonymous Visit')}</span>
                      )}
                    </td>

                    {/* Organization */}
                    <td className="py-3.5 px-4">
                      {item.organization ? (
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded bg-emerald-500/10 text-emerald-400 flex items-center justify-center font-bold text-[10px] shrink-0">
                            <Building2 className="w-3.5 h-3.5" />
                          </div>
                          <div>
                            <div className="font-bold text-slate-200">{item.organization.name}</div>
                            <div className="text-[10px] text-slate-500 font-mono">
                              /{item.organization.slug}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <span className="text-slate-500 italic text-[11px]">{t('dev.attributions.noOrgLinked', undefined, 'No Org Linked Yet')}</span>
                      )}
                    </td>

                    {/* Status & Flags */}
                    <td className="py-3.5 px-4">
                      <div className="space-y-1">
                        <div>{getStatusBadge(item.status)}</div>

                        {/* Flags */}
                        <div className="flex flex-wrap gap-1 mt-1">
                          {item.is_competing_claim && (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30">
                              <AlertTriangle className="w-2.5 h-2.5" />
                              {t('dev.attributions.competingClaim', undefined, 'Competing Claim')}
                            </span>
                          )}
                          {item.is_self_referral && (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-rose-500/15 text-rose-400 border border-rose-500/30">
                              <ShieldAlert className="w-2.5 h-2.5" />
                              {t('dev.attributions.selfReferral', undefined, 'Self-Referral')}
                            </span>
                          )}
                          {item.is_existing_customer && (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-cyan-500/15 text-cyan-400 border border-cyan-500/30">
                              <Info className="w-2.5 h-2.5" />
                              {t('dev.attributions.existingClient', undefined, 'Existing Client')}
                            </span>
                          )}
                        </div>

                        {item.review_reason && (
                          <div
                            className="text-[10px] text-slate-400 max-w-[200px] truncate"
                            title={item.review_reason}
                          >
                            {item.review_reason}
                          </div>
                        )}
                      </div>
                    </td>

                    {/* Captured Date */}
                    <td className="py-3.5 px-4 text-slate-400 font-mono text-[11px] whitespace-nowrap">
                      {new Date(item.created_at).toLocaleDateString(undefined, {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </td>

                    {/* Actions */}
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {/* Inspect & Audit */}
                        <button
                          onClick={() => openInspectModal(item)}
                          className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
                          title={t('dev.attributions.inspectTitle', undefined, 'Inspect Details & Audit Trail')}
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>

                        {/* Approve */}
                        {item.status !== 'approved' && (
                          <button
                            onClick={() => {
                              setApproveItem(item);
                              setApproveReason('');
                            }}
                            className="p-1.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500 text-emerald-400 hover:text-slate-950 transition-colors cursor-pointer"
                            title={t('dev.attributions.approveTitle', undefined, 'Approve Attribution')}
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                        )}

                        {/* Reject */}
                        {item.status !== 'rejected' && (
                          <button
                            onClick={() => {
                              setRejectItem(item);
                              setRejectReason('');
                            }}
                            className="p-1.5 rounded-lg bg-rose-500/15 hover:bg-rose-500 text-rose-400 hover:text-slate-950 transition-colors cursor-pointer"
                            title={t('dev.attributions.rejectTitle', undefined, 'Reject Attribution')}
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}

                        {/* Reassign */}
                        <button
                          onClick={() => {
                            setReassignItem(item);
                            setReassignTargetUserId('');
                            setReassignReason('');
                          }}
                          className="p-1.5 rounded-lg bg-indigo-500/15 hover:bg-indigo-500 text-indigo-400 hover:text-slate-950 transition-colors cursor-pointer"
                          title={t('dev.attributions.reassignTitle', undefined, 'Reassign to Another Partner')}
                        >
                          <ArrowRightLeft className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================== */}
      {/* 1. INSPECT & AUDIT LOGS MODAL / DRAWER */}
      {/* ========================================================== */}
      {inspectItem && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto shadow-2xl p-6 space-y-6">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/15 text-emerald-400 flex items-center justify-center">
                  <Eye className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">{t('dev.attributions.inspectModalTitle', undefined, 'Attribution Inspection & History')}</h3>
                  <p className="text-xs text-slate-400 font-mono">ID: {inspectItem.id}</p>
                </div>
              </div>
              <button
                onClick={() => setInspectItem(null)}
                className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Attribution Core Spec */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 space-y-2">
                <span className="text-[11px] font-bold uppercase text-slate-500">{t('dev.attributions.colSalesPartner', undefined, 'Sales Partner')}</span>
                <div className="font-bold text-slate-200">{inspectItem.partner?.name || 'Partner Account'}</div>
                <div className="text-slate-400 font-mono">{inspectItem.partner?.email || inspectItem.partner_user_id}</div>
                <div className="text-[10px] text-slate-500">User ID: {inspectItem.partner_user_id}</div>
              </div>

              <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 space-y-2">
                <span className="text-[11px] font-bold uppercase text-slate-500">{t('dev.attributions.colReferredCustomer', undefined, 'Referred Customer')}</span>
                {inspectItem.referred_user ? (
                  <>
                    <div className="font-bold text-slate-200">{inspectItem.referred_user.name}</div>
                    <div className="text-slate-400 font-mono">{inspectItem.referred_user.email}</div>
                    <div className="text-[10px] text-slate-500">User ID: {inspectItem.referred_user.id}</div>
                  </>
                ) : (
                  <div className="text-slate-400 font-mono">{inspectItem.prospect_email || t('dev.attributions.noEmailRecorded', undefined, 'No email recorded')}</div>
                )}
              </div>

              <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 space-y-2">
                <span className="text-[11px] font-bold uppercase text-slate-500">{t('dev.attributions.colTargetOrg', undefined, 'Target Organization')}</span>
                {inspectItem.organization ? (
                  <>
                    <div className="font-bold text-slate-200">{inspectItem.organization.name}</div>
                    <div className="text-slate-400 font-mono">Slug: /{inspectItem.organization.slug}</div>
                    <div className="text-[10px] text-slate-500">Org ID: {inspectItem.organization.id}</div>
                  </>
                ) : (
                  <div className="text-slate-500 italic">{t('dev.attributions.noOrgLinked', undefined, 'No organization linked yet')}</div>
                )}
              </div>

              <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 space-y-2">
                <span className="text-[11px] font-bold uppercase text-slate-500">{t('dev.attributions.governanceStatus', undefined, 'Governance Status')}</span>
                <div>{getStatusBadge(inspectItem.status)}</div>
                {inspectItem.decision_reason && (
                  <div className="text-emerald-400 text-[11px]">{t('common.reason', undefined, 'Reason')}: {inspectItem.decision_reason}</div>
                )}
                {inspectItem.review_reason && (
                  <div className="text-purple-400 text-[11px]">Review Flag: {inspectItem.review_reason}</div>
                )}
              </div>
            </div>

            {/* Competing Claim Comparison */}
            {inspectItem.competing_attribution && (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 space-y-3">
                <div className="flex items-center gap-2 text-amber-400 font-bold text-xs">
                  <AlertTriangle className="w-4 h-4" />
                  <span>{t('dev.attributions.competingDetected', undefined, 'Competing Claim Detected from Another Partner')}</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs bg-slate-950/60 p-3 rounded-lg border border-amber-500/20">
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase">{t('dev.attributions.competingPartner', undefined, 'Competing Partner')}</span>
                    <div className="font-bold text-slate-200">
                      {inspectItem.competing_attribution.partner?.name || 'Partner Account'}
                    </div>
                    <div className="text-slate-400 font-mono">
                      {inspectItem.competing_attribution.partner?.email || inspectItem.competing_attribution.partner_user_id}
                    </div>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase">{t('dev.attributions.statusEstablishedAt', undefined, 'Status & Established At')}</span>
                    <div>{getStatusBadge(inspectItem.competing_attribution.status)}</div>
                    <div className="text-slate-400 font-mono text-[11px] mt-1">
                      {new Date(inspectItem.competing_attribution.created_at).toLocaleString()}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Audit History Log Trail */}
            <div className="space-y-3 border-t border-slate-800 pt-4">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-300">
                <History className="w-4 h-4 text-emerald-400" />
                <span>{t('dev.attributions.auditHistory', undefined, 'Authoritative Audit History')}</span>
              </div>

              {loadingAuditLogs ? (
                <div className="text-center py-6">
                  <RefreshCw className="w-5 h-5 text-emerald-400 animate-spin mx-auto" />
                  <span className="text-[11px] text-slate-500 mt-2 block">{t('dev.attributions.loadingAuditTrail', undefined, 'Loading audit trail...')}</span>
                </div>
              ) : inspectAuditLogs.length === 0 ? (
                <div className="text-center py-6 text-slate-500 text-xs italic">
                  {t('dev.attributions.noAuditLogs', undefined, 'No previous audit records logged for this attribution.')}
                </div>
              ) : (
                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {inspectAuditLogs.map((log) => (
                    <div
                      key={log.id}
                      className="bg-slate-950 border border-slate-800/80 rounded-xl p-3 text-xs space-y-1.5"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold uppercase tracking-wider text-[10px] text-emerald-400">
                          {log.action}
                        </span>
                        <span className="text-[10px] text-slate-500 font-mono">
                          {new Date(log.created_at).toLocaleString()}
                        </span>
                      </div>
                      <div className="text-slate-300 font-medium">{log.reason || 'No description provided'}</div>
                      <div className="flex items-center gap-4 text-[10px] text-slate-500 font-mono">
                        {log.actor_user_id && <span>Actor: {log.actor_user_id}</span>}
                        {log.previous_status && (
                          <span>
                            Transition: {log.previous_status} → {log.new_status}
                          </span>
                        )}
                        {log.new_partner_id && <span>Target Partner: {log.new_partner_id}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setInspectItem(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold cursor-pointer"
              >
                {t('common.close', undefined, 'Close')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================== */}
      {/* 2. APPROVE MODAL */}
      {/* ========================================================== */}
      {approveItem && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                <h3 className="text-base font-bold text-white">{t('dev.attributions.approveTitle', undefined, 'Approve Attribution')}</h3>
              </div>
              <button onClick={() => setApproveItem(null)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            {approveItem.is_competing_claim && (
              <div className="p-3 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  {t('dev.attributions.competingWarning', undefined, 'Warning: This customer has a competing claim. Approving this attribution establishes this partner as the primary authoritative owner.')}
                </span>
              </div>
            )}

            {approveItem.is_self_referral && (
              <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2">
                <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  {t('dev.attributions.selfReferralWarning', undefined, 'Self-Referral Warning: Partner is the customer or organization owner. Confirming will override self-referral blocks.')}
                </span>
              </div>
            )}

            <div className="space-y-1 text-xs">
              <div className="text-slate-400">Partner: <strong className="text-white">{approveItem.partner?.email || approveItem.partner_user_id}</strong></div>
              <div className="text-slate-400">Referral Code: <strong className="text-amber-400 font-mono">{approveItem.referral_code}</strong></div>
              {approveItem.organization && (
                <div className="text-slate-400">Organization: <strong className="text-white">{approveItem.organization.name}</strong></div>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300">
                {t('dev.attributions.decisionNotesLabel', undefined, 'Decision Notes / Reason (Optional)')}
              </label>
              <textarea
                value={approveReason}
                onChange={(e) => setApproveReason(e.target.value)}
                placeholder={t('dev.attributions.approveReasonPlaceholder', undefined, 'e.g. Verified genuine introduction at Kuala Lumpur roadshow')}
                className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-xl p-3 text-xs text-slate-200 outline-none h-20 placeholder:text-slate-600"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setApproveItem(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold cursor-pointer"
              >
                {t('common.cancel', undefined, 'Cancel')}
              </button>
              <button
                onClick={handleApprove}
                disabled={approving}
                className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {approving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                <span>{t('dev.attributions.confirmApproval', undefined, 'Confirm Approval')}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================== */}
      {/* 3. REJECT MODAL */}
      {/* ========================================================== */}
      {rejectItem && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <XCircle className="w-5 h-5 text-rose-400" />
                <h3 className="text-base font-bold text-white">{t('dev.attributions.rejectTitle', undefined, 'Reject Attribution')}</h3>
              </div>
              <button onClick={() => setRejectItem(null)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-1 text-xs">
              <div className="text-slate-400">Partner: <strong className="text-white">{rejectItem.partner?.email || rejectItem.partner_user_id}</strong></div>
              <div className="text-slate-400">Referral Code: <strong className="text-amber-400 font-mono">{rejectItem.referral_code}</strong></div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300">
                {t('dev.attributions.rejectionJustification', undefined, 'Rejection Justification')} <span className="text-rose-400">*</span>
              </label>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder={t('dev.attributions.rejectReasonPlaceholder', undefined, 'Reason is required for audit logs (e.g. Existing corporate customer; partner was not the lead initiator)')}
                className="w-full bg-slate-950 border border-slate-800 focus:border-rose-500 rounded-xl p-3 text-xs text-slate-200 outline-none h-24 placeholder:text-slate-600"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setRejectItem(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold cursor-pointer"
              >
                {t('common.cancel', undefined, 'Cancel')}
              </button>
              <button
                onClick={handleReject}
                disabled={rejecting || !rejectReason.trim()}
                className="px-4 py-2 rounded-xl bg-rose-500 hover:bg-rose-400 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {rejecting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
                <span>{t('dev.attributions.confirmRejection', undefined, 'Confirm Rejection')}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================== */}
      {/* 4. REASSIGN MODAL */}
      {/* ========================================================== */}
      {reassignItem && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <ArrowRightLeft className="w-5 h-5 text-indigo-400" />
                <h3 className="text-base font-bold text-white">{t('dev.attributions.reassignModalTitle', undefined, 'Reassign Attribution')}</h3>
              </div>
              <button onClick={() => setReassignItem(null)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-1 text-xs">
              <div className="text-slate-400">Current Partner: <strong className="text-white">{reassignItem.partner?.email || reassignItem.partner_user_id}</strong></div>
              <div className="text-slate-400">Customer: <strong className="text-white">{reassignItem.referred_user?.email || reassignItem.prospect_email || 'Lead'}</strong></div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300">
                {t('dev.attributions.targetPartnerLabel', undefined, 'Target Active Sales Partner')} <span className="text-indigo-400">*</span>
              </label>
              <select
                value={reassignTargetUserId}
                onChange={(e) => setReassignTargetUserId(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-xl px-3 py-2 text-xs text-slate-200 outline-none"
              >
                <option value="">{t('dev.attributions.selectTargetPartner', undefined, 'Select target Sales Partner...')}</option>
                {activePartners
                  .filter((p) => p.user_id !== reassignItem.partner_user_id && p.user_id !== reassignItem.referred_user_id)
                  .map((p) => (
                    <option key={p.id} value={p.user_id}>
                      {p.name} ({p.email})
                    </option>
                  ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300">
                {t('dev.attributions.reassignmentReason', undefined, 'Reassignment Reason')} <span className="text-indigo-400">*</span>
              </label>
              <textarea
                value={reassignReason}
                onChange={(e) => setReassignReason(e.target.value)}
                placeholder={t('dev.attributions.reassignReasonPlaceholder', undefined, 'Reason is required for audit logs (e.g. Territory handover; original lead belonged to target partner)')}
                className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-xl p-3 text-xs text-slate-200 outline-none h-20 placeholder:text-slate-600"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setReassignItem(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold cursor-pointer"
              >
                {t('common.cancel', undefined, 'Cancel')}
              </button>
              <button
                onClick={handleReassign}
                disabled={reassigning || !reassignTargetUserId || !reassignReason.trim()}
                className="px-4 py-2 rounded-xl bg-indigo-500 hover:bg-indigo-400 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {reassigning ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <ArrowRightLeft className="w-3.5 h-3.5" />}
                <span>{t('dev.attributions.confirmReassignment', undefined, 'Confirm Reassignment')}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
