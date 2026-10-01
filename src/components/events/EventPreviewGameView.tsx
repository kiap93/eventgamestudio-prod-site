import React, { useState, useEffect, useRef } from 'react';
import { useRouteContext, navigateTo } from '../../hooks/useRouteContext';
import { GameContainer } from '../GameContainer';
import { apiFetch } from '../../lib/api';
import {
  canAccessPreviewEvent,
  isEventExplicitlyCancelled,
  shouldShowPreviewHeader,
} from '../../lib/dateUtils';
import {
  ArrowLeft,
  Sparkles,
  RefreshCw,
  Maximize2,
  Minimize2,
  AlertCircle,
  FlaskConical,
} from 'lucide-react';
import { LanguageSelector } from '../common/LanguageSelector';
import { useLocalization } from '../../context/LocalizationContext';

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
  const { t } = useLocalization();
  const routeContext = useRouteContext();
  const eventId = propEventId || routeContext.eventId;
  const previewShellRef = useRef<HTMLDivElement | null>(null);

  const [eventData, setEventData] = useState<EventPreviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [errorPayload, setErrorPayload] = useState<any>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

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
        if (
          errData.code === 'EVENT_CANCELLED' ||
          errData.code === 'PREVIEW_UNAVAILABLE' ||
          errData.code === 'PREVIEW_WINDOW_ENDED' ||
          errData.code === 'EVENT_EXPIRED'
        ) {
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
      // Prioritize previewShellRef so that in browser element-level fullscreen, the preview shell
      // (which contains the permanent TESTING overlay) is the fullscreen element!
      const el = previewShellRef.current || document.documentElement;
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

  // Loading State
  if (loading) {
    return (
      <div className="min-w-screen min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center font-sans space-y-4 p-4">
        <div className="relative">
          <div className="w-12 h-12 border-4 border-amber-500/20 border-t-amber-500 rounded-full animate-spin" />
          <Sparkles className="w-5 h-5 text-amber-400 absolute inset-0 m-auto animate-pulse" />
        </div>
        <div className="text-center space-y-1">
          <p className="text-sm font-semibold text-slate-200">{t('event.loadingPreview')}</p>
          <p className="text-xs text-slate-500 font-mono">Event ID: {eventId}</p>
        </div>
      </div>
    );
  }

  // Check Preview Availability State
  const targetEvent = eventData || errorPayload?.event;
  const isPreviewAllowed = targetEvent ? canAccessPreviewEvent(targetEvent) : false;

  // Handle Event Cancelled State
  const isCancelled = errorCode === 'EVENT_CANCELLED' || (targetEvent ? isEventExplicitlyCancelled(targetEvent) : false);
  if (isCancelled) {
    return (
      <div className="min-w-screen min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center font-sans p-6">
        <div className="max-w-md w-full bg-slate-900 border border-red-500/30 rounded-3xl p-8 text-center space-y-6 shadow-2xl">
          <div className="w-16 h-16 bg-red-500/10 border border-red-500/30 rounded-2xl flex items-center justify-center mx-auto text-red-400">
            <AlertCircle className="w-8 h-8 text-red-400" />
          </div>

          <div className="space-y-2">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-500/20 border border-red-500/30 text-xs font-semibold text-red-300">
              <span>{t('event.statusCancelled')}</span>
            </div>
            <h1 className="text-2xl font-bold text-slate-100">
              {t('event.eventHasBeenCancelled')}
            </h1>
            <p className="text-xs text-slate-400 leading-relaxed max-w-md mx-auto">
              {t('event.cancelledPreviewDesc')}
            </p>
          </div>

          <div className="pt-2 flex items-center justify-center">
            <button
              onClick={() => navigateTo('/events')}
              className="inline-flex items-center justify-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 px-5 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>{t('event.backToEvents')}</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Handle Preview Unavailable State
  if (errorCode === 'PREVIEW_UNAVAILABLE' || (targetEvent && !isPreviewAllowed)) {
    return (
      <div className="min-w-screen min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center font-sans p-6">
        <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-8 text-center space-y-5 shadow-2xl">
          <div className="w-16 h-16 bg-amber-500/10 border border-amber-500/30 rounded-2xl flex items-center justify-center mx-auto text-amber-400">
            <AlertCircle className="w-8 h-8" />
          </div>
          <div className="space-y-2">
            <h1 className="text-xl font-bold text-slate-100">{t('event.eventNotAvailable')}</h1>
            <p className="text-xs text-slate-400 leading-relaxed">
              {t('event.eventNotAvailableDesc')}
            </p>
          </div>
          <div className="flex items-center justify-center gap-3 pt-2">
            <button
              onClick={() => navigateTo('/events')}
              className="inline-flex items-center justify-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 px-4 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>{t('event.backToEvents')}</span>
            </button>
          </div>
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
            <h1 className="text-xl font-bold text-slate-100">{t('event.eventNotAvailable')}</h1>
            <p className="text-xs text-slate-400 leading-relaxed">
              {error || t('event.eventNotAvailableDesc')}
            </p>
          </div>
          <div className="flex items-center justify-center gap-3 pt-2">
            <button
              onClick={() => navigateTo('/events')}
              className="inline-flex items-center justify-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 px-4 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>{t('event.backToEvents')}</span>
            </button>
            <button
              onClick={fetchEvent}
              className="inline-flex items-center justify-center gap-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>{t('common.tryAgain')}</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  const theme = eventData.game_theme;
  const gameType = eventData.game?.game_type || 'catch-brand';
  const gameName = eventData.game?.name || 'Catch The Brand';
  const themeName = eventData.game_theme?.name || 'Theme';

  // The preview header/overlay is permanent and must ALWAYS be visible, including in fullscreen!
  // In the event preview route, this is strictly a TESTING / PREVIEW environment.
  const showHeader = shouldShowPreviewHeader(eventData);

  return (
    <div
      ref={previewShellRef}
      id="preview-shell"
      className={`preview-shell relative h-screen h-[100dvh] w-screen max-w-[100vw] bg-[#07130b] text-slate-100 flex flex-col font-sans select-none overflow-hidden ${
        isFullscreen ? 'p-0 m-0' : ''
      }`}
    >
      {/* ------------------------------------------------------------- */}
      {/* PERMANENT TESTING / PREVIEW HEADER OVERLAY                   */}
      {/* Rule: Always visible in preview (normal & fullscreen)        */}
      {/* ------------------------------------------------------------- */}
      {showHeader && (
        <header
          id="preview-testing-overlay"
          className="preview-testing-overlay sticky top-0 w-full bg-slate-950/95 backdrop-blur-md border-b-2 border-amber-500/60 text-slate-100 z-50 shrink-0 flex items-center justify-between px-3 sm:px-4 py-2 transition-all shadow-xl shadow-black/80"
          role="banner"
          aria-label={t('event.previewModeBanner')}
        >
          {/* Left: Navigation & Context */}
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <button
              type="button"
              id="preview-back-to-events-btn"
              onClick={() => navigateTo('/events')}
              className="p-1.5 sm:px-3 sm:py-1.5 bg-slate-900 hover:bg-slate-800 active:scale-95 text-slate-300 hover:text-white border border-slate-700/80 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 text-xs font-semibold shrink-0"
              title={t('common.back')}
            >
              <ArrowLeft className="w-4 h-4 text-slate-400" />
              <span>{t('common.back')}</span>
            </button>

            <div className="hidden lg:flex items-center gap-2 text-xs truncate border-l border-slate-800 pl-3">
              <span className="font-semibold text-slate-300 truncate max-w-[200px]">{eventData.name}</span>
              <span className="text-slate-600">•</span>
              <span className="text-slate-400 font-mono text-[11px] truncate">
                {gameName} / <strong className="text-amber-400 font-medium">{themeName}</strong>
              </span>
            </div>
          </div>

          {/* Center: Prominent TESTING — PREVIEW ONLY Indicator */}
          <div className="flex flex-col items-center justify-center text-center px-2 min-w-0">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/20 border-2 border-amber-400/60 text-amber-300 shadow-md shrink-0">
              <FlaskConical className="w-4 h-4 text-amber-400 animate-pulse shrink-0" />
              <span className="bg-amber-400 text-slate-950 px-2 py-0.5 rounded text-xs font-black tracking-wider uppercase font-mono shadow-sm">
                {t('event.testMode')}
              </span>
              <span className="text-amber-400/70 font-bold text-sm">—</span>
              <span className="text-amber-300 font-black text-xs sm:text-sm tracking-wide">
                {t('common.preview').toUpperCase()}
              </span>
            </div>
            <p className="text-[10px] sm:text-xs text-amber-200/90 font-medium tracking-normal mt-1 text-center truncate max-w-lg">
              {t('event.previewModeBanner')}
            </p>
          </div>

          {/* Right: Language Selector & Fullscreen Toggle */}
          <div className="flex items-center gap-2 shrink-0">
            <LanguageSelector variant="compact" />
            <button
              type="button"
              id="preview-toggle-fullscreen-btn"
              onClick={toggleFullscreen}
              className="p-1.5 sm:px-3 sm:py-1.5 bg-slate-900 hover:bg-slate-800 active:scale-95 text-slate-300 hover:text-white border border-slate-700/80 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 text-xs font-semibold"
              title={isFullscreen ? t('common.exitFullscreen') : t('common.fullscreen')}
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4 text-amber-400" /> : <Maximize2 className="w-4 h-4 text-slate-300" />}
              <span className="hidden sm:inline text-xs">{isFullscreen ? t('common.exitFullscreen') : t('common.fullscreen')}</span>
            </button>
          </div>
        </header>
      )}

      {/* Main Play Area */}
      <main
        className={`flex-1 w-full min-h-0 min-w-0 max-w-full overflow-hidden flex flex-col items-center justify-center relative ${
          isFullscreen ? 'p-0 m-0 h-full w-full min-w-0 min-h-0 max-w-none max-h-none' : 'p-1 sm:p-2 sm:px-3'
        }`}
      >
        <div className="w-full h-full min-h-0 min-w-0 max-w-full max-h-full flex flex-col items-center justify-center overflow-hidden relative">
          {/* Subtle floating watermark tag on top of the game canvas */}
          <div className="absolute top-2 right-2 pointer-events-none z-40 hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-950/80 border border-amber-500/40 text-[10px] font-mono text-amber-300 backdrop-blur-sm shadow-md">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
            <span className="font-bold uppercase tracking-wider">{t('event.testPreviewTag')}</span>
          </div>

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
    </div>
  );
};
