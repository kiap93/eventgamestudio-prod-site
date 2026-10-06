import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useLocalization } from '../../context/LocalizationContext';
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
  getCalendarDateInTimezone,
  addDaysToDateString,
  formatDateOnly,
  formatDateDisplay,
  formatDateApi,
  formatEventDateRange,
  calculateEventCalendarDays,
  isDateBefore,
  fetchServerDate,
} from '../../lib/dateUtils';
import { SUPPORTED_TIMEZONES, getDefaultTimezoneForCountry, resolveEventTimezone } from '../../lib/countryUtils';
import { CustomDatePicker } from '../common/CustomDatePicker';
import { PaymentCheckoutModal } from '../wallet/PaymentCheckoutModal';
import { getGameTypeIcon } from '../../games';
import { normalizeGameType } from '../../games/gameIcons';
import { navigateTo } from '../../hooks/useRouteContext';
import { formatEventErrorMessage } from './eventErrorUtils';
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
  Globe,
  Palette,
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
  initialGameId?: string;
}

type DialogStep = 'configure' | 'created' | 'payment' | 'activated';
type DurationPreset = '1day' | '2days' | '3days' | '7days' | 'custom';

export const CreateEventDialog: React.FC<CreateEventDialogProps> = ({
  isOpen,
  onClose,
  onEventCreated,
  initialGameId,
}) => {
  const { currentOrganization } = useAuth();
  const { t } = useLocalization();

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
  const [eventTimezone, setEventTimezone] = useState<string>(() => {
    return resolveEventTimezone(undefined, currentOrganization);
  });

  const [startDate, setStartDate] = useState<string>(() => getTodayDateString(resolveEventTimezone(undefined, currentOrganization)));
  const [endDate, setEndDate] = useState<string>(() => getTodayDateString(resolveEventTimezone(undefined, currentOrganization)));

  // Date and duration validation states
  const hasSelectedBothDates = Boolean(startDate && endDate);
  const isEndDateBeforeStartDate = Boolean(hasSelectedBothDates && isDateBefore(endDate, startDate));
  const currentDurationDays = hasSelectedBothDates && !isEndDateBeforeStartDate
    ? calculateEventCalendarDays(startDate, endDate)
    : 0;
  const isDateRangeInvalid = !hasSelectedBothDates || isEndDateBeforeStartDate;

  useEffect(() => {
    if (isOpen) {
      setStep('configure');
      setDurationPreset('1day');
      const tz = resolveEventTimezone(undefined, currentOrganization);
      setEventTimezone(tz);

      // 1. Immediately set initial date using synchronized server date if available
      const initialDate = getTodayDateString(tz);
      setStartDate(initialDate);
      setEndDate(initialDate);

      // 2. Authoritatively fetch/refresh server date from Cloudflare Worker (/api/time)
      let isMounted = true;
      fetchServerDate(tz)
        .then(({ date: serverToday }) => {
          if (!isMounted) return;
          setStartDate(serverToday);
          setEndDate(serverToday);
        })
        .catch((err) => {
          console.warn('[CreateEventDialog] Failed to fetch authoritative server date:', err);
        });

      return () => {
        isMounted = false;
      };
    }
  }, [isOpen, currentOrganization]);

  useEffect(() => {
    if (currentOrganization?.country_code) {
      const tz = resolveEventTimezone(undefined, currentOrganization);
      setEventTimezone(tz);

      let isMounted = true;
      fetchServerDate(tz)
        .then(({ date: serverToday }) => {
          if (!isMounted) return;
          setStartDate(serverToday);
          setEndDate(serverToday);
        })
        .catch(() => {});

      return () => {
        isMounted = false;
      };
    }
  }, [currentOrganization?.country_code]);

  // Creation State
  const [isCreatingEvent, setIsCreatingEvent] = useState(false);
  const isCreatingEventRef = useRef(false);
  const [creationError, setCreationError] = useState<string | null>(null);
  const [createdEvent, setCreatedEvent] = useState<any | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  // Quote & Payment State
  const [wallet, setWallet] = useState<WalletBalanceSummary | null>(null);
  const [loadingQuote, setLoadingQuote] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [activeCalculation, setActiveCalculation] = useState<EventPaymentCalculation | null>(null);
  const [selectedPaymentMode, setSelectedPaymentMode] = useState<PaymentMode>('FULL_PAID');
  const [useWelcomeCredit, setUseWelcomeCredit] = useState(true);
  const [useEventCredit, setUseEventCredit] = useState(true);

  // Payment Execution & Success State
  const [submittingPayment, setSubmittingPayment] = useState(false);
  const submittingPaymentRef = useRef(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [activatedEvent, setActivatedEvent] = useState<any | null>(null);

  // Real Top-Up Checkout Session State
  const [activeCheckoutOrder, setActiveCheckoutOrder] = useState<TopupOrderRecord | null>(null);
  const [checkoutSession, setCheckoutSession] = useState<PaymentCheckoutSession | null>(null);
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);
  const [isSubmittingTopUp, setIsSubmittingTopUp] = useState(false);
  const isSubmittingTopUpRef = useRef(false);
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
        const urlParams = new URLSearchParams(window.location.search);
        const queryGame = initialGameId || urlParams.get('game') || urlParams.get('gameId') || urlParams.get('game_type');
        let matchedGame = queryGame
          ? gameList.find((g) => g.id === queryGame || g.slug === queryGame || g.game_type === queryGame)
          : null;
        if (!matchedGame && queryGame) {
          const canonical = normalizeGameType(queryGame);
          matchedGame = gameList.find((g) => g.game_type === canonical || g.slug === canonical);
        }

        let activeGameId = matchedGame ? matchedGame.id : selectedGameId;
        if (!activeGameId || !gameList.some((g) => g.id === activeGameId)) {
          activeGameId = gameList[0]?.id || '';
        }
        setSelectedGameId(activeGameId);

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
  const fetchWalletAndQuote = async (
    targetThemeId?: string,
    modeToUse?: PaymentMode,
    creditOptions?: { useWelcome?: boolean; useEvent?: boolean }
  ) => {
    if (!isOpen || !currentOrganization) return;
    const themeId = targetThemeId || selectedThemeId;

    const useWelcome = creditOptions?.useWelcome !== undefined ? creditOptions.useWelcome : useWelcomeCredit;
    const useEvent = creditOptions?.useEvent !== undefined ? creditOptions.useEvent : useEventCredit;

    let mode = modeToUse;
    if (!mode) {
      if (useWelcome && useEvent) mode = 'COMBINED_CREDIT';
      else if (useWelcome) mode = 'WELCOME_CREDIT';
      else if (useEvent) mode = 'TOPUP_CREDIT';
      else mode = 'FULL_PAID';
    }

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
      const quoteRes = await apiFetch('/api/events/quote', {
        method: 'POST',
        body: JSON.stringify({
          event_id: createdEvent?.id || undefined,
          game_theme_id: themeId || undefined,
          payment_mode: mode,
          use_welcome_credit: useWelcome,
          use_event_credit: useEvent,
          useWelcomeCredit: useWelcome,
          useEventCredit: useEvent,
          event_price: createdEvent?.event_price || undefined,
          start_date: formatDateApi(createdEvent?.start_date || startDate) || undefined,
          end_date: formatDateApi(createdEvent?.end_date || endDate) || undefined,
          startDate: formatDateApi(createdEvent?.start_date || startDate) || undefined,
          endDate: formatDateApi(createdEvent?.end_date || endDate) || undefined,
        }),
      });

      if (!quoteRes.ok) {
        const errData = await quoteRes.json().catch(() => ({}));
        throw new Error(formatEventErrorMessage(errData, quoteRes.status));
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
    setUseWelcomeCredit(true);
    setUseEventCredit(true);
    setDurationPreset('1day');
    const tz = resolveEventTimezone(undefined, currentOrganization);
    const today = getTodayDateString(tz);
    setStartDate(today);
    setEndDate(today);
    onClose();
  };

  // STEP 1: CREATE EVENT IN DATABASE (BEFORE PAYMENT)
  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreationError(null);

    if (isCreatingEvent || isCreatingEventRef.current) return;

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

    if (isDateBefore(endDate, startDate)) {
      setCreationError('The event end date cannot be earlier than the start date. Please select a valid date range.');
      return;
    }

    isCreatingEventRef.current = true;

    try {
      setIsCreatingEvent(true);
      setCreationError(null);

      const res = await apiFetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          game_id: gameIdToUse || undefined,
          game_theme_id: themeIdToUse,
          start_date: formatDateApi(startDate),
          end_date: formatDateApi(endDate),
          event_date: formatDateApi(startDate),
          status: 'pending_payment',
          event_timezone: eventTimezone,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        const userFriendlyMessage = formatEventErrorMessage(errData, res.status);
        throw new Error(userFriendlyMessage);
      }

      const data = await res.json();
      const newEvent = data.event;

      setCreatedEvent(newEvent);
      onEventCreated(newEvent);

      // Advance to "Event Created" success screen
      setStep('created');
    } catch (err: any) {
      console.error('Create event error:', err);
      setCreationError(err.message || 'Failed to create event. Please check your inputs and try again.');
    } finally {
      isCreatingEventRef.current = false;
      setIsCreatingEvent(false);
    }
  };

  // Proceed from Created state to Payment state
  const handleProceedToPayment = () => {
    setStep('payment');
    fetchWalletAndQuote(createdEvent?.game_theme_id || selectedThemeId, undefined, {
      useWelcome: useWelcomeCredit,
      useEvent: useEventCredit,
    });
  };

  // STEP 2: CONFIRM PAYMENT & ACTIVATE EVENT (SERVER AUTHORITATIVE)
  const handleConfirmPaymentAndActivate = async () => {
    if (!createdEvent) return;
    if (submittingPayment || submittingPaymentRef.current) return;
    submittingPaymentRef.current = true;
    setPaymentError(null);

    let resolvedMode: PaymentMode = 'FULL_PAID';
    if (useWelcomeCredit && useEventCredit) resolvedMode = 'COMBINED_CREDIT';
    else if (useWelcomeCredit) resolvedMode = 'WELCOME_CREDIT';
    else if (useEventCredit) resolvedMode = 'TOPUP_CREDIT';
    else resolvedMode = 'FULL_PAID';

    try {
      setSubmittingPayment(true);

      const res = await apiFetch(`/api/events/${createdEvent.id}/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payment_mode: resolvedMode,
          use_welcome_credit: useWelcomeCredit,
          use_event_credit: useEventCredit,
          useWelcomeCredit: useWelcomeCredit,
          useEventCredit: useEventCredit,
          topup_credit_requested: eventCreditUsed,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        const formattedErr = formatEventErrorMessage(errData, res.status);
        if (res.status === 402 || errData.code === 'INSUFFICIENT_BALANCE') {
          setPaymentError(formattedErr);
          fetchWalletAndQuote(createdEvent.game_theme_id, resolvedMode, {
            useWelcome: useWelcomeCredit,
            useEvent: useEventCredit,
          });
          return;
        }
        throw new Error(formattedErr);
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
      submittingPaymentRef.current = false;
      setSubmittingPayment(false);
    }
  };

  // Top-Up flow for insufficient balance
  const handleStartTopUpFlow = async (amountToTopUp: number) => {
    if (!currentOrganization?.id || amountToTopUp <= 0) return;
    if (isSubmittingTopUp || isSubmittingTopUpRef.current) return;
    isSubmittingTopUpRef.current = true;

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
      isSubmittingTopUpRef.current = false;
      setIsSubmittingTopUp(false);
    }
  };

  const handlePaymentSuccessTopUp = async (settledOrder: TopupOrderRecord) => {
    setShowCheckoutModal(false);
    setActiveCheckoutOrder(null);
    setCheckoutSession(null);
    setPaymentError(null);

    await fetchWalletAndQuote(createdEvent?.game_theme_id || selectedThemeId, undefined, {
      useWelcome: useWelcomeCredit,
      useEvent: useEventCredit,
    });

    setTopUpSuccessNotice(
      `Successfully added ${formatCurrency(settledOrder.top_up_amount)} to your wallet! Balance updated.`
    );
    setTimeout(() => setTopUpSuccessNotice(null), 5000);
  };

  // Selected Theme Details
  const selectedTheme = themes.find((t) => t.id === selectedThemeId) || themes[0];
  const eventPrice = Number(activeCalculation?.eventPrice ?? createdEvent?.event_price ?? 0);
  const standardPrice = eventPrice;
  const availableWelcomeCredit = Number(activeCalculation?.availableBalances?.welcome_credit ?? wallet?.welcome_credit ?? 0);
  const availableEventCredit = Number(activeCalculation?.availableBalances?.topup_credit ?? wallet?.topup_credit ?? 0);
  const availablePaidBalance = Number(activeCalculation?.availableBalances?.paid_balance ?? wallet?.paid_balance ?? 0);
  const availableBalance = availablePaidBalance;

  const maxEventCredit = Math.min(availableEventCredit, Math.round(eventPrice * 0.2));
  const eligibleWelcomeCredit = Math.min(availableWelcomeCredit, eventPrice);
  const eligibleEventCredit = Math.min(availableEventCredit, maxEventCredit);

  const welcomeCreditUsed = useWelcomeCredit && availableWelcomeCredit > 0 ? eligibleWelcomeCredit : 0;
  const remainingPriceAfterWelcome = Math.max(0, eventPrice - welcomeCreditUsed);
  const eventCreditUsed = useEventCredit && availableEventCredit > 0 ? Math.min(eligibleEventCredit, remainingPriceAfterWelcome) : 0;

  const totalDiscount = welcomeCreditUsed + eventCreditUsed;
  const amountRequired = Math.max(0, eventPrice - totalDiscount);
  const shortfall = Math.max(0, amountRequired - availablePaidBalance);
  const isInsufficientBalance = !loadingQuote && !quoteError && wallet !== null && shortfall > 0;
  const needAmount = shortfall;
  const paidAmount = amountRequired;

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
                  <h2 className="text-xl font-bold text-slate-100">{t('event.createEvent', undefined, 'Create Event')}</h2>
                  <p className="text-xs text-slate-400">{t('event.description', undefined, 'Create and store your event deployment before payment')}</p>
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
                <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-rose-400">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{creationError.replace(/^THEME_SETUP_REQUIRED:\s*/, '')}</span>
                  </div>
                  {creationError.includes('Theme setup') && (
                    <button
                      type="button"
                      onClick={() => {
                        handleClose();
                        navigateTo('/theme-setup');
                      }}
                      className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold shrink-0 transition-colors cursor-pointer"
                    >
                      {t('event.setUpTheme', undefined, 'Set Up Theme')}
                    </button>
                  )}
                </div>
              )}

              {/* 1. Event Name */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-300">
                  {t('event.eventName', undefined, 'Event Name')} <span className="text-amber-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t('event.namePlaceholder')}
                  className="w-full px-4 py-3 bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-xl text-slate-100 text-sm focus:outline-none transition-all placeholder:text-slate-600"
                />
              </div>

              {/* 2. Select Game & Theme (Split into two cascading dropdowns) */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-300">
                    {t('event.selectGame', undefined, 'Game & Theme Selection')} <span className="text-amber-400">*</span>
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
                    <span>{t('common.loading', undefined, 'Loading registered games and themes...')}</span>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    {/* 1st Dropdown: Game Engine */}
                    <div className="space-y-1.5">
                      <label htmlFor="event-game-dropdown" className="text-[11px] font-semibold text-slate-300 flex items-center gap-1.5">
                        {getGameTypeIcon(games.find((g) => g.id === selectedGameId)?.game_type || games.find((g) => g.id === selectedGameId)?.icon_name || games.find((g) => g.id === selectedGameId)?.slug, 'w-3.5 h-3.5 text-amber-400')}
                        <span>1. {t('event.selectGame', undefined, 'Select Game Engine')}</span>
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
                            <option value="">{t('game.noThemesFound', undefined, 'No registered games found')}</option>
                          ) : (
                            games.map((g) => (
                              <option key={g.id} value={g.id} className="bg-slate-900 text-slate-100 py-1">
                                {g.name}
                              </option>
                            ))
                          )}
                        </select>
                        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                          {getGameTypeIcon(games.find((g) => g.id === selectedGameId)?.game_type || games.find((g) => g.id === selectedGameId)?.icon_name || games.find((g) => g.id === selectedGameId)?.slug, 'w-4 h-4 text-amber-400')}
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
                          <span>2. {t('event.selectTheme', undefined, 'Select Theme')}</span>
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
                            <option value="">{t('event.selectGame', undefined, 'Select a game first')}</option>
                          ) : themes.filter((t) => t.game_id === selectedGameId).length === 0 ? (
                            <option value="">{t('game.noThemesFound', undefined, 'No active themes for this game')}</option>
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
                        <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-center justify-between gap-3 text-xs">
                          <div className="flex items-center gap-2 text-amber-300">
                            <Palette className="w-4 h-4 text-amber-400 shrink-0" />
                            <span>{t('event.themeRequiredNotice', undefined, 'Theme setup required before creating an event.')}</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              handleClose();
                              navigateTo('/theme-setup');
                            }}
                            className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-lg shrink-0 cursor-pointer"
                          >
                            {t('event.setUpTheme', undefined, 'Set Up Theme')}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* 3. Event Schedule & Duration */}
              <div className="space-y-3">
                <label className="text-xs font-bold text-slate-300">
                  {t('event.dateRange', undefined, 'Event Schedule (Date Only)')} <span className="text-amber-400">*</span>
                </label>

                {/* Duration Presets */}
                <div className="grid grid-cols-5 gap-1.5">
                  {(['1day', '2days', '3days', '7days', 'custom'] as DurationPreset[]).map((preset) => {
                    const isSelected = durationPreset === preset;
                    const labels: Record<DurationPreset, string> = {
                      '1day': '1 ' + t('common.days', undefined, 'Day'),
                      '2days': '2 ' + t('common.days', undefined, 'Days'),
                      '3days': '3 ' + t('common.days', undefined, 'Days'),
                      '7days': '7 ' + t('common.days', undefined, 'Days'),
                      'custom': t('common.custom', undefined, 'Custom'),
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
                    <span className="text-[11px] text-slate-400 font-medium flex items-center justify-between">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5 text-amber-400" /> {t('event.startDate', undefined, 'Start Date')}
                      </span>
                      {startDate && (
                        <span className="text-[11px] text-amber-300 font-mono font-semibold">
                          {formatDateDisplay(startDate)}
                        </span>
                      )}
                    </span>
                    <CustomDatePicker
                      required
                      value={startDate}
                      onChange={(newStart) => {
                        setStartDate(newStart);
                        if (durationPreset !== 'custom') {
                          handleDurationPresetChange(durationPreset, newStart);
                        }
                      }}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <span className="text-[11px] text-slate-400 font-medium flex items-center justify-between">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5 text-amber-400" /> {t('event.endDate', undefined, 'End Date')}
                      </span>
                      {endDate && (
                        <span className="text-[11px] text-amber-300 font-mono font-semibold">
                          {formatDateDisplay(endDate)}
                        </span>
                      )}
                    </span>
                    <CustomDatePicker
                      required
                      disabled={durationPreset !== 'custom'}
                      min={startDate}
                      value={endDate}
                      onChange={(newEnd) => setEndDate(newEnd)}
                      className={
                        durationPreset === 'custom' && isEndDateBeforeStartDate
                          ? 'border-rose-500/60 focus:border-rose-500'
                          : ''
                      }
                    />
                  </div>
                </div>

                {/* Inline Date & Duration Validation Messages */}
                {isEndDateBeforeStartDate && (
                  <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center gap-2 text-xs text-rose-400">
                    <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                    <span>{t('event.dateRangeInvalid')}</span>
                  </div>
                )}

                {startDate && endDate && !isEndDateBeforeStartDate && (
                  <p className="text-[11px] text-slate-400 font-medium">
                    Active for whole calendar day{startDate === endDate ? '' : 's'} ({currentDurationDays} day{currentDurationDays === 1 ? '' : 's'}): <span className="text-amber-300 font-bold">{formatEventDateRange(startDate, endDate)}</span>
                  </p>
                )}

                <div className="space-y-1.5 pt-1">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-bold text-slate-300">
                      {t('event.timezone', undefined, 'Event Timezone')}
                    </label>
                    <span className="text-[10px] text-slate-500">
                      {t('event.evaluatesTimezone')}
                    </span>
                  </div>
                  <div className="relative">
                    <select
                      value={eventTimezone}
                      onChange={(e) => setEventTimezone(e.target.value)}
                      className="w-full appearance-none bg-slate-950/80 border border-slate-800 focus:border-amber-500 text-slate-100 px-3.5 py-2.5 rounded-xl text-xs focus:outline-none pr-8 cursor-pointer"
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

              {/* Informative Note */}
              <div className="bg-slate-950/60 border border-slate-800/80 rounded-2xl p-4 space-y-1.5 text-xs text-slate-400">
                <div className="flex items-center gap-2 text-slate-200 font-semibold">
                  <Sparkles className="w-4 h-4 text-amber-400" />
                  <span>{t('event.instantUrlCreation')}</span>
                </div>
                <p className="text-[11px] leading-relaxed">
                  {t('event.instantUrlCreationDesc')}
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
                {t('common.cancel', undefined, 'Cancel')}
              </button>
              <button
                type="submit"
                disabled={!name.trim() || isCreatingEvent || !selectedThemeId || themes.length === 0 || isDateRangeInvalid}
                className="px-6 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed text-slate-950 font-bold text-sm shadow-md transition-all cursor-pointer flex items-center gap-2"
              >
                {isCreatingEvent ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>{t('event.createEvent', undefined, 'Creating Event...')}</span>
                  </>
                ) : (
                  <>
                    <span>{t('event.createEvent', undefined, 'Create Event')}</span>
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
              <h2 className="text-2xl font-black text-slate-100 tracking-tight">{t('event.statusDraft', undefined, 'Event Created (Draft)')}</h2>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                {t('event.description', undefined, 'Your event has been saved as a Draft with a private preview link.')}
              </p>
            </div>

            {/* Event Details Card */}
            <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-5 space-y-3 text-xs">
              <div className="flex items-center justify-between border-b border-slate-900 pb-2.5">
                <span className="text-slate-400">{t('event.eventName', undefined, 'Event Name')}:</span>
                <span className="font-bold text-slate-100">{createdEvent.name}</span>
              </div>
              <div className="flex items-center justify-between border-b border-slate-900 pb-2.5">
                <span className="text-slate-400">{t('event.selectGame', undefined, 'Game / Theme')}:</span>
                <span className="font-semibold text-amber-300">
                  {selectedTheme?.game_name || 'Game'} / {selectedTheme?.name || 'Theme'}
                </span>
              </div>
              <div className="flex items-center justify-between border-b border-slate-900 pb-2.5">
                <span className="text-slate-400">{t('event.dateRange', undefined, 'Scheduled Duration')}:</span>
                <span className="font-bold text-slate-200">
                  {calculateEventCalendarDays(createdEvent.start_date || startDate, createdEvent.end_date || endDate)} {t('common.days', undefined, 'calendar days')}
                  {createdEvent.start_date && (
                    <span className="text-[11px] font-normal text-slate-400 ml-1.5">
                      ({formatDateDisplay(createdEvent.start_date)} to {formatDateDisplay(createdEvent.end_date || createdEvent.start_date)})
                    </span>
                  )}
                </span>
              </div>
              <div className="flex items-center justify-between border-b border-slate-900 pb-2.5">
                <span className="text-slate-400">{t('event.priceQuote', undefined, 'Event Price')}:</span>
                <span className="font-mono font-bold text-amber-400">
                  {createdEvent.event_price
                    ? formatCurrency(createdEvent.event_price)
                    : standardPrice !== null
                    ? formatCurrency(standardPrice)
                    : loadingQuote
                    ? t('common.loading', undefined, 'Calculating quote...')
                    : 'Pending Quote'}
                </span>
              </div>
              <div className="flex items-center justify-between border-b border-slate-900 pb-2.5">
                <span className="text-slate-400">{t('event.status', undefined, 'Event Status')}:</span>
                <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700 font-bold text-[10px] uppercase">
                  {createdEvent.event_status || 'DRAFT'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">{t('event.paymentStatus', undefined, 'Payment Status')}:</span>
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
                  <span>{t('event.previewGame', undefined, 'Private Preview URL')}</span>
                </span>
                <span className="text-[10px] text-purple-400 font-medium">{t('event.ownerTesterOnly')}</span>
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
                      <span className="text-emerald-400">{t('common.copied', undefined, 'Copied')}</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>{t('common.copy', undefined, 'Copy Preview')}</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Clear Payment Required Notice */}
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4 flex items-start gap-3 text-xs text-amber-200">
              <AlertCircle className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
              <div className="space-y-1">
                <p className="font-bold text-amber-300">{t('event.publicUrlAfterPayment')}</p>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  {t('event.publicUrlAfterPaymentDesc')}
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
                <span>{t('event.payToActivate', undefined, 'Pay & Activate Event')}</span>
              </button>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => window.open(previewUrl, '_blank')}
                  className="py-2.5 px-4 rounded-xl bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/40 text-purple-200 font-bold text-xs transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <Gamepad2 className="w-3.5 h-3.5 text-purple-400" />
                  <span>{t('event.previewGame', undefined, 'Test Play Preview')}</span>
                </button>

                <button
                  type="button"
                  onClick={handleClose}
                  className="py-2.5 px-4 rounded-xl border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-slate-200 text-xs font-semibold transition-colors cursor-pointer text-center"
                >
                  {t('common.save', undefined, 'Save as Draft')}
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
                  title={t('common.back', undefined, 'Back to Event Summary')}
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <div>
                  <h2 className="text-xl font-bold text-slate-100">{t('event.payToActivate', undefined, 'Pay & Activate')}</h2>
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
                  {getGameTypeIcon(games.find((g) => g.id === selectedGameId)?.game_type || games.find((g) => g.id === selectedGameId)?.icon_name || selectedTheme?.game_slug, 'w-3.5 h-3.5 text-amber-400')}
                  <span>{games.find((g) => g.id === selectedGameId)?.name || selectedTheme?.game_name || 'Event Game'}</span>
                  <span>•</span>
                  <span>{selectedTheme?.name || 'Theme'}</span>
                </div>
              </div>

              {/* Pricing & Quote */}
              {loadingQuote ? (
                <div className="bg-slate-950/50 border border-slate-800 rounded-2xl p-6 flex items-center justify-center gap-2 text-xs text-slate-400">
                  <RefreshCw className="w-4 h-4 animate-spin text-amber-400" />
                  <span>{t('common.loading', undefined, 'Calculating payment quote...')}</span>
                </div>
              ) : quoteError ? (
                <div className="bg-rose-500/10 border border-rose-500/20 rounded-2xl p-4 text-xs text-rose-400 flex items-center justify-between">
                  <span>{quoteError}</span>
                  <button
                    type="button"
                    onClick={() => fetchWalletAndQuote(createdEvent?.game_theme_id, selectedPaymentMode)}
                    className="underline text-rose-300 font-bold ml-2 cursor-pointer"
                  >
                    {t('common.retry', undefined, 'Retry')}
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Apply Credits Section */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-slate-300">{t('payment.credits', undefined, 'Apply Credits')}</label>
                      <span className="text-[11px] text-slate-400">{t('payment.selectCreditsNotice')}</span>
                    </div>

                    <div className="space-y-2">
                      {/* Welcome Credit Checkbox */}
                      {availableWelcomeCredit > 0 ? (
                        <div
                          onClick={() => {
                            const next = !useWelcomeCredit;
                            setUseWelcomeCredit(next);
                            fetchWalletAndQuote(createdEvent?.game_theme_id || selectedThemeId, undefined, {
                              useWelcome: next,
                              useEvent: useEventCredit,
                            });
                          }}
                          className={`p-3.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-3 select-none ${
                            useWelcomeCredit
                              ? 'border-emerald-500/50 bg-emerald-500/10 ring-1 ring-emerald-500/20'
                              : 'border-slate-800 bg-slate-950/60 hover:border-slate-700'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <input
                              type="checkbox"
                              checked={useWelcomeCredit}
                              onChange={(e) => {
                                e.stopPropagation();
                                const next = e.target.checked;
                                setUseWelcomeCredit(next);
                                fetchWalletAndQuote(createdEvent?.game_theme_id || selectedThemeId, undefined, {
                                  useWelcome: next,
                                  useEvent: useEventCredit,
                                });
                              }}
                              className="w-4 h-4 rounded border-slate-700 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-slate-950 bg-slate-900 cursor-pointer"
                            />
                            <div>
                              <div className="font-bold text-xs text-slate-200 flex items-center gap-1.5">
                                <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                                <span>{t('payment.welcomeCredits', undefined, 'Welcome Credit')}</span>
                              </div>
                              <div className="text-[11px] text-slate-400 mt-0.5">
                                Available: <span className="font-mono text-slate-300">{formatCurrency(availableWelcomeCredit)}</span>
                              </div>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-xs font-mono font-bold text-emerald-400">
                              {useWelcomeCredit ? `-${formatCurrency(eligibleWelcomeCredit)}` : 'Deselected'}
                            </div>
                            <div className="text-[10px] text-slate-400">
                              {useWelcomeCredit ? t('payment.appliedToPrice') : t('payment.clickToApply')}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="p-3 rounded-xl border border-slate-800/60 bg-slate-950/30 flex items-center justify-between text-xs text-slate-400">
                          <span className="flex items-center gap-1.5">
                            <Sparkles className="w-3.5 h-3.5 text-slate-400" />
                            {t('payment.welcomeCredits', undefined, 'Welcome Credit')}
                          </span>
                          <span className="text-[11px]">{formatCurrency(0)} {t('common.available')}</span>
                        </div>
                      )}

                      {/* Event Credit Checkbox */}
                      {availableEventCredit > 0 ? (
                        <div
                          onClick={() => {
                            const next = !useEventCredit;
                            setUseEventCredit(next);
                            fetchWalletAndQuote(createdEvent?.game_theme_id || selectedThemeId, undefined, {
                              useWelcome: useWelcomeCredit,
                              useEvent: next,
                            });
                          }}
                          className={`p-3.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-3 select-none ${
                            useEventCredit
                              ? 'border-blue-500/50 bg-blue-500/10 ring-1 ring-blue-500/20'
                              : 'border-slate-800 bg-slate-950/60 hover:border-slate-700'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <input
                              type="checkbox"
                              checked={useEventCredit}
                              onChange={(e) => {
                                e.stopPropagation();
                                const next = e.target.checked;
                                setUseEventCredit(next);
                                fetchWalletAndQuote(createdEvent?.game_theme_id || selectedThemeId, undefined, {
                                  useWelcome: useWelcomeCredit,
                                  useEvent: next,
                                });
                              }}
                              className="w-4 h-4 rounded border-slate-700 text-blue-500 focus:ring-blue-500 focus:ring-offset-slate-950 bg-slate-900 cursor-pointer"
                            />
                            <div>
                              <div className="font-bold text-xs text-slate-200 flex items-center gap-1.5">
                                <Sparkles className="w-3.5 h-3.5 text-blue-400" />
                                <span>{t('payment.credits', undefined, 'Event Credit')}</span>
                              </div>
                              <div className="text-[11px] text-slate-400 mt-0.5">
                                Available: <span className="font-mono text-slate-300">{formatCurrency(availableEventCredit)}</span> (max 20%: {formatCurrency(maxEventCredit)})
                              </div>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-xs font-mono font-bold text-blue-400">
                              {useEventCredit ? `-${formatCurrency(eligibleEventCredit)}` : 'Deselected'}
                            </div>
                            <div className="text-[10px] text-slate-400">
                              {useEventCredit ? t('payment.appliedToPrice') : t('payment.clickToApply')}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="p-3 rounded-xl border border-slate-800/60 bg-slate-950/30 flex items-center justify-between text-xs text-slate-400">
                          <span className="flex items-center gap-1.5">
                            <Sparkles className="w-3.5 h-3.5 text-slate-400" />
                            {t('payment.credits', undefined, 'Event Credit')}
                          </span>
                          <span className="text-[11px]">{formatCurrency(0)} {t('common.available')}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Itemized Payment Summary */}
                  <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-4 space-y-2.5 text-xs">
                    <div className="flex items-center justify-between text-slate-300">
                      <span>{t('event.priceQuote', undefined, 'Event Price')}</span>
                      <span className="font-mono font-bold">
                        {formatCurrency(eventPrice)}
                      </span>
                    </div>

                    {welcomeCreditUsed > 0 && (
                      <div className="flex items-center justify-between text-emerald-400">
                        <span className="flex items-center gap-1">
                          <Sparkles className="w-3.5 h-3.5" />
                          {t('payment.welcomeCredits', undefined, 'Welcome Credit Applied')}
                        </span>
                        <span className="font-mono font-bold">-{formatCurrency(welcomeCreditUsed)}</span>
                      </div>
                    )}

                    {eventCreditUsed > 0 && (
                      <div className="flex items-center justify-between text-blue-400">
                        <span className="flex items-center gap-1">
                          <Sparkles className="w-3.5 h-3.5" />
                          {t('payment.credits', undefined, 'Event Credit Applied')}
                        </span>
                        <span className="font-mono font-bold">-{formatCurrency(eventCreditUsed)}</span>
                      </div>
                    )}

                    <div className="flex items-center justify-between pt-2 border-t border-slate-800 font-semibold text-slate-100">
                      <span>{t('payment.totalAmount', undefined, 'Amount Required')}</span>
                      <span className="font-mono font-bold text-amber-400 text-sm">
                        {formatCurrency(amountRequired)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between pt-1 border-t border-slate-900 text-slate-400">
                      <span className="flex items-center gap-1.5">
                        <Wallet className="w-3.5 h-3.5" />
                        {t('payment.balance', undefined, 'Available Paid Balance')}
                      </span>
                      <span className="font-mono font-bold text-slate-200">
                        {formatCurrency(availablePaidBalance)}
                      </span>
                    </div>

                    {shortfall > 0 && (
                      <div className="flex items-center justify-between pt-1 border-t border-slate-900 text-amber-300 font-medium">
                        <span>{t('payment.finalPrice', undefined, 'Additional Payment Required')}</span>
                        <span className="font-mono font-bold text-amber-400">
                          {formatCurrency(shortfall)}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Insufficient balance top-up box */}
                  {isInsufficientBalance && (
                    <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 space-y-3">
                      <div className="flex items-center gap-2 text-xs font-bold text-amber-400">
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        <span>{t('payment.insufficientFunds', undefined, 'Insufficient Balance')}</span>
                      </div>
                      <p className="text-xs text-slate-300">
                        You need <span className="font-mono font-bold text-amber-300">{formatCurrency(shortfall)}</span> more to activate this event.
                      </p>
                      <button
                        type="button"
                        disabled={isSubmittingTopUp || shortfall <= 0}
                        onClick={() => {
                          if (shortfall > 0) {
                            handleStartTopUpFlow(shortfall);
                          }
                        }}
                        className="w-full py-2.5 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-sm cursor-pointer"
                      >
                        {isSubmittingTopUp ? (
                          <>
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            <span>{t('common.loading', undefined, 'Connecting to Gateway...')}</span>
                          </>
                        ) : (
                          <>
                            <PlusCircle className="w-3.5 h-3.5" />
                            <span>{t('payment.topUp', undefined, 'Top Up')} {formatCurrency(shortfall)}</span>
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
                {t('common.back', undefined, 'Back')}
              </button>

              <button
                type="button"
                disabled={submittingPayment || isInsufficientBalance || loadingQuote || !!quoteError || eventPrice <= 0}
                onClick={handleConfirmPaymentAndActivate}
                className="px-6 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed text-slate-950 font-bold text-sm shadow-md transition-all cursor-pointer flex items-center gap-2"
              >
                {submittingPayment ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>{t('common.loading', undefined, 'Processing Payment...')}</span>
                  </>
                ) : (
                  <>
                    <span>
                      {amountRequired === 0 ? t('event.activateNow', undefined, 'Activate Event (RM0.00)') : `${t('event.payToActivate', undefined, 'Pay')} ${formatCurrency(amountRequired)} & ${t('event.activateNow', undefined, 'Activate')}`}
                    </span>
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
              <h2 className="text-2xl font-black text-slate-100">{t('payment.paymentSuccessful', undefined, 'Event Activated & Live!')}</h2>
              <p className="text-xs text-slate-400">{t('event.paymentConfirmedLive')}</p>
            </div>

            {/* Public Link Box */}
            <div className="space-y-2 text-left max-w-sm mx-auto w-full">
              <label className="text-xs font-bold text-slate-300 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <ExternalLink className="w-3.5 h-3.5 text-emerald-400" />
                  <span>{t('event.publicUrl', undefined, 'Public Game URL')}</span>
                </span>
                <span className="text-[10px] text-emerald-400 font-bold uppercase">{t('event.statusLive', undefined, 'LIVE')}</span>
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
                      <span className="text-emerald-400">{t('common.copied', undefined, 'Copied')}</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>{t('common.copy', undefined, 'Copy')}</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-5 text-left text-xs space-y-2.5 max-w-sm mx-auto w-full">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">{t('event.eventName', undefined, 'Event')}</span>
                <span className="font-bold text-slate-100">{activatedEvent?.name || createdEvent?.name}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">{t('event.status', undefined, 'Event Status')}</span>
                <span className="font-bold text-emerald-400 uppercase">{t('event.statusLive', undefined, 'LIVE')}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">{t('event.paymentStatus', undefined, 'Payment Status')}</span>
                <span className="font-bold text-emerald-400 uppercase">{t('event.paymentPaid', undefined, 'PAID')}</span>
              </div>
              <div className="flex items-center justify-between border-t border-slate-900 pt-2">
                <span className="text-slate-400">{t('payment.amount', undefined, 'Paid Amount')}</span>
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
                <span>{t('event.openLiveUrl', undefined, 'Open Live Game')}</span>
              </button>

              <button
                type="button"
                onClick={handleClose}
                className="py-3 px-4 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs shadow-xl transition-all cursor-pointer flex items-center justify-center gap-1.5"
              >
                <span>{t('common.done', undefined, 'Done')}</span>
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
