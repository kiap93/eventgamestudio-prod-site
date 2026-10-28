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
  Clock,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Filter,
} from 'lucide-react';

export interface DeveloperOrgItem {
  id: string;
  name: string;
  slug: string;
  owner_id: string;
  owner_name: string;
  owner_email: string;
  logo_url: string | null;
  country_code?: string | null;
  member_count: number;
  event_count: number;
  paid_balance: number;
  event_credit_balance: number;
  total_wallet_value: number;
  last_login_at?: string | null;
  last_login_user_id?: string | null;
  last_login_user_name?: string | null;
  last_login_user_email?: string | null;
  created_at: string;
}

export type ActivityFilter = 'all' | 'never' | 'inactive_7d' | 'inactive_30d' | 'inactive_60d';
export type SortField = 'last_login_at' | 'created_at' | 'name' | 'paid_balance' | 'total_wallet_value';
export type SortDirection = 'asc' | 'desc';

export function formatCurrency(amount: number | string | undefined | null, currency = 'MYR'): string {
  const num = Number(amount || 0);
  return `${currency === 'MYR' ? 'RM' : currency} ${num.toLocaleString('en-MY', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatLastLoginDate(dateStr?: string | null): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return '';
  return date.toLocaleString('en-MY', {
    timeZone: 'Asia/Singapore',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export const DeveloperOrganizationsList: React.FC = () => {
  const { t } = useLocalization();
  const [organizations, setOrganizations] = useState<DeveloperOrgItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>('all');
  const [sortField, setSortField] = useState<SortField>('last_login_at');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

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

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  // Activity filter bucket counts
  const activityCounts = useMemo(() => {
    const now = Date.now();
    let never = 0;
    let inactive7d = 0;
    let inactive30d = 0;
    let inactive60d = 0;

    for (const org of organizations) {
      if (!org.last_login_at) {
        never++;
        inactive7d++;
        inactive30d++;
        inactive60d++;
      } else {
        const diff = now - new Date(org.last_login_at).getTime();
        if (diff > 7 * 86400 * 1000) inactive7d++;
        if (diff > 30 * 86400 * 1000) inactive30d++;
        if (diff > 60 * 86400 * 1000) inactive60d++;
      }
    }
    return { never, inactive7d, inactive30d, inactive60d };
  }, [organizations]);

  const filteredOrgs = useMemo(() => {
    let list = organizations;

    // 1. Search Query filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (org) =>
          org.name?.toLowerCase().includes(q) ||
          org.slug?.toLowerCase().includes(q) ||
          org.owner_name?.toLowerCase().includes(q) ||
          org.owner_email?.toLowerCase().includes(q) ||
          org.last_login_user_name?.toLowerCase().includes(q) ||
          org.last_login_user_email?.toLowerCase().includes(q)
      );
    }

    // 2. Activity status filter
    if (activityFilter !== 'all') {
      const now = Date.now();
      list = list.filter((org) => {
        if (activityFilter === 'never') {
          return !org.last_login_at;
        }
        if (!org.last_login_at) return true;
        const diff = now - new Date(org.last_login_at).getTime();
        if (activityFilter === 'inactive_7d') return diff > 7 * 86400 * 1000;
        if (activityFilter === 'inactive_30d') return diff > 30 * 86400 * 1000;
        if (activityFilter === 'inactive_60d') return diff > 60 * 86400 * 1000;
        return true;
      });
    }

    // 3. Sorting
    return [...list].sort((a, b) => {
      if (sortField === 'last_login_at') {
        const timeA = a.last_login_at ? new Date(a.last_login_at).getTime() : 0;
        const timeB = b.last_login_at ? new Date(b.last_login_at).getTime() : 0;
        if (sortDirection === 'desc') {
          return timeB - timeA;
        } else {
          return timeA - timeB;
        }
      }
      if (sortField === 'created_at') {
        const timeA = new Date(a.created_at).getTime();
        const timeB = new Date(b.created_at).getTime();
        return sortDirection === 'desc' ? timeB - timeA : timeA - timeB;
      }
      if (sortField === 'name') {
        const comp = (a.name || '').localeCompare(b.name || '');
        return sortDirection === 'desc' ? -comp : comp;
      }
      if (sortField === 'paid_balance') {
        const balA = Number(a.paid_balance) || 0;
        const balB = Number(b.paid_balance) || 0;
        return sortDirection === 'desc' ? balB - balA : balA - balB;
      }
      if (sortField === 'total_wallet_value') {
        const valA = Number(a.total_wallet_value) || 0;
        const valB = Number(b.total_wallet_value) || 0;
        return sortDirection === 'desc' ? valB - valA : valA - valB;
      }
      return 0;
    });
  }, [organizations, searchQuery, activityFilter, sortField, sortDirection]);

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
                <span>{t('developer.organizationsTitle', undefined, 'Platform Workspaces')}</span>
                {!loading && (
                  <span className="text-xs font-mono font-medium px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    {organizations.length} {organizations.length === 1 ? 'org' : 'orgs'}
                  </span>
                )}
              </h1>
              <p className="text-xs sm:text-sm text-slate-400">
                {t('developer.orgsManagementDesc', undefined, 'Manage organizations, member activity, wallet balances, and lifecycle.')}
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
            <span>{t('common.refresh', undefined, 'Refresh')}</span>
          </button>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-900/80 border border-slate-800/80 rounded-2xl p-4">
          <span className="text-[11px] font-medium text-slate-400 block mb-1">{t('developer.totalWorkspaces', undefined, 'Total Workspaces')}</span>
          <div className="text-xl sm:text-2xl font-bold text-white font-mono">
            {loading ? '-' : stats.totalOrgs}
          </div>
          <span className="text-[10px] text-slate-500 mt-1 block">
            {activityCounts.never} never logged in
          </span>
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
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
        <div className="flex flex-col md:flex-row md:items-center gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('developer.searchOrgsFullPlaceholder', undefined, 'Search by organization name, owner, login member, or slug...')}
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

          {/* Activity Filters Dropdown */}
          <div className="flex items-center space-x-2 shrink-0">
            <Filter className="w-4 h-4 text-slate-400" />
            <select
              value={activityFilter}
              onChange={(e) => setActivityFilter(e.target.value as ActivityFilter)}
              className="bg-slate-950 border border-slate-800 text-slate-200 text-xs rounded-xl px-3 py-2.5 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors cursor-pointer"
            >
              <option value="all">All Activity ({organizations.length})</option>
              <option value="never">Never Logged In ({activityCounts.never})</option>
              <option value="inactive_7d">Inactive &gt; 7 Days ({activityCounts.inactive7d})</option>
              <option value="inactive_30d">Inactive &gt; 30 Days ({activityCounts.inactive30d})</option>
              <option value="inactive_60d">Inactive &gt; 60 Days ({activityCounts.inactive60d})</option>
            </select>

            {activityFilter !== 'all' && (
              <button
                onClick={() => setActivityFilter('all')}
                className="px-2.5 py-2 text-xs font-semibold text-slate-400 hover:text-white bg-slate-800 rounded-xl border border-slate-700 transition-colors"
                title="Reset activity filter"
              >
                Reset
              </button>
            )}
          </div>
        </div>

        {activityFilter !== 'all' && (
          <div className="flex items-center space-x-2 pt-1 text-xs text-slate-400">
            <span className="text-slate-500">Active filter:</span>
            <span className="inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono text-[11px]">
              <span>
                {activityFilter === 'never' && 'Never Logged In'}
                {activityFilter === 'inactive_7d' && 'Inactive > 7 Days'}
                {activityFilter === 'inactive_30d' && 'Inactive > 30 Days'}
                {activityFilter === 'inactive_60d' && 'Inactive > 60 Days'}
              </span>
              <button
                onClick={() => setActivityFilter('all')}
                className="hover:text-white ml-1 font-bold"
              >
                ×
              </button>
            </span>
            <span className="text-[11px] text-slate-500">
              Showing {filteredOrgs.length} of {organizations.length} workspaces
            </span>
          </div>
        )}
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
              {searchQuery || activityFilter !== 'all'
                ? 'No organizations match the selected search or activity filter.'
                : 'No registered organizations found on the platform.'}
            </p>
            {(searchQuery || activityFilter !== 'all') && (
              <button
                onClick={() => {
                  setSearchQuery('');
                  setActivityFilter('all');
                }}
                className="mt-2 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-xl transition-colors cursor-pointer"
              >
                {t('common.reset', undefined, 'Reset Filters')}
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-950/50 text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
                  <th
                    className="py-3.5 px-4 cursor-pointer select-none hover:text-white transition-colors"
                    onClick={() => handleSort('name')}
                  >
                    <div className="flex items-center space-x-1">
                      <span>{t('common.organization', undefined, 'Organization')}</span>
                      {sortField === 'name' ? (
                        sortDirection === 'desc' ? <ArrowDown className="w-3 h-3 text-emerald-400" /> : <ArrowUp className="w-3 h-3 text-emerald-400" />
                      ) : (
                        <ArrowUpDown className="w-3 h-3 text-slate-600" />
                      )}
                    </div>
                  </th>
                  <th className="py-3.5 px-4">{t('developer.owner', undefined, 'Owner')}</th>
                  <th className="py-3.5 px-4 text-center">{t('developer.members', undefined, 'Members')}</th>
                  <th className="py-3.5 px-4 text-center">{t('developer.events', undefined, 'Events')}</th>
                  <th
                    className="py-3.5 px-4 text-right cursor-pointer select-none hover:text-white transition-colors"
                    onClick={() => handleSort('paid_balance')}
                  >
                    <div className="flex items-center justify-end space-x-1">
                      <span>{t('developer.paidBalance', undefined, 'Paid Balance')}</span>
                      {sortField === 'paid_balance' ? (
                        sortDirection === 'desc' ? <ArrowDown className="w-3 h-3 text-emerald-400" /> : <ArrowUp className="w-3 h-3 text-emerald-400" />
                      ) : (
                        <ArrowUpDown className="w-3 h-3 text-slate-600" />
                      )}
                    </div>
                  </th>
                  <th className="py-3.5 px-4 text-right">{t('developer.eventCredit', undefined, 'Event Credit')}</th>
                  <th
                    className="py-3.5 px-4 text-right cursor-pointer select-none hover:text-white transition-colors"
                    onClick={() => handleSort('total_wallet_value')}
                  >
                    <div className="flex items-center justify-end space-x-1">
                      <span>{t('developer.totalValue', undefined, 'Total Value')}</span>
                      {sortField === 'total_wallet_value' ? (
                        sortDirection === 'desc' ? <ArrowDown className="w-3 h-3 text-emerald-400" /> : <ArrowUp className="w-3 h-3 text-emerald-400" />
                      ) : (
                        <ArrowUpDown className="w-3 h-3 text-slate-600" />
                      )}
                    </div>
                  </th>
                  {/* Sortable Last Login Column */}
                  <th
                    className="py-3.5 px-4 cursor-pointer select-none hover:text-white transition-colors"
                    onClick={() => handleSort('last_login_at')}
                  >
                    <div className="flex items-center space-x-1">
                      <span>{t('developer.lastLogin', undefined, 'Last Login')}</span>
                      {sortField === 'last_login_at' ? (
                        sortDirection === 'desc' ? <ArrowDown className="w-3.5 h-3.5 text-emerald-400" /> : <ArrowUp className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <ArrowUpDown className="w-3.5 h-3.5 text-slate-500" />
                      )}
                    </div>
                  </th>
                  <th
                    className="py-3.5 px-4 cursor-pointer select-none hover:text-white transition-colors"
                    onClick={() => handleSort('created_at')}
                  >
                    <div className="flex items-center space-x-1">
                      <span>{t('developer.created', undefined, 'Created')}</span>
                      {sortField === 'created_at' ? (
                        sortDirection === 'desc' ? <ArrowDown className="w-3 h-3 text-emerald-400" /> : <ArrowUp className="w-3 h-3 text-emerald-400" />
                      ) : (
                        <ArrowUpDown className="w-3 h-3 text-slate-600" />
                      )}
                    </div>
                  </th>
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

                    {/* Last Login Column */}
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      {org.last_login_at ? (
                        <div className="space-y-0.5">
                          <div className="flex items-center space-x-1.5 text-slate-200 font-mono text-[11px]">
                            <Clock className="w-3 h-3 text-emerald-400 shrink-0" />
                            <span>{formatLastLoginDate(org.last_login_at)}</span>
                          </div>
                          {(org.last_login_user_name || org.last_login_user_email) && (
                            <div
                              className="text-[10px] text-slate-400 truncate max-w-[140px]"
                              title={org.last_login_user_email || undefined}
                            >
                              by {org.last_login_user_name || org.last_login_user_email}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full bg-slate-800/80 text-slate-400 border border-slate-700/60 font-mono text-[10px]">
                          <Clock className="w-2.5 h-2.5 text-slate-500" />
                          <span>Never logged in</span>
                        </span>
                      )}
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
