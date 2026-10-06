import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useLocalization } from '../../context/LocalizationContext';
import { apiFetch } from '../../lib/api';
import { PlatformPricingSettings, AdminEventPricingItem, EventPricingRule, PlatformGame } from '../../types/developer';
import { calculateEventCalendarDays } from '../../lib/dateUtils';
import { CustomDatePicker } from '../common/CustomDatePicker';
import { DeveloperGamePricingManager } from './DeveloperGamePricingManager';
import { getGameTypeIcon } from '../../games';
import { navigateTo } from '../../hooks/useRouteContext';
import {
  Coins,
  DollarSign,
  Tag,
  Edit3,
  Check,
  RefreshCw,
  Search,
  AlertCircle,
  TrendingUp,
  Layers,
  Sparkles,
  Building2,
  Calendar,
  CreditCard,
  ShieldCheck,
  Sliders,
  X,
  History,
  Info,
  Plus,
  Trash2,
  Clock,
  ArrowRight,
  Calculator,
  CheckCircle2,
  Gamepad2,
} from 'lucide-react';

const DEFAULT_RULE_TEMPLATES: EventPricingRule[] = [
  { id: 'rule_1d', min_days: 1, max_days: 1, price: 1400, currency: 'MYR', active: true },
  { id: 'rule_2d', min_days: 2, max_days: 2, price: 1900, currency: 'MYR', active: true },
  { id: 'rule_3d', min_days: 3, max_days: 3, price: 2200, currency: 'MYR', active: true },
  { id: 'rule_4_7d', min_days: 4, max_days: 7, price: 2800, currency: 'MYR', active: true },
  { id: 'rule_8_14d', min_days: 8, max_days: 14, price: 3500, currency: 'MYR', active: true },
  { id: 'rule_15_30d', min_days: 15, max_days: 30, price: 4800, currency: 'MYR', active: true },
  { id: 'rule_31_60d', min_days: 31, max_days: 60, price: 7200, currency: 'MYR', active: true },
  { id: 'rule_61_90d', min_days: 61, max_days: 90, price: 9500, currency: 'MYR', active: true },
  { id: 'rule_91plus', min_days: 91, max_days: null, price: 12000, currency: 'MYR', active: true },
];

