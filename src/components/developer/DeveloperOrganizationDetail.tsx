import React, { useState, useEffect } from 'react';
import { navigateTo } from '../../hooks/useRouteContext';
import { apiFetch } from '../../lib/api';
import {
  Building2,
  ArrowLeft,
  Users,
  Calendar,
  Wallet,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  ShieldAlert,
  Coins,
  Sparkles,
  Layers,
  ArrowUpRight,
  ArrowDownLeft,
  FileText,
  Clock,
  UserCheck,
  Tag,
  ExternalLink,
  ShieldCheck,
} from 'lucide-react';
import { formatCurrency } from './DeveloperOrganizationsList';

export interface OrgDetailData {
  organization: {
    id: string;
    name: string;
    slug: string;
    owner_id: string;
    logo_url: string | null;
    created_at: string;
    updated_at: string;
  };
  owner: {
    id: string;
    name: string;
    email: string;
    avatar_url: string | null;
  } | null;
  members: Array<{
    id: string;
    user_id: string;
    role: string;
    name?: string;
    email?: string;
    avatar_url?: string | null;
    user_name?: string;
    user_email?: string;
    user_avatar?: string | null;
    created_at: string;
  }>;
  wallet: {
    organization_id: string;
    currency: string;
    paid_balance: number;
    welcome_credit: number;
    showcase_credit: number;
    topup_credit: number;
    total_balance: number;
    total_credit: number;
    welcome_credit_granted: boolean;
    showcase_credit_granted: boolean;
    can_use_welcome_credit: boolean;
    can_use_showcase_credit: boolean;
    updated_at: string;
  };
  events: Array<{
    id: string;
    title: string;
    game_type: string;
    status: string;
    event_price: number;
    event_currency: string;
    public_token: string;
    created_at: string;
    theme_name?: string;
  }>;
  recent_transactions: Array<{
    id: string;
    type: string;
    category?: string;
    amount: number;
    currency: string;
    balance_after: number;
    paid_balance_after?: number;
    credit_balance_after?: number;
    reference_id?: string;
    description?: string;
    notes?: string;
    created_at: string;
  }>;
}

interface Props {
  orgId: string;
}

