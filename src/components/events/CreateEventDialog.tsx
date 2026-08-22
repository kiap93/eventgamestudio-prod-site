import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { apiFetch } from '../../lib/api';
import { PaymentMode, EventQuoteOption, EventPaymentCalculation, WalletBalanceSummary } from '../../types';
import {
  X,
  Calendar,
  Clock,
  Sparkles,
  Gamepad2,
  Check,
  AlertCircle,
  Wallet,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  RefreshCw,
  PlusCircle,
  ChevronRight,
  CreditCard,
  Building2,
  Layers,
} from 'lucide-react';

interface GameThemeOption {
  id: string;
  name: string;
  slug: string;
  game_id?: string | null;
  game_name?: string;
  game_slug?: string;
  status?: string;
}

interface CreateEventDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onEventCreated: (newEvent: any) => void;
}

type DialogStep = 'configure' | 'payment' | 'success';
type DurationPreset = '1day' | '2days' | '3days' | '7days' | 'custom';

export const CreateEventDialog: React.FC<CreateEventDialogProps> = ({
  isOpen,
  onClose,
  onEventCreated,
}) => {
  const { currentOrganization } = useAuth();

  // Wizard Step
  const [step, setStep] = useState<DialogStep>('configure');

  // Form Fields
  const [name, setName] = useState('');
  const [selectedThemeId, setSelectedThemeId] = useState<string>('');
  const [themes, setThemes] = useState<GameThemeOption[]>([]);
  const [loadingThemes, setLoadingThemes] = useState(false);

  // Duration & Dates
  const [durationPreset, setDurationPreset] = useState<DurationPreset>('1day');
  const getInitialDates = () => {
    const start = new Date();
    start.setMinutes(Math.ceil(start.getMinutes() / 5) * 5, 0, 0);
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);

    const formatForInput = (d: Date) => {
      const pad = (n: number) => n.toString().padStart(2, '0');
      const year = d.getFullYear();
      const month = pad(d.getMonth() + 1);
      const day = pad(d.getDate());
      const hours = pad(d.getHours());
      const mins = pad(d.getMinutes());
      return `${year}-${month}-${day}T${hours}:${mins}`;
    };

    return {
      startsAt: formatForInput(start),
      expiresAt: formatForInput(end),
    };
  };

  const [startsAt, setStartsAt] = useState(() => getInitialDates().startsAt);
  const [expiresAt, setExpiresAt] = useState(() => getInitialDates().expiresAt);

  // Quote & Payment State
  const [wallet, setWallet] = useState<WalletBalanceSummary | null>(null);
  const [loadingQuote, setLoadingQuote] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [activeCalculation, setActiveCalculation] = useState<EventPaymentCalculation | null>(null);
  const [bestPaymentMode, setBestPaymentMode] = useState<PaymentMode>('FULL_PAID');

  // Payment Execution & Success State
  const [submittingPayment, setSubmittingPayment] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [successData, setSuccessData] = useState<{
    event: any;
    paidAmount: number;
    remainingBalance: number;
  } | null>(null);

  // Inline Top-Up State
  const [showInlineTopUp, setShowInlineTopUp] = useState(false);
  const [inlineTopUpAmount, setInlineTopUpAmount] = useState<number>(1400);
  const [isSubmittingTopUp, setIsSubmittingTopUp] = useState(false);
  const [topUpSuccessNotice, setTopUpSuccessNotice] = useState<string | null>(null);

  // Format currency
  const formatCurrency = (amount?: number | null, currency: string = 'MYR') => {
    const num = Number(amount) || 0;
    const formatted = num % 1 === 0
      ? num.toLocaleString('en-US')
      : num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const prefix = currency === 'MYR' ? 'RM' : currency === 'USD' ? '$' : currency === 'SGD' ? 'S$' : currency;
    return `${prefix}${formatted}`;
  };

  // Helper for human-readable Event Date
  const formatEventDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return d.toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
    } catch {
      return dateStr;
    }
  };

  // Helper for human-readable Duration
  const calculateDurationLabel = (startStr: string, endStr: string, preset: DurationPreset) => {
    if (preset === '1day') return '1 Day';
    if (preset === '2days') return '2 Days';
    if (preset === '3days') return '3 Days';
    if (preset === '7days') return '7 Days';

    const s = new Date(startStr).getTime();
    const e = new Date(endStr).getTime();
    if (isNaN(s) || isNaN(e) || e <= s) return '1 Day';
    const diffHours = (e - s) / (1000 * 60 * 60);
    if (Math.abs(diffHours - 24) < 0.5) return '1 Day';
    if (Math.abs(diffHours - 48) < 0.5) return '2 Days';
    if (Math.abs(diffHours - 72) < 0.5) return '3 Days';
    if (Math.abs(diffHours - 168) < 0.5) return '7 Days';
    if (diffHours < 24) return `${Math.max(1, Math.round(diffHours))} Hours`;
    return `${Math.round(diffHours / 24)} Days`;
  };

  // Handle Duration Preset selection
  const handleDurationPresetChange = (preset: DurationPreset) => {
    setDurationPreset(preset);
    const start = new Date(startsAt);
    if (isNaN(start.getTime())) return;

    let hoursToAdd = 24;
    if (preset === '1day') hoursToAdd = 24;
    else if (preset === '2days') hoursToAdd = 48;
    else if (preset === '3days') hoursToAdd = 72;
    else if (preset === '7days') hoursToAdd = 168;
    else return; // Custom keeps existing expiresAt

    const end = new Date(start.getTime() + hoursToAdd * 60 * 60 * 1000);
    const pad = (n: number) => n.toString().padStart(2, '0');
    const year = end.getFullYear();
    const month = pad(end.getMonth() + 1);
    const day = pad(end.getDate());
    const hours = pad(end.getHours());
    const mins = pad(end.getMinutes());
    setExpiresAt(`${year}-${month}-${day}T${hours}:${mins}`);
  };

  // Fetch Game Themes on dialog open
  useEffect(() => {
    if (!isOpen) return;

    const fetchThemes = async () => {
      try {
        setLoadingThemes(true);
        const res = await apiFetch('/api/themes');
        if (!res.ok) throw new Error('Failed to fetch game themes');
        const data = await res.json();
        const list = (data.themes || []) as GameThemeOption[];
        setThemes(list);

        if (list.length > 0 && !selectedThemeId) {
          setSelectedThemeId(list[0].id);
        }
      } catch (err: any) {
        console.error('Error fetching themes for event:', err);
      } finally {
        setLoadingThemes(false);
      }
    };

    fetchThemes();
  }, [isOpen]);

  // Fetch Wallet & Calculate Optimal Credit
  const fetchWalletAndQuote = async (targetThemeId?: string) => {
    if (!isOpen || !currentOrganization) return;
    const themeId = targetThemeId || selectedThemeId;

    try {
      setLoadingQuote(true);
      setQuoteError(null);

      // 1. Fetch current wallet balance
      const walletRes = await apiFetch(`/api/organizations/${currentOrganization.id}/wallet`);
      if (!walletRes.ok) throw new Error('Failed to fetch wallet summary');
      const walletData = await walletRes.json();
      const currentWallet = walletData.wallet as WalletBalanceSummary;
      setWallet(currentWallet);

      // 2. Determine best payment mode automatically based on priority:
      // Priority 1: Welcome Credit (one-time, up to 800)
      // Priority 2: Showcase Credit (up to 300)
      // Priority 3: Event Credit (Top-up credit, up to 20% cap = 280)
      // Priority 4: Wallet Balance (Full Paid)
      const welcome = Number(currentWallet?.welcome_credit) || 0;
      const showcase = Number(currentWallet?.showcase_credit) || 0;
      const topupCredit = Number(currentWallet?.topup_credit) || 0;

      let optimalMode: PaymentMode = 'FULL_PAID';
      if (welcome > 0) {
        optimalMode = 'WELCOME_CREDIT';
      } else if (showcase > 0) {
        optimalMode = 'SHOWCASE_CREDIT';
      } else if (topupCredit > 0) {
        optimalMode = 'TOPUP_CREDIT';
      } else {
        optimalMode = 'FULL_PAID';
      }
      setBestPaymentMode(optimalMode);

      // 3. Request official server quote for this mode
      const quoteRes = await apiFetch('/api/events/quote', {
        method: 'POST',
        body: JSON.stringify({
          game_theme_id: themeId || undefined,
          payment_mode: optimalMode,
        }),
      });

      if (!quoteRes.ok) {
        const errData = await quoteRes.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to calculate pricing');
      }

      const quoteData = await quoteRes.json();
      setActiveCalculation(quoteData.calculation || null);
    } catch (err: any) {
      console.error('Error fetching event quote:', err);
      setQuoteError(err.message || 'Unable to calculate event price');
    } finally {
      setLoadingQuote(false);
    }
  };

  // Trigger quote refresh when dialog opens or theme changes
  useEffect(() => {
    if (isOpen) {
      fetchWalletAndQuote(selectedThemeId);
    }
  }, [isOpen, selectedThemeId]);

  // Listen for global wallet updates
  useEffect(() => {
    const handleWalletUpdated = () => {
      if (isOpen) {
        fetchWalletAndQuote(selectedThemeId);
      }
    };
    window.addEventListener('wallet_updated', handleWalletUpdated);
    return () => window.removeEventListener('wallet_updated', handleWalletUpdated);
  }, [isOpen, selectedThemeId]);

  if (!isOpen) return null;

  // Selected Theme Details
  const selectedTheme = themes.find((t) => t.id === selectedThemeId) || themes[0];
  const gameDisplayName = selectedTheme?.game_name || 'Catch the Brand';
  const themeDisplayName = selectedTheme?.name || 'Standard Theme';

  // Calculated Pricing Breakdown
  const standardPrice = activeCalculation?.standardPrice ?? 1400;
  const paidAmount = activeCalculation?.paidAmount ?? (
    bestPaymentMode === 'WELCOME_CREDIT' ? 600 :
    bestPaymentMode === 'SHOWCASE_CREDIT' ? 1100 :
    bestPaymentMode === 'TOPUP_CREDIT' ? 1120 : 1400
  );
  const totalDiscount = activeCalculation?.totalDiscount ?? (standardPrice - paidAmount);

  // Credit Applied Label & Explanation
  let creditAppliedLabel = '';
  let creditAppliedExplanation = '';
  if (bestPaymentMode === 'WELCOME_CREDIT' && totalDiscount > 0) {
    creditAppliedLabel = 'Welcome Credit';
    creditAppliedExplanation = `RM${totalDiscount.toLocaleString()} Welcome Credit applied`;
  } else if (bestPaymentMode === 'SHOWCASE_CREDIT' && totalDiscount > 0) {
    creditAppliedLabel = 'Showcase Credit';
    creditAppliedExplanation = `RM${totalDiscount.toLocaleString()} Showcase Credit applied`;
  } else if (bestPaymentMode === 'TOPUP_CREDIT' && totalDiscount > 0) {
    creditAppliedLabel = 'Event Credit';
    creditAppliedExplanation = `RM${totalDiscount.toLocaleString()} Event Credit applied`;
  }

  // Balance & Sufficiency
  const availableBalance = Number(wallet?.paid_balance) || 0;
  const isSufficient = availableBalance >= paidAmount;
  const needAmount = Math.max(0, paidAmount - availableBalance);

  // Reset dialog state on close
  const handleClose = () => {
    setStep('configure');
    setName('');
    setPaymentError(null);
    setSuccessData(null);
    setShowInlineTopUp(false);
    onClose();
  };

  // Step 1 -> Step 2 Validation
  const handleProceedToPayment = (e: React.FormEvent) => {
    e.preventDefault();
    setPaymentError(null);

    if (!name.trim()) {
      setPaymentError('Please enter an event name');
      return;
    }

    if (!selectedThemeId && themes.length > 0) {
      setSelectedThemeId(themes[0].id);
    }

    const startTime = new Date(startsAt).getTime();
    const expiryTime = new Date(expiresAt).getTime();

    if (isNaN(startTime) || isNaN(expiryTime)) {
      setPaymentError('Please provide valid start and expiry dates/times');
      return;
    }

    if (expiryTime <= startTime) {
      setPaymentError('Expiry date must be after Start date');
      return;
    }

    // Set default inline top up amount to the exact needed difference
    if (!isSufficient && needAmount > 0) {
      setInlineTopUpAmount(needAmount);
    }

    setStep('payment');
  };

  // Step 2 -> Pay & Launch Event
  const handleConfirmAndPay = async () => {
    if (!currentOrganization) return;
    setPaymentError(null);

    if (!isSufficient) {
      setShowInlineTopUp(true);
      return;
    }

    try {
      setSubmittingPayment(true);

      const res = await apiFetch('/api/events', {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          game_theme_id: selectedThemeId,
          event_date: startsAt.split('T')[0],
          starts_at: new Date(startsAt).toISOString(),
          expires_at: new Date(expiresAt).toISOString(),
          status: 'scheduled',
          payment_mode: bestPaymentMode,
          topup_credit_requested: activeCalculation?.topupCreditUsed || (bestPaymentMode === 'TOPUP_CREDIT' ? totalDiscount : undefined),
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Payment failed. Please check your wallet balance and try again.');
      }

      const data = await res.json();

      // Dispatch global balance refresh
      window.dispatchEvent(new CustomEvent('wallet_updated'));

      // Calculate remaining balance for confirmation screen
      const newRemainingBalance = Math.max(0, availableBalance - paidAmount);

      setSuccessData({
        event: data.event,
        paidAmount: paidAmount,
        remainingBalance: newRemainingBalance,
      });

      setStep('success');
    } catch (err: any) {
      console.error('Payment error:', err);
      setPaymentError(err.message || 'Payment failed. Please try again.');
    } finally {
      setSubmittingPayment(false);
    }
  };

  // Seamless Inline Top-Up Handler (Does not interrupt event creation)
  const handleExecuteInlineTopUp = async () => {
    if (!currentOrganization) return;
    try {
      setIsSubmittingTopUp(true);
      setPaymentError(null);

      // 1. Create top up order
      const orderRes = await apiFetch(`/api/organizations/${currentOrganization.id}/wallet/topup-orders`, {
        method: 'POST',
        body: JSON.stringify({
          top_up_amount: inlineTopUpAmount,
        }),
      });

      if (!orderRes.ok) {
        const errData = await orderRes.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to create top-up order');
      }

      const orderData = await orderRes.json();
      const orderId = orderData.order?.id;

      // 2. Settle payment directly to credit wallet
      const settleRes = await apiFetch(`/api/organizations/${currentOrganization.id}/wallet/topup-orders/${orderId}/process-status`, {
        method: 'POST',
        body: JSON.stringify({
          target_status: 'PAID',
          simulate_provider_event: true,
        }),
      });

      if (!settleRes.ok) {
        const errData = await settleRes.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to process top-up payment');
      }

      // 3. Trigger wallet update & re-fetch
      window.dispatchEvent(new CustomEvent('wallet_updated'));
      await fetchWalletAndQuote(selectedThemeId);

      setTopUpSuccessNotice(`Successfully added ${formatCurrency(inlineTopUpAmount)} to your wallet!`);
      setTimeout(() => setTopUpSuccessNotice(null), 4000);
      setShowInlineTopUp(false);
    } catch (err: any) {
      console.error('Inline top-up error:', err);
      setPaymentError(err.message || 'Top-up failed. Please try again.');
    } finally {
      setIsSubmittingTopUp(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-200 font-sans">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        
        {/* ================================================================= */}
        {/* STEP 1: CONFIGURE EVENT                                           */}
        {/* ================================================================= */}
        {step === 'configure' && (
          <form onSubmit={handleProceedToPayment} className="flex flex-col flex-1 overflow-hidden">
            {/* Header */}
            <div className="p-6 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-2xl text-amber-400">
                  <Gamepad2 className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-slate-100">Create Event</h2>
                  <p className="text-xs text-slate-400">Set up your event name, game theme, and schedule</p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleClose}
                className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form Body */}
            <div className="p-6 overflow-y-auto space-y-6 flex-1 custom-scrollbar">
              {paymentError && (
                <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center gap-3 text-xs text-rose-400">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{paymentError}</span>
                </div>
              )}

              {/* 1. Event Name */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-300">
                  Event Name <span className="text-amber-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. ABC Company Roadshow"
                  className="w-full px-4 py-3 bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-xl text-slate-100 text-sm focus:outline-none transition-all placeholder:text-slate-600"
                />
              </div>

              {/* 2. Select Game & Theme */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-300">
                  Game & Theme <span className="text-amber-400">*</span>
                </label>
                {loadingThemes ? (
                  <div className="p-4 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
                    <RefreshCw className="w-4 h-4 animate-spin text-amber-400" />
                    <span>Loading available games...</span>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-48 overflow-y-auto pr-1">
                    {themes.map((theme) => {
                      const isSelected = selectedThemeId === theme.id;
                      return (
                        <button
                          key={theme.id}
                          type="button"
                          onClick={() => setSelectedThemeId(theme.id)}
                          className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex items-center justify-between ${
                            isSelected
                              ? 'border-amber-500 bg-amber-500/10 ring-1 ring-amber-500/30 text-slate-100'
                              : 'border-slate-800 bg-slate-950/60 hover:border-slate-700 hover:bg-slate-800/40 text-slate-400'
                          }`}
                        >
                          <div className="truncate mr-2">
                            <div className="text-xs font-bold text-slate-200 truncate">
                              {theme.game_name || 'Catch the Brand'}
                            </div>
                            <div className="text-[11px] text-slate-400 truncate">
                              {theme.name}
                            </div>
                          </div>
                          {isSelected && (
                            <div className="w-4 h-4 rounded-full bg-amber-500 text-slate-950 flex items-center justify-center shrink-0">
                              <Check className="w-2.5 h-2.5 stroke-[3]" />
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* 3. Event Schedule & Duration */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-300">
                    Event Duration & Date <span className="text-amber-400">*</span>
                  </label>
                </div>

                {/* Duration Presets */}
                <div className="grid grid-cols-5 gap-1.5">
                  {(['1day', '2days', '3days', '7days', 'custom'] as DurationPreset[]).map((preset) => {
                    const isSelected = durationPreset === preset;
                    const labels: Record<DurationPreset, string> = {
                      '1day': '1 Day',
                      '2days': '2 Days',
                      '3days': '3 Days',
                      '7days': '7 Days',
                      'custom': 'Custom',
                    };
                    return (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => handleDurationPresetChange(preset)}
                        className={`py-2 px-1 text-center rounded-xl text-xs font-bold transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-amber-500 text-slate-950 shadow-sm'
                            : 'bg-slate-950 border border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                        }`}
                      >
                        {labels[preset]}
                      </button>
                    );
                  })}
                </div>

                {/* Starts At Input */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div className="space-y-1.5">
                    <span className="text-[11px] text-slate-400 font-medium flex items-center gap-1">
                      <Calendar className="w-3 h-3 text-amber-400" /> Start Date & Time
                    </span>
                    <input
                      type="datetime-local"
                      required
                      value={startsAt}
                      onChange={(e) => {
                        setStartsAt(e.target.value);
                        if (durationPreset !== 'custom') {
                          handleDurationPresetChange(durationPreset);
                        }
                      }}
                      className="w-full px-3 py-2.5 bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-xl text-slate-100 text-xs focus:outline-none"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <span className="text-[11px] text-slate-400 font-medium flex items-center gap-1">
                      <Clock className="w-3 h-3 text-amber-400" /> End Date & Time
                    </span>
                    <input
                      type="datetime-local"
                      required
                      disabled={durationPreset !== 'custom'}
                      value={expiresAt}
                      onChange={(e) => setExpiresAt(e.target.value)}
                      className={`w-full px-3 py-2.5 bg-slate-950 border ${
                        durationPreset === 'custom' ? 'border-slate-800 focus:border-amber-500 text-slate-100' : 'border-slate-800/60 text-slate-400 opacity-80 cursor-not-allowed'
                      } rounded-xl text-xs focus:outline-none`}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Footer Action */}
            <div className="p-6 border-t border-slate-800 bg-slate-950/40 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={handleClose}
                className="px-4 py-2.5 rounded-xl border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-slate-200 text-xs font-bold transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!name.trim()}
                className="px-6 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed text-slate-950 font-bold text-sm shadow-md transition-all cursor-pointer flex items-center gap-2"
              >
                <span>Continue to Payment</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </form>
        )}

        {/* ================================================================= */}
        {/* STEP 2: SIMPLIFIED PAYMENT SUMMARY (THE 3 CLEAN SECTIONS)         */}
        {/* ================================================================= */}
        {step === 'payment' && (
          <div className="flex flex-col flex-1 overflow-hidden">
            {/* Header */}
            <div className="p-6 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setStep('configure')}
                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors cursor-pointer"
                  title="Back to Event Configuration"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <div>
                  <h2 className="text-xl font-bold text-slate-100">Payment</h2>
                  <p className="text-xs text-slate-400">Review your event and complete payment</p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleClose}
                className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Payment Content */}
            <div className="p-6 overflow-y-auto space-y-6 flex-1 custom-scrollbar">
              {topUpSuccessNotice && (
                <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center gap-2.5 text-xs text-emerald-400 animate-in fade-in">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                  <span>{topUpSuccessNotice}</span>
                </div>
              )}

              {paymentError && (
                <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center gap-2.5 text-xs text-rose-400">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{paymentError}</span>
                </div>
              )}

              {/* ------------------------------------------------------------- */}
              {/* SECTION A: EVENT SUMMARY                                      */}
              {/* ------------------------------------------------------------- */}
              <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-5 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
                  <h3 className="text-xs uppercase tracking-wider font-bold text-slate-400">
                    Event Summary
                  </h3>
                  <button
                    type="button"
                    onClick={() => setStep('configure')}
                    className="text-[11px] text-amber-400 hover:text-amber-300 font-semibold cursor-pointer"
                  >
                    Edit
                  </button>
                </div>

                <div className="space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Event</span>
                    <span className="font-bold text-slate-100">{name}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Game</span>
                    <span className="font-semibold text-slate-200">
                      {gameDisplayName} <span className="text-slate-500">({themeDisplayName})</span>
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Duration</span>
                    <span className="font-medium text-slate-200">
                      {calculateDurationLabel(startsAt, expiresAt, durationPreset)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Event Date</span>
                    <span className="font-medium text-slate-200">{formatEventDate(startsAt)}</span>
                  </div>
                </div>
              </div>

              {/* ------------------------------------------------------------- */}
              {/* SECTION B: PRICE BREAKDOWN                                    */}
              {/* ------------------------------------------------------------- */}
              <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-5 space-y-3">
                <h3 className="text-xs uppercase tracking-wider font-bold text-slate-400 border-b border-slate-800/80 pb-3">
                  Payment
                </h3>

                <div className="space-y-2 text-xs">
                  {/* Event Price */}
                  <div className="flex items-center justify-between">
                    <span className="text-slate-300">Event Price</span>
                    <span className="font-mono font-bold text-slate-200">
                      {formatCurrency(standardPrice)}
                    </span>
                  </div>

                  {/* Automatically Applied Eligible Credit */}
                  {totalDiscount > 0 && (
                    <div className="flex items-center justify-between text-emerald-400">
                      <div className="flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>{creditAppliedLabel}</span>
                      </div>
                      <span className="font-mono font-bold">
                        - {formatCurrency(totalDiscount)}
                      </span>
                    </div>
                  )}

                  {creditAppliedExplanation && (
                    <div className="text-[11px] text-emerald-400/90 italic pt-0.5">
                      {creditAppliedExplanation}
                    </div>
                  )}

                  {/* Divider */}
                  <div className="border-t border-slate-800 my-2 pt-2 flex items-center justify-between text-sm">
                    <span className="font-bold text-slate-100">Amount to Pay</span>
                    <span className="font-mono font-black text-amber-400 text-base">
                      {formatCurrency(paidAmount)}
                    </span>
                  </div>
                </div>
              </div>

              {/* ------------------------------------------------------------- */}
              {/* SECTION C: PAYMENT & BALANCE STATUS                           */}
              {/* ------------------------------------------------------------- */}
              {!showInlineTopUp ? (
                <div className="space-y-4">
                  {isSufficient ? (
                    /* Sufficient Balance State */
                    <div className="bg-slate-950/40 border border-slate-800 rounded-2xl p-4 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2 text-slate-400">
                        <Wallet className="w-4 h-4 text-amber-400" />
                        <span>Available Balance</span>
                      </div>
                      <span className="font-mono font-bold text-slate-200">
                        {formatCurrency(availableBalance)}
                      </span>
                    </div>
                  ) : (
                    /* Insufficient Balance State */
                    <div className="bg-amber-500/5 border border-amber-500/30 rounded-2xl p-5 space-y-3">
                      <div className="flex items-center gap-2 text-amber-400 font-bold text-xs">
                        <AlertCircle className="w-4 h-4" />
                        <span>Insufficient Balance</span>
                      </div>
                      <div className="space-y-1.5 text-xs">
                        <div className="flex items-center justify-between text-slate-400">
                          <span>Required</span>
                          <span className="font-mono text-slate-200">{formatCurrency(paidAmount)}</span>
                        </div>
                        <div className="flex items-center justify-between text-slate-400">
                          <span>Available</span>
                          <span className="font-mono text-slate-200">{formatCurrency(availableBalance)}</span>
                        </div>
                        <div className="flex items-center justify-between text-amber-400 font-bold border-t border-amber-500/20 pt-1.5">
                          <span>Need</span>
                          <span className="font-mono">{formatCurrency(needAmount)}</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Payment CTAs */}
                  <div className="space-y-2 pt-2">
                    {isSufficient ? (
                      <button
                        type="button"
                        onClick={handleConfirmAndPay}
                        disabled={submittingPayment}
                        className="w-full py-3.5 px-6 rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-sm shadow-xl transition-all cursor-pointer flex items-center justify-center gap-2"
                      >
                        {submittingPayment ? (
                          <>
                            <RefreshCw className="w-4 h-4 animate-spin" />
                            <span>Processing Payment...</span>
                          </>
                        ) : (
                          <span>Pay {formatCurrency(paidAmount)}</span>
                        )}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setInlineTopUpAmount(needAmount > 0 ? needAmount : 1400);
                          setShowInlineTopUp(true);
                        }}
                        className="w-full py-3.5 px-6 rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-sm shadow-xl transition-all cursor-pointer flex items-center justify-center gap-2"
                      >
                        <PlusCircle className="w-4 h-4" />
                        <span>Top Up {formatCurrency(needAmount)}</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={handleClose}
                      className="w-full py-2.5 px-4 rounded-xl text-slate-400 hover:text-slate-200 text-xs font-semibold transition-colors cursor-pointer text-center"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                /* ----------------------------------------------------------- */
                /* INLINE TOP-UP VIEW (Seamless, non-interruptive)             */
                /* ----------------------------------------------------------- */
                <div className="bg-slate-950 border border-amber-500/40 rounded-2xl p-5 space-y-4 animate-in fade-in">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                    <div className="flex items-center gap-2">
                      <Wallet className="w-4 h-4 text-amber-400" />
                      <h4 className="text-xs font-bold text-slate-100">Top Up Wallet</h4>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowInlineTopUp(false)}
                      className="text-[11px] text-slate-400 hover:text-slate-200 cursor-pointer"
                    >
                      Back
                    </button>
                  </div>

                  <p className="text-xs text-slate-400">
                    Select a top up amount to complete this event launch without restarting.
                  </p>

                  {/* Preset Options */}
                  <div className="grid grid-cols-2 gap-2">
                    {Array.from(new Set([needAmount, 1400, 3000, 6000, 10000]))
                      .filter((amt) => amt > 0)
                      .slice(0, 4)
                      .map((amt) => {
                        const isSelected = inlineTopUpAmount === amt;
                        let label = formatCurrency(amt);
                        if (amt === needAmount) label += ' (Exact Need)';
                        else if (amt === 6000) label += ' (+RM300 reward)';
                        else if (amt === 10000) label += ' (+RM700 reward)';

                        return (
                          <button
                            key={amt}
                            type="button"
                            onClick={() => setInlineTopUpAmount(amt)}
                            className={`p-3 rounded-xl border text-left text-xs font-bold transition-all cursor-pointer ${
                              isSelected
                                ? 'border-amber-500 bg-amber-500/10 text-amber-300 ring-1 ring-amber-500/30'
                                : 'border-slate-800 bg-slate-900 text-slate-300 hover:border-slate-700'
                            }`}
                          >
                            <div>{formatCurrency(amt)}</div>
                            <div className="text-[10px] text-slate-500 font-normal">
                              {amt === needAmount ? 'Exact Need' : amt >= 6000 ? 'Includes Reward' : 'Package'}
                            </div>
                          </button>
                        );
                      })}
                  </div>

                  {/* Submit Inline Top Up CTA */}
                  <div className="space-y-2 pt-2">
                    <button
                      type="button"
                      onClick={handleExecuteInlineTopUp}
                      disabled={isSubmittingTopUp}
                      className="w-full py-3 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition-all cursor-pointer flex items-center justify-center gap-2"
                    >
                      {isSubmittingTopUp ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>Processing Top Up...</span>
                        </>
                      ) : (
                        <span>Confirm Top Up {formatCurrency(inlineTopUpAmount)}</span>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowInlineTopUp(false)}
                      className="w-full py-1.5 text-center text-slate-500 hover:text-slate-300 text-xs font-medium cursor-pointer"
                    >
                      Cancel Top Up
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* STEP 3: PAYMENT CONFIRMATION (SECTION 9)                          */}
        {/* ================================================================= */}
        {step === 'success' && successData && (
          <div className="p-8 sm:p-10 space-y-6 text-center animate-in zoom-in-95 duration-200">
            {/* Green Checkmark */}
            <div className="inline-flex p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-full text-emerald-400">
              <CheckCircle2 className="w-12 h-12 stroke-[2.5]" />
            </div>

            <div className="space-y-1.5">
              <h2 className="text-2xl font-black text-slate-100">Payment Successful</h2>
              <p className="text-xs text-slate-400">Your event has been scheduled and deployed successfully.</p>
            </div>

            {/* Summary Details */}
            <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-5 text-left text-xs space-y-2.5 max-w-sm mx-auto">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Event</span>
                <span className="font-bold text-slate-100">{successData.event?.name || name}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Paid</span>
                <span className="font-mono font-bold text-emerald-400">
                  {formatCurrency(successData.paidAmount)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Remaining Balance</span>
                <span className="font-mono font-bold text-amber-400">
                  {formatCurrency(successData.remainingBalance)}
                </span>
              </div>
            </div>

            {/* View Event Button */}
            <div className="pt-2">
              <button
                type="button"
                onClick={() => {
                  onEventCreated(successData.event);
                  handleClose();
                }}
                className="w-full py-3.5 px-6 rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-sm shadow-xl transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                <span>View Event</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
