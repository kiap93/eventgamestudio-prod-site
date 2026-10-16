import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { SalesNavbar } from './SalesNavbar';
import { SalesGameCatalogItem } from '../../types/sales';
import { apiFetch } from '../../lib/api';
import { navigateTo } from '../../hooks/useRouteContext';
import { useLocalization } from '../../context/LocalizationContext';
import { useAuth } from '../../context/AuthContext';
import { LandingDemoModal } from '../landing/LandingDemoModal';
import { SEO } from '../common/SEO';
import {
  Gamepad2,
  Search,
  Filter,
  Sparkles,
  Play,
  RotateCcw,
  Clock,
  ArrowRight,
  ShieldCheck,
  AlertCircle,
  RefreshCw,
  Globe,
  Sliders,
  CheckCircle2,
  Users,
  Smartphone,
  Layers,
  Layers2,
  HelpCircle,
  Info,
} from 'lucide-react';
import { COUNTRIES, getCountryByCode, POPULAR_COUNTRY_CODES } from '../../lib/countryUtils';

export const SalesGamesPage: React.FC = () => {
  const { t } = useLocalization();
  const { currentUser, isSalesPartner, salesPartnerStatus } = useAuth();

  const [games, setGames] = useState<SalesGameCatalogItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errorStatus, setErrorStatus] = useState<number | null>(null);

  // Client Quote Country (explicit context for prospective customer quotes)
  const [selectedCountry, setSelectedCountry] = useState<string>('MY');

  // Search and Category filters
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  // Playable Demo Modal state
  const [demoModalOpen, setDemoModalOpen] = useState<boolean>(false);
  const [demoGameId, setDemoGameId] = useState<string>('catch-brand');
  const [demoGameTitle, setDemoGameTitle] = useState<string>('Catch the Brand');

  // Load games from GET /api/sales/games
  const loadCatalogue = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    setErrorStatus(null);

    try {
      const queryParam = selectedCountry ? `?country=${encodeURIComponent(selectedCountry)}` : '';
      const res = await apiFetch(`/api/sales/games${queryParam}`);

      if (!res.ok) {
        setErrorStatus(res.status);
        if (res.status === 401) {
          setErrorMessage('Your session has expired. Please sign in again.');
        } else if (res.status === 403) {
          setErrorMessage('Sales Partner authorization required to view demonstration catalogue.');
        } else if (res.status === 404) {
          setErrorMessage('Sales catalogue endpoint is temporarily unavailable.');
        } else {
          setErrorMessage('Failed to load catalogue. Please try again.');
        }
        return;
      }

      const data = await res.json();
      if (data && Array.isArray(data.games)) {
        setGames(data.games);
      } else {
        setErrorMessage('Received unexpected data format from sales catalogue.');
      }
    } catch (err: any) {
      console.error('[SalesGamesPage] Failed to fetch catalogue:', err);
      setErrorMessage('Network error: Unable to connect to platform catalogue service.');
    } finally {
      setIsLoading(false);
    }
  }, [selectedCountry]);

  useEffect(() => {
    loadCatalogue();
  }, [loadCatalogue]);

  // Extract unique categories for filter tabs
  const categories = useMemo(() => {
    const set = new Set<string>();
    games.forEach((g) => {
      if (g.category) set.add(g.category);
    });
    return ['all', ...Array.from(set)];
  }, [games]);

  // Filter games based on search query & selected category
  const filteredGames = useMemo(() => {
    return games.filter((game) => {
      const q = searchQuery.trim().toLowerCase();
      const matchesSearch =
        q === '' ||
        game.name.toLowerCase().includes(q) ||
        game.description.toLowerCase().includes(q) ||
        game.highlight.toLowerCase().includes(q) ||
        game.category.toLowerCase().includes(q) ||
        game.slug.toLowerCase().includes(q);

      const matchesCategory =
        selectedCategory === 'all' ||
        game.category.toLowerCase() === selectedCategory.toLowerCase();

      return matchesSearch && matchesCategory;
    });
  }, [games, searchQuery, selectedCategory]);

  const handleLaunchPreview = (game: SalesGameCatalogItem) => {
    if (!game.has_playable_preview) return;
    setDemoGameId(game.game_type || game.slug);
    setDemoGameTitle(game.name);
    setDemoModalOpen(true);
  };

  const currentCountryInfo = useMemo(() => {
    return getCountryByCode(selectedCountry);
  }, [selectedCountry]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-amber-500 selection:text-slate-950">
      <SEO
        robots="noindex, follow"
        title="Sales Partner Game Catalogue | Event Game Studio"
      />

      <SalesNavbar activeSection="games" />

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Hero & Pitching Context Header */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 pb-6 border-b border-slate-800">
          <div className="space-y-2 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Verified Sales Demonstration Catalogue</span>
            </div>
            <h1 className="text-3xl font-black text-white tracking-tight sm:text-4xl">
              Approved Event Games
            </h1>
            <p className="text-sm text-slate-400 leading-relaxed">
              Showcase and pitch interactive event mini-games to clients. High attendee throughput, customizable brand assets, live scoreboards, and duration-based event licenses.
            </p>
          </div>

          {/* Prospective Customer Country / Currency Selector */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 shrink-0 max-w-md w-full shadow-lg">
            <div className="flex items-center justify-between gap-2 mb-2">
              <label htmlFor="quote-country-select" className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                <Globe className="w-4 h-4 text-amber-400" />
                <span>Client Quote Context</span>
              </label>
              <span className="text-[11px] text-slate-400 font-mono">
                Currency: {currentCountryInfo?.currencyCode || 'USD'}
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mb-3 leading-snug">
              Select client's country to display localized pricing tiers. Does not change your organization or wallet.
            </p>
            <div className="flex items-center gap-2">
              <select
                id="quote-country-select"
                value={selectedCountry}
                onChange={(e) => setSelectedCountry(e.target.value)}
                className="flex-1 bg-slate-950 border border-slate-750 text-slate-100 rounded-xl px-3 py-2 text-xs font-medium focus:outline-none focus:border-amber-500 cursor-pointer"
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

              <button
                onClick={() => loadCatalogue()}
                title="Refresh Pricing Quotes"
                className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl transition-colors cursor-pointer shrink-0"
              >
                <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-amber-400' : ''}`} />
              </button>
            </div>
          </div>
        </div>

        {/* Search & Category Filter Bar */}
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
          {/* Search Input */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search approved games by title, category, or features..."
              className="w-full pl-10 pr-4 py-2.5 bg-slate-900/80 border border-slate-800 focus:border-amber-500/50 rounded-xl text-xs text-slate-100 placeholder-slate-500 focus:outline-none transition-colors"
            />
          </div>

          {/* Category Filter Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                  selectedCategory === cat
                    ? 'bg-amber-500 text-slate-950 font-bold shadow-sm'
                    : 'bg-slate-900 text-slate-400 hover:text-slate-200 hover:bg-slate-850'
                }`}
              >
                {cat === 'all' ? 'All Categories' : cat}
              </button>
            ))}
          </div>
        </div>

        {/* Error State */}
        {errorMessage && !isLoading && (
          <div className="bg-rose-500/10 border border-rose-500/20 rounded-2xl p-6 text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-rose-500/20 text-rose-400 flex items-center justify-center mx-auto">
              <AlertCircle className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Catalogue Error</h3>
              <p className="text-xs text-rose-300/80 mt-1">{errorMessage}</p>
            </div>
            <button
              onClick={() => loadCatalogue()}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl transition-colors cursor-pointer inline-flex items-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Retry Loading</span>
            </button>
          </div>
        )}

        {/* Loading Skeletons */}
        {isLoading && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map((n) => (
              <div
                key={n}
                className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-4 animate-pulse"
              >
                <div className="h-44 bg-slate-800 rounded-xl" />
                <div className="h-5 bg-slate-800 rounded w-2/3" />
                <div className="h-4 bg-slate-800 rounded w-full" />
                <div className="h-12 bg-slate-800 rounded-xl" />
              </div>
            ))}
          </div>
        )}

        {/* Empty Catalogue State */}
        {!isLoading && !errorMessage && filteredGames.length === 0 && (
          <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-12 text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-slate-800 text-slate-400 flex items-center justify-center mx-auto">
              <Gamepad2 className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">No Matching Games Found</h3>
              <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                No approved games match your search criteria. Try clearing search filters.
              </p>
            </div>
            {(searchQuery || selectedCategory !== 'all') && (
              <button
                onClick={() => {
                  setSearchQuery('');
                  setSelectedCategory('all');
                }}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl transition-colors cursor-pointer"
              >
                Reset Search Filters
              </button>
            )}
          </div>
        )}

        {/* Games Grid */}
        {!isLoading && !errorMessage && filteredGames.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredGames.map((game) => {
              const pricing = game.pricing;
              return (
                <div
                  key={game.id}
                  className="group bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-2xl overflow-hidden flex flex-col transition-all duration-200 shadow-xl hover:shadow-2xl hover:shadow-amber-500/5"
                >
                  {/* Cover Image & Badges */}
                  <div className="relative aspect-video w-full bg-slate-950 overflow-hidden border-b border-slate-800/80">
                    <img
                      src={game.cover_image_url}
                      alt={game.name}
                      className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-300"
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).src = '/assets/background.png';
                      }}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/20 to-transparent" />

                    {/* Top Badges */}
                    <div className="absolute top-3 left-3 flex flex-wrap items-center gap-1.5">
                      <span className="px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider bg-slate-950/80 backdrop-blur-md text-amber-400 border border-amber-500/30">
                        {game.category}
                      </span>
                    </div>

                    <div className="absolute top-3 right-3">
                      {game.has_playable_preview ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider bg-emerald-500/20 backdrop-blur-md text-emerald-300 border border-emerald-500/30">
                          <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                          <span>Playable Demo</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider bg-slate-900/80 backdrop-blur-md text-slate-400 border border-slate-700">
                          <span>Preview Unavailable</span>
                        </span>
                      )}
                    </div>

                    {/* Duration badge */}
                    <div className="absolute bottom-3 left-3 flex items-center gap-1 px-2 py-0.5 rounded bg-slate-950/80 text-[10px] text-slate-300 font-mono">
                      <Clock className="w-3 h-3 text-amber-400" />
                      <span>{game.default_duration_seconds}s round</span>
                    </div>
                  </div>

                  {/* Card Body */}
                  <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                    <div className="space-y-3">
                      <div>
                        <h3 className="text-lg font-bold text-white group-hover:text-amber-400 transition-colors">
                          {game.name}
                        </h3>
                        <p className="text-xs text-amber-300/90 font-medium line-clamp-2 mt-1">
                          {game.highlight}
                        </p>
                      </div>

                      <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed">
                        {game.description}
                      </p>

                      {/* Technical Specs Tags */}
                      <div className="pt-2 border-t border-slate-800/80 space-y-1.5 text-[11px] text-slate-400">
                        <div className="flex items-center justify-between">
                          <span className="text-slate-500">Inputs:</span>
                          <span className="text-slate-300 truncate max-w-[190px]">
                            {game.supported_input_types.join(', ')}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-slate-500">Orientations:</span>
                          <span className="text-slate-300 truncate max-w-[190px]">
                            {game.orientations.length > 1 ? 'Portrait & Landscape' : game.orientations[0]}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-slate-500">Customization:</span>
                          <span className="text-emerald-400 font-medium">
                            {game.customization_capabilities.length} brandable asset slots
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Pricing Box & Action Buttons */}
                    <div className="pt-3 border-t border-slate-800 space-y-3">
                      <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-3 flex items-center justify-between">
                        <div>
                          <div className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                            Pricing Summary
                          </div>
                          <div className="text-xs font-black text-white mt-0.5">
                            {pricing.requires_custom_quote ? (
                              <span className="text-amber-400 font-bold">Contact Us for Quote</span>
                            ) : (
                              <span>{pricing.display_price}</span>
                            )}
                          </div>
                        </div>
                        {pricing.is_fallback && !pricing.requires_custom_quote && (
                          <span className="text-[10px] text-slate-400 bg-slate-800 px-1.5 py-0.5 rounded">
                            {pricing.pricing_country} fallback
                          </span>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <button
                          onClick={() => navigateTo(`/sales/games/${game.slug || game.id}`)}
                          className="w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs rounded-xl transition-colors cursor-pointer"
                        >
                          <span>Sales Specs</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>

                        {game.has_playable_preview ? (
                          <button
                            onClick={() => handleLaunchPreview(game)}
                            className="w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-extrabold text-xs rounded-xl shadow-md transition-all cursor-pointer"
                          >
                            <Play className="w-3.5 h-3.5 fill-current" />
                            <span>Play Demo</span>
                          </button>
                        ) : (
                          <button
                            disabled
                            className="w-full flex items-center justify-center gap-1 px-3 py-2 bg-slate-800/40 text-slate-500 font-medium text-xs rounded-xl cursor-not-allowed"
                            title="Playable demonstration preview not available"
                          >
                            <span>No Preview</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Playable Demo Modal */}
      {demoModalOpen && (
        <LandingDemoModal
          isOpen={demoModalOpen}
          onClose={() => setDemoModalOpen(false)}
          initialGameId={demoGameId}
          gameTitle={demoGameTitle}
        />
      )}
    </div>
  );
};
