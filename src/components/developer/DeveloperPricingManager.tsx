import React, { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../../lib/api';
import { PlatformPricingSettings, AdminEventPricingItem } from '../../types/developer';
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
} from 'lucide-react';

export const DeveloperPricingManager: React.FC = () => {
  const [pricingSettings, setPricingSettings] = useState<PlatformPricingSettings>({
    default_price: 1400,
    default_currency: 'MYR',
  });
  const [events, setEvents] = useState<AdminEventPricingItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [savingSettings, setSavingSettings] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Default Price Edit State
  const [isEditingDefault, setIsEditingDefault] = useState<boolean>(false);
  const [tempDefaultPrice, setTempDefaultPrice] = useState<string>('1400');
  const [tempDefaultCurrency, setTempDefaultCurrency] = useState<string>('MYR');

  // Event Price Edit Modal State
  const [selectedEvent, setSelectedEvent] = useState<AdminEventPricingItem | null>(null);
  const [tempEventPrice, setTempEventPrice] = useState<string>('');
  const [tempEventCurrency, setTempEventCurrency] = useState<string>('MYR');
  const [savingEventPrice, setSavingEventPrice] = useState<boolean>(false);

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
      const [settingsRes, eventsRes] = await Promise.all([
        apiFetch('/api/developer/pricing/settings', { headers: getHeaders() }),
        apiFetch('/api/developer/events', { headers: getHeaders() }),
      ]);

      if (settingsRes.ok) {
        const data = await settingsRes.json();
        if (data.settings) {
          setPricingSettings(data.settings);
          setTempDefaultPrice(String(data.settings.default_price));
          setTempDefaultCurrency(data.settings.default_currency || 'MYR');
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

  // Handle updating platform default price
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
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || data.message || 'Failed to update platform pricing');
      }

      setPricingSettings(data.settings);
      setIsEditingDefault(false);
      setSuccessMsg(data.message || `Platform default price successfully updated to ${data.settings.default_currency} ${data.settings.default_price.toFixed(2)}`);
      setTimeout(() => setSuccessMsg(null), 5000);
      // Refresh event list to re-evaluate effective prices
      fetchData();
    } catch (err: any) {
      setError(err.message || 'Failed to update platform default pricing');
    } finally {
      setSavingSettings(false);
    }
  };

  // Open Edit Event Modal
  const handleOpenEditEvent = (event: AdminEventPricingItem) => {
    setSelectedEvent(event);
    setTempEventPrice(String(event.effective_price || event.event_price || pricingSettings.default_price));
    setTempEventCurrency(event.event_currency || pricingSettings.default_currency || 'MYR');
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

  // Filtered events
  const filteredEvents = events.filter((ev) => {
    const matchesSearch =
      ev.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (ev.organization_name && ev.organization_name.toLowerCase().includes(searchTerm.toLowerCase())) ||
      ev.slug.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'paid' && ev.payment_status === 'PAID') ||
      (statusFilter === 'unpaid' && ev.payment_status !== 'PAID') ||
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
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-slate-950 shadow-lg shadow-cyan-950/40">
              <Coins className="w-5 h-5 stroke-[2.5]" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-white tracking-tight">Event Pricing Control</h1>
              <p className="text-xs text-slate-400">
                Server-authoritative pricing management for platform defaults and custom event overrides.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={fetchData}
            disabled={loading}
            className="flex items-center space-x-2 px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-cyan-400' : ''}`} />
            <span>Refresh Data</span>
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

      {/* Platform Default Pricing Control Card */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-gradient-to-br from-slate-900 via-slate-900 to-slate-800/90 rounded-3xl border border-slate-800 p-6 shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-cyan-500/5 rounded-full blur-3xl pointer-events-none" />

          <div className="flex items-start justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-9 h-9 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
                <Sliders className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-white">Platform Default Event Price</h2>
                <p className="text-xs text-slate-400">
                  Authoritative base price applied to newly created events across all organizations
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
                className="flex items-center space-x-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 border border-cyan-500/30 transition-colors cursor-pointer"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>Edit Default</span>
              </button>
            )}
          </div>

          {!isEditingDefault ? (
            <div className="mt-6 flex flex-col sm:flex-row sm:items-baseline justify-between gap-4 pt-4 border-t border-slate-800/80">
              <div>
                <div className="flex items-baseline space-x-2">
                  <span className="text-3xl font-black text-cyan-400 font-mono tracking-tight">
                    {pricingSettings.default_currency} {pricingSettings.default_price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                  <span className="text-xs text-slate-400 font-medium">/ event license</span>
                </div>
                <div className="flex items-center space-x-2 mt-2 text-[11px] text-slate-400">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Server-authoritative database setting</span>
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
                  <Info className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                  <span>Pricing Rule Guarantee:</span>
                </div>
                <p>
                  Existing historical events preserve their original locked price. Changing the platform default only takes effect on events created thereafter.
                </p>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSaveDefaultPricing} className="mt-6 pt-4 border-t border-slate-800 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Default Price Amount
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
                      className="w-full bg-slate-950 border border-cyan-500/40 rounded-xl pl-14 pr-4 py-2 text-sm text-white font-mono focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                      placeholder="1400.00"
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
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50 cursor-pointer"
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
                  className="flex items-center space-x-2 px-5 py-2 rounded-xl text-xs font-semibold bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 shadow-lg shadow-cyan-950/40 transition-all cursor-pointer disabled:opacity-50"
                >
                  {savingSettings ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Saving Setting...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Save Platform Default</span>
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
            <span className="text-slate-400 text-xs font-medium">Total Platform Events</span>
            <div className="mt-2">
              <span className="text-2xl font-black text-white font-mono">{events.length}</span>
              <span className="block text-[10px] text-slate-500 mt-0.5">Across all organizations</span>
            </div>
          </div>

          <div className="bg-slate-900/90 rounded-2xl border border-slate-800 p-4 flex flex-col justify-between">
            <span className="text-slate-400 text-xs font-medium">Custom Price Overrides</span>
            <div className="mt-2">
              <span className="text-2xl font-black text-amber-400 font-mono">{customPriceCount}</span>
              <span className="block text-[10px] text-slate-500 mt-0.5">Admin-configured overrides</span>
            </div>
          </div>

          <div className="bg-slate-900/90 rounded-2xl border border-slate-800 p-4 flex flex-col justify-between">
            <span className="text-slate-400 text-xs font-medium">Default Price Events</span>
            <div className="mt-2">
              <span className="text-2xl font-black text-cyan-400 font-mono">{defaultPriceCount}</span>
              <span className="block text-[10px] text-slate-500 mt-0.5">Using standard base</span>
            </div>
          </div>

          <div className="bg-slate-900/90 rounded-2xl border border-slate-800 p-4 flex flex-col justify-between">
            <span className="text-slate-400 text-xs font-medium">Credit Coverage Cap</span>
            <div className="mt-2">
              <span className="text-2xl font-black text-emerald-400 font-mono">20% Max</span>
              <span className="block text-[10px] text-slate-500 mt-0.5">Dynamically calculated</span>
            </div>
          </div>
        </div>
      </div>

      {/* Events Pricing Overview Table */}
      <div className="bg-slate-900 rounded-3xl border border-slate-800 overflow-hidden shadow-xl">
        {/* Table Header & Search Filter Bar */}
        <div className="p-5 border-b border-slate-800 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 bg-slate-900/50">
          <div>
            <h3 className="text-base font-bold text-white">Event Pricing Inventory</h3>
            <p className="text-xs text-slate-400">
              View and configure authoritative prices for every event individually.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Search Input */}
            <div className="relative min-w-[220px]">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search event or organization..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3.5 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
              />
            </div>

            {/* Pricing Type Filter */}
            <select
              value={pricingTypeFilter}
              onChange={(e) => setPricingTypeFilter(e.target.value as any)}
              className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-cyan-500 cursor-pointer"
            >
              <option value="all">All Pricing Types</option>
              <option value="custom">Custom Overrides Only</option>
              <option value="default">Platform Default Only</option>
            </select>

            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-cyan-500 cursor-pointer"
            >
              <option value="all">All Event Statuses</option>
              <option value="active">Active</option>
              <option value="draft">Draft</option>
              <option value="completed">Completed</option>
              <option value="paid">Payment: PAID</option>
              <option value="unpaid">Payment: UNPAID</option>
            </select>
          </div>
        </div>

        {/* Table Content */}
        {loading ? (
          <div className="p-12 text-center text-slate-400 flex flex-col items-center justify-center space-y-3">
            <RefreshCw className="w-6 h-6 animate-spin text-cyan-400" />
            <span className="text-xs">Loading event pricing ledger...</span>
          </div>
        ) : filteredEvents.length === 0 ? (
          <div className="p-12 text-center text-slate-400 space-y-2">
            <Coins className="w-8 h-8 mx-auto text-slate-600" />
            <p className="text-sm font-semibold text-slate-300">No events found</p>
            <p className="text-xs text-slate-500">Try adjusting your search or filters.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950/70 border-b border-slate-800 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                <tr>
                  <th className="px-5 py-3.5">Event Name</th>
                  <th className="px-5 py-3.5">Organization</th>
                  <th className="px-5 py-3.5">Effective Price</th>
                  <th className="px-5 py-3.5">Pricing Status</th>
                  <th className="px-5 py-3.5">Payment</th>
                  <th className="px-5 py-3.5">Event Status</th>
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-sans">
                {filteredEvents.map((ev) => {
                  const isPaid = ev.payment_status === 'PAID';
                  const effectivePrice = ev.effective_price || ev.event_price || pricingSettings.default_price;
                  const currency = ev.event_currency || pricingSettings.default_currency || 'MYR';

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

                      {/* Effective Price */}
                      <td className="px-5 py-4">
                        <div className="font-mono font-bold text-sm text-cyan-400">
                          {currency} {effectivePrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                        <div className="text-[10px] text-slate-500">
                          Max Credit (20%): {currency} {(effectivePrice * 0.2).toFixed(2)}
                        </div>
                      </td>

                      {/* Pricing Status (Default vs Override) */}
                      <td className="px-5 py-4">
                        {ev.is_custom_price ? (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                            Custom Override
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold bg-slate-800 text-slate-400 border border-slate-700">
                            Platform Default
                          </span>
                        )}
                      </td>

                      {/* Payment Status */}
                      <td className="px-5 py-4">
                        {isPaid ? (
                          <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                            <Check className="w-3 h-3" />
                            <span>PAID</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold bg-slate-800 text-slate-400 border border-slate-700">
                            UNPAID
                          </span>
                        )}
                      </td>

                      {/* Event Status */}
                      <td className="px-5 py-4">
                        <span className={`capitalize text-xs font-semibold ${
                          ev.status === 'active' ? 'text-emerald-400' : ev.status === 'completed' ? 'text-blue-400' : 'text-slate-400'
                        }`}>
                          {ev.status}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="px-5 py-4 text-right">
                        <button
                          onClick={() => handleOpenEditEvent(ev)}
                          className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-cyan-500/20 hover:text-cyan-300 text-slate-200 border border-slate-700 transition-colors cursor-pointer"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          <span>Edit Price</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Edit Event Custom Price Modal */}
      {selectedEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-lg w-full p-6 shadow-2xl space-y-6 relative overflow-hidden">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center space-x-3">
                <div className="w-9 h-9 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
                  <Coins className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Edit Event Price</h3>
                  <p className="text-xs text-slate-400">{selectedEvent.name}</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedEvent(null)}
                className="p-1.5 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800"
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
                <span className="text-slate-400">Current Effective Price:</span>
                <span className="text-cyan-400 font-mono font-bold">
                  {selectedEvent.event_currency || 'MYR'} {(selectedEvent.effective_price || selectedEvent.event_price || pricingSettings.default_price).toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Platform Default Reference:</span>
                <span className="text-slate-400 font-mono">
                  {pricingSettings.default_currency} {pricingSettings.default_price.toFixed(2)}
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
                    className="w-full bg-slate-950 border border-slate-700 focus:border-cyan-500 rounded-xl pl-14 pr-4 py-2.5 text-sm text-white font-mono focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                    placeholder="1400.00"
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
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50 cursor-pointer"
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
                  className="text-xs text-cyan-400 hover:text-cyan-300 underline font-medium cursor-pointer"
                >
                  Reset to Platform Default ({pricingSettings.default_currency} {pricingSettings.default_price.toFixed(2)})
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
                  className="flex items-center space-x-2 px-5 py-2 rounded-xl text-xs font-semibold bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 shadow-lg shadow-cyan-950/40 transition-all cursor-pointer disabled:opacity-50"
                >
                  {savingEventPrice ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Saving Price...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Save Event Price</span>
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
