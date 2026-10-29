import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useLocalization } from '../../context/LocalizationContext';
import { apiFetch } from '../../lib/api';
import { COUNTRIES, getCountryByCode, getCountryDisplayName, getCurrencyForCountry } from '../../lib/countryUtils';
import {
  Sparkles,
  Gift,
  Coins,
  History,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  Plus,
  Trash2,
  Edit3,
  Save,
  Calculator,
  Shield,
  Layers,
  Globe,
  Sliders,
  Info,
  Check,
  X,
  Clock,
  ArrowRight,
  TrendingUp,
} from 'lucide-react';

export interface WalletTopupTierItem {
  id?: string;
  tier_name: string;
  min_deposit: number;
  max_deposit: number | null;
  calculation_type: 'PERCENTAGE' | 'FIXED';
  bonus_rate: number;
  bonus_fixed_amount: number;
  max_bonus_amount: number | null;
  is_active: boolean;
  sort_order: number;
}

export interface WalletRewardSettingsData {
  id: string;
  country_code: string;
  currency: string;
  welcome_credit_amount: number;
  welcome_credit_enabled: boolean;
  showcase_credit_amount: number;
  showcase_credit_enabled: boolean;
  topup_bonus_enabled: boolean;
  max_topup_credit_per_event_percent: number;
  is_active: boolean;
  version: number;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  tiers: WalletTopupTierItem[];
}

export interface WalletRewardSettingsHistoryRecord {
  id: string;
  settings_id: string;
  country_code: string;
  currency: string;
  version: number;
  snapshot: any;
  change_reason?: string | null;
  changed_by?: string | null;
  created_at: string;
}

