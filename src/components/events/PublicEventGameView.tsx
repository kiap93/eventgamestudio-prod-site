import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useRouteContext } from '../../hooks/useRouteContext';
import { useAuth } from '../../context/AuthContext';
import { GameContainer } from '../GameContainer';
import { EventPaymentModal } from './EventPaymentModal';
import { apiFetch } from '../../lib/api';
import {
  canAccessLiveEvent,
  canAccessClientLiveGame,
  getClientLiveGameAccessDetails,
  getEventAvailabilityState,
  getNormalizedEventDates,
  formatDateOnly,
  getCalendarDateInTimezone,
  getSingaporeCalendarDate,
  isEventExplicitlyCancelled,
} from '../../lib/dateUtils';
import { getTimezoneDisplayName } from '../../lib/countryUtils';
import {
  Calendar,
  Clock,
  AlertTriangle,
  Sparkles,
  RefreshCw,
  Maximize2,
  Minimize2,
  CreditCard,
  LogIn,
  ShieldCheck,
  Play,
  Lock,
} from 'lucide-react';
import { PublicEventDTO } from '../../types';
import { LanguageSelector } from '../common/LanguageSelector';
import { useLocalization } from '../../context/LocalizationContext';

export const PublicEventGameView: React.FC = () => {
  const { t, resolveContent } = useLocalization();
  const routeContext = useRouteContext();
  const publicToken = routeContext.publicToken;
  const { user, currentOrganization } = useAuth();

  const [eventData, setEventData] = useState<PublicEventDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [singaporeDateKey, setSingaporeDateKey] = useState<string>(() => getSingaporeCalendarDate());
  const fullscreenContainerRef = useRef<HTMLDivElement | null>(null);

  const [errorDetails, setErrorDetails] = useState<{
    code?: string;
    is_pending_payment?: boolean;
    is_cancelled?: boolean;
    is_scheduled?: boolean;
    is_expired?: boolean;
    live_open_date?: string;
    start_date?: string;
    end_date?: string;
    event_id?: string;
    event_name?: string;
    event_timezone?: string;
  } | null>(null);

  // Periodic check for event date boundary change (midnight transition in event timezone)
  useEffect(() => {
    const activeTz = eventData?.event_timezone || errorDetails?.event_timezone || 'Asia/Singapore';
    const dateTimer = setInterval(() => {
      const todayInTz = getCalendarDateInTimezone(new Date(), activeTz);
      setSingaporeDateKey((prev) => (prev !== todayInTz ? todayInTz : prev));
    }, 15000);
    return () => clearInterval(dateTimer);
  }, [eventData?.event_timezone, errorDetails?.event_timezone]);

  /**
   * Authoritative Event Fetcher with cache-busting
   * @param showLoadingSpinner When false, runs silently in background without flickering UI
   */
  const fetchEvent = useCallback(
    async (showLoadingSpinner: boolean = true) => {
      if (!publicToken) {
        setError('Missing event token');
        setLoading(false);
        return;
      }

      try {
        if (showLoadingSpinner) {
          setLoading(true);
        }

        const cacheBuster = `_t=${Date.now()}`;
        const res = await apiFetch(`/api/public/events/${publicToken}?${cacheBuster}`, {
          cache: 'no-store',
          headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
          },
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          if (data.is_pending_payment || data.code === 'PAYMENT_REQUIRED') {
            setErrorDetails({
              code: 'PAYMENT_REQUIRED',
              is_pending_payment: true,
              event_id: data.event_id,
              event_name: data.event_name,
              live_open_date: data.live_open_date,
              start_date: data.start_date,
              end_date: data.end_date,
              event_timezone: data.event_timezone,
            });
            setError(data.error || 'This event is currently awaiting payment and activation.');
            setEventData(null);
            return;
          }
          if (data.is_cancelled || data.code === 'EVENT_CANCELLED') {
            setErrorDetails({
              code: 'EVENT_CANCELLED',
              is_cancelled: true,
              event_timezone: data.event_timezone,
            });
            setError(data.error || 'This event has been cancelled by the organizer.');
            setEventData(null);
            return;
          }
          if (data.code === 'EVENT_NOT_OPEN' || data.is_scheduled) {
            setErrorDetails({
              code: 'EVENT_NOT_OPEN',
              is_scheduled: true,
              live_open_date: data.live_open_date,
              start_date: data.start_date,
              end_date: data.end_date,
              event_id: data.event_id,
              event_name: data.event_name,
              event_timezone: data.event_timezone,
            });
            setError(data.error || 'This event is not open yet.');
            setEventData(null);
            return;
          }
          if (
            data.code === 'EVENT_EXPIRED' ||
            data.code === 'EVENT_COMPLETED' ||
            data.is_expired ||
            data.is_completed
          ) {
            setErrorDetails({
              code: data.code || (data.is_completed ? 'EVENT_COMPLETED' : 'EVENT_EXPIRED'),
              is_expired: true,
              is_completed: data.code === 'EVENT_COMPLETED' || Boolean(data.is_completed),
              start_date: data.start_date,
              end_date: data.end_date,
              event_id: data.event_id,
              event_name: data.event_name,
              event_timezone: data.event_timezone,
            });
            setError(data.error || 'This event has concluded.');
            setEventData(null);
            return;
          }
          if (res.status === 404) {
            setErrorDetails(null);
            throw new Error('Event not found or link has expired.');
          }
          setErrorDetails(null);
          throw new Error(data.error || 'Failed to load event');
        }

        const data = await res.json();
        setEventData(data.event);
        setError(null);
        setErrorDetails(null);
      } catch (err: any) {
        console.error('Error fetching public event:', err);
        setError(err.message || 'Unable to load event game.');
      } finally {
        if (showLoadingSpinner) {
          setLoading(false);
        }
      }
    },
    [publicToken]
  );

  // Initial fetch on mount / token change
  useEffect(() => {
    fetchEvent(true);
  }, [fetchEvent]);

  // Safe background polling while event is pending payment or awaiting activation
  useEffect(() => {
    if (!publicToken) return;

    const isAwaitingPayment =
      errorDetails?.is_pending_payment ||
      errorDetails?.code === 'PAYMENT_REQUIRED';

    // If event is already confirmed PAID and LIVE, do not fast poll
    if (eventData || !isAwaitingPayment) {
      return;
    }

    const pollTimer = setInterval(() => {
      fetchEvent(false); // Background fetch without full spinner
    }, 4000);

    return () => clearInterval(pollTimer);
  }, [publicToken, errorDetails?.is_pending_payment, errorDetails?.code, eventData, fetchEvent]);

  // Revalidate event status periodically (every 30s) and on window focus
  // to ensure player cannot continue playing indefinitely if event concludes while page is open.
  useEffect(() => {
    if (!publicToken || !eventData) return;

    const interval = setInterval(() => {
      fetchEvent(false);
    }, 30000);

    const onFocus = () => {
      fetchEvent(false);
    };

    window.addEventListener('focus', onFocus);

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', onFocus);
    };
  }, [publicToken, eventData, fetchEvent]);

  // Synchronize fullscreen state strictly with browser events
  const getIsFullscreen = (): boolean => {
    return !!(
      document.fullscreenElement ||
      (document as any).webkitFullscreenElement ||
      (document as any).mozFullScreenElement ||
      (document as any).msFullscreenElement
    );
  };

  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(getIsFullscreen());
    };

    document.addEventListener('fullscreenchange', handleFsChange);
    document.addEventListener('webkitfullscreenchange', handleFsChange);
    document.addEventListener('mozfullscreenchange', handleFsChange);
    document.addEventListener('MSFullscreenChange', handleFsChange);

    setIsFullscreen(getIsFullscreen());

    return () => {
      document.removeEventListener('fullscreenchange', handleFsChange);
      document.removeEventListener('webkitfullscreenchange', handleFsChange);
      document.removeEventListener('mozfullscreenchange', handleFsChange);
      document.removeEventListener('MSFullscreenChange', handleFsChange);
    };
  }, []);

  const toggleFullscreen = async () => {
    const isCurrentlyFs = getIsFullscreen();
    if (!isCurrentlyFs) {
      const elem = fullscreenContainerRef.current || document.documentElement;
      const reqFs =
        elem.requestFullscreen ||
        (elem as any).webkitRequestFullscreen ||
        (elem as any).mozRequestFullScreen ||
        (elem as any).msRequestFullscreen;

      if (reqFs) {
        try {
          await reqFs.call(elem);
        } catch (err) {
          console.warn('Fullscreen request failed or was rejected:', err);
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

  // Loading State
  if (loading) {
    return (
      <div className="min-w-screen min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center font-sans space-y-4 p-4">
        <div className="relative">
          <div className="w-12 h-12 border-4 border-amber-500/20 border-t-amber-500 rounded-full animate-spin" />
          <Sparkles className="w-5 h-5 text-amber-400 absolute inset-0 m-auto animate-pulse" />
        </div>
        <div className="text-center space-y-1">
          <p className="text-sm font-semibold text-slate-200">Connecting to Event...</p>
          <p className="text-xs text-slate-500 font-mono">Token: {publicToken}</p>
        </div>
      </div>
    );
  }

  const activeEvent = eventData;
  const dates = activeEvent ? getNormalizedEventDates(activeEvent) : null;

  // 1. Cancelled State: ONLY when explicitly cancelled by user or admin
  const isCancelled =
    errorDetails?.code === 'EVENT_CANCELLED' || Boolean(errorDetails?.is_cancelled);

  if (isCancelled) {
    return (
      <div className="min-w-screen min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center font-sans p-6">
        <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-8 text-center space-y-5 shadow-2xl">
          <div className="w-16 h-16 bg-red-500/10 border border-red-500/30 rounded-2xl flex items-center justify-center mx-auto text-red-400">
            <AlertTriangle className="w-8 h-8" />
          </div>
          <div className="space-y-2">
            <h1 className="text-xl font-bold text-slate-100">{t('event.statusCancelled')}</h1>
            <p className="text-xs text-slate-400 leading-relaxed">
              {error || t('event.cancelModalDesc')}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // 2. Concluded / Expired State (Evaluated before Payment Pending per Authoritative Business Rules)
  // Authoritative Rule: "After 3-Sep (Event has ended) -> Live Game CLOSED, Public /play URL shows Event Concluded screen, NOT Cancelled and NOT Payment Pending"
  const isExpired =
    !isCancelled &&
    !eventData &&
    (errorDetails?.code === 'EVENT_EXPIRED' ||
      errorDetails?.code === 'EVENT_COMPLETED' ||
      Boolean(errorDetails?.is_expired) ||
      Boolean(errorDetails?.is_completed));

  if (isExpired) {
    const endDate = errorDetails?.end_date || dates?.endDate || '';

    return (
      <div className="min-w-screen min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center font-sans p-6">
        <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-8 text-center space-y-5 shadow-2xl">
          <div className="w-16 h-16 bg-slate-800 border border-slate-700 rounded-2xl flex items-center justify-center mx-auto text-slate-400">
            <Calendar className="w-8 h-8" />
          </div>
          <div className="space-y-2">
            <h1 className="text-xl font-bold text-slate-100">{errorDetails?.event_name || 'Event Game'}</h1>
            <p className="text-xs text-slate-400">
              {t('event.statusCompleted')} • {formatDateOnly(endDate)}
            </p>
          </div>
          <div className="p-4 bg-slate-950 border border-slate-800/80 rounded-2xl text-xs text-slate-400">
            {t('event.eventNotAvailableDesc')}
          </div>
        </div>
      </div>
    );
  }

  // 3. Unpaid / Payment Pending State (Only for non-expired, non-cancelled events)
  const isPendingPayment =
    !isCancelled &&
    !isExpired &&
    !eventData &&
    (errorDetails?.code === 'PAYMENT_REQUIRED' || Boolean(errorDetails?.is_pending_payment));

  if (isPendingPayment) {
    return (
      <div className="min-w-screen min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center font-sans p-6 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-amber-500/5 via-transparent to-orange-500/5 pointer-events-none" />

        <div className="max-w-md w-full bg-slate-900/90 backdrop-blur-xl border border-amber-500/30 rounded-3xl p-8 text-center space-y-6 shadow-2xl relative z-10">
          <div className="w-16 h-16 bg-amber-500/10 border border-amber-500/30 rounded-2xl flex items-center justify-center mx-auto text-amber-400">
            <Clock className="w-8 h-8 animate-pulse" />
          </div>

          <div className="space-y-2">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-semibold">
              <span>{t('event.paymentPending')}</span>
            </div>
            <h1 className="text-2xl font-black text-slate-100 tracking-tight">
              {errorDetails?.event_name || activeEvent?.name || 'Event Game'}
            </h1>
            <p className="text-xs text-slate-400 leading-relaxed">
              {t('event.packageIncludes')}
            </p>
          </div>

          <div className="p-4 bg-slate-950/80 border border-slate-800 rounded-2xl text-xs text-slate-400 space-y-3">
            <p className="text-[11px] text-slate-500">
              {t('event.organizerPrompt')}
            </p>

            {user && (
              <button
                type="button"
                onClick={() => setShowPaymentModal(true)}
                className="inline-flex items-center justify-center gap-2 w-full py-2.5 px-4 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl text-xs font-bold transition-all shadow-md shadow-amber-500/20 cursor-pointer"
              >
                <CreditCard className="w-3.5 h-3.5" />
                <span>{t('event.payAndActivateOrganizer')}</span>
              </button>
            )}

            {!user && (
              <a
                href="/login"
                className="inline-flex items-center justify-center gap-2 w-full py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white rounded-xl text-xs font-semibold transition-all cursor-pointer"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>{t('event.organizerSignIn')}</span>
              </a>
            )}
          </div>

          <button
            onClick={() => fetchEvent(true)}
            className="inline-flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold px-6 py-2.5 rounded-xl text-xs transition-all border border-slate-700 cursor-pointer w-full"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>{t('event.checkIfLive')}</span>
          </button>
        </div>

        {/* Pay & Activate Modal for logged-in organizer */}
        {showPaymentModal && (errorDetails?.event_id || eventData?.id) && (
          <EventPaymentModal
            isOpen={showPaymentModal}
            onClose={() => setShowPaymentModal(false)}
            event={{
              id: errorDetails?.event_id || eventData?.id || '',
              name: errorDetails?.event_name || eventData?.name || 'Event Game',
              public_token: publicToken || '',
              organization_id: currentOrganization?.id,
            }}
            onPaymentSuccess={async () => {
              setShowPaymentModal(false);
              await fetchEvent(true);
            }}
          />
        )}
      </div>
    );
  }

  // 4. Before Live Window (Scheduled) State
  const isBeforeOpeningDate =
    !isCancelled &&
    !isPendingPayment &&
    !eventData &&
    (errorDetails?.code === 'EVENT_NOT_OPEN' || Boolean(errorDetails?.is_scheduled));

  if (isBeforeOpeningDate) {
    const liveOpenDate = errorDetails?.live_open_date || '';
    const startDate = errorDetails?.start_date || '';
    const endDate = errorDetails?.end_date || '';

    return (
      <div className="min-w-screen min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center font-sans p-6 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-amber-500/5 via-transparent to-orange-500/5 pointer-events-none" />

        <div className="max-w-md w-full bg-slate-900/90 backdrop-blur-xl border border-slate-800 rounded-3xl p-8 text-center space-y-6 shadow-2xl relative z-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-semibold">
            <Calendar className="w-3.5 h-3.5" />
            <span>{t('event.eventScheduled')}</span>
          </div>

          <div className="space-y-2">
            <h1 className="text-2xl font-black text-slate-100 tracking-tight">
              {errorDetails?.event_name || 'Event Game'}
            </h1>
          </div>

          {/* Date Information Card */}
          <div className="bg-slate-950 border border-slate-800/80 rounded-2xl p-6 space-y-3 shadow-inner">
            <p className="text-[11px] uppercase tracking-wider text-slate-400 font-bold">{t('event.gameOpensOn')}</p>
            <div className="text-xl sm:text-2xl font-bold text-amber-400">
              {formatDateOnly(liveOpenDate)}
            </div>
            <div className="text-xs text-slate-400 border-t border-slate-800/80 pt-3">
              {t('event.dateRange')}: <span className="font-semibold text-slate-200">{formatDateOnly(startDate)}</span> to <span className="font-semibold text-slate-200">{formatDateOnly(endDate)}</span>
            </div>
            <p className="text-[11px] text-slate-500">
              {t('event.livePlayWillActivate')}
            </p>
          </div>

          <div className="pt-2">
            <button
              onClick={() => fetchEvent(true)}
              className="inline-flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-bold px-6 py-2.5 rounded-xl text-xs transition-all cursor-pointer w-full"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>{t('event.checkIfOpen')}</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 5. Generic Error State
  if (error || !eventData) {
    return (
      <div className="min-w-screen min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center font-sans p-6">
        <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-8 text-center space-y-5 shadow-2xl">
          <div className="w-16 h-16 bg-red-500/10 border border-red-500/30 rounded-2xl flex items-center justify-center mx-auto text-red-400">
            <AlertTriangle className="w-8 h-8" />
          </div>
          <div className="space-y-2">
            <h1 className="text-xl font-bold text-slate-100">{t('event.eventNotAvailable')}</h1>
            <p className="text-xs text-slate-400 leading-relaxed">
              {error || t('event.eventNotAvailableDesc')}
            </p>
          </div>
          <button
            onClick={() => fetchEvent(true)}
            className="inline-flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 px-5 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>{t('common.tryAgain')}</span>
          </button>
        </div>
      </div>
    );
  }

  // 6. Event is LIVE & PAID!
  const theme = eventData.game_theme || eventData.theme;
  const gameType = eventData.game?.game_type || 'catch-brand';
  const showHeader = !isFullscreen;
  const localizedEventName = resolveContent(eventData.translations, eventData.name, 'title') || eventData.name;

  return (
    <div
      ref={fullscreenContainerRef}
      className={`public-event-game-root h-screen h-[100dvh] w-screen max-w-[100vw] bg-[#07130b] text-slate-100 flex flex-col font-sans select-none overflow-hidden ${
        isFullscreen ? 'p-0 m-0' : ''
      }`}
    >
      {/* Event Header Banner (Hidden in Fullscreen) */}
      {showHeader && (
        <header className="h-12 bg-slate-900/90 backdrop-blur border-b border-slate-800 px-4 py-2 flex items-center justify-between z-40 shrink-0">
          <div className="flex items-center gap-3 min-w-0 truncate">
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[11px] font-bold shrink-0">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping inline-block" />
              <span>{t('event.liveNowBadge')}</span>
            </div>
            <span className="font-bold text-xs text-slate-200 truncate max-w-[200px] sm:max-w-md">
              {localizedEventName}
            </span>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {dates && (
              <div className="hidden sm:flex items-center gap-1.5 text-xs text-slate-400 font-medium">
                <Calendar className="w-3.5 h-3.5 text-amber-400" />
                <span>{t('event.liveDates')}: {formatDateOnly(dates.endDate)}</span>
              </div>
            )}

            <LanguageSelector variant="compact" />

            <button
              onClick={toggleFullscreen}
              className="p-1.5 rounded-lg text-xs transition-colors cursor-pointer bg-slate-800 hover:bg-slate-700 text-slate-300 active:scale-95"
              title={isFullscreen ? t('common.exitFullscreen') : t('common.fullscreen')}
              aria-label={isFullscreen ? t('common.exitFullscreen') : t('common.fullscreen')}
            >
              {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            </button>
          </div>
        </header>
      )}

      {/* Main Play Area */}
      <main
        className={`flex-1 w-full min-h-0 min-w-0 max-w-full overflow-hidden flex flex-col items-center justify-center ${
          isFullscreen
            ? 'p-0 m-0 h-full w-full min-w-0 min-h-0 max-w-none max-h-none'
            : 'p-1 sm:p-2 sm:px-3'
        }`}
      >
        <div className="w-full h-full min-h-0 min-w-0 max-w-full max-h-full flex flex-col items-center justify-center overflow-hidden">
          <GameContainer
            gameType={gameType}
            customTheme={theme}
            eventId={eventData.id}
            publicToken={eventData.public_token || publicToken}
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
          event={eventData}
          onPaymentSuccess={async () => {
            setShowPaymentModal(false);
            await fetchEvent(true);
          }}
        />
      )}
    </div>
  );
};
