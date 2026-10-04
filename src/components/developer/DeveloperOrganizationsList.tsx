import React, { useState, useEffect, useMemo } from 'react';
import { useLocalization } from '../../context/LocalizationContext';
import { navigateTo } from '../../hooks/useRouteContext';
import { apiFetch } from '../../lib/api';
import {
  Building2,
  Search,
  Users,
  Calendar,
  Wallet,
  ArrowUpRight,
  RefreshCw,
  AlertTriangle,
  ChevronRight,
  Coins,
  ShieldAlert,
  Sparkles,
  Layers,
} from 'lucide-react';

export interface DeveloperOrgItem {
  id: string;
  name: string;
  slug: string;
  owner_id: string;
  owner_name: string;
  owner_email: string;
  logo_url: string | null;
  member_count: number;
  event_count: number;
  paid_balance: number;
  event_credit_balance: number;
  total_wallet_value: number;
  created_at: string;
}

export function formatCurrency(amount: number | string | undefined | null, currency = 'MYR'): string {
  const num = Number(amount || 0);
  return `${currency === 'MYR' ? 'RM' : currency} ${num.toLocaleString('en-MY', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export const DeveloperOrganizationsList: React.FC = () => {
  const { t } = useLocalization();
  const [organizations, setOrganizations] = useState<DeveloperOrgItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');

  const fetchOrganizations = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch('/api/developer/organizations');
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Failed to fetch organizations (${res.status})`);
      }
      const data = await res.json();
      setOrganizations(data.organizations || []);
    } catch (err: any) {
      console.error('Error loading developer organizations:', err);
      setError(err.message || 'Failed to load organizations. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrganizations();
  }, []);

  const filteredOrgs = useMemo(() => {
    if (!searchQuery.trim()) return organizations;
    const q = searchQuery.toLowerCase().trim();
    return organizations.filter(
      (org) =>
        org.name?.toLowerCase().includes(q) ||
        org.slug?.toLowerCase().includes(q) ||
        org.owner_name?.toLowerCase().includes(q) ||
        org.owner_email?.toLowerCase().includes(q)
    );
  }, [organizations, searchQuery]);

  // Aggregate stats across all organizations
  const stats = useMemo(() => {
    const totalOrgs = organizations.length;
    const totalPaid = organizations.reduce((acc, o) => acc + (Number(o.paid_balance) || 0), 0);
    const totalCredits = organizations.reduce((acc, o) => acc + (Number(o.event_credit_balance) || 0), 0);
    const totalValue = organizations.reduce((acc, o) => acc + (Number(o.total_wallet_value) || 0), 0);
    const totalEvents = organizations.reduce((acc, o) => acc + (Number(o.event_count) || 0), 0);

    return { totalOrgs, totalPaid, totalCredits, totalValue, totalEvents };
  }, [organizations]);

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
        <div className="space-y-1">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/30">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight flex items-center space-x-2">
                <span>{t('developer.organizationsTitle')}</span>
                {!loading && (
                  <span className="text-xs font-mono font-medium px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    {organizations.length} {organizations.length === 1 ? 'org' : 'orgs'}
                  </span>
                )}
              </h1>
              <p className="text-xs sm:text-sm text-slate-400">
                {t('developer.orgsManagementDesc')}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={fetchOrganizations}
            disabled={loading}
            className="flex items-center space-x-2 px-3.5 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 text-xs font-semibold rounded-xl border border-slate-700 transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>{t('common.refresh')}</span>
          </button>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-900/80 border border-slate-800/80 rounded-2xl p-4">
          <span className="text-[11px] font-medium text-slate-400 block mb-1">{t('developer.totalWorkspaces')}</span>
          <div className="text-xl sm:text-2xl font-bold text-white font-mono">
            {loading ? '-' : stats.totalOrgs}
          </div>
          <span className="text-[10px] text-slate-500 mt-1 block">{t('developer.activePlatformTenants', undefined, 'Active platform tenants')}</span>
        </div>

        <div className="bg-slate-900/80 border border-slate-800/80 rounded-2xl p-4">
          <span className="text-[11px] font-medium text-slate-400 block mb-1">{t('developer.platformPaidBalances', undefined, 'Platform Paid Balances')}</span>
          <div className="text-xl sm:text-2xl font-bold text-emerald-400 font-mono">
            {loading ? '-' : formatCurrency(stats.totalPaid)}
          </div>
          <span className="text-[10px] text-slate-500 mt-1 block">{t('developer.depositedCashFunds', undefined, 'Deposited cash funds')}</span>
        </div>

        <div className="bg-slate-900/80 border border-slate-800/80 rounded-2xl p-4">
          <span className="text-[11px] font-medium text-slate-400 block mb-1">{t('developer.totalEventCredits', undefined, 'Total Event Credits')}</span>
          <div className="text-xl sm:text-2xl font-bold text-cyan-400 font-mono">
            {loading ? '-' : formatCurrency(stats.totalCredits)}
          </div>
          <span className="text-[10px] text-slate-500 mt-1 block">{t('developer.totalEventCreditsSub', undefined, 'Welcome + Showcase + Top-up credits')}</span>
        </div>

        <div className="bg-slate-900/80 border border-slate-800/80 rounded-2xl p-4">
          <span className="text-[11px] font-medium text-slate-400 block mb-1">{t('developer.totalWalletValue', undefined, 'Total Wallet Value')}</span>
          <div className="text-xl sm:text-2xl font-bold text-amber-400 font-mono">
            {loading ? '-' : formatCurrency(stats.totalValue)}
          </div>
          <span className="text-[10px] text-slate-500 mt-1 block">{t('developer.totalEventsCreated', { count: stats.totalEvents }, `${stats.totalEvents} total events created`)}</span>
        </div>
      </div>

      {/* Search & Filter Toolbar */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('developer.searchOrgsFullPlaceholder', undefined, 'Search by organization name, owner name, owner email, or slug...')}
            className="w-full pl-10 pr-4 py-2.5 bg-slate-950 border border-slate-800 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 rounded-xl text-xs text-slate-100 placeholder-slate-500 transition-colors"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-200 px-1.5 py-0.5 rounded bg-slate-800"
            >
              {t('common.clear', undefined, 'Clear')}
            </button>
          )}
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="bg-rose-950/40 border border-rose-800/60 rounded-2xl p-4 text-rose-200 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
            <span className="text-xs font-medium">{error}</span>
          </div>
          <button
            onClick={fetchOrganizations}
            className="px-3 py-1 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 text-xs font-semibold rounded-lg border border-rose-500/30 transition-colors cursor-pointer"
          >
            {t('common.retry', undefined, 'Retry')}
          </button>
        </div>
      )}

      {/* Main Table View */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        {loading ? (
          <div className="p-6 space-y-4">
            <div className="animate-pulse flex space-x-4">
              <div className="flex-1 space-y-3 py-1">
                <div className="h-4 bg-slate-800 rounded w-3/4"></div>
                <div className="space-y-2">
                  <div className="h-8 bg-slate-800/60 rounded"></div>
                  <div className="h-8 bg-slate-800/60 rounded"></div>
                  <div className="h-8 bg-slate-800/60 rounded"></div>
                  <div className="h-8 bg-slate-800/60 rounded"></div>
                </div>
              </div>
            </div>
            <p className="text-center text-xs text-slate-500 py-4">{t('developer.loadingOrgsAndLedgers', undefined, 'Loading organizations & wallet ledgers...')}</p>
          </div>
        ) : filteredOrgs.length === 0 ? (
          <div className="text-center py-16 px-4 space-y-3">
            <div className="w-12 h-12 rounded-full bg-slate-800 text-slate-400 flex items-center justify-center mx-auto">
              <Building2 className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-bold text-white">{t('developer.noOrgsFound', undefined, 'No organizations found')}</h3>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              {searchQuery
                ? `No organizations matching "${searchQuery}". Try clearing your search.`
                : 'No registered organizations found on the platform.'}
            </p>
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="mt-2 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-xl transition-colors cursor-pointer"
              >
                {t('common.reset', undefined, 'Reset Search')}
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-950/50 text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
                  <th className="py-3.5 px-4">{t('common.organization', undefined, 'Organization')}</th>
                  <th className="py-3.5 px-4">{t('developer.owner', undefined, 'Owner')}</th>
                  <th className="py-3.5 px-4 text-center">{t('developer.members', undefined, 'Members')}</th>
                  <th className="py-3.5 px-4 text-center">{t('developer.events', undefined, 'Events')}</th>
                  <th className="py-3.5 px-4 text-right">{t('developer.paidBalance', undefined, 'Paid Balance')}</th>
                  <th className="py-3.5 px-4 text-right">{t('developer.eventCredit', undefined, 'Event Credit')}</th>
                  <th className="py-3.5 px-4 text-right">{t('developer.totalValue', undefined, 'Total Value')}</th>
                  <th className="py-3.5 px-4">{t('developer.created', undefined, 'Created')}</th>
                  <th className="py-3.5 px-4 text-center">{t('common.action', undefined, 'Action')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredOrgs.map((org) => (
                  <tr
                    key={org.id}
                    onClick={() => navigateTo(`/developer/organizations/${org.id}`)}
                    className="hover:bg-slate-800/50 transition-colors cursor-pointer group"
                  >
                    {/* Organization Column */}
                    <td className="py-3.5 px-4">
                      <div className="flex items-center space-x-3">
                        <div className="w-9 h-9 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-emerald-400 text-sm overflow-hidden shrink-0">
                          {org.logo_url ? (
                            <img
                              src={org.logo_url}
                              alt={org.name}
                              className="w-full h-full object-cover"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            org.name?.charAt(0)?.toUpperCase() || 'O'
                          )}
                        </div>
                        <div>
                          <span className="text-white font-bold group-hover:text-emerald-400 transition-colors block">
                            {org.name}
                          </span>
                          <span className="text-[11px] font-mono text-slate-400">/{org.slug}</span>
                        </div>
                      </div>
                    </td>

                    {/* Owner Column */}
                    <td className="py-3.5 px-4">
                      <div>
                        <span className="text-slate-200 font-medium block">
                          {org.owner_name || 'Unknown Owner'}
                        </span>
                        <span className="text-[11px] text-slate-400 block">{org.owner_email || '-'}</span>
                      </div>
                    </td>

                    {/* Members Count */}
                    <td className="py-3.5 px-4 text-center">
                      <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-lg bg-slate-800 text-slate-300 text-[11px] font-mono">
                        <Users className="w-3 h-3 text-slate-400" />
                        <span>{org.member_count}</span>
                      </span>
                    </td>

                    {/* Events Count */}
                    <td className="py-3.5 px-4 text-center">
                      <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-lg bg-slate-800 text-slate-300 text-[11px] font-mono">
                        <Calendar className="w-3 h-3 text-slate-400" />
                        <span>{org.event_count}</span>
                      </span>
                    </td>

                    {/* Paid Balance */}
                    <td className="py-3.5 px-4 text-right font-mono font-medium text-emerald-400">
                      {formatCurrency(org.paid_balance)}
                    </td>

                    {/* Event Credit */}
                    <td className="py-3.5 px-4 text-right font-mono font-medium text-cyan-400">
                      {formatCurrency(org.event_credit_balance)}
                    </td>

                    {/* Total Wallet Value */}
                    <td className="py-3.5 px-4 text-right font-mono font-bold text-white">
                      {formatCurrency(org.total_wallet_value)}
                    </td>

                    {/* Created Date */}
                    <td className="py-3.5 px-4 text-slate-400 text-[11px] whitespace-nowrap">
                      {org.created_at ? new Date(org.created_at).toLocaleDateString('en-MY', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      }) : '-'}
                    </td>

                    {/* Action */}
                    <td className="py-3.5 px-4 text-center">
                      <span className="inline-flex items-center space-x-1 text-slate-400 group-hover:text-emerald-400 font-semibold text-[11px]">
                        <span>{t('common.view', undefined, 'View')}</span>
                        <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
