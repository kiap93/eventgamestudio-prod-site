import React, { useState } from 'react';
import { LandingHeader } from '../landing/LandingHeader';
import { LandingFooter } from '../landing/LandingFooter';
import { SEO } from '../common/SEO';
import { getPageSeo } from '../../lib/seo';
import { InternalLink } from '../common/InternalLink';
import { navigateTo } from '../../hooks/useRouteContext';
import { useAuth } from '../../context/AuthContext';
import { useLocalization } from '../../context/LocalizationContext';
import {
  Gamepad2,
  Sparkles,
  ArrowRight,
  ChevronRight,
  Clock,
  Users,
  Smartphone,
  Trophy,
  Sliders,
  CheckCircle2,
  Zap,
  Grid3X3,
  ShoppingBasket,
  HelpCircle,
  Play,
  RotateCcw,
  ShieldCheck,
  Tv,
} from 'lucide-react';
import { LandingDemoModal } from '../landing/LandingDemoModal';

interface GameDetailSpec {
  id: string;
  slug: string;
  name: string;
  category: string;
  defaultDuration: string;
  inputTypes: string[];
  orientations: string[];
  maxPlayers: string;
  isAvailable: boolean;
  comingSoon?: boolean;
  overview: string;
  howItWorks: Array<{ step: string; title: string; desc: string }>;
  customizationOptions: Array<{ title: string; description: string }>;
  suitableEventTypes: Array<{ name: string; why: string }>;
  relatedGames: Array<{ name: string; slug: string; desc: string }>;
  relatedSolutions: Array<{ name: string; slug: string }>;
}

