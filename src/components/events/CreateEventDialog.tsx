import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  X,
  Calendar,
  Clock,
  Sparkles,
  Gamepad2,
  Check,
  AlertCircle,
  Link,
  Layers,
} from 'lucide-react';

interface GameThemeOption {
  id: string;
  name: string;
  slug: string;
  game_id?: string | null;
  game_name?: string;
  game_slug?: string;
  is_active?: boolean;
  status?: string;
}

interface CreateEventDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onEventCreated: (newEvent: any) => void;
}

export const CreateEventDialog: React.FC<CreateEventDialogProps> = ({
  isOpen,
  onClose,
  onEventCreated,
}) => {
  const { currentOrganization } = useAuth();

  const [name, setName] = useState('');
  const [selectedThemeId, setSelectedThemeId] = useState<string>('');
  const [themes, setThemes] = useState<GameThemeOption[]>([]);
  const [loadingThemes, setLoadingThemes] = useState(false);

  // Default start date/time: now rounded to nearest 5 mins
  // Default expire date/time: 24 hours later
  const getInitialDates = () => {
    const start = new Date();
    start.setMinutes(Math.ceil(start.getMinutes() / 5) * 5, 0, 0);

    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);

    const formatForInput = (d: Date) => {
      const pad = (n: number) => n.toString().padStart(2, '0');
      const year = d.getFullYear();
      const month = pad(d.getMonth() + 1);
      const day = pad(d.getDate());
      const hours = pad(d.getHours());
      const mins = pad(d.getMinutes());
      return `${year}-${month}-${day}T${hours}:${mins}`;
    };

    return {
      startsAt: formatForInput(start),
      expiresAt: formatForInput(end),
    };
  };

  const [startsAt, setStartsAt] = useState(() => getInitialDates().startsAt);
  const [expiresAt, setExpiresAt] = useState(() => getInitialDates().expiresAt);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load Game Themes for this organization
  useEffect(() => {
    if (!isOpen) return;

    const fetchThemes = async () => {
      try {
        setLoadingThemes(true);
        const res = await fetch('/api/themes', {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('app_token') || ''}`,
          },
        });
        if (!res.ok) throw new Error('Failed to fetch game themes');
        const data = await res.json();
        const list = (data.themes || []) as GameThemeOption[];
        setThemes(list);

        // Auto select first active theme or first available
        if (list.length > 0) {
          const active = list.find((t) => t.is_active) || list[0];
          setSelectedThemeId(active.id);
        }
      } catch (err: any) {
        console.error('Error fetching themes for event:', err);
      } finally {
        setLoadingThemes(false);
      }
    };

    fetchThemes();
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError('Please provide an event name');
      return;
    }

    if (!selectedThemeId) {
      setError('Please select a Game Theme');
      return;
    }

    const startTime = new Date(startsAt).getTime();
    const expiryTime = new Date(expiresAt).getTime();

    if (isNaN(startTime) || isNaN(expiryTime)) {
      setError('Please provide valid start and expiry dates/times');
      return;
    }

    if (expiryTime <= startTime) {
      setError('Expiry time must be later than Start time');
      return;
    }

    try {
      setSubmitting(true);
      const res = await fetch('/api/events', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('app_token') || ''}`,
        },
        body: JSON.stringify({
          name: name.trim(),
          game_theme_id: selectedThemeId,
          event_date: startsAt.split('T')[0],
          starts_at: new Date(startsAt).toISOString(),
          expires_at: new Date(expiresAt).toISOString(),
          status: 'scheduled',
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to create event deployment');
      }

      const data = await res.json();
      onEventCreated(data.event);
      onClose();
    } catch (err: any) {
      console.error('Create event error:', err);
      setError(err.message || 'Failed to create event');
    } finally {
      setSubmitting(false);
    }
  };

  const selectedTheme = themes.find((t) => t.id === selectedThemeId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200 font-sans">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-6 border-b border-slate-800 flex items-center justify-between bg-slate-900/50">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-500/10 border border-amber-500/30 rounded-2xl text-amber-400">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-100">Create New Event</h2>
              <p className="text-xs text-slate-400">
                Deploy a playable Game Theme to a unique public link
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-xl transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto flex-1">
          {error && (
            <div className="p-3.5 bg-red-500/10 border border-red-500/30 rounded-2xl flex items-center gap-2.5 text-xs text-red-400">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Event Name */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-300">
              Event Name <span className="text-amber-400">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Annual Gala 2026, Christmas Campaign, Booth A"
              required
              className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 rounded-xl px-4 py-2.5 text-xs text-slate-100 placeholder:text-slate-600 outline-none transition-all"
            />
          </div>

          {/* Single Game Theme Selector */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-bold text-slate-300">
                Game Theme <span className="text-amber-400">*</span>
              </label>
              <span className="text-[11px] text-slate-500">
                Single choice (Game + Theme bundle)
              </span>
            </div>

            {loadingThemes ? (
              <div className="p-4 bg-slate-950 border border-slate-800 rounded-2xl text-center text-xs text-slate-400">
                Loading game themes...
              </div>
            ) : themes.length === 0 ? (
              <div className="p-4 bg-slate-950 border border-slate-800 rounded-2xl text-center text-xs text-slate-400">
                No game themes found. Please create one in Theme Studio first.
              </div>
            ) : (
              <div className="space-y-4 max-h-56 overflow-y-auto pr-1">
                {/* Group themes by Game */}
                {Array.from(
                  themes.reduce((groups, theme) => {
                    const gameKey = theme.game_name || 'Durian Catcher';
                    if (!groups.has(gameKey)) groups.set(gameKey, []);
                    groups.get(gameKey)!.push(theme);
                    return groups;
                  }, new Map<string, typeof themes>())
                ).map(([gameName, gameThemeList]) => (
                  <div key={gameName} className="space-y-1.5">
                    <div className="flex items-center gap-1.5 px-1 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                      <Gamepad2 className="w-3.5 h-3.5 text-amber-400" />
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
                            onClick={() => setSelectedThemeId(theme.id)}
                            className={`w-full flex items-center justify-between p-2.5 rounded-xl border text-left transition-all ${
                              isSelected
                                ? 'bg-amber-500/10 border-amber-500/50 shadow-sm ring-1 ring-amber-500/30'
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
                                  Slug: {theme.slug}
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

          {/* Time Window (Starts At & Expires At) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-300 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-amber-400" />
                <span>Starts At</span>
              </label>
              <input
                type="datetime-local"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
                required
                className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 rounded-xl px-3.5 py-2 text-xs text-slate-100 outline-none transition-all"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-300 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-orange-400" />
                <span>Expires At</span>
              </label>
              <input
                type="datetime-local"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
                required
                className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 rounded-xl px-3.5 py-2 text-xs text-slate-100 outline-none transition-all"
              />
            </div>
          </div>

          {/* Public Access Preview Banner */}
          <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-2xl space-y-1.5">
            <div className="flex items-center gap-2 text-[11px] font-bold text-amber-400">
              <Link className="w-3.5 h-3.5" />
              <span>Public Event URL Format</span>
            </div>
            <p className="text-[11px] text-slate-400 font-mono break-all">
              {window.location.origin}/e/[PUBLIC_TOKEN]
            </p>
            <p className="text-[10px] text-slate-500">
              A unique token will be generated automatically. Players do not need to log in to play.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || themes.length === 0}
              className="px-5 py-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 text-xs font-bold rounded-xl transition-all shadow-md shadow-amber-500/20 flex items-center gap-1.5"
            >
              {submitting ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                  <span>Deploying Event...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Create Event</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
