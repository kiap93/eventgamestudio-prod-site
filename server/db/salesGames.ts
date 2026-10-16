import { GameRecord, GamePricingRecord } from './types.js';
import { getAllPlatformGames } from './games.js';
import { getActiveGamePricing, buildDefaultPricingTiers, localGamePricingCache } from './gamePricing.js';
import { getDefaultPricingCountry } from './platformSettings.js';
import { getCurrencyForCountry, getCountryByCode } from '../../src/lib/countryUtils.js';
import { isLocalFallbackAllowed } from '../supabase.js';

export interface SalesGameStepInstruction {
  step: string;
  title: string;
  desc: string;
}

export interface SalesGameEventType {
  name: string;
  why: string;
}

export interface SalesGameCustomizationOption {
  title: string;
  description: string;
}

export interface SalesGamePricingTierSummary {
  id: string;
  min_days: number;
  max_days: number | null;
  duration_label: string;
  price: number;
  currency: string;
  country_code: string;
  is_base: boolean;
}

export interface SalesGamePricingSummary {
  requires_custom_quote: boolean;
  display_price: string;
  base_price: number | null;
  currency: string | null;
  pricing_country: string;
  is_fallback: boolean;
  tiers: SalesGamePricingTierSummary[];
}

export interface SalesGameCatalogItem {
  id: string;
  name: string;
  slug: string;
  game_type: string;
  category: string;
  description: string;
  highlight: string;
  icon_name: string;
  cover_image_url: string;
  background_url: string;
  default_duration_seconds: number;
  supported_input_types: string[];
  orientations: string[];
  has_playable_preview: boolean;
  gameplay_instructions: SalesGameStepInstruction[];
  suitable_event_types: SalesGameEventType[];
  customization_capabilities: SalesGameCustomizationOption[];
  pricing: SalesGamePricingSummary;
}

// Allowed production game engines for active Sales demonstration
export const APPROVED_SALES_GAME_ENGINES = new Set([
  'catch-brand',
  'memory-match',
  'reaction-tap',
  'reaction-time',
  'match-3',
]);

// Rich canonical metadata for production engines (aligned with PublicGameDetailPage & PublicGamesPage)
const CANONICAL_SALES_SPECS: Record<
  string,
  {
    category: string;
    highlight: string;
    default_duration_seconds: number;
    supported_input_types: string[];
    orientations: string[];
    gameplay_instructions: SalesGameStepInstruction[];
    suitable_event_types: SalesGameEventType[];
    customization_capabilities: SalesGameCustomizationOption[];
  }