export const DeveloperWalletRewardsSettings: React.FC = () => {
  const { t } = useLocalization();

  // State
  const [allSettings, setAllSettings] = useState<WalletRewardSettingsData[]>([]);
  const [selectedCountry, setSelectedCountry] = useState<string>('MY');
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Form State for Selected Country
  const [formState, setFormState] = useState<WalletRewardSettingsData | null>(null);
  const [changeReason, setChangeReason] = useState<string>('');
  const [showReasonModal, setShowReasonModal] = useState<boolean>(false);

  // History State
  const [history, setHistory] = useState<WalletRewardSettingsHistoryRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState<boolean>(false);
  const [showHistory, setShowHistory] = useState<boolean>(false);

  // Add Country Modal
  const [showAddCountryModal, setShowAddCountryModal] = useState<boolean>(false);
  const [newCountryCode, setNewCountryCode] = useState<string>('SG');
  const [newCurrency, setNewCurrency] = useState<string>('SGD');

  // Edit / Add Tier Modal State
  const [editingTierIndex, setEditingTierIndex] = useState<number | null>(null);
  const [tierModalOpen, setTierModalOpen] = useState<boolean>(false);
  const [tierForm, setTierForm] = useState<WalletTopupTierItem>({
    tier_name: '',
    min_deposit: 1000,
    max_deposit: null,
    calculation_type: 'PERCENTAGE',
    bonus_rate: 0.05,
    bonus_fixed_amount: 0,
    max_bonus_amount: null,
    is_active: true,
    sort_order: 1,
  });

  // Live Calculator Simulator State
  const [testDepositAmount, setTestDepositAmount] = useState<number>(6000);

  // Fetch all settings
  const fetchSettings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch('/api/developer/rewards/settings');
      if (!res.ok) {
        throw new Error(`Failed to load reward settings (status ${res.status})`);
      }
      const data = await res.json();
      if (data.success && Array.isArray(data.settings)) {
        setAllSettings(data.settings);
        // Select country if not yet selected or keep current
        if (!selectedCountry && data.settings.length > 0) {
          setSelectedCountry(data.settings[0].country_code);
        }
      }
    } catch (err: any) {
      console.error('Failed to load wallet reward settings:', err);
      setError(err?.message || 'Failed to load wallet reward settings');
    } finally {
      setLoading(false);
    }
  }, [selectedCountry]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  // Sync active form state when selected country changes or allSettings loads
  useEffect(() => {
    const current = allSettings.find((s) => s.country_code.toUpperCase() === selectedCountry.toUpperCase());
    if (current) {
      setFormState(JSON.parse(JSON.stringify(current)));
      setTestDepositAmount(current.tiers?.[0]?.min_deposit || 1000);
    } else {
      setFormState(null);
    }
  }, [selectedCountry, allSettings]);

  // Fetch History for selected country
  const fetchHistory = useCallback(async (code: string) => {
    setHistoryLoading(true);
    try {
      const res = await apiFetch(`/api/developer/rewards/settings/${code}/history`);
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.history)) {
          setHistory(data.history);
        }
      }
    } catch (err: any) {
      console.warn('Failed to load history:', err);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    if (showHistory && selectedCountry) {
      fetchHistory(selectedCountry);
    }
  }, [showHistory, selectedCountry, fetchHistory]);

  // Handle Save
  const handleSaveConfirmed = async () => {
    if (!formState) return;
    setSaving(true);
    setError(null);
    setSuccessMessage(null);
    setShowReasonModal(false);

    try {
      // Validate tiers before sending
      const sortedTiers = [...formState.tiers].sort((a, b) => a.min_deposit - b.min_deposit);
      for (let i = 0; i < sortedTiers.length; i++) {
        const t = sortedTiers[i];
        if (t.min_deposit < 0) {
          throw new Error(`Tier "${t.tier_name}" minimum deposit cannot be negative.`);
        }
        if (t.max_deposit !== null && t.max_deposit <= t.min_deposit) {
          throw new Error(`Tier "${t.tier_name}" maximum deposit must be greater than minimum deposit.`);
        }
      }

      const payload = {
        country_code: formState.country_code,
        currency: formState.currency,
        welcome_credit_amount: Number(formState.welcome_credit_amount),
        welcome_credit_enabled: Boolean(formState.welcome_credit_enabled),
        showcase_credit_amount: Number(formState.showcase_credit_amount),
        showcase_credit_enabled: Boolean(formState.showcase_credit_enabled),
        topup_bonus_enabled: Boolean(formState.topup_bonus_enabled),
        max_topup_credit_per_event_percent: Number(formState.max_topup_credit_per_event_percent),
        is_active: Boolean(formState.is_active),
        change_reason: changeReason.trim() || undefined,
        tiers: formState.tiers,
      };

      const res = await apiFetch(`/api/developer/rewards/settings/${formState.country_code}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || `Failed to save settings (status ${res.status})`);
      }

      setSuccessMessage(`Successfully updated reward settings for ${formState.country_code} (v${data.settings.version})`);
      setChangeReason('');
      await fetchSettings();
      if (showHistory) {
        fetchHistory(formState.country_code);
      }
    } catch (err: any) {
      console.error('Failed to save reward settings:', err);
      setError(err?.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  // Add new country configuration
  const handleCreateNewCountry = async () => {
    const code = newCountryCode.trim().toUpperCase();
    const curr = newCurrency.trim().toUpperCase();
    if (!code || code.length !== 2) {
      setError('Please provide a valid 2-letter ISO country code.');
      return;
    }
    if (!curr || curr.length !== 3) {
      setError('Please provide a valid 3-letter ISO currency code.');
      return;
    }

    setShowAddCountryModal(false);
    setSaving(true);
    setError(null);

    try {
      const payload = {
        country_code: code,
        currency: curr,
        welcome_credit_amount: code === 'MY' ? 800 : code === 'SG' ? 300 : 200,
        welcome_credit_enabled: true,
        showcase_credit_amount: code === 'MY' ? 300 : code === 'SG' ? 100 : 75,
        showcase_credit_enabled: true,
        topup_bonus_enabled: true,
        max_topup_credit_per_event_percent: 0.20,
        is_active: true,
        change_reason: `Initial configuration created for ${code} (${curr})`,
        tiers: [
          {
            tier_name: 'Tier 1 (5% Bonus)',
            min_deposit: code === 'MY' ? 6000 : code === 'SG' ? 2000 : 1500,
            max_deposit: null,
            calculation_type: 'PERCENTAGE',
            bonus_rate: 0.05,
            bonus_fixed_amount: 0,
            max_bonus_amount: null,
            is_active: true,
            sort_order: 1,
          },
        ],
      };

      const res = await apiFetch(`/api/developer/rewards/settings/${code}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || `Failed to create country configuration (status ${res.status})`);
      }

      setSuccessMessage(`New country configuration created for ${code} (${curr})`);
      setSelectedCountry(code);
      await fetchSettings();
    } catch (err: any) {
      setError(err?.message || 'Failed to create country configuration');
    } finally {
      setSaving(false);
    }
  };

  // Calculator simulation logic
  const calculatedBonus = useMemo(() => {
    if (!formState || !formState.topup_bonus_enabled || testDepositAmount <= 0) {
      return { bonus: 0, ratePercent: 0, matchedTier: null };
    }

    const activeTiers = (formState.tiers || [])
      .filter((t) => t.is_active)
      .sort((a, b) => b.min_deposit - a.min_deposit);

    for (const tier of activeTiers) {
      if (testDepositAmount >= tier.min_deposit) {
        if (tier.max_deposit !== null && testDepositAmount > tier.max_deposit) {
          continue;
        }

        let bonus = 0;
        if (tier.calculation_type === 'PERCENTAGE') {
          bonus = Math.round(testDepositAmount * tier.bonus_rate * 100) / 100;
        } else {
          bonus = tier.bonus_fixed_amount;
        }

        if (tier.max_bonus_amount !== null && bonus > tier.max_bonus_amount) {
          bonus = tier.max_bonus_amount;
        }

        const effectiveRate = testDepositAmount > 0 ? (bonus / testDepositAmount) * 100 : 0;
        return { bonus, ratePercent: effectiveRate, matchedTier: tier };
      }
    }

    return { bonus: 0, ratePercent: 0, matchedTier: null };
  }, [formState, testDepositAmount]);

  // Open Tier modal for Add / Edit
  const handleOpenAddTier = () => {
    setEditingTierIndex(null);
    setTierForm({
      tier_name: `Tier ${(formState?.tiers.length || 0) + 1}`,
      min_deposit: 1000,
      max_deposit: null,
      calculation_type: 'PERCENTAGE',
      bonus_rate: 0.05,
      bonus_fixed_amount: 0,
      max_bonus_amount: null,
      is_active: true,
      sort_order: (formState?.tiers.length || 0) + 1,
    });
    setTierModalOpen(true);
  };

  const handleOpenEditTier = (index: number) => {
    if (!formState || !formState.tiers[index]) return;
    setEditingTierIndex(index);
    setTierForm({ ...formState.tiers[index] });
    setTierModalOpen(true);
  };

  const handleSaveTierModal = () => {
    if (!formState) return;
    if (!tierForm.tier_name.trim()) {
      alert('Please specify a tier name');
      return;
    }
    if (tierForm.min_deposit < 0) {
      alert('Minimum deposit must be non-negative');
      return;
    }

    const updatedTiers = [...formState.tiers];
    if (editingTierIndex !== null) {
      updatedTiers[editingTierIndex] = { ...tierForm };
    } else {
      updatedTiers.push({ ...tierForm });
    }

    // Auto sort tiers by min_deposit
    updatedTiers.sort((a, b) => a.min_deposit - b.min_deposit);
    updatedTiers.forEach((t, idx) => {
      t.sort_order = idx + 1;
    });

    setFormState({
      ...formState,
      tiers: updatedTiers,
    });
    setTierModalOpen(false);
  };

  const handleDeleteTier = (index: number) => {
    if (!formState) return;
    const updatedTiers = formState.tiers.filter((_, idx) => idx !== index);
    updatedTiers.forEach((t, idx) => {
      t.sort_order = idx + 1;
    });
    setFormState({
      ...formState,
      tiers: updatedTiers,
    });
  };

  const handleToggleTierActive = (index: number) => {
    if (!formState) return;
    const updatedTiers = [...formState.tiers];
    updatedTiers[index] = {
      ...updatedTiers[index],
      is_active: !updatedTiers[index].is_active,
    };
    setFormState({
      ...formState,
      tiers: updatedTiers,
    });
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-16 space-y-4 text-slate-400">
        <RefreshCw className="w-8 h-8 animate-spin text-amber-400" />
        <p className="text-sm font-medium">Loading Wallet & Reward Settings...</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8 font-sans text-slate-100">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <Sparkles className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white tracking-tight">Wallet & Rewards Settings</h1>
              <p className="text-xs text-slate-400 mt-0.5">
                Centralized multi-country promotional credit controls, lifetime reward eligibility, and dynamic top-up bonus tiers.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              setShowHistory(!showHistory);
            }}
            className={`px-3 py-2 text-xs font-semibold rounded-xl border transition-colors flex items-center gap-2 cursor-pointer ${
              showHistory
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border-slate-700'
            }`}
          >
            <History className="w-4 h-4" />
            {showHistory ? 'Hide Audit Trail' : 'View Audit Trail'}
          </button>

          <button
            onClick={() => {
              setNewCountryCode('SG');
              setNewCurrency('SGD');
              setShowAddCountryModal(true);
            }}
            className="px-3.5 py-2 text-xs font-semibold rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 flex items-center gap-2 transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4 text-emerald-400" />
            Add Country
          </button>

          <button
            onClick={() => setShowReasonModal(true)}
            disabled={saving || !formState}
            className="px-4 py-2 text-xs font-bold rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-slate-950 flex items-center gap-2 shadow-lg shadow-amber-500/20 transition-all cursor-pointer"
          >
            {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save Settings
          </button>
        </div>
      </div>

      {/* Notifications */}
      {error && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <div className="text-xs space-y-1">
            <span className="font-bold">Error:</span> {error}
          </div>
        </div>
      )}

      {successMessage && (
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 flex items-start gap-3">
          <CheckCircle2 className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <div className="text-xs font-medium">{successMessage}</div>
        </div>
      )}

      {/* Country Selection Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 border-b border-slate-800/80">
        {allSettings.map((setting) => {
          const isSelected = setting.country_code.toUpperCase() === selectedCountry.toUpperCase();
          const countryName = getCountryDisplayName(setting.country_code);

          return (
            <button
              key={setting.country_code}
              onClick={() => {
                setSelectedCountry(setting.country_code);
                setError(null);
                setSuccessMessage(null);
              }}
              className={`px-4 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-2.5 border transition-all cursor-pointer ${
                isSelected
                  ? 'bg-amber-500/15 border-amber-500/40 text-amber-300 shadow-md'
                  : 'bg-slate-900/60 hover:bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              <Globe className={`w-4 h-4 ${isSelected ? 'text-amber-400' : 'text-slate-500'}`} />
              <span>{countryName} ({setting.country_code})</span>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-slate-800 text-slate-300 border border-slate-700">
                {setting.currency}
              </span>
              {!setting.is_active && (
                <span className="px-1.5 py-0.5 rounded text-[10px] bg-rose-500/20 text-rose-300 border border-rose-500/30">
                  Inactive
                </span>
              )}
            </button>
          );
        })}
      </div>

      {formState && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Controls (2 Cols) */}
          <div className="lg:col-span-2 space-y-8">
            {/* General Country & Status Header */}
            <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center font-bold font-mono text-amber-400 text-sm">
                  {formState.country_code}
                </div>
                <div>
                  <h2 className="text-sm font-bold text-white">
                    {getCountryDisplayName(formState.country_code)} — {formState.currency}
                  </h2>
                  <div className="flex items-center gap-3 text-xs text-slate-400 mt-0.5">
                    <span>Version: <strong className="text-slate-300">v{formState.version}</strong></span>
                    <span>•</span>
                    <span>Last Updated: <strong className="text-slate-300">{new Date(formState.updated_at).toLocaleDateString()}</strong></span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-slate-300">
                  <input
                    type="checkbox"
                    checked={formState.is_active}
                    onChange={(e) => setFormState({ ...formState, is_active: e.target.checked })}
                    className="w-4 h-4 rounded text-amber-500 bg-slate-800 border-slate-700 focus:ring-amber-500"
                  />
                  <span>Configuration Active</span>
                </label>
              </div>
            </div>

            {/* 1. Welcome Credit Card */}
            <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    <Gift className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">Welcome Credit</h3>
                    <p className="text-xs text-slate-400">
                      Granted strictly once per owner user account upon creating their first organization.
                    </p>
                  </div>
                </div>

                <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-300">
                  <input
                    type="checkbox"
                    checked={formState.welcome_credit_enabled}
                    onChange={(e) => setFormState({ ...formState, welcome_credit_enabled: e.target.checked })}
                    className="w-4 h-4 rounded text-emerald-500 bg-slate-800 border-slate-700 focus:ring-emerald-500"
                  />
                  <span>Enabled</span>
                </label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Credit Amount ({formState.currency})
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-xs font-mono text-slate-500">
                      {formState.currency}
                    </span>
                    <input
                      type="number"
                      step="1"
                      min="0"
                      value={formState.welcome_credit_amount}
                      onChange={(e) => setFormState({ ...formState, welcome_credit_amount: Number(e.target.value) })}
                      className="w-full pl-14 pr-4 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm font-mono text-white focus:outline-none focus:border-amber-500"
                    />
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800/80 text-xs text-slate-400 flex items-start gap-2.5">
                  <Shield className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                  <p className="leading-relaxed">
                    Organization members and subsequent organizations created by the same owner initialize with 0.00 credit.
                  </p>
                </div>
              </div>
            </div>

            {/* 2. Showcase Reward Credit Card */}
            <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
                    <Sparkles className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">Event Showcase Reward Credit</h3>
                    <p className="text-xs text-slate-400">
                      Granted to an account owner upon administrative approval of their first completed event showcase.
                    </p>
                  </div>
                </div>

                <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-300">
                  <input
                    type="checkbox"
                    checked={formState.showcase_credit_enabled}
                    onChange={(e) => setFormState({ ...formState, showcase_credit_enabled: e.target.checked })}
                    className="w-4 h-4 rounded text-amber-500 bg-slate-800 border-slate-700 focus:ring-amber-500"
                  />
                  <span>Enabled</span>
                </label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Credit Amount ({formState.currency})
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-xs font-mono text-slate-500">
                      {formState.currency}
                    </span>
                    <input
                      type="number"
                      step="1"
                      min="0"
                      value={formState.showcase_credit_amount}
                      onChange={(e) => setFormState({ ...formState, showcase_credit_amount: Number(e.target.value) })}
                      className="w-full pl-14 pr-4 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm font-mono text-white focus:outline-none focus:border-amber-500"
                    />
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800/80 text-xs text-slate-400 flex items-start gap-2.5">
                  <Shield className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                  <p className="leading-relaxed">
                    Showcase approval is decoupled from publishing and is strictly an owner-level reward (limit 1 per user lifetime).
                  </p>
                </div>
              </div>
            </div>

            {/* 3. Top-Up Promotional Bonus Tiers */}
            <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                    <Coins className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">Top-Up Bonus Tiers & Rules</h3>
                    <p className="text-xs text-slate-400">
                      Configure dynamic promotional credits awarded on single wallet top-up transactions.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-300">
                    <input
                      type="checkbox"
                      checked={formState.topup_bonus_enabled}
                      onChange={(e) => setFormState({ ...formState, topup_bonus_enabled: e.target.checked })}
                      className="w-4 h-4 rounded text-cyan-500 bg-slate-800 border-slate-700 focus:ring-cyan-500"
                    />
                    <span>Bonus Enabled</span>
                  </label>

                  <button
                    onClick={handleOpenAddTier}
                    className="px-3 py-1.5 text-xs font-bold rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center gap-1.5 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5 text-cyan-400" />
                    Add Tier
                  </button>
                </div>
              </div>

              {/* Event Credit Cap Setting */}
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800/80 grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
                <div>
                  <label className="block text-xs font-semibold text-white mb-1">
                    Max Top-Up Credit Applied Per Event
                  </label>
                  <p className="text-[11px] text-slate-400">
                    Percentage of event price payable using promotional top-up credits (Default: 20%).
                  </p>
                </div>
                <div className="flex items-center gap-3 justify-end">
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={formState.max_topup_credit_per_event_percent}
                    onChange={(e) => setFormState({ ...formState, max_topup_credit_per_event_percent: Number(e.target.value) })}
                    className="w-36 accent-cyan-400"
                  />
                  <span className="font-mono text-sm font-bold text-cyan-400 w-14 text-right">
                    {Math.round(formState.max_topup_credit_per_event_percent * 100)}%
                  </span>
                </div>
              </div>

              {/* Tiers Table */}
              <div className="space-y-3">
                {formState.tiers.length === 0 ? (
                  <div className="p-8 text-center border border-dashed border-slate-800 rounded-xl text-slate-500 text-xs">
                    No top-up bonus tiers configured for {formState.country_code}. Click "Add Tier" to create one.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-slate-800 text-slate-400">
                          <th className="py-2.5 px-3 font-semibold">Tier Name</th>
                          <th className="py-2.5 px-3 font-semibold">Deposit Range</th>
                          <th className="py-2.5 px-3 font-semibold">Bonus Rule</th>
                          <th className="py-2.5 px-3 font-semibold">Max Bonus</th>
                          <th className="py-2.5 px-3 font-semibold">Status</th>
                          <th className="py-2.5 px-3 font-semibold text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60 font-mono">
                        {formState.tiers.map((tier, idx) => (
                          <tr key={tier.id || idx} className={`hover:bg-slate-800/30 transition-colors ${!tier.is_active ? 'opacity-50' : ''}`}>
                            <td className="py-3 px-3 font-sans font-medium text-slate-200">
                              {tier.tier_name}
                            </td>
                            <td className="py-3 px-3 text-slate-300">
                              {formState.currency} {tier.min_deposit.toLocaleString()}
                              {tier.max_deposit ? ` - ${formState.currency} ${tier.max_deposit.toLocaleString()}` : '+'}
                            </td>
                            <td className="py-3 px-3 text-cyan-300 font-semibold">
                              {tier.calculation_type === 'PERCENTAGE'
                                ? `${(tier.bonus_rate * 100).toFixed(1)}%`
                                : `${formState.currency} ${tier.bonus_fixed_amount.toFixed(2)} Fixed`}
                            </td>
                            <td className="py-3 px-3 text-slate-400">
                              {tier.max_bonus_amount !== null
                                ? `${formState.currency} ${tier.max_bonus_amount.toFixed(2)}`
                                : 'None'}
                            </td>
                            <td className="py-3 px-3">
                              <button
                                onClick={() => handleToggleTierActive(idx)}
                                className={`px-2 py-0.5 rounded text-[10px] font-sans font-semibold cursor-pointer border ${
                                  tier.is_active
                                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                                    : 'bg-slate-800 text-slate-400 border-slate-700'
                                }`}
                              >
                                {tier.is_active ? 'Active' : 'Disabled'}
                              </button>
                            </td>
                            <td className="py-3 px-3 text-right">
                              <div className="flex items-center justify-end gap-1.5 font-sans">
                                <button
                                  onClick={() => handleOpenEditTier(idx)}
                                  className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-200 cursor-pointer"
                                  title="Edit Tier"
                                >
                                  <Edit3 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => handleDeleteTier(idx)}
                                  className="p-1.5 rounded-lg hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 cursor-pointer"
                                  title="Delete Tier"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Sidebar / Live Calculator (1 Col) */}
          <div className="space-y-6">
            {/* Live Interactive Simulator */}
            <div className="p-6 rounded-2xl bg-gradient-to-b from-slate-900 to-slate-950 border border-slate-800 space-y-5 sticky top-6 shadow-xl">
              <div className="flex items-center gap-2.5 pb-4 border-b border-slate-800">
                <Calculator className="w-5 h-5 text-amber-400" />
                <div>
                  <h3 className="text-sm font-bold text-white">Live Tier Calculator</h3>
                  <p className="text-[11px] text-slate-400">Simulate customer top-up bonus</p>
                </div>
              </div>

              <div className="space-y-3">
                <label className="block text-xs font-semibold text-slate-300">
                  Simulated Deposit Amount ({formState.currency})
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-xs font-mono text-slate-500">
                    {formState.currency}
                  </span>
                  <input
                    type="number"
                    step="500"
                    min="100"
                    value={testDepositAmount}
                    onChange={(e) => setTestDepositAmount(Math.max(0, Number(e.target.value)))}
                    className="w-full pl-14 pr-4 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-sm font-mono text-white focus:outline-none focus:border-amber-500"
                  />
                </div>

                {/* Preset quick test buttons */}
                <div className="grid grid-cols-3 gap-1.5 pt-1">
                  {[2000, 6000, 10000].map((amt) => (
                    <button
                      key={amt}
                      onClick={() => setTestDepositAmount(amt)}
                      className="px-2 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-800 text-[11px] font-mono text-slate-300 border border-slate-700/60 transition-colors cursor-pointer"
                    >
                      +{amt.toLocaleString()}
                    </button>
                  ))}
                </div>
              </div>

              {/* Simulation Result Box */}
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3 font-mono text-xs">
                <div className="flex justify-between items-center text-slate-400">
                  <span>Customer Deposit:</span>
                  <span className="text-slate-200">{formState.currency} {testDepositAmount.toLocaleString()}</span>
                </div>

                <div className="flex justify-between items-center text-slate-400">
                  <span>Matched Tier:</span>
                  <span className="text-amber-400 font-sans font-medium">
                    {calculatedBonus.matchedTier ? calculatedBonus.matchedTier.tier_name : 'No Bonus (Below min tier)'}
                  </span>
                </div>

                <div className="flex justify-between items-center text-slate-400">
                  <span>Promotional Credit:</span>
                  <span className="text-emerald-400 font-bold">
                    +{formState.currency} {calculatedBonus.bonus.toFixed(2)}
                  </span>
                </div>

                <div className="flex justify-between items-center text-slate-400">
                  <span>Effective Bonus %:</span>
                  <span className="text-cyan-400 font-bold">
                    {calculatedBonus.ratePercent.toFixed(1)}%
                  </span>
                </div>

                <div className="pt-3 border-t border-slate-800 flex justify-between items-center text-sm font-bold">
                  <span className="text-white">Total Wallet Credit:</span>
                  <span className="text-white">
                    {formState.currency} {(testDepositAmount + calculatedBonus.bonus).toFixed(2)}
                  </span>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-300 flex items-start gap-2">
                <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <p className="leading-relaxed">
                  Top-up credit calculations are strictly per transaction using integer cents arithmetic.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Audit Trail Section */}
      {showHistory && (
        <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div className="flex items-center gap-2.5">
              <History className="w-5 h-5 text-amber-400" />
              <h3 className="text-sm font-bold text-white">
                Audit Trail & History — {selectedCountry}
              </h3>
            </div>
            <button
              onClick={() => fetchHistory(selectedCountry)}
              disabled={historyLoading}
              className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-200 cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${historyLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {history.length === 0 ? (
            <div className="p-8 text-center text-slate-500 text-xs">
              No historical configuration snapshots recorded for {selectedCountry} yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400">
                    <th className="py-2.5 px-3 font-semibold">Version</th>
                    <th className="py-2.5 px-3 font-semibold">Date & Time</th>
                    <th className="py-2.5 px-3 font-semibold">Changed By</th>
                    <th className="py-2.5 px-3 font-semibold">Change Reason</th>
                    <th className="py-2.5 px-3 font-semibold">Snapshot Summary</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  {history.map((record) => (
                    <tr key={record.id} className="hover:bg-slate-800/30">
                      <td className="py-3 px-3 text-amber-400 font-bold">
                        v{record.version}
                      </td>
                      <td className="py-3 px-3 text-slate-300">
                        {new Date(record.created_at).toLocaleString()}
                      </td>
                      <td className="py-3 px-3 font-sans text-slate-400">
                        {record.changed_by || 'Developer Admin'}
                      </td>
                      <td className="py-3 px-3 font-sans text-slate-200">
                        {record.change_reason || '—'}
                      </td>
                      <td className="py-3 px-3 text-slate-400 text-[11px]">
                        Welcome: {record.snapshot?.currency} {record.snapshot?.welcome_credit_amount} | Showcase: {record.snapshot?.showcase_credit_amount} | Tiers: {record.snapshot?.tiers?.length || 0}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Confirmation & Reason Modal */}
      {showReasonModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Save className="w-4 h-4 text-amber-400" />
                Confirm Changes for {formState?.country_code}
              </h3>
              <button
                onClick={() => setShowReasonModal(false)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Updating these settings creates an authoritative new version (v{(formState?.version || 1) + 1}) in the database audit log.
            </p>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Reason for change (Required for audit trail)
              </label>
              <textarea
                rows={3}
                value={changeReason}
                onChange={(e) => setChangeReason(e.target.value)}
                placeholder="e.g., Updated Singapore tier threshold to match local marketing campaign..."
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-amber-500"
              />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setShowReasonModal(false)}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveConfirmed}
                disabled={saving}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-600 text-slate-950 flex items-center gap-2 cursor-pointer"
              >
                {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Confirm & Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add / Edit Tier Modal */}
      {tierModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="max-w-lg w-full bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Coins className="w-4 h-4 text-cyan-400" />
                {editingTierIndex !== null ? 'Edit Top-Up Tier' : 'Add Top-Up Tier'}
              </h3>
              <button
                onClick={() => setTierModalOpen(false)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-300 mb-1">Tier Name</label>
                <input
                  type="text"
                  value={tierForm.tier_name}
                  onChange={(e) => setTierForm({ ...tierForm, tier_name: e.target.value })}
                  placeholder="e.g. Tier 1 (5% Bonus)"
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-300 mb-1">
                    Min Deposit ({formState?.currency})
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={tierForm.min_deposit}
                    onChange={(e) => setTierForm({ ...tierForm, min_deposit: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono focus:outline-none focus:border-cyan-500"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-300 mb-1">
                    Max Deposit (Optional)
                  </label>
                  <input
                    type="number"
                    min="0"
                    placeholder="No upper limit"
                    value={tierForm.max_deposit !== null ? tierForm.max_deposit : ''}
                    onChange={(e) => setTierForm({ ...tierForm, max_deposit: e.target.value === '' ? null : Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono focus:outline-none focus:border-cyan-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-300 mb-1">Calculation Type</label>
                  <select
                    value={tierForm.calculation_type}
                    onChange={(e) => setTierForm({ ...tierForm, calculation_type: e.target.value as any })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-cyan-500"
                  >
                    <option value="PERCENTAGE">Percentage (%)</option>
                    <option value="FIXED">Fixed Amount</option>
                  </select>
                </div>

                <div>
                  {tierForm.calculation_type === 'PERCENTAGE' ? (
                    <>
                      <label className="block font-semibold text-slate-300 mb-1">Bonus Rate (0.05 = 5%)</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        max="1"
                        value={tierForm.bonus_rate}
                        onChange={(e) => setTierForm({ ...tierForm, bonus_rate: Number(e.target.value) })}
                        className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono focus:outline-none focus:border-cyan-500"
                      />
                    </>
                  ) : (
                    <>
                      <label className="block font-semibold text-slate-300 mb-1">Fixed Bonus ({formState?.currency})</label>
                      <input
                        type="number"
                        min="0"
                        value={tierForm.bonus_fixed_amount}
                        onChange={(e) => setTierForm({ ...tierForm, bonus_fixed_amount: Number(e.target.value) })}
                        className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono focus:outline-none focus:border-cyan-500"
                      />
                    </>
                  )}
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-300 mb-1">
                  Max Bonus Cap (Optional {formState?.currency})
                </label>
                <input
                  type="number"
                  min="0"
                  placeholder="Unlimited"
                  value={tierForm.max_bonus_amount !== null ? tierForm.max_bonus_amount : ''}
                  onChange={(e) => setTierForm({ ...tierForm, max_bonus_amount: e.target.value === '' ? null : Number(e.target.value) })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div className="pt-2">
                <label className="flex items-center gap-2 cursor-pointer font-medium text-slate-300">
                  <input
                    type="checkbox"
                    checked={tierForm.is_active}
                    onChange={(e) => setTierForm({ ...tierForm, is_active: e.target.checked })}
                    className="w-4 h-4 rounded text-cyan-500 bg-slate-800 border-slate-700"
                  />
                  <span>Tier is Active</span>
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
              <button
                onClick={() => setTierModalOpen(false)}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveTierModal}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-cyan-500 hover:bg-cyan-600 text-slate-950 cursor-pointer"
              >
                Apply to Configuration
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Country Configuration Modal */}
      {showAddCountryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Globe className="w-4 h-4 text-emerald-400" />
                Add Country Configuration
              </h3>
              <button
                onClick={() => setShowAddCountryModal(false)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-300 mb-1">Select Country</label>
                <select
                  value={newCountryCode}
                  onChange={(e) => {
                    const code = e.target.value;
                    setNewCountryCode(code);
                    const suggestedCurrency = getCurrencyForCountry(code) || 'USD';
                    setNewCurrency(suggestedCurrency);
                  }}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-emerald-500"
                >
                  {COUNTRIES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.name} ({c.code}) - {c.currencyCode}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-300 mb-1">ISO Currency Code</label>
                <input
                  type="text"
                  maxLength={3}
                  value={newCurrency}
                  onChange={(e) => setNewCurrency(e.target.value.toUpperCase())}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
              <button
                onClick={() => setShowAddCountryModal(false)}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateNewCountry}
                disabled={saving}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-500 hover:bg-emerald-600 text-slate-950 cursor-pointer"
              >
                Create Configuration
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