export const DeveloperOrganizationDetail: React.FC<Props> = ({ orgId }) => {
  const [data, setData] = useState<OrgDetailData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [recalculating, setRecalculating] = useState<boolean>(false);
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'members' | 'events' | 'transactions'>('overview');

  const fetchOrganizationDetail = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/developer/organizations/${orgId}`);
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Failed to fetch organization details (${res.status})`);
      }
      const json = await res.json();
      setData(json);
    } catch (err: any) {
      console.error('Error fetching org detail:', err);
      setError(err.message || 'Failed to load organization');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (orgId) {
      fetchOrganizationDetail();
    }
  }, [orgId]);

  const handleRecalculateWallet = async () => {
    if (!orgId || recalculating) return;
    setRecalculating(true);
    setActionMessage(null);
    try {
      const res = await apiFetch(`/api/developer/organizations/${orgId}/wallet/recalculate`, {
        method: 'POST',
      });
      const resJson = await res.json();
      if (!res.ok) {
        throw new Error(resJson.error || 'Failed to recalculate wallet balances');
      }

      setActionMessage({
        type: 'success',
        text: resJson.message || 'Wallet balances successfully verified and synchronized with ledger.',
      });

      // Refresh data
      await fetchOrganizationDetail();
    } catch (err: any) {
      console.error('Recalculate error:', err);
      setActionMessage({
        type: 'error',
        text: err.message || 'Error occurred while recalculating wallet balance.',
      });
    } finally {
      setRecalculating(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center space-x-3 text-slate-400 text-xs">
          <button
            onClick={() => navigateTo('/developer/organizations')}
            className="flex items-center space-x-1 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Organizations</span>
          </button>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center space-y-4">
          <RefreshCw className="w-8 h-8 text-emerald-400 animate-spin mx-auto" />
          <p className="text-xs text-slate-400">Loading organization details and ledger...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="space-y-6">
        <div className="flex items-center space-x-3 text-slate-400 text-xs">
          <button
            onClick={() => navigateTo('/developer/organizations')}
            className="flex items-center space-x-1 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Organizations</span>
          </button>
        </div>
        <div className="bg-rose-950/40 border border-rose-800/60 rounded-2xl p-6 text-rose-200 space-y-4">
          <div className="flex items-center space-x-3">
            <AlertTriangle className="w-6 h-6 text-rose-400 shrink-0" />
            <div>
              <h3 className="text-sm font-bold text-white">Error Loading Organization</h3>
              <p className="text-xs text-rose-300">{error || 'Organization not found'}</p>
            </div>
          </div>
          <button
            onClick={fetchOrganizationDetail}
            className="px-4 py-2 bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 text-xs font-semibold rounded-xl border border-rose-500/30 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const { organization, owner, members, wallet, events, recent_transactions } = data;

  return (
    <div className="space-y-6">
      {/* Navigation Breadcrumb */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigateTo('/developer/organizations')}
          className="flex items-center space-x-1.5 text-xs text-slate-400 hover:text-white transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Organizations List</span>
        </button>

        <span className="text-[11px] font-mono text-slate-400">ID: {organization.id}</span>
      </div>

      {/* Action Notification Message */}
      {actionMessage && (
        <div
          className={`p-4 rounded-2xl border flex items-center justify-between text-xs ${
            actionMessage.type === 'success'
              ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-200'
              : 'bg-rose-950/40 border-rose-800/60 text-rose-200'
          }`}
        >
          <div className="flex items-center space-x-2.5">
            {actionMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            )}
            <span>{actionMessage.text}</span>
          </div>
          <button
            onClick={() => setActionMessage(null)}
            className="text-xs opacity-70 hover:opacity-100 ml-4 font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {/* Main Info Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-start sm:items-center space-x-4">
            <div className="w-16 h-16 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-2xl text-emerald-400 overflow-hidden shrink-0 shadow-lg">
              {organization.logo_url ? (
                <img
                  src={organization.logo_url}
                  alt={organization.name}
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                organization.name?.charAt(0)?.toUpperCase() || 'O'
              )}
            </div>

            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
                  {organization.name}
                </h1>
                <span className="px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-300 text-xs font-mono border border-slate-700">
                  /{organization.slug}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-4 text-xs text-slate-400">
                <div className="flex items-center space-x-1.5">
                  <UserCheck className="w-3.5 h-3.5 text-emerald-400" />
                  <span>
                    Owner:{' '}
                    <strong className="text-slate-200">{owner?.name || 'Unknown'}</strong> (
                    {owner?.email || '-'})
                  </span>
                </div>
                <div className="flex items-center space-x-1.5">
                  <Clock className="w-3.5 h-3.5 text-slate-500" />
                  <span>
                    Created:{' '}
                    {organization.created_at
                      ? new Date(organization.created_at).toLocaleDateString('en-MY', {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                        })
                      : '-'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Top Actions */}
          <div className="flex items-center space-x-3">
            <button
              onClick={handleRecalculateWallet}
              disabled={recalculating}
              className="flex items-center space-x-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-slate-950 font-bold text-xs rounded-xl shadow-lg shadow-emerald-950/40 transition-all cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${recalculating ? 'animate-spin' : ''}`} />
              <span>{recalculating ? 'Recalculating...' : 'Recalculate Wallet'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Wallet Breakdown Section */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-4">
          <div className="flex items-center space-x-2.5">
            <Wallet className="w-5 h-5 text-emerald-400" />
            <h2 className="text-base font-bold text-white">Wallet & Ledger Balances</h2>
          </div>
          <span className="text-[11px] text-slate-400 font-mono">
            Last Synced: {new Date(wallet.updated_at || Date.now()).toLocaleTimeString()}
          </span>
        </div>

        {/* Financial Immutability Notice */}
        <div className="bg-slate-950 border border-slate-800/80 rounded-xl p-3.5 flex items-start space-x-3 text-[11px] text-slate-400">
          <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold text-slate-300">Financial Integrity Guard: </span>
            Balances cannot be manually overridden. All balances are verified against the immutable ledger
            (<code className="text-emerald-400 font-mono text-[10px]">wallet_transactions</code>). Use
            recalculation to synchronize cache if required.
          </div>
        </div>

        {/* 5-Card Wallet Breakdown */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {/* Total Value */}
          <div className="col-span-2 sm:col-span-1 bg-slate-950/80 border border-emerald-500/30 rounded-xl p-3.5">
            <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider block mb-1">
              Total Wallet Value
            </span>
            <div className="text-xl font-black text-white font-mono">
              {formatCurrency(wallet.total_balance, wallet.currency)}
            </div>
            <span className="text-[10px] text-slate-400 mt-1 block">Paid + All Event Credits</span>
          </div>

          {/* Paid Cash */}
          <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3.5">
            <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider block mb-1">
              Paid Balance
            </span>
            <div className="text-lg font-bold text-emerald-400 font-mono">
              {formatCurrency(wallet.paid_balance, wallet.currency)}
            </div>
            <span className="text-[10px] text-slate-500 mt-1 block">Deposited cash balance</span>
          </div>

          {/* Welcome Credit */}
          <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3.5">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">
                Welcome Credit
              </span>
              <span
                className={`text-[9px] px-1.5 py-0.2 rounded font-mono ${
                  wallet.welcome_credit_granted
                    ? 'bg-emerald-500/10 text-emerald-400'
                    : 'bg-slate-800 text-slate-400'
                }`}
              >
                {wallet.welcome_credit_granted ? 'Granted' : 'Pending'}
              </span>
            </div>
            <div className="text-lg font-bold text-cyan-400 font-mono">
              {formatCurrency(wallet.welcome_credit, wallet.currency)}
            </div>
            <span className="text-[10px] text-slate-500 mt-1 block">RM800 for 1st event</span>
          </div>

          {/* Showcase Credit */}
          <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3.5">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">
                Showcase Credit
              </span>
              <span
                className={`text-[9px] px-1.5 py-0.2 rounded font-mono ${
                  wallet.showcase_credit_granted
                    ? 'bg-amber-500/10 text-amber-400'
                    : 'bg-slate-800 text-slate-400'
                }`}
              >
                {wallet.showcase_credit_granted ? 'Granted' : 'None'}
              </span>
            </div>
            <div className="text-lg font-bold text-amber-400 font-mono">
              {formatCurrency(wallet.showcase_credit, wallet.currency)}
            </div>
            <span className="text-[10px] text-slate-500 mt-1 block">RM300 review reward</span>
          </div>

          {/* Top-up Credit */}
          <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3.5">
            <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider block mb-1">
              Top-up Bonus Credit
            </span>
            <div className="text-lg font-bold text-purple-400 font-mono">
              {formatCurrency(wallet.topup_credit, wallet.currency)}
            </div>
            <span className="text-[10px] text-slate-500 mt-1 block">Deposit bonus credits</span>
          </div>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="flex items-center space-x-2 border-b border-slate-800 pb-1">
        <button
          onClick={() => setActiveTab('overview')}
          className={`px-4 py-2 text-xs font-bold rounded-xl transition-colors cursor-pointer ${
            activeTab === 'overview'
              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Overview Summary
        </button>

        <button
          onClick={() => setActiveTab('members')}
          className={`flex items-center space-x-1.5 px-4 py-2 text-xs font-bold rounded-xl transition-colors cursor-pointer ${
            activeTab === 'members'
              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Users className="w-3.5 h-3.5" />
          <span>Members ({members.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('events')}
          className={`flex items-center space-x-1.5 px-4 py-2 text-xs font-bold rounded-xl transition-colors cursor-pointer ${
            activeTab === 'events'
              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Calendar className="w-3.5 h-3.5" />
          <span>Events ({events.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('transactions')}
          className={`flex items-center space-x-1.5 px-4 py-2 text-xs font-bold rounded-xl transition-colors cursor-pointer ${
            activeTab === 'transactions'
              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <FileText className="w-3.5 h-3.5" />
          <span>Ledger Transactions ({recent_transactions.length})</span>
        </button>
      </div>

      {/* Tab 1: Overview Summary */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Quick Members Preview */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Users className="w-4 h-4 text-emerald-400" />
                <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                  Organization Members ({members.length})
                </h3>
              </div>
              <button
                onClick={() => setActiveTab('members')}
                className="text-xs text-emerald-400 hover:underline font-medium"
              >
                View all
              </button>
            </div>

            <div className="divide-y divide-slate-800">
              {members.slice(0, 5).map((m) => {
                const memberName = (m.name || m.user_name || '').trim() || (m.email || m.user_email ? (m.email || m.user_email)!.split('@')[0] : 'Team Member');
                const memberEmail = m.email || m.user_email || '-';
                const memberAvatar = m.avatar_url || m.user_avatar;
                const initial = memberName.charAt(0).toUpperCase() || 'U';

                return (
                  <div key={m.id} className="py-2.5 flex items-center justify-between text-xs">
                    <div className="flex items-center space-x-2.5">
                      <div className="w-7 h-7 rounded-full bg-slate-800 text-slate-300 flex items-center justify-center font-bold text-[11px] overflow-hidden shrink-0">
                        {memberAvatar ? (
                          <img
                            src={memberAvatar}
                            alt={memberName}
                            className="w-full h-full object-cover"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          initial
                        )}
                      </div>
                      <div className="min-w-0">
                        <span className="text-slate-200 font-semibold block truncate">{memberName}</span>
                        <span className="text-[10px] text-slate-400 block truncate">{memberEmail}</span>
                      </div>
                    </div>
                    <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-mono text-[10px] uppercase shrink-0">
                      {m.role}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Quick Events Preview */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Calendar className="w-4 h-4 text-cyan-400" />
                <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                  Recent Events ({events.length})
                </h3>
              </div>
              <button
                onClick={() => setActiveTab('events')}
                className="text-xs text-cyan-400 hover:underline font-medium"
              >
                View all
              </button>
            </div>

            {events.length === 0 ? (
              <p className="text-xs text-slate-500 py-6 text-center">No events created yet.</p>
            ) : (
              <div className="divide-y divide-slate-800">
                {events.slice(0, 5).map((ev) => (
                  <div key={ev.id} className="py-2.5 flex items-center justify-between text-xs">
                    <div>
                      <span className="text-slate-200 font-semibold block">{ev.title}</span>
                      <span className="text-[10px] text-slate-400">
                        {ev.game_type} • {ev.created_at ? new Date(ev.created_at).toLocaleDateString() : '-'}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-white font-mono font-medium block">
                        {formatCurrency(ev.event_price, ev.event_currency)}
                      </span>
                      <span
                        className={`text-[10px] font-semibold ${
                          ev.status === 'published' || ev.status === 'active'
                            ? 'text-emerald-400'
                            : 'text-slate-400'
                        }`}
                      >
                        {ev.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 2: Members List */}
      {activeTab === 'members' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
          <div className="p-4 border-b border-slate-800 flex items-center justify-between">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">
              All Organization Members ({members.length})
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-950/50 text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
                  <th className="py-3 px-4">Member</th>
                  <th className="py-3 px-4">Email</th>
                  <th className="py-3 px-4">Role</th>
                  <th className="py-3 px-4">Joined Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {members.map((m) => {
                  const memberName = (m.name || m.user_name || '').trim() || (m.email || m.user_email ? (m.email || m.user_email)!.split('@')[0] : 'Team Member');
                  const memberEmail = m.email || m.user_email || '-';
                  const memberAvatar = m.avatar_url || m.user_avatar;
                  const initial = memberName.charAt(0).toUpperCase() || 'U';

                  return (
                    <tr key={m.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="py-3 px-4">
                        <div className="flex items-center space-x-3">
                          <div className="w-8 h-8 rounded-full bg-slate-800 text-emerald-400 font-bold flex items-center justify-center text-xs overflow-hidden shrink-0">
                            {memberAvatar ? (
                              <img
                                src={memberAvatar}
                                alt={memberName}
                                className="w-full h-full object-cover"
                                referrerPolicy="no-referrer"
                              />
                            ) : (
                              initial
                            )}
                          </div>
                          <span className="font-semibold text-white">{memberName}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-slate-300 font-mono text-[11px]">{memberEmail}</td>
                      <td className="py-3 px-4">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                            m.role === 'owner'
                              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                              : m.role === 'admin'
                              ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                              : 'bg-slate-800 text-slate-300'
                          }`}
                        >
                          {m.role}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-400 text-[11px]">
                        {m.created_at ? new Date(m.created_at).toLocaleDateString('en-MY') : '-'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 3: Events List */}
      {activeTab === 'events' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
          <div className="p-4 border-b border-slate-800 flex items-center justify-between">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">
              Organization Events ({events.length})
            </h3>
          </div>
          {events.length === 0 ? (
            <div className="p-12 text-center text-xs text-slate-500">
              No events found for this organization.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-950/50 text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
                    <th className="py-3 px-4">Event Title</th>
                    <th className="py-3 px-4">Game</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Event Price</th>
                    <th className="py-3 px-4">Created</th>
                    <th className="py-3 px-4 text-center">Public Link</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {events.map((ev) => (
                    <tr key={ev.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="py-3 px-4 font-semibold text-white">{ev.title}</td>
                      <td className="py-3 px-4 text-slate-300 font-mono text-[11px]">{ev.game_type}</td>
                      <td className="py-3 px-4">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                            ev.status === 'published' || ev.status === 'active'
                              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                              : ev.status === 'completed'
                              ? 'bg-blue-500/20 text-blue-400'
                              : 'bg-slate-800 text-slate-400'
                          }`}
                        >
                          {ev.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-medium text-emerald-400">
                        {formatCurrency(ev.event_price, ev.event_currency)}
                      </td>
                      <td className="py-3 px-4 text-slate-400 text-[11px]">
                        {ev.created_at ? new Date(ev.created_at).toLocaleDateString('en-MY') : '-'}
                      </td>
                      <td className="py-3 px-4 text-center">
                        {ev.public_token ? (
                          <a
                            href={`/e/${ev.public_token}`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center space-x-1 text-cyan-400 hover:text-cyan-300 text-[11px]"
                          >
                            <span>Open</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        ) : (
                          <span className="text-slate-600">-</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Tab 4: Ledger Transactions */}
      {activeTab === 'transactions' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
          <div className="p-4 border-b border-slate-800 flex items-center justify-between">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">
              Immutable Wallet Ledger Entries ({recent_transactions.length})
            </h3>
            <span className="text-[11px] text-slate-400 font-mono">Source of Truth</span>
          </div>

          {recent_transactions.length === 0 ? (
            <div className="p-12 text-center text-xs text-slate-500">
              No transactions recorded in wallet ledger.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-950/50 text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
                    <th className="py-3 px-4">Type / Description</th>
                    <th className="py-3 px-4 text-right">Amount</th>
                    <th className="py-3 px-4 text-right">Balance After</th>
                    <th className="py-3 px-4">Reference</th>
                    <th className="py-3 px-4">Timestamp</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {recent_transactions.map((tx) => {
                    const isCredit =
                      tx.type?.includes('credit') ||
                      tx.type?.includes('topup') ||
                      tx.type?.includes('grant') ||
                      tx.type?.includes('refund') ||
                      tx.amount > 0;

                    return (
                      <tr key={tx.id} className="hover:bg-slate-800/30 transition-colors">
                        <td className="py-3 px-4">
                          <div className="flex items-center space-x-2">
                            {isCredit ? (
                              <ArrowDownLeft className="w-4 h-4 text-emerald-400 shrink-0" />
                            ) : (
                              <ArrowUpRight className="w-4 h-4 text-rose-400 shrink-0" />
                            )}
                            <div>
                              <span className="font-bold text-slate-200 block uppercase font-mono text-[11px]">
                                {(tx.type || 'TRANSACTION').replace(/_/g, ' ')}
                              </span>
                              <span className="text-[10px] text-slate-400">
                                {tx.description || tx.notes || 'Ledger transaction'}
                              </span>
                            </div>
                          </div>
                        </td>

                        <td
                          className={`py-3 px-4 text-right font-mono font-bold ${
                            isCredit ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          {isCredit ? '+' : '-'} {formatCurrency(Math.abs(tx.amount || 0), tx.currency || 'MYR')}
                        </td>

                        <td className="py-3 px-4 text-right font-mono text-slate-300">
                          {formatCurrency(tx.balance_after || 0, tx.currency || 'MYR')}
                        </td>

                        <td className="py-3 px-4 font-mono text-[10px] text-slate-400">
                          {tx.reference_id || (tx.id ? String(tx.id).slice(0, 8) : '-')}
                        </td>

                        <td className="py-3 px-4 text-slate-400 text-[11px] whitespace-nowrap">
                          {tx.created_at ? new Date(tx.created_at).toLocaleString('en-MY') : '-'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