export const DeveloperPricingManager: React.FC = () => {
  const { t } = useLocalization();
  const [pricingSettings, setPricingSettings] = useState<PlatformPricingSettings>({
    default_price: 1400,
    default_currency: 'MYR',
    pricing_rules: DEFAULT_RULE_TEMPLATES,
  });
  const [events, setEvents] = useState<AdminEventPricingItem[]>([]);
  const [games, setGames] = useState<PlatformGame[]>([]);
  const [selectedGameId, setSelectedGameId] = useState<string>('');
  const [pricingTab, setPricingTab] = useState<'games' | 'events' | 'legacy'>('games');
  const [loading, setLoading] = useState<boolean>(true);
  const [savingSettings, setSavingSettings] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Default Price Edit State
  const [isEditingDefault, setIsEditingDefault] = useState<boolean>(false);
  const [tempDefaultPrice, setTempDefaultPrice] = useState<string>('');
  const [tempDefaultCurrency, setTempDefaultCurrency] = useState<string>('MYR');

  // Pricing Rules Edit / Modal State
  const [pricingRules, setPricingRules] = useState<EventPricingRule[]>(DEFAULT_RULE_TEMPLATES);
  const [isAddingRule, setIsAddingRule] = useState<boolean>(false);
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [ruleFormMinDays, setRuleFormMinDays] = useState<string>('1');
  const [ruleFormMaxDays, setRuleFormMaxDays] = useState<string>('1');
  const [ruleFormIsUnlimited, setRuleFormIsUnlimited] = useState<boolean>(false);
  const [ruleFormPrice, setRuleFormPrice] = useState<string>('');
  const [ruleFormCurrency, setRuleFormCurrency] = useState<string>('MYR');
  const [ruleFormActive, setRuleFormActive] = useState<boolean>(true);

  // Simulator State
  const [simStartDate, setSimStartDate] = useState<string>(() => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  });
  const [simEndDate, setSimEndDate] = useState<string>(() => {
    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 6);
    return nextWeek.toISOString().split('T')[0];
  });

  // Event Price Edit Modal State
  const [selectedEvent, setSelectedEvent] = useState<AdminEventPricingItem | null>(null);
  const [tempEventPrice, setTempEventPrice] = useState<string>('');
  const [tempEventCurrency, setTempEventCurrency] = useState<string>('MYR');
  const [savingEventPrice, setSavingEventPrice] = useState<boolean>(false);

  // Reactivate & Maintenance states
  const [reactivatingId, setReactivatingId] = useState<string | null>(null);
  const [runningMaintenance, setRunningMaintenance] = useState<boolean>(false);

  // Filter & Search
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [pricingTypeFilter, setPricingTypeFilter] = useState<'all' | 'custom' | 'default'>('all');

  const getHeaders = useCallback(() => {
    const token = localStorage.getItem('app_token');
    return {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [settingsRes, eventsRes, gamesRes] = await Promise.all([
        apiFetch('/api/developer/pricing/settings', { headers: getHeaders() }),
        apiFetch('/api/developer/events', { headers: getHeaders() }),
        apiFetch('/api/developer/games', { headers: getHeaders() }),
      ]);

      if (gamesRes.ok) {
        const data = await gamesRes.json();
        if (Array.isArray(data.games)) {
          setGames(data.games);
          setSelectedGameId((prev) => {
            if (prev && data.games.some((g: PlatformGame) => g.id === prev)) return prev;
            return data.games[0]?.id || '';
          });
        }
      }

      if (settingsRes.ok) {
        const data = await settingsRes.json();
        if (data.settings) {
          setPricingSettings(data.settings);
          setTempDefaultPrice(String(data.settings.default_price));
          setTempDefaultCurrency(data.settings.default_currency || 'MYR');
          if (data.settings.pricing_rules && Array.isArray(data.settings.pricing_rules) && data.settings.pricing_rules.length > 0) {
            setPricingRules(data.settings.pricing_rules);
          } else {
            setPricingRules(DEFAULT_RULE_TEMPLATES);
          }
        }
      }

      if (eventsRes.ok) {
        const data = await eventsRes.json();
        setEvents(data.events || []);
      } else {
        const err = await eventsRes.json().catch(() => ({}));
        setError(err.error || 'Failed to load events');
      }
    } catch (err: any) {
      console.error('Error fetching admin pricing data:', err);
      setError(err.message || 'Network error fetching pricing configuration');
    } finally {
      setLoading(false);
    }
  }, [getHeaders]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Handle updating platform default base price
  const handleSaveDefaultPricing = async (e: React.FormEvent) => {
    e.preventDefault();
    const priceNum = parseFloat(tempDefaultPrice);
    if (isNaN(priceNum) || priceNum <= 0) {
      setError('Platform default price must be a positive number greater than 0');
      return;
    }

    setSavingSettings(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const res = await apiFetch('/api/developer/pricing/settings', {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify({
          default_price: priceNum,
          default_currency: tempDefaultCurrency.trim().toUpperCase() || 'MYR',
          pricing_rules: pricingRules,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || data.message || 'Failed to update platform pricing');
      }

      setPricingSettings(data.settings);
      setIsEditingDefault(false);
      setSuccessMsg(`Platform default price updated to ${data.settings.default_currency} ${data.settings.default_price.toFixed(2)}`);
      setTimeout(() => setSuccessMsg(null), 5000);
      fetchData();
    } catch (err: any) {
      setError(err.message || 'Failed to update platform default pricing');
    } finally {
      setSavingSettings(false);
    }
  };

  // Rule Helpers & Validation
  const formatRuleRange = (rule: EventPricingRule) => {
    if (rule.max_days === null) {
      return t('developer.calendarDaysPlus', { count: rule.min_days });
    }
    if (rule.min_days === rule.max_days) {
      return t('developer.calendarDaysCount', { count: rule.min_days });
    }
    return `${rule.min_days} - ${rule.max_days} ${t('developer.calendarDaysCount', { count: rule.max_days })}`;
  };

  const handleSavePricingRules = async (rulesToSave: EventPricingRule[]) => {
    setSavingSettings(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const res = await apiFetch('/api/developer/pricing/settings', {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify({
          default_price: pricingSettings.default_price,
          default_currency: pricingSettings.default_currency,
          pricing_rules: rulesToSave,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || data.message || 'Failed to save duration pricing rules');
      }

      setPricingSettings(data.settings);
      setPricingRules(data.settings.pricing_rules || rulesToSave);
      setSuccessMsg('Duration-based pricing tiers successfully updated and saved.');
      setTimeout(() => setSuccessMsg(null), 5000);
      fetchData();
    } catch (err: any) {
      setError(err.message || 'Failed to update duration pricing rules');
    } finally {
      setSavingSettings(false);
    }
  };

  const handleToggleRuleActive = (ruleId: string) => {
    const updated = pricingRules.map((r) => (r.id === ruleId ? { ...r, active: !r.active } : r));
    setPricingRules(updated);
    handleSavePricingRules(updated);
  };

  const handleDeleteRule = (ruleId: string) => {
    if (pricingRules.length <= 1) {
      setError('You must keep at least one pricing rule tier.');
      return;
    }
    const updated = pricingRules.filter((r) => r.id !== ruleId);
    setPricingRules(updated);
    handleSavePricingRules(updated);
  };

  const handleResetDefaultRules = () => {
    if (window.confirm('Reset all duration pricing rules to standard platform defaults?')) {
      setPricingRules(DEFAULT_RULE_TEMPLATES);
      handleSavePricingRules(DEFAULT_RULE_TEMPLATES);
    }
  };

  const handleOpenAddRule = () => {
    setIsAddingRule(true);
    setEditingRuleId(null);
    setRuleFormMinDays('1');
    setRuleFormMaxDays('1');
    setRuleFormIsUnlimited(false);
    setRuleFormPrice(pricingSettings?.default_price ? String(pricingSettings.default_price) : '');
    setRuleFormCurrency(pricingSettings.default_currency || 'MYR');
    setRuleFormActive(true);
  };

  const handleOpenEditRule = (rule: EventPricingRule) => {
    setIsAddingRule(true);
    setEditingRuleId(rule.id);
    setRuleFormMinDays(String(rule.min_days));
    setRuleFormMaxDays(rule.max_days !== null ? String(rule.max_days) : '');
    setRuleFormIsUnlimited(rule.max_days === null);
    setRuleFormPrice(String(rule.price));
    setRuleFormCurrency(rule.currency || 'MYR');
    setRuleFormActive(rule.active);
  };

  const handleSaveRuleModal = (e: React.FormEvent) => {
    e.preventDefault();
    const min = parseInt(ruleFormMinDays, 10);
    const max = ruleFormIsUnlimited ? null : parseInt(ruleFormMaxDays, 10);
    const price = parseFloat(ruleFormPrice);

    if (isNaN(min) || min < 1) {
      setError('Minimum days must be an integer of 1 or greater.');
      return;
    }
    if (max !== null && (isNaN(max) || max < min)) {
      setError('Maximum days must be greater than or equal to minimum days.');
      return;
    }
    if (isNaN(price) || price <= 0) {
      setError('Rule price must be greater than 0.');
      return;
    }

    const newRule: EventPricingRule = {
      id: editingRuleId || `rule_${Date.now()}`,
      min_days: min,
      max_days: max,
      price: price,
      currency: ruleFormCurrency.trim().toUpperCase() || 'MYR',
      active: ruleFormActive,
      updated_at: new Date().toISOString(),
    };

    let updatedList: EventPricingRule[];
    if (editingRuleId) {
      updatedList = pricingRules.map((r) => (r.id === editingRuleId ? newRule : r));
    } else {
      updatedList = [...pricingRules, newRule];
    }

    // Sort by min_days ascending
    updatedList.sort((a, b) => a.min_days - b.min_days);

    setIsAddingRule(false);
    setEditingRuleId(null);
    setPricingRules(updatedList);
    handleSavePricingRules(updatedList);
  };

  // Simulator Calculations
  const simDurationDays = useMemo(() => {
    if (!simStartDate || !simEndDate) return 1;
    return calculateEventCalendarDays(simStartDate, simEndDate);
  }, [simStartDate, simEndDate]);

  const simMatchedRule = useMemo(() => {
    const activeRules = pricingRules.filter((r) => r.active);
    for (const rule of activeRules) {
      if (rule.max_days === null) {
        if (simDurationDays >= rule.min_days) return rule;
      } else {
        if (simDurationDays >= rule.min_days && simDurationDays <= rule.max_days) return rule;
      }
    }
    return null;
  }, [pricingRules, simDurationDays]);

  const simQuotePrice = simMatchedRule ? simMatchedRule.price : pricingSettings.default_price;
  const simCurrency = simMatchedRule ? simMatchedRule.currency : pricingSettings.default_currency;

  // Open Edit Event Modal
  const handleOpenEditEvent = (event: AdminEventPricingItem) => {
    setSelectedEvent(event);
    const duration = event.duration_days || calculateEventCalendarDays(event.start_date, event.end_date);
    const matchedRule = pricingRules.find(
      (r) => r.active && duration >= r.min_days && (r.max_days === null || duration <= r.max_days)
    );
    const resolvedPrice = event.effective_price ?? event.event_price ?? (matchedRule ? matchedRule.price : (pricingSettings?.default_price ?? ''));
    setTempEventPrice(String(resolvedPrice || ''));
    setTempEventCurrency(event.event_currency || pricingSettings?.default_currency || 'MYR');
  };

  // Handle saving individual event custom price
  const handleSaveEventPricing = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEvent) return;

    const priceNum = parseFloat(tempEventPrice);
    if (isNaN(priceNum) || priceNum <= 0) {
      setError('Event price must be a positive number greater than 0');
      return;
    }

    setSavingEventPrice(true);
    setError(null);

    try {
      const res = await apiFetch(`/api/developer/events/${selectedEvent.id}/pricing`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify({
          event_price: priceNum,
          event_currency: tempEventCurrency.trim().toUpperCase() || 'MYR',
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || data.message || 'Failed to update event price');
      }

      setSuccessMsg(data.message || `Event price updated to ${data.event.event_currency || 'MYR'} ${(data.event.event_price || priceNum).toFixed(2)}`);
      setTimeout(() => setSuccessMsg(null), 5000);
      setSelectedEvent(null);
      fetchData();
    } catch (err: any) {
      setError(err.message || 'Failed to update event pricing');
    } finally {
      setSavingEventPrice(false);
    }
  };

  // Reactivate event
  const handleReactivateEvent = async (eventId: string, eventName: string) => {
    const confirmReactivate = window.confirm(
      `Are you sure you want to manually reactivate event "${eventName}"?\n\nThis will restore the event status to LIVE (or DRAFT if unpaid) and clear any cancellation reason.`
    );
    if (!confirmReactivate) return;

    setReactivatingId(eventId);
    setError(null);
    try {
      const res = await apiFetch(`/api/developer/events/${eventId}/reactivate`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          reason: 'Manual developer admin reactivation',
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to reactivate event');
      }

      setSuccessMsg(data.message || `Event "${eventName}" successfully reactivated.`);
      setTimeout(() => setSuccessMsg(null), 5000);
      fetchData();
    } catch (err: any) {
      setError(err.message || 'Failed to reactivate event');
    } finally {
      setReactivatingId(null);
    }
  };

  // Trigger maintenance worker
  const handleRunMaintenance = async () => {
    setRunningMaintenance(true);
    setError(null);
    try {
      const res = await apiFetch('/api/developer/events/maintenance', {
        method: 'POST',
        headers: getHeaders(),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to run maintenance job');
      }

      setSuccessMsg(data.message || 'Lifecycle maintenance completed successfully.');
      setTimeout(() => setSuccessMsg(null), 6000);
      fetchData();
    } catch (err: any) {
      setError(err.message || 'Failed to trigger maintenance');
    } finally {
      setRunningMaintenance(false);
    }
  };

  // Filtered events
  const filteredEvents = events.filter((ev) => {
    const matchesSearch =
      ev.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (ev.organization_name && ev.organization_name.toLowerCase().includes(searchTerm.toLowerCase())) ||
      ev.slug.toLowerCase().includes(searchTerm.toLowerCase());

    const effectiveEventStatus = (ev.event_status || ev.status || '').toUpperCase();
    const effectivePaymentStatus = (ev.payment_status || 'UNPAID').toUpperCase();

    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'paid' && effectivePaymentStatus === 'PAID') ||
      (statusFilter === 'unpaid' && effectivePaymentStatus !== 'PAID') ||
      (statusFilter === 'draft' && effectiveEventStatus === 'DRAFT') ||
      (statusFilter === 'live' && (effectiveEventStatus === 'LIVE' || effectiveEventStatus === 'ACTIVE')) ||
      (statusFilter === 'completed' && effectiveEventStatus === 'COMPLETED') ||
      (statusFilter === 'cancelled' && effectiveEventStatus === 'CANCELLED') ||
      ev.status === statusFilter;

    const matchesPricingType =
      pricingTypeFilter === 'all' ||
      (pricingTypeFilter === 'custom' && ev.is_custom_price) ||
      (pricingTypeFilter === 'default' && !ev.is_custom_price);

    return matchesSearch && matchesStatus && matchesPricingType;
  });

  const customPriceCount = events.filter((e) => e.is_custom_price).length;
  const defaultPriceCount = events.length - customPriceCount;

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-800 pb-6">
        <div>
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-slate-950 shadow-lg shadow-amber-950/40">
              <Coins className="w-5 h-5 stroke-[2.5]" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-white tracking-tight">{t('developer.eventPricingDurationControl')}</h1>
              <p className="text-xs text-slate-400">
                {t('developer.eventPricingDurationControlDesc')}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={handleRunMaintenance}
            disabled={runningMaintenance || loading}
            className="flex items-center space-x-2 px-3.5 py-2 rounded-xl text-xs font-semibold bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 transition-colors cursor-pointer disabled:opacity-50"
            title="Execute background maintenance job to cancel expired unpaid events and complete expired live events"
          >
            <ShieldCheck className={`w-3.5 h-3.5 ${runningMaintenance ? 'animate-spin text-amber-400' : 'text-amber-400'}`} />
            <span>{runningMaintenance ? t('developer.runningMaintenance') : t('developer.runLifecycleMaintenance')}</span>
          </button>

          <button
            onClick={fetchData}
            disabled={loading}
            className="flex items-center space-x-2 px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-amber-400' : ''}`} />
            <span>{t('developer.refreshData')}</span>
          </button>
        </div>
      </div>

      {/* Notifications */}
      {error && (
        <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-2xl text-rose-300 text-xs flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-rose-400 hover:text-rose-200">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {successMsg && (
        <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl text-emerald-300 text-xs flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Check className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{successMsg}</span>
          </div>
          <button onClick={() => setSuccessMsg(null)} className="text-emerald-400 hover:text-emerald-200">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Primary Navigation Tabs */}
      <div className="flex flex-wrap items-center gap-2 p-1.5 bg-slate-900/90 border border-slate-800 rounded-2xl">
        <button
          onClick={() => setPricingTab('games')}
          className={`flex items-center space-x-2 px-4 py-2.5 text-xs font-bold rounded-xl transition-all cursor-pointer ${
            pricingTab === 'games'
              ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-950/40'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
          }`}
        >
          <Gamepad2 className="w-4 h-4" />
          <span>{t('developer.gameSpecificPricingTiers')}</span>
          <span className="ml-1.5 px-2 py-0.5 rounded-full text-[10px] font-mono bg-slate-950/30 text-current">
            {games.length} games
          </span>
        </button>

        <button
          onClick={() => setPricingTab('events')}
          className={`flex items-center space-x-2 px-4 py-2.5 text-xs font-bold rounded-xl transition-all cursor-pointer ${
            pricingTab === 'events'
              ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-950/40'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
          }`}
        >
          <Calendar className="w-4 h-4" />
          <span>{t('developer.eventPricingOverrides')}</span>
          <span className="ml-1.5 px-2 py-0.5 rounded-full text-[10px] font-mono bg-slate-950/30 text-current">
            {events.length}
          </span>
        </button>

        <button
          onClick={() => setPricingTab('legacy')}
          className={`flex items-center space-x-2 px-4 py-2.5 text-xs font-bold rounded-xl transition-all cursor-pointer ${
            pricingTab === 'legacy'
              ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-950/40'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
          }`}
        >
          <Sliders className="w-4 h-4" />
          <span>{t('developer.platformFallbackSettings')}</span>
        </button>
      </div>

      {/* Tab 1: Game-Specific Pricing Tiers */}
      {pricingTab === 'games' && (
        <div className="space-y-6">
          {/* Game Selection Bar */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center space-x-3">
              <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
                <Gamepad2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">{t('developer.selectGameEngine')}</h3>
                <p className="text-xs text-slate-400">{t('developer.selectGameEngineDesc')}</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {games.map((g) => {
                const isSelected = selectedGameId === g.id;
                return (
                  <button
                    key={g.id}
                    onClick={() => setSelectedGameId(g.id)}
                    className={`flex items-center space-x-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-amber-500 text-slate-950 font-bold shadow-md shadow-amber-950/30'
                        : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700/60'
                    }`}
                  >
                    <span>{g.name}</span>
                    <span className="text-[10px] font-mono opacity-80">({g.slug})</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Active Game Pricing Manager */}
          {(() => {
            const activeGame = games.find((g) => g.id === selectedGameId) || games[0];
            if (!activeGame) {
              return (
                <div className="p-8 text-center bg-slate-900 border border-slate-800 rounded-2xl text-slate-400 text-xs">
                  No games registered on the platform yet.
                </div>
              );
            }
            return (
              <DeveloperGamePricingManager
                game={activeGame}
                onPricingUpdated={fetchData}
              />
            );
          })()}
        </div>
      )}

      {/* Tab 3: Platform Fallback Rules & Simulator */}
      {pricingTab === 'legacy' && (
        <div className="space-y-6">
      {/* Top Section: Default Base & Quick Stats */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-gradient-to-br from-slate-900 via-slate-900 to-slate-800/90 rounded-3xl border border-slate-800 p-6 shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />

          <div className="flex items-start justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
                <Sliders className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-white">{t('developer.platformDefaultBasePrice', undefined, 'Platform Default Base Price (1 Day)')}</h2>
                <p className="text-xs text-slate-400">
                  {t('developer.platformDefaultBasePriceDesc', undefined, 'Authoritative base price fallback applied to 1-day events across all organizations')}
                </p>
              </div>
            </div>

            {!isEditingDefault && (
              <button
                onClick={() => {
                  setTempDefaultPrice(String(pricingSettings.default_price));
                  setTempDefaultCurrency(pricingSettings.default_currency);
                  setIsEditingDefault(true);
                }}
                className="flex items-center space-x-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 transition-colors cursor-pointer"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>{t('developer.editBase', undefined, 'Edit Base')}</span>
              </button>
            )}
          </div>

          {!isEditingDefault ? (
            <div className="mt-6 flex flex-col sm:flex-row sm:items-baseline justify-between gap-4 pt-4 border-t border-slate-800/80">
              <div>
                <div className="flex items-baseline space-x-2">
                  <span className="text-3xl font-black text-amber-400 font-mono tracking-tight">
                    {pricingSettings.default_currency} {pricingSettings.default_price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                  <span className="text-xs text-slate-400 font-medium">{t('developer.calendarDay', undefined, '/ 1 calendar day')}</span>
                </div>
                <div className="flex items-center space-x-2 mt-2 text-[11px] text-slate-400">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                  <span>{t('developer.serverAuthSetting', undefined, 'Server-authoritative database setting')}</span>
                  {pricingSettings.updated_at && (
                    <>
                      <span>•</span>
                      <span>Last updated: {new Date(pricingSettings.updated_at).toLocaleDateString()}</span>
                    </>
                  )}
                </div>
              </div>

              <div className="bg-slate-950/60 rounded-2xl p-3 border border-slate-800 text-[11px] text-slate-400 max-w-sm space-y-1">
                <div className="flex items-center space-x-1 text-slate-300 font-semibold">
                  <Info className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span>{t('developer.authoritativePrice', undefined, 'Authoritative Price')} Rule:</span>
                </div>
                <p>
                  Prices are locked into event records at creation time. Historical events preserve their original locked price.
                </p>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSaveDefaultPricing} className="mt-6 pt-4 border-t border-slate-800 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Default Base Price Amount
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 font-mono text-xs">
                      {tempDefaultCurrency}
                    </div>
                    <input
                      type="number"
                      step="0.01"
                      min="1"
                      value={tempDefaultPrice}
                      onChange={(e) => setTempDefaultPrice(e.target.value)}
                      className="w-full bg-slate-950 border border-amber-500/40 rounded-xl pl-14 pr-4 py-2 text-sm text-white font-mono focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                      placeholder="0.00"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Currency Code
                  </label>
                  <select
                    value={tempDefaultCurrency}
                    onChange={(e) => setTempDefaultCurrency(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50 cursor-pointer"
                  >
                    <option value="MYR">MYR (Malaysian Ringgit)</option>
                    <option value="USD">USD (US Dollar)</option>
                    <option value="SGD">SGD (Singapore Dollar)</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-end space-x-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsEditingDefault(false)}
                  disabled={savingSettings}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingSettings}
                  className="flex items-center space-x-2 px-5 py-2 rounded-xl text-xs font-semibold bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-slate-950 shadow-lg shadow-amber-950/40 transition-all cursor-pointer disabled:opacity-50"
                >
                  {savingSettings ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>{t('developer.savingBase', undefined, 'Saving Base...')}</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>{t('developer.savePlatformBase', undefined, 'Save Platform Base')}</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Quick Stat Summary Cards */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-slate-900/90 rounded-2xl border border-slate-800 p-4 flex flex-col justify-between">
            <span className="text-slate-400 text-xs font-medium">Duration Tiers</span>
            <div className="mt-2">
              <span className="text-2xl font-black text-amber-400 font-mono">{pricingRules.length}</span>
              <span className="block text-[10px] text-slate-500 mt-0.5">{t('developer.activeTierRules', undefined, 'Active tier rules')}</span>
            </div>
          </div>

          <div className="bg-slate-900/90 rounded-2xl border border-slate-800 p-4 flex flex-col justify-between">
            <span className="text-slate-400 text-xs font-medium">Platform Events</span>
            <div className="mt-2">
              <span className="text-2xl font-black text-white font-mono">{events.length}</span>
              <span className="block text-[10px] text-slate-500 mt-0.5">{t('developer.acrossAllOrgs', undefined, 'Across all orgs')}</span>
            </div>
          </div>

          <div className="bg-slate-900/90 rounded-2xl border border-slate-800 p-4 flex flex-col justify-between">
            <span className="text-slate-400 text-xs font-medium">Custom Overrides</span>
            <div className="mt-2">
              <span className="text-2xl font-black text-cyan-400 font-mono">{customPriceCount}</span>
              <span className="block text-[10px] text-slate-500 mt-0.5">{t('developer.adminCustomRates', undefined, 'Admin custom rates')}</span>
            </div>
          </div>

          <div className="bg-slate-900/90 rounded-2xl border border-slate-800 p-4 flex flex-col justify-between">
            <span className="text-slate-400 text-xs font-medium">Credit Coverage</span>
            <div className="mt-2">
              <span className="text-2xl font-black text-emerald-400 font-mono">20% Cap</span>
              <span className="block text-[10px] text-slate-500 mt-0.5">{t('developer.topUpBonusMax', undefined, 'Top-up bonus max')}</span>
            </div>
          </div>
        </div>
      </div>

      {/* DURATION-BASED PRICING TIERS (RULES MANAGEMENT) */}
      <div className="bg-slate-900 rounded-3xl border border-slate-800 overflow-hidden shadow-xl">
        <div className="p-5 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-slate-900/50">
          <div>
            <div className="flex items-center space-x-2.5">
              <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400">
                <Clock className="w-4 h-4" />
              </div>
              <h3 className="text-base font-bold text-white">{t('developer.durationBasedPricingTiers', undefined, 'Duration-Based Pricing Tiers')}</h3>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Configure tiered pricing based on the event's calendar-day duration (Start Date to End Date inclusive).
            </p>
          </div>

          <div className="flex items-center space-x-3">
            <button
              onClick={handleResetDefaultRules}
              disabled={savingSettings}
              className="px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-400 hover:text-slate-200 bg-slate-800 hover:bg-slate-700 transition-colors cursor-pointer"
            >
              Reset to Standard Defaults
            </button>
            <button
              onClick={handleOpenAddRule}
              disabled={savingSettings}
              className="flex items-center space-x-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 transition-colors cursor-pointer shadow-md"
            >
              <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>{t('developer.addDurationTier', undefined, 'Add Duration Tier')}</span>
            </button>
          </div>
        </div>

        {/* Pricing Rules Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950/70 border-b border-slate-800 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              <tr>
                <th className="px-5 py-3.5">{t('developer.durationRange', undefined, 'Duration Range')}</th>
                <th className="px-5 py-3.5">{t('developer.minDaysHeader', undefined, 'Min Days')}</th>
                <th className="px-5 py-3.5">{t('developer.maxDaysHeader', undefined, 'Max Days')}</th>
                <th className="px-5 py-3.5">Authoritative Price</th>
                <th className="px-5 py-3.5">{t('developer.dailyEquivalent', undefined, 'Daily Equivalent')}</th>
                <th className="px-5 py-3.5">Status</th>
                <th className="px-5 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-sans">
              {pricingRules.map((rule) => {
                const avgDays = rule.max_days ? (rule.min_days + rule.max_days) / 2 : rule.min_days;
                const dailyEquivalent = rule.price / avgDays;

                return (
                  <tr key={rule.id} className={`hover:bg-slate-800/40 transition-colors ${!rule.active ? 'opacity-50' : ''}`}>
                    <td className="px-5 py-4">
                      <div className="font-bold text-white text-sm flex items-center gap-2">
                        <Tag className="w-3.5 h-3.5 text-amber-400" />
                        <span>{formatRuleRange(rule)}</span>
                      </div>
                    </td>
                    <td className="px-5 py-4 font-mono font-medium text-slate-300">
                      {rule.min_days} day{rule.min_days > 1 ? 's' : ''}
                    </td>
                    <td className="px-5 py-4 font-mono font-medium text-slate-300">
                      {rule.max_days !== null ? `${rule.max_days} days` : 'Unlimited (∞)'}
                    </td>
                    <td className="px-5 py-4">
                      <div className="font-mono font-bold text-sm text-amber-400">
                        {rule.currency || 'MYR'} {rule.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                    </td>
                    <td className="px-5 py-4 font-mono text-[11px] text-slate-400">
                      ~{rule.currency || 'MYR'} {dailyEquivalent.toFixed(2)} / day
                    </td>
                    <td className="px-5 py-4">
                      <button
                        onClick={() => handleToggleRuleActive(rule.id)}
                        className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold cursor-pointer transition-all ${
                          rule.active
                            ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/25'
                            : 'bg-slate-800 text-slate-400 border border-slate-700 hover:bg-slate-700'
                        }`}
                      >
                        {rule.active ? 'Active' : 'Disabled'}
                      </button>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <div className="inline-flex items-center justify-end space-x-2">
                        <button
                          onClick={() => handleOpenEditRule(rule)}
                          className="p-1.5 text-slate-400 hover:text-cyan-300 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                          title={t('developer.editTier', undefined, 'Edit Tier')}
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteRule(rule.id)}
                          className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                          title={t('developer.deleteTier', undefined, 'Delete Tier')}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* DURATION PRICING SIMULATOR / TESTER */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-900 to-slate-850 rounded-3xl border border-slate-800 p-6 shadow-xl space-y-4">
        <div className="flex items-center space-x-3">
          <div className="w-9 h-9 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
            <Calculator className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">{t('developer.durationPricingSimulator', undefined, 'Duration Pricing Simulator')}</h3>
            <p className="text-xs text-slate-400">
              Test how calendar-day ranges calculate server-authoritative event license pricing.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
          <div>
            <label className="block text-[11px] font-semibold text-slate-300 mb-1.5">
              Start Date
            </label>
            <CustomDatePicker
              value={simStartDate}
              onChange={(newStart) => setSimStartDate(newStart)}
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-300 mb-1.5">
              End Date
            </label>
            <CustomDatePicker
              min={simStartDate}
              value={simEndDate}
              onChange={(newEnd) => setSimEndDate(newEnd)}
            />
          </div>

          <div className="bg-slate-950 rounded-2xl p-4 border border-slate-800/80 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400">{t('developer.calculatedDuration', undefined, 'Calculated Duration:')}</span>
              <span className="text-xs font-bold text-white font-mono">
                {simDurationDays} calendar day{simDurationDays > 1 ? 's' : ''}
              </span>
            </div>
            <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-900">
              <span className="text-xs text-slate-400">{t('developer.simulatedQuote', undefined, 'Simulated Quote:')}</span>
              <span className="text-base font-black text-amber-400 font-mono">
                {simCurrency} {simQuotePrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
            {simMatchedRule && (
              <div className="text-[10px] text-slate-500 mt-1 flex items-center justify-end gap-1">
                <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                <span>Matched Tier: {formatRuleRange(simMatchedRule)}</span>
              </div>
            )}
          </div>
        </div>
      </div>
      </div>
      )}

      {/* Tab 2: Events Pricing Overview Table */}
      {pricingTab === 'events' && (
      <div className="bg-slate-900 rounded-3xl border border-slate-800 overflow-hidden shadow-xl">
        {/* Table Header & Search Filter Bar */}
        <div className="p-5 border-b border-slate-800 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 bg-slate-900/50">
          <div>
            <h3 className="text-base font-bold text-white">{t('developer.eventPricingInventory', undefined, 'Event Pricing Inventory')}</h3>
            <p className="text-xs text-slate-400">
              View and configure authoritative prices for every event individually with locked rates.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Search Input */}
            <div className="relative min-w-[220px]">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder={t('developer.searchEventOrOrg', undefined, 'Search event or organization...')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3.5 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
              />
            </div>

            {/* Pricing Type Filter */}
            <select
              value={pricingTypeFilter}
              onChange={(e) => setPricingTypeFilter(e.target.value as any)}
              className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-amber-500 cursor-pointer"
            >
              <option value="all">{t('developer.allPricingTypes', undefined, 'All Pricing Types')}</option>
              <option value="custom">{t('developer.customOverridesOnly', undefined, 'Custom Overrides Only')}</option>
              <option value="default">{t('developer.standardTiersOnly', undefined, 'Standard Tiers Only')}</option>
            </select>

            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-amber-500 cursor-pointer"
            >
              <option value="all">{t('developer.allStatuses', undefined, 'All Event & Payment Statuses')}</option>
              <option value="draft">{t('developer.eventDraft', undefined, 'Event: DRAFT')}</option>
              <option value="live">{t('developer.eventLive', undefined, 'Event: LIVE')}</option>
              <option value="completed">{t('developer.eventCompleted', undefined, 'Event: COMPLETED')}</option>
              <option value="cancelled">{t('developer.eventCancelled', undefined, 'Event: CANCELLED')}</option>
              <option value="paid">{t('developer.paymentPaid', undefined, 'Payment: PAID')}</option>
              <option value="unpaid">{t('developer.paymentUnpaid', undefined, 'Payment: UNPAID')}</option>
            </select>
          </div>
        </div>

        {/* Table Content */}
        {loading ? (
          <div className="p-12 text-center text-slate-400 flex flex-col items-center justify-center space-y-3">
            <RefreshCw className="w-6 h-6 animate-spin text-amber-400" />
            <span className="text-xs">{t('developer.loadingEventPricing', undefined, 'Loading event pricing ledger...')}</span>
          </div>
        ) : filteredEvents.length === 0 ? (
          <div className="p-12 text-center text-slate-400 space-y-2">
            <Coins className="w-8 h-8 mx-auto text-slate-600" />
            <p className="text-sm font-semibold text-slate-300">{t('developer.noEventsFound', undefined, 'No events found')}</p>
            <p className="text-xs text-slate-500">{t('developer.adjustSearchOrFilters', undefined, 'Try adjusting your search or filters.')}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950/70 border-b border-slate-800 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                <tr>
                  <th className="px-5 py-3.5">{t('developer.eventName', undefined, 'Event Name')}</th>
                  <th className="px-5 py-3.5">Organization</th>
                  <th className="px-5 py-3.5">{t('developer.durationAndDates', undefined, 'Duration & Dates')}</th>
                  <th className="px-5 py-3.5">{t('developer.effectivePrice', undefined, 'Effective Price')}</th>
                  <th className="px-5 py-3.5">{t('developer.pricingStatus', undefined, 'Pricing Status')}</th>
                  <th className="px-5 py-3.5">{t('developer.eventStatus', undefined, 'Event Status')}</th>
                  <th className="px-5 py-3.5">Payment Status</th>
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-sans">
                {filteredEvents.map((ev) => {
                  const isPaid = ev.payment_status === 'PAID';
                  const duration = ev.duration_days || calculateEventCalendarDays(ev.start_date, ev.end_date);
                  const matchedRule = pricingRules.find(
                    (r) => r.active && duration >= r.min_days && (r.max_days === null || duration <= r.max_days)
                  );
                  const effectivePrice = ev.effective_price ?? ev.event_price ?? (matchedRule ? matchedRule.price : pricingSettings?.default_price ?? null);
                  const currency = ev.event_currency || pricingSettings.default_currency || 'MYR';
                  const eventStatus = (ev.event_status || ev.status || 'DRAFT').toUpperCase();
                  const paymentStatus = (ev.payment_status || (isPaid ? 'PAID' : 'UNPAID')).toUpperCase();
                  const isCancelled = eventStatus === 'CANCELLED';

                  return (
                    <tr key={ev.id} className="hover:bg-slate-800/40 transition-colors">
                      {/* Event Name */}
                      <td className="px-5 py-4">
                        <div className="font-semibold text-white text-sm">{ev.name}</div>
                        <div className="text-[11px] text-slate-500 font-mono mt-0.5">/{ev.slug}</div>
                      </td>

                      {/* Organization */}
                      <td className="px-5 py-4">
                        <div className="flex items-center space-x-1.5 text-slate-200 font-medium">
                          <Building2 className="w-3.5 h-3.5 text-slate-400" />
                          <span>{ev.organization_name || 'Organization'}</span>
                        </div>
                      </td>

                      {/* Duration & Dates */}
                      <td className="px-5 py-4">
                        <div className="font-bold text-slate-200 flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 text-amber-400" />
                          <span>{duration} calendar day{duration > 1 ? 's' : ''}</span>
                        </div>
                        {ev.start_date && (
                          <div className="text-[10px] text-slate-500 mt-0.5">
                            {ev.start_date} {ev.end_date && ev.end_date !== ev.start_date ? `→ ${ev.end_date}` : ''}
                          </div>
                        )}
                      </td>

                      {/* Effective Price */}
                      <td className="px-5 py-4">
                        {effectivePrice !== null ? (
                          <>
                            <div className="font-mono font-bold text-sm text-amber-400">
                              {currency} {effectivePrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </div>
                            <div className="text-[10px] text-slate-500">
                              Max Credit (20%): {currency} {(effectivePrice * 0.2).toFixed(2)}
                            </div>
                          </>
                        ) : (
                          <div className="text-xs text-slate-400 italic">{t('developer.pendingQuote', undefined, 'Pending Quote')}</div>
                        )}
                      </td>

                      {/* Pricing Status (Default vs Override) */}
                      <td className="px-5 py-4">
                        {ev.is_custom_price ? (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                            Custom Override
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold bg-slate-800 text-slate-400 border border-slate-700">
                            Duration Tier
                          </span>
                        )}
                      </td>

                      {/* Event Status & Cancellation Reason */}
                      <td className="px-5 py-4">
                        <div className="space-y-1">
                          {eventStatus === 'LIVE' || eventStatus === 'ACTIVE' ? (
                            <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                              <span>LIVE</span>
                            </span>
                          ) : eventStatus === 'DRAFT' ? (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                              DRAFT
                            </span>
                          ) : eventStatus === 'COMPLETED' ? (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/15 text-blue-400 border border-blue-500/30">
                              COMPLETED
                            </span>
                          ) : eventStatus === 'CANCELLED' ? (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/15 text-rose-400 border border-rose-500/30">
                              CANCELLED
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-slate-400 border border-slate-700">
                              {eventStatus}
                            </span>
                          )}

                          {ev.cancel_reason && (
                            <div className="text-[10px] font-mono text-rose-400/90">
                              Reason: {ev.cancel_reason}
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Payment Status */}
                      <td className="px-5 py-4">
                        {paymentStatus === 'PAID' ? (
                          <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                            <Check className="w-3 h-3" />
                            <span>PAID</span>
                          </span>
                        ) : paymentStatus === 'REFUNDED' ? (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold bg-purple-500/15 text-purple-300 border border-purple-500/30">
                            REFUNDED
                          </span>
                        ) : paymentStatus === 'FAILED' ? (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold bg-rose-500/15 text-rose-400 border border-rose-500/30">
                            FAILED
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold bg-slate-800 text-slate-400 border border-slate-700">
                            UNPAID
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-5 py-4 text-right">
                        <div className="inline-flex items-center justify-end space-x-2">
                          <button
                            onClick={() => handleOpenEditEvent(ev)}
                            className="inline-flex items-center space-x-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-amber-500/20 hover:text-amber-300 text-slate-200 border border-slate-700 transition-colors cursor-pointer"
                            title={t('developer.editPrice', undefined, 'Edit Price')}
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                            <span>{t('developer.editPrice', undefined, 'Edit Price')}</span>
                          </button>

                          {(isCancelled || eventStatus === 'DRAFT') && (
                            <button
                              onClick={() => handleReactivateEvent(ev.id, ev.name)}
                              disabled={reactivatingId === ev.id}
                              className="inline-flex items-center space-x-1 px-2.5 py-1.5 rounded-xl text-xs font-semibold bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 transition-colors cursor-pointer disabled:opacity-50"
                              title={t('developer.reactivateEvent', undefined, 'Manually override status & reactivate event')}
                            >
                              <ShieldCheck className={`w-3.5 h-3.5 ${reactivatingId === ev.id ? 'animate-spin' : ''}`} />
                              <span>{reactivatingId === ev.id ? 'Reactivating...' : 'Reactivate'}</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      )}

      {/* Add / Edit Duration Rule Modal */}
      {isAddingRule && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-5 relative overflow-hidden">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center space-x-3">
                <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
                  <Clock className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">
                    {editingRuleId ? 'Edit Duration Tier' : 'Add Duration Tier'}
                  </h3>
                  <p className="text-xs text-slate-400">{t('developer.configureDayRange', undefined, 'Configure day range and fixed rate')}</p>
                </div>
              </div>
              <button
                onClick={() => setIsAddingRule(false)}
                className="p-1.5 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveRuleModal} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Min Calendar Days
                  </label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={ruleFormMinDays}
                    onChange={(e) => setRuleFormMinDays(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-amber-500"
                    placeholder="1"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Max Calendar Days
                  </label>
                  <input
                    type="number"
                    min={ruleFormMinDays}
                    disabled={ruleFormIsUnlimited}
                    required={!ruleFormIsUnlimited}
                    value={ruleFormIsUnlimited ? '' : ruleFormMaxDays}
                    onChange={(e) => setRuleFormMaxDays(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-amber-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    placeholder={ruleFormIsUnlimited ? 'Unlimited (∞)' : '7'}
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="unlimited-max"
                  checked={ruleFormIsUnlimited}
                  onChange={(e) => setRuleFormIsUnlimited(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-700 bg-slate-900 text-amber-500 focus:ring-amber-500/30 accent-amber-500 cursor-pointer"
                />
                <label htmlFor="unlimited-max" className="text-xs text-slate-300 font-medium cursor-pointer select-none">
                  Unlimited max duration (e.g. 91+ days)
                </label>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Price Amount
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="1"
                    required
                    value={ruleFormPrice}
                    onChange={(e) => setRuleFormPrice(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-amber-500"
                    placeholder="0.00"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Currency
                  </label>
                  <select
                    value={ruleFormCurrency}
                    onChange={(e) => setRuleFormCurrency(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500 cursor-pointer"
                  >
                    <option value="MYR">MYR</option>
                    <option value="USD">USD</option>
                    <option value="SGD">SGD</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-end space-x-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsAddingRule(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex items-center space-x-2 px-5 py-2 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-lg transition-all cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>{editingRuleId ? 'Update Tier' : 'Save Tier'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Event Custom Price Modal */}
      {selectedEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-lg w-full p-6 shadow-2xl space-y-6 relative overflow-hidden">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center space-x-3">
                <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
                  <Coins className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">{t('developer.editEventPriceTitle', undefined, 'Edit Event Price')}</h3>
                  <p className="text-xs text-slate-400">{selectedEvent.name}</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedEvent(null)}
                className="p-1.5 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="bg-slate-950 rounded-2xl p-4 border border-slate-800 text-xs space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-400">Organization:</span>
                <span className="text-slate-200 font-semibold">{selectedEvent.organization_name || 'Organization'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Duration:</span>
                <span className="text-slate-200 font-medium">
                  {selectedEvent.duration_days || calculateEventCalendarDays(selectedEvent.start_date, selectedEvent.end_date)} calendar days
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">{t('developer.currentEffectivePrice', undefined, 'Current Effective Price:')}</span>
                <span className="text-amber-400 font-mono font-bold">
                  {(() => {
                    const duration = selectedEvent.duration_days || calculateEventCalendarDays(selectedEvent.start_date, selectedEvent.end_date);
                    const matchedRule = pricingRules.find(
                      (r) => r.active && duration >= r.min_days && (r.max_days === null || duration <= r.max_days)
                    );
                    const curPrice = selectedEvent.effective_price ?? selectedEvent.event_price ?? (matchedRule ? matchedRule.price : pricingSettings?.default_price ?? null);
                    return curPrice !== null
                      ? `${selectedEvent.event_currency || pricingSettings?.default_currency || 'MYR'} ${curPrice.toFixed(2)}`
                      : 'Pending Quote';
                  })()}
                </span>
              </div>
            </div>

            <form onSubmit={handleSaveEventPricing} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Set Custom Event Price
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 font-mono text-xs">
                    {tempEventCurrency}
                  </div>
                  <input
                    type="number"
                    step="0.01"
                    min="1"
                    value={tempEventPrice}
                    onChange={(e) => setTempEventPrice(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 focus:border-amber-500 rounded-xl pl-14 pr-4 py-2.5 text-sm text-white font-mono focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                    placeholder="0.00"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Currency
                </label>
                <select
                  value={tempEventCurrency}
                  onChange={(e) => setTempEventCurrency(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50 cursor-pointer"
                >
                  <option value="MYR">MYR (Malaysian Ringgit)</option>
                  <option value="USD">USD (US Dollar)</option>
                  <option value="SGD">SGD (Singapore Dollar)</option>
                </select>
              </div>

              {/* Quick Reset to Platform Default Button */}
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setTempEventPrice(String(pricingSettings.default_price));
                    setTempEventCurrency(pricingSettings.default_currency);
                  }}
                  className="text-xs text-amber-400 hover:text-amber-300 underline font-medium cursor-pointer"
                >
                  Reset to Platform Base ({pricingSettings.default_currency} {pricingSettings.default_price.toFixed(2)})
                </button>
              </div>

              <div className="flex items-center justify-end space-x-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setSelectedEvent(null)}
                  disabled={savingEventPrice}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingEventPrice}
                  className="flex items-center space-x-2 px-5 py-2 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-lg transition-all cursor-pointer disabled:opacity-50"
                >
                  {savingEventPrice ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>{t('developer.savingPrice', undefined, 'Saving Price...')}</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>{t('developer.saveEventPriceBtn', undefined, 'Save Event Price')}</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
