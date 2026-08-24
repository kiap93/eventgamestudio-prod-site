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
  ShieldCheck,
  Clock,
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
  const { currentOrganization, user } = useAuth();

  const [wallet, setWallet] = useState<WalletBalanceSummary | null>(null);
  const [loadingQuote, setLoadingQuote] = useState(true);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [activeCalculation, setActiveCalculation] = useState<EventPaymentCalculation | null>(null);
  const [selectedPaymentMode, setSelectedPaymentMode] = useState<PaymentMode>('FULL_PAID');

  const [submittingPayment, setSubmittingPayment] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [successEvent, setSuccessEvent] = useState<any | null>(null);

  // Top-Up State for Insufficient Balance
  const [showInlineTopUp, setShowInlineTopUp] = useState(false);
  const [inlineTopUpAmount, setInlineTopUpAmount] = useState<number>(1400);
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

  const fetchQuoteAndWallet = async (modeToUse?: PaymentMode) => {
    if (!isOpen || !event) return;
    const orgId = event.organization_id || currentOrganization?.id;
    if (!orgId) return;

    try {
      setLoadingQuote(true);
      setQuoteError(null);

      // 1. Fetch wallet
      const walletRes = await apiFetch(`/api/organizations/${orgId}/wallet`);
      if (walletRes.ok) {
        const wData = await walletRes.json();
        setWallet(wData.wallet);
      }

      // 2. Fetch authoritative quote
      const targetMode = modeToUse || selectedPaymentMode;
      const quoteRes = await apiFetch('/api/events/quote', {
        method: 'POST',
        body: JSON.stringify({
          game_theme_id: event.game_theme_id || event.game_theme?.id,
          payment_mode: targetMode,
          event_price: event.event_price || undefined,
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
      setShowInlineTopUp(false);
      fetchQuoteAndWallet();
    }
  }, [isOpen, event?.id]);

  if (!isOpen || !event) return null;

  const standardPrice = activeCalculation?.eventPrice ?? event.event_price ?? 1400;
  const paidAmount = activeCalculation?.paidAmount ?? (
    selectedPaymentMode === 'WELCOME_CREDIT' ? 600 :
    selectedPaymentMode === 'SHOWCASE_CREDIT' ? 1100 :
    selectedPaymentMode === 'TOPUP_CREDIT' ? 1120 : standardPrice
  );
  const totalDiscount = activeCalculation?.totalDiscount ?? (standardPrice - paidAmount);
  const availableBalance = Number(
    activeCalculation?.availableBalances?.paid_balance ?? wallet?.paid_balance ?? 0
  );

  const isServerPayable = activeCalculation ? activeCalculation.isPayable : availableBalance >= paidAmount;
  const isInsufficientBalance = !loadingQuote && !quoteError && wallet !== null && (!isServerPayable || availableBalance < paidAmount);
  const needAmount = Math.max(0, paidAmount - availableBalance);

  const handleModeChange = (newMode: PaymentMode) => {
    setSelectedPaymentMode(newMode);
    fetchQuoteAndWallet(newMode);
  };

  const handleConfirmPay = async () => {
    setPaymentError(null);
    try {
      setSubmittingPayment(true);

      const res = await apiFetch(`/api/events/${event.id}/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payment_mode: selectedPaymentMode,
          topup_credit_requested: activeCalculation?.topupCreditUsed,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        if (res.status === 402 || errData.code === 'INSUFFICIENT_BALANCE') {
          setPaymentError(errData.error || 'Insufficient balance to activate event.');
          fetchQuoteAndWallet();
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
    setShowInlineTopUp(false);
    setPaymentError(null);

    await fetchQuoteAndWallet(selectedPaymentMode);

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
              <p className="text-xs text-slate-400">Complete payment to make this event live and active</p>
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
                  Payment was confirmed and <strong className="text-slate-200">{event.name}</strong> is now officially active.
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
                  <span>Payment:</span>
                  <span className="font-bold text-slate-200">
                    {formatCurrency(paidAmount)} Paid
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
                  <span>{event.game_theme?.name || 'Theme'}</span>
                </div>
              </div>

              {/* Pricing & Credit Options */}
              {loadingQuote ? (
                <div className="bg-slate-950/50 border border-slate-800 rounded-2xl p-6 flex items-center justify-center gap-2 text-xs text-slate-400">
                  <RefreshCw className="w-4 h-4 animate-spin text-amber-400" />
                  <span>Calculating payment quote...</span>
                </div>
              ) : quoteError ? (
                <div className="bg-rose-500/10 border border-rose-500/20 rounded-2xl p-4 text-xs text-rose-400 flex items-center justify-between">
                  <span>{quoteError}</span>
                  <button
                    type="button"
                    onClick={() => fetchQuoteAndWallet(selectedPaymentMode)}
                    className="underline text-rose-300 font-bold ml-2"
                  >
                    Retry
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Payment Mode Selection */}
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-300">Payment Option</label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => handleModeChange('FULL_PAID')}
                        className={`p-3 rounded-xl border text-left text-xs transition-all cursor-pointer ${
                          selectedPaymentMode === 'FULL_PAID'
                            ? 'border-amber-500 bg-amber-500/10 text-slate-100 ring-1 ring-amber-500/30'
                            : 'border-slate-800 bg-slate-950/60 text-slate-400 hover:border-slate-700'
                        }`}
                      >
                        <div className="font-bold text-slate-200">Paid Balance</div>
                        <div className="text-[11px] text-slate-400 mt-0.5">{formatCurrency(standardPrice)}</div>
                      </button>

                      {wallet && wallet.welcome_credit > 0 && (
                        <button
                          type="button"
                          onClick={() => handleModeChange('WELCOME_CREDIT')}
                          className={`p-3 rounded-xl border text-left text-xs transition-all cursor-pointer ${
                            selectedPaymentMode === 'WELCOME_CREDIT'
                              ? 'border-amber-500 bg-amber-500/10 text-slate-100 ring-1 ring-amber-500/30'
                              : 'border-slate-800 bg-slate-950/60 text-slate-400 hover:border-slate-700'
                          }`}
                        >
                          <div className="font-bold text-emerald-400 flex items-center gap-1">
                            <Sparkles className="w-3 h-3" />
                            <span>Welcome Credit</span>
                          </div>
                          <div className="text-[11px] text-slate-400 mt-0.5">Save RM800.00 (Pay RM600)</div>
                        </button>
                      )}

                      {wallet && wallet.showcase_credit > 0 && (
                        <button
                          type="button"
                          onClick={() => handleModeChange('SHOWCASE_CREDIT')}
                          className={`p-3 rounded-xl border text-left text-xs transition-all cursor-pointer ${
                            selectedPaymentMode === 'SHOWCASE_CREDIT'
                              ? 'border-amber-500 bg-amber-500/10 text-slate-100 ring-1 ring-amber-500/30'
                              : 'border-slate-800 bg-slate-950/60 text-slate-400 hover:border-slate-700'
                          }`}
                        >
                          <div className="font-bold text-amber-400 flex items-center gap-1">
                            <Sparkles className="w-3 h-3" />
                            <span>Showcase Credit</span>
                          </div>
                          <div className="text-[11px] text-slate-400 mt-0.5">Save RM300.00 (Pay RM1,100)</div>
                        </button>
                      )}

                      {wallet && wallet.topup_credit > 0 && (
                        <button
                          type="button"
                          onClick={() => handleModeChange('TOPUP_CREDIT')}
                          className={`p-3 rounded-xl border text-left text-xs transition-all cursor-pointer ${
                            selectedPaymentMode === 'TOPUP_CREDIT'
                              ? 'border-amber-500 bg-amber-500/10 text-slate-100 ring-1 ring-amber-500/30'
                              : 'border-slate-800 bg-slate-950/60 text-slate-400 hover:border-slate-700'
                          }`}
                        >
                          <div className="font-bold text-blue-400 flex items-center gap-1">
                            <Sparkles className="w-3 h-3" />
                            <span>Top-up Credit</span>
                          </div>
                          <div className="text-[11px] text-slate-400 mt-0.5">Save up to 20% (RM280)</div>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Financial Breakdown */}
                  <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-4 space-y-2.5 text-xs">
                    <div className="flex items-center justify-between text-slate-300">
                      <span>Event Price</span>
                      <span className="font-mono font-bold">{formatCurrency(standardPrice)}</span>
                    </div>

                    {totalDiscount > 0 && (
                      <div className="flex items-center justify-between text-emerald-400">
                        <span className="flex items-center gap-1">
                          <Sparkles className="w-3.5 h-3.5" />
                          Credit Applied
                        </span>
                        <span className="font-mono font-bold">-{formatCurrency(totalDiscount)}</span>
                      </div>
                    )}

                    <div className="flex items-center justify-between pt-1 border-t border-slate-800 font-semibold text-slate-100">
                      <span>Total Required</span>
                      <span className="font-mono font-bold text-amber-400 text-sm">
                        {formatCurrency(paidAmount)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between pt-1 border-t border-slate-900 text-slate-400">
                      <span className="flex items-center gap-1.5">
                        <Wallet className="w-3.5 h-3.5" />
                        Available Paid Balance
                      </span>
                      <span className="font-mono font-bold text-slate-200">
                        {formatCurrency(availableBalance)}
                      </span>
                    </div>
                  </div>

                  {/* Insufficient balance notification and top-up */}
                  {isInsufficientBalance && (
                    <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 space-y-3">
                      <div className="flex items-center gap-2 text-xs font-bold text-amber-400">
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        <span>Insufficient Balance</span>
                      </div>
                      <p className="text-xs text-slate-300">
                        You need <span className="font-mono font-bold text-amber-300">{formatCurrency(needAmount)}</span> more to activate this event.
                      </p>
                      <button
                        type="button"
                        disabled={isSubmittingTopUp}
                        onClick={() => handleStartTopUpFlow(needAmount > 0 ? needAmount : 1400)}
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
                            <span>Top Up {formatCurrency(needAmount)}</span>
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
                  <span>Pay {formatCurrency(paidAmount)} & Activate</span>
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