> = {
  'catch-brand': {
    category: 'Arcade Catcher',
    highlight: 'Highest attendee throughput (60+ players/hr). Ideal for roadshows, mall pop-ups, and live booth activations.',
    default_duration_seconds: 20,
    supported_input_types: ['Touch / Drag', 'Keyboard Arrow Keys', 'Mouse Movement'],
    orientations: ['Portrait 9:16 (Smartphones & Kiosks)', 'Landscape 16:9 (Tablets & Displays)'],
    gameplay_instructions: [
      { step: '01', title: 'Start Countdown', desc: 'Player taps Play on their device or kiosk station. A 3-second ready countdown begins.' },
      { step: '02', title: 'Catch Positive Brand Items (+10)', desc: 'Branded products or logos fall at progressively accelerating speeds. Catching positive items scores 10 points.' },
      { step: '03', title: 'Dodge Hazardous Obstacles (-10)', desc: 'Hazardous obstacles trigger a score penalty and screen shake, requiring sharp reflex evasion.' },
      { step: '04', title: 'Collect Golden Multipliers (+50)', desc: 'Rare golden bonus tokens provide huge scoring surges to propel competitors to the top of the leaderboard.' },
    ],
    suitable_event_types: [
      { name: 'Shopping Mall Roadshows', why: 'Instant pickup-and-play format attracts families and shoppers across all age brackets.' },
      { name: 'Exhibition & Trade Booths', why: 'Short 20-30s rounds prevent booth queue bottlenecks while driving competitive engagement.' },
      { name: 'Corporate Annual Dinners', why: 'Table-by-table competitions build tremendous dinner hall cheering and social excitement.' },
      { name: 'Product Launches', why: 'Places newly launched packaging visuals directly into attendees\' hands and memories.' },
    ],
    customization_capabilities: [
      { title: 'Catcher Avatar & Basket', description: 'Upload brand mascot, custom shopping cart, branded vehicle, or avatar icon.' },
      { title: 'Collectible Falling Items', description: 'Feature up to 3 distinct branded products, retail packaging SKUs, or corporate logos.' },
      { title: 'Hazard & Obstacle Graphics', description: 'Design custom negative items (e.g. competitor icons, rain clouds, or obstacle blocks).' },
      { title: 'Golden Bonus Multipliers', description: 'Highlight flagship product or campaign voucher as the prestigious high-value bonus.' },
      { title: 'Backdrop & Canvas Art', description: 'Set custom backdrop illustration matching corporate colors and venue aesthetic.' },
      { title: 'Audio & Sound Effects', description: 'Personalize acoustic feedback for successful catches, hazard collisions, and final countdown buzzer.' },
    ],
  },
  'memory-match': {
    category: 'Memory & Puzzle',
    highlight: 'Exceptional brand retention and intellectual engagement. Showcases 8 distinct product pairs.',
    default_duration_seconds: 45,
    supported_input_types: ['Touch / Tap Screen', 'Mouse Click'],
    orientations: ['Portrait 9:16', 'Landscape 16:9'],
    gameplay_instructions: [
      { step: '01', title: 'Grid Presentation', desc: '16 face-down cards appear on a 4x4 board with your custom branded card back design.' },
      { step: '02', title: 'Flip & Match (+100)', desc: 'Player taps two cards. Matching pairs stay face up and award 100 base match points.' },
      { step: '03', title: 'Combo Streak Multipliers (+30)', desc: 'Finding consecutive matches in rapid succession unlocks combo streak bonus points.' },
      { step: '04', title: 'Speed Clear Bonus', desc: 'Clearing all 8 pairs before time expires awards extra points proportional to remaining seconds.' },
    ],
    suitable_event_types: [
      { name: 'Corporate Gala Summits', why: 'Showcase corporate values, milestones, and brand evolution in an intellectual format.' },
      { name: 'Trade Exhibitions', why: 'Familiarizes trade delegates with your full product matrix and service offerings.' },
      { name: 'Retail Brand Pop-Ups', why: 'Keeps shoppers engaged at cosmetic, electronics, and fashion retail pop-ups.' },
      { name: 'VIP Networking Lounges', why: 'Relaxed, non-stressful puzzle challenge suitable for senior executive guests.' },
    ],
    customization_capabilities: [
      { title: '8 Unique Card Pairs', description: 'Upload up to 8 distinct product graphics, sponsor logos, or corporate executive photos.' },
      { title: 'Branded Card Back Design', description: 'Design the reverse side of every card with your primary brand logo or campaign emblem.' },
      { title: 'Canvas Background Art', description: 'Select a clean theme or upload high-resolution venue backdrop graphics.' },
      { title: 'Mismatch Reveal Delay', description: 'Tune the card flip delay (500ms to 1200ms) to calibrate puzzle challenge and difficulty.' },
      { title: 'Card Flip & Match Chimes', description: 'Personalize acoustic feedback for successful card pairs and match combo milestones.' },
    ],
  },
  'reaction-tap': {
    category: 'Precision Reflex',
    highlight: 'Instant competitive excitement with millisecond-precision timing. Perfect for sports, automotive, and stage battles.',
    default_duration_seconds: 15,
    supported_input_types: ['Touch / Tap Screen', 'Keyboard Spacebar', 'Mouse Click'],
    orientations: ['Landscape 16:9 (Recommended)', 'Portrait 9:16'],
    gameplay_instructions: [
      { step: '01', title: 'Starting Light Sequence', desc: 'Five red starting lights illuminate sequentially at steady 1-second intervals.' },
      { step: '02', title: 'Tension Build', desc: 'All five lights stay illuminated for an unpredictable delay between 1.0 and 4.0 seconds.' },
      { step: '03', title: 'Lights Out: REACT!', desc: 'The instant the red lights vanish, the player taps. Timestamp accuracy measures latency to the millisecond.' },
      { step: '04', title: 'Jump Start Prevention', desc: 'Tapping prematurely flags a false start penalty, demanding absolute focus and discipline.' },
    ],
    suitable_event_types: [
      { name: 'Automotive & Motorsport Expos', why: 'Direct thematic resonance with car launches, grand prix activations, and karting venues.' },
      { name: 'Tech & Engineering Conferences', why: 'Millisecond data accuracy appeals strongly to analytical, tech-minded delegates.' },
      { name: 'Sports & Energy Drink Campaigns', why: 'High-adrenaline reflex gameplay matches high-octane marketing messaging.' },
      { name: 'VIP Gala Stage Battles', why: 'Head-to-head reflex duels create phenomenal high-stakes stage theater.' },
    ],
    customization_capabilities: [
      { title: 'Motorsport & Corporate Backdrops', description: 'Upload custom racetrack scenery, automotive showrooms, or high-tech circuit boards.' },
      { title: 'Starting Light Housing', description: 'Brand the starting gantry with your company logo, sponsor banners, or racing livery.' },
      { title: 'Engine Revs & Audio Cues', description: 'Authentic starting beep sound effects and acoustic engine revving ambiance.' },
      { title: 'Difficulty & Delay Bounds', description: 'Customize the randomized lights-out interval window for VIP or youth audiences.' },
    ],
  },
  'match-3': {
    category: 'Match-3 Puzzle',
    highlight: 'Universal appeal across all age demographics. Custom tile icons, special power gems, and combo cascades.',
    default_duration_seconds: 60,
    supported_input_types: ['Touch / Drag', 'Mouse Click / Drag', 'Keyboard'],
    orientations: ['Portrait 9:16', 'Landscape 16:9'],
    gameplay_instructions: [
      { step: '01', title: 'Swap Adjacent Tiles', desc: 'Swap adjacent tiles horizontally or vertically to create lines of 3 or more matching tiles.' },
      { step: '02', title: 'Trigger Special Power-Ups', desc: 'Match 4 in a line for Rockets (row/col sweep) or 5 in a cluster for explosive area Bombs.' },
      { step: '03', title: 'Cascading Combos', desc: 'Cleared tiles drop new ones, triggering chain-reaction cascade score multipliers.' },
      { step: '04', title: 'Beat the Session Clock', desc: 'Achieve the highest score possible before the session timer expires.' },
    ],
    suitable_event_types: [
      { name: 'Shopping Mall Campaigns', why: 'Broadest demographic appeal; universally familiar mechanics for children and adults alike.' },
      { name: 'Retail Pop-Up Stores', why: 'High replayability drives repeat customer visits and purchases to beat top leaderboard scores.' },
      { name: 'Corporate Roadshows', why: 'Accessible, friendly competition format for multi-day touring roadshows.' },
      { name: 'Exhibition Lounges', why: 'Relaxing drop-in game keeping trade show delegates entertained between speaking sessions.' },
    ],
    customization_capabilities: [
      { title: 'Custom Branded Tiles', description: 'Upload custom icons for regular tiles (products, brand logos, or themed graphics).' },
      { title: 'Special Power-Up Artwork', description: 'Brand explosive Rockets, Bombs, and Color Bomb power-ups with campaign visuals.' },
      { title: 'Backdrop Canvas Artwork', description: 'Set high-resolution campaign theme backdrops matching venue decor.' },
      { title: 'Audio Effects & Jingles', description: 'Delightful audio chimes for match clears, explosive power blasts, and combo streaks.' },
      { title: 'Session Duration & Speed', description: 'Calibrate time limit (30s to 120s) and cascade drop speeds for target event pacing.' },
    ],
  },
};

