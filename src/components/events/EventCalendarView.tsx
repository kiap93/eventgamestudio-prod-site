import React, { useState, useMemo } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  Gamepad2,
  Sparkles,
  Plus,
  Filter,
  Layers,
  Building2,
  Search,
  ExternalLink,
  Ban,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { formatEventDateRange, formatDateOnly, calculateEventStatus } from '../../lib/dateUtils';
import { useLocalization } from '../../context/LocalizationContext';

export type CalendarViewType = 'month' | 'week' | 'day';

interface EventCalendarViewProps {
  events: any[];
  userRole?: string;
  organizations?: any[];
  currentOrganizationId?: string;
  onSelectOrganization?: (orgId: string) => void;
  onEditEvent: (event: any) => void;
  onCreateEvent: () => void;
}

// Helpers for date calculations
const DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

function isSameDay(d1: Date, d2: Date): boolean {
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  );
}

function startOfDay(d: Date): Date {
  const res = new Date(d);
  res.setHours(0, 0, 0, 0);
  return res;
}

function endOfDay(d: Date): Date {
  const res = new Date(d);
  res.setHours(23, 59, 59, 999);
  return res;
}

function isEventOnDay(event: any, day: Date): boolean {
  if (!event.starts_at || !event.expires_at) return false;
  const start = startOfDay(new Date(event.starts_at));
  const end = endOfDay(new Date(event.expires_at));
  const target = startOfDay(day);
  return target >= start && target <= end;
}

