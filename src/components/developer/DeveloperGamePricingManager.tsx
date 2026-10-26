import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useLocalization } from '../../context/LocalizationContext';
import { apiFetch } from '../../lib/api';
import { PlatformGame } from '../../types/developer';
import { CustomDatePicker } from '../common/CustomDatePicker';
import {
  COUNTRIES,
  POPULAR_COUNTRY_CODES,
  getCountryByCode,
  getCountryDisplayName,
  getCurrencyForCountry,
} from '../../lib/countryUtils';
import {
  Coins,
  DollarSign,
  Tag,
  Edit3,
  Check,
  RefreshCw,
  AlertCircle,
  TrendingUp,
  Layers,
  Sparkles,
  Calendar,
  Sliders,
  X,
  Plus,
  Trash2,
  Clock,
  ArrowRight,
  Calculator,
  CheckCircle2,
  Star,
  ShieldCheck,
  HelpCircle,
  Globe,
  Info,
} from 'lucide-react';

export interface GamePricingTier {
  id: string;
  game_id: string;
  country_code?: string;
  min_days: number;
  max_days: number | null;
  price: number;
  currency: string;
  is_active: boolean;
  is_base: boolean;
  created_at?: string;
  updated_at?: string;
}

interface DeveloperGamePricingManagerProps {
  game: PlatformGame;
  onPricingUpdated?: () => void;
}

interface QuickTierDraft {
  min_days: number;
  max_days: number | null;
  price: string;
  is_base: boolean;
  label: string;
}

const STANDARD_TIER_RANGES: Array<{ min_days: number; max_days: number | null; is_base: boolean; label: string }> = [
  { min_days: 1, max_days: 1, is_base: true, label: '1 Day (Base Tier)' },
  { min_days: 2, max_days: 2, is_base: false, label: '2 Days' },
  { min_days: 3, max_days: 3, is_base: false, label: '3 Days' },
  { min_days: 4, max_days: 7, is_base: false, label: '4–7 Days' },
  { min_days: 8, max_days: 14, is_base: false, label: '8–14 Days' },
  { min_days: 15, max_days: 30, is_base: false, label: '15–30 Days' },
  { min_days: 31, max_days: null, is_base: false, label: '31+ Days (Extended)' },
];

