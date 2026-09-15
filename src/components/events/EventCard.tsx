import React, { useState } from 'react';
import {
  Calendar,
  ExternalLink,
  Copy,
  Check,
  Edit2,
  Trash2,
  Ban,
  Gamepad2,
  Sparkles,
  ShieldCheck,
  CreditCard,
  Trophy,
  AlertCircle,
  Clock,
  CheckCircle2,
  Lock,
  Eye,
  Share2,
  Globe,
} from 'lucide-react';
import { navigateTo } from '../../hooks/useRouteContext';
import {
  formatEventDateRange,
  formatDateOnly,
  getEventAvailabilityState,
  canAccessLiveEvent,
  canAccessPreviewEvent,
  isEventExplicitlyCancelled,
  calculateEventStatus,
  isEventEligibleForShowcase,
} from '../../lib/dateUtils';
import { EventLeaderboardModal } from './EventLeaderboardModal';
import { EventPaymentModal } from './EventPaymentModal';

interface EventCardProps {
  event: any;
  userRole?: string;
  onEdit: (event: any, initialTab?: 'details' | 'showcase') => void;
  onDelete: (eventId: string) => void;
  onCancel: (eventId: string) => void;
  onRefresh?: () => void;
}

export const EventCard: React.FC<EventCardProps> = ({
  event,
  userRole,
  onEdit,
  onDelete,
  onCancel,
  onRefresh,
}) => {
  const [copied, setCopied] = useState(false);
  const [copiedShowcase, setCopiedShowcase] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);

  const publicUrl = `${window.location.origin}/play/${event.public_token}`;
  const targetShowcaseId = event.showcase?.id || event.id;
  const showcaseUrl = `${window.location.origin}/showcase/${targetShowcaseId}`;
  const previewUrl = `/events/${event.id}/preview`;
  const isViewer = userRole === 'viewer';
  const isOwnerOrAdmin = ['owner', 'admin'].includes(userRole || '');

  const showcaseStatus = event.showcase?.status || event.showcase_status;
  const isShowcasePubliclyViewable =
    showcaseStatus === 'PUBLISHED' &&
    event.showcase?.status !== 'BLOCKED' &&
    event.showcase?.status !== 'DELETED';

  const availability = getEventAvailabilityState(event);
  const normalizedPaymentStatus = (event.payment_status || 'UNPAID').trim().toUpperCase();
  const isPaid = normalizedPaymentStatus === 'PAID';
  const isCancelled = isEventExplicitlyCancelled(event);
  const effectiveStatus = calculateEventStatus(event);
  const isRefunded = normalizedPaymentStatus === 'REFUNDED';
  const isPaymentFailed = normalizedPaymentStatus === 'FAILED';
  const isPaymentRequired =
    !isPaid &&
    !isRefunded &&
    !isCancelled &&
    effectiveStatus !== 'cancelled' &&
    effectiveStatus !== 'expired' &&
    !availability.isAfterLiveWindow;
  const isPendingPayment = isPaymentRequired || effectiveStatus === 'pending_payment';

  const copyLink = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy public URL', err);
    }
  };

  const handleShareShowcase = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: event.showcase?.title || event.name || 'Event Showcase',
          url: showcaseUrl,
        });
        return;
      } catch (err: any) {
        if (err.name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(showcaseUrl);
      setCopiedShowcase(true);
      setTimeout(() => setCopiedShowcase(false), 2000);
    } catch (err) {
      console.error('Failed to copy showcase URL', err);
    }
  };

  const openPublicGame = (e: React.MouseEvent) => {
    e.stopPropagation();
    window.open(publicUrl, '_blank');
  };

  const openPreviewGame = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigateTo(previewUrl);
  };

  const getStatusBadge = () => {
    if (isCancelled || effectiveStatus === 'cancelled') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-red-500/10 border border-red-500/30 text-red-400">
          <Ban className="w-3 h-3" />
          Cancelled
        </span>
      );
    }
    if (effectiveStatus === 'completed') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-500/10 border border-emerald-500/30 text-emerald-300">
          <CheckCircle2 className="w-3 h-3 text-emerald-400" />
          Completed
        </span>
      );
    }
    if (effectiveStatus === 'expired' || (!isPaid && availability.isAfterLiveWindow)) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-slate-800 border border-slate-700 text-slate-400">
          <Clock className="w-3 h-3 text-slate-500" />
          Expired
        </span>
      );
    }
    if (isPendingPayment) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-500/10 border border-amber-500/30 text-amber-400">
          <AlertCircle className="w-3 h-3" />
          Pending Payment
        </span>
      );
    }
    if (effectiveStatus === 'live') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping inline-block" />
          Live Now
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-blue-500/10 border border-blue-500/30 text-blue-400">
        <Calendar className="w-3 h-3" />
        Scheduled
      </span>
    );
  };

  const gameName = event.game?.name || 'Catch The Brand';
  const themeName = event.game_theme?.name || 'Theme';

  const dateRangeFormatted = formatEventDateRange(
    availability.startDate,
    availability.endDate
  );

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-lg hover:border-slate-700 transition-all flex flex-col justify-between space-y-4">
      {/* Top Card Section: Status and Title */}
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          {getStatusBadge()}
          <span className="text-[10px] font-mono text-slate-500">
            Token: {event.public_token}
          </span>
        </div>

        <div>
          <h3 className="text-base font-bold text-slate-100 group-hover:text-amber-400 transition-colors">
            {event.name}
          </h3>
          {/* Game & Theme single association */}
          <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-400">
            <Gamepad2 className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span className="font-semibold text-slate-300">{gameName}</span>
            <span className="text-slate-600">/</span>
            <span className="text-amber-300 font-medium">{themeName}</span>
          </div>
        </div>
      </div>

      {/* Schedule Window Details (Date-Only) */}
      <div className="bg-slate-950/80 border border-slate-800/80 rounded-2xl p-3 space-y-1.5 text-[11px]">
        <div className="flex items-center justify-between text-slate-400">
          <span className="flex items-center gap-1">
            <Calendar className="w-3 h-3 text-amber-400" />
            Event Dates:
          </span>
          <span className="text-slate-200 font-bold">{dateRangeFormatted}</span>
        </div>

        <div className="flex items-center justify-between text-slate-400">
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3 text-slate-500" />
            Live Window Opens:
          </span>
          <span className="text-slate-300 font-mono">{formatDateOnly(availability.liveOpenDate)}</span>
        </div>

        <div className="flex items-center justify-between text-slate-400">
          <span className="flex items-center gap-1">
            <Globe className="w-3 h-3 text-slate-500" />
            Timezone:
          </span>
          <span className="text-slate-300 font-mono text-[10px]">{event.event_timezone || event.timezone || 'Asia/Singapore'}</span>
        </div>

        <div className="flex items-center justify-between pt-1.5 border-t border-slate-900 text-slate-400">
          <span className="flex items-center gap-1">
            <ShieldCheck className={`w-3 h-3 ${isPaid ? 'text-emerald-400' : isRefunded ? 'text-amber-400' : 'text-amber-500'}`} />
            Payment:
          </span>
          <span className={`text-[10px] font-mono font-semibold ${
            isPaid
              ? 'text-emerald-400'
              : isRefunded
              ? 'text-amber-400'
              : isPaymentFailed
              ? 'text-red-400'
              : 'text-amber-400'
          }`}>
            {isPaid
              ? event.payment_mode === 'WELCOME_CREDIT'
                ? `Welcome Credit (${event.paid_amount ? `RM ${Number(event.paid_amount).toFixed(2)} Paid` : 'Paid'})`
                : event.payment_mode === 'SHOWCASE_CREDIT'
                ? `Showcase Credit (${event.paid_amount ? `RM ${Number(event.paid_amount).toFixed(2)} Paid` : 'Paid'})`
                : event.payment_mode === 'TOPUP_CREDIT'
                ? `Top-up Promo (${event.paid_amount ? `RM ${Number(event.paid_amount).toFixed(2)} Paid` : 'Paid'})`
                : event.paid_amount !== undefined && event.paid_amount !== null && Number(event.paid_amount) > 0
                ? `RM ${Number(event.paid_amount).toFixed(2)} Paid`
                : event.event_price !== undefined && event.event_price !== null && Number(event.event_price) > 0
                ? `RM ${Number(event.event_price).toFixed(2)} Paid`
                : 'PAID'
              : isRefunded
              ? 'REFUNDED'
              : isPaymentFailed
              ? 'PAYMENT FAILED'
              : isCancelled || effectiveStatus === 'cancelled'
              ? 'UNPAID (CANCELLED)'
              : effectiveStatus === 'expired' || availability.isAfterLiveWindow
              ? 'UNPAID (EXPIRED)'
              : 'PENDING PAYMENT'}
          </span>
        </div>
      </div>

      {/* Showcase Status Button */}
      <div className="flex items-center justify-between gap-2 bg-slate-950/60 border border-slate-800/60 rounded-xl px-3 py-2 text-xs">
        <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
          <Sparkles className="w-3.5 h-3.5 text-amber-400" />
          <span>Showcase:</span>
          {showcaseStatus === 'PUBLISHED' ? (
            <span className="font-bold text-emerald-400">Published</span>
          ) : showcaseStatus === 'DRAFT' ? (
            <span className="font-bold text-amber-400">Draft</span>
          ) : showcaseStatus === 'UNPUBLISHED' ? (
            <span className="font-bold text-slate-400">Unpublished</span>
          ) : (
            <span className="text-slate-500">Not Created</span>
          )}
        </div>

        {isShowcasePubliclyViewable ? (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                window.open(`/showcase/${targetShowcaseId}`, '_blank');
              }}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 hover:border-slate-600 transition-colors cursor-pointer"
              title="View Public Showcase"
            >
              <Eye className="w-3.5 h-3.5 text-emerald-400" />
              <span>View</span>
            </button>
            <button
              type="button"
              onClick={handleShareShowcase}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 hover:border-slate-600 transition-colors cursor-pointer"
              title="Share Public Showcase URL"
            >
              {copiedShowcase ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-400 font-bold">Link copied</span>
                </>
              ) : (
                <>
                  <Share2 className="w-3.5 h-3.5 text-amber-400" />
                  <span>Share</span>
                </>
              )}
            </button>
          </div>
        ) : showcaseStatus && showcaseStatus !== 'NOT_CREATED' ? (
          <button
            type="button"
            onClick={() => navigateTo(`/events/${event.id}/showcase`)}
            className="text-[11px] font-bold text-amber-400 hover:text-amber-300 hover:underline transition-colors flex items-center gap-1 cursor-pointer"
          >
            <span>Showcase →</span>
          </button>
        ) : isEventEligibleForShowcase(event).eligible ? (
          <button
            type="button"
            onClick={() => navigateTo(`/events/${event.id}/showcase`)}
            className="text-[11px] font-bold text-amber-400 hover:text-amber-300 hover:underline transition-colors flex items-center gap-1 cursor-pointer"
          >
            <span>+ Create Showcase</span>
          </button>
        ) : (
          <span
            className="text-[11px] text-slate-500 italic"
            title={
              effectiveStatus === 'expired'
                ? 'Showcases are not available for expired events'
                : effectiveStatus === 'cancelled'
                ? 'Showcases are not available for cancelled events'
                : 'Available after event completion'
            }
          >
            {effectiveStatus === 'expired'
              ? 'Not available (expired)'
              : effectiveStatus === 'cancelled'
              ? 'Not available (cancelled)'
              : 'Available after completion'}
          </span>
        )}
      </div>

      {/* Public URL Box */}
      <div className="flex items-center justify-between gap-2 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs">
        <div className="flex items-center gap-1.5 min-w-0 truncate font-mono text-[11px] text-slate-400">
          <span className="truncate">/play/{event.public_token}</span>
          {effectiveStatus === 'cancelled' ? (
            <span className="text-[10px] text-red-400 font-sans font-medium shrink-0">
              (Cancelled)
            </span>
          ) : effectiveStatus === 'completed' ? (
            <span className="text-[10px] text-emerald-400 font-sans font-medium shrink-0">
              (Completed)
            </span>
          ) : effectiveStatus === 'expired' ? (
            <span className="text-[10px] text-slate-500 font-sans font-medium shrink-0">
              (Expired)
            </span>
          ) : effectiveStatus === 'pending_payment' ? (
            <span className="text-[10px] text-amber-500/80 font-sans font-medium shrink-0">
              (Active after payment)
            </span>
          ) : availability.isBeforeLiveWindow ? (
            <span className="text-[10px] text-blue-400/80 font-sans font-medium shrink-0">
              (Opens {formatDateOnly(availability.liveOpenDate)})
            </span>
          ) : (
            <span className="text-[10px] text-emerald-400 font-sans font-medium shrink-0">
              (Live Now)
            </span>
          )}
        </div>
        <button
          onClick={copyLink}
          className="flex items-center gap-1 text-[11px] font-semibold text-amber-400 hover:text-amber-300 shrink-0 transition-colors cursor-pointer"
          title="Copy Public Link"
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-emerald-400">Copied</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>

      {/* Card Actions */}
      <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {/* Action 1: Pay CTA or Play Live CTA */}
          {isPendingPayment ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowPaymentModal(true);
              }}
              className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 px-3.5 py-1.5 rounded-xl text-xs font-black transition-all shadow-sm shadow-amber-500/20 cursor-pointer"
            >
              <CreditCard className="w-3.5 h-3.5 text-slate-950" />
              <span>Pay & Activate</span>
            </button>
          ) : availability.liveUrlAvailable ? (
            <button
              onClick={openPublicGame}
              className="flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 px-3 py-1.5 rounded-xl text-xs font-bold transition-all shadow-sm shadow-emerald-500/20 cursor-pointer"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Play Live</span>
            </button>
          ) : null}

          {/* Action 2: Test Preview CTA (Available for non-cancelled events) */}
          {availability.previewUrlAvailable && (
            <button
              onClick={openPreviewGame}
              className="flex items-center gap-1 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-slate-100 px-2.5 py-1.5 rounded-xl text-xs font-semibold border border-slate-700 transition-colors cursor-pointer"
              title="Open Authenticated Test Preview"
            >
              <Gamepad2 className="w-3.5 h-3.5 text-purple-400" />
              <span className="hidden sm:inline">Preview</span>
            </button>
          )}

          {/* Action 3: High Scores */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowLeaderboard(true);
            }}
            className="flex items-center gap-1 bg-slate-800 hover:bg-slate-700 text-amber-400 hover:text-amber-300 px-2.5 py-1.5 rounded-xl text-xs font-semibold border border-slate-700 transition-colors cursor-pointer"
            title="View Event High Scores"
          >
            <Trophy className="w-3.5 h-3.5" />
            <span>Scores</span>
          </button>
        </div>

        {!isViewer && (
          <div className="flex items-center gap-1">
            <button
              onClick={() => onEdit(event)}
              className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-slate-100 rounded-lg text-xs transition-colors cursor-pointer"
              title={isPaid ? 'View Event Setup (Locked - Paid)' : 'Edit Event'}
            >
              {isPaid ? <Lock className="w-3.5 h-3.5 text-amber-400/80" /> : <Edit2 className="w-3.5 h-3.5" />}
            </button>

            {!isCancelled && (
              <button
                onClick={() => onCancel(event.id)}
                className="p-1.5 bg-slate-800 hover:bg-red-500/20 text-slate-400 hover:text-red-400 rounded-lg text-xs transition-colors cursor-pointer"
                title="Cancel Event"
              >
                <Ban className="w-3.5 h-3.5" />
              </button>
            )}

            {isOwnerOrAdmin && (
              <button
                onClick={() => onDelete(event.id)}
                className="p-1.5 bg-slate-800 hover:bg-red-500/20 text-slate-400 hover:text-red-400 rounded-lg text-xs transition-colors cursor-pointer"
                title="Delete Event"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* High Score Leaderboard Modal */}
      {showLeaderboard && (
        <EventLeaderboardModal
          isOpen={showLeaderboard}
          onClose={() => setShowLeaderboard(false)}
          event={event}
          userRole={userRole}
        />
      )}

      {/* Pay & Activate Modal */}
      {showPaymentModal && (
        <EventPaymentModal
          isOpen={showPaymentModal}
          onClose={() => setShowPaymentModal(false)}
          event={event}
          onPaymentSuccess={(_updated) => {
            setShowPaymentModal(false);
            if (onRefresh) onRefresh();
          }}
        />
      )}
    </div>
  );
};
