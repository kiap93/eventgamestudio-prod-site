import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { apiFetch } from '../../lib/api';
import {
  PaymentMode,
  EventPaymentCalculation,
  WalletBalanceSummary,
  TopupOrderRecord,
  PaymentCheckoutSession,
} from '../../types';
import {
  getTodayDateString,
  addDaysToDateString,
  formatDateOnly,
  formatEventDateRange,
  calculateEventCalendarDays,
} from '../../lib/dateUtils';
import { PaymentCheckoutModal } from '../wallet/PaymentCheckoutModal';
import {
  X,
  Calendar,
  Sparkles,
  Gamepad2,
  Check,
  AlertCircle,
  Wallet,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  RefreshCw,
  PlusCircle,
  CreditCard,
  ExternalLink,
  Copy,
  Layers,
  ShieldCheck,
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

interface PlatformGameOption {
  id: string;
  name: string;
  slug: string;
  game_type: string;
  description?: string | null;
  icon_name?: string | null;
  status: string;
  theme_count?: number;
}

interface CreateEventDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onEventCreated: (newEvent: any) => void;
}

type DialogStep = 'configure' | 'created' | 'payment' | 'activated';
type DurationPreset = '1day' | '2days' | '3days' | '7days' | 'custom';

export const CreateEventDialog: React.FC<CreateEventDialogProps> = ({
  isOpen,
  onClose,
  onEventCreated,
}) => {
  const { currentOrganization } = useAuth();

  // Wizard Step
  const [step, setStep] = useState<DialogStep>('configure');

  // Form Fields
  const [name, setName] = useState('');
  const [games, setGames] = useState<PlatformGameOption[]>([]);
  const [selectedGameId, setSelectedGameId] = useState<string>('');
  const [selectedThemeId, setSelectedThemeId] = useState<string>('');
  const [themes, setThemes] = useState<GameThemeOption[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(false);

  // Date-Only Schedule (Calendar Days)
  const [durationPreset, setDurationPreset] = useState<DurationPreset>('1day');
  const [startDate, setStartDate] = useState<string>(() => getTodayDateString());
  const [endDate, setEndDate] = useState<string>(() => getTodayDateString());

  // Creation State
  const [isCreatingEvent, setIsCreatingEvent] = useState(false);
  const [creationError, setCreationError] = useState<string | null>(null);
  const [createdEvent, setCreatedEvent] = useState<any | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  // Quote & Payment State
  const [wallet, setWallet] = useState<WalletBalanceSummary | null>(null);
  const [loadingQuote, setLoadingQuote] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [activeCalculation, setActiveCalculation] = useState<EventPaymentCalculation | null>(null);
  const [selectedPaymentMode, setSelectedPaymentMode] = useState<PaymentMode>('FULL_PAID');

  // Payment Execution & Success State
  const [submittingPayment, setSubmittingPayment] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [activatedEvent, setActivatedEvent] = useState<any | null>(null);

  // Real Top-Up Checkout Session State
  const [activeCheckoutOrder, setActiveCheckoutOrder] = useState<TopupOrderRecord | null>(null);
  const [checkoutSession, setCheckoutSession] = useState<PaymentCheckoutSession | null>(null);
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);
  const [isSubmittingTopUp, setIsSubmittingTopUp] = useState(false);
  const [topUpSuccessNotice, setTopUpSuccessNotice] = useState<string | null>(null);

  // Format currency
  const formatCurrency = (amount?: number | null, currency: string = 'MYR') => {
    const num = Number(amount) || 0;
    const formatted =
      num % 1 === 0
        ? num.toLocaleString('en-US')
        : num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const prefix = currency === 'MYR' ? 'RM' : currency === 'USD' ? '$' : currency === 'SGD' ? 'S$' : currency;
    return `${prefix}${formatted}`;
  };

  // Handle Duration Preset selection for date ranges
  const handleDurationPresetChange = (preset: DurationPreset, baseStart?: string) => {
    setDurationPreset(preset);
    const start = baseStart || startDate || getTodayDateString();
    if (preset === '1day') {
      setEndDate(start);
    } else if (preset === '2days') {
      setEndDate(addDaysToDateString(start, 1));
    } else if (preset === '3days') {
      setEndDate(addDaysToDateString(start, 2));
    } else if (preset === '7days') {
      setEndDate(addDaysToDateString(start, 6));
    }
  };

  // Fetch Available Registered Games & Game Themes on dialog open
  useEffect(() => {
    if (!isOpen) return;

    const fetchCatalog = async () => {
      try {
        setLoadingCatalog(true);
        // 1. Fetch Admin-registered platform games from Supabase
        const gamesPromise = apiFetch('/api/games');
        // 2. Fetch active org custom themes (NEVER load system themes in event creation)
        const themesPromise = apiFetch('/api/themes');

        const [gamesRes, themesRes] = await Promise.all([
          gamesPromise,
          themesPromise,
        ]);

        let gameList: PlatformGameOption[] = [];
        if (gamesRes.ok) {
          const gamesData = await gamesRes.json();
          gameList = (gamesData.games || []) as PlatformGameOption[];
          setGames(gameList);
        }

        const registeredGameIds = new Set(gameList.map((g) => g.id));

        let orgThemes: GameThemeOption[] = [];
        if (themesRes.ok) {
          const themesData = await themesRes.json();
          if (Array.isArray(themesData.themes)) {
            orgThemes = themesData.themes;
          }
        }

        // STRICT FILTER: Only keep organization-owned, non-system themes that belong to active registered platform games in `gameList`
        const validThemes = orgThemes.filter((t) => {
          if (!t || !t.id || !t.game_id) return false;
          if (t.is_system === true) return false;
          if (t.ownership_type === 'system') return false;
          if (currentOrganization?.id && t.organization_id && t.organization_id !== currentOrganization.id) return false;
          if (t.status && t.status !== 'active') return false;
          return registeredGameIds.has(t.game_id);
        });

        setThemes(validThemes);

        // Determine active selected game
        let activeGameId = selectedGameId;
        if (!activeGameId || !gameList.some((g) => g.id === activeGameId)) {
          activeGameId = gameList[0]?.id || '';
          setSelectedGameId(activeGameId);
        }

        // Determine active selected theme for this chosen game
        const themesForGame = validThemes.filter((t) => t.game_id === activeGameId);
        if (themesForGame.length > 0) {
          if (!selectedThemeId || !themesForGame.some((t) => t.id === selectedThemeId)) {
            setSelectedThemeId(themesForGame[0].id);
          }
        } else {
          setSelectedThemeId('');
        }
      } catch (err: any) {
        console.error('Error fetching game catalog for event:', err);
      } finally {
        setLoadingCatalog(false);
      }
    };

    fetchCatalog();
  }, [isOpen, currentOrganization?.id]);

  // Handle Game selection change - updates game and auto-selects first theme of that game
  const handleGameChange = (gameId: string) => {
    setSelectedGameId(gameId);
    const themesForGame = themes.filter((t) => t.game_id === gameId);
    if (themesForGame.length > 0) {
      setSelectedThemeId(themesForGame[0].id);
    } else {
      setSelectedThemeId('');
    }
  };

  // Fetch Wallet & Calculate Quote
  const fetchWalletAndQuote = async (targetThemeId?: string, modeToUse?: PaymentMode) => {
    if (!isOpen || !currentOrganization) return;
    const themeId = targetThemeId || selectedThemeId;

    try {
      setLoadingQuote(true);
      setQuoteError(null);

      // 1. Fetch current wallet balance
      const walletRes = await apiFetch(`/api/organizations/${currentOrganization.id}/wallet`);
      if (walletRes.ok) {
        const walletData = await walletRes.json();
        setWallet(walletData.wallet as WalletBalanceSummary);
      }

      // 2. Fetch authoritative quote for selected mode
      const mode = modeToUse || selectedPaymentMode;
      const quoteRes = await apiFetch('/api/events/quote', {
        method: 'POST',
        body: JSON.stringify({
          event_id: createdEvent?.id || undefined,
          game_theme_id: themeId || undefined,
          payment_mode: mode,
          event_price: createdEvent?.event_price || undefined,
          start_date: createdEvent?.start_date || startDate || undefined,
          end_date: createdEvent?.end_date || endDate || undefined,
          startDate: createdEvent?.start_date || startDate || undefined,
          endDate: createdEvent?.end_date || endDate || undefined,
        }),
      });

      if (!quoteRes.ok) {
        const errData = await quoteRes.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to fetch event payment quote');
      }

      const quoteData = await quoteRes.json();
      if (quoteData.calculation) {
        setActiveCalculation(quoteData.calculation);
      }
      if (quoteData.wallet) {
        setWallet(quoteData.wallet);
      }
    } catch (err: any) {
      console.error('Error fetching payment quote:', err);
      setQuoteError(err.message || 'Unable to calculate quote');
    } finally {
      setLoadingQuote(false);
    }
  };

  // Reset dialog state on close
  const handleClose = () => {
    setStep('configure');
    setName('');
    setSelectedGameId('');
    setSelectedThemeId('');
    setCreationError(null);
    setPaymentError(null);
    setQuoteError(null);
    setCreatedEvent(null);
    setActivatedEvent(null);
    setWallet(null);
    setActiveCalculation(null);
    onClose();
  };

  // STEP 1: CREATE EVENT IN DATABASE (BEFORE PAYMENT)
  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreationError(null);

    if (!name.trim()) {
      setCreationError('Please enter an event name');
      return;
    }

    if (!selectedGameId) {
      setCreationError('Please select a game engine');
      return;
    }

    if (!selectedThemeId) {
      setCreationError('Please select a game theme for this event');
      return;
    }

    const currentTheme = themes.find((t) => t.id === selectedThemeId && (!selectedGameId || t.game_id === selectedGameId));
    if (!currentTheme) {
      setCreationError('Please select a valid organization theme for this game');
      return;
    }

    const themeIdToUse = currentTheme.id;
    const gameIdToUse = selectedGameId || currentTheme.game_id;

    if (!startDate || !endDate) {
      setCreationError('Please select both Start Date and End Date');
      return;
    }

    if (endDate < startDate) {
      setCreationError('End date must be on or after Start date');
      return;
    }

    try {
      setIsCreatingEvent(true);

      const res = await apiFetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          game_id: gameIdToUse || undefined,
          game_theme_id: themeIdToUse,
          start_date: startDate,
          end_date: endDate,
          event_date: startDate,
          starts_at: `${startDate}T00:00:00.000Z`,
          expires_at: `${endDate}T23:59:59.999Z`,
          status: 'pending_payment',
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        if (errData.code === 'PENDING_EVENT_LIMIT_REACHED' || res.status === 422) {
          throw new Error(errData.error || 'Maximum 2 pending payment events reached. Please pay for or delete an existing pending event.');
        }
        throw new Error(errData.error || 'Failed to create event. Please try again.');
      }

      const data = await res.json();
      const newEvent = data.event;

      setCreatedEvent(newEvent);
      onEventCreated(newEvent);

      // Advance to "Event Created" success screen
      setStep('created');
    } catch (err: any) {
      console.error('Create event error:', err);
      setCreationError(err.message || 'Failed to create event');
    } finally {
      setIsCreatingEvent(false);
    }
  };

  // Proceed from Created state to Payment state
  const handleProceedToPayment = () => {
    setStep('payment');
    fetchWalletAndQuote(createdEvent?.game_theme_id || selectedThemeId, selectedPaymentMode);
  };

  // STEP 2: CONFIRM PAYMENT & ACTIVATE EVENT (SERVER AUTHORITATIVE)
  const handleConfirmPaymentAndActivate = async () => {
    if (!createdEvent) return;
    setPaymentError(null);

    try {
      setSubmittingPayment(true);

      const res = await apiFetch(`/api/events/${createdEvent.id}/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payment_mode: selectedPaymentMode,
          topup_credit_requested: activeCalculation?.topupCreditUsed,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        if (res.status === 402 || errData.code === 'INSUFFICIENT_BALANCE') {
          setPaymentError(errData.error || 'Insufficient balance to activate event.');
          fetchWalletAndQuote(createdEvent.game_theme_id, selectedPaymentMode);
          return;
        }
        throw new Error(errData.error || 'Payment failed. Please try again.');
      }

      const data = await res.json();
      window.dispatchEvent(new CustomEvent('wallet_updated'));

      setActivatedEvent(data.event || createdEvent);
      onEventCreated(data.event || createdEvent);
      setStep('activated');
    } catch (err: any) {
      console.error('Payment error:', err);
      setPaymentError(err.message || 'Payment failed. Please try again.');
    } finally {
      setSubmittingPayment(false);
    }
  };

  // Top-Up flow for insufficient balance
  const handleStartTopUpFlow = async (amountToTopUp: number) => {
    if (!currentOrganization?.id || amountToTopUp <= 0) return;

    try {
      setIsSubmittingTopUp(true);
      setPaymentError(null);

      const orderRes = await apiFetch(`/api/organizations/${currentOrganization.id}/wallet/topup-orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: amountToTopUp,
          currency: 'MYR',
          notes: `Top up for event activation: ${createdEvent?.name || name}`,
        }),
      });

      if (!orderRes.ok) {
        const errData = await orderRes.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to create top-up order');
      }

      const orderData = await orderRes.json();
      const newOrder: TopupOrderRecord = orderData.order;
      setActiveCheckoutOrder(newOrder);

      const sessionRes = await apiFetch(
        `/api/organizations/${currentOrganization.id}/wallet/topup-orders/${newOrder.id}/checkout`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        }
      );

      if (!sessionRes.ok) {
        const errData = await sessionRes.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to initialize payment checkout session');
      }

      const sessionData = await sessionRes.json();
      setCheckoutSession(sessionData.session);
      setShowCheckoutModal(true);
    } catch (err: any) {
      console.error('Error starting top-up checkout:', err);
      setPaymentError(err.message || 'Failed to start payment checkout');
    } finally {
      setIsSubmittingTopUp(false);
    }
  };

  const handlePaymentSuccessTopUp = async (settledOrder: TopupOrderRecord) => {
    setShowCheckoutModal(false);
    setActiveCheckoutOrder(null);
    setCheckoutSession(null);
    setPaymentError(null);

    await fetchWalletAndQuote(createdEvent?.game_theme_id || selectedThemeId, selectedPaymentMode);

    setTopUpSuccessNotice(
      `Successfully added ${formatCurrency(settledOrder.top_up_amount)} to your wallet! Balance updated.`
    );
    setTimeout(() => setTopUpSuccessNotice(null), 5000);
  };

  // Selected Theme Details
  const selectedTheme = themes.find((t) => t.id === selectedThemeId) || themes[0];
  const standardPrice = activeCalculation?.eventPrice ?? createdEvent?.event_price ?? 0;
  const paidAmount = activeCalculation?.paidAmount ?? (
    selectedPaymentMode === 'WELCOME_CREDIT' ? 600 :
    selectedPaymentMode === 'SHOWCASE_CREDIT' ? 1100 :
    selectedPaymentMode === 'TOPUP_CREDIT' ? 1120 : standardPrice
  );
  const totalDiscount = activeCalculation?.totalDiscount ?? (standardPrice - paidAmount);
  const availableBalance = Number(
    activeCalculation?.availableBalances?.paid_balance ?? wallet?.paid_balance ?? 0
  );

  const isServerPayable = activeCalculation ? activeCalculation.isPayable : availableBalance >= paidAmount;
  const isInsufficientBalance = !loadingQuote && !quoteError && wallet !== null && (!isServerPayable || availableBalance < paidAmount);
  const needAmount = Math.max(0, paidAmount - availableBalance);

  const publicUrl = activatedEvent || (createdEvent && (createdEvent.event_status === 'LIVE' || createdEvent.payment_status === 'PAID'))
    ? `${window.location.origin}/play/${activatedEvent?.public_token || createdEvent?.public_token}`
    : '';
  const previewUrl = createdEvent ? `${window.location.origin}/events/${createdEvent.id}/preview` : '';

  const handleCopyPreviewLink = async () => {
    if (!previewUrl) return;
    try {
      await navigator.clipboard.writeText(previewUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch (err) {
      console.error('Copy link error', err);
    }
  };

  const handleCopyPublicLink = async () => {
    const targetUrl = publicUrl || (activatedEvent ? `${window.location.origin}/play/${activatedEvent.public_token}` : '');
    if (!targetUrl) return;
    try {
      await navigator.clipboard.writeText(targetUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch (err) {
      console.error('Copy link error', err);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-200 font-sans">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        
        {/* ================================================================= */}
        {/* STEP 1: CONFIGURE & CREATE EVENT RECORD                           */}
        {/* ================================================================= */}
        {step === 'configure' && (
          <form onSubmit={handleCreateEvent} className="flex flex-col flex-1 overflow-hidden">
            {/* Header */}
            <div className="p-6 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-2xl text-amber-400">
                  <Gamepad2 className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-slate-100">Create Event</h2>
                  <p className="text-xs text-slate-400">Create and store your event deployment before payment</p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleClose}
                className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form Body */}
            <div className="p-6 overflow-y-auto space-y-6 flex-1 custom-scrollbar">
              {creationError && (
                <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center gap-3 text-xs text-rose-400">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{creationError}</span>
                </div>
              )}

              {/* 1. Event Name */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-300">
                  Event Name <span className="text-amber-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. ABC Company Annual Summit 2026"
                  className="w-full px-4 py-3 bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-xl text-slate-100 text-sm focus:outline-none transition-all placeholder:text-slate-600"
                />
              </div>

              {/* 2. Select Game & Theme (Split into two cascading dropdowns) */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-300">
                    Game & Theme Selection <span className="text-amber-400">*</span>
                  </span>
                  {games.length > 0 && (
                    <span className="text-[11px] text-slate-400 font-medium">
                      {games.length} Registered Platform {games.length === 1 ? 'Game' : 'Games'}
                    </span>
                  )}
                </div>

                {loadingCatalog ? (
                  <div className="p-4 rounded-xl border border-slate-800 bg-slate-950/60 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
                    <RefreshCw className="w-4 h-4 animate-spin text-amber-400" />
                    <span>Loading registered games and themes...</span>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    {/* 1st Dropdown: Game Engine */}
                    <div className="space-y-1.5">
                      <label htmlFor="event-game-dropdown" className="text-[11px] font-semibold text-slate-300 flex items-center gap-1.5">
                        <Gamepad2 className="w-3.5 h-3.5 text-amber-400" />
                        <span>1. Select Game Engine</span>
                        <span className="text-amber-400">*</span>
                      </label>

                      <div className="relative">
                        <select
                          id="event-game-dropdown"
                          value={selectedGameId}
                          onChange={(e) => handleGameChange(e.target.value)}
                          disabled={games.length === 0}
                          className="w-full appearance-none px-3.5 py-3 pl-10 pr-9 bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-xl text-slate-100 text-sm focus:outline-none transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {games.length === 0 ? (
                            <option value="">No registered games found</option>
                          ) : (
                            games.map((g) => (
                              <option key={g.id} value={g.id} className="bg-slate-900 text-slate-100 py-1">
                                {g.name}
                              </option>
                            ))
                          )}
                        </select>
                        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                          <Gamepad2 className="w-4 h-4 text-amber-400" />
                        </div>
                        <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none text-slate-400">
                          <ChevronDown className="w-4 h-4" />
                        </div>
                      </div>

                      {games.find((g) => g.id === selectedGameId)?.description && (
                        <p className="text-[11px] text-slate-500 line-clamp-1">
                          {games.find((g) => g.id === selectedGameId)?.description}
                        </p>
                      )}
                    </div>

                    {/* 2nd Dropdown: Available Themes for chosen Game */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label htmlFor="event-theme-dropdown" className="text-[11px] font-semibold text-slate-300 flex items-center gap-1.5">
                          <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                          <span>2. Select Theme</span>
                          <span className="text-amber-400">*</span>
                        </label>
                        {selectedGameId && (
                          <span className="text-[10px] text-slate-500 font-medium">
                            {themes.filter((t) => t.game_id === selectedGameId).length} available
                          </span>
                        )}
                      </div>

                      <div className="relative">
                        <select
                          id="event-theme-dropdown"
                          value={selectedThemeId}
                          onChange={(e) => setSelectedThemeId(e.target.value)}
                          disabled={!selectedGameId || themes.filter((t) => t.game_id === selectedGameId).length === 0}
                          className="w-full appearance-none px-3.5 py-3 pl-10 pr-9 bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-xl text-slate-100 text-sm focus:outline-none transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {!selectedGameId ? (
                            <option value="">Select a game first</option>
                          ) : themes.filter((t) => t.game_id === selectedGameId).length === 0 ? (
                            <option value="">No active themes for this game</option>
                          ) : (
                            themes
                              .filter((t) => t.game_id === selectedGameId)
                              .map((t) => (
                                <option key={t.id} value={t.id} className="bg-slate-900 text-slate-100 py-1">
                                  {t.name}
                                </option>
                              ))
                          )}
                        </select>
                        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                          <Sparkles className="w-4 h-4 text-amber-400" />
                        </div>
                        <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none text-slate-400">
                          <ChevronDown className="w-4 h-4" />
                        </div>
                      </div>

                      {selectedGameId && themes.filter((t) => t.game_id === selectedGameId).length === 0 && (
                        <p className="text-[11px] text-amber-400/90">
                          No active themes found. Customize a theme in the Games tab.
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* 3. Event Schedule & Duration */}
              <div className="space-y-3">
                <label className="text-xs font-bold text-slate-300">
                  Event Schedule (Date Only) <span className="text-amber-400">*</span>
                </label>

                {/* Duration Presets */}
                <div className="grid grid-cols-5 gap-1.5">
                  {(['1day', '2days', '3days', '7days', 'custom'] as DurationPreset[]).map((preset) => {
                    const isSelected = durationPreset === preset;
                    const labels: Record<DurationPreset, string> = {
                      '1day': '1 Day',
                      '2days': '2 Days',
                      '3days': '3 Days',
                      '7days': '7 Days',
                      'custom': 'Custom',
                    };
                    return (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => handleDurationPresetChange(preset)}
                        className={`py-2 px-1 text-center rounded-xl text-xs font-bold transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-amber-500 text-slate-950 shadow-sm'
                            : 'bg-slate-950 border border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                        }`}
                      >
                        {labels[preset]}
                      </button>
                    );
                  })}
                </div>

                {/* Start Date & End Date Inputs */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div className="space-y-1.5">
                    <span className="text-[11px] text-slate-400 font-medium flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5 text-amber-400" /> Start Date
                    </span>
                    <input
                      type="date"
                      required
                      value={startDate}
                      onChange={(e) => {
                        const newStart = e.target.value;
                        setStartDate(newStart);
                        if (durationPreset !== 'custom') {
                          handleDurationPresetChange(durationPreset, newStart);
                        } else if (endDate < newStart) {
                          setEndDate(newStart);
                        }
                      }}
                      className="w-full px-3 py-2.5 bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-xl text-slate-100 text-xs focus:outline-none cursor-pointer"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <span className="text-[11px] text-slate-400 font-medium flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5 text-amber-400" /> End Date
                    </span>
                    <input
                      type="date"
                      required
                      min={startDate}
                      disabled={durationPreset !== 'custom'}
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className={`w-full px-3 py-2.5 bg-slate-950 border ${
                        durationPreset === 'custom' ? 'border-slate-800 focus:border-amber-500 text-slate-100 cursor-pointer' : 'border-slate-800/60 text-slate-400 opacity-80 cursor-not-allowed'
                      } rounded-xl text-xs focus:outline-none`}
                    />
                  </div>
                </div>

                {startDate && endDate && (
                  <p className="text-[11px] text-slate-400 font-medium">
                    Active for whole calendar day{startDate === endDate ? '' : 's'}: <span className="text-amber-300 font-bold">{formatEventDateRange(startDate, endDate)}</span>
                  </p>
                )}
              </div>

              {/* Informative Note */}
              <div className="bg-slate-950/60 border border-slate-800/80 rounded-2xl p-4 space-y-1.5 text-xs text-slate-400">
                <div className="flex items-center gap-2 text-slate-200 font-semibold">
                  <Sparkles className="w-4 h-4 text-amber-400" />
                  <span>Instant URL Creation</span>
                </div>
                <p className="text-[11px] leading-relaxed">
                  Your event will be created and receive its permanent URL immediately. You can test and inspect the game before completing payment & activation.
                </p>
              </div>
            </div>

            {/* Footer */}
            <div className="p-6 border-t border-slate-800 bg-slate-950/40 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={handleClose}
                className="px-4 py-2.5 rounded-xl border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-slate-200 text-xs font-bold transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!name.trim() || isCreatingEvent}
                className="px-6 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed text-slate-950 font-bold text-sm shadow-md transition-all cursor-pointer flex items-center gap-2"
              >
                {isCreatingEvent ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Creating Event...</span>
                  </>
                ) : (
                  <>
                    <span>Create Event</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </form>
        )}

        {/* ================================================================= */}
        {/* STEP 2: EVENT CREATED SUCCESS STATE (PREVIEW ONLY)                */}
        {/* ================================================================= */}
        {step === 'created' && createdEvent && (
          <div className="p-6 sm:p-8 space-y-6 flex flex-col flex-1 overflow-y-auto custom-scrollbar animate-in zoom-in-95 duration-200">
            {/* Celebration / Status Icon */}
            <div className="text-center space-y-2">
              <div className="inline-flex p-4 bg-amber-500/10 border border-amber-500/30 rounded-full text-amber-400 mx-auto">
                <CheckCircle2 className="w-10 h-10 stroke-[2.5]" />
              </div>
              <h2 className="text-2xl font-black text-slate-100 tracking-tight">Event Created (Draft)</h2>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                Your event has been saved as a Draft with a private preview link.
              </p>
            </div>

            {/* Event Details Card */}
            <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-5 space-y-3 text-xs">
              <div className="flex items-center justify-between border-b border-slate-900 pb-2.5">
                <span className="text-slate-400">Event Name:</span>
                <span className="font-bold text-slate-100">{createdEvent.name}</span>
              </div>
              <div className="flex items-center justify-between border-b border-slate-900 pb-2.5">
                <span className="text-slate-400">Game / Theme:</span>
                <span className="font-semibold text-amber-300">
                  {selectedTheme?.game_name || 'Game'} / {selectedTheme?.name || 'Theme'}
                </span>
              </div>
              <div className="flex items-center justify-between border-b border-slate-900 pb-2.5">
                <span className="text-slate-400">Scheduled Duration:</span>
                <span className="font-bold text-slate-200">
                  {calculateEventCalendarDays(createdEvent.start_date || startDate, createdEvent.end_date || endDate)} calendar days
                  {createdEvent.start_date && (
                    <span className="text-[11px] font-normal text-slate-400 ml-1.5">
                      ({createdEvent.start_date} to {createdEvent.end_date || createdEvent.start_date})
                    </span>
                  )}
                </span>
              </div>
              <div className="flex items-center justify-between border-b border-slate-900 pb-2.5">
                <span className="text-slate-400">Event Price:</span>
                <span className="font-mono font-bold text-amber-400">
                  {formatCurrency(createdEvent.event_price || standardPrice)}
                </span>
              </div>
              <div className="flex items-center justify-between border-b border-slate-900 pb-2.5">
                <span className="text-slate-400">Event Status:</span>
                <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700 font-bold text-[10px] uppercase">
                  {createdEvent.event_status || 'DRAFT'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Payment Status:</span>
                <span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30 font-bold text-[10px] uppercase">
                  {createdEvent.payment_status || 'UNPAID'}
                </span>
              </div>
            </div>

            {/* Private Preview Link Box */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-300 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Gamepad2 className="w-3.5 h-3.5 text-purple-400" />
                  <span>Private Preview URL</span>
                </span>
                <span className="text-[10px] text-purple-400 font-medium">Owner & Tester Access Only</span>
              </label>
              <div className="flex items-center gap-2 bg-slate-950 border border-purple-500/30 rounded-xl p-2.5">
                <span className="font-mono text-xs text-purple-200 truncate flex-1 pl-1">
                  {previewUrl}
                </span>
                <button
                  type="button"
                  onClick={handleCopyPreviewLink}
                  className="px-3 py-1.5 rounded-lg bg-purple-950/80 hover:bg-purple-900/80 text-purple-300 hover:text-purple-200 text-xs font-semibold flex items-center gap-1.5 shrink-0 transition-colors cursor-pointer border border-purple-500/40"
                >
                  {copiedLink ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="text-emerald-400">Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy Preview</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Clear Payment Required Notice */}
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4 flex items-start gap-3 text-xs text-amber-200">
              <AlertCircle className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
              <div className="space-y-1">
                <p className="font-bold text-amber-300">Public player link is generated ONLY after payment confirmation</p>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  You can test gameplay and verify theme configurations via the preview link above. To publish the event to the public and start live leaderboard scoring, proceed to payment and activation.
                </p>
              </div>
            </div>

            {/* Primary Action Buttons */}
            <div className="space-y-2.5 pt-2">
              <button
                type="button"
                onClick={handleProceedToPayment}
                className="w-full py-3.5 px-6 rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-sm shadow-xl transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                <CreditCard className="w-4 h-4" />
                <span>Pay & Activate Event</span>
              </button>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => window.open(previewUrl, '_blank')}
                  className="py-2.5 px-4 rounded-xl bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/40 text-purple-200 font-bold text-xs transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <Gamepad2 className="w-3.5 h-3.5 text-purple-400" />
                  <span>Test Play Preview</span>
                </button>

                <button
                  type="button"
                  onClick={handleClose}
                  className="py-2.5 px-4 rounded-xl border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-slate-200 text-xs font-semibold transition-colors cursor-pointer text-center"
                >
                  Save as Draft
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* STEP 3: PAYMENT & ACTIVATION (SERVER AUTHORITATIVE)               */}
        {/* ================================================================= */}
        {step === 'payment' && (
          <div className="flex flex-col flex-1 overflow-hidden">
            {/* Header */}
            <div className="p-6 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setStep('created')}
                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors cursor-pointer"
                  title="Back to Event Summary"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <div>
                  <h2 className="text-xl font-bold text-slate-100">Pay & Activate</h2>
                  <p className="text-xs text-slate-400">Review quote and activate {createdEvent?.name || 'Event'}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleClose}
                className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Payment Content */}
            <div className="p-6 overflow-y-auto space-y-6 flex-1 custom-scrollbar">
              {topUpSuccessNotice && (
                <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center gap-2.5 text-xs text-emerald-400 animate-in fade-in">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                  <span>{topUpSuccessNotice}</span>
                </div>
              )}

              {paymentError && (
                <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center gap-2.5 text-xs text-rose-400">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{paymentError}</span>
                </div>
              )}

              {/* Event Info */}
              <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-200">{createdEvent?.name}</span>
                  <span className="text-[10px] font-mono text-slate-400">Token: {createdEvent?.public_token}</span>
                </div>
                <div className="text-[11px] text-slate-400 flex items-center gap-2">
                  <Gamepad2 className="w-3.5 h-3.5 text-amber-400" />
                  <span>{selectedTheme?.game_name || 'Catch the Brand'}</span>
                  <span>•</span>
                  <span>{selectedTheme?.name || 'Theme'}</span>
                </div>
              </div>

              {/* Pricing & Quote */}
              {loadingQuote ? (
                <div className="bg-slate-950/50 border border-slate-800 rounded-2xl p-6 flex items-center justify-center gap-2 text-xs text-slate-400">
                  <RefreshCw className="w-4 h-4 animate-spin text-amber-400" />
                  <span>Calculating payment quote...</span>
                </div>
              ) : quoteError ? (
                <div className="bg-rose-500/10 border border-rose-500/20 rounded-2xl p-4 text-xs text-rose-400 flex items-center justify-between">
                  <span>{quoteError}</span>
                  <button
                    type="button"
                    onClick={() => fetchWalletAndQuote(createdEvent?.game_theme_id, selectedPaymentMode)}
                    className="underline text-rose-300 font-bold ml-2 cursor-pointer"
                  >
                    Retry
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Payment Mode Selector */}
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-300">Payment Option</label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedPaymentMode('FULL_PAID');
                          fetchWalletAndQuote(createdEvent?.game_theme_id, 'FULL_PAID');
                        }}
                        className={`p-3 rounded-xl border text-left text-xs transition-all cursor-pointer ${
                          selectedPaymentMode === 'FULL_PAID'
                            ? 'border-amber-500 bg-amber-500/10 text-slate-100 ring-1 ring-amber-500/30'
                            : 'border-slate-800 bg-slate-950/60 text-slate-400 hover:border-slate-700'
                        }`}
                      >
                        <div className="font-bold text-slate-200">Paid Balance</div>
                        <div className="text-[11px] text-slate-400 mt-0.5">{formatCurrency(standardPrice)}</div>
                      </button>

                      {wallet && wallet.welcome_credit > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedPaymentMode('WELCOME_CREDIT');
                            fetchWalletAndQuote(createdEvent?.game_theme_id, 'WELCOME_CREDIT');
                          }}
                          className={`p-3 rounded-xl border text-left text-xs transition-all cursor-pointer ${
                            selectedPaymentMode === 'WELCOME_CREDIT'
                              ? 'border-amber-500 bg-amber-500/10 text-slate-100 ring-1 ring-amber-500/30'
                              : 'border-slate-800 bg-slate-950/60 text-slate-400 hover:border-slate-700'
                          }`}
                        >
                          <div className="font-bold text-emerald-400 flex items-center gap-1">
                            <Sparkles className="w-3 h-3" />
                            <span>Welcome Credit</span>
                          </div>
                          <div className="text-[11px] text-slate-400 mt-0.5">Save RM800 (Pay RM600)</div>
                        </button>
                      )}

                      {wallet && wallet.showcase_credit > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedPaymentMode('SHOWCASE_CREDIT');
                            fetchWalletAndQuote(createdEvent?.game_theme_id, 'SHOWCASE_CREDIT');
                          }}
                          className={`p-3 rounded-xl border text-left text-xs transition-all cursor-pointer ${
                            selectedPaymentMode === 'SHOWCASE_CREDIT'
                              ? 'border-amber-500 bg-amber-500/10 text-slate-100 ring-1 ring-amber-500/30'
                              : 'border-slate-800 bg-slate-950/60 text-slate-400 hover:border-slate-700'
                          }`}
                        >
                          <div className="font-bold text-amber-400 flex items-center gap-1">
                            <Sparkles className="w-3 h-3" />
                            <span>Showcase Credit</span>
                          </div>
                          <div className="text-[11px] text-slate-400 mt-0.5">Save RM300 (Pay RM1,100)</div>
                        </button>
                      )}

                      {wallet && wallet.topup_credit > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedPaymentMode('TOPUP_CREDIT');
                            fetchWalletAndQuote(createdEvent?.game_theme_id, 'TOPUP_CREDIT');
                          }}
                          className={`p-3 rounded-xl border text-left text-xs transition-all cursor-pointer ${
                            selectedPaymentMode === 'TOPUP_CREDIT'
                              ? 'border-amber-500 bg-amber-500/10 text-slate-100 ring-1 ring-amber-500/30'
                              : 'border-slate-800 bg-slate-950/60 text-slate-400 hover:border-slate-700'
                          }`}
                        >
                          <div className="font-bold text-blue-400 flex items-center gap-1">
                            <Sparkles className="w-3 h-3" />
                            <span>Top-up Credit</span>
                          </div>
                          <div className="text-[11px] text-slate-400 mt-0.5">Save up to 20% (RM280)</div>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Financial Breakdown */}
                  <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-4 space-y-2.5 text-xs">
                    <div className="flex items-center justify-between text-slate-300">
                      <span>Event Price</span>
                      <span className="font-mono font-bold">{formatCurrency(standardPrice)}</span>
                    </div>

                    {totalDiscount > 0 && (
                      <div className="flex items-center justify-between text-emerald-400">
                        <span className="flex items-center gap-1">
                          <Sparkles className="w-3.5 h-3.5" />
                          Credit Applied
                        </span>
                        <span className="font-mono font-bold">-{formatCurrency(totalDiscount)}</span>
                      </div>
                    )}

                    <div className="flex items-center justify-between pt-1 border-t border-slate-800 font-semibold text-slate-100">
                      <span>Amount Required</span>
                      <span className="font-mono font-bold text-amber-400 text-sm">
                        {formatCurrency(paidAmount)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between pt-1 border-t border-slate-900 text-slate-400">
                      <span className="flex items-center gap-1.5">
                        <Wallet className="w-3.5 h-3.5" />
                        Available Paid Balance
                      </span>
                      <span className="font-mono font-bold text-slate-200">
                        {formatCurrency(availableBalance)}
                      </span>
                    </div>
                  </div>

                  {/* Insufficient balance top-up box */}
                  {isInsufficientBalance && (
                    <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 space-y-3">
                      <div className="flex items-center gap-2 text-xs font-bold text-amber-400">
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        <span>Insufficient Balance</span>
                      </div>
                      <p className="text-xs text-slate-300">
                        You need <span className="font-mono font-bold text-amber-300">{formatCurrency(needAmount)}</span> more to activate this event.
                      </p>
                      <button
                        type="button"
                        disabled={isSubmittingTopUp}
                        onClick={() => handleStartTopUpFlow(needAmount > 0 ? needAmount : 1400)}
                        className="w-full py-2.5 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-sm cursor-pointer"
                      >
                        {isSubmittingTopUp ? (
                          <>
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            <span>Connecting to Gateway...</span>
                          </>
                        ) : (
                          <>
                            <PlusCircle className="w-3.5 h-3.5" />
                            <span>Top Up {formatCurrency(needAmount)}</span>
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-6 border-t border-slate-800 bg-slate-950/40 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setStep('created')}
                className="px-4 py-2.5 rounded-xl border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-slate-200 text-xs font-bold transition-colors cursor-pointer"
              >
                Back
              </button>

              <button
                type="button"
                disabled={submittingPayment || isInsufficientBalance || loadingQuote || !!quoteError}
                onClick={handleConfirmPaymentAndActivate}
                className="px-6 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed text-slate-950 font-bold text-sm shadow-md transition-all cursor-pointer flex items-center gap-2"
              >
                {submittingPayment ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Processing Payment...</span>
                  </>
                ) : (
                  <>
                    <span>Pay {formatCurrency(paidAmount)} & Activate</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* STEP 4: EVENT ACTIVATED CONFIRMATION (PUBLIC LIVE)                */}
        {/* ================================================================= */}
        {step === 'activated' && (
          <div className="p-8 sm:p-10 space-y-6 text-center animate-in zoom-in-95 duration-200 flex flex-col flex-1 overflow-y-auto custom-scrollbar">
            <div className="inline-flex p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-full text-emerald-400 mx-auto">
              <CheckCircle2 className="w-12 h-12 stroke-[2.5]" />
            </div>

            <div className="space-y-1.5">
              <h2 className="text-2xl font-black text-slate-100">Event Activated & Live!</h2>
              <p className="text-xs text-slate-400">Payment confirmed. Your event is now LIVE and the public player URL is ready.</p>
            </div>

            {/* Public Link Box */}
            <div className="space-y-2 text-left max-w-sm mx-auto w-full">
              <label className="text-xs font-bold text-slate-300 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <ExternalLink className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Public Game URL</span>
                </span>
                <span className="text-[10px] text-emerald-400 font-bold uppercase">LIVE</span>
              </label>
              <div className="flex items-center gap-2 bg-slate-950 border border-emerald-500/40 rounded-xl p-2.5">
                <span className="font-mono text-xs text-emerald-300 truncate flex-1 pl-1">
                  {publicUrl}
                </span>
                <button
                  type="button"
                  onClick={handleCopyPublicLink}
                  className="px-3 py-1.5 rounded-lg bg-emerald-950/80 hover:bg-emerald-900/80 text-emerald-300 hover:text-emerald-200 text-xs font-semibold flex items-center gap-1.5 shrink-0 transition-colors cursor-pointer border border-emerald-500/40"
                >
                  {copiedLink ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="text-emerald-400">Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-5 text-left text-xs space-y-2.5 max-w-sm mx-auto w-full">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Event</span>
                <span className="font-bold text-slate-100">{activatedEvent?.name || createdEvent?.name}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Event Status</span>
                <span className="font-bold text-emerald-400 uppercase">LIVE</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Payment Status</span>
                <span className="font-bold text-emerald-400 uppercase">PAID</span>
              </div>
              <div className="flex items-center justify-between border-t border-slate-900 pt-2">
                <span className="text-slate-400">Paid Amount</span>
                <span className="font-mono font-bold text-slate-200">{formatCurrency(paidAmount)}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2 max-w-sm mx-auto w-full">
              <button
                type="button"
                onClick={() => window.open(publicUrl, '_blank')}
                className="py-3 px-4 rounded-2xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-bold text-xs transition-colors cursor-pointer flex items-center justify-center gap-1.5"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Open Live Game</span>
              </button>

              <button
                type="button"
                onClick={handleClose}
                className="py-3 px-4 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs shadow-xl transition-all cursor-pointer flex items-center justify-center gap-1.5"
              >
                <span>Done</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

      </div>

      {/* Production Payment Checkout Modal for Top Up */}
      {showCheckoutModal && activeCheckoutOrder && currentOrganization && (
        <PaymentCheckoutModal
          isOpen={showCheckoutModal}
          onClose={() => setShowCheckoutModal(false)}
          order={activeCheckoutOrder}
          checkoutSession={checkoutSession}
          organizationId={currentOrganization.id}
          onPaymentSuccess={handlePaymentSuccessTopUp}
          onPaymentFailed={() => setShowCheckoutModal(false)}
          onPaymentCancelled={() => setShowCheckoutModal(false)}
        />
      )}
    </div>
  );
};
