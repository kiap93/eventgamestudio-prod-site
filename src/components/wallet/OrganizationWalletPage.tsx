import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useLocalization } from '../../context/LocalizationContext';
import { useAuth } from '../../context/AuthContext';
import { apiFetch } from '../../lib/api';
import { WalletBalanceSummary, WalletTransactionRecord, TopupOrderRecord } from '../../types';
import { CustomDatePicker } from '../common/CustomDatePicker';
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
  ChevronRight,
  Info,
  Calendar,
  Plus,
  Copy,
  Check,
  X,
  CreditCard,
  Lock,
  ExternalLink,
  SlidersHorizontal,
  ChevronDown,
} from 'lucide-react';

interface OrganizationWalletPageProps {
  onNavigateTab?: (tab: 'events' | 'customizer' | 'team' | 'wallet' | 'wallet-topup') => void;
  onNavigateToTopUp?: () => void;
}

type FilterGroup = 'ALL' | 'TOPUP' | 'EVENT_USAGE' | 'CREDITS' | 'REFUNDS';
type DatePreset = 'ALL_TIME' | 'TODAY' | 'LAST_7_DAYS' | 'LAST_30_DAYS' | 'LAST_90_DAYS' | 'THIS_MONTH' | 'CUSTOM';

interface TopUpDetailData {
  topUpAmount: number;
  topupCreditAmount: number;
  totalWalletValue: number;
  status: string;
  paymentReference: string;
  date: string;
  topUpOrderId: string;
  paymentMethod?: string;
  notes?: string;
  rawOrder?: TopupOrderRecord | null;
  pairedTransactions?: WalletTransactionRecord[];
}

