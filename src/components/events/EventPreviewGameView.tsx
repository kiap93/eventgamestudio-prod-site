import React, { useState, useEffect } from 'react';
import { useRouteContext, navigateTo } from '../../hooks/useRouteContext';
import { useAuth } from '../../context/AuthContext';
import { GameContainer } from '../GameContainer';
import { EventPaymentModal } from './EventPaymentModal';
import { apiFetch } from '../../lib/api';
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
} from 'lucide-react';

interface EventPreviewData {
  id: string;
  name: string;
  public_token: string;
  event_date: string | null;
  starts_at: string;
  expires_at: string;
  status: 'draft' | 'scheduled' | 'live' | 'expired' | 'cancelled' | 'pending_payment' | 'active';
  calculated_status?: string;
  payment_status?: 'PAID' | 'UNPAID' | 'REFUNDED' | 'PENDING_PAYMENT';
  payment_mode?: string;
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
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const fetchEvent = async () => {
    if (!eventId) {
      setError('Event ID is missing from preview URL');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const res = await apiFetch(`/api/events/${eventId}/preview`);
      if (!res.ok) {
        // Fallback to /api/events/:id if /preview returns 404
        const fallbackRes = await apiFetch(`/api/events/${eventId}`);
        if (!fallbackRes.ok) {
          const errData = await fallbackRes.json().catch(() => ({}));
          throw new Error(errData.error || 'Failed to load event details for preview');
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

  // Sync fullscreen state
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

  const toggleFullscreen = () => {
    const isCurrentlyFs =
      !!document.fullscreenElement || !!(document as any).webkitFullscreenElement;
    if (!isCurrentlyFs && !isFullscreen) {
      if (document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen().catch(() => {});
      } else if ((document.documentElement as any).webkitRequestFullscreen) {
        (document.documentElement as any).webkitRequestFullscreen();
      }
      setIsFullscreen(true);
    } else {
      if (document.fullscreenElement || (document as any).webkitFullscreenElement) {
        if (document.exitFullscreen) {
          document.exitFullscreen().catch(() => {});
        } else if ((document.exitFullscreen as any).webkitExitFullscreen) {
          (document.exitFullscreen as any).webkitExitFullscreen();
        }
      }
      setIsFullscreen(false);
    }
  };

  const copyPublicLink = async () => {
    if (!eventData?.public_token) return;
    const url = `${window.location.origin}/play/${eventData.public_token}`;
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

  // Error State
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
    eventData.status === 'pending_payment' ||
    eventData.calculated_status === 'pending_payment' ||
    eventData.payment_status === 'PENDING_PAYMENT' ||
    (eventData.payment_status && eventData.payment_status !== 'PAID');

  const theme = eventData.game_theme;
  const gameType = eventData.game?.game_type || 'catch-brand';
  const gameName = eventData.game?.name || 'Catch The Brand';
  const themeName = eventData.game_theme?.name || 'Theme';

  return (
    <div
      className={`h-screen h-[100dvh] w-screen max-w-[100vw] bg-[#07130b] text-slate-100 flex flex-col font-sans select-none overflow-hidden ${
        isFullscreen ? 'p-0 m-0' : ''
      }`}
    >
      {/* ------------------------------------------------------------- */}
      {/* AUTHENTICATED PREVIEW HEADER TOOLBAR (Hidden in Fullscreen)    */}
      {/* ------------------------------------------------------------- */}
      {!isFullscreen && (
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
                  <span>Payment Pending (RM {(eventData.event_price || 1400).toFixed(2)})</span>
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
                  <span>Paid & Active</span>
                </div>
                <button
                  type="button"
                  onClick={copyPublicLink}
                  className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-400 border border-slate-700 font-semibold text-xs transition-all cursor-pointer flex items-center gap-1.5"
                  title="Copy Public Player URL"
                >
                  {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span className="hidden md:inline">{copiedLink ? 'Copied Link' : 'Copy Public URL'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => window.open(`/play/${eventData.public_token}`, '_blank')}
                  className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs transition-colors cursor-pointer"
                  title="Open Public Link in New Tab"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
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