export const VERIFIED_PLAYABLE_ENGINES = new Set([
  'catch-brand',
  'memory-match',
  'reaction-tap',
  'reaction-time',
  'match-3',
]);

/**
 * Determines whether a game has a verified, functional playable preview.
 * Never blindly assumes playable preview just because an engine string exists.
 */
export function hasVerifiedPlayablePreview(
  gameOrType: GameRecord | string,
  canonicalOrPublished?: string | boolean
): boolean {
  if (!gameOrType) return false;

  let status = 'active';
  let canonicalType = '';
  let isComingSoon = false;
  let isUnavailable = false;
  let explicitPreviewFlag: boolean | undefined = undefined;

  if (typeof gameOrType === 'string') {
    canonicalType = gameOrType;
    if (typeof canonicalOrPublished === 'boolean') {
      status = canonicalOrPublished ? 'active' : 'draft';
    } else if (typeof canonicalOrPublished === 'string') {
      status = canonicalOrPublished;
    }
  } else if (typeof gameOrType === 'object') {
    status = gameOrType.status;
    canonicalType = (canonicalOrPublished as string) || gameOrType.game_type || (gameOrType as any).slug || '';
    isComingSoon = (gameOrType as any).is_coming_soon === true;
    isUnavailable = (gameOrType as any).is_unavailable === true;
    explicitPreviewFlag = (gameOrType as any).has_playable_preview;
  }

  if (status !== 'active') return false;
  if (!VERIFIED_PLAYABLE_ENGINES.has(canonicalType)) return false;
  if (isComingSoon || isUnavailable || explicitPreviewFlag === false) {
    return false;
  }
  return true;
}

