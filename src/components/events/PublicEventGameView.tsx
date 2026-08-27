import React, { useState, useEffect } from 'react';
import { useRouteContext } from '../../hooks/useRouteContext';
import { useAuth } from '../../context/AuthContext';
import { GameContainer } from '../GameContainer';
import { EventPaymentModal } from './EventPaymentModal';
import { apiFetch } from '../../lib/api';
import {
  Calendar,
  Clock,
  AlertTriangle,
  Sparkles,
  RefreshCw,
  Maximize2,
  Minimize2,
  CreditCard,
  AlertCircle,
  LogIn,
  Gamepad2,
  X,
} from 'lucide-react';

interface PublicEventData {
  id: string;
  name: string;
  public_token: string;
  event_date: string | null;
  starts_at: string;
  expires_at: string;
  status: 'draft' | 'scheduled' | 'live' | 'expired' | 'cancelled' | 'pending_payment' | 'active';
  calculated_status?: string;
  payment_status?: 'PAID' | 'UNPAID' | 'REFUNDED' | 'PENDING_PAYMENT';
  organization_id?: string;
  organization_name?: string;
  organization_slug?: string;
  event_price?: number;
  event_currency?: string;
  game?: {
    id: string;
    name: string;
    slug: string;
    game_type: string;
  } | null;
  game_theme?: any;
}

