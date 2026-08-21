import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { apiFetch } from '../../lib/api';
import { navigateTo } from '../../hooks/useRouteContext';
import {
  WalletBalanceSummary,
  TopupQuoteResponse,
  TopupOrderRecord,
  PaymentCheckoutSession,
} from '../../types';
import {
  Wallet,
  ArrowLeft,
  Sparkles,
  ShieldCheck,
  Coins,
  CheckCircle2,
  AlertCircle,
  Clock,
  ArrowRight,
  TrendingUp,
  Gift,
  Award,
  RefreshCw,
  Copy,
  Check,
  ChevronRight,
  CreditCard,
  Building,
  Lock,
  ExternalLink,
  XCircle,
} from 'lucide-react';

interface TopUpPageProps {
  onBackToWallet?: () => void;
  onNavigateTab?: (tab: 'events' | 'customizer' | 'team' | 'wallet') => void;
}

export const TopUpPage: React.FC<TopUpPageProps> = ({ onBackToWallet, onNavigateTab }) => {
  const { currentOrganization, currentUser } = useAuth();

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

  // Order & Payment State
  const [isSubmittingOrder, setIsSubmittingOrder] = useState(false);
  const [activeOrder, setActiveOrder] = useState<TopupOrderRecord | null>(null);
  const [checkoutSession, setCheckoutSession] = useState<PaymentCheckoutSession | null>(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<'card' | 'fpx'>('card');
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [isPollingStatus, setIsPollingStatus] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [copiedOrderId, setCopiedOrderId] = useState(false);

  const pollingTimerRef = useRef<any>(null);

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

  // 2. Check URL parameters on mount for order redirect (e.g. ?order_id=... or ?session_id=...)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const orderIdParam = params.get('order_id') || params.get('orderId');

    if (orderIdParam && currentOrganization?.id) {
      const loadExistingOrder = async () => {
        try {
          const res = await apiFetch(
            `/api/organizations/${currentOrganization.id}/wallet/topup-orders/${orderIdParam}`
          );
          if (res.ok) {
            const data = await res.json();
            setActiveOrder(data.order);
          }
        } catch (err) {
          console.error('Failed to load topup order from URL param:', err);
        }
      };
      loadExistingOrder();
    }
  }, [currentOrganization?.id]);

  // 3. Fetch Dynamic Quote from existing Wallet Engine
  const fetchQuote = useCallback(
    async (amountToQuote: number) => {
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
    },
    [currentOrganization?.id, currencyCode]
  );

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

  // 4. Handle "Continue to Payment": Creates PENDING order -> Creates Checkout Session
  const handleContinueToPayment = async () => {
    if (!currentOrganization?.id) return;
    if (activeAmount <= 0) {
      setQuoteError('Please enter a valid top-up amount greater than 0');
      return;
    }

    try {
      setIsSubmittingOrder(true);
      setQuoteError(null);
      setPaymentError(null);

      // Step A: Create PENDING top-up order on server
      const orderRes = await apiFetch(
        `/api/organizations/${currentOrganization.id}/wallet/topup-orders`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            amount: activeAmount,
            currency: currencyCode,
            notes: `Top-up order of RM${activeAmount.toFixed(2)}`,
          }),
        }
      );

      if (!orderRes.ok) {
        const errData = await orderRes.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to create top-up order');
      }

      const orderData = await orderRes.json();
      const newOrder: TopupOrderRecord = orderData.order;
      setActiveOrder(newOrder);

      // Step B: Create Payment Checkout Session on server
      const sessionRes = await apiFetch(
        `/api/organizations/${currentOrganization.id}/wallet/topup-orders/${newOrder.id}/checkout`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        }
      );

      if (!sessionRes.ok) {
        const errData = await sessionRes.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to initialize payment checkout session');
      }

      const sessionData = await sessionRes.json();
      setCheckoutSession(sessionData.session);
      setShowPaymentModal(true);
    } catch (err: any) {
      console.error('Payment initialization error:', err);
      setQuoteError(err.message || 'Failed to start payment flow');
    } finally {
      setIsSubmittingOrder(false);
    }
  };

  // 5. Poll server for verified payment status (Zero trust in frontend data)
  const pollOrderStatus = useCallback(
    async (orderId: string, maxAttempts = 15) => {
      if (!currentOrganization?.id) return;

      setIsPollingStatus(true);
      let attempts = 0;

      const check = async () => {
        try {
          attempts++;
          const res = await apiFetch(
            `/api/organizations/${currentOrganization.id}/wallet/topup-orders/${orderId}`
          );

          if (res.ok) {
            const data = await res.json();
            const order: TopupOrderRecord = data.order;
            setActiveOrder(order);

            if (order.status === 'PAID') {
              setIsPollingStatus(false);
              setShowPaymentModal(false);
              await fetchWallet();
              window.dispatchEvent(new CustomEvent('wallet_updated'));
              return;
            }

            if (['FAILED', 'CANCELLED', 'EXPIRED'].includes(order.status)) {
              setIsPollingStatus(false);
              setShowPaymentModal(false);
              return;
            }
          }
        } catch (err) {
          console.error('Polling error:', err);
        }

        if (attempts < maxAttempts) {
          pollingTimerRef.current = setTimeout(check, 2000);
        } else {
          setIsPollingStatus(false);
        }
      };

      check();
    },
    [currentOrganization?.id, fetchWallet]
  );

  useEffect(() => {
    return () => {
      if (pollingTimerRef.current) {
        clearTimeout(pollingTimerRef.current);
      }
    };
  }, []);

  // 6. Simulate / Trigger Payment Provider Webhook Dispatch
  const handleSimulatePaymentCompletion = async (statusToTrigger: 'payment.succeeded' | 'payment.failed') => {
    if (!currentOrganization?.id || !activeOrder?.id) return;

    try {
      setIsProcessingPayment(true);
      setPaymentError(null);

      const res = await apiFetch(`/api/developer/wallet/test-webhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: activeOrder.id,
          eventType: statusToTrigger,
          failureReason:
            statusToTrigger === 'payment.failed'
              ? 'Card declined by issuing bank (Insufficient funds)'
              : undefined,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to dispatch payment webhook');
      }

      // Close payment modal and poll verified server record
      setShowPaymentModal(false);
      await pollOrderStatus(activeOrder.id, 5);
    } catch (err: any) {
      console.error('Payment simulation error:', err);
      setPaymentError(err.message || 'Payment processing error');
    } finally {
      setIsProcessingPayment(false);
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

  const handleResetForNewTopUp = () => {
    setActiveOrder(null);
    setCheckoutSession(null);
    setShowPaymentModal(false);
    setQuoteError(null);
    setPaymentError(null);
    setActiveAmount(6000);
    setSelectedPreset(6000);
    setCustomAmountInput('6000');
    // Clear URL params
    if (window.location.search) {
      window.history.replaceState({}, '', window.location.pathname);
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

  // =========================================================================
  // VIEW RENDER: 1. PAYMENT RESULT SCREENS (PAID or FAILED)
  // =========================================================================
  if (activeOrder && activeOrder.status === 'PAID') {
    const topUpAmount = activeOrder.top_up_amount;
    const creditAmount = activeOrder.expected_credit_amount;
    const totalAdded = topUpAmount + creditAmount;

    return (
      <div className="max-w-xl mx-auto px-4 py-12 animate-in fade-in zoom-in-95 duration-300">
        <div className="bg-slate-900 border border-emerald-500/40 rounded-3xl p-8 sm:p-10 space-y-8 shadow-2xl text-center">
          {/* Success Badge */}
          <div className="inline-flex p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-3xl text-emerald-400">
            <CheckCircle2 className="w-12 h-12 stroke-[2.5]" />
          </div>

          <div className="space-y-2">
            <h1 className="text-3xl font-black text-slate-100 tracking-tight">Payment Successful</h1>
            <p className="text-sm text-slate-400">
              Your payment has been verified by the payment provider. Your wallet has been credited with separate ledger entries.
            </p>
          </div>

          {/* Payment Result Breakdown Card */}
          <div className="bg-slate-950/90 border border-slate-800 rounded-2xl p-6 space-y-4 text-left font-mono">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3.5">
              <span className="text-xs uppercase font-bold text-slate-400">Top Up</span>
              <span className="text-base font-bold text-slate-100">{formatCurrency(topUpAmount)}</span>
            </div>

            <div className="flex items-center justify-between border-b border-slate-800 pb-3.5">
              <span className="text-xs uppercase font-bold text-slate-400 flex items-center gap-1.5 font-sans">
                <Sparkles className="w-4 h-4 text-cyan-400" />
                <span>Top-up Credit</span>
              </span>
              <span className="text-base font-bold text-cyan-400">+{formatCurrency(creditAmount)}</span>
            </div>

            <div className="flex items-center justify-between pt-1">
              <span className="text-xs uppercase font-bold text-slate-200 font-sans">Wallet Value Added</span>
              <span className="text-xl font-black text-amber-400">{formatCurrency(totalAdded)}</span>
            </div>
          </div>

          {/* Meta Details */}
          <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800/80 text-xs space-y-1.5 text-slate-400">
            <div className="flex items-center justify-between">
              <span>Order Reference</span>
              <span className="font-mono text-slate-200">{activeOrder.id}</span>
            </div>
            {activeOrder.payment_reference && (
              <div className="flex items-center justify-between">
                <span>Payment Reference</span>
                <span className="font-mono text-slate-200">{activeOrder.payment_reference}</span>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span>Ledger Verification</span>
              <span className="text-emerald-400 font-semibold flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5" /> Settled via Webhook
              </span>
            </div>
          </div>

          {/* Action CTAs */}
          <div className="space-y-3 pt-2">
            <button
              onClick={handleBack}
              className="w-full py-4 px-6 rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-base shadow-xl transition-all cursor-pointer flex items-center justify-center gap-2"
            >
              <span>Back to Wallet</span>
              <ArrowRight className="w-5 h-5" />
            </button>

            <button
              onClick={handleResetForNewTopUp}
              className="w-full py-3 px-4 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition-colors cursor-pointer"
            >
              Make Another Top Up
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (activeOrder && ['FAILED', 'CANCELLED', 'EXPIRED'].includes(activeOrder.status)) {
    return (
      <div className="max-w-xl mx-auto px-4 py-12 animate-in fade-in zoom-in-95 duration-300">
        <div className="bg-slate-900 border border-rose-500/40 rounded-3xl p-8 sm:p-10 space-y-8 text-center shadow-2xl">
          {/* Failed Badge */}
          <div className="inline-flex p-4 bg-rose-500/10 border border-rose-500/30 rounded-3xl text-rose-400">
            <XCircle className="w-12 h-12 stroke-[2.5]" />
          </div>

          <div className="space-y-2">
            <h1 className="text-3xl font-black text-slate-100 tracking-tight">Payment Failed</h1>
            <p className="text-sm font-semibold text-rose-300">No wallet balance was added.</p>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              Your payment provider did not confirm this transaction or it was cancelled. Your wallet balance remains untouched.
            </p>
          </div>

          {/* Order Reference Box */}
          <div className="bg-slate-950/90 border border-slate-800 rounded-2xl p-5 text-left text-xs font-mono space-y-2">
            <div className="flex items-center justify-between text-slate-400">
              <span>Order ID</span>
              <span className="text-slate-200">{activeOrder.id.slice(0, 8)}...</span>
            </div>
            <div className="flex items-center justify-between text-slate-400">
              <span>Status</span>
              <span className="text-rose-400 font-bold">{activeOrder.status}</span>
            </div>
            <div className="flex items-center justify-between text-slate-400">
              <span>Attempted Amount</span>
              <span className="text-slate-200">{formatCurrency(activeOrder.top_up_amount)}</span>
            </div>
          </div>

          {/* Action CTAs */}
          <div className="space-y-3 pt-2">
            <button
              onClick={handleResetForNewTopUp}
              className="w-full py-4 px-6 rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-base shadow-xl transition-all cursor-pointer flex items-center justify-center gap-2"
            >
              <RefreshCw className="w-5 h-5" />
              <span>Try Again</span>
            </button>

            <button
              onClick={handleBack}
              className="w-full py-3 px-4 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition-colors cursor-pointer"
            >
              Back to Wallet
            </button>
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // VIEW RENDER: 2. MAIN TOP UP SELECTION & CHECKOUT FLOW
  // =========================================================================
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
              <h1 className="text-2xl sm:text-3xl font-black text-slate-100 tracking-tight flex items-center gap-3">
                <span>Top Up Wallet</span>
                <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  {currentOrganization?.name}
                </span>
              </h1>
              <p className="text-xs sm:text-sm text-slate-400 mt-1">
                Purchase Paid Balance and earn promotional Top-up Credits for event launches.
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

      {/* 2. Main Top Up Selection & Order Summary Grid */}
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

          {/* Business Rules & Balance Pools Policy Guide */}
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
                  Promotional reward (5% on RM6,000+, 7% on RM10,000+). Usable up to 20% (RM280) per event launch.
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

        {/* Right Column (5 cols): Order Summary & Payment CTA */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-slate-900 border border-amber-500/30 rounded-3xl p-6 sm:p-7 space-y-6 shadow-xl sticky top-24">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <h2 className="text-lg font-black text-slate-100 flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-amber-400" />
                <span>Order Summary</span>
              </h2>
              {loadingQuote && <RefreshCw className="w-3.5 h-3.5 text-amber-400 animate-spin" />}
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
                  <span>Connecting to Payment Gateway...</span>
                </>
              ) : (
                <>
                  <span>Continue to Payment</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>

            <div className="text-center text-[10px] text-slate-500 flex items-center justify-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-emerald-400" />
              <span>256-bit Encrypted Payment Gateway • Webhook Verified</span>
            </div>
          </div>
        </div>
      </div>

      {/* =========================================================================
          3. SECURE PAYMENT GATEWAY CHECKOUT MODAL (Phase 4 Payment Provider)
         ========================================================================= */}
      {showPaymentModal && activeOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl p-6 sm:p-8 max-w-lg w-full space-y-6 shadow-2xl relative">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400">
                  <Lock className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-100">Secure Payment Checkout</h3>
                  <p className="text-xs text-slate-400">Order #{activeOrder.id.slice(0, 8)}</p>
                </div>
              </div>

              <button
                onClick={() => setShowPaymentModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Payment Amount Card */}
            <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 flex items-center justify-between">
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Total Due</span>
                <span className="text-xs text-slate-300">Top-Up Deposit</span>
              </div>
              <div className="text-right">
                <span className="font-mono text-2xl font-black text-amber-400">
                  {formatCurrency(activeOrder.top_up_amount)}
                </span>
                <span className="block text-[10px] text-cyan-400">
                  +{formatCurrency(activeOrder.expected_credit_amount)} Bonus Included
                </span>
              </div>
            </div>

            {/* Payment Method Selection */}
            <div className="space-y-3">
              <label className="text-xs font-bold text-slate-300">Select Payment Method</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setSelectedPaymentMethod('card')}
                  className={`p-3 rounded-xl border flex flex-col items-center gap-2 transition-all cursor-pointer ${
                    selectedPaymentMethod === 'card'
                      ? 'border-amber-500 bg-amber-500/10 text-slate-100 ring-2 ring-amber-500/20'
                      : 'border-slate-800 bg-slate-950/60 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <CreditCard className="w-6 h-6 text-amber-400" />
                  <span className="text-xs font-bold">Credit / Debit Card</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedPaymentMethod('fpx')}
                  className={`p-3 rounded-xl border flex flex-col items-center gap-2 transition-all cursor-pointer ${
                    selectedPaymentMethod === 'fpx'
                      ? 'border-amber-500 bg-amber-500/10 text-slate-100 ring-2 ring-amber-500/20'
                      : 'border-slate-800 bg-slate-950/60 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <Building className="w-6 h-6 text-cyan-400" />
                  <span className="text-xs font-bold">Online Banking (FPX)</span>
                </button>
              </div>
            </div>

            {/* Payment Error Display */}
            {paymentError && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                <span>{paymentError}</span>
              </div>
            )}

            {/* Security Notice */}
            <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 text-[11px] text-slate-400 space-y-1">
              <strong className="text-slate-300 block flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                Cryptographic Webhook Settlement
              </strong>
              <p>
                Funds are credited strictly after verified HMAC webhook confirmation from the payment gateway.
              </p>
            </div>

            {/* Payment CTAs */}
            <div className="space-y-2.5 pt-2">
              <button
                type="button"
                disabled={isProcessingPayment || isPollingStatus}
                onClick={() => handleSimulatePaymentCompletion('payment.succeeded')}
                className="w-full py-3.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm shadow-lg transition-all cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isProcessingPayment ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Processing Payment...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Pay {formatCurrency(activeOrder.top_up_amount)} (Simulate Succeeded)</span>
                  </>
                )}
              </button>

              <button
                type="button"
                disabled={isProcessingPayment || isPollingStatus}
                onClick={() => handleSimulatePaymentCompletion('payment.failed')}
                className="w-full py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-rose-300 text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <XCircle className="w-3.5 h-3.5 text-rose-400" />
                <span>Simulate Failed Payment</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
