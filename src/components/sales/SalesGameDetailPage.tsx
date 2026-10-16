import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { SalesNavbar } from './SalesNavbar';
import { SalesGameCatalogItem } from '../../types/sales';
import { apiFetch } from '../../lib/api';
import { navigateTo } from '../../hooks/useRouteContext';
import { useLocalization } from '../../context/LocalizationContext';
import { LandingDemoModal } from '../landing/LandingDemoModal';
import { SEO } from '../common/SEO';
import {
  Gamepad2,
  ArrowLeft,
  Play,
  RotateCcw,
  Clock,
  Sparkles,
  ShieldCheck,
  AlertCircle,
  RefreshCw,
  Globe,
  Sliders,
  CheckCircle2,
  Users,
  Smartphone,
  Layers,
  HelpCircle,
  Calendar,
  DollarSign,
  ChevronRight,
  ExternalLink,
  Mail,
  Zap,
} from 'lucide-react';
import { COUNTRIES, getCountryByCode, POPULAR_COUNTRY_CODES } from '../../lib/countryUtils';

interface SalesGameDetailPageProps {
  gameId: string;
}

export const SalesGameDetailPage: React.FC<SalesGameDetailPageProps> = ({ gameId }) => {
  const { t } = useLocalization();

  const [game, setGame] = useState<SalesGameCatalogItem | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [is404, setIs404] = useState<boolean>(false);

  // Quote Country Selection
  const [selectedCountry, setSelectedCountry] = useState<string>('MY');

  // Playable Demo Modal state
  const [demoModalOpen, setDemoModalOpen] = useState<boolean>(false);

  const loadGameDetail = useCallback(async () => {
    if (!gameId) return;
    setIsLoading(true);
    setErrorMessage(null);
    setIs404(false);

    try {
      const queryParam = selectedCountry ? `?country=${encodeURIComponent(selectedCountry)}` : '';
      const res = await apiFetch(`/api/sales/games/${encodeURIComponent(gameId)}${queryParam}`);

      if (!res.ok) {
        if (res.status === 404) {
          setIs404(true);
          setErrorMessage('Game not found or not approved for sales demonstration.');
        } else if (res.status === 403) {
          setErrorMessage('Active Sales Partner authorization required to view game details.');
        } else if (res.status === 401) {
          setErrorMessage('Your session has expired. Please sign in again.');
        } else {
          setErrorMessage('Failed to load sales game details. Please try again.');
        }
        return;
      }

      const data = await res.json();
      if (data && data.game) {
        setGame(data.game);
      } else {
        setErrorMessage('Unexpected data structure returned from game detail service.');
      }
    } catch (err: any) {
      console.error('[SalesGameDetailPage] Failed to fetch game detail:', err);
      setErrorMessage('Network connection error: Unable to load game specifications.');
    } finally {
      setIsLoading(false);
    }
  }, [gameId, selectedCountry]);

  useEffect(() => {
    loadGameDetail();
  }, [loadGameDetail]);

  const currentCountryInfo = useMemo(() => {
    return getCountryByCode(selectedCountry);
  }, [selectedCountry]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-amber-500 selection:text-slate-950">
      <SEO
        robots="noindex, follow"
        title={`${game?.name || 'Game Details'} | Sales Catalogue | Event Game Studio`}
      />

      <SalesNavbar activeSection="games" />

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Top Breadcrumb & Toolbar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
          <div className="flex items-center gap-2 text-xs">
            <button
              onClick={() => navigateTo('/sales/games')}
              className="inline-flex items-center gap-1.5 text-slate-400 hover:text-white transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Game Catalogue</span>
            </button>
            <ChevronRight className="w-3.5 h-3.5 text-slate-600" />
            <span className="text-amber-400 font-semibold truncate max-w-xs">
              {game?.name || 'Game Specifications'}
            </span>
          </div>

          {/* Prospective Customer Quote Country Selector */}
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <label htmlFor="detail-country-select" className="text-xs text-slate-400 flex items-center gap-1">
              <Globe className="w-3.5 h-3.5 text-amber-400" />
              <span>Quote Country:</span>
            </label>
            <select
              id="detail-country-select"
              value={selectedCountry}
              onChange={(e) => setSelectedCountry(e.target.value)}
              className="bg-slate-900 border border-slate-750 text-slate-100 rounded-xl px-2.5 py-1.5 text-xs font-medium focus:outline-none focus:border-amber-500 cursor-pointer"
            >
              <optgroup label="Popular Countries">
                {POPULAR_COUNTRY_CODES.map((code) => {
                  const c = getCountryByCode(code);
                  if (!c) return null;
                  return (
                    <option key={c.code} value={c.code}>
                      {c.name} ({c.currencyCode})
                    </option>
                  );
                })}
              </optgroup>
              <optgroup label="All Countries">
                {COUNTRIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name} ({c.currencyCode})
                  </option>
                ))}
              </optgroup>
            </select>
          </div>
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className="space-y-6 animate-pulse">
            <div className="h-64 bg-slate-900 rounded-3xl" />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="h-48 bg-slate-900 rounded-2xl md:col-span-2" />
              <div className="h-48 bg-slate-900 rounded-2xl" />
            </div>
          </div>
        )}

        {/* 404 / Error State */}
        {errorMessage && !isLoading && (
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-10 text-center max-w-lg mx-auto space-y-4">
            <div className="w-14 h-14 rounded-full bg-rose-500/10 text-rose-400 flex items-center justify-center mx-auto border border-rose-500/20">
              <AlertCircle className="w-7 h-7" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">
                {is404 ? 'Game Not Available' : 'Unable to Load Game'}
              </h2>
              <p className="text-xs text-slate-400 mt-2 leading-relaxed">{errorMessage}</p>
            </div>
            <div className="pt-2 flex justify-center gap-3">
              <button
                onClick={() => navigateTo('/sales/games')}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl transition-colors cursor-pointer"
              >
                Return to Catalogue
              </button>
              {!is404 && (
                <button
                  onClick={() => loadGameDetail()}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-bold rounded-xl transition-colors cursor-pointer"
                >
                  Retry
                </button>
              )}
            </div>
          </div>
        )}

        {/* Loaded Game Detail View */}
        {!isLoading && !errorMessage && game && (
          <div className="space-y-10">
            {/* Game Hero Banner */}
            <div className="relative rounded-3xl overflow-hidden border border-slate-800 bg-slate-900 shadow-2xl">
              <div className="relative h-72 sm:h-80 md:h-96 w-full overflow-hidden">
                <img
                  src={game.cover_image_url}
                  alt={game.name}
                  className="w-full h-full object-cover object-center"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).src = '/assets/background.png';
                  }}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/70 to-slate-950/20" />

                {/* Hero Overlay Content */}
                <div className="absolute inset-0 p-6 sm:p-8 md:p-10 flex flex-col justify-end space-y-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/30 backdrop-blur-md">
                      {game.category}
                    </span>
                    {game.has_playable_preview ? (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 backdrop-blur-md">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Interactive Demo Available</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-slate-900/80 text-slate-400 border border-slate-700 backdrop-blur-md">
                        <span>Preview Unavailable</span>
                      </span>
                    )}
                  </div>

                  <h1 className="text-3xl sm:text-4xl md:text-5xl font-black text-white tracking-tight">
                    {game.name}
                  </h1>

                  <p className="text-sm sm:text-base text-amber-200/90 font-medium max-w-3xl leading-relaxed">
                    {game.highlight}
                  </p>

                  <div className="flex flex-wrap items-center gap-3 pt-2">
                    {game.has_playable_preview && (
                      <button
                        onClick={() => setDemoModalOpen(true)}
                        className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-sm rounded-2xl shadow-xl transition-all cursor-pointer transform hover:scale-[1.02]"
                      >
                        <Play className="w-4 h-4 fill-current" />
                        <span>Launch Live Demo Playtest</span>
                      </button>
                    )}

                    <div className="inline-flex items-center gap-2 px-4 py-3 bg-slate-950/80 backdrop-blur-md border border-slate-800 rounded-2xl text-xs text-slate-300">
                      <Clock className="w-4 h-4 text-amber-400" />
                      <span>Standard duration: {game.default_duration_seconds} seconds</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Quick Specs Overview Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-5 space-y-1.5">
                <div className="text-xs font-semibold text-slate-400 flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-amber-400" />
                  <span>Session Pace</span>
                </div>
                <div className="text-base font-bold text-white">
                  {game.default_duration_seconds}s Fast Round
                </div>
                <p className="text-[11px] text-slate-400">
                  Customizable from 10s to 120s per session
                </p>
              </div>

              <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-5 space-y-1.5">
                <div className="text-xs font-semibold text-slate-400 flex items-center gap-1.5">
                  <Users className="w-4 h-4 text-amber-400" />
                  <span>Throughput</span>
                </div>
                <div className="text-base font-bold text-white">
                  60–100+ Players / Hr
                </div>
                <p className="text-[11px] text-slate-400">
                  High queue velocity prevents booth congestion
                </p>
              </div>

              <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-5 space-y-1.5">
                <div className="text-xs font-semibold text-slate-400 flex items-center gap-1.5">
                  <Smartphone className="w-4 h-4 text-amber-400" />
                  <span>Input Methods</span>
                </div>
                <div className="text-base font-bold text-white truncate">
                  {game.supported_input_types[0] || 'Touch & Keyboard'}
                </div>
                <p className="text-[11px] text-slate-400 truncate">
                  {game.supported_input_types.join(', ')}
                </p>
              </div>

              <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-5 space-y-1.5">
                <div className="text-xs font-semibold text-slate-400 flex items-center gap-1.5">
                  <Layers className="w-4 h-4 text-amber-400" />
                  <span>Orientations</span>
                </div>
                <div className="text-base font-bold text-white">
                  Portrait &amp; Landscape
                </div>
                <p className="text-[11px] text-slate-400">
                  Kiosks, mobile, tablets, &amp; stage LED screens
                </p>
              </div>
            </div>

            {/* Step-by-Step Gameplay Flow */}
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 space-y-6 shadow-xl">
              <div className="space-y-1">
                <div className="text-xs font-bold uppercase tracking-wider text-amber-400">
                  Attendee Experience
                </div>
                <h2 className="text-xl sm:text-2xl font-black text-white">
                  Step-by-Step Gameplay Flow
                </h2>
                <p className="text-xs sm:text-sm text-slate-400">
                  Walk prospective clients through how their attendees will interact with the game on site.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {game.gameplay_instructions.map((step) => (
                  <div
                    key={step.step}
                    className="bg-slate-950/70 border border-slate-800/80 rounded-2xl p-5 space-y-3 flex flex-col justify-between"
                  >
                    <div className="space-y-2">
                      <div className="w-8 h-8 rounded-lg bg-amber-500/15 text-amber-400 border border-amber-500/30 flex items-center justify-center font-black text-xs font-mono">
                        {step.step}
                      </div>
                      <h3 className="text-sm font-bold text-white">{step.title}</h3>
                      <p className="text-xs text-slate-400 leading-relaxed">{step.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Brand Customization Capabilities & Suitable Event Types */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Brand Customization */}
              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 space-y-6 shadow-xl">
                <div className="space-y-1">
                  <div className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                    White-Label Customization
                  </div>
                  <h2 className="text-xl sm:text-2xl font-black text-white">
                    Brandable Asset Slots
                  </h2>
                  <p className="text-xs sm:text-sm text-slate-400">
                    What can the client personalize to match their branding and campaign visuals?
                  </p>
                </div>

                <div className="space-y-3">
                  {game.customization_capabilities.map((opt, i) => (
                    <div
                      key={i}
                      className="bg-slate-950/70 border border-slate-800/80 rounded-2xl p-4 flex items-start gap-3.5"
                    >
                      <div className="w-7 h-7 rounded-lg bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center justify-center shrink-0 mt-0.5">
                        <CheckCircle2 className="w-4 h-4" />
                      </div>
                      <div className="space-y-1 min-w-0">
                        <h4 className="text-xs font-bold text-white">{opt.title}</h4>
                        <p className="text-[11px] text-slate-400 leading-relaxed">
                          {opt.description}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Recommended Event Types */}
              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 space-y-6 shadow-xl">
                <div className="space-y-1">
                  <div className="text-xs font-bold uppercase tracking-wider text-amber-400">
                    Use Cases &amp; Venues
                  </div>
                  <h2 className="text-xl sm:text-2xl font-black text-white">
                    Ideal Event Activations
                  </h2>
                  <p className="text-xs sm:text-sm text-slate-400">
                    Recommend the best event scenarios to client marketing teams and event managers.
                  </p>
                </div>

                <div className="space-y-3">
                  {game.suitable_event_types.map((ev, i) => (
                    <div
                      key={i}
                      className="bg-slate-950/70 border border-slate-800/80 rounded-2xl p-4 space-y-1.5"
                    >
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-amber-400 shrink-0" />
                        <h4 className="text-xs font-bold text-white">{ev.name}</h4>
                      </div>
                      <p className="text-[11px] text-slate-400 leading-relaxed pl-6">
                        {ev.why}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Authoritative Pricing & Duration Tiers Breakdown */}
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 space-y-6 shadow-xl">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2">
                <div className="space-y-1">
                  <div className="text-xs font-bold uppercase tracking-wider text-amber-400">
                    License &amp; Duration Tiers
                  </div>
                  <h2 className="text-xl sm:text-2xl font-black text-white">
                    Event Duration Pricing Table
                  </h2>
                  <p className="text-xs sm:text-sm text-slate-400">
                    Authoritative duration tiers for {currentCountryInfo?.name || selectedCountry}. Includes free Setup Day access.
                  </p>
                </div>

                {game.pricing.is_fallback && !game.pricing.requires_custom_quote && (
                  <div className="px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300">
                    Quoting using {game.pricing.pricing_country} standard price book
                  </div>
                )}
              </div>

              {game.pricing.requires_custom_quote ? (
                <div className="bg-slate-950 border border-slate-800 rounded-2xl p-8 text-center space-y-4">
                  <div className="w-12 h-12 rounded-full bg-amber-500/15 text-amber-400 flex items-center justify-center mx-auto border border-amber-500/30">
                    <Mail className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white">
                      Custom Activation Quote Required
                    </h3>
                    <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                      Pricing for this duration or country tier requires custom activation scoping (e.g. multi-month roadshows, custom multi-city tours, or high-volume agency packages).
                    </p>
                  </div>
                  <button
                    onClick={() => navigateTo('/contact')}
                    className="px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs rounded-xl transition-colors cursor-pointer inline-flex items-center gap-1.5"
                  >
                    <span>Contact Enterprise Activation Team</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs text-slate-300 border-collapse">
                      <thead>
                        <tr className="border-b border-slate-800 text-slate-400 uppercase text-[10px] tracking-wider">
                          <th className="py-3 px-4 font-bold">Event Duration</th>
                          <th className="py-3 px-4 font-bold">License Window</th>
                          <th className="py-3 px-4 font-bold">Setup Day Included</th>
                          <th className="py-3 px-4 font-bold text-right">License Price</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-850">
                        {game.pricing.tiers.map((tier) => (
                          <tr
                            key={tier.id}
                            className={`hover:bg-slate-850/50 transition-colors ${
                              tier.is_base ? 'bg-amber-500/5 font-semibold' : ''
                            }`}
                          >
                            <td className="py-3.5 px-4 text-white font-medium flex items-center gap-2">
                              <span>{tier.duration_label}</span>
                              {tier.is_base && (
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                  Base Tier
                                </span>
                              )}
                            </td>
                            <td className="py-3.5 px-4 text-slate-400">
                              {tier.min_days === tier.max_days
                                ? `${tier.min_days} calendar day`
                                : `${tier.min_days} to ${tier.max_days || 'unlimited'} calendar days`}
                            </td>
                            <td className="py-3.5 px-4 text-emerald-400">
                              Included (1 day prior to live date)
                            </td>
                            <td className="py-3.5 px-4 text-right font-mono font-bold text-white text-sm">
                              {tier.currency}{' '}
                              {tier.price.toLocaleString('en-US', {
                                minimumFractionDigits: 0,
                                maximumFractionDigits: 2,
                              })}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="text-[11px] text-slate-500 flex items-center justify-between pt-2">
                    <span>* All event licenses include unlimited attendee plays during the booked calendar window.</span>
                    <span>No per-play or per-attendee overage charges.</span>
                  </div>
                </div>
              )}
            </div>

            {/* Read-Only Notice for Sales Partners */}
            <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-4 flex items-center justify-between text-xs text-slate-400">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>
                  Sales Catalogue Mode: Verified read-only specifications. To configure a production theme or create a live event, use your Customer Workspace.
                </span>
              </div>
              <button
                onClick={() => navigateTo('/events')}
                className="text-amber-400 hover:underline font-semibold cursor-pointer shrink-0 ml-4"
              >
                Go to Workspace
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Playable Demo Modal */}
      {demoModalOpen && game && (
        <LandingDemoModal
          isOpen={demoModalOpen}
          onClose={() => setDemoModalOpen(false)}
          initialGameId={game.game_type || game.slug}
          gameTitle={game.name}
        />
      )}
    </div>
  );
};
