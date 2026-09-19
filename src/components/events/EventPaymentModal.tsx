import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { apiFetch } from '../../lib/api';
import {
  PaymentMode,
  EventPaymentCalculation,
  WalletBalanceSummary,
  TopupOrderRecord,
  PaymentCheckoutSession,
} from '../../types';
import { PaymentCheckoutModal } from '../wallet/PaymentCheckoutModal';
import {
  X,
  Sparkles,
  Wallet,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  PlusCircle,
  CreditCard,
  Gamepad2,
  ArrowRight,
  Calendar,
  Check,
} from 'lucide-react';

interface EventPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  event: any;
  onPaymentSuccess: (updatedEvent: any) => void;
}

export const EventPaymentModal: React.FC<EventPaymentModalProps> = ({
  isOpen,
  onClose,
  event,
  onPaymentSuccess,
}) => {
  const { currentOrganization } = useAuth();

  const [wallet, setWallet] = useState<WalletBalanceSummary | null>(null);
  const [loadingQuote, setLoadingQuote] = useState(true);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [activeCalculation, setActiveCalculation] = useState<EventPaymentCalculation | null>(null);

  // Credit checkboxes (welcome credit only enabled if available in wallet)
  const [useWelcomeCredit, setUseWelcomeCredit] = useState(false);
  const [useEventCredit, setUseEventCredit] = useState(true);

  const [submittingPayment, setSubmittingPayment] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [successEvent, setSuccessEvent] = useState<any | null>(null);

  // Top-Up State for Insufficient Balance
  const [isSubmittingTopUp, setIsSubmittingTopUp] = useState(false);
  const [activeCheckoutOrder, setActiveCheckoutOrder] = useState<TopupOrderRecord | null>(null);
  const [checkoutSession, setCheckoutSession] = useState<PaymentCheckoutSession | null>(null);
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);
  const [topUpSuccessNotice, setTopUpSuccessNotice] = useState<string | null>(null);

  const formatCurrency = (amount?: number | null, currency: string = 'MYR') => {
    const num = Number(amount) || 0;
    const formatted =
      num % 1 === 0
        ? num.toLocaleString('en-US')
        : num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const prefix = currency === 'MYR' ? 'RM' : currency === 'USD' ? '$' : currency === 'SGD' ? 'S$' : currency;
    return `${prefix}${formatted}`;
  };

  const fetchWallet = async () => {
    if (!isOpen || !event) return;
    const orgId = event.organization_id || currentOrganization?.id;
    if (!orgId) return;

    try {
      setLoadingQuote(true);
      setQuoteError(null);

      // Fetch wallet balance
      let hasWelcome = false;
      const walletRes = await apiFetch(`/api/organizations/${orgId}/wallet`);
      if (walletRes.ok) {
        const wData = await walletRes.json();
        const wl = wData.wallet || wData;
        setWallet(wl);
        if (Number(wl?.welcome_credit ?? 0) > 0) {
          hasWelcome = true;
          setUseWelcomeCredit(true);
        } else {
          setUseWelcomeCredit(false);
        }
      }

      // Fetch quote for pricing validation
      const quoteRes = await apiFetch('/api/events/quote', {
        method: 'POST',
        body: JSON.stringify({
          event_id: event.id,
          game_theme_id: event.game_theme_id || event.game_theme?.id,
          payment_mode: 'COMBINED_CREDIT',
          event_price: event.event_price || undefined,
          start_date: event.start_date || undefined,
          end_date: event.end_date || undefined,
          use_welcome_credit: hasWelcome,
          use_event_credit: true,
        }),
      });

      if (!quoteRes.ok) {
        const errData = await quoteRes.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to calculate payment quote');
      }

      const quoteData = await quoteRes.json();
      if (quoteData.calculation) {
        setActiveCalculation(quoteData.calculation);
      }
      if (quoteData.wallet) {
        setWallet(quoteData.wallet);
      }
    } catch (err: any) {
      console.error('Error fetching event payment quote:', err);
      setQuoteError(err.message || 'Unable to fetch payment details');
    } finally {
      setLoadingQuote(false);
    }
  };

  useEffect(() => {
    if (isOpen && event) {
      setSuccessEvent(null);
      setPaymentError(null);
      setUseWelcomeCredit(true);
      setUseEventCredit(true);
      fetchWallet();
    }
  }, [isOpen, event?.id]);

  if (!isOpen || !event) return null;

  // Pricing & Balances - Authoritative from server calculation / event record
  const eventPrice = Number(activeCalculation?.eventPrice ?? event.event_price ?? 0);
  const availableWelcomeCredit = Number(wallet?.welcome_credit ?? 0);
  const availableEventCredit = Number(wallet?.topup_credit ?? 0);
  const availablePaidBalance = Number(wallet?.paid_balance ?? 0);

  // Maximum allowed event credit: 20% of event price
  const maxEventCredit = Math.round(eventPrice * 0.20);

  // Dynamic Credit Deductions based on checkboxes
  const eligibleWelcomeCredit = Math.min(availableWelcomeCredit, eventPrice);
  const eligibleEventCredit = Math.min(availableEventCredit, maxEventCredit);

  const welcomeCreditUsed = useWelcomeCredit && availableWelcomeCredit > 0 ? eligibleWelcomeCredit : 0;
  const remainingPriceAfterWelcome = Math.max(0, eventPrice - welcomeCreditUsed);
  const eventCreditUsed = useEventCredit && availableEventCredit > 0 ? Math.min(eligibleEventCredit, remainingPriceAfterWelcome) : 0;

  const totalDiscount = welcomeCreditUsed + eventCreditUsed;
  const amountRequired = Math.max(0, eventPrice - totalDiscount);
  const shortfall = Math.max(0, amountRequired - availablePaidBalance);
  const isInsufficientBalance = !loadingQuote && !quoteError && wallet !== null && shortfall > 0;

  const handleConfirmPay = async () => {
    setPaymentError(null);
    try {
      setSubmittingPayment(true);

      let resolvedPaymentMode: PaymentMode = 'FULL_PAID';
      if (welcomeCreditUsed > 0 && eventCreditUsed > 0) {
        resolvedPaymentMode = 'COMBINED_CREDIT';
      } else if (welcomeCreditUsed > 0) {
        resolvedPaymentMode = 'WELCOME_CREDIT';
      } else if (eventCreditUsed > 0) {
        resolvedPaymentMode = 'TOPUP_CREDIT';
      } else {
        resolvedPaymentMode = 'FULL_PAID';
      }

      const res = await apiFetch(`/api/events/${event.id}/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payment_mode: resolvedPaymentMode,
          use_welcome_credit: useWelcomeCredit,
          use_event_credit: useEventCredit,
          welcome_credit_requested: welcomeCreditUsed,
          topup_credit_requested: eventCreditUsed,
          event_price: eventPrice,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        if (res.status === 402 || errData.code === 'INSUFFICIENT_BALANCE') {
          setPaymentError(errData.error || 'Insufficient balance to activate event.');
          fetchWallet();
          return;
        }
        throw new Error(errData.error || errData.message || 'Failed to process payment');
      }

      const data = await res.json();
      window.dispatchEvent(new CustomEvent('wallet_updated'));

      setSuccessEvent(data.event || event);
      onPaymentSuccess(data.event || event);
    } catch (err: any) {
      console.error('Event payment error:', err);
      setPaymentError(err.message || 'Payment processing failed. Please try again.');
    } finally {
      setSubmittingPayment(false);
    }
  };

  // Top Up flow
  const handleStartTopUpFlow = async (amountToTopUp: number) => {
    const orgId = event.organization_id || currentOrganization?.id;
    if (!orgId || amountToTopUp <= 0) return;

    try {
      setIsSubmittingTopUp(true);
      setPaymentError(null);

      const orderRes = await apiFetch(`/api/organizations/${orgId}/wallet/topup-orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: amountToTopUp,
          currency: 'MYR',
          notes: `Top up for event activation: ${event.name}`,
        }),
      });

      if (!orderRes.ok) {
        const errData = await orderRes.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to create top-up order');
      }

      const orderData = await orderRes.json();
      const newOrder: TopupOrderRecord = orderData.order;
      setActiveCheckoutOrder(newOrder);

      const sessionRes = await apiFetch(
        `/api/organizations/${orgId}/wallet/topup-orders/${newOrder.id}/checkout`,
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
      setShowCheckoutModal(true);
    } catch (err: any) {
      console.error('Error starting top-up checkout:', err);
      setPaymentError(err.message || 'Failed to start payment checkout');
    } finally {
      setIsSubmittingTopUp(false);
    }
  };

  const handlePaymentSuccessTopUp = async (settledOrder: TopupOrderRecord) => {
    setShowCheckoutModal(false);
    setActiveCheckoutOrder(null);
    setCheckoutSession(null);
    setPaymentError(null);

    await fetchWallet();

    setTopUpSuccessNotice(
      `Successfully added ${formatCurrency(settledOrder.top_up_amount)} to your wallet! Balance updated.`
    );
    setTimeout(() => setTopUpSuccessNotice(null), 5000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-200 font-sans">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        
        {/* Header */}
        <div className="p-6 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-2xl text-amber-400">
              <CreditCard className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-100">Pay & Activate Event</h2>
              <p className="text-xs text-slate-400">Complete payment to make this event live</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1 custom-scrollbar">
          {successEvent ? (
            /* Success confirmation */
            <div className="space-y-6 text-center py-4 animate-in zoom-in-95">
              <div className="inline-flex p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-full text-emerald-400">
                <CheckCircle2 className="w-12 h-12 stroke-[2.5]" />
              </div>

              <div className="space-y-1.5">
                <h3 className="text-2xl font-black text-slate-100">Event Activated!</h3>
                <p className="text-xs text-slate-400">
                  Payment was confirmed and <strong className="text-slate-200">{event.name}</strong> is now officially live.
                </p>
              </div>

              <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 text-xs space-y-2 text-left">
                <div className="flex items-center justify-between text-slate-400">
                  <span>Status:</span>
                  <span className="font-bold text-emerald-400 uppercase tracking-wider">
                    {successEvent.calculated_status || successEvent.status || 'Active'}
                  </span>
                </div>
                <div className="flex items-center justify-between text-slate-400">
                  <span>Total Paid:</span>
                  <span className="font-bold text-slate-200 font-mono">
                    {formatCurrency(amountRequired)}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="w-full py-3 px-6 rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm shadow-xl transition-all cursor-pointer"
              >
                Close & View Event
              </button>
            </div>
          ) : (
            <>
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

              {/* Event Details Card */}
              <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-4 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-200 truncate">{event.name}</span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30">
                    Pending Payment
                  </span>
                </div>
                <div className="text-[11px] text-slate-400 flex items-center gap-2">
                  <Gamepad2 className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span>{event.game?.name || 'Catch the Brand'}</span>
                  <span>•</span>
                  <span>{event.game_theme?.name || event.name || 'Theme'}</span>
                </div>
                {event.start_date && (
                  <div className="text-[11px] text-slate-400 flex items-center gap-1.5 pt-0.5 border-t border-slate-850">
                    <Calendar className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span>{event.start_date} {event.end_date && event.end_date !== event.start_date ? `to ${event.end_date}` : ''}</span>
                    {event.duration_days && (
                      <span className="text-slate-500 font-mono font-medium">({event.duration_days} days)</span>
                    )}
                  </div>
                )}
              </div>

              {/* Pricing & Credit Summary Card */}
              {loadingQuote ? (
                <div className="bg-slate-950/50 border border-slate-800 rounded-2xl p-6 flex items-center justify-center gap-2 text-xs text-slate-400">
                  <RefreshCw className="w-4 h-4 animate-spin text-amber-400" />
                  <span>Loading payment details...</span>
                </div>
              ) : quoteError ? (
                <div className="bg-rose-500/10 border border-rose-500/20 rounded-2xl p-4 text-xs text-rose-400 flex items-center justify-between">
                  <span>{quoteError}</span>
                  <button
                    type="button"
                    onClick={() => fetchWallet()}
                    className="underline text-rose-300 font-bold ml-2 cursor-pointer"
                  >
                    Retry
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Apply Credits Section */}
                  <div className="space-y-2.5">
                    <div>
                      <h4 className="text-xs font-bold text-slate-200">Apply Credits</h4>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Select the credits you want to use for this event.
                      </p>
                    </div>

                    <div className="space-y-2">
                      {/* Welcome Credit Row */}
                      <div
                        role="checkbox"
                        aria-checked={useWelcomeCredit}
                        tabIndex={availableWelcomeCredit <= 0 ? -1 : 0}
                        onClick={() => {
                          if (availableWelcomeCredit > 0) {
                            setUseWelcomeCredit(!useWelcomeCredit);
                          }
                        }}
                        onKeyDown={(e) => {
                          if ((e.key === ' ' || e.key === 'Enter') && availableWelcomeCredit > 0) {
                            e.preventDefault();
                            setUseWelcomeCredit(!useWelcomeCredit);
                          }
                        }}
                        className={`w-full p-3.5 rounded-xl border transition-all cursor-pointer select-none flex items-center justify-between gap-3 ${
                          availableWelcomeCredit <= 0
                            ? 'opacity-60 cursor-not-allowed border-slate-800 bg-slate-950/40'
                            : useWelcomeCredit
                            ? 'border-emerald-500/50 bg-emerald-500/10 text-slate-100 ring-1 ring-emerald-500/30'
                            : 'border-slate-800 bg-slate-950/60 text-slate-400 hover:border-slate-700 hover:bg-slate-900/40'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className={`w-4 h-4 rounded border flex items-center justify-center transition-colors shrink-0 ${
                              useWelcomeCredit && availableWelcomeCredit > 0
                                ? 'bg-emerald-500 border-emerald-400 text-slate-950'
                                : 'border-slate-700 bg-slate-900'
                            }`}
                          >
                            {useWelcomeCredit && availableWelcomeCredit > 0 && <Check className="w-3 h-3 stroke-[3]" />}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 font-bold text-xs text-slate-200">
                              <Sparkles className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                              <span>Welcome Credit</span>
                            </div>
                            <div className="text-[11px] text-slate-400 mt-0.5 truncate">
                              Available: <span className="font-mono text-slate-300 font-medium">{formatCurrency(availableWelcomeCredit)}</span>
                              {availableWelcomeCredit <= 0 && <span className="text-slate-400 ml-1.5">(No balance)</span>}
                            </div>
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <div className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">
                            {useWelcomeCredit && welcomeCreditUsed > 0 ? 'Applied' : 'Deduction'}
                          </div>
                          <div className={`font-mono font-bold text-xs sm:text-sm ${useWelcomeCredit && welcomeCreditUsed > 0 ? 'text-emerald-400' : 'text-slate-400'}`}>
                            {useWelcomeCredit && welcomeCreditUsed > 0 ? `-${formatCurrency(welcomeCreditUsed)}` : 'RM0.00'}
                          </div>
                        </div>
                      </div>

                      {/* Event Credit Row */}
                      <div
                        role="checkbox"
                        aria-checked={useEventCredit}
                        tabIndex={availableEventCredit <= 0 ? -1 : 0}
                        onClick={() => {
                          if (availableEventCredit > 0) {
                            setUseEventCredit(!useEventCredit);
                          }
                        }}
                        onKeyDown={(e) => {
                          if ((e.key === ' ' || e.key === 'Enter') && availableEventCredit > 0) {
                            e.preventDefault();
                            setUseEventCredit(!useEventCredit);
                          }
                        }}
                        className={`w-full p-3.5 rounded-xl border transition-all cursor-pointer select-none flex items-center justify-between gap-3 ${
                          availableEventCredit <= 0
                            ? 'opacity-60 cursor-not-allowed border-slate-800 bg-slate-950/40'
                            : useEventCredit
                            ? 'border-emerald-500/50 bg-emerald-500/10 text-slate-100 ring-1 ring-emerald-500/30'
                            : 'border-slate-800 bg-slate-950/60 text-slate-400 hover:border-slate-700 hover:bg-slate-900/40'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className={`w-4 h-4 rounded border flex items-center justify-center transition-colors shrink-0 ${
                              useEventCredit && availableEventCredit > 0
                                ? 'bg-emerald-500 border-emerald-400 text-slate-950'
                                : 'border-slate-700 bg-slate-900'
                            }`}
                          >
                            {useEventCredit && availableEventCredit > 0 && <Check className="w-3 h-3 stroke-[3]" />}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 font-bold text-xs text-slate-200">
                              <Sparkles className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                              <span>Event Credit</span>
                            </div>
                            <div className="text-[11px] text-slate-400 mt-0.5 truncate">
                              Available: <span className="font-mono text-slate-300 font-medium">{formatCurrency(availableEventCredit)}</span>
                              {availableEventCredit > 0 && (
                                <span className="text-slate-400 ml-1.5">
                                  (Max 20%: {formatCurrency(maxEventCredit)})
                                </span>
                              )}
                              {availableEventCredit <= 0 && <span className="text-slate-400 ml-1.5">(No balance)</span>}
                            </div>
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <div className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">
                            {useEventCredit && eventCreditUsed > 0 ? 'Applied' : 'Deduction'}
                          </div>
                          <div className={`font-mono font-bold text-xs sm:text-sm ${useEventCredit && eventCreditUsed > 0 ? 'text-emerald-400' : 'text-slate-400'}`}>
                            {useEventCredit && eventCreditUsed > 0 ? `-${formatCurrency(eventCreditUsed)}` : 'RM0.00'}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Itemized Financial Breakdown Summary */}
                  <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-4 space-y-2.5 text-xs">
                    {/* Event Price */}
                    <div className="flex items-center justify-between text-slate-300">
                      <span>Event Price</span>
                      <span className="font-mono font-bold text-slate-100 text-sm">{formatCurrency(eventPrice)}</span>
                    </div>

                    {/* Welcome Credit Applied */}
                    {useWelcomeCredit && welcomeCreditUsed > 0 && (
                      <div className="flex items-center justify-between text-emerald-400">
                        <span className="flex items-center gap-1.5">
                          <Sparkles className="w-3.5 h-3.5 shrink-0" />
                          <span>Welcome Credit Applied</span>
                        </span>
                        <span className="font-mono font-bold">-{formatCurrency(welcomeCreditUsed)}</span>
                      </div>
                    )}

                    {/* Event Credit Applied */}
                    {useEventCredit && eventCreditUsed > 0 && (
                      <div className="flex items-center justify-between text-emerald-400">
                        <span className="flex items-center gap-1.5">
                          <Sparkles className="w-3.5 h-3.5 shrink-0" />
                          <span>Event Credit Applied</span>
                        </span>
                        <span className="font-mono font-bold">-{formatCurrency(eventCreditUsed)}</span>
                      </div>
                    )}

                    {/* Amount Required */}
                    <div className="flex items-center justify-between pt-2 border-t border-slate-800 font-semibold text-slate-100">
                      <span>Amount Required</span>
                      <span className="font-mono font-bold text-amber-400 text-sm sm:text-base">
                        {formatCurrency(amountRequired)}
                      </span>
                    </div>

                    {/* Available Paid Balance */}
                    <div className="flex items-center justify-between pt-1 border-t border-slate-900 text-slate-400">
                      <span className="flex items-center gap-1.5">
                        <Wallet className="w-3.5 h-3.5 text-slate-400" />
                        <span>Available Paid Balance</span>
                      </span>
                      <span className="font-mono font-bold text-slate-200">
                        {formatCurrency(availablePaidBalance)}
                      </span>
                    </div>

                    {/* Additional Payment Required (Shortfall) */}
                    {shortfall > 0 && (
                      <div className="flex items-center justify-between pt-1 border-t border-slate-900 text-rose-400 font-semibold">
                        <span className="flex items-center gap-1.5">
                          <AlertCircle className="w-3.5 h-3.5 text-rose-400" />
                          <span>Additional Payment Required</span>
                        </span>
                        <span className="font-mono font-bold text-rose-400">
                          {formatCurrency(shortfall)}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Insufficient balance notification and top-up */}
                  {isInsufficientBalance && (
                    <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 space-y-3">
                      <div className="flex items-center gap-2 text-xs font-bold text-amber-400">
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        <span>Insufficient Balance</span>
                      </div>
                      <p className="text-xs text-slate-300">
                        You need <span className="font-mono font-bold text-amber-300">{formatCurrency(shortfall)}</span> more to activate this event.
                      </p>
                      <button
                        type="button"
                        disabled={isSubmittingTopUp}
                        onClick={() => handleStartTopUpFlow(shortfall)}
                        className="w-full py-2.5 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-sm cursor-pointer"
                      >
                        {isSubmittingTopUp ? (
                          <>
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            <span>Connecting to Gateway...</span>
                          </>
                        ) : (
                          <>
                            <PlusCircle className="w-3.5 h-3.5" />
                            <span>Top Up {formatCurrency(shortfall)}</span>
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer Actions */}
        {!successEvent && (
          <div className="p-6 border-t border-slate-800 bg-slate-950/40 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-slate-200 text-xs font-bold transition-colors cursor-pointer"
            >
              Cancel
            </button>

            <button
              type="button"
              disabled={submittingPayment || isInsufficientBalance || loadingQuote || !!quoteError}
              onClick={handleConfirmPay}
              className="px-6 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed text-slate-950 font-bold text-sm shadow-md transition-all cursor-pointer flex items-center gap-2"
            >
              {submittingPayment ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Processing Payment...</span>
                </>
              ) : (
                <>
                  <span>{amountRequired === 0 ? 'Activate Event (RM0.00)' : `Pay ${formatCurrency(amountRequired)} & Activate`}</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {/* Top-up modal */}
      {showCheckoutModal && activeCheckoutOrder && (event.organization_id || currentOrganization?.id) && (
        <PaymentCheckoutModal
          isOpen={showCheckoutModal}
          onClose={() => setShowCheckoutModal(false)}
          order={activeCheckoutOrder}
          checkoutSession={checkoutSession}
          organizationId={event.organization_id || currentOrganization?.id || ''}
          onPaymentSuccess={handlePaymentSuccessTopUp}
          onPaymentFailed={() => setShowCheckoutModal(false)}
          onPaymentCancelled={() => setShowCheckoutModal(false)}
        />
      )}
    </div>
  );
};