export const DeveloperGamePricingManager: React.FC<DeveloperGamePricingManagerProps> = ({
  game,
  onPricingUpdated,
}) => {
  const { t } = useLocalization();
  const [tiers, setTiers] = useState<GamePricingTier[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Country Selection State
  const [selectedCountry, setSelectedCountry] = useState<string>('US');
  const [hasManuallySelectedCountry, setHasManuallySelectedCountry] = useState<boolean>(false);
  const [defaultPricingCountry, setDefaultPricingCountry] = useState<string>('US');

  // Form State for Add / Edit
  const [editingTierId, setEditingTierId] = useState<string | null>(null);
  const [isAddingTier, setIsAddingTier] = useState<boolean>(false);
  const [formCountryCode, setFormCountryCode] = useState<string>('US');
  const [formMinDays, setFormMinDays] = useState<string>('1');
  const [formMaxDays, setFormMaxDays] = useState<string>('1');
  const [formIsUnlimited, setFormIsUnlimited] = useState<boolean>(false);
  const [formPrice, setFormPrice] = useState<string>('');
  const [formCurrency, setFormCurrency] = useState<string>('USD');
  const [formIsActive, setFormIsActive] = useState<boolean>(true);
  const [formIsBase, setFormIsBase] = useState<boolean>(false);

  // Quick Setup Modal State
  const [showQuickSetupModal, setShowQuickSetupModal] = useState<boolean>(false);
  const [quickTiers, setQuickTiers] = useState<QuickTierDraft[]>([]);

  // Simulator State
  const [simStartDate, setSimStartDate] = useState<string>(() => {
    const d = new Date();
    return d.toISOString().split('T')[0];
  });
  const [simEndDate, setSimEndDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 2); // 3 days
    return d.toISOString().split('T')[0];
  });

  const getHeaders = useCallback(() => {
    const token = localStorage.getItem('app_token');
    return {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  }, []);

  const loadTiers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/developer/games/${game.id}/pricing`, {
        headers: getHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.tiers)) {
          const sorted = data.tiers.sort((a: GamePricingTier, b: GamePricingTier) => a.min_days - b.min_days);
          setTiers(sorted);

          // If user has not explicitly clicked a country, pick default or first configured country
          if (!hasManuallySelectedCountry && sorted.length > 0) {
            const configuredCodes = Array.from(
              new Set(sorted.map((t: GamePricingTier) => (t.country_code || defaultPricingCountry).toUpperCase()))
            );
            if (!configuredCodes.includes(selectedCountry)) {
              if (configuredCodes.includes(defaultPricingCountry)) {
                setSelectedCountry(defaultPricingCountry);
              } else if (configuredCodes.includes('US')) {
                setSelectedCountry('US');
              } else {
                setSelectedCountry(configuredCodes[0]);
              }
            }
          }
        }
      } else {
        const errData = await res.json().catch(() => ({}));
        setError(errData.error || errData.message || 'Failed to load game pricing tiers.');
      }
    } catch (err: any) {
      console.error('Error fetching game pricing tiers:', err);
      setError(err.message || 'Failed to connect to server.');
    } finally {
      setLoading(false);
    }
  }, [game.id, getHeaders, hasManuallySelectedCountry]);

  useEffect(() => {
    loadTiers();
  }, [loadTiers]);

  // Load platform default pricing country
  useEffect(() => {
    apiFetch('/api/developer/pricing/settings', { headers: getHeaders() })
      .then((res) => res.json())
      .then((data) => {
        if (data?.settings?.default_pricing_country) {
          setDefaultPricingCountry(data.settings.default_pricing_country.toUpperCase());
        }
      })
      .catch(() => {});
  }, [getHeaders]);

  const showSuccess = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 3500);
  };

  // Groupings by country
  const configuredCountries = useMemo(() => {
    const map = new Map<string, number>();
    tiers.forEach((t) => {
      const c = (t.country_code || defaultPricingCountry).toUpperCase();
      map.set(c, (map.get(c) || 0) + 1);
    });
    return map;
  }, [tiers, defaultPricingCountry]);

  const selectedCurrency = useMemo(() => {
    return getCurrencyForCountry(selectedCountry) || 'USD';
  }, [selectedCountry]);

  const countryTiers = useMemo(() => {
    return tiers
      .filter((t) => (t.country_code || defaultPricingCountry).toUpperCase() === selectedCountry)
      .sort((a, b) => a.min_days - b.min_days);
  }, [tiers, selectedCountry, defaultPricingCountry]);

  const fallbackTiers = useMemo(() => {
    return tiers
      .filter((t) => (t.country_code || defaultPricingCountry).toUpperCase() === defaultPricingCountry)
      .sort((a, b) => a.min_days - b.min_days);
  }, [tiers, defaultPricingCountry]);

  const isUsingFallback = selectedCountry !== defaultPricingCountry && countryTiers.length === 0;

  // Handler for selecting a country
  const handleSelectCountry = (countryCode: string) => {
    const norm = countryCode.trim().toUpperCase();
    setSelectedCountry(norm);
    setHasManuallySelectedCountry(true);
    setIsAddingTier(false);
    setEditingTierId(null);
    setShowQuickSetupModal(false);
  };

  // Open Quick Setup Modal
  const handleOpenQuickSetup = () => {
    setQuickTiers(
      STANDARD_TIER_RANGES.map((r) => {
        // Pre-fill existing price if tier already exists for this exact range
        const existing = countryTiers.find((t) => t.min_days === r.min_days && t.max_days === r.max_days);
        return {
          min_days: r.min_days,
          max_days: r.max_days,
          is_base: r.is_base,
          label: r.label,
          price: existing ? String(existing.price) : '',
        };
      })
    );
    setShowQuickSetupModal(true);
  };

  // Save Quick Setup Tiers
  const handleSaveQuickSetup = async () => {
    const validDrafts = quickTiers.filter((d) => d.price.trim() !== '' && !isNaN(parseFloat(d.price)) && parseFloat(d.price) > 0);
    if (validDrafts.length === 0) {
      setError(`Please enter at least one valid price in ${selectedCurrency}.`);
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const payloadTiers = validDrafts.map((d) => {
        const existing = countryTiers.find((t) => t.min_days === d.min_days && t.max_days === d.max_days);
        return {
          id: existing?.id,
          game_id: game.id,
          country_code: selectedCountry,
          currency: selectedCurrency,
          min_days: d.min_days,
          max_days: d.max_days,
          price: parseFloat(d.price),
          is_active: true,
          is_base: d.is_base,
        };
      });

      const res = await apiFetch(`/api/developer/games/${game.id}/pricing`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify({ tiers: payloadTiers }),
      });

      if (res.ok) {
        showSuccess(`Saved ${validDrafts.length} pricing tiers for ${getCountryDisplayName(selectedCountry)} (${selectedCurrency}).`);
        setShowQuickSetupModal(false);
        await loadTiers();
        if (onPricingUpdated) onPricingUpdated();
      } else {
        const err = await res.json().catch(() => ({}));
        setError(err.error || err.message || 'Failed to save tiers.');
      }
    } catch (err: any) {
      setError(err.message || 'Network error.');
    } finally {
      setSaving(false);
    }
  };

  const handleOpenAdd = () => {
    setIsAddingTier(true);
    setEditingTierId(null);
    setFormCountryCode(selectedCountry);
    setFormCurrency(selectedCurrency);
    // Suggest next min_days based on selected country's tiers
    const maxDay = countryTiers.reduce((acc, currT) => (currT.max_days ? Math.max(acc, currT.max_days) : acc), 0);
    const nextMin = maxDay > 0 ? maxDay + 1 : 1;
    setFormMinDays(String(nextMin));
    setFormMaxDays(String(nextMin));
    setFormIsUnlimited(false);
    setFormPrice(''); // Prompt admin for authoritative price without hardcoding
    setFormIsActive(true);
    setFormIsBase(nextMin === 1);
  };

  const handleOpenEdit = (tier: GamePricingTier) => {
    setEditingTierId(tier.id);
    setIsAddingTier(false);
    const tierCountry = (tier.country_code || selectedCountry).toUpperCase();
    setFormCountryCode(tierCountry);
    setFormMinDays(String(tier.min_days));
    setFormMaxDays(tier.max_days ? String(tier.max_days) : '');
    setFormIsUnlimited(tier.max_days === null);
    setFormPrice(String(tier.price));
    setFormCurrency(tier.currency || getCurrencyForCountry(tierCountry) || 'USD');
    setFormIsActive(tier.is_active);
    setFormIsBase(tier.is_base);
  };

  const handleCancelForm = () => {
    setIsAddingTier(false);
    setEditingTierId(null);
  };

  const handleSaveTier = async () => {
    const minD = parseInt(formMinDays, 10);
    const maxD = formIsUnlimited ? null : (formMaxDays ? parseInt(formMaxDays, 10) : null);
    const priceNum = parseFloat(formPrice);

    if (isNaN(minD) || minD < 1) {
      setError('Minimum days must be an integer >= 1.');
      return;
    }
    if (maxD !== null && (isNaN(maxD) || maxD < minD)) {
      setError('Maximum days must be >= minimum days.');
      return;
    }
    if (isNaN(priceNum) || priceNum <= 0) {
      setError('Price must be greater than zero.');
      return;
    }

    const normCountry = formCountryCode.trim().toUpperCase();

    // Client-side overlap validation scoped strictly to the SAME country
    if (formIsActive) {
      const formMax = maxD === null ? Infinity : maxD;
      const conflicting = tiers.find((t) => {
        if (editingTierId && t.id === editingTierId) return false;
        if (!t.is_active) return false;
        if ((t.country_code || defaultPricingCountry).toUpperCase() !== normCountry) return false;
        const tMax = t.max_days === null || t.max_days === undefined ? Infinity : t.max_days;
        return minD <= tMax && t.min_days <= formMax;
      });
      if (conflicting) {
        const existingLabel = conflicting.min_days === conflicting.max_days
          ? `${conflicting.min_days} day`
          : `${conflicting.min_days}–${conflicting.max_days || '+'} days`;
        const newLabel = minD === maxD ? `${minD} day` : `${minD}–${maxD || '+'} days`;
        setError(`Pricing tier range (${newLabel}) for country ${normCountry} overlaps with existing active tier (${existingLabel}). Overlapping active ranges are not permitted.`);
        return;
      }
    }

    setSaving(true);
    setError(null);

    const payload = {
      min_days: minD,
      max_days: maxD,
      price: priceNum,
      currency: formCurrency.toUpperCase(),
      country_code: normCountry,
      is_active: formIsActive,
      is_base: formIsBase,
    };

    try {
      if (editingTierId) {
        // Update existing tier
        const res = await apiFetch(`/api/developer/games/${game.id}/pricing/tier/${editingTierId}`, {
          method: 'PUT',
          headers: getHeaders(),
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          showSuccess(`Pricing tier updated for ${getCountryDisplayName(normCountry)} (${payload.currency}).`);
          handleCancelForm();
          await loadTiers();
          if (onPricingUpdated) onPricingUpdated();
        } else {
          const err = await res.json().catch(() => ({}));
          setError(err.error || err.message || 'Failed to update tier.');
        }
      } else {
        // Create new tier
        const res = await apiFetch(`/api/developer/games/${game.id}/pricing/tier`, {
          method: 'POST',
          headers: getHeaders(),
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          showSuccess(`New pricing tier added for ${getCountryDisplayName(normCountry)} (${payload.currency}).`);
          handleCancelForm();
          await loadTiers();
          if (onPricingUpdated) onPricingUpdated();
        } else {
          const err = await res.json().catch(() => ({}));
          setError(err.error || err.message || 'Failed to create tier.');
        }
      }
    } catch (err: any) {
      setError(err.message || 'Network error.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteTier = async (tier: GamePricingTier) => {
    const label = tier.min_days === tier.max_days ? `${tier.min_days} day` : `${tier.min_days}-${tier.max_days || '+'} days`;
    if (!confirm(`Delete pricing tier (${label} - ${tier.currency} ${tier.price})?`)) return;

    setSaving(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/developer/games/${game.id}/pricing/tier/${tier.id}`, {
        method: 'DELETE',
        headers: getHeaders(),
      });
      if (res.ok) {
        showSuccess('Pricing tier deleted.');
        await loadTiers();
        if (onPricingUpdated) onPricingUpdated();
      } else {
        const err = await res.json().catch(() => ({}));
        setError(err.error || 'Failed to delete tier.');
      }
    } catch (err: any) {
      setError(err.message || 'Network error.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (tier: GamePricingTier) => {
    if (!tier.is_active) {
      const tierMax = tier.max_days === null || tier.max_days === undefined ? Infinity : tier.max_days;
      const tierCountry = (tier.country_code || defaultPricingCountry).toUpperCase();
      const conflicting = tiers.find((t) => {
        if (t.id === tier.id) return false;
        if (!t.is_active) return false;
        if ((t.country_code || defaultPricingCountry).toUpperCase() !== tierCountry) return false;
        const otherMax = t.max_days === null || t.max_days === undefined ? Infinity : t.max_days;
        return tier.min_days <= otherMax && t.min_days <= tierMax;
      });
      if (conflicting) {
        const existingLabel = conflicting.min_days === conflicting.max_days
          ? `${conflicting.min_days} day`
          : `${conflicting.min_days}–${conflicting.max_days || '+'} days`;
        const tierLabel = tier.min_days === tier.max_days
          ? `${tier.min_days} day`
          : `${tier.min_days}–${tier.max_days || '+'} days`;
        setError(`Cannot activate tier (${tierLabel}): it overlaps with existing active tier (${existingLabel}) for country ${tierCountry}.`);
        return;
      }
    }

    setSaving(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/developer/games/${game.id}/pricing/tier/${tier.id}`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify({ is_active: !tier.is_active }),
      });
      if (res.ok) {
        setTiers((prev) =>
          prev.map((t) => (t.id === tier.id ? { ...t, is_active: !t.is_active } : t))
        );
        showSuccess(`Tier ${!tier.is_active ? 'activated' : 'deactivated'}.`);
        if (onPricingUpdated) onPricingUpdated();
      } else {
        const err = await res.json().catch(() => ({}));
        setError(err.error || 'Failed to update status.');
      }
    } catch (err: any) {
      setError(err.message || 'Network error.');
    } finally {
      setSaving(false);
    }
  };

  // Duration Simulator calculation
  const calculatedDuration = useMemo(() => {
    if (!simStartDate || !simEndDate) return 1;
    const start = new Date(simStartDate);
    const end = new Date(simEndDate);
    const diffTime = end.getTime() - start.getTime();
    if (diffTime < 0) return 1;
    return Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1;
  }, [simStartDate, simEndDate]);

  const simulatedQuote = useMemo(() => {
    const days = calculatedDuration;
    // Step 1: Check requested country active tiers
    const activeReqTiers = countryTiers.filter((t) => t.is_active && t.price > 0);
    const exactReq = activeReqTiers.find((t) => t.min_days === days && t.max_days === days);
    if (exactReq) {
      return {
        price: exactReq.price,
        currency: exactReq.currency || selectedCurrency,
        ruleLabel: `${days} day${days > 1 ? 's' : ''} (Exact Tier)`,
        tier: exactReq,
        hasTier: true,
        pricingCountry: selectedCountry,
        isFallback: false,
      };
    }
    const bracketReq = activeReqTiers.find((t) => t.min_days <= days && (t.max_days === null || t.max_days >= days));
    if (bracketReq) {
      const label = bracketReq.max_days === null ? `${bracketReq.min_days}+ days` : `${bracketReq.min_days}–${bracketReq.max_days} days`;
      return {
        price: bracketReq.price,
        currency: bracketReq.currency || selectedCurrency,
        ruleLabel: `${label} Bracket`,
        tier: bracketReq,
        hasTier: true,
        pricingCountry: selectedCountry,
        isFallback: false,
      };
    }

    // Step 2: Fall back to default pricing country if different
    if (selectedCountry !== defaultPricingCountry) {
      const fallbackCurr = getCurrencyForCountry(defaultPricingCountry) || 'USD';
      const activeDefTiers = fallbackTiers.filter((t) => t.is_active && t.price > 0);

      if (activeDefTiers.length > 0) {
        // Case A: default country has active tiers for this game
        // US becomes the fallback pricing country. If duration does not match, DO NOT continue to MY!
        const exactDef = activeDefTiers.find((t) => t.min_days === days && t.max_days === days);
        if (exactDef) {
          return {
            price: exactDef.price,
            currency: exactDef.currency || fallbackCurr,
            ruleLabel: `${days} day${days > 1 ? 's' : ''} (Fallback Exact Tier)`,
            tier: exactDef,
            hasTier: true,
            pricingCountry: defaultPricingCountry,
            isFallback: true,
          };
        }
        const bracketDef = activeDefTiers.find((t) => t.min_days <= days && (t.max_days === null || t.max_days >= days));
        if (bracketDef) {
          const label = bracketDef.max_days === null ? `${bracketDef.min_days}+ days` : `${bracketDef.min_days}–${bracketDef.max_days} days`;
          return {
            price: bracketDef.price,
            currency: bracketDef.currency || fallbackCurr,
            ruleLabel: `${label} Bracket (Fallback)`,
            tier: bracketDef,
            hasTier: true,
            pricingCountry: defaultPricingCountry,
            isFallback: true,
          };
        }
      } else {
        // Case B: default country has ZERO active tiers for this game. Check secondary fallback MY!
        const myTiers = tiers.filter((t) => (t.country_code || '').toUpperCase() === 'MY' && t.is_active && t.price > 0);
        const exactMY = myTiers.find((t) => t.min_days === days && t.max_days === days);
        if (exactMY) {
          return {
            price: exactMY.price,
            currency: exactMY.currency || 'MYR',
            ruleLabel: `${days} day${days > 1 ? 's' : ''} (Secondary MY Fallback)`,
            tier: exactMY,
            hasTier: true,
            pricingCountry: 'MY',
            isFallback: true,
          };
        }
        const bracketMY = myTiers.find((t) => t.min_days <= days && (t.max_days === null || t.max_days >= days));
        if (bracketMY) {
          const label = bracketMY.max_days === null ? `${bracketMY.min_days}+ days` : `${bracketMY.min_days}–${bracketMY.max_days} days`;
          return {
            price: bracketMY.price,
            currency: bracketMY.currency || 'MYR',
            ruleLabel: `${label} Bracket (Secondary MY Fallback)`,
            tier: bracketMY,
            hasTier: true,
            pricingCountry: 'MY',
            isFallback: true,
          };
        }
      }
    }

    // 3. No match! Fail closed: Admin panel reflects exact public behavior
    return {
      price: null,
      currency: selectedCurrency,
      ruleLabel: `No Active Tier Covers ${days} Days in ${selectedCountry} or Fallback ${defaultPricingCountry}`,
      hasTier: false,
      pricingCountry: selectedCountry,
      isFallback: false,
    };
  }, [calculatedDuration, countryTiers, fallbackTiers, selectedCountry, defaultPricingCountry, selectedCurrency]);

  const selectedCountryInfo = getCountryByCode(selectedCountry);

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {successMsg && (
        <div className="fixed top-6 right-6 z-50 flex items-center space-x-2 px-4 py-3 bg-emerald-600 text-white text-xs font-semibold rounded-xl shadow-2xl animate-in slide-in-from-top-4">
          <Check className="w-4 h-4" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Error Alert */}
      {error && (
        <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-800 text-rose-300 text-xs flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-rose-400 hover:text-rose-200">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Architecture Context Banner */}
      <div className="p-4 rounded-2xl bg-gradient-to-r from-amber-950/40 via-slate-900 to-amber-950/20 border border-amber-500/20 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start space-x-3">
          <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 shrink-0 mt-0.5">
            <Coins className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-white flex items-center gap-2">
              Country-Based Pricing: {game.name}
              <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                Authoritative Multi-Country
              </span>
            </h4>
            <p className="text-xs text-slate-400 mt-1 max-w-2xl leading-relaxed">
              Duration pricing tiers belong to a specific country and currency. Different countries have independent duration tiers for this game. Unconfigured countries fall back to {getCountryDisplayName(defaultPricingCountry)} ({defaultPricingCountry}).
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={loadTiers}
            disabled={loading}
            className="flex items-center space-x-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl border border-slate-700 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>{t('common.refresh')}</span>
          </button>
          <button
            onClick={handleOpenQuickSetup}
            disabled={saving}
            className="flex items-center space-x-1.5 px-3 py-2 bg-slate-800 hover:bg-amber-500/20 text-amber-400 hover:text-amber-300 text-xs font-semibold rounded-xl border border-amber-500/30 transition-colors"
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>{t('developer.quickSetupStandardTiers', undefined, 'Quick Setup Tiers')}</span>
          </button>
          <button
            onClick={handleOpenAdd}
            className="flex items-center space-x-1.5 px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold rounded-xl shadow-lg shadow-amber-950/30 transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>{t('developer.addDurationTier', undefined, 'Add Duration Tier')}</span>
          </button>
        </div>
      </div>

      {/* Country Selector Header & Tabs */}
      <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Globe className="w-5 h-5 text-amber-400 shrink-0" />
            <div>
              <span className="text-xs font-bold text-white block">{t('developer.pricingCountry', undefined, 'Pricing Country')}</span>
              <span className="text-[11px] text-slate-400">
                Choose the target country to view and manage its duration tiers independently
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <select
              id="developer-pricing-country-select"
              value={selectedCountry}
              onChange={(e) => handleSelectCountry(e.target.value)}
              className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white font-semibold text-xs focus:border-amber-500 focus:outline-none"
            >
              <optgroup label="Configured Countries for this Game">
                {Array.from<string>(configuredCountries.keys()).map((c: string) => {
                  const countryInfo = getCountryByCode(c);
                  const count = configuredCountries.get(c) || 0;
                  return (
                    <option key={`cfg-${c}`} value={c}>
                      {countryInfo?.flag || '🌐'} {countryInfo?.name || c} ({getCurrencyForCountry(c) || 'USD'}) — {count} tier{count !== 1 ? 's' : ''}
                    </option>
                  );
                })}
              </optgroup>
              <optgroup label="Popular Countries">
                {POPULAR_COUNTRY_CODES.map((c) => {
                  const countryInfo = getCountryByCode(c);
                  const count = configuredCountries.get(c) || 0;
                  return (
                    <option key={`pop-${c}`} value={c}>
                      {countryInfo?.flag || '🌐'} {countryInfo?.name || c} ({countryInfo?.currencyCode || 'USD'}) {count > 0 ? `(${count} tiers)` : ''}
                    </option>
                  );
                })}
              </optgroup>
              <optgroup label="All Supported Countries">
                {COUNTRIES.map((country) => {
                  const count = configuredCountries.get(country.code) || 0;
                  return (
                    <option key={`all-${country.code}`} value={country.code}>
                      {country.flag} {country.name} ({country.currencyCode}) {count > 0 ? `(${count} tiers)` : ''}
                    </option>
                  );
                })}
              </optgroup>
            </select>

            <div className="px-3 py-2 bg-amber-500/10 border border-amber-500/30 rounded-xl text-xs font-mono font-bold text-amber-300">
              {selectedCurrency}
            </div>
          </div>
        </div>

        {/* Quick Country Switcher Tabs */}
        <div className="flex items-center gap-2 flex-wrap pt-2 border-t border-slate-800/80">
          <span className="text-[10px] uppercase font-semibold text-slate-500 tracking-wider">{t('developer.quickSwitch', undefined, 'Quick Switch:')}</span>
          {Array.from<string>(configuredCountries.keys()).map((c: string) => {
            const countryInfo = getCountryByCode(c);
            const count = configuredCountries.get(c) || 0;
            const isSelected = selectedCountry === c;
            return (
              <button
                key={`tab-${c}`}
                type="button"
                onClick={() => handleSelectCountry(c)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                  isSelected
                    ? 'bg-amber-500 text-slate-950 shadow-md font-bold'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
                }`}
              >
                <span>{countryInfo?.flag || '🌐'}</span>
                <span>{countryInfo?.name || c}</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${isSelected ? 'bg-slate-950/20 text-slate-950' : 'bg-slate-900 text-amber-400'}`}>
                  {count}
                </span>
              </button>
            );
          })}

          {!configuredCountries.has('US') && (
            <button
              type="button"
              onClick={() => handleSelectCountry('US')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                selectedCountry === 'US'
                  ? 'bg-amber-500 text-slate-950 font-bold'
                  : 'bg-slate-800/60 hover:bg-slate-700 text-slate-400 border border-dashed border-slate-700'
              }`}
            >
              <span>🇺🇸</span>
              <span>{getCountryDisplayName('US')} (USD)</span>
              <span className="text-[10px] text-amber-400">+{t('common.add', undefined, 'Add')}</span>
            </button>
          )}

          {!configuredCountries.has('MY') && (
            <button
              type="button"
              onClick={() => handleSelectCountry('MY')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                selectedCountry === 'MY'
                  ? 'bg-amber-500 text-slate-950 font-bold'
                  : 'bg-slate-800/60 hover:bg-slate-700 text-slate-400 border border-dashed border-slate-700'
              }`}
            >
              <span>🇲🇾</span>
              <span>{getCountryDisplayName('MY')} (MYR)</span>
              <span className="text-[10px] text-amber-400">+{t('common.add', undefined, 'Add')}</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Grid: Tiers Table + Simulator */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Tiers List (2 cols) */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Tag className="w-4 h-4 text-amber-400" />
                  <span>
                    {getCountryDisplayName(selectedCountry)} Tiers ({selectedCurrency})
                  </span>
                  <span className="text-xs font-mono text-slate-400">({countryTiers.length})</span>
                  {selectedCountry === defaultPricingCountry && (
                    <span className="text-[10px] px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30">
                      Default Country
                    </span>
                  )}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  {countryTiers.length > 0
                    ? `Configured active tiers for events in ${getCountryDisplayName(selectedCountry)}.`
                    : `No pricing tiers configured specifically for ${getCountryDisplayName(selectedCountry)}.`}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleOpenAdd}
                  className="flex items-center space-x-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold rounded-xl transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{t('developer.addTier', undefined, 'Add Tier')}</span>
                </button>
              </div>
            </div>

            {loading ? (
              <div className="py-16 text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500 mx-auto mb-3" />
                <p className="text-xs text-slate-400">{t('developer.loadingGamePricingTiers', undefined, 'Loading game pricing tiers...')}</p>
              </div>
            ) : countryTiers.length === 0 ? (
              /* Empty state for the selected country */
              <div className="text-center py-12 p-6 space-y-4">
                <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mx-auto text-2xl">
                  {selectedCountryInfo?.flag || '🌐'}
                </div>
                <div>
                  <h4 className="text-base font-bold text-white mb-1">
                    No Pricing Configured for {getCountryDisplayName(selectedCountry)}
                  </h4>
                  <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
                    Events created by organizations in {getCountryDisplayName(selectedCountry)} will currently fall back to{' '}
                    <strong className="text-slate-200">{getCountryDisplayName(defaultPricingCountry)}</strong> ({getCurrencyForCountry(defaultPricingCountry) || 'USD'}).
                    Add tiers below to set country-specific pricing in <strong className="text-amber-400">{selectedCurrency}</strong>.
                  </p>
                </div>

                <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                  <button
                    onClick={handleOpenAdd}
                    className="inline-flex items-center space-x-2 px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold rounded-xl shadow-lg shadow-amber-950/30"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Add First Tier for {getCountryDisplayName(selectedCountry)}</span>
                  </button>
                  <button
                    onClick={handleOpenQuickSetup}
                    disabled={saving}
                    className="inline-flex items-center space-x-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl border border-slate-700"
                  >
                    <Sliders className="w-4 h-4 text-amber-400" />
                    <span>{t('developer.quickSetupStandardTiers', undefined, 'Quick Setup Standard Tiers')}</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="divide-y divide-slate-800/60">
                {countryTiers.map((tier) => {
                  const isEditing = editingTierId === tier.id;
                  const durationLabel =
                    tier.min_days === tier.max_days
                      ? `${tier.min_days} day${tier.min_days > 1 ? 's' : ''}`
                      : tier.max_days === null
                      ? `${tier.min_days}+ days`
                      : `${tier.min_days}–${tier.max_days} days`;

                  return (
                    <div
                      key={tier.id}
                      className={`p-4 flex items-center justify-between transition-colors ${
                        isEditing
                          ? 'bg-amber-500/10 border-l-4 border-amber-500'
                          : tier.is_active
                          ? 'hover:bg-slate-800/40'
                          : 'opacity-60 bg-slate-950/30'
                      }`}
                    >
                      <div className="flex items-center space-x-4">
                        <div
                          className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-xs ${
                            tier.is_base
                              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                              : tier.is_active
                              ? 'bg-slate-800 text-slate-200 border border-slate-700'
                              : 'bg-slate-900 text-slate-500 border border-slate-800'
                          }`}
                        >
                          {tier.min_days}d
                        </div>

                        <div>
                          <div className="flex items-center space-x-2">
                            <span className="text-sm font-bold text-white">{durationLabel}</span>
                            {tier.is_base && (
                              <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                <Star className="w-2.5 h-2.5" />
                                <span>{t('developer.baseTier', undefined, 'Base Tier')}</span>
                              </span>
                            )}
                            <span
                              className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                                tier.is_active
                                  ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                                  : 'bg-slate-800 text-slate-400 border border-slate-700'
                              }`}
                            >
                              {tier.is_active ? t('common.active', undefined, 'Active') : t('common.inactive', undefined, 'Inactive')}
                            </span>
                          </div>

                          <div className="text-xs text-slate-400 font-mono mt-0.5">
                            {tier.max_days === null
                              ? `Applies to events lasting ${tier.min_days} or more calendar days`
                              : tier.min_days === tier.max_days
                              ? `Exact ${tier.min_days}-day event license`
                              : `Events between ${tier.min_days} and ${tier.max_days} calendar days`}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center space-x-4">
                        <div className="text-right">
                          <span className="text-base font-extrabold text-white">
                            {tier.currency} {tier.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                          <span className="text-[10px] text-slate-500 block">{t('developer.totalEventLicense', undefined, 'Total Event License')}</span>
                        </div>

                        <div className="flex items-center space-x-1">
                          <button
                            onClick={() => handleToggleActive(tier)}
                            disabled={saving}
                            title={tier.is_active ? t('common.deactivate', undefined, 'Deactivate Tier') : t('common.activate', undefined, 'Activate Tier')}
                            className={`p-2 rounded-xl text-xs font-semibold transition-colors ${
                              tier.is_active
                                ? 'text-emerald-400 hover:bg-emerald-500/10'
                                : 'text-slate-500 hover:bg-slate-800'
                            }`}
                          >
                            <CheckCircle2 className="w-4 h-4" />
                          </button>

                          <button
                            onClick={() => handleOpenEdit(tier)}
                            disabled={saving}
                            title={t('developer.editTier', undefined, 'Edit Tier')}
                            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>

                          <button
                            onClick={() => handleDeleteTier(tier)}
                            disabled={saving}
                            title={t('developer.deleteTier', undefined, 'Delete Tier')}
                            className="p-2 text-slate-400 hover:text-rose-400 hover:bg-rose-950/30 rounded-xl transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Quick Setup Modal / Drawer */}
          {showQuickSetupModal && (
            <div className="p-5 rounded-2xl bg-slate-900 border border-amber-500/30 shadow-xl space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <Sliders className="w-5 h-5 text-amber-400" />
                  <div>
                    <h4 className="text-sm font-bold text-white">
                      Quick Setup Tiers for {getCountryDisplayName(selectedCountry)} ({selectedCurrency})
                    </h4>
                    <p className="text-[11px] text-slate-400">
                      Enter authoritative prices for each day range. Leave blank to omit a tier.
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowQuickSetupModal(false)}
                  className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {quickTiers.map((qt, idx) => (
                  <div key={`qt-${idx}`} className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-slate-200">{qt.label}</span>
                      {qt.is_base && (
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 font-semibold">
                          Base
                        </span>
                      )}
                    </div>
                    <div className="relative">
                      <span className="absolute left-3 top-2 text-xs font-mono text-slate-500 font-bold">
                        {selectedCurrency}
                      </span>
                      <input
                        type="number"
                        min="1"
                        step="0.01"
                        value={qt.price}
                        onChange={(e) => {
                          const val = e.target.value;
                          setQuickTiers((prev) =>
                            prev.map((item, i) => (i === idx ? { ...item, price: val } : item))
                          );
                        }}
                        placeholder="e.g. 500.00"
                        className="w-full pl-14 pr-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-xs font-mono font-bold focus:border-amber-500 focus:outline-none"
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-800">
                <button
                  onClick={() => setShowQuickSetupModal(false)}
                  disabled={saving}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveQuickSetup}
                  disabled={saving}
                  className="flex items-center space-x-1.5 px-5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold rounded-xl shadow-lg shadow-amber-950/30"
                >
                  <Check className="w-4 h-4" />
                  <span>Save All Tiers for {getCountryDisplayName(selectedCountry)}</span>
                </button>
              </div>
            </div>
          )}

          {/* Add / Edit Tier Form Drawer / Card */}
          {(isAddingTier || editingTierId) && (
            <div className="p-5 rounded-2xl bg-slate-900 border border-amber-500/30 shadow-xl animate-in fade-in-50 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-amber-400" />
                  <div>
                    <h4 className="text-sm font-bold text-white">
                      {editingTierId ? 'Edit Pricing Tier' : `Add Duration Tier for ${getCountryDisplayName(formCountryCode)}`}
                    </h4>
                    <span className="text-[11px] text-amber-400 font-mono">
                      Currency: {formCurrency} ({getCountryDisplayName(formCountryCode)})
                    </span>
                  </div>
                </div>
                <button
                  onClick={handleCancelForm}
                  className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">{t('developer.minDaysHeader', undefined, 'Minimum Days')}</label>
                  <input
                    type="number"
                    min="1"
                    value={formMinDays}
                    onChange={(e) => setFormMinDays(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-xs font-mono focus:border-amber-500 focus:outline-none"
                    placeholder="e.g. 1"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-semibold text-slate-300">{t('developer.maxDaysHeader', undefined, 'Maximum Days')}</label>
                    <label className="flex items-center space-x-1 text-[10px] text-amber-400 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formIsUnlimited}
                        onChange={(e) => setFormIsUnlimited(e.target.checked)}
                        className="rounded bg-slate-800 border-slate-700 text-amber-500 focus:ring-0"
                      />
                      <span>{t('developer.unlimitedMaxDays', undefined, 'Unlimited (e.g. 31+)')}</span>
                    </label>
                  </div>
                  <input
                    type="number"
                    min={formMinDays || '1'}
                    disabled={formIsUnlimited}
                    value={formIsUnlimited ? '' : formMaxDays}
                    onChange={(e) => setFormMaxDays(e.target.value)}
                    className={`w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-xs font-mono focus:border-amber-500 focus:outline-none ${
                      formIsUnlimited ? 'opacity-40 cursor-not-allowed' : ''
                    }`}
                    placeholder={formIsUnlimited ? 'None (unlimited)' : 'e.g. 1'}
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">
                    Price ({formCurrency})
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-2 text-xs font-mono text-slate-500 font-bold">
                      {formCurrency}
                    </span>
                    <input
                      type="number"
                      min="1"
                      step="0.01"
                      value={formPrice}
                      onChange={(e) => setFormPrice(e.target.value)}
                      className="w-full pl-14 pr-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-xs font-mono font-bold focus:border-amber-500 focus:outline-none"
                      placeholder="e.g. 500.00"
                    />
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
                <div className="flex items-center space-x-4">
                  <label className="flex items-center space-x-2 text-xs text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formIsActive}
                      onChange={(e) => setFormIsActive(e.target.checked)}
                      className="rounded bg-slate-800 border-slate-700 text-amber-500 focus:ring-0"
                    />
                    <span>{t('developer.activeTierCheckbox', undefined, 'Active Tier')}</span>
                  </label>

                  <label className="flex items-center space-x-2 text-xs text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formIsBase}
                      onChange={(e) => setFormIsBase(e.target.checked)}
                      className="rounded bg-slate-800 border-slate-700 text-amber-500 focus:ring-0"
                    />
                    <span>{t('developer.base1DayTierCheckbox', undefined, 'Base 1-Day Tier')}</span>
                  </label>
                </div>

                <div className="flex items-center space-x-2">
                  <button
                    onClick={handleCancelForm}
                    disabled={saving}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl"
                  >
                    {t('common.cancel', undefined, 'Cancel')}
                  </button>
                  <button
                    onClick={handleSaveTier}
                    disabled={saving}
                    className="flex items-center space-x-1.5 px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold rounded-xl shadow-lg shadow-amber-950/30"
                  >
                    <Check className="w-4 h-4" />
                    <span>{editingTierId ? t('common.saveChanges', undefined, 'Save Changes') : t('developer.createTier', undefined, 'Create Tier')}</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Duration Pricing Simulator */}
        <div className="space-y-4">
          <div className="bg-slate-900/90 border border-slate-800 p-5 rounded-2xl shadow-sm space-y-4">
            <div className="flex items-center space-x-2 border-b border-slate-800 pb-3">
              <Calculator className="w-4 h-4 text-amber-400" />
              <h3 className="text-sm font-bold text-white">{t('developer.durationPricingSimulator', undefined, 'Duration Simulator')}</h3>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed">
              Test how an event quote resolves for an organization in <strong className="text-white">{getCountryDisplayName(selectedCountry)}</strong> based on active tiers and fallback rules.
            </p>

            <div className="space-y-3">
              <div>
                <label className="text-[11px] font-semibold text-slate-400 block mb-1 flex items-center gap-1">
                  <Calendar className="w-3 h-3 text-slate-400" />
                  <span>{t('developer.eventStartDateLabel', undefined, 'Event Start Date (Inclusive)')}</span>
                </label>
                <CustomDatePicker
                  value={simStartDate}
                  onChange={(newStart) => setSimStartDate(newStart)}
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-400 block mb-1 flex items-center gap-1">
                  <Calendar className="w-3 h-3 text-slate-400" />
                  <span>{t('developer.eventEndDateLabel', undefined, 'Event End Date (Inclusive)')}</span>
                </label>
                <CustomDatePicker
                  min={simStartDate}
                  value={simEndDate}
                  onChange={(newEnd) => setSimEndDate(newEnd)}
                />
              </div>
            </div>

            {/* Resolved Quote Box */}
            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">{t('developer.calculatedDurationLabel', undefined, 'Calculated Duration:')}</span>
                <span className="font-mono font-bold text-amber-400 text-sm">
                  {calculatedDuration} {calculatedDuration === 1 ? 'day' : 'days'}
                </span>
              </div>

              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">{t('developer.requestedCountry', undefined, 'Requested Country:')}</span>
                <span className="font-semibold text-white">{getCountryDisplayName(selectedCountry)} ({selectedCountry})</span>
              </div>

              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">{t('developer.matchedPricingRuleLabel', undefined, 'Matched Pricing Rule:')}</span>
                <span className="font-semibold text-white text-right">{simulatedQuote.ruleLabel}</span>
              </div>

              {simulatedQuote.isFallback && (
                <div className="p-2 rounded-lg bg-blue-500/10 border border-blue-500/20 text-[11px] text-blue-300 flex items-center gap-1.5">
                  <Info className="w-3.5 h-3.5 shrink-0 text-blue-400" />
                  <span>
                    No specific tier in {selectedCountry}. Using fallback pricing from {getCountryDisplayName(defaultPricingCountry)} ({simulatedQuote.currency}).
                  </span>
                </div>
              )}

              <div className="border-t border-slate-800/80 pt-3 flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-slate-500 uppercase tracking-wider block">{t('developer.resolvedEventPriceLabel', undefined, 'Resolved Event Price')}</span>
                  {simulatedQuote.price !== null ? (
                    <span className="text-xl font-black text-amber-400">
                      {simulatedQuote.currency} {simulatedQuote.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  ) : (
                    <span className="text-lg font-bold text-amber-400">
                      {t('developer.customPricingContactUs', undefined, 'Custom Pricing / Contact Us')}
                    </span>
                  )}
                </div>

                <div className="text-right">
                  <span className="text-[10px] text-slate-500 block">{t('developer.effectivePerDayLabel', undefined, 'Effective / Day')}</span>
                  <span className="text-xs font-mono font-semibold text-slate-300">
                    {simulatedQuote.price !== null
                      ? `${simulatedQuote.currency} ${(simulatedQuote.price / Math.max(1, calculatedDuration)).toFixed(2)}`
                      : 'N/A (Quote Required)'}
                  </span>
                </div>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-300/90 leading-relaxed flex items-start gap-2">
              <ShieldCheck className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <span>
                {t('developer.authoritativePriceResolutionNote', undefined, 'Authoritative price resolution happens on the backend during event quote and event creation. The browser never provides or overrides the event price.')}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
