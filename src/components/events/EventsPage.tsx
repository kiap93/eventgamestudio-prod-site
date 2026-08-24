import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { apiFetch } from '../../lib/api';
import { EventCard } from './EventCard';
import { CreateEventDialog } from './CreateEventDialog';
import { EditEventDialog } from './EditEventDialog';
import { CancelEventModal } from './CancelEventModal';
import { EventCalendarView } from './EventCalendarView';
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
} from 'lucide-react';

export const EventsPage: React.FC = () => {
  const { currentOrganization, organizations, switchOrganization } = useAuth();

  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filter & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<
    'all' | 'live' | 'scheduled' | 'pending_payment' | 'expired' | 'cancelled' | 'draft'
  >('all');

  // View Mode: 'list' | 'calendar'
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');

  // Modals
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<any | null>(null);
  const [cancellingEvent, setCancellingEvent] = useState<any | null>(null);

  const fetchEvents = async () => {
    if (!currentOrganization) return;
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

  const handleDeleteEvent = async (eventId: string) => {
    if (!confirm('Are you sure you want to delete this event deployment?')) return;
    try {
      const res = await apiFetch(`/api/events/${eventId}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to delete event');
      }
      setEvents((prev) => prev.filter((e) => e.id !== eventId));
    } catch (err: any) {
      alert(err.message || 'Error deleting event');
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

    const effectiveStatus = ev.calculated_status || ev.status;
    const isPending =
      effectiveStatus === 'pending_payment' ||
      ev.payment_status === 'PENDING_PAYMENT' ||
      (ev.payment_status && ev.payment_status !== 'PAID');

    if (statusFilter === 'all') return matchesSearch;
    if (statusFilter === 'pending_payment') return matchesSearch && isPending;
    return matchesSearch && !isPending && effectiveStatus === statusFilter;
  });

  // Metrics
  const totalCount = events.length;
  const liveCount = events.filter((e) => (e.calculated_status || e.status) === 'live' && e.payment_status !== 'PENDING_PAYMENT').length;
  const scheduledCount = events.filter((e) => (e.calculated_status || e.status) === 'scheduled' && e.payment_status !== 'PENDING_PAYMENT').length;
  const pendingCount = events.filter((e) => (e.calculated_status || e.status) === 'pending_payment' || e.payment_status === 'PENDING_PAYMENT').length;
  const expiredCount = events.filter((e) => (e.calculated_status || e.status) === 'expired').length;

  const isViewer = currentOrganization?.role === 'viewer';

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-8 font-sans">
      {/* Top Banner & Header with View Toggle */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-black text-slate-100 tracking-tight">
              Event Deployments
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/10 border border-amber-500/30 text-amber-400">
              {totalCount} Total
            </span>
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
              onClick={() => setIsCreateOpen(true)}
              className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-slate-950 px-4 py-2.5 rounded-2xl text-xs font-bold transition-all shadow-lg shadow-amber-500/20 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Create Event</span>
            </button>
          )}
        </div>
      </div>

      {/* Metrics Summary Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 space-y-1 shadow-sm">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Live Deployments</span>
          <div className="text-2xl font-black text-emerald-400">{liveCount}</div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 space-y-1 shadow-sm">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Scheduled</span>
          <div className="text-2xl font-black text-blue-400">{scheduledCount}</div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 space-y-1 shadow-sm">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Pending Payment</span>
          <div className="text-2xl font-black text-amber-400">{pendingCount}</div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 space-y-1 shadow-sm">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Concluded / Expired</span>
          <div className="text-2xl font-black text-slate-400">{expiredCount}</div>
        </div>
      </div>

      {/* View Mode Switching */}
      {viewMode === 'calendar' ? (
        <EventCalendarView
          events={events}
          userRole={currentOrganization?.role}
          organizations={organizations}
          currentOrganizationId={currentOrganization?.id}
          onSelectOrganization={(orgId) => switchOrganization(orgId)}
          onEditEvent={(eventToEdit) => setEditingEvent(eventToEdit)}
          onCreateEvent={() => setIsCreateOpen(true)}
        />
      ) : (
        /* List View */
        <div className="space-y-6">
          {/* Filters and Search Bar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-slate-900/60 border border-slate-800 p-3 rounded-2xl">
            {/* Search */}
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by event name, game, theme, or token..."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-4 py-2 text-xs text-slate-100 placeholder:text-slate-600 outline-none focus:border-amber-500"
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
                  { key: 'expired', label: 'Expired' },
                  { key: 'cancelled', label: 'Cancelled' },
                ] as const
              ).map(({ key, label }) => {
                const isSelected = statusFilter === key;
                return (
                  <button
                    key={key}
                    onClick={() => setStatusFilter(key)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold uppercase tracking-wider whitespace-nowrap transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-amber-500 text-slate-950 font-bold shadow-sm'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Events List Grid */}
          {loading && events.length === 0 ? (
            <div className="py-20 text-center space-y-3">
              <div className="w-8 h-8 border-3 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-xs text-slate-400 font-medium">Loading event deployments...</p>
            </div>
          ) : error ? (
            <div className="p-6 bg-red-500/10 border border-red-500/30 rounded-3xl text-center space-y-3">
              <AlertCircle className="w-8 h-8 text-red-400 mx-auto" />
              <p className="text-sm font-semibold text-red-300">{error}</p>
              <button
                onClick={fetchEvents}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold cursor-pointer"
              >
                Retry
              </button>
            </div>
          ) : filteredEvents.length === 0 ? (
            <div className="bg-slate-900/40 border border-dashed border-slate-800 rounded-3xl p-12 text-center space-y-4">
              <div className="w-16 h-16 bg-amber-500/10 border border-amber-500/20 rounded-2xl flex items-center justify-center mx-auto text-amber-400">
                <CalendarIcon className="w-8 h-8" />
              </div>
              <div className="space-y-1 max-w-sm mx-auto">
                <h3 className="text-base font-bold text-slate-200">
                  {searchQuery || statusFilter !== 'all'
                    ? 'No matching events found'
                    : 'No event deployments yet'}
                </h3>
                <p className="text-xs text-slate-400">
                  {searchQuery || statusFilter !== 'all'
                    ? 'Try clearing your search query or status filter.'
                    : 'Create your first event deployment to assign a Game Theme to a public URL.'}
                </p>
              </div>
              {!isViewer && !searchQuery && statusFilter === 'all' && (
                <button
                  onClick={() => setIsCreateOpen(true)}
                  className="inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-5 py-2.5 rounded-2xl text-xs transition-all shadow-md shadow-amber-500/20 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Create Event</span>
                </button>
              )}
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
    </div>
  );
};
