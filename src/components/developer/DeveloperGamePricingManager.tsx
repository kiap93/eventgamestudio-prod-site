import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { apiFetch } from '../../lib/api';
import { PlatformGame } from '../../types/developer';
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
} from 'lucide-react';

export interface GamePricingTier {
  id: string;
  game_id: string;
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

export const DeveloperGamePricingManager: React.FC<DeveloperGamePricingManagerProps> = ({
  game,
  onPricingUpdated,
}) => {
  const [tiers, setTiers] = useState<GamePricingTier[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Form State for Add / Edit
  const [editingTierId, setEditingTierId] = useState<string | null>(null);
  const [isAddingTier, setIsAddingTier] = useState<boolean>(false);
  const [formMinDays, setFormMinDays] = useState<string>('1');
  const [formMaxDays, setFormMaxDays] = useState<string>('1');
  const [formIsUnlimited, setFormIsUnlimited] = useState<boolean>(false);
  const [formPrice, setFormPrice] = useState<string>('1400');
  const [formCurrency, setFormCurrency] = useState<string>('MYR');
  const [formIsActive, setFormIsActive] = useState<boolean>(true);
  const [formIsBase, setFormIsBase] = useState<boolean>(false);

  // Simulator State
  const [simDays, setSimDays] = useState<number>(3);
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
          setTiers(data.tiers.sort((a: GamePricingTier, b: GamePricingTier) => a.min_days - b.min_days));
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
  }, [game.id, getHeaders]);

  useEffect(() => {
    loadTiers();
  }, [loadTiers]);