/**
 * Helper to format duration labels
 */
export function formatDurationLabel(minDays: number, maxDays: number | null): string {
  if (minDays === maxDays) {
    return `${minDays} day${minDays > 1 ? 's' : ''}`;
  }
  if (maxDays === null) {
    return `${minDays}+ days`;
  }
  return `${minDays}–${maxDays} days`;
}

/**
 * Resolves pricing summary for sales demonstration.
 * Never exposes internal costs or administrative pricing controls.
 * Falls back to "Contact Us" if no tier or custom quote is flagged.
 */
export async function resolveSalesPricing(
  gameId: string,
  requestedCountry?: string,
  env?: Record<string, any>
): Promise<SalesGamePricingSummary> {
  const defaultCountry = await getDefaultPricingCountry(env);
  const normCountry = (requestedCountry || '').trim().toUpperCase() || defaultCountry;

  let allActiveTiers: GamePricingRecord[] = [];
  try {
    allActiveTiers = await getActiveGamePricing(gameId, undefined, env);
  } catch (err) {
    console.warn(`[resolveSalesPricing] Could not load tiers for game ${gameId}:`, err);
    allActiveTiers = [];
  }

  // In test/local fallback mode, if no tiers are in the database, generate standard default tiers
  if (allActiveTiers.length === 0 && isLocalFallbackAllowed(env) && !localGamePricingCache.has(gameId)) {
    const baseTiers = buildDefaultPricingTiers(
      gameId,
      undefined,
      defaultCountry,
      getCurrencyForCountry(defaultCountry) || 'MYR'
    );
    if (normCountry !== defaultCountry && getCountryByCode(normCountry)) {
      const countryTiers = buildDefaultPricingTiers(
        gameId,
        undefined,
        normCountry,
        getCurrencyForCountry(normCountry) || 'USD'
      );
      allActiveTiers = [...baseTiers, ...countryTiers];
    } else {
      allActiveTiers = baseTiers;
    }
  }

  // 1. Check for tiers matching requested country
  let matchingTiers = allActiveTiers.filter(
    (t) => (t.country_code || '').toUpperCase() === normCountry && Number(t.price) > 0
  );

  let isFallback = false;
  let pricingCountry = normCountry;

  // 2. Fallback to default country (e.g. US or MY) if none found
  if (matchingTiers.length === 0) {
    const defaultTiers = allActiveTiers.filter(
      (t) => (t.country_code || '').toUpperCase() === defaultCountry && Number(t.price) > 0
    );
    if (defaultTiers.length > 0) {
      matchingTiers = defaultTiers;
      isFallback = true;
      pricingCountry = defaultCountry;
    } else {
      const myTiers = allActiveTiers.filter(
        (t) => (t.country_code || '').toUpperCase() === 'MY' && Number(t.price) > 0
      );
      if (myTiers.length > 0) {
        matchingTiers = myTiers;
        isFallback = true;
        pricingCountry = 'MY';
      }
    }
  }

  // If no pricing tiers exist or price is unconfigured -> Contact Us
  if (matchingTiers.length === 0) {
    return {
      requires_custom_quote: true,
      display_price: 'Contact Us',
      base_price: null,
      currency: null,
      pricing_country: normCountry,
      is_fallback: isFallback,
      tiers: [],
    };
  }

  matchingTiers.sort((a, b) => a.min_days - b.min_days);

  // Identify base tier (is_base === true or min_days === 1)
  const baseTier = matchingTiers.find((t) => t.is_base) || matchingTiers.find((t) => t.min_days === 1) || matchingTiers[0];
  const currency = baseTier.currency || getCurrencyForCountry(pricingCountry) || 'USD';
  const basePrice = Number(baseTier.price);

  if (isNaN(basePrice) || basePrice <= 0) {
    return {
      requires_custom_quote: true,
      display_price: 'Contact Us',
      base_price: null,
      currency: null,
      pricing_country: normCountry,
      is_fallback: isFallback,
      tiers: [],
    };
  }

  const formattedTiers: SalesGamePricingTierSummary[] = matchingTiers.map((t) => ({
    id: t.id,
    min_days: t.min_days,
    max_days: t.max_days ?? null,
    duration_label: formatDurationLabel(t.min_days, t.max_days ?? null),
    price: Number(t.price),
    currency: t.currency || currency,
    country_code: t.country_code || pricingCountry,
    is_base: Boolean(t.is_base),
  }));

  const formattedPriceString = basePrice.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });

  const durationText = baseTier.min_days === 1 && (baseTier.max_days === 1 || baseTier.max_days === null)
    ? '1 day'
    : formatDurationLabel(baseTier.min_days, baseTier.max_days);

  return {
    requires_custom_quote: false,
    display_price: `From ${currency} ${formattedPriceString} (${durationText})`,
    base_price: basePrice,
    currency,
    pricing_country: pricingCountry,
    is_fallback: isFallback,
    tiers: formattedTiers,
  };
}

