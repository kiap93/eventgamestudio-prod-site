import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { apiFetch } from '../../lib/api';
import { EventCard } from './EventCard';
import { CreateEventDialog } from './CreateEventDialog';
import { EditEventDialog } from './EditEventDialog';
import {
  Calendar,
  Plus,
  Search,
  Filter,
  RefreshCw,
  Clock,
  Sparkles,
  Layers,
  AlertCircle,
} from 'lucide-react';

export const EventsPage: React.FC = () => {
  const { currentOrganization } = useAuth();

  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'live' | 'scheduled' | 'expired' | 'cancelled' | 'draft'>('all');

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<any | null>(null);

  const fetchEvents = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await apiFetch('/api/events');

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to fetch events');
      }

      const data = await res.json();
      setEvents(data.events || []);
    } catch (err: any) {
      console.error('Error loading events:', err);
      setError(err.message || 'Unable to load events');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEvents();
  }, [currentOrganization?.id]);

  const handleEventCreated = (newEvent: any) => {
    setEvents((prev) => [newEvent, ...prev]);
  };

  const handleEventUpdated = (updatedEvent: any) => {
    setEvents((prev) =>
      prev.map((ev) => (ev.id === updatedEvent.id ? updatedEvent : ev))
    );
  };

  const handleDeleteEvent = async (eventId: string) => {
    if (!window.confirm('Are you sure you want to delete this event deployment? This cannot be undone.')) {
      return;
    }

    try {
      const res = await apiFetch(`/api/events/${eventId}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to delete event');
      }

      setEvents((prev) => prev.filter((ev) => ev.id !== eventId));
    } catch (err: any) {
      alert(err.message || 'Failed to delete event');
    }
  };

  const handleCancelEvent = async (eventId: string) => {
    if (!window.confirm('Cancel this event deployment? Public visitors will be notified that the event has ended/been cancelled.')) {
      return;
    }

    try {
      const res = await apiFetch(`/api/events/${eventId}/cancel`, {
        method: 'POST',
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to cancel event');
      }

      const data = await res.json();
      handleEventUpdated(data.event);
    } catch (err: any) {
      alert(err.message || 'Failed to cancel event');
    }
  };

  // Filtered Events
  const filteredEvents = events.filter((ev) => {
    const matchesSearch =
      ev.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ev.game?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ev.game_theme?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ev.public_token?.toLowerCase().includes(searchQuery.toLowerCase());

    const effectiveStatus = ev.calculated_status || ev.status;
    const matchesStatus =
      statusFilter === 'all' || effectiveStatus === statusFilter;

    return matchesSearch && matchesStatus;
  });

  // Metrics
  const totalCount = events.length;
  const liveCount = events.filter((e) => (e.calculated_status || e.status) === 'live').length;
  const scheduledCount = events.filter((e) => (e.calculated_status || e.status) === 'scheduled').length;
  const expiredCount = events.filter((e) => (e.calculated_status || e.status) === 'expired').length;

  const isViewer = currentOrganization?.role === 'viewer';

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-8 font-sans">
      {/* Top Banner & Header */}
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

        <div className="flex items-center gap-3">
          <button
            onClick={fetchEvents}
            disabled={loading}
            className="p-2.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 rounded-2xl text-xs transition-colors"
            title="Refresh events list"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          {!isViewer && (
            <button
              onClick={() => setIsCreateOpen(true)}
              className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-slate-950 px-4 py-2.5 rounded-2xl text-xs font-bold transition-all shadow-lg shadow-amber-500/20"
            >
              <Plus className="w-4 h-4" />
              <span>Create Event</span>
            </button>
          )}
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 space-y-1 shadow-sm">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Total Deployments</span>
          <div className="text-2xl font-black text-slate-100">{totalCount}</div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 space-y-1 shadow-sm">
          <span className="text-[11px] font-semibold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping inline-block" />
            Live Now
          </span>
          <div className="text-2xl font-black text-emerald-400">{liveCount}</div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 space-y-1 shadow-sm">
          <span className="text-[11px] font-semibold text-blue-400 uppercase tracking-wider flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" />
            Scheduled
          </span>
          <div className="text-2xl font-black text-blue-400">{scheduledCount}</div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 space-y-1 shadow-sm">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Concluded / Expired</span>
          <div className="text-2xl font-black text-slate-400">{expiredCount}</div>
        </div>
      </div>

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
          {(['all', 'live', 'scheduled', 'expired', 'cancelled', 'draft'] as const).map((st) => {
            const isSelected = statusFilter === st;
            return (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold uppercase tracking-wider whitespace-nowrap transition-all ${
                  isSelected
                    ? 'bg-amber-500 text-slate-950 font-bold shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`}
              >
                {st}
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
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold"
          >
            Retry
          </button>
        </div>
      ) : filteredEvents.length === 0 ? (
        <div className="bg-slate-900/40 border border-dashed border-slate-800 rounded-3xl p-12 text-center space-y-4">
          <div className="w-16 h-16 bg-amber-500/10 border border-amber-500/20 rounded-2xl flex items-center justify-center mx-auto text-amber-400">
            <Calendar className="w-8 h-8" />
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
              className="inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-5 py-2.5 rounded-2xl text-xs transition-all shadow-md shadow-amber-500/20"
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
              onEdit={(eventToEdit) => setEditingEvent(eventToEdit)}
              onDelete={handleDeleteEvent}
              onCancel={handleCancelEvent}
            />
          ))}
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
          onClose={() => setEditingEvent(null)}
          onEventUpdated={handleEventUpdated}
        />
      )}
    </div>
  );
};
