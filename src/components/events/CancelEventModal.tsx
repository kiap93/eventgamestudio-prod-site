import React, { useState, useEffect } from 'react';
import {
  Ban,
  AlertTriangle,
  CheckCircle2,
  Clock,
  DollarSign,
  ShieldAlert,
  X,
  Loader2,
  Calendar,
  RotateCcw,
} from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { EventCancellationEligibility, EventRecord, EventWithDetails } from '../../types';
import { getNormalizedEventDates, formatDateOnly } from '../../lib/dateUtils';
import { useLocalization } from '../../context/LocalizationContext';

interface CancelEventModalProps {
  isOpen: boolean;
  event: EventWithDetails | EventRecord | null;
  onClose: () => void;
  onSuccess: (updatedEvent: any) => void;
}

export const CancelEventModal: React.FC<CancelEventModalProps> = ({
  isOpen,
  event,
  onClose,
  onSuccess,
}) => {
  const { t } = useLocalization();
  const [eligibility, setEligibility] = useState<EventCancellationEligibility | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && event) {
      setError(null);
      setReason('');
      fetchEligibility(event.id);
    } else {
      setEligibility(null);
    }
  }, [isOpen, event?.id]);

  const fetchEligibility = async (eventId: string) => {
    try {
      setLoading(true);
      const res = await apiFetch(`/api/events/${eventId}/cancellation-eligibility`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to check cancellation policy');
      }
      const data = await res.json();
      setEligibility(data.eligibility);
    } catch (err: any) {
      console.error('Error checking cancellation eligibility:', err);
      setError(err.message || 'Unable to check cancellation eligibility');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmCancel = async () => {
    if (!event) return;

    try {
      setSubmitting(true);
      setError(null);
      const res = await apiFetch(`/api/events/${event.id}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason.trim() || 'Cancelled before Setup Day' }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to cancel event');
      }

      window.dispatchEvent(new CustomEvent('wallet_updated'));
      onSuccess(data.event);
      onClose();
    } catch (err: any) {
      console.error('Cancel event error:', err);
      setError(err.message || 'Failed to cancel event');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen || !event) return null;

  const eventDates = getNormalizedEventDates(event);
  const startDateStr = eventDates.startDate;
  const liveOpenDateStr = eligibility?.setupStartsAt ? (eligibility.setupStartsAt.includes('T') ? eligibility.setupStartsAt.split('T')[0] : eligibility.setupStartsAt) : eventDates.liveOpenDate;

  const isEligible = eligibility?.canCancel ?? false;
  const canRefund = eligibility?.canRefund ?? false;
  const paidAmount = eligibility?.refundPaidAmount ?? (event.paid_amount || 0);
  const discountAmount = eligibility?.creditReversalAmount ?? (event.discount_amount || 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200 font-sans">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-6 border-b border-slate-800 flex items-center justify-between bg-slate-900/50">
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-2xl ${isEligible ? 'bg-red-500/10 border border-red-500/30 text-red-400' : 'bg-slate-800 text-slate-400'}`}>
              <Ban className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-100">{t('event.cancelModalTitle')}</h2>
              <p className="text-xs text-slate-400 font-mono truncate max-w-[280px]">
                {event.name}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
            title={t('common.close')}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-5 text-xs text-slate-300">
          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-300 text-xs flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {loading ? (
            <div className="py-8 flex flex-col items-center justify-center gap-3 text-slate-400">
              <Loader2 className="w-6 h-6 animate-spin text-amber-400" />
              <p className="text-xs">{t('common.loading')}</p>
            </div>
          ) : (
            <>
              {/* Policy Evaluation Box */}
              <div className={`p-4 rounded-2xl border ${
                isEligible
                  ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-300'
                  : 'bg-amber-950/20 border-amber-500/30 text-amber-300'
              }`}>
                <div className="flex items-start gap-2.5">
                  {isEligible ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                  ) : (
                    <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                  )}
                  <div>
                    <h4 className="font-bold text-sm text-slate-100 mb-1">
                      {isEligible ? t('event.cancelModalTitle') : t('event.cancelEventConfirmation')}
                    </h4>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      {eligibility?.reason || t('event.cancelModalDesc')}
                    </p>
                    {isEligible && (
                      <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                        {t('event.cancelWarning')}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Timeline Info */}
              <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-2.5">
                <div className="flex items-center justify-between text-slate-400 pb-2 border-b border-slate-900">
                  <span className="flex items-center gap-1.5 font-medium">
                    <Calendar className="w-3.5 h-3.5 text-slate-500" />
                    {t('event.startDate')}:
                  </span>
                  <span className="font-mono text-slate-200">
                    {formatDateOnly(startDateStr)}
                  </span>
                </div>

                <div className="flex items-center justify-between text-slate-400">
                  <span className="flex items-center gap-1.5 font-medium">
                    <Calendar className="w-3.5 h-3.5 text-amber-400" />
                    {t('event.statusSetupDay')} ({t('event.startDate')} - 1 Day):
                  </span>
                  <span className={`font-mono font-semibold ${eligibility?.setupDayStarted ? 'text-red-400' : 'text-emerald-400'}`}>
                    {formatDateOnly(liveOpenDateStr)}
                    {eligibility?.setupDayStarted ? ` (${t('event.statusLive')})` : ` (${t('event.statusUpcoming')})`}
                  </span>
                </div>
              </div>

              {/* Refund Summary (if applicable) */}
              {isEligible && (
                <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-200 flex items-center gap-1.5">
                      <DollarSign className="w-4 h-4 text-emerald-400" />
                      {t('payment.walletBalance')}
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                      {canRefund ? t('payment.statusCompleted') : t('common.none')}
                    </span>
                  </div>

                  {canRefund ? (
                    <div className="space-y-2 pt-1 border-t border-slate-900">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400">{t('payment.purchasedBalance')}:</span>
                        <span className="font-mono font-bold text-emerald-400">
                          + RM {(Number(paidAmount) || 0).toFixed(2)}
                        </span>
                      </div>

                      {discountAmount > 0 && (
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400">{t('payment.promotionalCredits')}:</span>
                          <span className="font-mono text-amber-400">
                            - RM {(Number(discountAmount) || 0).toFixed(2)} ({eligibility?.creditType || 'Promo Credit'})
                          </span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-slate-400 text-xs">
                      {t('common.noData')}
                    </p>
                  )}
                </div>
              )}

              {/* Cancellation Reason Input */}
              {isEligible && (
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-300">
                    {t('common.reason', undefined, 'Reason for Cancellation')}
                  </label>
                  <input
                    type="text"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder={t('common.optional', undefined, 'Optional')}
                    className="w-full bg-slate-950 border border-slate-800 focus:border-red-500 focus:ring-1 focus:ring-red-500 rounded-xl px-3.5 py-2 text-xs text-slate-100 outline-none transition-all"
                  />
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-slate-800 bg-slate-900/50 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors cursor-pointer"
          >
            {isEligible ? t('common.cancel') : t('common.close')}
          </button>

          {isEligible && (
            <button
              type="button"
              onClick={handleConfirmCancel}
              disabled={submitting || loading}
              className="flex items-center gap-2 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white font-bold px-5 py-2 rounded-xl text-xs transition-all shadow-lg shadow-red-600/20 cursor-pointer"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>{t('common.loading')}</span>
                </>
              ) : (
                <>
                  <Ban className="w-3.5 h-3.5" />
                  <span>{t('event.confirmCancel')}</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