/**
 * Maps a raw GameRecord into a safe, demonstration-ready SalesGameCatalogItem.
 * Excludes internal developer/admin fields.
 */
export function mapGameToSalesItem(
  game: GameRecord,
  pricing: SalesGamePricingSummary
): SalesGameCatalogItem {
  const normType = (game.game_type || game.slug || 'catch-brand').toLowerCase();
  const canonicalType = normType === 'reaction-time' ? 'reaction-tap' : normType;
  const spec = CANONICAL_SALES_SPECS[canonicalType] || CANONICAL_SALES_SPECS['catch-brand'];
  const hasPlayable = hasVerifiedPlayablePreview(game, canonicalType);

  return {
    id: game.id,
    name: game.name,
    slug: game.slug,
    game_type: game.game_type || canonicalType,
    category: spec.category,
    description: game.description || 'Interactive event mini-game for attendee engagement.',
    highlight: spec.highlight,
    icon_name: game.icon_name || 'Gamepad2',
    cover_image_url:
      game.background_url ||
      `/assets/games/${canonicalType}/themes/default/background.png`,
    background_url:
      game.background_url ||
      `/assets/games/${canonicalType}/themes/default/background.png`,
    default_duration_seconds: spec.default_duration_seconds,
    supported_input_types: spec.supported_input_types,
    orientations: spec.orientations,
    has_playable_preview: hasPlayable,
    gameplay_instructions: spec.gameplay_instructions,
    suitable_event_types: spec.suitable_event_types,
    customization_capabilities: spec.customization_capabilities,
    pricing,
  };
}

