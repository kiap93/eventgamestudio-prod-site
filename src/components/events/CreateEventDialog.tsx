import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { apiFetch } from '../../lib/api';
import { PaymentMode, EventQuoteOption, EventPaymentCalculation, WalletBalanceSummary } from '../../types';
import {
  X,
  Calendar,
  Clock,
  Sparkles,
  Gamepad2,
  Check,
  AlertCircle,
  Link,
  Wallet,
  CreditCard,
  Tag,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  RefreshCw,
} from 'lucide-react';

interface GameThemeOption {
  id: string;
  name: string;
  slug: string;
  game_id?: string | null;
  game_name?: string;
  game_slug?: string;
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

  // Quote and Payment state
  const [selectedPaymentMode, setSelectedPaymentMode] = useState<PaymentMode>('FULL_PAID');
  const [quoteOptions, setQuoteOptions] = useState<EventQuoteOption[]>([]);
  const [activeCalculation, setActiveCalculation] = useState<EventPaymentCalculation | null>(null);
  const [walletSummary, setWalletSummary] = useState<WalletBalanceSummary | null>(null);
  const [loadingQuote, setLoadingQuote] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);

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
        const res = await apiFetch('/api/themes');
        if (!res.ok) throw new Error('Failed to fetch game themes');
        const data = await res.json();
        const list = (data.themes || []) as GameThemeOption[];
        setThemes(list);

        // Select first available theme by default
        if (list.length > 0 && !selectedThemeId) {
          setSelectedThemeId(list[0].id);
        }
      } catch (err: any) {
        console.error('Error fetching themes for event:', err);
      } finally {
        setLoadingThemes(false);
      }
    };

    fetchThemes();
  }, [isOpen]);

  // Fetch Event Payment Quote whenever theme or dialog state opens
  const fetchQuote = async (themeId?: string, mode?: PaymentMode) => {
    if (!isOpen) return;
    const targetThemeId = themeId || selectedThemeId;
    const targetMode = mode || selectedPaymentMode;

    try {
      setLoadingQuote(true);
      setQuoteError(null);

      const res = await apiFetch('/api/events/quote', {
        method: 'POST',
        body: JSON.stringify({
          game_theme_id: targetThemeId || undefined,
          payment_mode: targetMode,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to fetch payment quote');
      }

      const data = await res.json();
      setQuoteOptions(data.options || []);
      setActiveCalculation(data.calculation || null);
      setWalletSummary(data.wallet || null);

      // If user is currently on a mode that is not eligible, auto-pick the best eligible mode
      if (data.options && data.options.length > 0) {
        const currentOption = data.options.find((o: EventQuoteOption) => o.mode === targetMode);
        if (!currentOption || !currentOption.isEligible) {
          const firstEligible = data.options.find((o: EventQuoteOption) => o.isEligible);
          if (firstEligible && firstEligible.mode !== targetMode) {
            setSelectedPaymentMode(firstEligible.mode);
          }
        }
      }
    } catch (err: any) {
      console.error('Error fetching event quote:', err);
      setQuoteError(err.message || 'Unable to calculate event quote');
    } finally {
      setLoadingQuote(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchQuote(selectedThemeId, selectedPaymentMode);
    }
  }, [isOpen, selectedThemeId, selectedPaymentMode]);

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

    if (activeCalculation && !activeCalculation.isPayable) {
      setError(
        activeCalculation.reasons[0] ||
          `Insufficient wallet balance. Please top up your wallet before deploying.`
      );
      return;
    }

    try {
      setSubmitting(true);
      const res = await apiFetch('/api/events', {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          game_theme_id: selectedThemeId,
          event_date: startsAt.split('T')[0],
          starts_at: new Date(startsAt).toISOString(),
          expires_at: new Date(expiresAt).toISOString(),
          status: 'scheduled',
          payment_mode: selectedPaymentMode,
          topup_credit_requested: activeCalculation?.topupCreditUsed || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (res.status === 402 || data.code === 'INSUFFICIENT_FUNDS') {
          throw new Error(
            data.error || 'Payment failed: Insufficient wallet balance for this event.'
          );
        }
        throw new Error(data.error || 'Failed to create and pay for event');
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
  const selectedQuoteOption = quoteOptions.find((o) => o.mode === selectedPaymentMode);
  const isPayable = activeCalculation ? activeCalculation.isPayable : true;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-200 font-sans">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="p-5 sm:p-6 border-b border-slate-800 flex items-center justify-between bg-slate-900/80">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-500/10 border border-amber-500/30 rounded-2xl text-amber-400">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-100">Create & Deploy Event</h2>
              <p className="text-xs text-slate-400">
                Deploy an event with atomic wallet payment and instant public link
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
        <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-5 overflow-y-auto flex-1">
          {error && (
            <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-2xl flex items-start gap-3 text-xs text-red-400">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <span className="font-semibold">{error}</span>
              </div>
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
              placeholder="e.g. Annual Gala 2026, Christmas Roadshow, Tech Launch Booth"
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
                Choose the branded gameplay experience
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
              <div className="space-y-3 max-h-44 overflow-y-auto pr-1">
                {/* Group themes by Game */}
                {Array.from(
                  themes.reduce((groups, theme) => {
                    const gameKey = theme.game_name || 'Catch The Brand';
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

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pl-2 border-l border-slate-800 ml-2">
                      {gameThemeList.map((theme) => {
                        const isSelected = theme.id === selectedThemeId;

                        return (
                          <button
                            key={theme.id}
                            type="button"
                            onClick={() => setSelectedThemeId(theme.id)}
                            className={`flex items-center justify-between p-2.5 rounded-xl border text-left transition-all ${
                              isSelected
                                ? 'bg-amber-500/10 border-amber-500/60 shadow-sm ring-1 ring-amber-500/30'
                                : 'bg-slate-950 hover:bg-slate-800/60 border-slate-800 text-slate-300'
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div
                                className={`w-2 h-2 shrink-0 rounded-full ${
                                  isSelected ? 'bg-amber-400 ring-2 ring-amber-400/30' : 'bg-slate-600'
                                }`}
                              />
                              <div className="truncate">
                                <div className="text-xs font-bold text-slate-200 truncate">
                                  {theme.name}
                                </div>
                                <div className="text-[10px] text-slate-500 font-mono truncate">
                                  {theme.slug}
                                </div>
                              </div>
                            </div>

                            {isSelected && (
                              <div className="p-0.5 bg-amber-500 text-slate-950 rounded-full shrink-0 ml-2">
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

          {/* ================================================================= */}
          {/* PAYMENT & WALLET BREAKDOWN CARD                                   */}
          {/* ================================================================= */}
          <div className="p-4 sm:p-5 bg-slate-950 border border-slate-800 rounded-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
              <div className="flex items-center gap-2">
                <Wallet className="w-4 h-4 text-amber-400" />
                <span className="text-xs font-bold text-slate-200">
                  Event Pricing & Payment Breakdown
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-slate-400">Standard Price:</span>
                <span className="text-xs font-mono font-bold text-slate-200">RM 1,400.00</span>
              </div>
            </div>

            {/* Wallet Balances Quick View */}
            {walletSummary && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs">
                <div className="p-2 bg-slate-900 border border-slate-800 rounded-xl">
                  <div className="text-[10px] text-slate-500 font-medium">Paid Balance</div>
                  <div className="font-mono font-bold text-slate-200">
                    RM {walletSummary.paid_balance.toFixed(2)}
                  </div>
                </div>
                <div className="p-2 bg-slate-900 border border-slate-800 rounded-xl">
                  <div className="text-[10px] text-amber-400 font-medium">Welcome Credit</div>
                  <div className="font-mono font-bold text-amber-300">
                    RM {walletSummary.welcome_credit.toFixed(2)}
                  </div>
                </div>
                <div className="p-2 bg-slate-900 border border-slate-800 rounded-xl">
                  <div className="text-[10px] text-emerald-400 font-medium">Showcase Credit</div>
                  <div className="font-mono font-bold text-emerald-300">
                    RM {walletSummary.showcase_credit.toFixed(2)}
                  </div>
                </div>
                <div className="p-2 bg-slate-900 border border-slate-800 rounded-xl">
                  <div className="text-[10px] text-purple-400 font-medium">Top-up Credit</div>
                  <div className="font-mono font-bold text-purple-300">
                    RM {walletSummary.topup_credit.toFixed(2)}
                  </div>
                </div>
              </div>
            )}

            {/* Selectable Payment Modes */}
            <div className="space-y-2">
              <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                Select Payment Mode
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {quoteOptions.map((opt) => {
                  const isSelected = opt.mode === selectedPaymentMode;

                  return (
                    <button
                      key={opt.mode}
                      type="button"
                      onClick={() => setSelectedPaymentMode(opt.mode)}
                      className={`p-3 rounded-xl border text-left transition-all relative ${
                        isSelected
                          ? 'bg-amber-500/10 border-amber-500/60 ring-1 ring-amber-500/30'
                          : opt.isEligible
                          ? 'bg-slate-900 hover:bg-slate-850 border-slate-800'
                          : 'bg-slate-900/40 border-slate-800/60 opacity-60'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-bold text-slate-200">{opt.title}</span>
                          </div>
                          <div className="text-[10px] font-mono text-slate-400">
                            {opt.creditApplied > 0 ? (
                              <>
                                <span className="text-emerald-400 font-semibold">
                                  -RM {opt.creditApplied.toFixed(2)}
                                </span>{' '}
                                Credit +{' '}
                              </>
                            ) : null}
                            <span className="text-slate-200 font-bold">
                              RM {opt.paidAmount.toFixed(2)}
                            </span>{' '}
                            Paid
                          </div>
                        </div>

                        <span
                          className={`text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                            opt.isEligible
                              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                              : 'bg-slate-800 text-slate-400'
                          }`}
                        >
                          {opt.badge}
                        </span>
                      </div>

                      {opt.reasons.length > 0 && !opt.isEligible && (
                        <div className="mt-2 text-[10px] text-amber-400/90 leading-tight">
                          {opt.reasons[0]}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Active Calculation Summary */}
            {activeCalculation && (
              <div className="p-3 bg-slate-900 border border-slate-800/80 rounded-xl space-y-2 text-xs">
                <div className="flex items-center justify-between text-slate-300">
                  <span>Standard Event Price:</span>
                  <span className="font-mono">RM {activeCalculation.standardPrice.toFixed(2)}</span>
                </div>

                {activeCalculation.totalDiscount > 0 && (
                  <div className="flex items-center justify-between text-emerald-400 font-semibold">
                    <span className="flex items-center gap-1">
                      <Tag className="w-3.5 h-3.5" />
                      Applied Credit Discount:
                    </span>
                    <span className="font-mono">-RM {activeCalculation.totalDiscount.toFixed(2)}</span>
                  </div>
                )}

                <div className="flex items-center justify-between pt-2 border-t border-slate-800 text-slate-100 font-bold">
                  <span>Net Payable Amount:</span>
                  <span className="font-mono text-amber-400 text-sm">
                    RM {activeCalculation.paidAmountRequired.toFixed(2)}
                  </span>
                </div>

                {!isPayable && (
                  <div className="p-2.5 mt-2 bg-red-500/10 border border-red-500/30 rounded-lg flex items-center gap-2 text-red-400 text-[11px]">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>
                      {activeCalculation.reasons[0] ||
                        'Insufficient funds to complete event creation.'}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Public Access Link Preview */}
          <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-1">
            <div className="flex items-center gap-2 text-[11px] font-bold text-amber-400">
              <Link className="w-3.5 h-3.5" />
              <span>Public Event URL Format</span>
            </div>
            <p className="text-[11px] text-slate-400 font-mono break-all">
              {window.location.origin}/e/[PUBLIC_TOKEN]
            </p>
            <p className="text-[10px] text-slate-500">
              A unique public token is generated automatically. Players play without login.
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
              disabled={submitting || themes.length === 0 || !isPayable}
              className="px-5 py-2.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed text-slate-950 text-xs font-bold rounded-xl transition-all shadow-md shadow-amber-500/20 flex items-center gap-2"
            >
              {submitting ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                  <span>Processing Payment & Deploying...</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4" />
                  <span>
                    Pay{' '}
                    {activeCalculation
                      ? `RM ${activeCalculation.paidAmountRequired.toFixed(2)}`
                      : 'RM 1,400.00'}{' '}
                    & Deploy Event
                  </span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
