import React, { useState, useEffect } from 'react';
import { useRouteContext, navigateTo } from '../../hooks/useRouteContext';
import { useAuth } from '../../context/AuthContext';
import { GameContainer } from '../GameContainer';
import { EventPaymentModal } from './EventPaymentModal';
import { apiFetch } from '../../lib/api';
import {
  canAccessPreviewEvent,
  canAccessLiveEvent,
  shouldShowPreviewHeader,
  getEventAvailabilityState,
  formatDateOnly,
  getNormalizedEventDates,
} from '../../lib/dateUtils';
import {
  ArrowLeft,
  Sparkles,
  RefreshCw,
  Maximize2,
  Minimize2,
  CreditCard,
  AlertCircle,
  Gamepad2,
  Check,
  Copy,
  ExternalLink,
  ShieldCheck,
  Play,
  Calendar,
  Lock,
} from 'lucide-react';

interface EventPreviewData {
  id: string;
  name: string;
  public_token: string;
  event_date: string | null;
  start_date?: string | null;
  end_date?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  starts_at: string;
  expires_at: string;
  status: 'draft' | 'scheduled' | 'live' | 'expired' | 'cancelled' | 'pending_payment' | 'active';
  event_status?: string;
  calculated_status?: string;
  payment_status?: 'PAID' | 'UNPAID' | 'REFUNDED' | 'PENDING_PAYMENT';
  payment_mode?: string;
  cancel_reason?: string | null;
  organization_id?: string;
  organization_name?: string;
  organization_slug?: string;
  event_price?: number;
  event_currency?: string;
  paid_amount?: number;
  game?: {
    id: string;
    name: string;
    slug: string;
    game_type: string;
  } | null;
  game_theme?: any;
}

interface EventPreviewGameViewProps {
  eventId?: string;
}