/**
 * Retrieves all approved, published platform games for Sales Partner catalogue.
 * Excludes:
 * - Unpublished games (status !== 'active')
 * - Internal testing games / developer sandboxes (non-system / private org games)
 * - In-development / roadmap games (e.g. speed-quiz)
 */
export async function getApprovedSalesGames(
  requestedCountry?: string,
  env?: Record<string, any>
): Promise<SalesGameCatalogItem[]> {
  const allPlatformGames = await getAllPlatformGames(env);

  // Filter strictly for published, active system games in the approved engines whitelist
  const approvedGames = (allPlatformGames || []).filter((game) => {
    // 1. Must be active status
    if (game.status !== 'active') return false;

    // 2. Must be platform/system game (strictly organization_id === null and is_system !== false)
    if (game.organization_id !== null && game.organization_id !== undefined) return false;
    if (game.is_system === false) return false;

    // 3. Engine must be in the approved whitelist (excludes speed-quiz and test sandbox engines)
    const engineType = (game.game_type || game.slug || '').toLowerCase();
    const canonicalType = engineType === 'reaction-time' ? 'reaction-tap' : engineType;
    if (!APPROVED_SALES_GAME_ENGINES.has(canonicalType)) return false;

    return true;
  });

  // Sort canonical order: catch-brand, memory-match, reaction-tap, match-3
  const canonicalOrder = ['catch-brand', 'memory-match', 'reaction-tap', 'match-3'];
  approvedGames.sort((a, b) => {
    const aType = (a.game_type || a.slug || '').toLowerCase();
    const bType = (b.game_type || b.slug || '').toLowerCase();
    const aNorm = aType === 'reaction-time' ? 'reaction-tap' : aType;
    const bNorm = bType === 'reaction-time' ? 'reaction-tap' : bType;
    const aIdx = canonicalOrder.indexOf(aNorm);
    const bIdx = canonicalOrder.indexOf(bNorm);
    if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
    if (aIdx !== -1) return -1;
    if (bIdx !== -1) return 1;
    return a.name.localeCompare(b.name);
  });

  // Map each game to safe SalesGameCatalogItem with authoritative pricing
  const results: SalesGameCatalogItem[] = [];
  for (const game of approvedGames) {
    const pricing = await resolveSalesPricing(game.id, requestedCountry, env);
    results.push(mapGameToSalesItem(game, pricing));
  }

  return results;
}

/**
 * Retrieves a single approved game by ID or slug for the sales game-detail view.
 * Fails closed (returns null) if the game is unpublished, internal, or does not exist.
 */
export async function getApprovedSalesGameById(
  gameIdOrSlug: string,
  requestedCountry?: string,
  env?: Record<string, any>
): Promise<SalesGameCatalogItem | null> {
  if (!gameIdOrSlug) return null;

  const allApproved = await getApprovedSalesGames(requestedCountry, env);
  const matched = allApproved.find(
    (g) => g.id === gameIdOrSlug || g.slug === gameIdOrSlug || g.game_type === gameIdOrSlug
  );

  return matched || null;
}
