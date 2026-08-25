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
import { PaymentCheckoutModal } from '../wallet/PaymentCheckoutModal';
import {
  X,
  Calendar,
  Clock,
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
  const [selectedGameId, setSelectedGameId] = useState<string>('all');
  const [selectedThemeId, setSelectedThemeId] = useState<string>('');
  const [themes, setThemes] = useState<GameThemeOption[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(false);

  // Duration & Dates
  const [durationPreset, setDurationPreset] = useState<DurationPreset>('1day');
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

  // Handle Duration Preset selection
  const handleDurationPresetChange = (preset: DurationPreset) => {
    setDurationPreset(preset);
    const start = new Date(startsAt);
    if (isNaN(start.getTime())) return;

    let hoursToAdd = 24;
    if (preset === '1day') hoursToAdd = 24;
    else if (preset === '2days') hoursToAdd = 48;
    else if (preset === '3days') hoursToAdd = 72;
    else if (preset === '7days') hoursToAdd = 168;
    else return; // Custom keeps existing expiresAt

    const end = new Date(start.getTime() + hoursToAdd * 60 * 60 * 1000);
    const pad = (n: number) => n.toString().padStart(2, '0');
    const year = end.getFullYear();
    const month = pad(end.getMonth() + 1);
    const day = pad(end.getDate());
    const hours = pad(end.getHours());
    const mins = pad(end.getMinutes());
    setExpiresAt(`${year}-${month}-${day}T${hours}:${mins}`);
  };

  // Fetch Available Registered Games & Game Themes on dialog open
  useEffect(() => {
    if (!isOpen) return;

    const fetchCatalog = async () => {
      try {
        setLoadingCatalog(true);
        // 1. Fetch Admin-registered platform games from Supabase
        const gamesPromise = apiFetch('/api/games');
        // 2. Fetch active org custom themes
        const themesPromise = apiFetch('/api/themes');
        // 3. Fetch system default themes
        const systemThemesPromise = apiFetch('/api/themes/system');

        const [gamesRes, themesRes, sysThemesRes] = await Promise.all([
          gamesPromise,
          themesPromise,
          systemThemesPromise,
        ]);

        let gameList: PlatformGameOption[] = [];
        if (gamesRes.ok) {
          const gamesData = await gamesRes.json();
          gameList = (gamesData.games || []) as PlatformGameOption[];
          setGames(gameList);
        }

        const registeredGameIds = new Set(gameList.map((g) => g.id));

        let allThemes: GameThemeOption[] = [];
        if (themesRes.ok) {
          const themesData = await themesRes.json();
          if (Array.isArray(themesData.themes)) {
            allThemes.push(...themesData.themes);
          }
        }
        if (sysThemesRes.ok) {
          const sysData = await sysThemesRes.json();
          if (Array.isArray(sysData.themes)) {
            for (const st of sysData.themes) {
              if (!allThemes.some((t) => t.id === st.id)) {
                allThemes.push(st);
              }
            }
          }
        }

        // STRICT FILTER: Only keep themes that belong to active registered platform games in `gameList`
        const validThemes = allThemes.filter((t) => {
          if (!t.game_id) return false;
          return registeredGameIds.has(t.game_id);
        });

        setThemes(validThemes);

        if (validThemes.length > 0) {
          // If no theme selected or currently selected theme not in validThemes, select first
          if (!selectedThemeId || !validThemes.some((t) => t.id === selectedThemeId)) {
            setSelectedThemeId(validThemes[0].id);
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
  }, [isOpen]);

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
          game_theme_id: themeId || undefined,
          payment_mode: mode,
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
    setSelectedGameId('all');
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

    const currentTheme = themes.find((t) => t.id === selectedThemeId) || themes[0];
    const themeIdToUse = currentTheme?.id || selectedThemeId;
    const gameIdToUse = currentTheme?.game_id || (selectedGameId !== 'all' ? selectedGameId : games[0]?.id);

    const startTime = new Date(startsAt).getTime();
    const expiryTime = new Date(expiresAt).getTime();

    if (isNaN(startTime) || isNaN(expiryTime)) {
      setCreationError('Please provide valid start and expiry dates/times');
      return;
    }

    if (expiryTime <= startTime) {
      setCreationError('Expiry date must be after Start date');
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
          event_date: startsAt.split('T')[0],
          starts_at: new Date(startsAt).toISOString(),
          expires_at: new Date(expiresAt).toISOString(),
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
  const standardPrice = activeCalculation?.eventPrice ?? 1400;
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

  const publicUrl = createdEvent ? `${window.location.origin}/play/${createdEvent.public_token}` : '';
  const previewUrl = createdEvent ? `${window.location.origin}/events/${createdEvent.id}/preview` : '';

  const handleCopyLink = async () => {
    if (!publicUrl) return;
    try {
      await navigator.clipboard.writeText(publicUrl);
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

              {/* 2. Select Game & Theme */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-300">
                    Game & Theme <span className="text-amber-400">*</span>
                  </label>
                  {games.length > 1 && (
                    <span className="text-[11px] text-slate-400 font-medium">
                      {games.length} Registered Platform Games
                    </span>
                  )}
                </div>

                {/* Game filter pills if multiple games */}
                {games.length > 1 && (
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-1 custom-scrollbar">
                    <button
                      type="button"
                      onClick={() => setSelectedGameId('all')}
                      className={`px-3 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                        selectedGameId === 'all'
                          ? 'bg-amber-500 text-slate-950 shadow-sm'
                          : 'bg-slate-950 border border-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      All Games ({themes.length})
                    </button>
                    {games.map((g) => {
                      const count = themes.filter((t) => t.game_id === g.id).length;
                      return (
                        <button
                          key={g.id}
                          type="button"
                          onClick={() => {
                            setSelectedGameId(g.id);
                            // Auto-select first theme of this game if current theme is not in this game
                            const firstThemeOfGame = themes.find((t) => t.game_id === g.id);
                            if (firstThemeOfGame && (!selectedThemeId || !themes.find(t => t.id === selectedThemeId && t.game_id === g.id))) {
                              setSelectedThemeId(firstThemeOfGame.id);
                            }
                          }}
                          className={`px-3 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer flex items-center gap-1.5 ${
                            selectedGameId === g.id
                              ? 'bg-amber-500 text-slate-950 shadow-sm'
                              : 'bg-slate-950 border border-slate-800 text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          <span>{g.name}</span>
                          <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                            selectedGameId === g.id ? 'bg-slate-900/30 text-slate-950' : 'bg-slate-800 text-slate-400'
                          }`}>
                            {count}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {loadingCatalog ? (
                  <div className="p-4 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
                    <RefreshCw className="w-4 h-4 animate-spin text-amber-400" />
                    <span>Loading registered games and themes...</span>
                  </div>
                ) : (
                  <>
                    {themes.filter((theme) => selectedGameId === 'all' || theme.game_id === selectedGameId).length === 0 ? (
                      <div className="p-4 rounded-xl border border-dashed border-slate-800 text-center text-xs text-slate-500">
                        No active themes available for the selected game. Please select another game or create a theme in Games.
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-48 overflow-y-auto pr-1">
                        {themes
                          .filter((theme) => selectedGameId === 'all' || theme.game_id === selectedGameId)
                          .map((theme) => {
                            const isSelected = selectedThemeId === theme.id;
                            const gameName = games.find((g) => g.id === theme.game_id)?.name || theme.game_name || 'Catch the Brand';
                            return (
                              <button
                                key={theme.id}
                                type="button"
                                onClick={() => {
                                  setSelectedThemeId(theme.id);
                                  if (theme.game_id && selectedGameId !== 'all' && selectedGameId !== theme.game_id) {
                                    setSelectedGameId(theme.game_id);
                                  }
                                }}
                                className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex items-center justify-between ${
                                  isSelected
                                    ? 'border-amber-500 bg-amber-500/10 ring-1 ring-amber-500/30 text-slate-100'
                                    : 'border-slate-800 bg-slate-950/60 hover:border-slate-700 hover:bg-slate-800/40 text-slate-400'
                                }`}
                              >
                                <div className="truncate mr-2">
                                  <div className="text-xs font-bold text-slate-200 truncate">
                                    {gameName}
                                  </div>
                                  <div className="text-[11px] text-slate-400 truncate">
                                    {theme.name}
                                  </div>
                                </div>
                                {isSelected && (
                                  <div className="w-4 h-4 rounded-full bg-amber-500 text-slate-950 flex items-center justify-center shrink-0">
                                    <Check className="w-2.5 h-2.5 stroke-[3]" />
                                  </div>
                                )}
                              </button>
                            );
                          })}
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* 3. Event Schedule & Duration */}
              <div className="space-y-3">
                <label className="text-xs font-bold text-slate-300">
                  Event Duration & Date <span className="text-amber-400">*</span>
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

                {/* Starts & Expires Inputs */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div className="space-y-1.5">
                    <span className="text-[11px] text-slate-400 font-medium flex items-center gap-1">
                      <Calendar className="w-3 h-3 text-amber-400" /> Start Date & Time
                    </span>
                    <input
                      type="datetime-local"
                      required
                      value={startsAt}
                      onChange={(e) => {
                        setStartsAt(e.target.value);
                        if (durationPreset !== 'custom') {
                          handleDurationPresetChange(durationPreset);
                        }
                      }}
                      className="w-full px-3 py-2.5 bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-xl text-slate-100 text-xs focus:outline-none"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <span className="text-[11px] text-slate-400 font-medium flex items-center gap-1">
                      <Clock className="w-3 h-3 text-amber-400" /> End Date & Time
                    </span>
                    <input
                      type="datetime-local"
                      required
                      disabled={durationPreset !== 'custom'}
                      value={expiresAt}
                      onChange={(e) => setExpiresAt(e.target.value)}
                      className={`w-full px-3 py-2.5 bg-slate-950 border ${
                        durationPreset === 'custom' ? 'border-slate-800 focus:border-amber-500 text-slate-100' : 'border-slate-800/60 text-slate-400 opacity-80 cursor-not-allowed'
                      } rounded-xl text-xs focus:outline-none`}
                    />
                  </div>
                </div>
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
        {/* STEP 2: EVENT CREATED SUCCESS STATE                               */}
        {/* ================================================================= */}
        {step === 'created' && createdEvent && (
          <div className="p-6 sm:p-8 space-y-6 flex flex-col flex-1 overflow-y-auto custom-scrollbar animate-in zoom-in-95 duration-200">
            {/* Celebration Icon */}
            <div className="text-center space-y-2">
              <div className="inline-flex p-4 bg-amber-500/10 border border-amber-500/30 rounded-full text-amber-400 mx-auto">
                <CheckCircle2 className="w-10 h-10 stroke-[2.5]" />
              </div>
              <h2 className="text-2xl font-black text-slate-100 tracking-tight">Event Created</h2>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                Your event has been created and is ready for configuration and testing.
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
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Status:</span>
                <span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30 font-bold text-[10px] uppercase">
                  Pending Payment
                </span>
              </div>
            </div>

            {/* Public Link Box */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-300 flex items-center justify-between">
                <span>Public Share URL</span>
                <span className="text-[11px] text-amber-400 font-normal">Goes live upon payment</span>
              </label>
              <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-xl p-2.5">
                <span className="font-mono text-xs text-slate-300 truncate flex-1 pl-1">
                  {publicUrl}
                </span>
                <button
                  type="button"
                  onClick={handleCopyLink}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-400 hover:text-amber-300 text-xs font-semibold flex items-center gap-1.5 shrink-0 transition-colors cursor-pointer"
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

            {/* Clear Payment Required Notice */}
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4 flex items-start gap-3 text-xs text-amber-200">
              <AlertCircle className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
              <div className="space-y-1">
                <p className="font-bold text-amber-300">Payment is required before players can access the public link</p>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  You can test-play your game right now in the private preview room. When ready, activate the event to unlock public access and the live leaderboard.
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
                  Pay Later
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
        {/* STEP 4: EVENT ACTIVATED CONFIRMATION                              */}
        {/* ================================================================= */}
        {step === 'activated' && (
          <div className="p-8 sm:p-10 space-y-6 text-center animate-in zoom-in-95 duration-200">
            <div className="inline-flex p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-full text-emerald-400">
              <CheckCircle2 className="w-12 h-12 stroke-[2.5]" />
            </div>

            <div className="space-y-1.5">
              <h2 className="text-2xl font-black text-slate-100">Event Activated!</h2>
              <p className="text-xs text-slate-400">Your event has been activated and is ready for live players.</p>
            </div>

            <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-5 text-left text-xs space-y-2.5 max-w-sm mx-auto">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Event</span>
                <span className="font-bold text-slate-100">{activatedEvent?.name || createdEvent?.name}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Status</span>
                <span className="font-bold text-emerald-400 uppercase">Active</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Paid Amount</span>
                <span className="font-mono font-bold text-slate-200">{formatCurrency(paidAmount)}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                type="button"
                onClick={() => window.open(publicUrl, '_blank')}
                className="py-3 px-4 rounded-2xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-bold text-xs transition-colors cursor-pointer flex items-center justify-center gap-1.5"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Open Game</span>
              </button>

              <button
                type="button"
                onClick={handleClose}
                className="py-3 px-4 rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs shadow-xl transition-all cursor-pointer flex items-center justify-center gap-1.5"
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