export const PublicEventGameView: React.FC = () => {
  const routeContext = useRouteContext();
  const publicToken = routeContext.publicToken;
  const { user } = useAuth();

  const [eventData, setEventData] = useState<PublicEventData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);

  const [errorDetails, setErrorDetails] = useState<{
    code?: string;
    is_pending_payment?: boolean;
    is_cancelled?: boolean;
    event_name?: string;
  } | null>(null);

  // Poll current time every second for live countdown
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const fetchEvent = async () => {
    if (!publicToken) {
      setError('Missing event token');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      setErrorDetails(null);
      const res = await apiFetch(`/api/public/events/${publicToken}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (data.is_pending_payment || data.code === 'PAYMENT_REQUIRED') {
          setErrorDetails({
            code: 'PAYMENT_REQUIRED',
            is_pending_payment: true,
            event_name: data.event_name,
          });
          setError(data.error || 'This event is currently awaiting payment and activation.');
          return;
        }
        if (data.is_cancelled || data.code === 'EVENT_CANCELLED') {
          setErrorDetails({
            code: 'EVENT_CANCELLED',
            is_cancelled: true,
          });
          setError(data.error || 'This event has been cancelled by the organizer.');
          return;
        }
        if (res.status === 404) {
          throw new Error('Event not found or link has expired.');
        }
        throw new Error(data.error || 'Failed to load event');
      }

      const data = await res.json();
      setEventData(data.event);
    } catch (err: any) {
      console.error('Error fetching public event:', err);
      setError(err.message || 'Unable to load event game.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEvent();
  }, [publicToken]);

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

  const handlePayAndActivateClick = () => {
    if (user) {
      setShowPaymentModal(true);
    } else {
      setShowLoginPrompt(true);
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

  // Error / Payment Pending / Cancelled State
  if (error || !eventData) {
    if (errorDetails?.is_pending_payment) {
      return (
        <div className="min-w-screen min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center font-sans p-6 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-amber-500/5 via-transparent to-orange-500/5 pointer-events-none" />

          <div className="max-w-md w-full bg-slate-900/90 backdrop-blur-xl border border-amber-500/30 rounded-3xl p-8 text-center space-y-6 shadow-2xl relative z-10">
            <div className="w-16 h-16 bg-amber-500/10 border border-amber-500/30 rounded-2xl flex items-center justify-center mx-auto text-amber-400">
              <Clock className="w-8 h-8 animate-pulse" />
            </div>

            <div className="space-y-2">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-semibold">
                <span>Awaiting Activation</span>
              </div>
              <h1 className="text-2xl font-black text-slate-100 tracking-tight">
                {errorDetails.event_name || 'Event Game'}
              </h1>
              <p className="text-xs text-slate-400 leading-relaxed">
                This event is currently being finalized by the organizer. Public gameplay and leaderboards will go live once activated!
              </p>
            </div>

            <div className="p-4 bg-slate-950/80 border border-slate-800 rounded-2xl text-xs text-slate-400 space-y-3">
              <p className="text-[11px] text-slate-500">
                Are you the event organizer? Sign in to your dashboard to test play or activate this event.
              </p>
              <a
                href="/login"
                className="inline-flex items-center justify-center gap-2 w-full py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white rounded-xl text-xs font-semibold transition-all cursor-pointer"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>Organizer Sign In / Preview</span>
              </a>
            </div>

            <button
              onClick={fetchEvent}
              className="inline-flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-6 py-2.5 rounded-xl text-xs transition-all shadow-lg shadow-amber-500/20 cursor-pointer w-full"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Check If Live</span>
            </button>
          </div>
        </div>
      );
    }

    if (errorDetails?.is_cancelled) {
      return (
        <div className="min-w-screen min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center font-sans p-6">
          <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-8 text-center space-y-5 shadow-2xl">
            <div className="w-16 h-16 bg-red-500/10 border border-red-500/30 rounded-2xl flex items-center justify-center mx-auto text-red-400">
              <AlertTriangle className="w-8 h-8" />
            </div>
            <div className="space-y-2">
              <h1 className="text-xl font-bold text-slate-100">Event Cancelled</h1>
              <p className="text-xs text-slate-400 leading-relaxed">
                {error || 'This event has been cancelled by the organizer.'}
              </p>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="min-w-screen min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center font-sans p-6">
        <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-8 text-center space-y-5 shadow-2xl">
          <div className="w-16 h-16 bg-red-500/10 border border-red-500/30 rounded-2xl flex items-center justify-center mx-auto text-red-400">
            <AlertTriangle className="w-8 h-8" />
          </div>
          <div className="space-y-2">
            <h1 className="text-xl font-bold text-slate-100">Event Not Available</h1>
            <p className="text-xs text-slate-400 leading-relaxed">
              {error || 'This event link is invalid or has ended.'}
            </p>
          </div>
          <button
            onClick={fetchEvent}
            className="inline-flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 px-5 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Try Again</span>
          </button>
        </div>
      </div>
    );
  }

  const startTime = new Date(eventData.starts_at).getTime();
  const expiryTime = new Date(eventData.expires_at).getTime();

  // Helper for format countdown
  const formatCountdown = (diffMs: number) => {
    if (diffMs <= 0) return '00:00:00';
    const totalSeconds = Math.floor(diffMs / 1000);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (days > 0) {
      return `${days}d ${hours.toString().padStart(2, '0')}h ${minutes.toString().padStart(2, '0')}m ${seconds.toString().padStart(2, '0')}s`;
    }
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  // If the event is scheduled for the future:
  if (now < startTime) {
    const timeUntilStart = Math.max(0, startTime - now);
    return (
      <div className="min-w-screen min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center font-sans p-6 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-amber-500/5 via-transparent to-orange-500/5 pointer-events-none" />

        <div className="max-w-md w-full bg-slate-900/90 backdrop-blur-xl border border-slate-800 rounded-3xl p-8 text-center space-y-6 shadow-2xl relative z-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-semibold">
            <Clock className="w-3.5 h-3.5" />
            <span>Event Scheduled</span>
          </div>

          <div className="space-y-2">
            <h1 className="text-2xl font-black text-slate-100 tracking-tight">{eventData.name}</h1>
            <p className="text-xs text-slate-400">
              Presented by <strong className="text-slate-200">{eventData.organization_name || 'Studio'}</strong>
            </p>
          </div>

          {/* Countdown Clock Display */}
          <div className="bg-slate-950 border border-slate-800/80 rounded-2xl p-6 space-y-2 shadow-inner">
            <p className="text-[11px] uppercase tracking-wider text-slate-400 font-bold">Game Opens In</p>
            <div className="text-3xl sm:text-4xl font-mono font-black text-amber-400 tracking-wider">
              {formatCountdown(timeUntilStart)}
            </div>
            <p className="text-[11px] text-slate-500">
              Starts on {new Date(eventData.starts_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
            </p>
          </div>

          <div className="pt-2">
            <button
              onClick={fetchEvent}
              className="inline-flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-6 py-2.5 rounded-xl text-xs transition-all shadow-lg shadow-amber-500/20 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Check If Live</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // If the event has expired:
  if (now >= expiryTime || eventData.status === 'expired') {
    return (
      <div className="min-w-screen min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center font-sans p-6">
        <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-8 text-center space-y-5 shadow-2xl">
          <div className="w-16 h-16 bg-slate-800 border border-slate-700 rounded-2xl flex items-center justify-center mx-auto text-slate-400">
            <Calendar className="w-8 h-8" />
          </div>
          <div className="space-y-2">
            <h1 className="text-xl font-bold text-slate-100">{eventData.name}</h1>
            <p className="text-xs text-slate-400">
              This deployment concluded on {new Date(eventData.expires_at).toLocaleDateString([], { dateStyle: 'medium' })}.
            </p>
          </div>
          <div className="p-4 bg-slate-950 border border-slate-800/80 rounded-2xl text-xs text-slate-400">
            Thank you for participating! Stay tuned for future events.
          </div>
        </div>
      </div>
    );
  }

  // Authoritative payment and status checks
  const isPaid = eventData.payment_status === 'PAID';
  const isPendingPayment =
    !isPaid ||
    eventData.status === 'pending_payment' ||
    eventData.calculated_status === 'pending_payment' ||
    eventData.payment_status === 'PENDING_PAYMENT' ||
    eventData.payment_status === 'UNPAID';

  const canUseImmersiveFullscreen =
    isPaid &&
    (eventData.status === 'live' ||
      eventData.status === 'active' ||
      eventData.status === 'scheduled');

  // For unpaid events, fullscreen mode must NOT hide the header.
  // Only confirmed paid events may hide the header during fullscreen.
  const showHeader = !isFullscreen || !canUseImmersiveFullscreen;

  const theme = eventData.game_theme;
  const gameType = eventData.game?.game_type || 'catch-brand';
  const remainingTime = Math.max(0, expiryTime - now);

  return (
    <div
      className={`h-screen h-[100dvh] w-screen max-w-[100vw] bg-[#07130b] text-slate-100 flex flex-col font-sans select-none overflow-hidden ${
        isFullscreen ? 'p-0 m-0' : ''
      }`}
    >
      {/* Event Header Banner (Shown in normal mode, and always kept in fullscreen for unpaid events) */}
      {showHeader && (
        <header className="h-12 bg-slate-900/90 backdrop-blur border-b border-slate-800 px-4 py-2 flex items-center justify-between z-40 shrink-0">
          <div className="flex items-center gap-3 min-w-0 truncate">
            {isPaid ? (
              <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[11px] font-bold shrink-0">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping inline-block" />
                <span>LIVE EVENT</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-[11px] font-bold shrink-0">
                <Clock className="w-3 h-3 text-amber-400" />
                <span>PAYMENT PENDING</span>
              </div>
            )}
            <span className="font-bold text-xs text-slate-200 truncate max-w-[200px] sm:max-w-md">
              {eventData.name}
            </span>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {isPaid && (
              <div className="hidden sm:flex items-center gap-1.5 text-xs text-slate-400 font-mono">
                <Clock className="w-3.5 h-3.5 text-amber-400" />
                <span>Ends in: {formatCountdown(remainingTime)}</span>
              </div>
            )}

            <button
              onClick={toggleFullscreen}
              className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs transition-colors cursor-pointer"
              title={isFullscreen ? 'Exit Fullscreen' : 'Toggle Fullscreen'}
            >
              {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            </button>
          </div>
        </header>
      )}

      {/* Main Play Area */}
      <main
        className={`flex-1 w-full min-h-0 min-w-0 max-w-full overflow-hidden flex flex-col items-center justify-center ${
          isFullscreen && !showHeader ? 'p-0 m-0 h-full' : 'p-1 sm:p-2 sm:px-3'
        }`}
      >
        <div className="w-full h-full min-h-0 min-w-0 max-w-full max-h-full flex flex-col items-center justify-center overflow-hidden">
          <GameContainer
            gameType={gameType}
            customTheme={theme}
            eventId={eventData.id}
            publicToken={eventData.public_token}
            showCabinetFooter={!isFullscreen}
            allowImmersiveFullscreen={canUseImmersiveFullscreen}
            isFullscreen={isFullscreen}
            onToggleFullscreen={toggleFullscreen}
            className="w-full h-full max-w-full max-h-full"
          />
        </div>
      </main>
    </div>
  );
};
