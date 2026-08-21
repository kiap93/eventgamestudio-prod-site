import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { apiFetch } from '../../lib/api';
import { navigateTo } from '../../hooks/useRouteContext';
import {
  WalletBalanceSummary,
  TopupQuoteResponse,
  PendingTopupOrder,
} from '../../types';
import {
  Wallet,
  ArrowLeft,
  Sparkles,
  ShieldCheck,
  Coins,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Clock,
  ArrowRight,
  TrendingUp,
  Gift,
  Award,
  RefreshCw,
  Copy,
  Check,
  ChevronRight,
  Info,
} from 'lucide-react';

interface TopUpPageProps {
  onBackToWallet?: () => void;
  onNavigateTab?: (tab: 'events' | 'customizer' | 'team' | 'wallet') => void;
}

export const TopUpPage: React.FC<TopUpPageProps> = ({ onBackToWallet, onNavigateTab }) => {
  const { currentOrganization } = useAuth();

  const [wallet, setWallet] = useState<WalletBalanceSummary | null>(null);
  const [loadingWallet, setLoadingWallet] = useState(true);

  // Selection state
  const presetAmounts = [1000, 3000, 6000, 10000];
  const [selectedPreset, setSelectedPreset] = useState<number | 'custom'>(6000);
  const [customAmountInput, setCustomAmountInput] = useState<string>('6000');
  const [activeAmount, setActiveAmount] = useState<number>(6000);

  // Quote calculation state from server
  const [quote, setQuote] = useState<TopupQuoteResponse | null>(null);
  const [loadingQuote, setLoadingQuote] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);

  // Order state (Phase 3 Backend Lifecycle)
  const [isSubmittingOrder, setIsSubmittingOrder] = useState(false);
  const [activeOrder, setActiveOrder] = useState<TopupOrderRecord | null>(null);
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [copiedOrderId, setCopiedOrderId] = useState(false);

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

  // 1. Fetch Wallet Balance
  const fetchWallet = useCallback(async () => {
    if (!currentOrganization?.id) return;
    try {
      setLoadingWallet(true);
      const res = await apiFetch(`/api/organizations/${currentOrganization.id}/wallet`);
      if (res.ok) {
        const data = await res.json();
        setWallet(data.wallet || null);
      }
    } catch (err) {
      console.error('Wallet fetch error:', err);
    } finally {
      setLoadingWallet(false);
    }
  }, [currentOrganization?.id]);

  useEffect(() => {
    fetchWallet();
  }, [fetchWallet]);

  // 2. Fetch Dynamic Quote from existing Wallet Engine
  const fetchQuote = useCallback(async (amountToQuote: number) => {
    if (!currentOrganization?.id || amountToQuote <= 0) {
      setQuote(null);
      return;
    }

    try {
      setLoadingQuote(true);
      setQuoteError(null);
      const res = await apiFetch(
        `/api/organizations/${currentOrganization.id}/wallet/topup/quote?amount=${amountToQuote}&currency=${currencyCode}`
      );
      if (res.ok) {
        const data = await res.json();
        setQuote(data);
      } else {
        const errData = await res.json().catch(() => ({}));
        setQuoteError(errData.error || 'Failed to calculate top-up bonus quote');
      }
    } catch (err: any) {
      console.error('Error fetching top-up quote:', err);
      setQuoteError(err.message || 'Network error');
    } finally {
      setLoadingQuote(false);
    }
  }, [currentOrganization?.id, currencyCode]);

  // Trigger quote refresh whenever activeAmount changes
  useEffect(() => {
    if (activeAmount > 0) {
      fetchQuote(activeAmount);
    } else {
      setQuote(null);
    }
  }, [activeAmount, fetchQuote]);

  // Handle Preset selection
  const handleSelectPreset = (amount: number) => {
    setSelectedPreset(amount);
    setCustomAmountInput(amount.toString());
    setActiveAmount(amount);
  };

  // Handle Custom Amount changes
  const handleCustomAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawVal = e.target.value;
    if (rawVal === '' || /^\d+(\.\d{0,2})?$/.test(rawVal)) {
      setCustomAmountInput(rawVal);
      setSelectedPreset('custom');
      const num = parseFloat(rawVal);
      if (!isNaN(num) && num > 0) {
        setActiveAmount(num);
      } else {
        setActiveAmount(0);
      }
    }
  };

  // Handle "Continue to Payment" (Phase 3: Creates PENDING Top-up Order)
  const handleContinueToPayment = async () => {
    if (!currentOrganization?.id) return;
    if (activeAmount <= 0) {
      setQuoteError('Please enter a valid top-up amount greater than 0');
      return;
    }

    try {
      setIsSubmittingOrder(true);
      setQuoteError(null);
      setStatusMessage(null);

      const res = await apiFetch(`/api/organizations/${currentOrganization.id}/wallet/topup-orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: activeAmount,
          currency: currencyCode,
          notes: `Top-up selection of RM${activeAmount.toFixed(2)} with promotional bonus`,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setActiveOrder(data.order);
      } else {
        const errData = await res.json().catch(() => ({}));
        setQuoteError(errData.error || 'Failed to create top-up order');
      }
    } catch (err: any) {
      console.error('Error creating top-up order:', err);
      setQuoteError(err.message || 'Failed to create top-up order');
    } finally {
      setIsSubmittingOrder(false);
    }
  };

  // Handle Status Transitions (for testing lifecycle or simulation)
  const handleProcessStatus = async (newStatus: 'PAID' | 'FAILED' | 'EXPIRED' | 'CANCELLED') => {
    if (!currentOrganization?.id || !activeOrder?.id) return;
    try {
      setStatusUpdating(true);
      setStatusMessage(null);

      const res = await apiFetch(
        `/api/organizations/${currentOrganization.id}/wallet/topup-orders/${activeOrder.id}/process-status`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            status: newStatus,
            payment_reference: newStatus === 'PAID' ? `PAY-SIM-${Date.now()}` : undefined,
            reason: `Order transitioned to ${newStatus} via lifecycle manager`,
          }),
        }
      );

      if (res.ok) {
        const data = await res.json();
        setActiveOrder(data.order);
        setStatusMessage(data.message || `Order successfully updated to ${newStatus}`);
        // Refresh wallet balances
        await fetchWallet();
      } else {
        const errData = await res.json().catch(() => ({}));
        setQuoteError(errData.error || `Failed to transition order to ${newStatus}`);
      }
    } catch (err: any) {
      console.error('Error updating order status:', err);
      setQuoteError(err.message || 'Failed to update order status');
    } finally {
      setStatusUpdating(false);
    }
  };

  const handleCopyOrderId = (id: string) => {
    navigator.clipboard.writeText(id);
    setCopiedOrderId(true);
    setTimeout(() => setCopiedOrderId(false), 2000);
  };

  const handleBack = () => {
    if (onBackToWallet) {
      onBackToWallet();
    } else {
      navigateTo('/wallet');
    }
  };

  // Helper calculations for tier upgrade hints
  const tier1Min = quote?.tiers.tier1_min ?? 6000;
  const tier2Min = quote?.tiers.tier2_min ?? 10000;

  let tierHint: { message: string; diff: number; targetTier: string } | null = null;
  if (activeAmount > 0 && activeAmount < tier1Min) {
    const diff = tier1Min - activeAmount;
    tierHint = {
      message: `Add ${formatCurrency(diff)} more to unlock a 5% promotional Top-up Credit (+${formatCurrency(tier1Min * 0.05)})!`,
      diff,
      targetTier: '5%',
    };
  } else if (activeAmount >= tier1Min && activeAmount < tier2Min) {
    const diff = tier2Min - activeAmount;
    tierHint = {
      message: `Add ${formatCurrency(diff)} more to upgrade to 7% promotional Top-up Credit (+${formatCurrency(tier2Min * 0.07)})!`,
      diff,
      targetTier: '7%',
    };
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-8 animate-in fade-in duration-300">
      {/* 1. Header & Breadcrumbs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-6">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-400 mb-2">
            <button
              onClick={handleBack}
              className="hover:text-amber-400 flex items-center gap-1 transition-colors cursor-pointer"
            >
              <Wallet className="w-3.5 h-3.5" />
              <span>Organization Wallet</span>
            </button>
            <ChevronRight className="w-3 h-3 text-slate-600" />
            <span className="text-amber-400">Top Up Balance</span>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleBack}
              className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 transition-colors cursor-pointer"
              title="Back to Wallet Overview"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-100 flex items-center gap-2.5">
                <span>Top Up Balance</span>
                <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-amber-500/10 text-amber-300 border border-amber-500/20">
                  Phase 2 Selection
                </span>
              </h1>
              <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
                Select your top-up amount to calculate promotional credits and preview updated wallet balances.
              </p>
            </div>
          </div>
        </div>

        {/* Current Available Balance pill */}
        <div className="flex items-center gap-3 self-start sm:self-auto bg-slate-900/90 border border-slate-800 px-4 py-2.5 rounded-2xl">
          <div className="p-2 bg-amber-500/10 text-amber-400 rounded-xl">
            <Wallet className="w-4 h-4" />
          </div>
          <div>
            <div className="text-[10px] uppercase font-bold text-slate-400">Current Usable Balance</div>
            <div className="text-sm font-mono font-bold text-amber-400">
              {loadingWallet ? '...' : formatCurrency(wallet?.total_balance)}
            </div>
          </div>
        </div>
      </div>

      {/* If Order is created, show the Top-Up Order Lifecycle Card */}
      {activeOrder ? (
        <div className="max-w-3xl mx-auto bg-slate-900 border border-amber-500/40 rounded-3xl p-6 sm:p-8 space-y-6 shadow-2xl animate-in zoom-in-95 duration-200">
          <div className="text-center space-y-2">
            <div className="inline-flex p-3 bg-amber-500/10 border border-amber-500/30 rounded-2xl text-amber-400 mb-1">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <h2 className="text-2xl font-black text-slate-100">Top-Up Order #{activeOrder.id.slice(0, 8)}</h2>
            <p className="text-xs sm:text-sm text-slate-400 max-w-md mx-auto">
              {activeOrder.status === 'PENDING'
                ? 'Order created in PENDING status. Wallet balance remains untouched until marked as PAID.'
                : activeOrder.status === 'PAID'
                ? 'Order successfully paid! Wallet credited with separate ledger entries.'
                : `Order status: ${activeOrder.status}`}
            </p>
          </div>

          {/* Status Message / Notification */}
          {statusMessage && (
            <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
              <div className="text-xs text-slate-200 space-y-1">
                <strong className="text-emerald-300 block">Lifecycle Update:</strong>
                <p>{statusMessage}</p>
              </div>
            </div>
          )}

          {/* Phase 3 Backend Lifecycle Informational Banner */}
          {activeOrder.status === 'PENDING' && (
            <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-3">
              <Info className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <div className="text-xs text-slate-300 space-y-1">
                <strong className="text-amber-300 block">Phase 3 Lifecycle Rule:</strong>
                <p>
                  This order is stored in <strong>PENDING</strong> status. No funds have been added to your wallet.
                  Only when marked <strong>PAID</strong> will the wallet be credited with separate ledger entries for
                  Paid Balance and Top-up Credit.
                </p>
              </div>
            </div>
          )}

          {/* Order Details Breakdown Card */}
          <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <span className="text-xs text-slate-400">Order ID (UUID)</span>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-bold text-amber-400">{activeOrder.id}</span>
                <button
                  onClick={() => handleCopyOrderId(activeOrder.id)}
                  className="p-1 text-slate-400 hover:text-slate-200 rounded transition-colors cursor-pointer"
                  title="Copy Order ID"
                >
                  {copiedOrderId ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between border-b border-slate-800 pb-3 text-xs">
              <span className="text-slate-400">Order Status</span>
              <span
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full font-bold text-xs ${
                  activeOrder.status === 'PAID'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                    : activeOrder.status === 'PENDING'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                    : activeOrder.status === 'FAILED'
                    ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                    : 'bg-slate-700 text-slate-300 border border-slate-600'
                }`}
              >
                {activeOrder.status === 'PAID' ? (
                  <CheckCircle2 className="w-3.5 h-3.5" />
                ) : activeOrder.status === 'PENDING' ? (
                  <Clock className="w-3.5 h-3.5" />
                ) : (
                  <AlertCircle className="w-3.5 h-3.5" />
                )}
                <span>{activeOrder.status}</span>
              </span>
            </div>

            <div className="flex items-center justify-between border-b border-slate-800 pb-3 text-xs">
              <span className="text-slate-400">Top-Up Amount (Paid Balance)</span>
              <span className="font-mono font-bold text-slate-100 text-sm">
                {formatCurrency(activeOrder.top_up_amount)}
              </span>
            </div>

            <div className="flex items-center justify-between border-b border-slate-800 pb-3 text-xs">
              <span className="text-slate-400 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                <span>Expected Top-Up Credit Bonus</span>
              </span>
              <span className="font-mono font-bold text-cyan-400 text-sm">
                +{formatCurrency(activeOrder.expected_credit_amount)}
              </span>
            </div>

            <div className="flex items-center justify-between border-b border-slate-800 pb-3 text-xs">
              <span className="text-slate-400">Created At</span>
              <span className="text-slate-300 font-mono">
                {new Date(activeOrder.created_at).toLocaleString()}
              </span>
            </div>

            <div className="flex items-center justify-between pt-1">
              <div>
                <span className="text-xs font-bold text-slate-200 block">Total Wallet Value Upon Completion</span>
                <span className="text-[10px] text-slate-500">Paid Balance + Expected Credit</span>
              </div>
              <span className="font-mono text-xl font-black text-amber-400">
                {formatCurrency(activeOrder.top_up_amount + activeOrder.expected_credit_amount)}
              </span>
            </div>
          </div>

          {/* Lifecycle Testing / Simulation Sandbox */}
          {activeOrder.status === 'PENDING' && (
            <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-3">
              <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5 text-amber-400" />
                <span>Order Lifecycle Simulation (Testing Tools)</span>
              </div>
              <p className="text-xs text-slate-400">
                Test state machine transitions to verify idempotent ledger operations:
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
                <button
                  type="button"
                  disabled={statusUpdating}
                  onClick={() => handleProcessStatus('PAID')}
                  className="py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition-colors cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5 shadow"
                >
                  {statusUpdating ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                  <span>Simulate PAID</span>
                </button>
                <button
                  type="button"
                  disabled={statusUpdating}
                  onClick={() => handleProcessStatus('FAILED')}
                  className="py-2.5 px-3 rounded-xl bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/30 font-bold text-xs transition-colors cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  <AlertCircle className="w-3.5 h-3.5" />
                  <span>Mark FAILED</span>
                </button>
                <button
                  type="button"
                  disabled={statusUpdating}
                  onClick={() => handleProcessStatus('CANCELLED')}
                  className="py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition-colors cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  <span>Cancel Order</span>
                </button>
              </div>
            </div>
          )}

          {/* Action CTAs */}
          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <button
              onClick={() => {
                setActiveOrder(null);
                setStatusMessage(null);
                setActiveAmount(6000);
                setSelectedPreset(6000);
                setCustomAmountInput('6000');
              }}
              className="flex-1 py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs transition-colors cursor-pointer text-center"
            >
              Create Another Top-Up Order
            </button>

            <button
              onClick={handleBack}
              className="flex-1 py-3 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-lg transition-colors cursor-pointer text-center flex items-center justify-center gap-1.5"
            >
              <span>Return to Wallet Dashboard</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      ) : (
        /* Main Top Up Selection & Order Summary Grid */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left Column (7 cols): Preset Selection & Custom Amount Input */}
          <div className="lg:col-span-7 space-y-6">
            {/* Amount Selection Card */}
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-7 space-y-6">
              <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                <div>
                  <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                    <Coins className="w-5 h-5 text-amber-400" />
                    <span>Select Top Up Amount</span>
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Choose a recommended package or enter a custom amount.
                  </p>
                </div>

                <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                  {currencyCode}
                </span>
              </div>

              {/* Preset Amounts Grid */}
              <div className="grid grid-cols-2 gap-3 sm:gap-4">
                {presetAmounts.map((amt) => {
                  const isSelected = selectedPreset === amt;
                  // Tier rate indicators
                  let bonusTag = null;
                  if (amt >= 10000) {
                    bonusTag = '+7% Bonus Credit';
                  } else if (amt >= 6000) {
                    bonusTag = '+5% Bonus Credit';
                  }

                  return (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => handleSelectPreset(amt)}
                      className={`relative p-4 sm:p-5 rounded-2xl border text-left transition-all cursor-pointer group flex flex-col justify-between ${
                        isSelected
                          ? 'border-amber-500 bg-amber-500/10 ring-2 ring-amber-500/30 text-slate-100 shadow-lg'
                          : 'border-slate-800 bg-slate-950/60 hover:border-slate-700 hover:bg-slate-800/50 text-slate-300'
                      }`}
                    >
                      {bonusTag && (
                        <div className="absolute -top-2.5 right-3 bg-gradient-to-r from-cyan-500 to-blue-600 text-slate-950 font-black text-[9px] uppercase px-2 py-0.5 rounded-full shadow">
                          {bonusTag}
                        </div>
                      )}

                      <div className="space-y-1">
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                          Package
                        </div>
                        <div className="text-lg sm:text-2xl font-mono font-black tracking-tight group-hover:text-amber-400 transition-colors">
                          {formatCurrency(amt)}
                        </div>
                      </div>

                      <div className="pt-3 border-t border-slate-800/80 mt-3 flex items-center justify-between text-[11px]">
                        <span className={isSelected ? 'text-amber-300 font-semibold' : 'text-slate-500'}>
                          {amt >= 6000 ? (
                            <span className="flex items-center gap-1 text-cyan-400 font-semibold">
                              <Sparkles className="w-3 h-3" /> Includes Bonus
                            </span>
                          ) : (
                            'Standard Package'
                          )}
                        </span>
                        <div
                          className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                            isSelected ? 'border-amber-500 bg-amber-500 text-slate-950' : 'border-slate-700'
                          }`}
                        >
                          {isSelected && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Custom Amount Section */}
              <div className="space-y-3 pt-2 border-t border-slate-800">
                <div className="flex items-center justify-between">
                  <label htmlFor="custom-topup-input" className="text-xs font-bold text-slate-300">
                    Custom Amount
                  </label>
                  <span className="text-[11px] text-slate-500">Min: RM 1.00</span>
                </div>

                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-sm font-bold text-amber-400 font-mono">
                    RM
                  </div>
                  <input
                    id="custom-topup-input"
                    type="text"
                    inputMode="decimal"
                    value={customAmountInput}
                    onChange={handleCustomAmountChange}
                    onFocus={() => setSelectedPreset('custom')}
                    placeholder="e.g. 7500.00"
                    className={`w-full pl-14 pr-4 py-3 bg-slate-950 border ${
                      selectedPreset === 'custom'
                        ? 'border-amber-500 ring-2 ring-amber-500/20'
                        : 'border-slate-800 focus:border-amber-500'
                    } rounded-xl text-slate-100 font-mono text-base focus:outline-none transition-all placeholder:text-slate-700`}
                  />
                </div>

                {tierHint && (
                  <div className="p-3 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center gap-2.5 text-xs text-cyan-300">
                    <TrendingUp className="w-4 h-4 shrink-0 text-cyan-400" />
                    <span>{tierHint.message}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Business Rules & Credit Distinction Guide */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-6 space-y-4">
              <h3 className="text-xs uppercase tracking-wider font-bold text-slate-300 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-amber-400" />
                <span>Wallet Balance Pools & Policy</span>
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800/80 space-y-1">
                  <div className="font-bold text-emerald-400 flex items-center gap-1">
                    <Coins className="w-3.5 h-3.5" /> Paid Balance
                  </div>
                  <p className="text-slate-400 text-[11px] leading-relaxed">
                    Actual deposited funds. 100% refundable to your payment method if an event is cancelled prior to setup day.
                  </p>
                </div>

                <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800/80 space-y-1">
                  <div className="font-bold text-cyan-400 flex items-center gap-1">
                    <Sparkles className="w-3.5 h-3.5" /> Top-up Credit Bonus
                  </div>
                  <p className="text-slate-400 text-[11px] leading-relaxed">
                    Promotional reward (5% on RM6,000+, 7% on RM10,000+). Usable up to 20% (RM280) per event launch. Non-withdrawable.
                  </p>
                </div>

                <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800/80 space-y-1">
                  <div className="font-bold text-purple-400 flex items-center gap-1">
                    <Gift className="w-3.5 h-3.5" /> Welcome Credit
                  </div>
                  <p className="text-slate-400 text-[11px] leading-relaxed">
                    One-time promotional grant of RM800.00 applicable towards first event launch.
                  </p>
                </div>

                <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800/80 space-y-1">
                  <div className="font-bold text-amber-400 flex items-center gap-1">
                    <Award className="w-3.5 h-3.5" /> Showcase Credit
                  </div>
                  <p className="text-slate-400 text-[11px] leading-relaxed">
                    Approved event showcase reward of RM300.00 per event.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column (5 cols): Order Summary & Payment Summary */}
          <div className="lg:col-span-5 space-y-6">
            {/* Order Summary & Payment Summary Card */}
            <div className="bg-slate-900 border border-amber-500/30 rounded-3xl p-6 sm:p-7 space-y-6 shadow-xl sticky top-24">
              <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                <h2 className="text-lg font-black text-slate-100 flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-amber-400" />
                  <span>Order Summary</span>
                </h2>
                {loadingQuote && (
                  <RefreshCw className="w-3.5 h-3.5 text-amber-400 animate-spin" />
                )}
              </div>

              {/* Order Breakdown */}
              <div className="space-y-3.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Selected Amount</span>
                  <span className="font-mono font-bold text-slate-100 text-sm">
                    {formatCurrency(quote?.amount ?? activeAmount)}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-slate-400 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Top-up Credit</span>
                    {quote && quote.bonus_percentage > 0 && (
                      <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                        {quote.bonus_percentage}% Bonus
                      </span>
                    )}
                  </span>
                  <span className="font-mono font-bold text-cyan-400 text-sm">
                    {quote && quote.promo_credit > 0
                      ? `+ ${formatCurrency(quote.promo_credit)}`
                      : '+ RM 0.00'}
                  </span>
                </div>

                <div className="pt-2 border-t border-slate-800 flex items-center justify-between">
                  <div>
                    <span className="font-bold text-slate-200 block">Total Wallet Value</span>
                    <span className="text-[10px] text-slate-500">Purchased funds + Promotional bonus</span>
                  </div>
                  <span className="font-mono font-bold text-amber-400 text-base">
                    {formatCurrency(quote?.total_wallet_value ?? activeAmount)}
                  </span>
                </div>
              </div>

              {/* Payment Summary Box */}
              <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-3">
                <div className="text-[10px] uppercase font-bold tracking-wider text-slate-400">
                  Payment Summary
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-300">You Pay</span>
                  <span className="font-mono text-xl font-black text-slate-100">
                    {formatCurrency(quote?.you_pay ?? activeAmount)}
                  </span>
                </div>

                <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs">
                  <span className="text-slate-400">Wallet Value After Top Up</span>
                  <span className="font-mono font-bold text-emerald-400">
                    {formatCurrency(quote?.wallet_value_after_topup.total_balance)}
                  </span>
                </div>
              </div>

              {/* Wallet Balances Preview after Top Up */}
              <div className="p-3.5 rounded-2xl bg-slate-950/60 border border-slate-800/80 space-y-2 text-[11px]">
                <div className="font-semibold text-slate-300 flex items-center justify-between">
                  <span>Balance Pools After Top-up:</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-slate-400 font-mono">
                  <div>
                    Paid Balance:{' '}
                    <strong className="text-slate-200">
                      {formatCurrency(quote?.wallet_value_after_topup.paid_balance)}
                    </strong>
                  </div>
                  <div>
                    Top-up Credit:{' '}
                    <strong className="text-cyan-300">
                      {formatCurrency(quote?.wallet_value_after_topup.topup_credit)}
                    </strong>
                  </div>
                </div>
              </div>

              {/* Error Display if any */}
              {quoteError && (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                  <span>{quoteError}</span>
                </div>
              )}

              {/* Continue to Payment CTA */}
              <button
                type="button"
                onClick={handleContinueToPayment}
                disabled={isSubmittingOrder || activeAmount <= 0 || loadingQuote}
                className="w-full py-3.5 px-4 rounded-2xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-black text-sm shadow-xl hover:shadow-amber-500/20 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
              >
                {isSubmittingOrder ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Preparing Order...</span>
                  </>
                ) : (
                  <>
                    <span>Continue to Payment</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>

              <div className="text-center text-[10px] text-slate-500 flex items-center justify-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span>Phase 2 Preview: Prepares pending order without charging payment</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