const GAME_SPECS: Record<string, GameDetailSpec> = {
  'catch-the-brand': {
    id: 'catch-brand',
    slug: '/game-showcase/catch-the-brand',
    name: 'Catch the Brand',
    category: 'Arcade Catcher',
    defaultDuration: '20 seconds (Customizable 10s-120s)',
    inputTypes: ['Touch / Drag', 'Keyboard Arrow Keys', 'Mouse Movement'],
    orientations: ['Portrait 9:16 (Smartphones & Kiosks)', 'Landscape 16:9 (Tablets & Desktops)'],
    maxPlayers: 'Single-player fast rounds with real-time shared leaderboard',
    isAvailable: true,
    overview:
      'Catch the Brand is a fast-paced arcade action mini-game where event attendees catch branded items falling from the top of the screen while dodging hazardous obstacles and racing to snag rare golden bonus tokens before time expires.',
    howItWorks: [
      { step: '01', title: 'Start Countdown', desc: 'Player taps Play on their mobile screen or kiosk station. A 3-second ready countdown begins.' },
      { step: '02', title: 'Catch Positive Brand Items (+10)', desc: 'Branded products or logos fall at progressively accelerating speeds. Catching positive items scores 10 points.' },
      { step: '03', title: 'Dodge Hazardous Obstacles (-10)', desc: 'Hazardous objects trigger a 10-point penalty and screen shake, requiring sharp reflex evasion.' },
      { step: '04', title: 'Grab Golden Multipliers (+50)', desc: 'Rare golden bonus tokens provide huge scoring surges to propel competitors to the top of the leaderboard.' },
    ],
    customizationOptions: [
      { title: 'Catcher Avatar & Basket', description: 'Upload your brand mascot, shopping basket, branded vehicle, or custom catcher icon.' },
      { title: 'Collectible Falling Items', description: 'Replace generic objects with up to 3 distinct branded products, retail SKUs, or logos.' },
      { title: 'Hazard & Obstacle Graphics', description: 'Design custom negative items (e.g. competitor icons, rain clouds, or obstacle blocks).' },
      { title: 'Golden Bonus Multipliers', description: 'Highlight your flagship product or campaign voucher as the prestigious high-value bonus.' },
      { title: 'Background Illustration', description: 'Set custom backdrop artwork matching your corporate colors or event stage design.' },
      { title: 'Audio & Sound Effects', description: 'Upload custom audio chimes for successful catches, hazards, and buzzer countdowns.' },
    ],
    suitableEventTypes: [
      { name: 'Shopping Mall Roadshows', why: 'Instant pickup-and-play format attracts families and shoppers of all age brackets.' },
      { name: 'Exhibition & Trade Booths', why: 'Short 20-second rounds prevent booth queue bottlenecks while driving competitive visitor engagement.' },
      { name: 'Corporate Annual Dinners', why: 'Table-by-table competitions build tremendous dinner hall cheering and social excitement.' },
      { name: 'Product Launches', why: 'Places newly launched packaging directly into the hands and minds of prospective buyers.' },
    ],
    relatedGames: [
      { name: 'Formula Reaction Lights', slug: '/game-showcase/reaction-challenge', desc: 'Motorsport-inspired millisecond reflex test.' },
      { name: 'Brand Memory Match', slug: '/game-showcase/memory-match', desc: '16-card brand pair matching puzzle.' },
    ],
    relatedSolutions: [
      { name: 'Interactive Event Games', slug: '/interactive-event-games' },
      { name: 'Brand Activation Games', slug: '/brand-activation-games' },
      { name: 'Roadshow Games', slug: '/roadshow-games' },
      { name: 'Exhibition Games', slug: '/exhibition-games' },
    ],
  },

  'memory-match': {
    id: 'memory-match',
    slug: '/game-showcase/memory-match',
    name: 'Brand Memory Match',
    category: 'Memory & Puzzle',
    defaultDuration: '45 seconds (Customizable 20s-120s)',
    inputTypes: ['Touch / Tap', 'Mouse Click'],
    orientations: ['Portrait 9:16', 'Landscape 16:9'],
    maxPlayers: 'Single-player puzzle with real-time shared leaderboard',
    isAvailable: true,
    overview:
      'Brand Memory Match is an interactive card-matching game where participants flip cards across a 4x4 grid to discover 8 identical pairs of custom brand products, corporate logos, or event sponsor icons before the clock runs out.',
    howItWorks: [
      { step: '01', title: 'Grid Presentation', desc: '16 face-down cards appear on screen with your custom branded card back artwork.' },
      { step: '02', title: 'Flip & Match (+100)', desc: 'Player taps two cards. Matching pairs stay face up and award 100 base match points.' },
      { step: '03', title: 'Combo Streak Multipliers (+30)', desc: 'Finding consecutive matches in rapid succession unlocks combo streak bonus points.' },
      { step: '04', title: 'Speed Bonus', desc: 'Clearing all 8 pairs before time expires awards extra points proportional to remaining seconds.' },
    ],
    customizationOptions: [
      { title: '8 Unique Card Pairs', description: 'Upload up to 8 distinct product graphics, sponsor logos, or corporate executive photos.' },
      { title: 'Branded Card Back Design', description: 'Design the reverse side of every card with your primary brand logo or campaign emblem.' },
      { title: 'Canvas Background Art', description: 'Select a clean theme or upload high-resolution venue backdrop graphics.' },
      { title: 'Mismatch Reveal Delay', description: 'Tune the card flip delay (500ms to 1200ms) to calibrate puzzle challenge and difficulty.' },
      { title: 'Card Flip & Match Chimes', description: 'Personalize acoustic feedback for successful card pairs and match combo milestones.' },
    ],
    suitableEventTypes: [
      { name: 'Corporate Gala Summits', why: 'Showcase corporate values, milestones, and brand evolution in an intellectual format.' },
      { name: 'Exhibition Booth Engagements', why: 'Familiarizes trade delegates with your full product matrix and service offerings.' },
      { name: 'Retail Brand Pop-Ups', why: 'Keeps shoppers engaged at cosmetic, electronics, and fashion retail pop-ups.' },
      { name: 'VIP Networking Lounges', why: 'Relaxed, non-stressful puzzle challenge suitable for senior executive guests.' },
    ],
    relatedGames: [
      { name: 'Catch the Brand', slug: '/game-showcase/catch-the-brand', desc: 'Fast-paced arcade item catching challenge.' },
      { name: 'Formula Reaction Lights', slug: '/game-showcase/reaction-challenge', desc: 'Motorsport millisecond reflex test.' },
    ],
    relatedSolutions: [
      { name: 'Corporate Event Games', slug: '/corporate-event-games' },
      { name: 'Branded Event Games', slug: '/branded-event-games' },
      { name: 'Exhibition Games', slug: '/exhibition-games' },
      { name: 'Digital Event Games', slug: '/digital-event-games' },
    ],
  },

  'reaction-challenge': {
    id: 'reaction-tap',
    slug: '/game-showcase/reaction-challenge',
    name: 'Formula Reaction Lights',
    category: 'Reflex Speed Test',
    defaultDuration: '15 seconds default',
    inputTypes: ['Touch / Tap Screen', 'Keyboard Spacebar', 'Mouse Click'],
    orientations: ['Landscape 16:9 (Recommended)', 'Portrait 9:16'],
    maxPlayers: 'Single-player precision challenge with millisecond leaderboard',
    isAvailable: true,
    overview:
      'Formula Reaction Lights is an intense, millisecond-accurate reflex challenge modeled after motorsport starting sequences. Five red lights illuminate sequentially; when they extinguish at an unpredictable split second, players tap immediately.',
    howItWorks: [
      { step: '01', title: 'Starting Light Sequence', desc: 'Five red starting lights illuminate one by one at steady 1-second intervals.' },
      { step: '02', title: 'Tension Build', desc: 'All five lights stay illuminated for an unpredictable delay between 1.0 and 4.0 seconds.' },
      { step: '03', title: 'Lights Out: REACT!', desc: 'The instant the red lights vanish, the player taps. Timestamp accuracy measures latency to the millisecond.' },
      { step: '04', title: 'Jump Start Prevention', desc: 'Tapping prematurely flags a false start penalty, demanding absolute focus and discipline.' },
    ],
    customizationOptions: [
      { title: 'Motorsport & Corporate Backdrops', description: 'Upload custom racetrack scenery, automotive showrooms, or high-tech circuit boards.' },
      { title: 'Starting Light Housing', description: 'Brand the starting gantry with your company logo, sponsor banners, or racing livery.' },
      { title: 'Engine Revs & Audio Cues', description: 'Authentic starting beep sound effects and acoustic engine revving ambiance.' },
      { title: 'Difficulty & Delay Bounds', description: 'Customize the randomized lights-out interval window for VIP or youth audiences.' },
    ],
    suitableEventTypes: [
      { name: 'Automotive & Motorsport Expos', why: 'Direct thematic resonance with car launches, grand prix activations, and karting venues.' },
      { name: 'Tech & Engineering Conferences', why: 'Millisecond data accuracy appeals strongly to analytical, tech-minded delegates.' },
      { name: 'Sports & Energy Drink Campaigns', why: 'High-adrenaline reflex gameplay matches high-octane marketing messaging.' },
      { name: 'VIP Gala Stage Battles', why: 'Head-to-head reflex duels create phenomenal high-stakes stage theater.' },
    ],
    relatedGames: [
      { name: 'Catch the Brand', slug: '/game-showcase/catch-the-brand', desc: 'Fast arcade catching with scoring multipliers.' },
      { name: 'Brand Memory Match', slug: '/game-showcase/memory-match', desc: '16-card brand product pair matching puzzle.' },
    ],
    relatedSolutions: [
      { name: 'Interactive Event Games', slug: '/interactive-event-games' },
      { name: 'Corporate Event Games', slug: '/corporate-event-games' },
      { name: 'Roadshow Games', slug: '/roadshow-games' },
      { name: 'Brand Activation Games', slug: '/brand-activation-games' },
    ],
  },

  'speed-quiz': {
    id: 'speed-quiz',
    slug: '/game-showcase/speed-quiz',
    name: 'Event Trivia Speed Quiz',
    category: 'Trivia & Knowledge (Roadmap)',
    defaultDuration: '30 seconds (Roadmap Engine)',
    inputTypes: ['Touch / Tap', 'Keyboard', 'Mouse Click'],
    orientations: ['Portrait 9:16', 'Landscape 16:9'],
    maxPlayers: '1-4 player live buzzer challenge (Scheduled)',
    isAvailable: false,
    comingSoon: true,
    overview:
      'Event Trivia Speed Quiz is an upcoming interactive trivia challenge designed for live corporate seminars, town halls, and brand knowledge testing. The game engine is currently under development on the platform roadmap.',
    howItWorks: [
      { step: '01', title: 'Timed Question Rounds', desc: 'Multiple-choice company trivia questions appear with a 10-second countdown.' },
      { step: '02', title: 'Instant Buzzer Response', desc: 'Participants tap their answer choice. Faster correct answers score higher points.' },
      { step: '03', title: 'Leaderboard Tally', desc: 'Live scoreboard tallies top trivia masters across the event room.' },
    ],
    customizationOptions: [
      { title: 'Custom Brand Trivia Questions', description: 'Input company history, product specs, or lighthearted team trivia.' },
      { title: 'Buzzer Sounds & Countdown Audio', description: 'Upload company chimes and dramatic countdown sound cues.' },
    ],
    suitableEventTypes: [
      { name: 'Company Town Halls', why: 'Reinforce annual business strategies and test employee brand knowledge.' },
      { name: 'Training Seminars', why: 'Interactive knowledge checkpoints during educational workshop sessions.' },
    ],
    relatedGames: [
      { name: 'Catch the Brand', slug: '/game-showcase/catch-the-brand', desc: 'Fast arcade item catching challenge.' },
      { name: 'Brand Memory Match', slug: '/game-showcase/memory-match', desc: '16-card brand pair matching puzzle.' },
      { name: 'Formula Reaction Lights', slug: '/game-showcase/reaction-challenge', desc: 'Motorsport millisecond reflex test.' },
    ],
    relatedSolutions: [
      { name: 'Corporate Event Games', slug: '/corporate-event-games' },
      { name: 'Interactive Event Games', slug: '/interactive-event-games' },
    ],
  },
};

