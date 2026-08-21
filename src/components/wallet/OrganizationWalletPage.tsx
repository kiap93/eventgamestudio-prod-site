import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { apiFetch } from '../../lib/api';
import { WalletBalanceSummary, WalletTransactionRecord } from '../../types';
import { navigateTo } from '../../hooks/useRouteContext';
import {
  Wallet,
  Coins,
  Sparkles,
  Gift,
  Award,
  ArrowUpRight,
  ArrowDownLeft,
  RotateCcw,
  RefreshCw,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  AlertCircle,
  Building2,
  HelpCircle,
  ChevronRight,
  Info,
  Calendar,
  Plus,
} from 'lucide-react';

interface OrganizationWalletPageProps {
  onNavigateTab?: (tab: 'events' | 'customizer' | 'team' | 'wallet' | 'wallet-topup') => void;
  onNavigateToTopUp?: () => void;
}

export const OrganizationWalletPage: React.FC<OrganizationWalletPageProps> = ({
  onNavigateTab,
  onNavigateToTopUp,
}) => {
  const { currentOrganization } = useAuth();

  const [wallet, setWallet] = useState<WalletBalanceSummary | null>(null);
  const [transactions, setTransactions] = useState<WalletTransactionRecord[]>([]);
  const [totalTxns, setTotalTxns] = useState(0);
  const [isLoadingWallet, setIsLoadingWallet] = useState(true);
  const [isLoadingTxns, setIsLoadingTxns] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Filtering & Search
  const [filterType, setFilterType] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTxn, setSelectedTxn] = useState<WalletTransactionRecord | null>(null);

  // Currency Formatter
  const currencyCode = wallet?.currency || 'MYR';
  const formatCurrency = (amount?: number | null, overrideCurrency?: string) => {
    const num = Number(amount) || 0;
    const formatted = num.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    const curr = overrideCurrency || currencyCode;
    const prefix = curr === 'MYR' ? 'RM' : curr === 'USD' ? '$' : curr === 'SGD' ? 'S$' : curr;
    return `${prefix} ${formatted}`;
  };

  // Fetch Wallet Balance
  const fetchWallet = useCallback(async () => {
    if (!currentOrganization?.id) {
      setWallet(null);
      setIsLoadingWallet(false);
      return;
    }

    try {
      setIsLoadingWallet(true);
      const res = await apiFetch(`/api/organizations/${currentOrganization.id}/wallet`);
      if (res.ok) {
        const data = await res.json();
        setWallet(data.wallet || null);
      } else {
        console.error('Failed to fetch organization wallet:', await res.text());
      }
    } catch (err) {
      console.error('Wallet fetch error:', err);
    } finally {
      setIsLoadingWallet(false);
    }
  }, [currentOrganization?.id]);

  // Fetch Transaction History
  const fetchTransactions = useCallback(async () => {
    if (!currentOrganization?.id) {
      setTransactions([]);
      setTotalTxns(0);
      setIsLoadingTxns(false);
      return;
    }

    try {
      setIsLoadingTxns(true);
      let url = `/api/organizations/${currentOrganization.id}/wallet/transactions?limit=100`;
      if (filterType !== 'ALL') {
        if (filterType === 'TOPUP') {
          url += '&transaction_type=TOPUP';
        } else if (filterType === 'EVENT_PAYMENT') {
          url += '&transaction_type=EVENT_PAYMENT';
        } else if (filterType === 'CREDIT') {
          url += '&balance_type=TOPUP_CREDIT';
        }
      }

      const res = await apiFetch(url);
      if (res.ok) {
        const data = await res.json();
        setTransactions(data.transactions || []);
        setTotalTxns(data.total || (data.transactions ? data.transactions.length : 0));
      } else {
        console.error('Failed to fetch wallet transactions:', await res.text());
      }
    } catch (err) {
      console.error('Wallet transactions fetch error:', err);
    } finally {
      setIsLoadingTxns(false);
    }
  }, [currentOrganization?.id, filterType]);

  // Initial and reactive load
  useEffect(() => {
    fetchWallet();
    fetchTransactions();
  }, [fetchWallet, fetchTransactions]);

  // Listen for wallet_updated event
  useEffect(() => {
    const handleWalletUpdated = () => {
      fetchWallet();
      fetchTransactions();
    };
    window.addEventListener('wallet_updated', handleWalletUpdated);
    return () => window.removeEventListener('wallet_updated', handleWalletUpdated);
  }, [fetchWallet, fetchTransactions]);

  const handleRefreshAll = async () => {
    setIsRefreshing(true);
    await Promise.all([fetchWallet(), fetchTransactions()]);
    setIsRefreshing(false);
  };

  // Filtered transactions based on search
  const filteredTransactions = transactions.filter((txn) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return (
      (txn.description && txn.description.toLowerCase().includes(query)) ||
      (txn.reference_id && txn.reference_id.toLowerCase().includes(query)) ||
      (txn.transaction_type && txn.transaction_type.toLowerCase().includes(query)) ||
      (txn.balance_type && txn.balance_type.toLowerCase().includes(query))
    );
  });

  // Helper for Transaction display labels and styling
  const getTransactionInfo = (txn: WalletTransactionRecord) => {
    switch (txn.transaction_type) {
      case 'TOPUP':
        return {
          label: 'Wallet Top Up',
          description: txn.description || 'Organization Paid Balance Top-up',
          icon: ArrowUpRight,
          color: 'text-emerald-400',
          bg: 'bg-emerald-500/10 border-emerald-500/20',
          isCredit: true,
        };
      case 'TOPUP_CREDIT':
        return {
          label: 'Top-up Promo Bonus',
          description: txn.description || 'Promotional credit from eligible top-up',
          icon: Sparkles,
          color: 'text-cyan-400',
          bg: 'bg-cyan-500/10 border-cyan-500/20',
          isCredit: true,
        };
      case 'WELCOME_CREDIT':
        return {
          label: 'Welcome Credit Grant',
          description: txn.description || 'RM300 first-event promotional credit',
          icon: Gift,
          color: 'text-purple-400',
          bg: 'bg-purple-500/10 border-purple-500/20',
          isCredit: true,
        };
      case 'SHOWCASE_CREDIT':
        return {
          label: 'Showcase Reward Credit',
          description: txn.description || 'RM300 reward for approved marketing showcase',
          icon: Award,
          color: 'text-amber-400',
          bg: 'bg-amber-500/10 border-amber-500/20',
          isCredit: true,
        };
      case 'EVENT_PAYMENT':
      case 'CREDIT_USAGE':
        return {
          label: 'Event Deployment Payment',
          description: txn.description || 'Event launch deduction',
          icon: ArrowDownLeft,
          color: 'text-rose-400',
          bg: 'bg-rose-500/10 border-rose-500/20',
          isCredit: false,
        };
      case 'REFUND':
        return {
          label: 'Event Cancellation Refund',
          description: txn.description || '100% full refund of event paid balance',
          icon: RotateCcw,
          color: 'text-emerald-400',
          bg: 'bg-emerald-500/10 border-emerald-500/20',
          isCredit: true,
        };
      case 'CREDIT_REVERSAL':
        return {
          label: 'Credit Reversal',
          description: txn.description || 'Promotional credit reversed upon event cancellation',
          icon: RotateCcw,
          color: 'text-amber-400',
          bg: 'bg-amber-500/10 border-amber-500/20',
          isCredit: false,
        };
      case 'CREDIT_EXPIRY':
        return {
          label: 'Credit Expiry',
          description: txn.description || 'Promotional credit expired',
          icon: Clock,
          color: 'text-slate-400',
          bg: 'bg-slate-800 border-slate-700',
          isCredit: false,
        };
      case 'WITHDRAWAL':
        return {
          label: 'Wallet Withdrawal',
          description: txn.description || 'Funds withdrawal',
          icon: ArrowDownLeft,
          color: 'text-rose-400',
          bg: 'bg-rose-500/10 border-rose-500/20',
          isCredit: false,
        };
      case 'ADMIN_ADJUSTMENT':
      default:
        return {
          label: 'Ledger Adjustment',
          description: txn.description || 'Organization ledger audit adjustment',
          icon: Coins,
          color: txn.amount >= 0 ? 'text-emerald-400' : 'text-rose-400',
          bg: 'bg-slate-800 border-slate-700',
          isCredit: txn.amount >= 0,
        };
    }
  };

  const getBalanceTypeBadge = (balanceType: string) => {
    switch (balanceType) {
      case 'PAID_BALANCE':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
            <Coins className="w-3 h-3" /> Paid Balance
          </span>
        );
      case 'TOPUP_CREDIT':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">
            <Sparkles className="w-3 h-3" /> Top-up Credit
          </span>
        );
      case 'WELCOME_CREDIT':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-purple-500/10 text-purple-300 border border-purple-500/20">
            <Gift className="w-3 h-3" /> Welcome Credit
          </span>
        );
      case 'SHOWCASE_CREDIT':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-amber-500/10 text-amber-300 border border-amber-500/20">
            <Award className="w-3 h-3" /> Showcase Credit
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-slate-800 text-slate-300 border border-slate-700">
            {balanceType}
          </span>
        );
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-8 animate-in fade-in duration-300">
      {/* 1. Header & Workspace Information */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="p-2 bg-amber-500/10 rounded-xl text-amber-400 border border-amber-500/20">
              <Wallet className="w-5 h-5" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-100">
              Organization Wallet
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-slate-400 max-w-2xl">
            Real-time balance breakdown and immutable audit ledger for{' '}
            <strong className="text-slate-200">{currentOrganization?.name || 'your workspace'}</strong>.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-xs">
            <Building2 className="w-4 h-4 text-amber-400" />
            <span className="font-semibold text-slate-300 truncate max-w-[140px]">
              {currentOrganization?.name}
            </span>
            <span className="uppercase text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
              {currentOrganization?.role || 'Member'}
            </span>
          </div>

          <button
            onClick={handleRefreshAll}
            disabled={isRefreshing || isLoadingWallet}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs font-semibold text-slate-300 transition-colors cursor-pointer disabled:opacity-50"
            title="Refresh Wallet Balances"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-amber-400' : 'text-slate-400'}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
      </div>

      {/* 2. Wallet Balance Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Hero Card: Total Available Balance */}
        <div className="md:col-span-2 lg:col-span-4 bg-gradient-to-br from-slate-900 via-slate-900 to-amber-950/30 border border-amber-500/30 rounded-2xl p-6 relative overflow-hidden shadow-xl">
          <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
            <Wallet className="w-32 h-32 text-amber-400" />
          </div>

          <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-xs uppercase tracking-wider font-bold text-amber-400 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5" /> Total Available Balance
                </span>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  {currencyCode}
                </span>
              </div>
              <div className="text-3xl sm:text-5xl font-mono font-black tracking-tight text-amber-400">
                {isLoadingWallet && !wallet ? (
                  <span className="animate-pulse text-slate-600">Loading...</span>
                ) : (
                  formatCurrency(wallet?.total_balance)
                )}
              </div>
              <p className="text-xs text-slate-400 max-w-xl pt-1">
                Total usable funds across cash Paid Balance and eligible promotional credits ready for event launches.
              </p>
            </div>

            <div className="flex flex-wrap sm:flex-col items-start sm:items-end gap-2.5 shrink-0">
              <button
                onClick={() => {
                  if (onNavigateToTopUp) onNavigateToTopUp();
                  else if (onNavigateTab) onNavigateTab('wallet-topup');
                  else navigateTo('/wallet/top-up');
                }}
                className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-slate-950 font-black text-xs sm:text-sm rounded-xl shadow-lg shadow-amber-500/20 transition-all cursor-pointer transform hover:-translate-y-0.5"
              >
                <Plus className="w-4 h-4 stroke-[3]" />
                <span>Top Up Balance</span>
              </button>

              {onNavigateTab && (
                <button
                  onClick={() => onNavigateTab('events')}
                  className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs rounded-xl border border-slate-700 transition-all cursor-pointer"
                >
                  <Calendar className="w-3.5 h-3.5" />
                  <span>Deploy An Event</span>
                </button>
              )}
              <div className="text-[11px] text-slate-400 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>Standard Event Price: <strong>RM1,400</strong></span>
              </div>
            </div>
          </div>
        </div>

        {/* 2.1 Paid Balance Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3 hover:border-slate-700 transition-colors flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <Coins className="w-4 h-4" />
              </div>
              <button
                onClick={() => {
                  if (onNavigateToTopUp) onNavigateToTopUp();
                  else if (onNavigateTab) onNavigateTab('wallet-topup');
                  else navigateTo('/wallet/top-up');
                }}
                className="text-[10px] uppercase font-bold text-amber-400 hover:text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 px-2 py-0.5 rounded-full transition-colors cursor-pointer flex items-center gap-1"
              >
                <Plus className="w-3 h-3" /> Top Up
              </button>
            </div>
            <div>
              <div className="text-xs text-slate-400 font-medium">Paid Balance</div>
              <div className="text-xl sm:text-2xl font-mono font-bold text-emerald-400 mt-0.5">
                {isLoadingWallet && !wallet ? '...' : formatCurrency(wallet?.paid_balance)}
              </div>
            </div>
          </div>
          <p className="text-[11px] text-slate-400 leading-relaxed border-t border-slate-800/80 pt-2.5">
            100% refundable cash balance prior to event setup days. Usable on any event.
          </p>
        </div>

        {/* 2.2 Top-up Credit Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3 hover:border-slate-700 transition-colors">
          <div className="flex items-center justify-between">
            <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
              <Sparkles className="w-4 h-4" />
            </div>
            <span className="text-[10px] uppercase font-bold text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded-full">
              5%–7% Promo
            </span>
          </div>
          <div>
            <div className="text-xs text-slate-400 font-medium">Top-up Credit</div>
            <div className="text-xl sm:text-2xl font-mono font-bold text-cyan-400 mt-0.5">
              {isLoadingWallet && !wallet ? '...' : formatCurrency(wallet?.topup_credit)}
            </div>
          </div>
          <p className="text-[11px] text-slate-400 leading-relaxed border-t border-slate-800/80 pt-2.5">
            Earned bonus credits from bulk top-ups. Deducted automatically upon event launch.
          </p>
        </div>

        {/* 2.3 Welcome Credit Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3 hover:border-slate-700 transition-colors">
          <div className="flex items-center justify-between">
            <div className="p-2 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20">
              <Gift className="w-4 h-4" />
            </div>
            <span
              className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${
                wallet?.can_use_welcome_credit
                  ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                  : wallet?.welcome_credit_granted
                  ? 'bg-slate-800 text-slate-400'
                  : 'bg-slate-800 text-slate-500'
              }`}
            >
              {wallet?.can_use_welcome_credit
                ? 'Ready to Use'
                : wallet?.welcome_credit_granted
                ? 'Claimed'
                : '1st Event Bonus'}
            </span>
          </div>
          <div>
            <div className="text-xs text-slate-400 font-medium">Welcome Credit</div>
            <div className="text-xl sm:text-2xl font-mono font-bold text-purple-400 mt-0.5">
              {isLoadingWallet && !wallet ? '...' : formatCurrency(wallet?.welcome_credit)}
            </div>
          </div>
          <p className="text-[11px] text-slate-400 leading-relaxed border-t border-slate-800/80 pt-2.5">
            {wallet?.can_use_welcome_credit
              ? 'RM300 instant discount available for your organization’s inaugural event deployment.'
              : wallet?.welcome_credit_granted
              ? 'Welcome bonus discount has already been redeemed on an active event.'
              : 'RM300 inaugural discount granted upon your first event deployment.'}
          </p>
        </div>

        {/* 2.4 Showcase Credit Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3 hover:border-slate-700 transition-colors">
          <div className="flex items-center justify-between">
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <Award className="w-4 h-4" />
            </div>
            <span
              className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${
                wallet?.can_use_showcase_credit
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                  : wallet?.showcase_credit_granted
                  ? 'bg-slate-800 text-slate-400'
                  : 'bg-slate-800 text-slate-500'
              }`}
            >
              {wallet?.can_use_showcase_credit
                ? 'Available'
                : wallet?.showcase_credit_granted
                ? 'Claimed'
                : 'Earn RM300'}
            </span>
          </div>
          <div>
            <div className="text-xs text-slate-400 font-medium">Showcase Credit</div>
            <div className="text-xl sm:text-2xl font-mono font-bold text-amber-400 mt-0.5">
              {isLoadingWallet && !wallet ? '...' : formatCurrency(wallet?.showcase_credit)}
            </div>
          </div>
          <p className="text-[11px] text-slate-400 leading-relaxed border-t border-slate-800/80 pt-2.5">
            Earned by submitting event photo/video showcases. Applied as instant RM300 discount on subsequent events.
          </p>
        </div>
      </div>

      {/* 3. Transaction History Ledger */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg sm:text-xl font-bold text-slate-100 flex items-center gap-2">
              <Coins className="w-5 h-5 text-amber-400" />
              <span>Transaction History</span>
            </h2>
            <p className="text-xs text-slate-400">
              Immutable ledger of top-ups, event payments, refunds, and promo credit grants.
            </p>
          </div>

          {/* Search & Filter Bar */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Search Input */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search transactions..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-slate-950 border border-slate-800 rounded-xl pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500/50 w-44 sm:w-56"
              />
            </div>

            {/* Filter Tabs */}
            <div className="flex items-center gap-1 bg-slate-950 p-1 border border-slate-800 rounded-xl text-xs">
              <button
                onClick={() => setFilterType('ALL')}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                  filterType === 'ALL'
                    ? 'bg-amber-500 text-slate-950 font-bold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                All
              </button>
              <button
                onClick={() => setFilterType('TOPUP')}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                  filterType === 'TOPUP'
                    ? 'bg-amber-500 text-slate-950 font-bold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Top-ups
              </button>
              <button
                onClick={() => setFilterType('EVENT_PAYMENT')}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                  filterType === 'EVENT_PAYMENT'
                    ? 'bg-amber-500 text-slate-950 font-bold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Event Payments
              </button>
              <button
                onClick={() => setFilterType('CREDIT')}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                  filterType === 'CREDIT'
                    ? 'bg-amber-500 text-slate-950 font-bold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Credits
              </button>
            </div>
          </div>
        </div>

        {/* Transactions Table */}
        <div className="overflow-x-auto">
          {isLoadingTxns ? (
            <div className="py-16 text-center space-y-3">
              <div className="w-8 h-8 border-3 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-xs text-slate-400 font-medium">Loading transaction ledger...</p>
            </div>
          ) : filteredTransactions.length === 0 ? (
            <div className="py-16 text-center space-y-3 bg-slate-950/40 rounded-xl border border-slate-800/80">
              <div className="w-12 h-12 rounded-full bg-slate-800/80 flex items-center justify-center mx-auto text-slate-500">
                <Coins className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h4 className="text-sm font-semibold text-slate-300">No Transactions Found</h4>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  {searchQuery || filterType !== 'ALL'
                    ? 'No transactions matched your search filters.'
                    : 'No ledger transactions have been recorded for this organization yet.'}
                </p>
              </div>
              {(searchQuery || filterType !== 'ALL') && (
                <button
                  onClick={() => {
                    setSearchQuery('');
                    setFilterType('ALL');
                  }}
                  className="text-xs text-amber-400 hover:underline font-medium cursor-pointer"
                >
                  Clear Filters
                </button>
              )}
            </div>
          ) : (
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-[11px] font-bold text-slate-400 uppercase tracking-wider bg-slate-950/50">
                  <th className="py-3 px-4 rounded-l-xl">Date & Time</th>
                  <th className="py-3 px-4">Transaction / Type</th>
                  <th className="py-3 px-4">Balance Pool</th>
                  <th className="py-3 px-4 text-right">Amount</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 rounded-r-xl text-right">Reference</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredTransactions.map((txn) => {
                  const info = getTransactionInfo(txn);
                  const Icon = info.icon;
                  const formattedDate = txn.created_at
                    ? new Date(txn.created_at).toLocaleDateString('en-US', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })
                    : 'Recent';
                  const formattedTime = txn.created_at
                    ? new Date(txn.created_at).toLocaleTimeString('en-US', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    : '';

                  const amountNum = Number(txn.amount) || 0;
                  const isPositive = amountNum > 0;
                  const isNegative = amountNum < 0;

                  return (
                    <tr
                      key={txn.id}
                      onClick={() => setSelectedTxn(txn)}
                      className="hover:bg-slate-800/40 transition-colors cursor-pointer group"
                    >
                      {/* Date */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="font-semibold text-slate-200">{formattedDate}</div>
                        <div className="text-[10px] text-slate-500">{formattedTime}</div>
                      </td>

                      {/* Transaction Type */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          <div className={`p-2 rounded-xl border ${info.bg} ${info.color} shrink-0`}>
                            <Icon className="w-4 h-4" />
                          </div>
                          <div className="truncate max-w-xs">
                            <div className="font-bold text-slate-200 group-hover:text-amber-300 transition-colors">
                              {info.label}
                            </div>
                            <div className="text-[11px] text-slate-400 truncate">
                              {txn.description}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Balance Type */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {getBalanceTypeBadge(txn.balance_type)}
                      </td>

                      {/* Amount */}
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <span
                          className={`font-mono font-bold text-sm ${
                            isPositive
                              ? 'text-emerald-400'
                              : isNegative
                              ? 'text-rose-400'
                              : 'text-slate-400'
                          }`}
                        >
                          {isPositive ? '+' : ''}
                          {formatCurrency(amountNum, txn.currency)}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4 text-center whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            txn.status === 'COMPLETED'
                              ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20'
                              : txn.status === 'PENDING'
                              ? 'bg-amber-500/10 text-amber-300 border border-amber-500/20'
                              : txn.status === 'REVERSED'
                              ? 'bg-slate-800 text-slate-400 border border-slate-700'
                              : 'bg-rose-500/10 text-rose-300 border border-rose-500/20'
                          }`}
                        >
                          {txn.status === 'COMPLETED' && <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400" />}
                          {txn.status === 'PENDING' && <Clock className="w-2.5 h-2.5 text-amber-400" />}
                          {txn.status || 'COMPLETED'}
                        </span>
                      </td>

                      {/* Reference */}
                      <td className="py-3.5 px-4 text-right font-mono text-[10px] text-slate-500 truncate max-w-[120px]">
                        {txn.reference_id || txn.id.slice(0, 8)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Ledger Count Note */}
        {!isLoadingTxns && filteredTransactions.length > 0 && (
          <div className="flex items-center justify-between text-[11px] text-slate-500 border-t border-slate-800 pt-3">
            <span>
              Showing {filteredTransactions.length} of {totalTxns} recorded transactions
            </span>
            <span>Immutable Ledger Audit Protection</span>
          </div>
        )}
      </div>

      {/* 4. Policy / Rules Reference Section */}
      <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-5 space-y-3">
        <div className="flex items-center gap-2 text-xs font-bold text-slate-300 uppercase tracking-wider">
          <Info className="w-4 h-4 text-amber-400" />
          <span>Wallet Rules & Credit Terms</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-slate-400">
          <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800/80 space-y-1">
            <div className="font-bold text-slate-200 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>Full Cancellation Refunds</span>
            </div>
            <p className="text-[11px] leading-relaxed">
              Events cancelled prior to setup day receive 100% full refund back to your Paid Balance, and used credits are reversed back to your wallet.
            </p>
          </div>

          <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800/80 space-y-1">
            <div className="font-bold text-slate-200 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
              <span>Promotional Credit Priority</span>
            </div>
            <p className="text-[11px] leading-relaxed">
              Welcome Credit (RM300), Showcase Credit (RM300), or Top-up Credits (5%–7%) can be chosen to offset event deployments instantly.
            </p>
          </div>

          <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800/80 space-y-1">
            <div className="font-bold text-slate-200 flex items-center gap-1.5">
              <Award className="w-3.5 h-3.5 text-amber-400" />
              <span>Earn Showcase Rewards</span>
            </div>
            <p className="text-[11px] leading-relaxed">
              Submit high-quality photos/videos of your live event game activations in the Showcase tab to earn RM300 wallet reward upon review.
            </p>
          </div>
        </div>
      </div>

      {/* Transaction Details Modal */}
      {selectedTxn && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl p-6 space-y-5 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  <Coins className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-100">Transaction Audit Record</h3>
                  <p className="text-[10px] font-mono text-slate-500">{selectedTxn.id}</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedTxn(null)}
                className="text-slate-400 hover:text-slate-200 text-xs p-1 rounded-lg hover:bg-slate-800 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800">
                <span className="text-slate-400">Transaction Type</span>
                <span className="font-bold text-slate-200">{getTransactionInfo(selectedTxn).label}</span>
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800">
                <span className="text-slate-400">Balance Pool</span>
                {getBalanceTypeBadge(selectedTxn.balance_type)}
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800">
                <span className="text-slate-400">Amount</span>
                <span
                  className={`font-mono font-bold text-base ${
                    Number(selectedTxn.amount) >= 0 ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  {Number(selectedTxn.amount) > 0 ? '+' : ''}
                  {formatCurrency(selectedTxn.amount, selectedTxn.currency)}
                </span>
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800">
                <span className="text-slate-400">Status</span>
                <span className="font-bold text-emerald-400">{selectedTxn.status}</span>
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800">
                <span className="text-slate-400">Timestamp</span>
                <span className="font-mono text-slate-300">
                  {selectedTxn.created_at
                    ? new Date(selectedTxn.created_at).toLocaleString()
                    : 'N/A'}
                </span>
              </div>

              {selectedTxn.reference_id && (
                <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <span className="text-slate-400">Reference ID</span>
                  <span className="font-mono text-slate-300">{selectedTxn.reference_id}</span>
                </div>
              )}

              {selectedTxn.description && (
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                  <span className="text-slate-400 block">Description</span>
                  <span className="text-slate-200 block">{selectedTxn.description}</span>
                </div>
              )}
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setSelectedTxn(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl transition-colors cursor-pointer"
              >
                Close Record
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
