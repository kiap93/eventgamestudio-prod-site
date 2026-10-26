import React, { useState, useEffect, useMemo } from 'react';
import { useLocalization } from '../../context/LocalizationContext';
import { apiFetch } from '../../lib/api';
import { SalesPartnerProfile, SalesPartnerAuditLog, SalesPartnerStatus } from '../../types/sales';
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
  Building2,
  Share2,
  ShieldCheck,
  ShieldAlert,
  Info,
  Check,
  X,
  History,
  Percent,
  Edit,
  ExternalLink,
} from 'lucide-react';

export const DeveloperSalesPartners: React.FC = () => {
  const { t } = useLocalization();
  const [partners, setPartners] = useState<SalesPartnerProfile[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Modals state
  const [inspectPartner, setInspectPartner] = useState<SalesPartnerProfile | null>(null);
  const [auditLogs, setAuditLogs] = useState<SalesPartnerAuditLog[]>([]);
  const [loadingAuditLogs, setLoadingAuditLogs] = useState<boolean>(false);

  // Status Change Modal
  const [statusTargetPartner, setStatusTargetPartner] = useState<SalesPartnerProfile | null>(null);
  const [targetStatus, setTargetStatus] = useState<SalesPartnerStatus>('active');
  const [statusReason, setStatusReason] = useState<string>('');
  const [statusAdminNotes, setStatusAdminNotes] = useState<string>('');
  const [updatingStatus, setUpdatingStatus] = useState<boolean>(false);

  // Commission Rates Modal
  const [ratesTargetPartner, setRatesTargetPartner] = useState<SalesPartnerProfile | null>(null);
  const [firstOrderRate, setFirstOrderRate] = useState<string>('');
  const [repeatOrderRate, setRepeatOrderRate] = useState<string>('');
  const [customRate, setCustomRate] = useState<string>('');
  const [ratesReason, setRatesReason] = useState<string>('');
  const [updatingRates, setUpdatingRates] = useState<boolean>(false);

  const fetchPartners = async (isManualRefresh = false) => {
    if (isManualRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const queryParams = new URLSearchParams();
      if (statusFilter !== 'all') {
        queryParams.set('status', statusFilter);
      }
      if (searchQuery.trim()) {
        queryParams.set('search', searchQuery.trim());
      }

      const queryString = queryParams.toString() ? `?${queryParams.toString()}` : '';
      const res = await apiFetch(`/api/developer/sales-partners${queryString}`);
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to load Sales Partners');
      }
      const data = await res.json();
      if (data && data.salesPartners) {
        setPartners(data.salesPartners);
      } else {
        setPartners([]);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to load Sales Partners');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchPartners();
  }, [statusFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchPartners();
  };

  const handleInspect = async (partner: SalesPartnerProfile) => {
    setInspectPartner(partner);
    setLoadingAuditLogs(true);
    try {
      const res = await apiFetch(`/api/developer/sales-partners/${partner.user_id}/audit-logs`);
      if (res.ok) {
        const data = await res.json();
        setAuditLogs(data.auditLogs || []);
      } else {
        setAuditLogs([]);
      }
    } catch (err: any) {
      console.error('Failed to load audit logs:', err);
      setAuditLogs([]);
    } finally {
      setLoadingAuditLogs(false);
    }
  };

  const openStatusModal = (partner: SalesPartnerProfile, nextStatus: SalesPartnerStatus) => {
    setStatusTargetPartner(partner);
    setTargetStatus(nextStatus);
    setStatusReason('');
    setStatusAdminNotes(partner.admin_notes || '');
  };

  const handleStatusSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!statusTargetPartner) return;

    if ((targetStatus === 'suspended' || targetStatus === 'rejected') && !statusReason.trim()) {
      alert('Please provide a reason for this status change.');
      return;
    }

    setUpdatingStatus(true);
    setError(null);

    try {
      await apiFetch(`/api/developer/sales-partners/${statusTargetPartner.user_id}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: targetStatus,
          admin_notes: statusAdminNotes.trim(),
          reason: statusReason.trim() || undefined,
        }),
      });

      setSuccessMessage(`Sales partner status successfully changed to ${targetStatus}`);
      setStatusTargetPartner(null);
      fetchPartners();
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: any) {
      setError(err?.message || 'Failed to update partner status');
    } finally {
      setUpdatingStatus(false);
    }
  };

  const openRatesModal = (partner: SalesPartnerProfile) => {
    setRatesTargetPartner(partner);
    setFirstOrderRate(
      typeof partner.first_order_commission_rate === 'number'
        ? (partner.first_order_commission_rate * 100).toString()
        : ''
    );
    setRepeatOrderRate(
      typeof partner.repeat_order_commission_rate === 'number'
        ? (partner.repeat_order_commission_rate * 100).toString()
        : ''
    );
    setCustomRate(
      typeof partner.custom_commission_rate === 'number'
        ? (partner.custom_commission_rate * 100).toString()
        : ''
    );
    setRatesReason('');
  };

  const handleRatesSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ratesTargetPartner) return;

    setUpdatingRates(true);
    setError(null);

    try {
      const parsedFirst = firstOrderRate.trim() !== '' ? parseFloat(firstOrderRate) / 100 : null;
      const parsedRepeat = repeatOrderRate.trim() !== '' ? parseFloat(repeatOrderRate) / 100 : null;
      const parsedCustom = customRate.trim() !== '' ? parseFloat(customRate) / 100 : null;

      await apiFetch(`/api/developer/sales-partners/${ratesTargetPartner.user_id}/rates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          first_order_commission_rate: parsedFirst,
          repeat_order_commission_rate: parsedRepeat,
          custom_commission_rate: parsedCustom,
          reason: ratesReason.trim() || undefined,
        }),
      });

      setSuccessMessage('Commission rates updated successfully');
      setRatesTargetPartner(null);
      fetchPartners();
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: any) {
      setError(err?.message || 'Failed to update commission rates');
    } finally {
      setUpdatingRates(false);
    }
  };

  const filteredPartners = useMemo(() => {
    return partners.filter((p) => {
      if (statusFilter !== 'all' && p.status !== statusFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = p.user?.name?.toLowerCase().includes(q);
        const matchesEmail = p.user?.email?.toLowerCase().includes(q);
        const matchesCode = p.referral_code?.toLowerCase().includes(q);
        return matchesName || matchesEmail || matchesCode;
      }
      return true;
    });
  }, [partners, statusFilter, searchQuery]);

  return (
    <div className="space-y-6">
      {/* Top Header & Overview */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900 border border-slate-800 rounded-2xl p-6">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center justify-center">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">{t('sales.developer.title')}</h1>
              <p className="text-xs text-slate-400 mt-0.5">
                {t('sales.developer.subtitle')}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => fetchPartners(true)}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded-xl font-medium transition-colors border border-slate-700 disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            <span>{refreshing ? t('sales.developer.refreshing') : t('sales.developer.refresh')}</span>
          </button>
        </div>
      </div>

      {/* Alerts */}
      {error && (
        <div className="bg-rose-500/10 border border-rose-500/30 text-rose-400 p-4 rounded-xl text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {successMessage && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 p-4 rounded-xl text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* Filters Bar */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 flex flex-col md:flex-row items-center justify-between gap-3">
        <form onSubmit={handleSearchSubmit} className="flex-1 w-full flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder={t('sales.developer.search')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500/50"
            />
          </div>
          <button
            type="submit"
            className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-medium cursor-pointer"
          >
            {t('sales.customers.search')}
          </button>
        </form>

        <div className="flex items-center gap-2 w-full md:w-auto">
          <Filter className="w-4 h-4 text-slate-500" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-300 focus:outline-none focus:border-emerald-500/50"
          >
            <option value="all">{t('sales.developer.allStatuses', undefined, 'All Statuses')}</option>
            <option value="active">{t('sales.developer.statusActive', undefined, 'Active')}</option>
            <option value="pending">{t('sales.developer.statusPending', undefined, 'Pending')}</option>
            <option value="suspended">{t('sales.developer.statusSuspended', undefined, 'Suspended')}</option>
            <option value="rejected">{t('sales.developer.statusRejected', undefined, 'Rejected')}</option>
          </select>
        </div>
      </div>

      {/* Partners Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        {loading ? (
          <div className="p-12 text-center text-xs text-slate-500 flex flex-col items-center justify-center gap-3">
            <RefreshCw className="w-6 h-6 animate-spin text-emerald-400" />
            <p>{t('sales.developer.loadingPartners', undefined, 'Loading Sales Partners...')}</p>
          </div>
        ) : filteredPartners.length === 0 ? (
          <div className="p-12 text-center text-xs text-slate-500">
            <Users className="w-8 h-8 text-slate-600 mx-auto mb-2 opacity-50" />
            <p>{t('sales.developer.noPartnersFound', undefined, 'No Sales Partners found matching your criteria.')}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950/80 text-[11px] font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4">{t('sales.developer.partnerCol')}</th>
                  <th className="py-3 px-4">{t('sales.developer.statusCol')}</th>
                  <th className="py-3 px-4">{t('sales.referrals.yourReferralCode')}</th>
                  <th className="py-3 px-4">{t('sales.developer.ratesCol')}</th>
                  <th className="py-3 px-4">{t('sales.developer.clientsCol')}</th>
                  <th className="py-3 px-4">{t('sales.developer.appliedCol', undefined, 'Applied')}</th>
                  <th className="py-3 px-4 text-right">{t('sales.developer.actionsCol')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredPartners.map((partner) => (
                  <tr key={partner.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="py-3.5 px-4">
                      <div>
                        <div className="font-medium text-white flex items-center gap-1.5">
                          <span>{partner.user?.name || 'Unnamed Partner'}</span>
                        </div>
                        {partner.agency_name && (
                          <div className="text-[11px] text-amber-400 font-medium">{partner.agency_name}</div>
                        )}
                        <div className="text-[11px] text-slate-400">{partner.user?.email || partner.user_id}</div>
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                          partner.status === 'active'
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : partner.status === 'pending'
                            ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                            : partner.status === 'suspended'
                            ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                            : 'bg-slate-800 text-slate-400 border border-slate-700'
                        }`}
                      >
                        {partner.status === 'active' && <Check className="w-3 h-3" />}
                        {partner.status === 'pending' && <Clock className="w-3 h-3" />}
                        {partner.status === 'suspended' && <X className="w-3 h-3" />}
                        {partner.status === 'rejected' && <XCircle className="w-3 h-3" />}
                        {partner.status.toUpperCase()}
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      {partner.referral_code ? (
                        <span className="font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                          {partner.referral_code}
                        </span>
                      ) : (
                        <span className="text-slate-500 italic">{t('common.none', undefined, 'None')}</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4">
                      {typeof partner.first_order_commission_rate === 'number' ||
                      typeof partner.repeat_order_commission_rate === 'number' ||
                      typeof partner.custom_commission_rate === 'number' ? (
                        <div className="text-[11px] text-amber-400 space-y-0.5">
                          {typeof partner.first_order_commission_rate === 'number' && (
                            <div>{t('sales.developer.firstShort', undefined, '1st')}: {(partner.first_order_commission_rate * 100).toFixed(0)}%</div>
                          )}
                          {typeof partner.repeat_order_commission_rate === 'number' && (
                            <div>{t('sales.developer.repeatShort', undefined, 'Repeat')}: {(partner.repeat_order_commission_rate * 100).toFixed(0)}%</div>
                          )}
                          {typeof partner.custom_commission_rate === 'number' && (
                            <div>{t('sales.developer.flatShort', undefined, 'Flat')}: {(partner.custom_commission_rate * 100).toFixed(0)}%</div>
                          )}
                        </div>
                      ) : (
                        <span className="text-slate-500 text-[11px]">{t('sales.developer.platformStandardRates', undefined, 'Platform Standard (10% / 5%)')}</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="text-[11px]">
                        <span className="font-medium text-white">{partner.approved_attributions || 0}</span> {t('sales.developer.approvedCount', undefined, 'approved')}
                        <span className="text-slate-500"> / {partner.total_attributions || 0} {t('sales.developer.totalCount', undefined, 'total')}</span>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-slate-400 text-[11px]">
                      {partner.applied_at ? new Date(partner.applied_at).toLocaleDateString() : '—'}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => handleInspect(partner)}
                          className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors cursor-pointer"
                          title={t('sales.developer.viewAuditLogs')}
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => openRatesModal(partner)}
                          className="p-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 rounded-lg transition-colors border border-amber-500/20 cursor-pointer"
                          title={t('sales.developer.adjustRates')}
                        >
                          <Percent className="w-3.5 h-3.5" />
                        </button>
                        {partner.status !== 'active' && (
                          <button
                            onClick={() => openStatusModal(partner, 'active')}
                            className="p-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 rounded-lg transition-colors border border-emerald-500/20 cursor-pointer"
                            title={t('sales.developer.approve')}
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {partner.status === 'active' && (
                          <button
                            onClick={() => openStatusModal(partner, 'suspended')}
                            className="p-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 rounded-lg transition-colors border border-rose-500/20 cursor-pointer"
                            title={t('sales.developer.suspend')}
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Details & Audit Logs Modal */}
      {inspectPartner && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <History className="w-4 h-4 text-emerald-400" />
                <h2 className="text-sm font-bold text-white">
                  {t('sales.developer.partnerDetailsTitle', undefined, 'Partner Details & Audit Trail')}: {inspectPartner.user?.name}
                </h2>
              </div>
              <button
                onClick={() => setInspectPartner(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-5 text-xs">
              <div className="grid grid-cols-2 gap-3 bg-slate-950 p-3.5 rounded-xl border border-slate-800">
                <div>
                  <span className="text-slate-500 block text-[10px] uppercase">{t('sales.developer.partnerIdLabel', undefined, 'Partner ID')}</span>
                  <span className="font-mono text-slate-300">{inspectPartner.id}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px] uppercase">{t('sales.developer.userEmailLabel', undefined, 'User Email')}</span>
                  <span className="text-white">{inspectPartner.user?.email}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px] uppercase">{t('sales.developer.statusCol')}</span>
                  <span className="font-semibold text-emerald-400 capitalize">{inspectPartner.status}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px] uppercase">{t('sales.referrals.yourReferralCode')}</span>
                  <span className="font-mono text-emerald-400">{inspectPartner.referral_code || t('common.none', undefined, 'None')}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px] uppercase">{t('sales.developer.agencyEntityLabel', undefined, 'Agency / Entity')}</span>
                  <span className="text-amber-400 font-medium">{inspectPartner.agency_name || t('sales.developer.notProvided', undefined, 'Not provided')}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px] uppercase">{t('sales.developer.appliedAtLabel', undefined, 'Applied At')}</span>
                  <span className="text-slate-300">
                    {inspectPartner.applied_at ? new Date(inspectPartner.applied_at).toLocaleString() : '—'}
                  </span>
                </div>
              </div>

              {/* Applicant Details vs Admin Notes */}
              <div className="space-y-3">
                <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-1.5">
                  <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">
                    {t('sales.developer.applicantSubmissionDetails', undefined, 'Applicant Submission Details')}
                  </span>
                  <div className="text-slate-300 whitespace-pre-wrap leading-relaxed">
                    {inspectPartner.application_notes || (
                      <span className="text-slate-500 italic">{t('sales.developer.noApplicationNotes', undefined, 'No application notes provided by applicant.')}</span>
                    )}
                  </div>
                </div>

                <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-1.5">
                  <span className="text-amber-400 block text-[10px] uppercase font-bold tracking-wider">
                    {t('sales.developer.internalAdminNotes', undefined, 'Internal Administrator Notes (Private)')}
                  </span>
                  <div className="text-slate-300 whitespace-pre-wrap leading-relaxed">
                    {inspectPartner.admin_notes || (
                      <span className="text-slate-500 italic">{t('sales.developer.noAdminNotes', undefined, 'No internal administrator notes recorded.')}</span>
                    )}
                  </div>
                </div>
              </div>

              <div>
                <h3 className="font-semibold text-white mb-2 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-slate-400" />
                  {t('sales.developer.auditLogsTitle')}
                </h3>
                {loadingAuditLogs ? (
                  <div className="p-6 text-center text-slate-500">{t('sales.developer.loadingAuditHistory', undefined, 'Loading audit history...')}</div>
                ) : auditLogs.length === 0 ? (
                  <div className="p-4 bg-slate-950 rounded-xl text-center text-slate-500 border border-slate-800">
                    {t('sales.developer.noAuditLogs')}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {auditLogs.map((log) => (
                      <div
                        key={log.id}
                        className="bg-slate-950 border border-slate-800/80 rounded-xl p-3 flex flex-col gap-1 text-[11px]"
                      >
                        <div className="flex items-center justify-between text-slate-400">
                          <span className="font-semibold text-white">{log.action}</span>
                          <span>{new Date(log.created_at).toLocaleString()}</span>
                        </div>
                        {log.reason && (
                          <div className="text-slate-300 bg-slate-900/60 p-2 rounded border border-slate-800">
                            {t('sales.developer.reasonPrefix', undefined, 'Reason')}: {log.reason}
                          </div>
                        )}
                        <div className="text-slate-500 text-[10px]">
                          {t('sales.developer.transitionPrefix', undefined, 'Transition')}: {log.previous_status || 'none'} &rarr; {log.new_status}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="p-4 border-t border-slate-800 flex justify-end">
              <button
                onClick={() => setInspectPartner(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-medium cursor-pointer"
              >
                {t('common.close', undefined, 'Close')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Status Modal */}
      {statusTargetPartner && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleStatusSubmit}
            className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full shadow-2xl p-5 space-y-4 text-xs"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h2 className="text-sm font-bold text-white">{t('sales.developer.changePartnerStatus', undefined, 'Change Partner Status')}</h2>
              <button
                type="button"
                onClick={() => setStatusTargetPartner(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-1.5 text-[11px]">
              <div>
                <span className="text-slate-500">{t('sales.developer.applicantLabel', undefined, 'Applicant')}: </span>
                <strong className="text-white">{statusTargetPartner.user?.name}</strong>{' '}
                <span className="text-slate-400">({statusTargetPartner.user?.email})</span>
              </div>
              {statusTargetPartner.agency_name && (
                <div>
                  <span className="text-slate-500">{t('sales.developer.agencyEntityLabel', undefined, 'Agency / Entity')}: </span>
                  <span className="text-amber-400 font-medium">{statusTargetPartner.agency_name}</span>
                </div>
              )}
              {statusTargetPartner.application_notes && (
                <div>
                  <span className="text-slate-500 block">{t('sales.developer.applicantSubmissionLabel', undefined, 'Applicant Submission')}:</span>
                  <p className="text-slate-300 italic bg-slate-900/60 p-2 rounded border border-slate-800/80 mt-1 whitespace-pre-wrap max-h-24 overflow-y-auto">
                    {statusTargetPartner.application_notes}
                  </p>
                </div>
              )}
            </div>

            <div>
              <label className="block text-slate-400 mb-1 font-medium">{t('sales.developer.newStatusLabel', undefined, 'New Status')}</label>
              <select
                value={targetStatus}
                onChange={(e) => setTargetStatus(e.target.value as SalesPartnerStatus)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white text-xs focus:outline-none focus:border-emerald-500"
              >
                <option value="active">{t('sales.developer.statusActive', undefined, 'Active')}</option>
                <option value="suspended">{t('sales.developer.statusSuspended', undefined, 'Suspended')}</option>
                <option value="pending">{t('sales.developer.statusPending', undefined, 'Pending')}</option>
                <option value="rejected">{t('sales.developer.statusRejected', undefined, 'Rejected')}</option>
              </select>
            </div>

            <div>
              <label className="block text-slate-400 mb-1 font-medium">
                {t('sales.developer.reasonLabel', undefined, 'Reason')} {(targetStatus === 'suspended' || targetStatus === 'rejected') && t('common.requiredParen', undefined, '(Required)')}
              </label>
              <textarea
                value={statusReason}
                onChange={(e) => setStatusReason(e.target.value)}
                placeholder={t('sales.developer.statusReasonPlaceholder', undefined, 'Reason for changing partner status...')}
                rows={2}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white text-xs focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block text-slate-400 mb-1 font-medium">{t('sales.developer.adminNotesLabel', undefined, 'Admin Notes (Internal)')}</label>
              <textarea
                value={statusAdminNotes}
                onChange={(e) => setStatusAdminNotes(e.target.value)}
                placeholder={t('sales.developer.adminNotesPlaceholder', undefined, 'Internal notes visible to admins...')}
                rows={2}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white text-xs focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setStatusTargetPartner(null)}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg"
              >
                {t('common.cancel', undefined, 'Cancel')}
              </button>
              <button
                type="submit"
                disabled={updatingStatus}
                className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-lg disabled:opacity-50"
              >
                {updatingStatus ? t('sales.developer.updating', undefined, 'Updating...') : t('common.confirm', undefined, 'Confirm')}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Rates Modal */}
      {ratesTargetPartner && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleRatesSubmit}
            className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full shadow-2xl p-5 space-y-4 text-xs"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Percent className="w-4 h-4 text-amber-400" />
                <h2 className="text-sm font-bold text-white">{t('sales.developer.adjustRatesTitle')}</h2>
              </div>
              <button
                type="button"
                onClick={() => setRatesTargetPartner(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-slate-400 text-[11px]">
              Set custom commission percentages for{' '}
              <strong className="text-white">{ratesTargetPartner.user?.name}</strong>. Leave empty to use default
              platform rates (10% first order, 5% repeat order).
            </p>

            <div className="space-y-3">
              <div>
                <label className="block text-slate-300 mb-1 font-medium">{t('sales.developer.firstOrderRateLabel')}</label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  placeholder="e.g. 10 for 10%"
                  value={firstOrderRate}
                  onChange={(e) => setFirstOrderRate(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white text-xs focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 mb-1 font-medium">{t('sales.developer.repeatOrderRateLabel')}</label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  placeholder="e.g. 8 for 8%"
                  value={repeatOrderRate}
                  onChange={(e) => setRepeatOrderRate(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white text-xs focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 mb-1 font-medium">{t('sales.developer.customRateLabel')}</label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  placeholder="e.g. 12"
                  value={customRate}
                  onChange={(e) => setCustomRate(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white text-xs focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 mb-1 font-medium">{t('sales.developer.reasonLabel')}</label>
                <textarea
                  value={ratesReason}
                  onChange={(e) => setRatesReason(e.target.value)}
                  placeholder="Reason for special rate agreement..."
                  rows={2}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white text-xs focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setRatesTargetPartner(null)}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg"
              >
                {t('sales.commissions.cancel')}
              </button>
              <button
                type="submit"
                disabled={updatingRates}
                className="px-4 py-1.5 bg-amber-600 hover:bg-amber-500 text-white font-medium rounded-lg disabled:opacity-50"
              >
                {updatingRates ? t('sales.developer.saving') : t('sales.developer.saveRates')}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