interface PublicGameDetailPageProps {
  slugKey: string;
}

export const PublicGameDetailPage: React.FC<PublicGameDetailPageProps> = ({ slugKey }) => {
  const { t } = useLocalization();
  const { isAuthenticated } = useAuth();
  
  // Normalize slug to match game specs
  let normalizedKey = slugKey.replace(/^\/(games|game-showcase)\//, '').replace(/\/+$/, '');
  if (normalizedKey === 'catch-brand') normalizedKey = 'catch-the-brand';
  if (normalizedKey === 'reaction-tap' || normalizedKey === 'reaction-time') normalizedKey = 'reaction-challenge';

  const spec = GAME_SPECS[normalizedKey] || GAME_SPECS['catch-the-brand'];
  const pageSeo = getPageSeo(`/game-showcase/${normalizedKey}`);

  const [demoModalOpen, setDemoModalOpen] = useState(false);

  const handleGetStarted = () => {
    if (isAuthenticated) {
      navigateTo('/events');
    } else {
      navigateTo('/login');
    }
  };

  return (
    <div className="min-h-screen bg-white text-slate-900 flex flex-col font-sans selection:bg-amber-100 selection:text-amber-900">
      <SEO config={pageSeo} />

      <LandingHeader onExploreGames={() => navigateTo('/game-showcase')} />

      <main className="flex-1">
        {/* Breadcrumb Navigation */}
        <div className="w-full bg-slate-50 border-b border-slate-200/80 py-2.5">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <nav className="flex items-center gap-2 text-xs text-slate-500 font-medium">
              <InternalLink href="/" className="hover:text-amber-600 transition-colors">
                {t('nav.home')}
              </InternalLink>
              <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
              <InternalLink href="/game-showcase" className="hover:text-amber-600 transition-colors">
                {t('nav.games')}
              </InternalLink>
              <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-slate-900 font-semibold">{spec.name}</span>
            </nav>
          </div>
        </div>

        {/* Hero */}
        <section className="pt-12 pb-16 md:pt-16 md:pb-24 bg-gradient-to-b from-amber-500/5 via-slate-50/50 to-white border-b border-slate-100">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="max-w-4xl mx-auto text-center space-y-6">
              {/* Category & Status */}
              <div className="flex items-center justify-center gap-2">
                <span className="px-3.5 py-1 rounded-full bg-slate-900 text-white text-xs font-bold uppercase tracking-wider">
                  {spec.category}
                </span>
                {spec.isAvailable ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-bold">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span>{t('event.statusLive')}</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-200 text-xs font-bold">
                    <Clock className="w-3 h-3 text-amber-600" />
                    <span>{t('gamesCatalog.comingSoon')}</span>
                  </span>
                )}
              </div>

              {/* Primary H1 */}
              <h1 className="text-3xl sm:text-5xl md:text-6xl font-black text-slate-900 tracking-tight leading-[1.1]">
                {spec.name}
              </h1>

              {/* Overview text */}
              <p className="text-base sm:text-lg md:text-xl text-slate-600 leading-relaxed max-w-3xl mx-auto">
                {spec.overview}
              </p>

              {/* Buttons */}
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3.5 pt-2">
                {spec.isAvailable ? (
                  <>
                    <button
                      onClick={() => setDemoModalOpen(true)}
                      className="w-full sm:w-auto px-7 py-3.5 rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-sm transition-all shadow-lg shadow-amber-500/25 hover:shadow-amber-500/35 active:scale-95 cursor-pointer flex items-center justify-center gap-2"
                    >
                      <Play className="w-4 h-4 fill-current" />
                      <span>{t('gamesCatalog.launchDemo')}</span>
                    </button>
                    <button
                      onClick={handleGetStarted}
                      className="w-full sm:w-auto px-6 py-3.5 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-sm transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-2 shadow-xs"
                    >
                      <span>{t('event.createEvent')}</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => navigateTo('/contact')}
                    className="w-full sm:w-auto px-7 py-3.5 rounded-2xl bg-slate-900 text-white font-bold text-sm transition-all cursor-pointer flex items-center justify-center gap-2"
                  >
                    <span>{t('landing.preOrderEnquire')}</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Technical Specs Summary */}
        <section className="py-8 bg-slate-50 border-b border-slate-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-xs">
              <div className="space-y-1">
                <span className="text-slate-400 font-bold uppercase tracking-wider block">{t('gameDetail.defaultDuration')}</span>
                <span className="text-slate-900 font-bold text-sm">{spec.defaultDuration}</span>
              </div>
              <div className="space-y-1">
                <span className="text-slate-400 font-bold uppercase tracking-wider block">{t('gameDetail.controls')}</span>
                <span className="text-slate-900 font-bold text-sm">{spec.inputTypes.join(', ')}</span>
              </div>
              <div className="space-y-1">
                <span className="text-slate-400 font-bold uppercase tracking-wider block">{t('gameDetail.orientations')}</span>
                <span className="text-slate-900 font-bold text-sm">{spec.orientations.join(' / ')}</span>
              </div>
              <div className="space-y-1">
                <span className="text-slate-400 font-bold uppercase tracking-wider block">{t('event.leaderboard')}</span>
                <span className="text-slate-900 font-bold text-sm">{t('seoSolutions.heroBadge')}</span>
              </div>
            </div>
          </div>
        </section>

        {/* How The Game Works */}
        <section className="py-16 md:py-24 bg-white border-b border-slate-100">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
            <div className="text-center max-w-2xl mx-auto space-y-3">
              <span className="text-xs font-bold uppercase tracking-wider text-amber-600">{t('gameDetail.howItWorks')}</span>
              <h2 className="text-2xl sm:text-4xl font-black text-slate-900 tracking-tight">
                {t('gameDetail.howItWorks')}
              </h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {spec.howItWorks.map((hw, idx) => (
                <div key={idx} className="p-6 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
                  <span className="text-2xl font-black text-amber-500/50">{hw.step}</span>
                  <h3 className="text-base font-bold text-slate-900">{hw.title}</h3>
                  <p className="text-xs text-slate-600 leading-relaxed">{hw.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Customization Possibilities */}
        <section className="py-16 md:py-24 bg-slate-50/70 border-b border-slate-100">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
            <div className="text-center max-w-2xl mx-auto space-y-3">
              <span className="text-xs font-bold uppercase tracking-wider text-amber-600">{t('gameDetail.customizationOptions')}</span>
              <h2 className="text-2xl sm:text-4xl font-black text-slate-900 tracking-tight">
                {t('gameDetail.customizationOptions')}
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {spec.customizationOptions.map((opt, idx) => (
                <div key={idx} className="p-6 rounded-2xl bg-white border border-slate-200/80 shadow-xs space-y-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-700 flex items-center justify-center">
                    <Sliders className="w-5 h-5" />
                  </div>
                  <h3 className="text-base font-bold text-slate-900">{opt.title}</h3>
                  <p className="text-xs text-slate-600 leading-relaxed">{opt.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Suitable Event Formats */}
        <section className="py-16 md:py-24 bg-white border-b border-slate-100">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
            <div className="text-center max-w-2xl mx-auto space-y-3">
              <span className="text-xs font-bold uppercase tracking-wider text-amber-600">{t('gameDetail.suitableEvents')}</span>
              <h2 className="text-2xl sm:text-4xl font-black text-slate-900 tracking-tight">
                {t('gameDetail.suitableEvents')}
              </h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {spec.suitableEventTypes.map((et, idx) => (
                <div key={idx} className="p-6 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
                  <h3 className="text-base font-black text-slate-900">{et.name}</h3>
                  <p className="text-xs text-slate-600 leading-relaxed">{et.why}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Related Games & Solutions */}
        <section className="py-14 bg-slate-50 border-b border-slate-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
            <div className="space-y-4">
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500">
                {t('gameDetail.exploreOtherGames')}
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {spec.relatedGames.map((rg, idx) => (
                  <InternalLink
                    key={idx}
                    href={rg.slug}
                    className="p-5 rounded-2xl bg-white border border-slate-200 hover:border-amber-400 text-left transition-all group flex items-center justify-between"
                  >
                    <div>
                      <span className="text-sm font-bold text-slate-900 group-hover:text-amber-800 block">
                        {rg.name}
                      </span>
                      <span className="text-xs text-slate-500 mt-1 block">{rg.desc}</span>
                    </div>
                    <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-amber-600 group-hover:translate-x-1 transition-all shrink-0 ml-4" />
                  </InternalLink>
                ))}
              </div>
            </div>

            <div className="pt-4 border-t border-slate-200 space-y-3">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400 block">
                {t('gameDetail.relatedSolutions')}
              </span>
              <div className="flex flex-wrap gap-2 text-xs">
                {spec.relatedSolutions.map((sol, idx) => (
                  <InternalLink
                    key={idx}
                    href={sol.slug}
                    className="px-3.5 py-1.5 rounded-lg bg-white border border-slate-200 hover:border-amber-400 text-slate-700 hover:text-amber-800 transition-colors"
                  >
                    {sol.name} →
                  </InternalLink>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="py-14 bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 text-center">
          <div className="max-w-3xl mx-auto px-4 space-y-4">
            <h2 className="text-2xl sm:text-4xl font-black">
              Launch {spec.name}
            </h2>
            <p className="text-sm sm:text-base font-medium text-slate-900/80">
              {t('seoSolutions.readyToEngageSubtitle')}
            </p>
            <div className="pt-2 flex justify-center gap-3">
              <button
                type="button"
                onClick={handleGetStarted}
                className="px-7 py-3.5 rounded-2xl bg-slate-950 text-white font-black text-xs hover:bg-slate-900 transition-colors shadow-lg cursor-pointer"
              >
                {t('event.createEvent')}
              </button>
              <InternalLink
                href="/contact"
                className="px-6 py-3.5 rounded-2xl bg-white text-slate-950 font-bold text-xs hover:bg-slate-50 transition-colors inline-block text-center"
              >
                {t('nav.contact')}
              </InternalLink>
            </div>
          </div>
        </section>
      </main>

      <LandingFooter />

      {demoModalOpen && (
        <LandingDemoModal
          isOpen={demoModalOpen}
          onClose={() => setDemoModalOpen(false)}
          initialGameId={spec.id}
        />
      )}
    </div>
  );
};
