import React, { useState, useEffect, useRef, useCallback } from 'react';
import { apiFetch } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { TopupOrderRecord, PaymentCheckoutSession } from '../../types';
import {
  Lock,
  CreditCard,
  CheckCircle2,
  XCircle,
  AlertCircle,
  RefreshCw,
  ShieldCheck,
  Clock,
} from 'lucide-react';

export interface PaymentCheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: TopupOrderRecord | null;
  checkoutSession?: PaymentCheckoutSession | null;
  organizationId: string;
  onPaymentSuccess: (order: TopupOrderRecord) => void;
  onPaymentFailed?: (order: TopupOrderRecord, reason?: string) => void;
  onPaymentCancelled?: () => void;
}

export const PaymentCheckoutModal: React.FC<PaymentCheckoutModalProps> = ({
  isOpen,
  onClose,
  order,
  checkoutSession,
  organizationId,
  onPaymentSuccess,
  onPaymentFailed,
  onPaymentCancelled,
}) => {
  const { currentUser } = useAuth();
  const selectedPaymentMethod = 'card';
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [isPollingStatus, setIsPollingStatus] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);

  const isDevAdmin = Boolean(import.meta.env.DEV && currentUser?.is_developer);

  const pollingTimerRef = useRef<any>(null);
  const isProcessingRef = useRef<boolean>(false);

  useEffect(() => {
    return () => {
      if (pollingTimerRef.current) {
        clearTimeout(pollingTimerRef.current);
      }
    };
  }, []);

  const formatCurrency = (amount?: number | null, currency = 'MYR') => {
    const num = Number(amount) || 0;
    const formatted = num.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    const prefix = currency === 'MYR' ? 'RM' : currency === 'USD' ? '$' : currency;
    return `${prefix} ${formatted}`;
  };

  // Poll server for verified payment status after webhook dispatch
  const pollOrderStatus = useCallback(
    async (orderId: string, maxAttempts = 60) => {
      if (!organizationId) return;

      setIsPollingStatus(true);
      let attempts = 0;

      const check = async () => {
        try {
          attempts++;
          const res = await apiFetch(
            `/api/organizations/${organizationId}/wallet/topup-orders/${orderId}`
          );

          if (res.ok) {
            const data = await res.json();
            const updatedOrder: TopupOrderRecord = data.order;

            if (['PAID', 'COMPLETED'].includes(updatedOrder.status)) {
              if (pollingTimerRef.current) clearTimeout(pollingTimerRef.current);
              setIsPollingStatus(false);
              setIsProcessingPayment(false);
              window.dispatchEvent(new CustomEvent('wallet_updated'));
              onPaymentSuccess(updatedOrder);
              return;
            }

            if (['EXPIRED', 'CANCELLED', 'FAILED'].includes(updatedOrder.status)) {
              if (pollingTimerRef.current) clearTimeout(pollingTimerRef.current);
              setIsPollingStatus(false);
              setIsProcessingPayment(false);
              const message =
                updatedOrder.status === 'EXPIRED'
                  ? 'Top-up expired. Please create a new top-up.'
                  : updatedOrder.status === 'CANCELLED'
                  ? 'Top-up was cancelled.'
                  : 'Payment was declined or failed by the provider.';
              setPaymentError(message);
              if (onPaymentFailed) {
                onPaymentFailed(updatedOrder, message);
              }
              return;
            }
          }
        } catch (err) {
          console.error('Polling payment error:', err);
        }

        if (attempts < maxAttempts) {
          pollingTimerRef.current = setTimeout(check, 1500);
        } else {
          if (pollingTimerRef.current) clearTimeout(pollingTimerRef.current);
          setIsPollingStatus(false);
          setIsProcessingPayment(false);
          setPaymentError('Top-up confirmation timed out. Please check your wallet status or create a new top-up.');
        }
      };

      check();
    },
    [organizationId, onPaymentSuccess, onPaymentFailed]
  );

  // Handle triggering payment webhook
  const handleSimulatePaymentCompletion = async (
    statusToTrigger: 'payment.succeeded' | 'payment.failed' | 'checkout.session.expired'
  ) => {
    if (!organizationId || !order?.id) return;
    if (isProcessingPayment || isProcessingRef.current) return;
    isProcessingRef.current = true;

    try {
      setIsProcessingPayment(true);
      setPaymentError(null);

      const res = await apiFetch(`/api/developer/wallet/test-webhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: order.id,
          eventType: statusToTrigger,
          failureReason:
            statusToTrigger === 'payment.failed'
              ? 'Card declined by issuing bank (Insufficient funds)'
              : statusToTrigger === 'checkout.session.expired'
              ? 'Checkout session expired after timeout'
              : undefined,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to dispatch payment webhook');
      }

      // Poll verified server record for immutable ledger confirmation
      await pollOrderStatus(order.id, 6);
    } catch (err: any) {
      console.error('Payment simulation error:', err);
      setPaymentError(err.message || 'Payment processing error');
    } finally {
      isProcessingRef.current = false;
      setIsProcessingPayment(false);
    }
  };

  const handleCancelModal = () => {
    if (isProcessingPayment || isPollingStatus) return;
    if (onPaymentCancelled) {
      onPaymentCancelled();
    }
    onClose();
  };

  if (!isOpen || !order) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-200 font-sans">
      <div className="bg-slate-900 border border-slate-700 rounded-3xl p-6 sm:p-8 max-w-lg w-full space-y-6 shadow-2xl relative">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-black text-slate-100">Secure Payment Checkout</h3>
              <p className="text-xs text-slate-400">Order #{order.id.slice(0, 8)}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleCancelModal}
            disabled={isProcessingPayment || isPollingStatus}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 disabled:opacity-40 transition-colors cursor-pointer"
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
              {formatCurrency(order.top_up_amount, order.currency)}
            </span>
            {order.expected_credit_amount > 0 && (
              <span className="block text-[10px] text-cyan-400">
                +{formatCurrency(order.expected_credit_amount, order.currency)} Bonus Included
              </span>
            )}
          </div>
        </div>

        {/* Payment Method */}
        <div className="space-y-2">
          <label className="text-xs font-bold text-slate-300">Payment Method</label>
          <div className="p-3.5 rounded-xl border border-amber-500/30 bg-amber-500/10 text-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-500/20 text-amber-400">
                <CreditCard className="w-5 h-5" />
              </div>
              <div>
                <span className="text-xs font-bold block text-slate-100">Credit / Debit Card</span>
                <span className="text-[11px] text-slate-400">Visa, Mastercard, American Express</span>
              </div>
            </div>
            <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              Active
            </span>
          </div>
        </div>

        {/* Payment Error Display */}
        {paymentError && (
          <div
            className={`p-3.5 rounded-xl border text-xs space-y-1.5 ${
              paymentError.toLowerCase().includes('expired')
                ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                : 'bg-rose-500/10 border-rose-500/20 text-rose-300'
            }`}
          >
            <div className="flex items-center gap-2 font-semibold">
              {paymentError.toLowerCase().includes('expired') ? (
                <Clock className="w-4 h-4 shrink-0 text-amber-400" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              )}
              <span>{paymentError}</span>
            </div>
            {paymentError.toLowerCase().includes('expired') && (
              <div className="pt-1">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-[11px] transition-colors cursor-pointer"
                >
                  Create New Top-up
                </button>
              </div>
            )}
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
          {checkoutSession?.checkoutUrl && (
            <a
              href={checkoutSession.checkoutUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => pollOrderStatus(order.id, 60)}
              className="w-full py-3.5 px-4 rounded-xl bg-[#635BFF] hover:bg-[#5851DF] text-white font-bold text-sm shadow-lg transition-all cursor-pointer flex items-center justify-center gap-2"
            >
              <CreditCard className="w-4 h-4" />
              <span>Open Payment Gateway ({formatCurrency(order.top_up_amount, order.currency)})</span>
            </a>
          )}

          {/* Sandbox Webhook Simulation (Developer Admin Sandbox Only) */}
          {isDevAdmin && (
            <div className="pt-2 border-t border-slate-800/80 space-y-2">
              <div className="text-[10px] font-mono text-amber-400 uppercase tracking-wider font-semibold text-center">
                Developer Admin Sandbox Tools
              </div>
              <button
                type="button"
                disabled={isProcessingPayment || isPollingStatus}
                onClick={() => handleSimulatePaymentCompletion('payment.succeeded')}
                className="w-full py-2.5 px-4 rounded-xl bg-emerald-600/90 hover:bg-emerald-600 text-white font-bold text-xs shadow transition-all cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isProcessingPayment || isPollingStatus ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Verifying Simulation...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Simulate Webhook: Succeeded</span>
                  </>
                )}
              </button>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={isProcessingPayment || isPollingStatus}
                  onClick={() => handleSimulatePaymentCompletion('checkout.session.expired')}
                  className="w-full py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  <Clock className="w-3.5 h-3.5 text-amber-400" />
                  <span>Simulate: Expired</span>
                </button>

                <button
                  type="button"
                  disabled={isProcessingPayment || isPollingStatus}
                  onClick={() => handleSimulatePaymentCompletion('payment.failed')}
                  className="w-full py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-rose-300 text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  <XCircle className="w-3.5 h-3.5 text-rose-400" />
                  <span>Simulate: Failed</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