  const showSuccess = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 3500);
  };

  // Seed standard default tiers for this game
  const handleSeedDefaults = async () => {
    if (!confirm(`Seed default pricing tiers for "${game.name}"?`)) return;
    setSaving(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/developer/games/${game.id}/pricing/seed-defaults`, {
        method: 'POST',
        headers: getHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.tiers)) {
          setTiers(data.tiers.sort((a: GamePricingTier, b: GamePricingTier) => a.min_days - b.min_days));
        }
        showSuccess('Default pricing tiers seeded successfully.');
        if (onPricingUpdated) onPricingUpdated();
      } else {
        const err = await res.json().catch(() => ({}));
        setError(err.error || 'Failed to seed default pricing.');
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
    // Suggest next min_days
    const maxDay = tiers.reduce((acc, curr) => (curr.max_days ? Math.max(acc, curr.max_days) : acc), 0);
    const nextMin = maxDay > 0 ? maxDay + 1 : 1;
    setFormMinDays(String(nextMin));
    setFormMaxDays(String(nextMin));
    setFormIsUnlimited(false);
    setFormPrice('1400');
    setFormCurrency('MYR');
    setFormIsActive(true);
    setFormIsBase(nextMin === 1);
  };

  const handleOpenEdit = (tier: GamePricingTier) => {
    setEditingTierId(tier.id);
    setIsAddingTier(false);
    setFormMinDays(String(tier.min_days));
    setFormMaxDays(tier.max_days ? String(tier.max_days) : '');
    setFormIsUnlimited(tier.max_days === null);
    setFormPrice(String(tier.price));
    setFormCurrency(tier.currency || 'MYR');
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

    // Client-side overlap validation
    if (formIsActive) {
      const formMax = maxD === null ? Infinity : maxD;
      const conflicting = tiers.find((t) => {
        if (editingTierId && t.id === editingTierId) return false;
        if (!t.is_active) return false;
        const tMax = t.max_days === null || t.max_days === undefined ? Infinity : t.max_days;
        return minD <= tMax && t.min_days <= formMax;
      });
      if (conflicting) {
        const existingLabel = conflicting.min_days === conflicting.max_days
          ? `${conflicting.min_days} day`
          : `${conflicting.min_days}–${conflicting.max_days || '+'} days`;
        const newLabel = minD === maxD ? `${minD} day` : `${minD}–${maxD || '+'} days`;
        setError(`Pricing tier range (${newLabel}) overlaps with existing active tier (${existingLabel}). Overlapping active ranges are not permitted.`);
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
          showSuccess('Pricing tier updated successfully.');
          handleCancelForm();
          await loadTiers();
          if (onPricingUpdated) onPricingUpdated();
        } else {
          const err = await res.json().catch(() => ({}));
          setError(err.error || 'Failed to update tier.');
        }
      } else {
        // Create new tier
        const res = await apiFetch(`/api/developer/games/${game.id}/pricing/tier`, {
          method: 'POST',
          headers: getHeaders(),
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          showSuccess('New pricing tier added successfully.');
          handleCancelForm();
          await loadTiers();
          if (onPricingUpdated) onPricingUpdated();
        } else {
          const err = await res.json().catch(() => ({}));
          setError(err.error || 'Failed to create tier.');
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
    // If activating an inactive tier, check for overlap with other active tiers
    if (!tier.is_active) {
      const tierMax = tier.max_days === null || tier.max_days === undefined ? Infinity : tier.max_days;
      const conflicting = tiers.find((t) => {
        if (t.id === tier.id) return false;
        if (!t.is_active) return false;
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
        setError(`Cannot activate tier (${tierLabel}): it overlaps with existing active tier (${existingLabel}).`);
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
    const activeTiers = tiers.filter((t) => t.is_active);
    if (activeTiers.length === 0) {
      return { price: 1400, ruleLabel: 'Standard Default (RM1,400)', isFallback: true };
    }

    // 1. Exact match
    const exact = activeTiers.find((t) => t.min_days === days && t.max_days === days);
    if (exact) {
      return { price: exact.price, ruleLabel: `${days} day${days > 1 ? 's' : ''} (Exact Tier)`, tier: exact };
    }

    // 2. Bracket match
    const bracket = activeTiers.find((t) => t.min_days <= days && (t.max_days === null || t.max_days >= days));
    if (bracket) {
      const label = bracket.max_days === null ? `${bracket.min_days}+ days` : `${bracket.min_days}–${bracket.max_days} days`;
      return { price: bracket.price, ruleLabel: `${label} Bracket`, tier: bracket };
    }

    // 3. Fallback to highest tier
    const sorted = [...activeTiers].sort((a, b) => (b.max_days ?? 99999) - (a.max_days ?? 99999));
    const highest = sorted[0];
    return { price: highest.price, ruleLabel: `Max Available Tier (${highest.min_days}+ days)`, tier: highest };
  }, [calculatedDuration, tiers]);

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
              Game-Owned Pricing Architecture
              <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                Authoritative
              </span>
            </h4>
            <p className="text-xs text-slate-400 mt-1 max-w-2xl leading-relaxed">
              Pricing for <strong className="text-amber-300">{game.name}</strong> is managed independently from other games.
              When an organization creates an event with this game, the selected duration tier is resolved server-side and
              snapshotted onto the event record with immutable historical pricing integrity.
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
            <span>Refresh</span>
          </button>
          <button
            onClick={handleSeedDefaults}
            disabled={saving}
            className="flex items-center space-x-1.5 px-3 py-2 bg-slate-800 hover:bg-amber-500/20 text-amber-400 hover:text-amber-300 text-xs font-semibold rounded-xl border border-amber-500/30 transition-colors"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Seed Standard Tiers</span>
          </button>
          <button
            onClick={handleOpenAdd}
            className="flex items-center space-x-1.5 px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold rounded-xl shadow-lg shadow-amber-950/30 transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Add Duration Tier</span>
          </button>
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
                  <span>Configured Duration Tiers</span>
                  <span className="text-xs font-mono text-slate-400">({tiers.length})</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Calendar day thresholds and corresponding license prices
                </p>
              </div>
            </div>

            {loading ? (
              <div className="py-16 text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500 mx-auto mb-3" />
                <p className="text-xs text-slate-400">Loading game pricing tiers...</p>
              </div>
            ) : tiers.length === 0 ? (
              <div className="text-center py-12 p-6">
                <Coins className="w-10 h-10 text-slate-600 mx-auto mb-3" />
                <h4 className="text-sm font-bold text-white mb-1">No Pricing Tiers Configured</h4>
                <p className="text-xs text-slate-400 max-w-sm mx-auto mb-4">
                  This game does not have custom duration tiers yet. Click below to seed the standard duration tiers.
                </p>
                <button
                  onClick={handleSeedDefaults}
                  disabled={saving}
                  className="inline-flex items-center space-x-2 px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold rounded-xl"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>Seed Standard Tiers (1 to 91+ Days)</span>
                </button>
              </div>
            ) : (
              <div className="divide-y divide-slate-800/60">
                {tiers.map((tier) => {
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
                                <span>Base Tier</span>
                              </span>
                            )}
                            <span
                              className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                                tier.is_active
                                  ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                                  : 'bg-slate-800 text-slate-400 border border-slate-700'
                              }`}
                            >
                              {tier.is_active ? 'Active' : 'Inactive'}
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
                          <span className="text-[10px] text-slate-500 block">per event activation</span>
                        </div>

                        <div className="flex items-center space-x-1">
                          <button
                            onClick={() => handleToggleActive(tier)}
                            disabled={saving}
                            title={tier.is_active ? 'Deactivate Tier' : 'Activate Tier'}
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
                            title="Edit Tier"
                            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>

                          <button
                            onClick={() => handleDeleteTier(tier)}
                            disabled={saving}
                            title="Delete Tier"
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

          {/* Add / Edit Tier Form Drawer / Card */}
          {(isAddingTier || editingTierId) && (
            <div className="p-5 rounded-2xl bg-slate-900 border border-amber-500/30 shadow-xl animate-in fade-in-50 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <h4 className="text-sm font-bold text-white flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-amber-400" />
                  <span>{editingTierId ? 'Edit Pricing Tier' : 'Add New Pricing Tier'}</span>
                </h4>
                <button
                  onClick={handleCancelForm}
                  className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">Minimum Days</label>
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
                    <label className="text-xs font-semibold text-slate-300">Maximum Days</label>
                    <label className="flex items-center space-x-1 text-[10px] text-amber-400 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formIsUnlimited}
                        onChange={(e) => setFormIsUnlimited(e.target.checked)}
                        className="rounded bg-slate-800 border-slate-700 text-amber-500 focus:ring-0"
                      />
                      <span>Unlimited (e.g. 91+)</span>
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
                  <label className="text-xs font-semibold text-slate-300 block mb-1">Price ({formCurrency})</label>
                  <input
                    type="number"
                    min="1"
                    step="0.01"
                    value={formPrice}
                    onChange={(e) => setFormPrice(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-xs font-mono font-bold focus:border-amber-500 focus:outline-none"
                    placeholder="e.g. 1400.00"
                  />
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
                    <span>Active Tier</span>
                  </label>

                  <label className="flex items-center space-x-2 text-xs text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formIsBase}
                      onChange={(e) => setFormIsBase(e.target.checked)}
                      className="rounded bg-slate-800 border-slate-700 text-amber-500 focus:ring-0"
                    />
                    <span>Base Tier (Primary 1-day quote)</span>
                  </label>
                </div>

                <div className="flex items-center space-x-2">
                  <button
                    onClick={handleCancelForm}
                    disabled={saving}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveTier}
                    disabled={saving}
                    className="flex items-center space-x-1.5 px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold rounded-xl shadow-lg shadow-amber-950/30"
                  >
                    <Check className="w-4 h-4" />
                    <span>{editingTierId ? 'Save Changes' : 'Create Tier'}</span>
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
              <h3 className="text-sm font-bold text-white">Event Duration Simulator</h3>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed">
              Test how an event date range calculates against <strong className="text-slate-200">{game.name}</strong>&apos;s active pricing tiers.
            </p>

            <div className="space-y-3">
              <div>
                <label className="text-[11px] font-semibold text-slate-400 block mb-1 flex items-center gap-1">
                  <Calendar className="w-3 h-3 text-slate-400" />
                  <span>Start Date (Inclusive)</span>
                </label>
                <input
                  type="date"
                  value={simStartDate}
                  onChange={(e) => setSimStartDate(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-xs focus:border-amber-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-400 block mb-1 flex items-center gap-1">
                  <Calendar className="w-3 h-3 text-slate-400" />
                  <span>End Date (Inclusive)</span>
                </label>
                <input
                  type="date"
                  value={simEndDate}
                  min={simStartDate}
                  onChange={(e) => setSimEndDate(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-xs focus:border-amber-500 focus:outline-none"
                />
              </div>
            </div>

            {/* Resolved Quote Box */}
            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">Total Calendar Days:</span>
                <span className="font-mono font-bold text-amber-400 text-sm">
                  {calculatedDuration} {calculatedDuration === 1 ? 'day' : 'days'}
                </span>
              </div>

              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">Matched Rule:</span>
                <span className="font-semibold text-white text-right">{simulatedQuote.ruleLabel}</span>
              </div>

              <div className="border-t border-slate-800/80 pt-3 flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-slate-500 uppercase tracking-wider block">Calculated Event Price</span>
                  <span className="text-xl font-black text-amber-400">
                    MYR {simulatedQuote.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>

                <div className="text-right">
                  <span className="text-[10px] text-slate-500 block">Avg / Day</span>
                  <span className="text-xs font-mono font-semibold text-slate-300">
                    MYR {(simulatedQuote.price / Math.max(1, calculatedDuration)).toFixed(2)}
                  </span>
                </div>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-300/90 leading-relaxed flex items-start gap-2">
              <ShieldCheck className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <span>
                Authoritative price resolution happens on the backend during event quote and event creation.
                The browser never provides or overrides the event price.
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
