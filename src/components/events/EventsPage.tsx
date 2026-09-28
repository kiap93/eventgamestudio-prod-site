import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { apiFetch } from '../../lib/api';
import { EventCard } from './EventCard';
import { CreateEventDialog } from './CreateEventDialog';
import { EditEventDialog } from './EditEventDialog';
import { CancelEventModal } from './CancelEventModal';
import { DeleteEventModal } from './DeleteEventModal';
import { EventCalendarView } from './EventCalendarView';
import { isEventExplicitlyCancelled, calculateEventStatus } from '../../lib/dateUtils';
import { navigateTo } from '../../hooks/useRouteContext';
import {
  Plus,
  Calendar as CalendarIcon,
  LayoutList,
  Search,
  Filter,
  Sparkles,
  AlertCircle,
  Clock,
  CheckCircle2,
  Trophy,
  Palette,
  ArrowRight,
  ShieldAlert,
} from 'lucide-react';

export interface ShowcaseRewardStatus {
  hasReceivedReward: boolean;
  eligible: boolean;
  reward?: any | null;
}

export interface EventsPageProps {
  initialLifetimeRewardStatus?: ShowcaseRewardStatus | null;
}

export const EventsPage: React.FC<EventsPageProps> = ({ initialLifetimeRewardStatus }) => {
  const { currentOrganization, organizations, switchOrganization, currentUser } = useAuth();

  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Account Owner First-Event Showcase Reward Status (User-Lifetime Scope)
  const [lifetimeRewardStatus, setLifetimeRewardStatus] = useState<ShowcaseRewardStatus | null>(
    initialLifetimeRewardStatus !== undefined ? initialLifetimeRewardStatus : null
  );
  const [loadingRewardStatus, setLoadingRewardStatus] = useState<boolean>(
    initialLifetimeRewardStatus === undefined
  );

  // Organization Theme Readiness State
  const [themeReadiness, setThemeReadiness] = useState<{
    hasValidTheme: boolean;
    themeCount: number;
    themeSetupRequired: boolean;
    suggestedThemeId: string | null;
  } | null>(null);
  const [loadingThemeReadiness, setLoadingThemeReadiness] = useState(true);

  useEffect(() => {
    let isMounted = true;
    const fetchUserRewardStatus = async () => {
      try {
        const res = await apiFetch('/api/user/showcase-reward-status');
        if (res.ok) {
          const data = await res.json();
          if (isMounted) {
            setLifetimeRewardStatus(data);
          }
        }
      } catch (err) {
        console.error('Error fetching showcase reward status:', err);
      } finally {
        if (isMounted) {
          setLoadingRewardStatus(false);
        }
      }
    };

    fetchUserRewardStatus();

    return () => {
      isMounted = false;
    };
  }, [currentUser?.id]);

  // Fetch Theme Readiness for Organization
  useEffect(() => {
    let isMounted = true;
    const fetchReadiness = async () => {
      if (!currentOrganization?.id) return;
      try {
        setLoadingThemeReadiness(true);
        const res = await apiFetch('/api/theme-readiness');
        if (res.ok) {
          const data = await res.json();
          if (isMounted) {
            setThemeReadiness(data);
          }
        }
      } catch (err) {
        console.error('Error checking theme readiness:', err);
      } finally {
        if (isMounted) setLoadingThemeReadiness(false);
      }
    };

    fetchReadiness();
    return () => {
      isMounted = false;
    };
  }, [currentOrganization?.id]);

  // Automatically handle ?create=true URL query param
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('create') === 'true') {
      if (themeReadiness) {
        if (themeReadiness.hasValidTheme) {
          setIsCreateOpen(true);
        } else {
          navigateTo('/theme-setup');
        }
      }
    }
  }, [themeReadiness]);

  // Filter & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<
    'all' | 'live' | 'scheduled' | 'pending_payment' | 'completed' | 'expired' | 'cancelled' | 'draft'
  >('all');

  // View Mode: 'list' | 'calendar'
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');

  // Modals
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<any | null>(null);
  const [cancellingEvent, setCancellingEvent] = useState<any | null>(null);
  const [deletingEvent, setDeletingEvent] = useState<any | null>(null);

  // Close modals when navigating directly to root /events
  useEffect(() => {
    const handlePopState = () => {
      setIsCreateOpen(false);
      setEditingEvent(null);
      setCancellingEvent(null);
      setDeletingEvent(null);
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  const fetchEvents = async () => {
    if (!currentOrganization || !currentOrganization.id || currentOrganization.id === 'undefined' || currentOrganization.id === 'null') {
      return;
    }
    try {
      setLoading(true);
      setError(null);
      let res = await apiFetch(`/api/organizations/${currentOrganization.id}/events`);
      if (res.status === 404) {
        res = await apiFetch('/api/events');
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to fetch events');
      }
      const data = await res.json();
      setEvents(data.events || []);
    } catch (err: any) {
      console.error('Error fetching events:', err);
      setError(err.message || 'Unable to load events');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEvents();
  }, [currentOrganization?.id]);

  const handleEventCreated = (newEvent: any) => {
    setEvents((prev) => {
      const idx = prev.findIndex((e) => e.id === newEvent.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = newEvent;
        return next;
      }
      return [newEvent, ...prev];
    });
  };

  const handleEventUpdated = (updatedEvent: any) => {
    setEvents((prev) =>
      prev.map((e) => (e.id === updatedEvent.id ? { ...e, ...updatedEvent } : e))
    );
  };

  const handleDeleteEvent = (eventId: string) => {
    const ev = events.find((e) => e.id === eventId);
    if (ev) {
      setDeletingEvent(ev);
    }
  };

  const handleCancelEvent = (eventId: string) => {
    const ev = events.find((e) => e.id === eventId);
    if (ev) {
      setCancellingEvent(ev);
    }
  };

  // Filtered Events for List View
  const filteredEvents = events.filter((ev) => {
    const matchesSearch =
      ev.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ev.game?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ev.game_theme?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ev.public_token?.toLowerCase().includes(searchQuery.toLowerCase());

    const effectiveStatus = calculateEventStatus(ev);

    if (statusFilter === 'all') return matchesSearch;
    return matchesSearch && effectiveStatus === statusFilter;
  });

  // Metrics
  const totalCount = events.length;
  const liveCount = events.filter((e) => calculateEventStatus(e) === 'live').length;
  const scheduledCount = events.filter((e) => calculateEventStatus(e) === 'scheduled').length;
  const pendingCount = events.filter((e) => calculateEventStatus(e) === 'pending_payment').length;
  const completedCount = events.filter((e) => calculateEventStatus(e) === 'completed').length;
  const expiredCount = events.filter((e) => calculateEventStatus(e) === 'expired').length;

  const isViewer = currentOrganization?.role === 'viewer';
  const isOwner = currentOrganization?.role === 'owner';
  const hasClaimedLifetimeReward = lifetimeRewardStatus?.hasReceivedReward === true;
  const shouldShowRewardBanner = isOwner && !hasClaimedLifetimeReward && !loadingRewardStatus;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-8 font-sans">
      {/* Top Banner & Header with View Toggle */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-black text-slate-100 tracking-tight">
              Event Deployments
            </h1>
            {loading ? (
              <div className="h-5 w-16 bg-slate-800 rounded-full animate-pulse border border-slate-700/40" />
            ) : error ? (
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-red-500/10 border border-red-500/30 text-red-400">
                Error
              </span>
            ) : (
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/10 border border-amber-500/30 text-amber-400">
                {totalCount} Total
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Deploy playable Game Themes to dedicated public links for events, campaigns, and corporate activations.
          </p>
        </div>

        <div className="flex items-center flex-wrap gap-2.5">
          {/* View Switcher: [ List ] [ Calendar ] */}
          <div className="flex items-center bg-slate-900 border border-slate-800 p-1 rounded-2xl shadow-inner">
            <button
              onClick={() => setViewMode('list')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                viewMode === 'list'
                  ? 'bg-amber-500 text-slate-950 font-black shadow-md'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
              title="List View"
            >
              <LayoutList className="w-3.5 h-3.5" />
              <span>List</span>
            </button>
            <button
              onClick={() => setViewMode('calendar')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                viewMode === 'calendar'
                  ? 'bg-amber-500 text-slate-950 font-black shadow-md'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
              title="Calendar View"
            >
              <CalendarIcon className="w-3.5 h-3.5" />
              <span>Calendar</span>
            </button>
          </div>

          {!isViewer && (
            <button
              onClick={() => {
                if (themeReadiness && !themeReadiness.hasValidTheme) {
                  navigateTo('/theme-setup');
                  return;
                }
                setIsCreateOpen(true);
              }}
              className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-slate-950 px-4 py-2.5 rounded-2xl text-xs font-bold transition-all shadow-lg shadow-amber-500/20 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Create Event</span>
            </button>
          )}
        </div>
      </div>

      {/* Mandatory Theme Setup Required Notice */}
      {!loadingThemeReadiness && themeReadiness && !themeReadiness.hasValidTheme && (
        <div className="bg-gradient-to-r from-amber-500/15 via-amber-500/10 to-slate-900 border border-amber-500/30 rounded-3xl p-5 sm:p-6 shadow-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-amber-500/20 text-amber-400 rounded-2xl border border-amber-500/30 shrink-0">
              <Palette className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-amber-500">
                  Required Onboarding Step
                </span>
                <span className="text-[10px] bg-amber-500/20 text-amber-300 font-bold px-2 py-0.5 rounded-full border border-amber-500/30">
                  Theme Setup Required
                </span>
              </div>
              <h2 className="text-base font-extrabold text-white mt-1">
                Customize your brand theme before creating events
              </h2>
              <p className="text-xs text-slate-300 mt-1 max-w-2xl leading-relaxed">
                Before creating your first event, customize your theme to match your brand. Event creation remains locked until your theme is saved.
              </p>
            </div>
          </div>
          <button
            onClick={() => navigateTo('/theme-setup')}
            className="w-full sm:w-auto px-5 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-slate-950 font-bold text-xs shadow-md transition-all flex items-center justify-center gap-2 shrink-0 cursor-pointer"
          >
            <span>Set Up Theme</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Metrics Summary Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 space-y-1 shadow-sm">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Live</span>
          {loading ? (
            <div className="h-8 w-12 bg-slate-800/80 rounded-xl animate-pulse mt-0.5" />
          ) : error ? (
            <div className="text-2xl font-black text-slate-600">—</div>
          ) : (
            <div className="text-2xl font-black text-emerald-400">{liveCount}</div>
          )}
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 space-y-1 shadow-sm">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Scheduled</span>
          {loading ? (
            <div className="h-8 w-12 bg-slate-800/80 rounded-xl animate-pulse mt-0.5" />
          ) : error ? (
            <div className="text-2xl font-black text-slate-600">—</div>
          ) : (
            <div className="text-2xl font-black text-blue-400">{scheduledCount}</div>
          )}
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 space-y-1 shadow-sm">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Pending Payment</span>
          {loading ? (
            <div className="h-8 w-12 bg-slate-800/80 rounded-xl animate-pulse mt-0.5" />
          ) : error ? (
            <div className="text-2xl font-black text-slate-600">—</div>
          ) : (
            <div className="text-2xl font-black text-amber-400">{pendingCount}</div>
          )}
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 space-y-1 shadow-sm">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Completed</span>
          {loading ? (
            <div className="h-8 w-12 bg-slate-800/80 rounded-xl animate-pulse mt-0.5" />
          ) : error ? (
            <div className="text-2xl font-black text-slate-600">—</div>
          ) : (
            <div className="text-2xl font-black text-emerald-300">{completedCount}</div>
          )}
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 space-y-1 shadow-sm col-span-2 sm:col-span-1">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Expired</span>
          {loading ? (
            <div className="h-8 w-12 bg-slate-800/80 rounded-xl animate-pulse mt-0.5" />
          ) : error ? (
            <div className="text-2xl font-black text-slate-600">—</div>
          ) : (
            <div className="text-2xl font-black text-slate-400">{expiredCount}</div>
          )}
        </div>
      </div>

      {/* Account Owner First-Event Showcase Reward Banner */}
      {shouldShowRewardBanner && (
        <div
          id="account-owner-showcase-reward-banner"
          className="relative overflow-hidden bg-slate-900 border border-amber-500/30 rounded-3xl p-6 shadow-xl"
        >
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
            <div className="flex items-start gap-4 sm:gap-5">
              <div className="p-3 sm:p-3.5 bg-amber-500/10 border border-amber-500/20 rounded-2xl text-amber-400 shrink-0 mt-0.5">
                <Trophy className="w-6 h-6 sm:w-7 sm:h-7" />
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <h2 className="text-base sm:text-lg font-black text-slate-100 tracking-tight">
                    Account Owner First-Event Showcase Reward
                  </h2>
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/10 border border-amber-500/30 text-amber-400">
                    <Sparkles className="w-3 h-3 text-amber-400" />
                    <span>RM300 Lifetime Bonus</span>
                  </span>
                </div>
                <p className="text-xs sm:text-sm text-slate-400 leading-relaxed max-w-3xl">
                  As an organization owner, your first live event activation is eligible for an RM300 Showcase Credit. After your event runs, simply upload event photos/videos to the Showcase tab. Upon review, RM300 is deposited into your wallet. (Limit one first-event reward per account owner).
                </p>
              </div>
            </div>

            <div className="flex items-center shrink-0 pl-0 lg:pl-4">
              <button
                id="deploy-first-event-reward-cta"
                onClick={() => setIsCreateOpen(true)}
                className="w-full sm:w-auto flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-5 py-2.5 rounded-2xl text-xs transition-all shadow-md shadow-amber-500/20 cursor-pointer whitespace-nowrap"
              >
                <Plus className="w-4 h-4" />
                <span>Deploy First Event</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Area: Error State | View Mode (List or Calendar) */}
      {error ? (
        <div className="bg-slate-900/60 border border-red-500/30 rounded-3xl p-10 text-center space-y-4 max-w-xl mx-auto shadow-lg">
          <div className="w-12 h-12 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-center justify-center mx-auto text-red-400">
            <AlertCircle className="w-6 h-6" />
          </div>
          <div className="space-y-1.5">
            <h3 className="text-base font-bold text-slate-100">Unable to load events</h3>
            <p className="text-xs text-slate-400 leading-relaxed max-w-md mx-auto">
              We couldn't retrieve your event deployments. Please check your connection and try again.
            </p>
            {error && error !== 'Unable to load events' && (
              <p className="text-[11px] font-mono text-red-400/80 bg-red-500/5 py-1 px-3 rounded-lg inline-block mt-1">
                {error}
              </p>
            )}
          </div>
          <div>
            <button
              onClick={fetchEvents}
              className="inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-slate-950 px-5 py-2.5 rounded-2xl text-xs font-bold transition-all shadow-md shadow-amber-500/20 cursor-pointer"
            >
              <span>Try Again</span>
            </button>
          </div>
        </div>
      ) : viewMode === 'calendar' ? (
        loading ? (
          <div className="bg-slate-900/40 border border-slate-800 rounded-3xl p-10 text-center space-y-4">
            <div className="w-8 h-8 border-3 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto" />
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-slate-200">Loading your events...</h3>
              <p className="text-xs text-slate-400">Retrieving your event deployments. This may take a moment.</p>
            </div>
            <div className="h-96 bg-slate-950/40 rounded-2xl border border-slate-800/60 animate-pulse mt-6" />
          </div>
        ) : (
          <EventCalendarView
            events={events}
            userRole={currentOrganization?.role}
            organizations={organizations}
            currentOrganizationId={currentOrganization?.id}
            onSelectOrganization={(orgId) => switchOrganization(orgId)}
            onEditEvent={(eventToEdit) => setEditingEvent(eventToEdit)}
            onCreateEvent={() => setIsCreateOpen(true)}
          />
        )
      ) : (
        /* List View */
        <div className="space-y-6">
          {/* Filters and Search Bar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-slate-900/60 border border-slate-800 p-3 rounded-2xl">
            {/* Search */}
            <div className="relative flex-1 max-w-md">
              <Search className={`w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 transition-colors ${loading ? 'text-slate-600' : 'text-slate-500'}`} />
              <input
                type="text"
                value={searchQuery}
                disabled={loading}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={loading ? 'Loading events...' : 'Search by event name, game, theme, or token...'}
                className={`w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-4 py-2 text-xs text-slate-100 placeholder:text-slate-600 outline-none focus:border-amber-500 transition-opacity ${
                  loading ? 'opacity-60 cursor-not-allowed' : ''
                }`}
              />
            </div>

            {/* Status Filter Pills */}
            <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0">
              {(
                [
                  { key: 'all', label: 'All' },
                  { key: 'live', label: 'Live' },
                  { key: 'scheduled', label: 'Scheduled' },
                  { key: 'pending_payment', label: 'Pending Payment' },
                  { key: 'completed', label: 'Completed' },
                  { key: 'expired', label: 'Expired' },
                  { key: 'cancelled', label: 'Cancelled' },
                ] as const
              ).map(({ key, label }) => {
                const isSelected = statusFilter === key;
                return (
                  <button
                    key={key}
                    disabled={loading}
                    onClick={() => setStatusFilter(key)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold uppercase tracking-wider whitespace-nowrap transition-all ${
                      loading
                        ? 'opacity-40 cursor-not-allowed text-slate-500'
                        : isSelected
                        ? 'bg-amber-500 text-slate-950 font-bold shadow-sm cursor-pointer'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800 cursor-pointer'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Events List Grid / Loading / Empty States */}
          {loading ? (
            <div className="space-y-6">
              {/* Centered Loading Indicator Banner */}
              <div className="bg-slate-900/40 border border-slate-800 rounded-3xl p-8 text-center space-y-3">
                <div className="w-8 h-8 border-3 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto" />
                <div className="space-y-1">
                  <h3 className="text-sm font-bold text-slate-200">Loading your events...</h3>
                  <p className="text-xs text-slate-400">Retrieving your event deployments. This may take a moment.</p>
                </div>
              </div>

              {/* Skeletons for Event Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <div
                    key={i}
                    className="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-4 animate-pulse shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-2 flex-1">
                        <div className="h-4.5 w-3/4 bg-slate-800 rounded-lg" />
                        <div className="h-3 w-1/2 bg-slate-800/60 rounded" />
                      </div>
                      <div className="h-6 w-16 bg-slate-800 rounded-full" />
                    </div>
                    <div className="h-36 bg-slate-950/60 border border-slate-800/60 rounded-2xl" />
                    <div className="flex items-center justify-between pt-3 border-t border-slate-800/50">
                      <div className="h-3 w-28 bg-slate-800/60 rounded" />
                      <div className="h-7 w-20 bg-slate-800 rounded-xl" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : filteredEvents.length === 0 ? (
            <div className="bg-slate-900/40 border border-dashed border-slate-800 rounded-3xl p-12 text-center space-y-4">
              <div className="w-16 h-16 bg-amber-500/10 border border-amber-500/20 rounded-2xl flex items-center justify-center mx-auto text-amber-400">
                {searchQuery || statusFilter !== 'all' ? (
                  <Search className="w-8 h-8" />
                ) : (
                  <CalendarIcon className="w-8 h-8" />
                )}
              </div>
              <div className="space-y-1 max-w-sm mx-auto">
                <h3 className="text-base font-bold text-slate-200">
                  {searchQuery || statusFilter !== 'all'
                    ? 'No matching events found'
                    : 'No events yet'}
                </h3>
                <p className="text-xs text-slate-400">
                  {searchQuery || statusFilter !== 'all'
                    ? 'Try clearing your search query or status filter.'
                    : 'Create your first event to start deploying interactive games.'}
                </p>
              </div>
              {searchQuery || statusFilter !== 'all' ? (
                <button
                  onClick={() => {
                    setSearchQuery('');
                    setStatusFilter('all');
                  }}
                  className="inline-flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold px-4 py-2 rounded-xl text-xs transition-all cursor-pointer"
                >
                  <span>Clear Filters</span>
                </button>
              ) : !isViewer ? (
                <button
                  onClick={() => {
                    if (themeReadiness && !themeReadiness.hasValidTheme) {
                      navigateTo('/theme-setup');
                      return;
                    }
                    setIsCreateOpen(true);
                  }}
                  className="inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-5 py-2.5 rounded-2xl text-xs transition-all shadow-md shadow-amber-500/20 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>{themeReadiness && !themeReadiness.hasValidTheme ? 'Set Up Theme First' : 'Create Event'}</span>
                </button>
              ) : null}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredEvents.map((ev) => (
                <EventCard
                  key={ev.id}
                  event={ev}
                  userRole={currentOrganization?.role}
                  onEdit={(eventToEdit) => {
                    setEditingEvent(eventToEdit);
                  }}
                  onDelete={handleDeleteEvent}
                  onCancel={handleCancelEvent}
                  onRefresh={fetchEvents}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Create Dialog */}
      <CreateEventDialog
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onEventCreated={handleEventCreated}
        initialGameId={new URLSearchParams(window.location.search).get('game') || undefined}
      />

      {/* Edit Dialog */}
      {editingEvent && (
        <EditEventDialog
          isOpen={true}
          event={editingEvent}
          userRole={currentOrganization?.role}
          onClose={() => setEditingEvent(null)}
          onEventUpdated={handleEventUpdated}
        />
      )}

      {/* Cancel Event Modal with Policy & Refund Evaluation */}
      {cancellingEvent && (
        <CancelEventModal
          isOpen={true}
          event={cancellingEvent}
          onClose={() => setCancellingEvent(null)}
          onSuccess={(updatedEvent) => {
            handleEventUpdated(updatedEvent);
            fetchEvents();
          }}
        />
      )}

      {/* Delete Event Modal with Authoritative Policy */}
      {deletingEvent && (
        <DeleteEventModal
          isOpen={true}
          event={deletingEvent}
          onClose={() => setDeletingEvent(null)}
          onSuccess={(deletedId) => {
            setEvents((prev) => prev.filter((e) => e.id !== deletedId));
            setDeletingEvent(null);
          }}
        />
      )}
    </div>
  );
};