export const EventCalendarView: React.FC<EventCalendarViewProps> = ({
  events,
  userRole,
  organizations = [],
  currentOrganizationId,
  onSelectOrganization,
  onEditEvent,
  onCreateEvent,
}) => {
  const { t, language } = useLocalization();
  const [currentDate, setCurrentDate] = useState<Date>(() => new Date());
  const [viewType, setViewType] = useState<CalendarViewType>('month');

  // Filter States
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGame, setSelectedGame] = useState<string>('all');
  const [selectedTheme, setSelectedTheme] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [selectedOrgFilter, setSelectedOrgFilter] = useState<string>(
    currentOrganizationId || 'all'
  );

  const isViewer = userRole === 'viewer';
  const today = new Date();

  // Extract unique games and themes for filter dropdowns
  const uniqueGames = useMemo(() => {
    const gameMap = new Map<string, string>();
    events.forEach((ev) => {
      if (ev.game?.id && ev.game?.name) {
        gameMap.set(ev.game.id, ev.game.name);
      }
    });
    return Array.from(gameMap.entries()).map(([id, name]) => ({ id, name }));
  }, [events]);

  const uniqueThemes = useMemo(() => {
    const themeMap = new Map<string, string>();
    events.forEach((ev) => {
      if (ev.game_theme?.id && ev.game_theme?.name) {
        themeMap.set(ev.game_theme.id, ev.game_theme.name);
      }
    });
    return Array.from(themeMap.entries()).map(([id, name]) => ({ id, name }));
  }, [events]);

  // Filtered Events
  const filteredEvents = useMemo(() => {
    return events.filter((ev) => {
      // Search filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = ev.name?.toLowerCase().includes(q);
        const matchesGame = ev.game?.name?.toLowerCase().includes(q);
        const matchesTheme = ev.game_theme?.name?.toLowerCase().includes(q);
        const matchesToken = ev.public_token?.toLowerCase().includes(q);
        if (!matchesName && !matchesGame && !matchesTheme && !matchesToken) {
          return false;
        }
      }

      // Game filter
      if (selectedGame !== 'all') {
        if (ev.game?.id !== selectedGame) return false;
      }

      // Theme filter
      if (selectedTheme !== 'all') {
        if (ev.game_theme?.id !== selectedTheme && ev.game_theme_id !== selectedTheme) {
          return false;
        }
      }

      // Status filter
      if (selectedStatus !== 'all') {
        const effectiveStatus = calculateEventStatus(ev);
        if (effectiveStatus !== selectedStatus) return false;
      }

      // Organization filter (if applicable)
      if (selectedOrgFilter !== 'all') {
        if (ev.organization_id && ev.organization_id !== selectedOrgFilter) {
          return false;
        }
      }

      return true;
    });
  }, [events, searchQuery, selectedGame, selectedTheme, selectedStatus, selectedOrgFilter]);

  // Navigation handlers
  const handlePrevious = () => {
    setCurrentDate((prev) => {
      const next = new Date(prev);
      if (viewType === 'month') {
        next.setMonth(next.getMonth() - 1);
      } else if (viewType === 'week') {
        next.setDate(next.getDate() - 7);
      } else if (viewType === 'day') {
        next.setDate(next.getDate() - 1);
      }
      return next;
    });
  };

  const handleNext = () => {
    setCurrentDate((prev) => {
      const next = new Date(prev);
      if (viewType === 'month') {
        next.setMonth(next.getMonth() + 1);
      } else if (viewType === 'week') {
        next.setDate(next.getDate() + 7);
      } else if (viewType === 'day') {
        next.setDate(next.getDate() + 1);
      }
      return next;
    });
  };

  const handleToday = () => {
    setCurrentDate(new Date());
  };

  // Compute Header Title based on view type
  const headerTitle = useMemo(() => {
    const localeCode = language === 'zh-CN' ? 'zh-CN' : language === 'ms-MY' ? 'ms-MY' : 'en-US';
    const year = currentDate.getFullYear();

    if (viewType === 'month') {
      return currentDate.toLocaleDateString(localeCode, { month: 'long', year: 'numeric' });
    }

    if (viewType === 'week') {
      const startOfWeek = new Date(currentDate);
      startOfWeek.setDate(currentDate.getDate() - currentDate.getDay());
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 6);

      const startPart = startOfWeek.toLocaleDateString(localeCode, { month: 'short', day: 'numeric' });
      const endPart = endOfWeek.toLocaleDateString(localeCode, { month: 'short', day: 'numeric', year: 'numeric' });
      return `${startPart} – ${endPart}`;
    }

    // Day view
    return currentDate.toLocaleDateString(localeCode, {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  }, [currentDate, viewType, language]);

  // Generate Month Grid Dates (e.g. 35 or 42 days)
  const monthGridDays = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    const firstDayOfMonth = new Date(year, month, 1);
    const startingDayOfWeek = firstDayOfMonth.getDay(); // 0 for Sun, 1 for Mon...

    const daysInCurrentMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();

    const days: { date: Date; isCurrentMonth: boolean }[] = [];

    // Previous month padding
    for (let i = startingDayOfWeek - 1; i >= 0; i--) {
      days.push({
        date: new Date(year, month - 1, daysInPrevMonth - i),
        isCurrentMonth: false,
      });
    }

    // Current month days
    for (let i = 1; i <= daysInCurrentMonth; i++) {
      days.push({
        date: new Date(year, month, i),
        isCurrentMonth: true,
      });
    }

    // Next month padding to complete rows (multiple of 7, at least 35 or 42)
    const remaining = (7 - (days.length % 7)) % 7;
    for (let i = 1; i <= remaining || days.length < 35; i++) {
      days.push({
        date: new Date(year, month + 1, i),
        isCurrentMonth: false,
      });
    }

    return days;
  }, [currentDate]);

  // Generate Week Days
  const weekDays = useMemo(() => {
    const startOfWeek = new Date(currentDate);
    startOfWeek.setDate(currentDate.getDate() - currentDate.getDay());
    const days: Date[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(startOfWeek);
      d.setDate(startOfWeek.getDate() + i);
      days.push(d);
    }
    return days;
  }, [currentDate]);

  // Helper for Status Badge & Styling
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'live':
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            {t('event.statusLive', undefined, 'Live')}
          </span>
        );
      case 'scheduled':
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-blue-500/20 text-blue-400 border border-blue-500/40">
            <CalendarIcon className="w-2.5 h-2.5" />
            {t('event.statusScheduled', undefined, 'Scheduled')}
          </span>
        );
      case 'completed':
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
            <CheckCircle2 className="w-2.5 h-2.5" />
            {t('event.statusCompleted', undefined, 'Completed')}
          </span>
        );
      case 'expired':
        return (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-slate-800 text-slate-400 border border-slate-700">
            {t('event.statusExpired', undefined, 'Expired')}
          </span>
        );
      case 'pending_payment':
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-amber-500/20 text-amber-400 border border-amber-500/40">
            <AlertCircle className="w-2.5 h-2.5" />
            {t('event.filterNeedsPayment', undefined, 'Pending')}
          </span>
        );
      case 'cancelled':
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-red-500/20 text-red-400 border border-red-500/40">
            <Ban className="w-2.5 h-2.5" />
            {t('event.filterCancelled', undefined, 'Cancelled')}
          </span>
        );
      case 'draft':
      default:
        return (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-amber-500/20 text-amber-400 border border-amber-500/40">
            {t('event.statusDraft', undefined, 'Draft')}
          </span>
        );
    }
  };

  const getEventBorderClass = (status: string) => {
    switch (status) {
      case 'live':
        return 'border-emerald-500/40 bg-emerald-950/40 hover:bg-emerald-900/50 text-emerald-200';
      case 'scheduled':
        return 'border-blue-500/40 bg-blue-950/40 hover:bg-blue-900/50 text-blue-200';
      case 'completed':
        return 'border-emerald-500/30 bg-emerald-950/30 hover:bg-emerald-900/40 text-emerald-200';
      case 'expired':
        return 'border-slate-800 bg-slate-900/60 hover:bg-slate-800/80 text-slate-400';
      case 'pending_payment':
        return 'border-amber-500/40 bg-amber-950/30 hover:bg-amber-900/40 text-amber-200';
      case 'cancelled':
        return 'border-red-500/40 bg-red-950/40 hover:bg-red-900/50 text-red-300';
      case 'draft':
      default:
        return 'border-amber-500/40 bg-amber-950/30 hover:bg-amber-900/40 text-amber-200';
    }
  };

  const formatEventDates = (event: any) => {
    return formatEventDateRange(
      event.start_date || event.starts_at,
      event.end_date || event.expires_at
    );
  };

  // Check if active filters exist
  const hasActiveFilters =
    searchQuery.trim() !== '' ||
    selectedGame !== 'all' ||
    selectedTheme !== 'all' ||
    selectedStatus !== 'all' ||
    (selectedOrgFilter !== 'all' && selectedOrgFilter !== currentOrganizationId);

  const handleResetFilters = () => {
    setSearchQuery('');
    setSelectedGame('all');
    setSelectedTheme('all');
    setSelectedStatus('all');
    setSelectedOrgFilter(currentOrganizationId || 'all');
  };

  return (
    <div className="space-y-6">
      {/* 1. Calendar Filters Bar */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-4 space-y-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-300">
            <Filter className="w-4 h-4 text-amber-400" />
            <span>{t('event.filterCalendarEvents', undefined, 'Filter Calendar Events')}</span>
            {hasActiveFilters && (
              <button
                onClick={handleResetFilters}
                className="text-[11px] font-semibold text-amber-400 hover:text-amber-300 underline ml-2 cursor-pointer"
              >
                {t('event.clearFilters', undefined, 'Clear all filters')}
              </button>
            )}
          </div>

          <span className="text-[11px] font-medium text-slate-400">
            {t('common.showing', undefined, 'Showing')} <strong className="text-slate-100">{filteredEvents.length}</strong> {t('common.of', undefined, 'of')}{' '}
            {events.length} {t('common.events', undefined, 'events')}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {/* Search Input */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('event.searchPlaceholder', undefined, 'Search event name...')}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-8 pr-3 py-2 text-xs text-slate-100 placeholder:text-slate-600 outline-none focus:border-amber-500 transition-colors"
            />
          </div>

          {/* Organization Filter */}
          {organizations.length > 1 && (
            <div>
              <select
                value={selectedOrgFilter}
                onChange={(e) => {
                  setSelectedOrgFilter(e.target.value);
                  if (e.target.value !== 'all' && onSelectOrganization) {
                    onSelectOrganization(e.target.value);
                  }
                }}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 outline-none focus:border-amber-500 transition-colors cursor-pointer"
              >
                <option value="all">{t('organization.allOrganizations', undefined, 'All Organizations')}</option>
                {organizations.map((org) => (
                  <option key={org.id} value={org.id}>
                    {org.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Game Filter */}
          <div>
            <select
              value={selectedGame}
              onChange={(e) => setSelectedGame(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 outline-none focus:border-amber-500 transition-colors cursor-pointer"
            >
              <option value="all">{t('event.allGames', undefined, 'All Games')}</option>
              {uniqueGames.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </div>

          {/* Theme Filter */}
          <div>
            <select
              value={selectedTheme}
              onChange={(e) => setSelectedTheme(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 outline-none focus:border-amber-500 transition-colors cursor-pointer"
            >
              <option value="all">{t('event.allThemes', undefined, 'All Themes')}</option>
              {uniqueThemes.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 outline-none focus:border-amber-500 transition-colors cursor-pointer"
            >
              <option value="all">{t('event.filterAll', undefined, 'All Status')}</option>
              <option value="live">{t('event.filterLive', undefined, 'Live Now')}</option>
              <option value="scheduled">{t('event.filterUpcoming', undefined, 'Scheduled')}</option>
              <option value="pending_payment">{t('event.filterNeedsPayment', undefined, 'Pending Payment')}</option>
              <option value="completed">{t('event.filterCompleted', undefined, 'Completed')}</option>
              <option value="expired">{t('event.statusExpired', undefined, 'Expired')}</option>
              <option value="draft">{t('event.statusDraft', undefined, 'Draft')}</option>
              <option value="cancelled">{t('event.filterCancelled', undefined, 'Cancelled')}</option>
            </select>
          </div>
        </div>
      </div>

      {/* 2. Calendar Header & Navigation Controls */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 sm:p-5 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 shadow-md">
        {/* Navigation & Title */}
        <div className="flex items-center gap-3 justify-between sm:justify-start">
          <div className="flex items-center gap-1 bg-slate-950 border border-slate-800 p-1 rounded-2xl">
            <button
              onClick={handlePrevious}
              className="p-2 hover:bg-slate-800 rounded-xl text-slate-300 hover:text-slate-100 transition-colors"
              title={t('common.previous', undefined, 'Previous')}
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={handleToday}
              className="px-3 py-1.5 text-xs font-bold text-slate-200 hover:text-amber-400 hover:bg-slate-800 rounded-xl transition-colors"
            >
              {t('common.today', undefined, 'Today')}
            </button>
            <button
              onClick={handleNext}
              className="p-2 hover:bg-slate-800 rounded-xl text-slate-300 hover:text-slate-100 transition-colors"
              title={t('common.next', undefined, 'Next')}
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center gap-2.5">
            <h2 className="text-lg sm:text-xl font-black text-slate-100 tracking-tight">
              {headerTitle}
            </h2>
            <span className="hidden sm:inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-slate-950 border border-slate-800 text-slate-400">
              UTC+8 (SGT/MYT)
            </span>
          </div>
        </div>

        {/* View Switchers (Month / Week / Day) */}
        <div className="flex items-center justify-between sm:justify-end gap-3">
          <div className="flex items-center bg-slate-950 border border-slate-800 p-1 rounded-2xl">
            {(['month', 'week', 'day'] as const).map((view) => {
              const isActive = viewType === view;
              const label =
                view === 'month'
                  ? t('common.month', undefined, 'month')
                  : view === 'week'
                  ? t('common.week', undefined, 'week')
                  : t('common.day', undefined, 'day');
              return (
                <button
                  key={view}
                  onClick={() => setViewType(view)}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold capitalize transition-all ${
                    isActive
                      ? 'bg-amber-500 text-slate-950 shadow-md font-black'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* 3. Empty State (if no events match filters) */}
      {filteredEvents.length === 0 && (
        <div className="bg-slate-900/50 border border-dashed border-slate-800 rounded-3xl p-12 text-center space-y-4">
          <div className="w-14 h-14 bg-amber-500/10 border border-amber-500/20 rounded-2xl flex items-center justify-center mx-auto text-amber-400">
            <CalendarIcon className="w-7 h-7" />
          </div>
          <div className="space-y-1 max-w-md mx-auto">
            <h3 className="text-base font-bold text-slate-200">{t('event.noEventsMatching', undefined, 'No events found')}</h3>
            <p className="text-xs text-slate-400">
              {hasActiveFilters
                ? t('event.tryAdjustingFilters', undefined, 'No events match your current filter criteria. Try adjusting or clearing your filters.')
                : t('event.noEventsDesc', undefined, 'No event deployments exist in this workspace yet.')}
            </p>
          </div>
          <div className="flex items-center justify-center gap-3">
            {hasActiveFilters && (
              <button
                onClick={handleResetFilters}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold cursor-pointer"
              >
                {t('event.clearFilters', undefined, 'Reset Filters')}
              </button>
            )}
            {!isViewer && (
              <button
                onClick={onCreateEvent}
                className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-4 py-2 rounded-xl text-xs transition-all shadow-sm cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>{t('event.createEvent', undefined, 'Create Event')}</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* 4. Month View */}
      {viewType === 'month' && (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <div className="min-w-[640px] sm:min-w-full">
              {/* Day of week labels */}
              <div className="grid grid-cols-7 border-b border-slate-800 bg-slate-950/60">
                {DAYS_OF_WEEK.map((day) => (
                  <div
                    key={day}
                    className="py-3 text-center text-xs font-bold text-slate-400 uppercase tracking-wider"
                  >
                    {day}
                  </div>
                ))}
              </div>

              {/* Month grid */}
              <div className="grid grid-cols-7 auto-rows-fr divide-x divide-y divide-slate-800/80 bg-slate-900">
                {monthGridDays.map(({ date, isCurrentMonth }, idx) => {
                  const isCurrentDay = isSameDay(date, today);
                  const dayEvents = filteredEvents.filter((ev) => isEventOnDay(ev, date));

                  return (
                    <div
                      key={idx}
                      className={`min-h-[110px] sm:min-h-[130px] p-1.5 sm:p-2 flex flex-col justify-between transition-colors ${
                        isCurrentMonth ? 'bg-slate-900/90' : 'bg-slate-950/40 opacity-40'
                      } ${isCurrentDay ? 'ring-1 ring-inset ring-amber-500/50 bg-amber-500/5' : ''}`}
                    >
                      {/* Date number header */}
                      <div className="flex items-center justify-between mb-1">
                        <span
                          className={`text-xs font-bold inline-flex items-center justify-center w-6 h-6 rounded-full transition-all ${
                            isCurrentDay
                              ? 'bg-amber-500 text-slate-950 font-black shadow-md shadow-amber-500/30'
                              : isCurrentMonth
                              ? 'text-slate-300'
                              : 'text-slate-600'
                          }`}
                        >
                          {date.getDate()}
                        </span>

                        {dayEvents.length > 0 && (
                          <span className="text-[10px] font-bold text-slate-500 hidden sm:inline">
                            {dayEvents.length} {dayEvents.length === 1 ? 'event' : 'events'}
                          </span>
                        )}
                      </div>

                      {/* Day Events Stack */}
                      <div className="flex-1 space-y-1.5 overflow-hidden">
                        {dayEvents.slice(0, 3).map((ev) => {
                          const effectiveStatus = calculateEventStatus(ev);
                          const isMultiDay =
                            !isSameDay(new Date(ev.starts_at), new Date(ev.expires_at));
                          const isStartDay = isSameDay(date, new Date(ev.starts_at));
                          const isEndDay = isSameDay(date, new Date(ev.expires_at));

                          return (
                            <div
                              key={ev.id}
                              onClick={() => onEditEvent(ev)}
                              className={`group cursor-pointer rounded-lg px-2 py-1 border text-left transition-all ${getEventBorderClass(
                                effectiveStatus
                              )} ${
                                isMultiDay
                                  ? isStartDay
                                    ? 'border-l-3 border-l-amber-400'
                                    : isEndDay
                                    ? 'border-r-3 border-r-amber-400'
                                    : ''
                                  : ''
                              }`}
                              title={`${ev.name} (${ev.game?.name || 'Game'} · ${
                                ev.game_theme?.name || 'Theme'
                              })\nStatus: ${effectiveStatus}\n${formatEventDates(ev)}`}
                            >
                              <div className="flex items-center justify-between gap-1">
                                <span className="text-[11px] font-bold truncate leading-tight block">
                                  {ev.name}
                                </span>
                                <span className="shrink-0">{getStatusBadge(effectiveStatus)}</span>
                              </div>

                              <div className="text-[9px] opacity-80 truncate flex items-center gap-1 mt-0.5">
                                <span className="font-semibold">{ev.game?.name || 'Game'}</span>
                                <span>·</span>
                                <span className="truncate">{ev.game_theme?.name || 'Theme'}</span>
                              </div>
                            </div>
                          );
                        })}

                        {dayEvents.length > 3 && (
                          <button
                            onClick={() => {
                              setCurrentDate(date);
                              setViewType('day');
                            }}
                            className="w-full text-center py-0.5 text-[10px] font-bold text-amber-400 hover:text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 rounded border border-amber-500/30 transition-colors cursor-pointer"
                          >
                            +{dayEvents.length - 3} {t('common.more', undefined, 'more')}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 5. Week View */}
      {viewType === 'week' && (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <div className="min-w-[640px] sm:min-w-full grid grid-cols-7 divide-x divide-slate-800 bg-slate-900">
              {weekDays.map((day, idx) => {
                const isCurrentDay = isSameDay(day, today);
                const dayEvents = filteredEvents.filter((ev) => isEventOnDay(ev, day));
                const dayName = DAYS_OF_WEEK[day.getDay()];

                return (
                  <div
                    key={idx}
                    className={`min-h-[300px] flex flex-col ${
                      isCurrentDay ? 'bg-amber-500/5 ring-1 ring-inset ring-amber-500/30' : ''
                    }`}
                  >
                    {/* Day Header */}
                    <div
                      className={`p-3 text-center border-b border-slate-800/80 ${
                        isCurrentDay ? 'bg-amber-500/10' : 'bg-slate-950/60'
                      }`}
                    >
                      <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">
                        {dayName}
                      </span>
                      <div
                        className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-black mt-1 ${
                          isCurrentDay
                            ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/30'
                            : 'text-slate-100'
                        }`}
                      >
                        {day.getDate()}
                      </div>
                    </div>

                    {/* Day Events */}
                    <div className="p-2.5 flex-1 space-y-2 overflow-y-auto max-h-[500px]">
                      {dayEvents.length === 0 ? (
                        <div className="py-8 text-center text-[11px] text-slate-600 font-medium italic">
                          {t('event.noEvents', undefined, 'No events')}
                        </div>
                      ) : (
                        dayEvents.map((ev) => {
                          const effectiveStatus = calculateEventStatus(ev);
                          return (
                            <div
                              key={ev.id}
                              onClick={() => onEditEvent(ev)}
                              className={`group cursor-pointer rounded-2xl p-3 border text-left transition-all hover:scale-[1.02] shadow-sm ${getEventBorderClass(
                                effectiveStatus
                              )}`}
                            >
                              <div className="flex items-center justify-between gap-1 mb-1.5">
                                <span className="text-xs font-bold truncate leading-tight">
                                  {ev.name}
                                </span>
                              </div>

                              <div className="space-y-1 text-[10px]">
                                <div className="flex items-center gap-1.5 opacity-90 font-medium">
                                  <Gamepad2 className="w-3 h-3 text-amber-400 shrink-0" />
                                  <span className="truncate">{ev.game?.name || 'Catch The Brand'}</span>
                                </div>

                                <div className="flex items-center gap-1.5 opacity-90 font-medium">
                                  <Sparkles className="w-3 h-3 text-purple-400 shrink-0" />
                                  <span className="truncate">{ev.game_theme?.name || 'Theme'}</span>
                                </div>

                                <div className="flex items-center gap-1.5 opacity-75 font-mono text-[9px] pt-1 border-t border-slate-700/40">
                                  <CalendarIcon className="w-2.5 h-2.5 shrink-0" />
                                  <span className="truncate">
                                    {formatEventDates(ev)}
                                  </span>
                                </div>
                              </div>

                              <div className="mt-2.5 flex items-center justify-between gap-1 pt-1 border-t border-slate-700/40">
                                {getStatusBadge(effectiveStatus)}
                                <span className="text-[10px] text-amber-400 font-semibold opacity-0 group-hover:opacity-100 transition-opacity">
                                  {t('common.edit', undefined, 'Edit')} ↗
                                </span>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* 6. Day View */}
      {viewType === 'day' && (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-6">
          <div className="flex items-center justify-between pb-4 border-b border-slate-800">
            <div>
              <h3 className="text-xl font-black text-slate-100">{headerTitle}</h3>
              <p className="text-xs text-slate-400 mt-0.5">
                {t('event.dayViewDesc', undefined, 'Active deployments and campaigns running on this date.')}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <span className="px-3 py-1 bg-amber-500/10 border border-amber-500/30 rounded-xl text-xs font-bold text-amber-400">
                {filteredEvents.filter((ev) => isEventOnDay(ev, currentDate)).length} {t('event.activeEvents', undefined, 'Active Events')}
              </span>
            </div>
          </div>

          {/* Detailed Cards for Day View */}
          {(() => {
            const dayEvents = filteredEvents.filter((ev) => isEventOnDay(ev, currentDate));

            if (dayEvents.length === 0) {
              return (
                <div className="py-16 text-center space-y-3">
                  <div className="w-12 h-12 rounded-2xl bg-slate-800/80 border border-slate-700 flex items-center justify-center mx-auto text-slate-500">
                    <CalendarIcon className="w-6 h-6" />
                  </div>
                  <h4 className="text-sm font-bold text-slate-300">
                    {t('event.noEventsScheduledDay', undefined, 'No events scheduled for this day')}
                  </h4>
                  <p className="text-xs text-slate-500 max-w-sm mx-auto">
                    {t('event.noEventsScheduledDayDesc', undefined, 'There are no event deployments active on this specific date.')}
                  </p>
                  {!isViewer && (
                    <button
                      onClick={onCreateEvent}
                      className="inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-4 py-2 rounded-xl text-xs transition-all mt-2 shadow-sm cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>{t('event.createEvent', undefined, 'Create Event for This Day')}</span>
                    </button>
                  )}
                </div>
              );
            }

            return (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {dayEvents.map((ev) => {
                  const effectiveStatus = calculateEventStatus(ev);
                  const publicUrl = `${window.location.origin}/e/${ev.public_token}`;

                  return (
                    <div
                      key={ev.id}
                      onClick={() => onEditEvent(ev)}
                      className={`group cursor-pointer rounded-3xl p-5 border text-left transition-all hover:border-amber-500/60 shadow-lg ${getEventBorderClass(
                        effectiveStatus
                      )}`}
                    >
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <div className="space-y-1">
                          <h4 className="text-base font-black text-slate-100 group-hover:text-amber-400 transition-colors">
                            {ev.name}
                          </h4>
                          <span className="text-[10px] text-slate-400 font-mono">
                            {t('event.token', undefined, 'Token')}: {ev.public_token}
                          </span>
                        </div>
                        {getStatusBadge(effectiveStatus)}
                      </div>

                      {/* Details Box */}
                      <div className="bg-slate-950/60 border border-slate-800/80 rounded-2xl p-3 space-y-2 mb-4">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-slate-400 flex items-center gap-1.5 font-medium">
                            <Gamepad2 className="w-3.5 h-3.5 text-amber-400" />
                            {t('common.game', undefined, 'Game')}:
                          </span>
                          <span className="font-bold text-slate-200">
                            {ev.game?.name || 'Catch The Brand'}
                          </span>
                        </div>

                        <div className="flex items-center justify-between text-xs">
                          <span className="text-slate-400 flex items-center gap-1.5 font-medium">
                            <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                            {t('common.theme', undefined, 'Theme')}:
                          </span>
                          <span className="font-bold text-slate-200">
                            {ev.game_theme?.name || 'Theme'}
                          </span>
                        </div>

                        <div className="flex items-center justify-between text-xs pt-1.5 border-t border-slate-800">
                          <span className="text-slate-400 flex items-center gap-1.5 font-medium">
                            <CalendarIcon className="w-3.5 h-3.5 text-blue-400" />
                            {t('common.schedule', undefined, 'Schedule')}:
                          </span>
                          <span className="font-mono text-[10px] text-slate-300">
                            {formatEventDates(ev)}
                          </span>
                        </div>
                      </div>

                      {/* Action Bar */}
                      <div className="flex items-center justify-between pt-2 border-t border-slate-800/60">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            window.open(publicUrl, '_blank');
                          }}
                          className="flex items-center gap-1 text-xs font-semibold text-slate-400 hover:text-amber-400 transition-colors cursor-pointer"
                        >
                          <ExternalLink className="w-3 h-3" />
                          <span>{t('event.openGame', undefined, 'Open Game')}</span>
                        </button>

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onEditEvent(ev);
                          }}
                          className="text-xs font-bold text-amber-400 hover:text-amber-300 hover:underline cursor-pointer"
                        >
                          {t('event.editDetails', undefined, 'Edit Details →')}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
};
