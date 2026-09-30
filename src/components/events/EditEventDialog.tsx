import React, { useState, useEffect } from 'react';
import { apiFetch } from '../../lib/api';
import { navigateTo } from '../../hooks/useRouteContext';
import {
  formatDateOnly,
  formatEventDateRange,
  getTodayDateString,
} from '../../lib/dateUtils';
import { SUPPORTED_TIMEZONES, resolveEventTimezone } from '../../lib/countryUtils';
import { getGameTypeIcon } from '../../games';
import { useLocalization } from '../../context/LocalizationContext';
import {
  X,
  Calendar,
  Sparkles,
  Gamepad2,
  Check,
  AlertCircle,
  Link,
  Layers,
  ExternalLink,
  Lock,
  Globe,
  ChevronDown,
} from 'lucide-react';

interface GameThemeOption {
  id: string;
  name: string;
  slug: string;
  game_id?: string | null;
  game_name?: string;
  game_slug?: string;
  organization_id?: string | null;
  is_system?: boolean;
  ownership_type?: string;
  status?: string;
}

interface EditEventDialogProps {
  isOpen: boolean;
  event: any;
  userRole?: string;
  onClose: () => void;
  onEventUpdated: (updatedEvent: any) => void;
}

export const EditEventDialog: React.FC<EditEventDialogProps> = ({
  isOpen,
  event,
  userRole,
  onClose,
  onEventUpdated,
}) => {
  const { t } = useLocalization();
  const [name, setName] = useState('');
  const [selectedThemeId, setSelectedThemeId] = useState<string>('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [eventTimezone, setEventTimezone] = useState('Asia/Singapore');
  const [status, setStatus] = useState<'draft' | 'scheduled' | 'live' | 'expired' | 'cancelled'>('scheduled');

  const [themes, setThemes] = useState<GameThemeOption[]>([]);
  const [loadingThemes, setLoadingThemes] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const extractDateOnly = (val?: string | null) => {
    if (!val) return '';
    if (val.length === 10 && val.includes('-')) return val;
    return val.split('T')[0] || '';
  };

  useEffect(() => {
    if (!event || !isOpen) return;

    setName(event.name || '');
    setSelectedThemeId(event.game_theme_id || '');
    const start = event.start_date || extractDateOnly(event.starts_at) || getTodayDateString();
    const end = event.end_date || extractDateOnly(event.expires_at) || start;
    setStartDate(start);
    setEndDate(end);
    setEventTimezone(resolveEventTimezone(event));
    setStatus(event.status || 'scheduled');
  }, [event, isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const fetchThemes = async () => {
      try {
        setLoadingThemes(true);
        const customRes = await apiFetch('/api/themes');

        if (customRes.ok) {
          const data = await customRes.json();
          const customThemes = (data.themes || []) as GameThemeOption[];
          const validThemes = customThemes.filter((t) => {
            if (!t || !t.id) return false;
            if (t.is_system === true) return false;
            if (t.ownership_type === 'system') return false;
            if (event?.organization_id && t.organization_id && t.organization_id !== event.organization_id) return false;
            if (t.status && t.status !== 'active') return false;
            return true;
          });
          setThemes(validThemes);
        }
      } catch (err: any) {
        console.error('Error fetching themes:', err);
      } finally {
        setLoadingThemes(false);
      }
    };

    fetchThemes();
  }, [isOpen]);

  if (!isOpen || !event) return null;

  const isPaid = (event?.payment_status || '').toUpperCase() === 'PAID';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (isPaid) {
      setError('Event setup cannot be modified after payment has been completed.');
      return;
    }

    if (!name.trim()) {
      setError('Event name is required');
      return;
    }

    if (!selectedThemeId) {
      setError('Please select a Game Theme');
      return;
    }

    if (!startDate || !endDate) {
      setError('Please select both Start Date and End Date');
      return;
    }

    if (endDate < startDate) {
      setError('End date must be on or after Start date');
      return;
    }

    try {
      setSubmitting(true);
      const res = await apiFetch(`/api/events/${event.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: name.trim(),
          game_theme_id: selectedThemeId,
          start_date: startDate,
          end_date: endDate,
          event_date: startDate,
          event_timezone: eventTimezone,
          status,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to update event');
      }

      const data = await res.json();
      onEventUpdated(data.event);
      onClose();
    } catch (err: any) {
      console.error('Update event error:', err);
      setError(err.message || 'Failed to update event');
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenShowcase = () => {
    onClose();
    navigateTo(`/events/${event.id}/showcase`);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200 font-sans">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-6 border-b border-slate-800 flex items-center justify-between bg-slate-900/50">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-500/10 border border-amber-500/30 rounded-2xl text-amber-400">
              {isPaid ? <Lock className="w-5 h-5" /> : <Calendar className="w-5 h-5" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-slate-100">
                  {isPaid ? t('event.title', undefined, 'Event Setup') : t('event.editEvent', undefined, 'Edit Event Setup')}
                </h2>
                {isPaid && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                    <Lock className="w-2.5 h-2.5" /> {t('event.lockedPaid', undefined, 'Paid & Locked')}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 font-mono">
                Token: {event.public_token}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1">
          {/* Lock Banner for Paid Events */}
          {isPaid && (
            <div className="mb-5 p-4 bg-amber-500/10 border border-amber-500/30 rounded-2xl flex items-start gap-3">
              <div className="p-2 bg-amber-500/20 text-amber-400 rounded-xl shrink-0 mt-0.5">
                <Lock className="w-4 h-4" />
              </div>
              <div className="space-y-1">
                <div className="text-xs font-bold text-amber-300">
                  🔒 {t('event.lockedPaid', undefined, 'Paid — Event Setup Locked')}
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  This event has been paid and activated. Event details (name, game theme, event dates, and status) are locked to protect event integrity.
                </p>
                <p className="text-[11px] text-slate-400">
                  Automatic system lifecycle transitions (Live window activation, High score tracking, and Completion) continue to operate automatically.
                </p>
              </div>
            </div>
          )}

          {/* Quick Showcase Page Link Banner */}
          <div className="mb-5 p-3.5 bg-slate-950/80 border border-amber-500/20 rounded-2xl flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
              <div className="text-xs text-slate-300">
                <span className="font-semibold text-slate-100">{t('showcase.showcasePage', undefined, 'Event Showcase Page')}</span>
                <p className="text-[11px] text-slate-400">
                  Manage branding, photos, and video media on the dedicated full-page showcase.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleOpenShowcase}
              className="px-3 py-1.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 text-xs font-bold transition-all flex items-center gap-1 shrink-0 cursor-pointer"
            >
              <span>{t('showcase.title', undefined, 'Open Showcase')}</span>
              <ExternalLink className="w-3 h-3" />
            </button>
          </div>

          {/* Event Details Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="p-3.5 bg-red-500/10 border border-red-500/30 rounded-2xl flex items-center gap-2.5 text-xs text-red-400">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Event Name */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-300">
                {t('event.eventName', undefined, 'Event Name')} {isPaid ? '' : <span className="text-amber-400">*</span>}
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={isPaid}
                readOnly={isPaid}
                required
                className={`w-full bg-slate-950 border rounded-xl px-4 py-2.5 text-xs text-slate-100 outline-none transition-all ${
                  isPaid
                    ? 'opacity-60 cursor-not-allowed bg-slate-900/80 border-slate-800 text-slate-400'
                    : 'border-slate-800 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 placeholder:text-slate-600'
                }`}
              />
            </div>

            {/* Game Theme Selector */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-bold text-slate-300">
                  {t('event.selectTheme', undefined, 'Assigned Game Theme')} {isPaid ? '' : <span className="text-amber-400">*</span>}
                </label>
                <span className="text-[11px] text-slate-500">
                  {isPaid ? t('event.lockedPaid', undefined, 'Theme locked after payment') : 'Switch live theme without breaking URL'}
                </span>
              </div>

              {loadingThemes ? (
                <div className="p-4 bg-slate-950 border border-slate-800 rounded-2xl text-center text-xs text-slate-400">
                  {t('common.loading', undefined, 'Loading game themes...')}
                </div>
              ) : (
                <div className="space-y-4 max-h-52 overflow-y-auto pr-1">
                  {Array.from(
                    (event?.game_id ? themes.filter((t) => !t.game_id || t.game_id === event.game_id) : themes).reduce((groups, theme) => {
                      const gameKey = theme.game_name || event?.game?.name || 'Assigned Game';
                      if (!groups.has(gameKey)) groups.set(gameKey, []);
                      groups.get(gameKey)!.push(theme);
                      return groups;
                    }, new Map<string, typeof themes>())
                  ).map(([gameName, gameThemeList]) => (
                    <div key={gameName} className="space-y-1.5">
                      <div className="flex items-center gap-1.5 px-1 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                        {getGameTypeIcon(gameThemeList[0]?.game_slug || gameName, 'w-3.5 h-3.5 text-amber-400')}
                        <span>{gameName}</span>
                        <span className="text-slate-600">({gameThemeList.length})</span>
                      </div>

                      <div className="space-y-1.5 pl-2 border-l border-slate-800 ml-2">
                        {gameThemeList.map((theme) => {
                          const isSelected = theme.id === selectedThemeId;

                          return (
                            <button
                              key={theme.id}
                              type="button"
                              disabled={isPaid}
                              onClick={() => !isPaid && setSelectedThemeId(theme.id)}
                              className={`w-full flex items-center justify-between p-2.5 rounded-xl border text-left transition-all ${
                                isPaid
                                  ? isSelected
                                    ? 'bg-amber-500/10 border-amber-500/30 opacity-80 cursor-not-allowed text-slate-300'
                                    : 'bg-slate-950/50 border-slate-800/60 opacity-40 cursor-not-allowed text-slate-500'
                                  : isSelected
                                    ? 'bg-amber-500/10 border-amber-500/50 ring-1 ring-amber-500/30'
                                    : 'bg-slate-950 hover:bg-slate-800/60 border-slate-800 text-slate-300'
                              }`}
                            >
                              <div className="flex items-center gap-2.5">
                                <div
                                  className={`w-2 h-2 rounded-full ${
                                    isSelected ? 'bg-amber-400 ring-2 ring-amber-400/30' : 'bg-slate-600'
                                  }`}
                                />
                                <div>
                                  <div className="text-xs font-bold text-slate-200">
                                    {theme.name}
                                  </div>
                                  <div className="text-[10px] text-slate-500 font-mono">
                                    {theme.slug}
                                  </div>
                                </div>
                              </div>

                              {isSelected && (
                                <div className="p-1 bg-amber-500 text-slate-950 rounded-full">
                                  <Check className="w-3 h-3" />
                                </div>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Date Windows (Date Only) */}
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-300 flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-amber-400" />
                    <span>Start Date</span>
                  </label>
                  <input
                    type="date"
                    value={startDate}
                    disabled={isPaid}
                    readOnly={isPaid}
                    onChange={(e) => {
                      if (isPaid) return;
                      const newStart = e.target.value;
                      setStartDate(newStart);
                      if (endDate < newStart) {
                        setEndDate(newStart);
                      }
                    }}
                    required
                    className={`w-full bg-slate-950 border rounded-xl px-3.5 py-2 text-xs text-slate-100 outline-none transition-all ${
                      isPaid
                        ? 'opacity-60 cursor-not-allowed bg-slate-900/80 border-slate-800 text-slate-400'
                        : 'border-slate-800 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 cursor-pointer'
                    }`}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-300 flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-amber-400" />
                    <span>{t('event.endDate', undefined, 'End Date')}</span>
                  </label>
                  <input
                    type="date"
                    min={startDate}
                    value={endDate}
                    disabled={isPaid}
                    readOnly={isPaid}
                    onChange={(e) => !isPaid && setEndDate(e.target.value)}
                    required
                    className={`w-full bg-slate-950 border rounded-xl px-3.5 py-2 text-xs text-slate-100 outline-none transition-all ${
                      isPaid
                        ? 'opacity-60 cursor-not-allowed bg-slate-900/80 border-slate-800 text-slate-400'
                        : 'border-slate-800 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 cursor-pointer'
                    }`}
                  />
                </div>
              </div>

              {startDate && endDate && (
                <p className="text-[11px] text-slate-400 font-medium">
                  Active for whole calendar day{startDate === endDate ? '' : 's'}: <span className="text-amber-300 font-bold">{formatEventDateRange(startDate, endDate)}</span>
                </p>
              )}

              <div className="space-y-1.5 pt-1">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-slate-300">
                    {t('event.timezone', undefined, 'Event Timezone')}
                  </label>
                  <span className="text-[10px] text-slate-500">
                    {isPaid ? t('event.lockedPaid', undefined, 'Locked after payment') : 'Evaluates setup day & midnight cutoffs'}
                  </span>
                </div>
                <div className="relative">
                  <select
                    value={eventTimezone}
                    disabled={isPaid}
                    onChange={(e) => !isPaid && setEventTimezone(e.target.value)}
                    className={`w-full appearance-none bg-slate-950/80 border rounded-xl px-3.5 py-2.5 text-xs text-slate-100 outline-none pr-8 ${
                      isPaid
                        ? 'opacity-60 cursor-not-allowed bg-slate-900/80 border-slate-800 text-slate-400'
                        : 'border-slate-800 focus:border-amber-500 cursor-pointer'
                    }`}
                  >
                    {SUPPORTED_TIMEZONES.map((tz) => (
                      <option key={tz.timezone} value={tz.timezone} className="bg-slate-900 text-slate-200">
                        {tz.label} ({tz.timezone})
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>
            </div>

            {/* Manual Status Override */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-300">
                {t('event.status', undefined, 'Event Status')}
              </label>
              <select
                value={status}
                disabled={isPaid}
                onChange={(e) => !isPaid && setStatus(e.target.value as any)}
                className={`w-full bg-slate-950 border rounded-xl px-3.5 py-2 text-xs text-slate-200 outline-none ${
                  isPaid
                    ? 'opacity-60 cursor-not-allowed bg-slate-900/80 border-slate-800 text-slate-400'
                    : 'border-slate-800 focus:border-amber-500'
                }`}
              >
                <option value="scheduled">{t('event.statusUpcoming', undefined, 'Scheduled / Auto-time window')}</option>
                <option value="draft">{t('event.statusDraft', undefined, 'Draft (Hidden)')}</option>
                <option value="cancelled">{t('event.statusCancelled', undefined, 'Cancelled')}</option>
              </select>
            </div>

            {/* Public Link reminder */}
            <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-2xl flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 text-slate-300">
                <Link className="w-4 h-4 text-amber-400" />
                <span className="font-mono">{window.location.origin}/play/{event.public_token}</span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl transition-colors cursor-pointer"
              >
                {isPaid ? t('common.close', undefined, 'Close') : t('common.cancel', undefined, 'Cancel')}
              </button>
              {isPaid ? (
                <button
                  type="button"
                  disabled={true}
                  className="px-5 py-2 bg-slate-800/80 text-slate-500 border border-slate-700/50 text-xs font-bold rounded-xl flex items-center gap-1.5 cursor-not-allowed"
                  title={t('event.lockedPaid', undefined, 'Event setup is locked after payment')}
                >
                  <Lock className="w-3.5 h-3.5 text-amber-400/60" />
                  <span>{t('event.lockedPaid', undefined, 'Locked (Paid)')}</span>
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 text-xs font-bold rounded-xl transition-all shadow-md shadow-amber-500/20 flex items-center gap-1.5 cursor-pointer"
                >
                  {submitting ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                      <span>{t('common.saving', undefined, 'Saving...')}</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>{t('common.save', undefined, 'Save Changes')}</span>
                    </>
                  )}
                </button>
              )}
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};