export const OrganizationWalletPage: React.FC<OrganizationWalletPageProps> = ({
  onNavigateTab,
  onNavigateToTopUp,
}) => {
  const { t } = useLocalization();
  const { currentOrganization } = useAuth();

  const userRole = currentOrganization?.role;
  const isDesigner = userRole === 'designer';
  const isViewer = userRole === 'viewer';

  // Immediate redirect for Designer role: Designer MUST NOT access Wallet page
  useEffect(() => {
    if (isDesigner) {
      navigateTo('/games');
    }
  }, [isDesigner]);

  const [wallet, setWallet] = useState<WalletBalanceSummary | null>(null);
  const [transactions, setTransactions] = useState<WalletTransactionRecord[]>([]);
  const [totalTxns, setTotalTxns] = useState(0);
  const [isLoadingWallet, setIsLoadingWallet] = useState(true);
  const [isLoadingTxns, setIsLoadingTxns] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Filtering & Search state
  const [filterGroup, setFilterGroup] = useState<FilterGroup>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [datePreset, setDatePreset] = useState<DatePreset>('ALL_TIME');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);

  // Selected details modal state
  const [selectedTxn, setSelectedTxn] = useState<WalletTransactionRecord | null>(null);
  const [topUpDetail, setTopUpDetail] = useState<TopUpDetailData | null>(null);
  const [isLoadingTopUpDetail, setIsLoadingTopUpDetail] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [userLifetimeShowcaseRewardClaimed, setUserLifetimeShowcaseRewardClaimed] = useState(false);

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

  const handleCopy = (text: string, key: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => {
      setCopiedKey(null);
    }, 2000);
  };

  // 1. Fetch Wallet Balance for Current Organization
  const fetchWallet = useCallback(async () => {
    if (!currentOrganization?.id || isDesigner) {
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
  }, [currentOrganization?.id, isDesigner]);

  // Compute active date boundaries based on datePreset
  const calculatedDateRange = useMemo(() => {
    const now = new Date();
    if (datePreset === 'TODAY') {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
      const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
      return { start: start.toISOString(), end: end.toISOString() };
    }
    if (datePreset === 'LAST_7_DAYS') {
      const start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      return { start: start.toISOString(), end: now.toISOString() };
    }
    if (datePreset === 'LAST_30_DAYS') {
      const start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      return { start: start.toISOString(), end: now.toISOString() };
    }
    if (datePreset === 'LAST_90_DAYS') {
      const start = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      return { start: start.toISOString(), end: now.toISOString() };
    }
    if (datePreset === 'THIS_MONTH') {
      const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      return { start: start.toISOString(), end: now.toISOString() };
    }
    if (datePreset === 'CUSTOM') {
      const start = startDate ? new Date(`${startDate}T00:00:00.000Z`).toISOString() : undefined;
      const end = endDate ? new Date(`${endDate}T23:59:59.999Z`).toISOString() : undefined;
      return { start, end };
    }
    return { start: undefined, end: undefined };
  }, [datePreset, startDate, endDate]);

  // 2. Fetch Transaction History Ledger for Current Organization
  const fetchTransactions = useCallback(async () => {
    if (!currentOrganization?.id || isDesigner) {
      setTransactions([]);
      setTotalTxns(0);
      setIsLoadingTxns(false);
      return;
    }

    try {
      setIsLoadingTxns(true);
      const queryParams = new URLSearchParams({
        limit: '100',
        filter_group: filterGroup,
      });

      if (calculatedDateRange.start) {
        queryParams.set('start_date', calculatedDateRange.start);
      }
      if (calculatedDateRange.end) {
        queryParams.set('end_date', calculatedDateRange.end);
      }
      if (searchQuery.trim()) {
        queryParams.set('search', searchQuery.trim());
      }

      const res = await apiFetch(
        `/api/organizations/${currentOrganization.id}/wallet/transactions?${queryParams.toString()}`
      );

      if (res.ok) {
        const data = await res.json();
        setTransactions(data.transactions || []);
        setTotalTxns(data.total !== undefined ? data.total : (data.transactions ? data.transactions.length : 0));
      } else {
        console.error('Failed to fetch wallet transactions:', await res.text());
      }
    } catch (err) {
      console.error('Wallet transactions fetch error:', err);
    } finally {
      setIsLoadingTxns(false);
    }
  }, [currentOrganization?.id, isDesigner, filterGroup, calculatedDateRange, searchQuery]);

  // Initial and reactive load
  useEffect(() => {
    if (isDesigner) return;
    fetchWallet();
    fetchTransactions();
    apiFetch('/api/user/showcase-reward-status')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.hasReceivedReward) {
          setUserLifetimeShowcaseRewardClaimed(true);
        }
      })
      .catch(() => {});
  }, [isDesigner, fetchWallet, fetchTransactions]);

  // Listen for wallet_updated custom event
  useEffect(() => {
    if (isDesigner) return;
    const handleWalletUpdated = () => {
      fetchWallet();
      fetchTransactions();
    };
    window.addEventListener('wallet_updated', handleWalletUpdated);
    return () => window.removeEventListener('wallet_updated', handleWalletUpdated);
  }, [isDesigner, fetchWallet, fetchTransactions]);

  const handleRefreshAll = async () => {
    setIsRefreshing(true);
    await Promise.all([fetchWallet(), fetchTransactions()]);
    setIsRefreshing(false);
  };

  // Helper to open and populate the Top Up detail modal
  const handleOpenTopUpDetail = async (txn: WalletTransactionRecord) => {
    setIsLoadingTopUpDetail(true);
    setSelectedTxn(txn);

    try {
      // Look for linked Top Up Order ID
      const orderId =
        txn.metadata?.topup_order_id ||
        (typeof txn.reference_id === 'string' && txn.reference_id.startsWith('topup_order_')
          ? txn.reference_id.replace('topup_order_', '').replace('_promo', '')
          : null);

      let orderRecord: TopupOrderRecord | null = null;

      if (orderId && currentOrganization?.id) {
        try {
          const res = await apiFetch(`/api/organizations/${currentOrganization.id}/wallet/topup-orders/${orderId}`);
          if (res.ok) {
            const data = await res.json();
            orderRecord = data.order || null;
          }
        } catch {
          // ignore error and fallback to correlation
        }
      }

      // Correlate paired ledger transactions
      const pairedTxns = transactions.filter((t) => {
        if (orderId && (t.metadata?.topup_order_id === orderId || t.reference_id?.includes(orderId))) {
          return true;
        }
        if (t.id === txn.id) return true;
        if (txn.reference_id && t.reference_id && t.reference_id.startsWith(txn.reference_id.split('_promo')[0])) {
          return true;
        }
        return false;
      });

      const topupTxn = pairedTxns.find((t) => t.transaction_type === 'TOPUP') || (txn.transaction_type === 'TOPUP' ? txn : null);
      const creditTxn = pairedTxns.find((t) => t.transaction_type === 'TOPUP_CREDIT') || (txn.transaction_type === 'TOPUP_CREDIT' ? txn : null);

      let topUpAmt = 0;
      let creditAmt = 0;
      let totalValue = 0;
      let paymentRef = '';
      let dateStr = txn.created_at;
      let orderIdStr = orderId || txn.reference_id || txn.id;
      let statusStr = txn.status || 'Completed';

      if (orderRecord) {
        topUpAmt = Number(orderRecord.top_up_amount) || 0;
        creditAmt = Number(orderRecord.expected_credit_amount) || 0;
        totalValue = Number(orderRecord.total_wallet_value) || (topUpAmt + creditAmt);
        paymentRef = orderRecord.payment_reference || txn.metadata?.payment_reference || txn.reference_id || 'Direct Top Up';
        dateStr = orderRecord.paid_at || orderRecord.created_at || txn.created_at;
        orderIdStr = orderRecord.id;
        statusStr = orderRecord.status === 'PAID' ? 'Completed' : orderRecord.status;
      } else {
        topUpAmt = topupTxn ? Math.abs(Number(topupTxn.amount)) : (txn.transaction_type === 'TOPUP' ? Math.abs(Number(txn.amount)) : 0);
        creditAmt = creditTxn ? Math.abs(Number(creditTxn.amount)) : (txn.transaction_type === 'TOPUP_CREDIT' ? Math.abs(Number(txn.amount)) : (topUpAmt >= 6000 ? topUpAmt * 0.05 : 0));
        totalValue = topUpAmt + creditAmt;
        paymentRef = txn.metadata?.payment_reference || txn.reference_id || 'pay_manual_settlement';
        dateStr = txn.created_at;
        orderIdStr = orderId || txn.reference_id || txn.id;
        statusStr = txn.status === 'COMPLETED' ? 'Completed' : (txn.status || 'Completed');
      }

      setTopUpDetail({
        topUpAmount: topUpAmt,
        topupCreditAmount: creditAmt,
        totalWalletValue: totalValue,
        status: statusStr,
        paymentReference: paymentRef,
        date: dateStr,
        topUpOrderId: orderIdStr,
        paymentMethod: orderRecord?.payment_method || txn.metadata?.payment_method || 'Online Payment',
        notes: orderRecord?.notes || txn.description,
        rawOrder: orderRecord,
        pairedTransactions: pairedTxns,
      });
    } catch (err) {
      console.error('Error opening top up detail:', err);
    } finally {
      setIsLoadingTopUpDetail(false);
    }
  };

  // Helper for Transaction display mapping according to user specifications
  const getTransactionInfo = (txn: WalletTransactionRecord) => {
    switch (txn.transaction_type) {
      case 'TOPUP':
        return {
          displayTitle: 'Top Up',
          displaySubtitle: txn.description || 'Paid Balance Cash Deposit',
          typeLabel: 'Paid Balance',
          icon: ArrowUpRight,
          badgeColor: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
          impactColor: 'text-emerald-400',
          isCredit: true,
          isTopUpRelated: true,
        };
      case 'TOPUP_CREDIT':
        return {
          displayTitle: 'Top-up Credit',
          displaySubtitle: txn.description || 'Promotional bonus credit',
          typeLabel: 'Credit',
          icon: Sparkles,
          badgeColor: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
          impactColor: 'text-emerald-400',
          isCredit: true,
          isTopUpRelated: true,
        };
      case 'WELCOME_CREDIT':
        return {
          displayTitle: 'Welcome Credit',
          displaySubtitle: txn.description || 'RM300 first-event promotional credit',
          typeLabel: 'Credit',
          icon: Gift,
          badgeColor: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
          impactColor: 'text-emerald-400',
          isCredit: true,
          isTopUpRelated: false,
        };
      case 'SHOWCASE_CREDIT':
        return {
          displayTitle: 'Showcase Credit',
          displaySubtitle: txn.description || 'RM300 reward for approved marketing showcase',
          typeLabel: 'Credit',
          icon: Award,
          badgeColor: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
          impactColor: 'text-emerald-400',
          isCredit: true,
          isTopUpRelated: false,
        };
      case 'EVENT_PAYMENT':
        return {
          displayTitle: 'Event Usage',
          displaySubtitle: txn.description || 'Event launch paid balance deduction',
          typeLabel: 'Event',
          icon: ArrowDownLeft,
          badgeColor: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
          impactColor: 'text-rose-400',
          isCredit: false,
          isTopUpRelated: false,
        };
      case 'CREDIT_USAGE':
        return {
          displayTitle: 'Event Usage',
          displaySubtitle: txn.description || 'Event promotional credit discount applied',
          typeLabel: 'Credit',
          icon: ArrowDownLeft,
          badgeColor: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
          impactColor: 'text-rose-400',
          isCredit: false,
          isTopUpRelated: false,
        };
      case 'REFUND':
        return {
          displayTitle: 'Event Refund',
          displaySubtitle: txn.description || '100% full refund of event paid balance',
          typeLabel: 'Paid Balance',
          icon: RotateCcw,
          badgeColor: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
          impactColor: 'text-emerald-400',
          isCredit: true,
          isTopUpRelated: false,
        };
      case 'CREDIT_REVERSAL':
        return {
          displayTitle: 'Credit Reversal',
          displaySubtitle: txn.description || 'Promotional credit reversed upon event cancellation',
          typeLabel: 'Credit',
          icon: RotateCcw,
          badgeColor: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
          impactColor: 'text-emerald-400',
          isCredit: true,
          isTopUpRelated: false,
        };
      case 'WITHDRAWAL':
        return {
          displayTitle: 'Withdrawal',
          displaySubtitle: txn.description || 'Funds withdrawal',
          typeLabel: 'Paid Balance',
          icon: ArrowDownLeft,
          badgeColor: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
          impactColor: 'text-rose-400',
          isCredit: false,
          isTopUpRelated: false,
        };
      case 'ADMIN_ADJUSTMENT':
      default:
        return {
          displayTitle: txn.description || 'Ledger Adjustment',
          displaySubtitle: 'Organization ledger audit adjustment',
          typeLabel: txn.balance_type === 'PAID_BALANCE' ? 'Paid Balance' : 'Credit',
          icon: Coins,
          badgeColor: 'bg-slate-800 text-slate-300 border-slate-700',
          impactColor: Number(txn.amount) >= 0 ? 'text-emerald-400' : 'text-rose-400',
          isCredit: Number(txn.amount) >= 0,
          isTopUpRelated: false,
        };
    }
  };

  // Helper for Status Pills
  const getStatusBadge = (status?: string) => {
    const s = (status || 'COMPLETED').toUpperCase();
    if (s === 'COMPLETED' || s === 'PAID') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
          <CheckCircle2 className="w-3 h-3 text-emerald-400" /> {t('common.completed', undefined, 'Completed')}
        </span>
      );
    }
    if (s === 'PENDING') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
          <Clock className="w-3 h-3 text-amber-400" /> {t('common.pending', undefined, 'Pending')}
        </span>
      );
    }
    if (s === 'REVERSED') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-800 text-slate-400 border border-slate-700">
          <RotateCcw className="w-3 h-3 text-slate-400" /> {t('common.reversed', undefined, 'Reversed')}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20">
        <AlertCircle className="w-3 h-3 text-rose-400" /> {status || t('common.failed', undefined, 'Failed')}
      </span>
    );
  };

  // Client-side quick search filtering on currently loaded records
  const displayTransactions = useMemo(() => {
    if (!searchQuery.trim()) return transactions;
    const q = searchQuery.toLowerCase().trim();
    return transactions.filter((txn) => {
      const info = getTransactionInfo(txn);
      return (
        info.displayTitle.toLowerCase().includes(q) ||
        info.displaySubtitle.toLowerCase().includes(q) ||
        info.typeLabel.toLowerCase().includes(q) ||
        (txn.description && txn.description.toLowerCase().includes(q)) ||
        (txn.reference_id && txn.reference_id.toLowerCase().includes(q)) ||
        (txn.metadata?.payment_reference && String(txn.metadata.payment_reference).toLowerCase().includes(q)) ||
        (txn.metadata?.topup_order_id && String(txn.metadata.topup_order_id).toLowerCase().includes(q)) ||
        (txn.id && txn.id.toLowerCase().includes(q))
      );
    });
  }, [transactions, searchQuery]);

  const hasActiveFilters = filterGroup !== 'ALL' || datePreset !== 'ALL_TIME' || searchQuery.trim() !== '' || startDate !== '' || endDate !== '';

  const handleClearAllFilters = () => {
    setFilterGroup('ALL');
    setDatePreset('ALL_TIME');
    setStartDate('');
    setEndDate('');
    setSearchQuery('');
  };

  if (isDesigner) {
    return null;
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-8 animate-in fade-in duration-300">
      {/* 1. Header & Workspace Organization Isolation Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-6">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <div className="p-2.5 bg-amber-500/10 rounded-2xl text-amber-400 border border-amber-500/20">
              <Wallet className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-100">
                {t('payment.organizationWallet')}
              </h1>
            </div>
          </div>
          <p className="text-xs sm:text-sm text-slate-400 max-w-2xl pt-1">
            Real-time balance breakdown and immutable audit ledger for{' '}
            <strong className="text-slate-200">{currentOrganization?.name || 'your workspace'}</strong>.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs">
            <Building2 className="w-4 h-4 text-amber-400 shrink-0" />
            <div className="flex flex-col">
              <span className="font-bold text-slate-200 truncate max-w-[150px]">
                {currentOrganization?.name}
              </span>
              <span className="text-[9px] font-mono text-slate-500 truncate max-w-[150px]">
                Org: {currentOrganization?.id?.slice(0, 8)}...
              </span>
            </div>
            <span className="uppercase text-[9px] font-bold px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 ml-1">
              {currentOrganization?.role || 'Member'}
            </span>
          </div>

          <button
            onClick={handleRefreshAll}
            disabled={isRefreshing || isLoadingWallet}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs font-semibold text-slate-300 transition-colors cursor-pointer disabled:opacity-50"
            title={t('payment.refreshBalances')}
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-amber-400' : 'text-slate-400'}`} />
            <span className="hidden sm:inline">{t('common.refresh')}</span>
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
                  <Sparkles className="w-3.5 h-3.5" /> {t('payment.totalWalletValue')}
                </span>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  {currencyCode}
                </span>
              </div>
              <div className="text-3xl sm:text-5xl font-mono font-black tracking-tight text-amber-400">
                {isLoadingWallet && !wallet ? (
                  <span className="animate-pulse text-slate-600">{t('common.loading')}</span>
                ) : (
                  formatCurrency(wallet?.total_balance)
                )}
              </div>
              <p className="text-xs text-slate-400 max-w-xl pt-1">
                {t('payment.totalSpendingPower')}
              </p>
            </div>

            <div className="flex flex-wrap sm:flex-col items-start sm:items-end gap-2.5 shrink-0">
              {!isViewer && (
                <button
                  onClick={() => {
                    if (onNavigateToTopUp) onNavigateToTopUp();
                    else if (onNavigateTab) onNavigateTab('wallet-topup');
                    else navigateTo('/wallet/top-up');
                  }}
                  className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-slate-950 font-black text-xs sm:text-sm rounded-xl shadow-lg shadow-amber-500/20 transition-all cursor-pointer transform hover:-translate-y-0.5"
                >
                  <Plus className="w-4 h-4 stroke-[3]" />
                  <span>{t('payment.topUp')}</span>
                </button>
              )}

              {onNavigateTab && (
                <button
                  onClick={() => onNavigateTab('events')}
                  className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs rounded-xl border border-slate-700 transition-all cursor-pointer"
                >
                  <Calendar className="w-3.5 h-3.5" />
                  <span>{t('payment.deployAnEvent', undefined, 'Deploy An Event')}</span>
                </button>
              )}
              <div className="text-[11px] text-slate-400 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>{t('payment.standardEventPrice')} <strong>RM1,400</strong></span>
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
              {!isViewer && (
                <button
                  onClick={() => {
                    if (onNavigateToTopUp) onNavigateToTopUp();
                    else if (onNavigateTab) onNavigateTab('wallet-topup');
                    else navigateTo('/wallet/top-up');
                  }}
                  className="text-[10px] uppercase font-bold text-amber-400 hover:text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 px-2.5 py-1 rounded-full transition-colors cursor-pointer flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" /> {t('payment.topUp')}
                </button>
              )}
            </div>
            <div>
              <div className="text-xs text-slate-400 font-medium">{t('payment.paidBalance')}</div>
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
            <span className="text-[10px] uppercase font-bold text-cyan-400 bg-cyan-500/10 border border-cyan-500/20 px-2 py-0.5 rounded-full">
              5%–7% Promo
            </span>
          </div>
          <div>
            <div className="text-xs text-slate-400 font-medium">{t('payment.topUpCredit')}</div>
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
                ? t('payment.readyToUse', undefined, 'Ready to Use')
                : wallet?.welcome_credit_granted
                ? t('payment.claimed', undefined, 'Claimed')
                : t('payment.promotional', undefined, 'Promotional')}
            </span>
          </div>
          <div>
            <div className="text-xs text-slate-400 font-medium">{t('payment.welcomeCredit')}</div>
            <div className="text-xl sm:text-2xl font-mono font-bold text-purple-400 mt-0.5">
              {isLoadingWallet && !wallet ? '...' : formatCurrency(wallet?.welcome_credit)}
            </div>
          </div>
          <p className="text-[11px] text-slate-400 leading-relaxed border-t border-slate-800/80 pt-2.5">
            {wallet?.can_use_welcome_credit
              ? 'Promotional discount credit available to offset your event deployment.'
              : wallet?.welcome_credit_granted
              ? 'Welcome bonus discount has already been redeemed on an active event.'
              : 'Promotional credit available for special marketing campaigns or administrative grants.'}
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
                  : wallet?.showcase_credit_granted || userLifetimeShowcaseRewardClaimed
                  ? 'bg-slate-800 text-slate-400'
                  : 'bg-slate-800 text-slate-500'
              }`}
            >
              {wallet?.can_use_showcase_credit
                ? t('common.available', undefined, 'Available')
                : wallet?.showcase_credit_granted
                ? t('payment.claimed', undefined, 'Claimed')
                : userLifetimeShowcaseRewardClaimed
                ? t('payment.claimedAccount', undefined, 'Claimed (Account)')
                : 'Earn RM300'}
            </span>
          </div>
          <div>
            <div className="text-xs text-slate-400 font-medium">{t('payment.showcaseCredit')}</div>
            <div className="text-xl sm:text-2xl font-mono font-bold text-amber-400 mt-0.5">
              {isLoadingWallet && !wallet ? '...' : formatCurrency(wallet?.showcase_credit)}
            </div>
          </div>
          <p className="text-[11px] text-slate-400 leading-relaxed border-t border-slate-800/80 pt-2.5">
            Earned by submitting event photo/video showcases. Applied as instant RM300 discount on subsequent events.
          </p>
        </div>
      </div>

      {/* 3. Transaction History Section */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-6">
        {/* Top Header & Search / Filters Row */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-800/80 pb-5">
          <div>
            <h2 className="text-lg sm:text-xl font-black text-slate-100 flex items-center gap-2">
              <Coins className="w-5 h-5 text-amber-400" />
              <span>{t('payment.transactionHistory')}</span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Complete read-only transaction ledger scoped to <strong className="text-slate-300">{currentOrganization?.name}</strong>.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Search Input */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder={t('payment.searchLedgerPlaceholder')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-slate-950 border border-slate-800 rounded-xl pl-8 pr-8 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500/50 w-full sm:w-64"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* Date Filter Button */}
            <div className="relative">
              <button
                onClick={() => setShowDatePicker(!showDatePicker)}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-semibold transition-colors cursor-pointer ${
                  datePreset !== 'ALL_TIME'
                    ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                    : 'bg-slate-950 hover:bg-slate-800 text-slate-300 border-slate-800'
                }`}
              >
                <Calendar className="w-3.5 h-3.5 text-amber-400" />
                <span>
                  {datePreset === 'ALL_TIME'
                    ? t('payment.allTime')
                    : datePreset === 'TODAY'
                    ? t('payment.today')
                    : datePreset === 'LAST_7_DAYS'
                    ? t('payment.last7Days')
                    : datePreset === 'LAST_30_DAYS'
                    ? t('payment.last30Days')
                    : datePreset === 'LAST_90_DAYS'
                    ? t('payment.last90Days')
                    : datePreset === 'THIS_MONTH'
                    ? t('payment.thisMonth')
                    : t('payment.customRange')}
                </span>
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showDatePicker ? 'rotate-180' : ''}`} />
              </button>

              {/* Date Filter Dropdown Panel */}
              {showDatePicker && (
                <div className="absolute right-0 top-full mt-2 w-72 p-4 bg-slate-950 border border-slate-800 rounded-2xl shadow-2xl z-30 space-y-3 animate-in fade-in zoom-in-95 duration-150">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-300 border-b border-slate-800 pb-2">
                    <span className="flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-amber-400" /> {t('common.filterByDate', undefined, 'Filter by Date')}
                    </span>
                    <button
                      onClick={() => setShowDatePicker(false)}
                      className="text-slate-500 hover:text-slate-300 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Preset Pills */}
                  <div className="grid grid-cols-2 gap-1.5">
                    {[
                      { id: 'ALL_TIME', label: t('payment.allTime') },
                      { id: 'TODAY', label: t('payment.today') },
                      { id: 'LAST_7_DAYS', label: t('payment.last7Days') },
                      { id: 'LAST_30_DAYS', label: t('payment.last30Days') },
                      { id: 'LAST_90_DAYS', label: t('payment.last90Days') },
                      { id: 'THIS_MONTH', label: t('payment.thisMonth') },
                    ].map((preset) => (
                      <button
                        key={preset.id}
                        onClick={() => {
                          setDatePreset(preset.id as DatePreset);
                          if (preset.id !== 'CUSTOM') {
                            setStartDate('');
                            setEndDate('');
                            setShowDatePicker(false);
                          }
                        }}
                        className={`px-2.5 py-1.5 rounded-lg text-xs font-medium text-left transition-colors cursor-pointer ${
                          datePreset === preset.id
                            ? 'bg-amber-500 text-slate-950 font-bold'
                            : 'bg-slate-900 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                        }`}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>

                  {/* Custom Date Range Inputs */}
                  <div className="space-y-2 pt-2 border-t border-slate-800/80">
                    <span className="text-[11px] font-semibold text-slate-400 block">{t('payment.customRange')}</span>
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-slate-500 w-10">{t('payment.startDate')}</span>
                        <div className="flex-1">
                          <CustomDatePicker
                            value={startDate}
                            onChange={(newStart) => {
                              setStartDate(newStart);
                              setDatePreset('CUSTOM');
                            }}
                          />
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-slate-500 w-10">{t('payment.endDate')}</span>
                        <div className="flex-1">
                          <CustomDatePicker
                            min={startDate}
                            value={endDate}
                            onChange={(newEnd) => {
                              setEndDate(newEnd);
                              setDatePreset('CUSTOM');
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-slate-800">
                    <button
                      onClick={() => {
                        setDatePreset('ALL_TIME');
                        setStartDate('');
                        setEndDate('');
                        setShowDatePicker(false);
                      }}
                      className="text-[11px] text-slate-400 hover:text-slate-200 cursor-pointer"
                    >
                      {t('common.reset', undefined, 'Reset Date')}
                    </button>
                    <button
                      onClick={() => setShowDatePicker(false)}
                      className="px-3 py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-lg cursor-pointer"
                    >
                      {t('common.apply', undefined, 'Apply')}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Clear All Filters Button */}
            {hasActiveFilters && (
              <button
                onClick={handleClearAllFilters}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors cursor-pointer"
                title={t('payment.clearFilters')}
              >
                <RotateCcw className="w-3 h-3 text-amber-400" />
                <span>{t('payment.clearFilters')}</span>
              </button>
            )}
          </div>
        </div>

        {/* Filter Group Tabs Row (All, Top Ups, Event Usage, Credits, Refunds) */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {[
            { id: 'ALL', label: t('payment.allTypes') },
            { id: 'TOPUP', label: t('payment.topUpsFilter') },
            { id: 'EVENT_USAGE', label: t('payment.eventUsageFilter') },
            { id: 'CREDITS', label: t('payment.creditsFilter') },
            { id: 'REFUNDS', label: t('payment.refundsFilter') },
          ].map((tab) => {
            const isActive = filterGroup === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setFilterGroup(tab.id as FilterGroup)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                  isActive
                    ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                    : 'bg-slate-950 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* 4. Transactions Table (Date, Description, Type, Amount, Balance Impact, Status, Reference) */}
        <div className="overflow-x-auto">
          {isLoadingTxns ? (
            <div className="py-20 text-center space-y-3">
              <div className="w-9 h-9 border-3 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-xs text-slate-400 font-medium">{t('payment.loadingLedger')}</p>
            </div>
          ) : displayTransactions.length === 0 ? (
            <div className="py-20 text-center space-y-3 bg-slate-950/40 rounded-2xl border border-slate-800/80">
              <div className="w-12 h-12 rounded-full bg-slate-800/80 flex items-center justify-center mx-auto text-slate-500">
                <Coins className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h4 className="text-sm font-bold text-slate-200">{t('payment.noTransactionsFound')}</h4>
                <p className="text-xs text-slate-400 max-w-sm mx-auto">
                  {hasActiveFilters
                    ? 'No transactions matched your active filters and date selections.'
                    : 'No ledger transactions have been recorded for this organization yet.'}
                </p>
              </div>
              {hasActiveFilters && (
                <button
                  onClick={handleClearAllFilters}
                  className="text-xs text-amber-400 hover:underline font-bold cursor-pointer inline-flex items-center gap-1"
                >
                  <RotateCcw className="w-3 h-3" /> {t('payment.clearFilters')}
                </button>
              )}
            </div>
          ) : (
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-[11px] font-bold text-slate-400 uppercase tracking-wider bg-slate-950/60">
                  <th className="py-3 px-4 rounded-l-xl">{t('payment.date')}</th>
                  <th className="py-3 px-4">{t('common.description')}</th>
                  <th className="py-3 px-4">{t('payment.type')}</th>
                  <th className="py-3 px-4 text-right">{t('payment.amount')}</th>
                  <th className="py-3 px-4 text-right">{t('payment.balanceImpact')}</th>
                  <th className="py-3 px-4 text-center">{t('common.status')}</th>
                  <th className="py-3 px-4 rounded-r-xl text-right">{t('payment.reference')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {displayTransactions.map((txn) => {
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
                  const absAmount = Math.abs(amountNum);

                  return (
                    <tr
                      key={txn.id}
                      onClick={() => {
                        if (info.isTopUpRelated) {
                          handleOpenTopUpDetail(txn);
                        } else {
                          setSelectedTxn(txn);
                        }
                      }}
                      className="hover:bg-slate-800/40 transition-colors cursor-pointer group"
                    >
                      {/* 1. Date */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="font-bold text-slate-200">{formattedDate}</div>
                        <div className="text-[10px] text-slate-500">{formattedTime}</div>
                      </td>

                      {/* 2. Description */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          <div className={`p-2 rounded-xl border ${info.badgeColor} shrink-0`}>
                            <Icon className="w-4 h-4" />
                          </div>
                          <div className="truncate max-w-xs">
                            <div className="font-bold text-slate-200 group-hover:text-amber-300 transition-colors flex items-center gap-1.5">
                              <span>{info.displayTitle}</span>
                              {info.isTopUpRelated && (
                                <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                                  Details
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-400 truncate">
                              {info.displaySubtitle}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* 3. Type */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-semibold border ${info.badgeColor}`}>
                          {info.typeLabel}
                        </span>
                      </td>

                      {/* 4. Amount */}
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <span className="font-mono font-bold text-slate-300 text-xs">
                          {formatCurrency(absAmount, txn.currency)}
                        </span>
                      </td>

                      {/* 5. Balance Impact */}
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
                          {isPositive ? '+' : isNegative ? '-' : ''}
                          {formatCurrency(absAmount, txn.currency)}
                        </span>
                      </td>

                      {/* 6. Status */}
                      <td className="py-3.5 px-4 text-center whitespace-nowrap">
                        {getStatusBadge(txn.status)}
                      </td>

                      {/* 7. Reference */}
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          <span className="font-mono text-[10px] text-slate-400 truncate max-w-[140px]">
                            {txn.metadata?.payment_reference || txn.reference_id || txn.id.slice(0, 8)}
                          </span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCopy(
                                txn.metadata?.payment_reference || txn.reference_id || txn.id,
                                txn.id
                              );
                            }}
                            className="text-slate-500 hover:text-slate-300 p-1 rounded hover:bg-slate-800 transition-colors cursor-pointer"
                            title={t('payment.copyReference')}
                          >
                            {copiedKey === txn.id ? (
                              <Check className="w-3 h-3 text-emerald-400" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Ledger Count Note */}
        {!isLoadingTxns && displayTransactions.length > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between text-[11px] text-slate-500 border-t border-slate-800 pt-3 gap-2">
            <span>
              Showing {displayTransactions.length} of {totalTxns} recorded transactions in organization ledger
            </span>
            <span className="flex items-center gap-1 text-slate-400">
              <Lock className="w-3 h-3 text-emerald-400" />
              <span>{t('payment.immutableLedger')}</span>
            </span>
          </div>
        )}
      </div>

      {/* 5. Policy & Credit Rules Reference Section */}
      <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-5 space-y-3">
        <div className="flex items-center gap-2 text-xs font-bold text-slate-300 uppercase tracking-wider">
          <Info className="w-4 h-4 text-amber-400" />
          <span>{t('payment.walletRules')}</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-slate-400">
          <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800/80 space-y-1">
            <div className="font-bold text-slate-200 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>{t('payment.fullCancellationRefunds')}</span>
            </div>
            <p className="text-[11px] leading-relaxed">
              Events cancelled prior to setup day receive 100% full refund back to your Paid Balance, and used credits are reversed back to your wallet.
            </p>
          </div>

          <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800/80 space-y-1">
            <div className="font-bold text-slate-200 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
              <span>{t('payment.promotionalCreditPriority')}</span>
            </div>
            <p className="text-[11px] leading-relaxed">
              Welcome Credit (RM800), Showcase Credit (RM300), or Top-up Credits (5%–7%) can be chosen to offset event deployments instantly.
            </p>
          </div>

          <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800/80 space-y-1">
            <div className="font-bold text-slate-200 flex items-center gap-1.5">
              <Award className="w-3.5 h-3.5 text-amber-400" />
              <span>{t('payment.earnShowcaseRewards')}</span>
            </div>
            <p className="text-[11px] leading-relaxed">
              Submit high-quality photos/videos of your live event game activations in the Showcase tab to earn RM300 wallet reward upon review.
            </p>
          </div>
        </div>
      </div>

      {/* 6. TOP UP DETAIL MODAL */}
      {topUpDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-lg shadow-2xl p-6 space-y-5 animate-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-2xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  <ArrowUpRight className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-100">{t('payment.topUpDetail')}</h3>
                  <p className="text-xs text-slate-400">{t('payment.topUpDetailDesc')}</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setTopUpDetail(null);
                  setSelectedTxn(null);
                }}
                className="text-slate-400 hover:text-slate-200 text-xs p-1.5 rounded-xl hover:bg-slate-800 cursor-pointer transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Financial Breakdown Cards */}
            <div className="space-y-3 text-xs">
              {/* Top Up Amount */}
              <div className="flex items-center justify-between p-3.5 rounded-2xl bg-slate-950 border border-slate-800/80">
                <div className="space-y-0.5">
                  <span className="text-slate-400 font-medium block">{t('payment.topUp')}</span>
                  <span className="text-[10px] text-slate-500">{t('payment.depositedToPaidBalance')}</span>
                </div>
                <span className="font-mono font-bold text-base text-slate-100">
                  {formatCurrency(topUpDetail.topUpAmount)}
                </span>
              </div>

              {/* Top-up Credit */}
              <div className="flex items-center justify-between p-3.5 rounded-2xl bg-slate-950 border border-cyan-500/20">
                <div className="space-y-0.5">
                  <span className="text-cyan-300 font-medium flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-cyan-400" /> {t('payment.topUpCredit')}
                  </span>
                  <span className="text-[10px] text-cyan-400/70">{t('payment.promotionalBonusValue')}</span>
                </div>
                <span className="font-mono font-bold text-base text-cyan-400">
                  {formatCurrency(topUpDetail.topupCreditAmount)}
                </span>
              </div>

              {/* Total Wallet Value Highlight */}
              <div className="flex items-center justify-between p-4 rounded-2xl bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent border border-amber-500/30">
                <div className="space-y-0.5">
                  <span className="text-amber-300 font-bold block text-sm">{t('payment.totalWalletValue')}</span>
                  <span className="text-[10px] text-amber-400/80">{t('payment.totalSpendingPower')}</span>
                </div>
                <span className="font-mono font-black text-xl text-amber-400">
                  {formatCurrency(topUpDetail.totalWalletValue)}
                </span>
              </div>

              {/* Status */}
              <div className="flex items-center justify-between p-3.5 rounded-2xl bg-slate-950 border border-slate-800/80">
                <span className="text-slate-400 font-medium">{t('common.status')}</span>
                <span className="font-bold text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span>{topUpDetail.status}</span>
                </span>
              </div>

              {/* Payment Reference */}
              <div className="flex items-center justify-between p-3.5 rounded-2xl bg-slate-950 border border-slate-800/80">
                <span className="text-slate-400 font-medium">{t('payment.paymentReference')}</span>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-slate-200 text-[11px] truncate max-w-[200px]">
                    {topUpDetail.paymentReference}
                  </span>
                  <button
                    onClick={() => handleCopy(topUpDetail.paymentReference, 'modal_payment_ref')}
                    className="text-slate-400 hover:text-slate-200 p-1 rounded hover:bg-slate-800 transition-colors cursor-pointer"
                    title={t('payment.copyPaymentReference')}
                  >
                    {copiedKey === 'modal_payment_ref' ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </div>

              {/* Date */}
              <div className="flex items-center justify-between p-3.5 rounded-2xl bg-slate-950 border border-slate-800/80">
                <span className="text-slate-400 font-medium">{t('payment.date')}</span>
                <span className="font-mono text-slate-200">
                  {topUpDetail.date
                    ? new Date(topUpDetail.date).toLocaleDateString('en-US', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      }) +
                      ', ' +
                      new Date(topUpDetail.date).toLocaleTimeString('en-US', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    : 'N/A'}
                </span>
              </div>

              {/* Top Up Order ID */}
              <div className="flex items-center justify-between p-3.5 rounded-2xl bg-slate-950 border border-slate-800/80">
                <span className="text-slate-400 font-medium">{t('payment.topUpOrder')}</span>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-slate-300 text-[10px] truncate max-w-[200px]">
                    {topUpDetail.topUpOrderId}
                  </span>
                  <button
                    onClick={() => handleCopy(topUpDetail.topUpOrderId, 'modal_order_id')}
                    className="text-slate-400 hover:text-slate-200 p-1 rounded hover:bg-slate-800 transition-colors cursor-pointer"
                    title={t('payment.copyOrderId')}
                  >
                    {copiedKey === 'modal_order_id' ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-800">
              <button
                onClick={() => {
                  setTopUpDetail(null);
                  setSelectedTxn(null);
                }}
                className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl transition-colors cursor-pointer"
              >
                {t('common.close', undefined, 'Close Detail')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 7. STANDARD TRANSACTION AUDIT MODAL */}
      {selectedTxn && !topUpDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-lg shadow-2xl p-6 space-y-5 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  <Coins className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-100">{t('payment.transactionAuditRecord')}</h3>
                  <p className="text-[10px] font-mono text-slate-500">{selectedTxn.id}</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedTxn(null)}
                className="text-slate-400 hover:text-slate-200 text-xs p-1 rounded-lg hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800">
                <span className="text-slate-400">{t('common.description')}</span>
                <span className="font-bold text-slate-200">{getTransactionInfo(selectedTxn).displayTitle}</span>
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800">
                <span className="text-slate-400">{t('payment.type')}</span>
                <span className="font-semibold text-slate-200">{getTransactionInfo(selectedTxn).typeLabel}</span>
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800">
                <span className="text-slate-400">{t('payment.amount')}</span>
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
                <span className="text-slate-400">{t('common.status')}</span>
                {getStatusBadge(selectedTxn.status)}
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800">
                <span className="text-slate-400">{t('payment.timestamp')}</span>
                <span className="font-mono text-slate-300">
                  {selectedTxn.created_at
                    ? new Date(selectedTxn.created_at).toLocaleString()
                    : 'N/A'}
                </span>
              </div>

              {selectedTxn.reference_id && (
                <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <span className="text-slate-400">{t('payment.referenceId')}</span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-slate-300 text-[11px] truncate max-w-[200px]">
                      {selectedTxn.reference_id}
                    </span>
                    <button
                      onClick={() => handleCopy(selectedTxn.reference_id!, 'txn_ref_copy')}
                      className="text-slate-500 hover:text-slate-300 cursor-pointer"
                    >
                      {copiedKey === 'txn_ref_copy' ? (
                        <Check className="w-3 h-3 text-emerald-400" />
                      ) : (
                        <Copy className="w-3 h-3" />
                      )}
                    </button>
                  </div>
                </div>
              )}

              {selectedTxn.description && (
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                  <span className="text-slate-400 block">{t('payment.ledgerDescription')}</span>
                  <span className="text-slate-200 block">{selectedTxn.description}</span>
                </div>
              )}
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setSelectedTxn(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl transition-colors cursor-pointer"
              >
                {t('common.close', undefined, 'Close Record')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