export const EventPreviewGameView: React.FC<EventPreviewGameViewProps> = ({ eventId: propEventId }) => {
  const routeContext = useRouteContext();
  const eventId = propEventId || routeContext.eventId;
  const { currentOrganization } = useAuth();

  const [eventData, setEventData] = useState<EventPreviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [errorPayload, setErrorPayload] = useState<any>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  // Authoritative Pricing State (event.event_price -> authoritative API quote -> loading/error state)
  const [authoritativePrice, setAuthoritativePrice] = useState<number | null>(null);
  const [loadingQuote, setLoadingQuote] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);

  // Synchronize Authoritative Price: Check eventData.event_price first; if missing, request authoritative server quote
  useEffect(() => {
    if (!eventData) {
      setAuthoritativePrice(null);
      setLoadingQuote(false);
      setQuoteError(null);
      return;
    }

    if (typeof eventData.event_price === 'number' && eventData.event_price > 0) {
      setAuthoritativePrice(eventData.event_price);
      setLoadingQuote(false);
      setQuoteError(null);
      return;
    }

    let cancelled = false;
    const fetchAuthoritativeQuote = async () => {
      setLoadingQuote(true);
      setQuoteError(null);
      try {
        const res = await apiFetch('/api/events/quote', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            event_id: eventData.id,
            start_date: eventData.start_date,
            end_date: eventData.end_date,
            payment_mode: 'COMBINED_CREDIT',
          }),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || 'Failed to fetch authoritative price quote');
        }

        const data = await res.json();
        const price = data.calculation?.eventPrice ?? data.quote?.event_price ?? null;
        if (!cancelled) {
          if (typeof price === 'number' && price > 0) {
            setAuthoritativePrice(price);
          } else {
            setQuoteError('Authoritative quote unavailable');
          }
        }
      } catch (err: any) {
        if (!cancelled) {
          console.error('Error fetching authoritative preview quote:', err);
          setQuoteError(err.message || 'Price calculation failed');
        }
      } finally {
        if (!cancelled) {
          setLoadingQuote(false);
        }
      }
    };

    fetchAuthoritativeQuote();
    return () => {
      cancelled = true;
    };
  }, [eventData?.id, eventData?.event_price, eventData?.start_date, eventData?.end_date]);

  const fetchEvent = async () => {
    if (!eventId) {
      setError('Event ID is missing from preview URL');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      setErrorCode(null);
      setErrorPayload(null);
      const cacheBuster = `_t=${Date.now()}`;
      const res = await apiFetch(`/api/events/${eventId}/preview?${cacheBuster}`, {
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
        },
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        if (errData.code === 'PREVIEW_WINDOW_ENDED' || errData.code === 'EVENT_EXPIRED') {
          setErrorCode(errData.code);
          setErrorPayload(errData);
          if (errData.event) {
            setEventData(errData.event);
          }
          return;
        }

        // Fallback to /api/events/:id if /preview returns 404
        const fallbackRes = await apiFetch(`/api/events/${eventId}?${cacheBuster}`, {
          cache: 'no-store',
          headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
          },
        });
        if (!fallbackRes.ok) {
          const fallbackErrData = await fallbackRes.json().catch(() => ({}));
          throw new Error(fallbackErrData.error || errData.error || 'Failed to load event details for preview');
        }
        const fallbackData = await fallbackRes.json();
        setEventData(fallbackData.event);
        return;
      }

      const data = await res.json();
      setEventData(data.event);
    } catch (err: any) {
      console.error('Error fetching preview event:', err);
      setError(err.message || 'Unable to load event preview.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEvent();
  }, [eventId]);

  // Sync fullscreen state strictly with browser events
  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(
        !!document.fullscreenElement || !!(document as any).webkitFullscreenElement
      );
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    document.addEventListener('webkitfullscreenchange', handleFsChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFsChange);
      document.removeEventListener('webkitfullscreenchange', handleFsChange);
    };
  }, []);

  const toggleFullscreen = async () => {
    const isCurrentlyFs =
      !!document.fullscreenElement || !!(document as any).webkitFullscreenElement;
    if (!isCurrentlyFs) {
      const el = document.documentElement;
      const reqFs =
        el.requestFullscreen ||
        (el as any).webkitRequestFullscreen ||
        (el as any).mozRequestFullScreen ||
        (el as any).msRequestFullscreen;
      if (reqFs) {
        try {
          await reqFs.call(el);
        } catch (err) {
          console.warn('Fullscreen request failed:', err);
        }
      }
    } else {
      const exitFs =
        document.exitFullscreen ||
        (document as any).webkitExitFullscreen ||
        (document as any).mozCancelFullScreen ||
        (document as any).msExitFullscreen;
      if (exitFs) {
        try {
          await exitFs.call(document);
        } catch (err) {
          console.warn('Exit fullscreen failed:', err);
        }
      }
    }
  };

  const copyPublicLink = async () => {
    const token = eventData?.public_token || errorPayload?.public_token;
    if (!token) return;
    const url = `${window.location.origin}/play/${token}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch (err) {
      console.error('Failed to copy public URL', err);
    }
  };

  // Loading State
  if (loading) {
    return (
      <div className="min-w-screen min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center font-sans space-y-4 p-4">
        <div className="relative">
          <div className="w-12 h-12 border-4 border-amber-500/20 border-t-amber-500 rounded-full animate-spin" />
          <Sparkles className="w-5 h-5 text-amber-400 absolute inset-0 m-auto animate-pulse" />
        </div>
        <div className="text-center space-y-1">
          <p className="text-sm font-semibold text-slate-200">Loading Event Studio Preview...</p>
          <p className="text-xs text-slate-500 font-mono">Event ID: {eventId}</p>
        </div>
      </div>
    );
  }

  // Check Preview Availability State (Date-Only Rule)
  const targetEvent = eventData || errorPayload?.event;
  const isPreviewAllowed = targetEvent ? canAccessPreviewEvent(targetEvent) : false;
  const isLiveAllowed = targetEvent ? canAccessLiveEvent(targetEvent) : false;
  const availability = targetEvent ? getEventAvailabilityState(targetEvent) : null;
  const isPaid = (targetEvent?.payment_status || '').toUpperCase() === 'PAID';
  const publicToken = targetEvent?.public_token || errorPayload?.public_token;

  // Handle Preview Window Ended / Concluded State
  if (errorCode === 'PREVIEW_WINDOW_ENDED' || errorCode === 'EVENT_EXPIRED' || (targetEvent && !isPreviewAllowed)) {
    const { startDate, endDate, liveOpenDate } = targetEvent ? getNormalizedEventDates(targetEvent) : { startDate: '', endDate: '', liveOpenDate: '' };
    const isExpired = availability?.isAfterLiveWindow || errorCode === 'EVENT_EXPIRED';

    return (
      <div className="min-w-screen min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center font-sans p-6">
        <div className="max-w-lg w-full bg-slate-900 border border-slate-800 rounded-3xl p-8 text-center space-y-6 shadow-2xl">
          <div className="w-16 h-16 bg-amber-500/10 border border-amber-500/30 rounded-2xl flex items-center justify-center mx-auto text-amber-400">
            {isExpired ? <Calendar className="w-8 h-8 text-slate-400" /> : <Play className="w-8 h-8 text-emerald-400" />}
          </div>

          <div className="space-y-2">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-800 border border-slate-700 text-xs font-semibold text-slate-300">
              <span>{isExpired ? 'Event Concluded' : 'Live Window Active'}</span>
            </div>
            <h1 className="text-2xl font-bold text-slate-100">
              {isExpired ? 'Event Has Ended' : 'Preview Window Ended'}
            </h1>
            <p className="text-xs text-slate-400 leading-relaxed max-w-md mx-auto">
              {isExpired
                ? `This event concluded on ${formatDateOnly(endDate)}. The test preview and live deployment are no longer accessible.`
                : `Preview mode is only available before the Live event window starts. The Live window is active from ${formatDateOnly(liveOpenDate)} to ${formatDateOnly(endDate)}.`}
            </p>
          </div>

          {/* Action CTAs */}
          <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              onClick={() => navigateTo('/events')}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 px-4 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Events</span>
            </button>

            {!isExpired && isPaid && publicToken && (
              <button
                onClick={() => window.open(`/play/${publicToken}`, '_blank')}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-400 active:scale-95 text-slate-950 px-5 py-2.5 rounded-xl text-xs font-bold shadow-lg shadow-emerald-500/20 transition-all cursor-pointer"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Open Live Game</span>
                <ExternalLink className="w-3.5 h-3.5 opacity-75" />
              </button>
            )}

            {!isExpired && !isPaid && targetEvent && (
              <button
                onClick={() => setShowPaymentModal(true)}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 active:scale-95 text-slate-950 px-5 py-2.5 rounded-xl text-xs font-bold shadow-lg shadow-amber-500/20 transition-all cursor-pointer"
              >
                <CreditCard className="w-3.5 h-3.5" />
                <span>Pay & Activate Live Game</span>
              </button>
            )}
          </div>

          {/* Payment Modal */}
          {showPaymentModal && targetEvent && (
            <EventPaymentModal
              isOpen={showPaymentModal}
              onClose={() => setShowPaymentModal(false)}
              event={targetEvent}
              onPaymentSuccess={(updated) => {
                setShowPaymentModal(false);
                fetchEvent();
              }}
            />
          )}
        </div>
      </div>
    );
  }

  // Error State (Generic)
  if (error || !eventData) {
    return (
      <div className="min-w-screen min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center font-sans p-6">
        <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-8 text-center space-y-5 shadow-2xl">
          <div className="w-16 h-16 bg-red-500/10 border border-red-500/30 rounded-2xl flex items-center justify-center mx-auto text-red-400">
            <AlertCircle className="w-8 h-8" />
          </div>
          <div className="space-y-2">
            <h1 className="text-xl font-bold text-slate-100">Preview Unavailable</h1>
            <p className="text-xs text-slate-400 leading-relaxed">
              {error || 'The requested event preview could not be found or access is restricted.'}
            </p>
          </div>
          <div className="flex items-center justify-center gap-3 pt-2">
            <button
              onClick={() => navigateTo('/events')}
              className="inline-flex items-center justify-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 px-4 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Events</span>
            </button>
            <button
              onClick={fetchEvent}
              className="inline-flex items-center justify-center gap-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Retry</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  const isPendingPayment =
    eventData.payment_status !== 'PAID' ||
    eventData.status === 'pending_payment' ||
    eventData.calculated_status === 'pending_payment';

  const theme = eventData.game_theme;
  const gameType = eventData.game?.game_type || 'catch-brand';
  const gameName = eventData.game?.name || 'Catch The Brand';
  const themeName = eventData.game_theme?.name || 'Theme';
  const dates = getNormalizedEventDates(eventData);

  const showHeader = shouldShowPreviewHeader(eventData) && !isFullscreen;

  return (
    <div
      className={`h-screen h-[100dvh] w-screen max-w-[100vw] bg-[#07130b] text-slate-100 flex flex-col font-sans select-none overflow-hidden ${
        isFullscreen ? 'p-0 m-0' : ''
      }`}
    >
      {/* ------------------------------------------------------------- */}
      {/* AUTHENTICATED PREVIEW HEADER TOOLBAR                          */}
      {/* Rule: Visible when Preview URL is available                    */}
      {/* ------------------------------------------------------------- */}
      {showHeader && (
        <header className="w-full bg-slate-900/95 backdrop-blur-md border-b border-slate-800 text-slate-100 z-50 shrink-0 flex items-center justify-between px-3 sm:px-4 py-2 transition-all h-13 sm:h-14">
          {/* Left: Navigation & Context */}
          <div className="flex items-center gap-2.5 min-w-0 truncate">
            <button
              type="button"
              onClick={() => navigateTo('/events')}
              className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg transition-colors cursor-pointer flex items-center gap-1 text-xs font-semibold"
              title="Exit Preview"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Events</span>
            </button>

            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-purple-500/20 border border-purple-400/30 text-purple-300 text-[11px] font-bold shrink-0">
              <Gamepad2 className="w-3.5 h-3.5 text-purple-400" />
              <span>TEST PLAY PREVIEW</span>
            </div>

            <div className="hidden lg:flex items-center gap-2 text-xs truncate">
              <span className="font-bold text-slate-200 truncate">{eventData.name}</span>
              <span className="text-slate-600">•</span>
              <span className="text-slate-400 truncate font-mono text-[11px]">
                {gameName} / <strong className="text-amber-300 font-semibold">{themeName}</strong>
              </span>
            </div>
          </div>

          {/* Right: Payment Status & Action CTAs */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {isPendingPayment ? (
              <div className="flex items-center gap-2">
                <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[11px] font-semibold">
                  <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
                  <span>
                    {loadingQuote ? (
                      'Payment Pending (Calculating quote...)'
                    ) : authoritativePrice !== null ? (
                      `Payment Pending (${eventData.event_currency || 'RM'} ${authoritativePrice.toFixed(2)})`
                    ) : quoteError ? (
                      'Payment Pending (Price unavailable)'
                    ) : (
                      'Payment Pending'
                    )}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowPaymentModal(true)}
                  className="px-3 sm:px-4 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 active:scale-95 text-slate-950 font-black text-xs shadow-md shadow-amber-500/20 transition-all cursor-pointer flex items-center gap-1.5"
                >
                  <CreditCard className="w-3.5 h-3.5 text-slate-950" />
                  <span>Pay & Activate</span>
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-[11px] font-semibold">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Paid • Opens {formatDateOnly(dates.liveOpenDate)}</span>
                </div>
                <button
                  type="button"
                  onClick={copyPublicLink}
                  className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-400 border border-slate-700 font-semibold text-xs transition-all cursor-pointer flex items-center gap-1.5"
                  title={`Copy Live URL (Opens on ${formatDateOnly(dates.liveOpenDate)})`}
                >
                  {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span className="hidden md:inline">{copiedLink ? 'Copied URL' : 'Copy Live URL'}</span>
                </button>
              </div>
            )}

            <button
              onClick={toggleFullscreen}
              className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs transition-colors cursor-pointer"
              title="Toggle Fullscreen"
            >
              {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            </button>
          </div>
        </header>
      )}

      {/* Main Play Area */}
      <main
        className={`flex-1 w-full min-h-0 min-w-0 max-w-full overflow-hidden flex flex-col items-center justify-center ${
          isFullscreen ? 'p-0 m-0 h-full w-full min-w-0 min-h-0 max-w-none max-h-none' : 'p-1 sm:p-2 sm:px-3'
        }`}
      >
        <div className="w-full h-full min-h-0 min-w-0 max-w-full max-h-full flex flex-col items-center justify-center overflow-hidden">
          <GameContainer
            gameType={gameType}
            customTheme={theme}
            eventId={eventData.id}
            publicToken={eventData.public_token}
            isEventPreview={true}
            isEventTest={true}
            showCabinetFooter={!isFullscreen}
            allowImmersiveFullscreen={true}
            isFullscreen={isFullscreen}
            onToggleFullscreen={toggleFullscreen}
            className="w-full h-full max-w-full max-h-full"
          />
        </div>
      </main>

      {/* Pay & Activate Modal */}
      {showPaymentModal && eventData && (
        <EventPaymentModal
          isOpen={showPaymentModal}
          onClose={() => setShowPaymentModal(false)}
          event={{
            ...eventData,
            event_price: authoritativePrice ?? undefined,
          }}
          onPaymentSuccess={(updated) => {
            setEventData((prev) => (prev ? { ...prev, ...updated, status: 'scheduled', payment_status: 'PAID' } : updated));
            setShowPaymentModal(false);
            fetchEvent();
          }}
        />
      )}
    </div>
  );
};
