import React, { useState } from 'react';
import { LandingHeader } from '../landing/LandingHeader';
import { LandingFooter } from '../landing/LandingFooter';
import { SEO } from '../common/SEO';
import { getPageSeo, SEO_PAGE_CONFIGS, PageSeoConfig } from '../../lib/seo';
import { InternalLink } from '../common/InternalLink';
import { navigateTo } from '../../hooks/useRouteContext';
import { useAuth } from '../../context/AuthContext';
import {
  Gamepad2,
  Sparkles,
  Trophy,
  QrCode,
  CheckCircle2,
  ChevronDown,
  ArrowRight,
  ChevronRight,
  Layers,
  Sliders,
  Tv,
  Users,
  ShieldCheck,
  Building2,
  Smartphone,
  Zap,
} from 'lucide-react';
import { LandingDemoModal } from '../landing/LandingDemoModal';

interface SeoLandingPageProps {
  pathname: string;
}

// Content enrichment data keyed by path
const SOLUTION_DETAILS: Record<
  string,
  {
    heroBadge: string;
    benefits: Array<{ title: string; desc: string; icon: React.ComponentType<{ className?: string }> }>;
    useCases: Array<{ title: string; audience: string; description: string }>;
    workflow: Array<{ step: string; title: string; desc: string }>;
    recommendedGames: Array<{ id: string; name: string; slug: string; desc: string; icon: string }>;
    relatedSolutions: Array<{ name: string; path: string; desc: string }>;
  }
> = {
  '/interactive-event-games': {
    heroBadge: 'Browser-Based Live Gameplay',
    benefits: [
      {
        title: 'Zero-Install Browser Play',
        desc: 'Attendees scan a QR code with any smartphone and instantly start playing inside their browser. No App Store downloads, account friction, or setup delays.',
        icon: QrCode,
      },
      {
        title: 'Stage & LED Leaderboards',
        desc: 'Broadcast real-time high scores across event venue displays, stage LED backdrops, and exhibition TV screens to fuel crowd cheering and friendly rivalry.',
        icon: Tv,
      },
      {
        title: 'Custom Brand Assets',
        desc: 'Upload your company logos, product cutouts, bespoke graphics, and themed audio to turn standard arcade mechanics into a branded marketing asset.',
        icon: Sliders,
      },
      {
        title: 'High Throughput Crowd Circulation',
        desc: 'Optimized 20-to-45 second game rounds keep queue lines moving smoothly, allowing hundreds of event attendees to participate within hours.',
        icon: Users,
      },
    ],
    useCases: [
      {
        title: 'Exhibition & Trade Booths',
        audience: 'Trade attendees & corporate delegates',
        description: 'Attract expo hall foot traffic, boost booth dwell times, and generate qualified leads through competitive gameplay.',
      },
      {
        title: 'Corporate Annual Summits',
        audience: 'Employees, executives & partners',
        description: 'Energize dinner tables and conference halls with inter-department competitions and live stage prize ceremonies.',
      },
      {
        title: 'Shopping Mall Roadshows',
        audience: 'General public & consumers',
        description: 'Draw active crowd attention, distribute instant gift vouchers, and convert shoppers into registered brand participants.',
      },
    ],
    workflow: [
      { step: '01', title: 'Choose Your Game Engine', desc: 'Select Catch the Brand, Brand Memory Match, or Formula Reaction Challenge.' },
      { step: '02', title: 'Brand With Visual Customizer', desc: 'Upload your logos, brand assets, custom audio, and set live gameplay round durations.' },
      { step: '03', title: 'Project Live QR & Leaderboard', desc: 'Display the event QR code on kiosks or stage screens for instant attendee participation.' },
      { step: '04', title: 'Celebrate Top Scorers', desc: 'Award prizes to top ranked leaderboard champions and export event participation records.' },
    ],
    recommendedGames: [
      { id: 'catch-brand', name: 'Catch the Brand', slug: '/games/catch-the-brand', desc: 'Fast arcade item-catching with high-score multiplier combos.', icon: 'ShoppingBasket' },
      { id: 'memory-match', name: 'Brand Memory Match', slug: '/games/memory-match', desc: 'Pair matching card puzzle showcasing product lines and sponsor logos.', icon: 'Grid3X3' },
      { id: 'reaction-tap', name: 'Formula Reaction Lights', slug: '/games/reaction-challenge', desc: 'Millisecond reflex test inspired by motorsport starting sequences.', icon: 'Zap' },
    ],
    relatedSolutions: [
      { name: 'Corporate Event Games', path: '/corporate-event-games', desc: 'Games for annual dinners and corporate conferences.' },
      { name: 'Brand Activation Games', path: '/brand-activation-games', desc: 'Experiential marketing and product launch games.' },
      { name: 'Roadshow Games', path: '/roadshow-games', desc: 'Mall kiosks and consumer promotional roadshows.' },
      { name: 'Exhibition Games', path: '/exhibition-games', desc: 'Trade show booth attraction and visitor engagement.' },
    ],
  },

  '/corporate-event-games': {
    heroBadge: 'Corporate Entertainment & Team Engagement',
    benefits: [
      {
        title: 'Dinner & Summit Icebreakers',
        desc: 'Break table ice effortlessly. Guests compete against peers across dinner tables and departments right from their smartphone screens.',
        icon: Users,
      },
      {
        title: 'Executive & Department Trophies',
        desc: 'Run inter-branch tournaments and division challenges. Live leaderboards highlight champion performers throughout the evening.',
        icon: Trophy,
      },
      {
        title: 'Corporate Identity Customization',
        desc: 'Feature company milestones, annual theme colors, CEO avatars, and department badges seamlessly inside the game environment.',
        icon: Building2,
      },
      {
        title: 'Painless Venue AV Integration',
        desc: 'Connect the live stage leaderboard via HDMI to any banquet projector, stage LED wall, or ballroom display without special hardware.',
        icon: Tv,
      },
    ],
    useCases: [
      {
        title: 'Annual Dinner & Dance (D&D)',
        audience: 'Company staff & executive management',
        description: 'Provide dinner-table entertainment while guests await stage performances, culminating in grand stage prize handouts.',
      },
      {
        title: 'Town Halls & Leadership Summits',
        audience: 'Regional teams & managers',
        description: 'Re-energize conference sessions after lunch breaks with high-energy 1-minute competitive reflex challenges.',
      },
      {
        title: 'Product Launch Galas',
        audience: 'Media, VIP clients & industry partners',
        description: 'Unveil newly launched products inside custom branded memory match puzzles and arcade challenges.',
      },
    ],
    workflow: [
      { step: '01', title: 'Schedule Your Corporate Event', desc: 'Set your event date and select from single-day dinner licenses to multi-day summits.' },
      { step: '02', title: 'Upload Company Brand Assets', desc: 'Incorporate corporate logos, mascot illustrations, and company sound cues in minutes.' },
      { step: '03', title: 'Share QR on Tables & Stage', desc: 'Print QR table stands or project on the ballroom LED wall for instant guest play.' },
      { step: '04', title: 'Present Grand Stage Awards', desc: 'Call top leaderboard finalists to the main stage for ceremonial trophy and prize presentations.' },
    ],
    recommendedGames: [
      { id: 'memory-match', name: 'Brand Memory Match', slug: '/games/memory-match', desc: 'Showcase corporate values, product icons, and leadership team faces.', icon: 'Grid3X3' },
      { id: 'catch-brand', name: 'Catch the Brand', slug: '/games/catch-the-brand', desc: 'Catch company achievements and dodge office hazard items.', icon: 'ShoppingBasket' },
      { id: 'reaction-tap', name: 'Formula Reaction Lights', slug: '/games/reaction-challenge', desc: 'Fierce millisecond reflex competition for executive bragging rights.', icon: 'Zap' },
    ],
    relatedSolutions: [
      { name: 'Interactive Event Games', path: '/interactive-event-games', desc: 'Live event participation and big-screen displays.' },
      { name: 'Branded Event Games', path: '/branded-event-games', desc: 'Complete custom branding for corporate marketing.' },
      { name: 'Digital Event Games', path: '/digital-event-games', desc: 'HTML5 browser deployment for enterprise stages.' },
    ],
  },

  '/brand-activation-games': {
    heroBadge: 'Experiential Marketing & Conversions',
    benefits: [
      {
        title: 'Unrivaled Attention Capture',
        desc: 'Draw attendees away from neighboring displays with vibrant audiovisual gaming action that naturally gathers curious crowds.',
        icon: Sparkles,
      },
      {
        title: 'Direct Product Placement',
        desc: 'Put your actual retail SKUs into gameplay as collectable items, card pairs, and bonus multipliers to engrain product visual recall.',
        icon: Sliders,
      },
      {
        title: 'Leaderboard Score Recognition',
        desc: 'Players enter their nickname when submitting scores, enabling booth staff to easily verify winners on the live leaderboard and award prizes.',
        icon: Smartphone,
      },
      {
        title: 'Live Leaderboard Contests',
        desc: 'Run engaging high-score challenges that encourage visitors to return to your booth and see if their ranking holds.',
        icon: Trophy,
      },
    ],
    useCases: [
      {
        title: 'Retail & FMCG Pop-Up Stores',
        audience: 'Shoppers & consumer trialists',
        description: 'Incentivize on-the-spot product purchases by offering store discounts for achieving top game scores.',
      },
      {
        title: 'Automotive & Tech Activations',
        audience: 'Enthusiasts & prospective buyers',
        description: 'Harness high-speed reflex lights and modern design to emphasize vehicle speed and technological precision.',
      },
      {
        title: 'Festival & Music Event Sponsorships',
        audience: 'Gen-Z & lifestyle event attendees',
        description: 'Create memorable branded photo moments with custom result podium screens ready for social sharing.',
      },
    ],
    workflow: [
      { step: '01', title: 'Define Campaign Objectives', desc: 'Set reward benchmarks, giveaway mechanics, and gameplay duration.' },
      { step: '02', title: 'Apply Campaign Visual Identity', desc: 'Embed marketing slogans, packaging art, and promotional graphic overlays.' },
      { step: '03', title: 'Deploy on Booth Tablets & QR', desc: 'Run on dedicated promoter iPads, touch stands, or player personal smartphones.' },
      { step: '04', title: 'Analyze Engagement & Hand Out Swag', desc: 'Track real-time player counts and hand out promotional samples to high scorers.' },
    ],
    recommendedGames: [
      { id: 'catch-brand', name: 'Catch the Brand', slug: '/games/catch-the-brand', desc: 'Feature product bottles, cans, and packaged goods as falling targets.', icon: 'ShoppingBasket' },
      { id: 'memory-match', name: 'Brand Memory Match', slug: '/games/memory-match', desc: 'Spotlight product features and lifestyle campaign imagery.', icon: 'Grid3X3' },
      { id: 'reaction-tap', name: 'Formula Reaction Lights', slug: '/games/reaction-challenge', desc: 'High-adrenaline contest suited for energy drink and automotive campaigns.', icon: 'Zap' },
    ],
    relatedSolutions: [
      { name: 'Roadshow Games', path: '/roadshow-games', desc: 'Mall activations and consumer tours.' },
      { name: 'Exhibition Games', path: '/exhibition-games', desc: 'Trade show booth engagement.' },
      { name: 'Branded Event Games', path: '/branded-event-games', desc: 'Custom logos, assets, and themes.' },
    ],
  },

  '/event-mini-games': {
    heroBadge: 'Rapid-Fire Arcade Gameplay',
    benefits: [
      {
        title: 'Bite-Sized 20s Rounds',
        desc: 'Engineered for instant pickup-and-play without lengthy tutorials or steep learning curves. Anyone can understand and play within 5 seconds.',
        icon: Zap,
      },
      {
        title: 'High Participant Throughput',
        desc: 'Short 15-to-45 second game rounds keep lines moving and maximize the number of players who can participate during event hours.',
        icon: Users,
      },
      {
        title: 'Addictive Replay Incentive',
        desc: 'Tight scoring margins and visible live ranks inspire players to try multiple times, dramatically expanding brand contact time.',
        icon: Trophy,
      },
      {
        title: 'Cross-Device Responsiveness',
        desc: 'Optimized touch controls, responsive aspect ratios (portrait 9:16 and landscape 16:9), and full keyboard/mouse compatibility.',
        icon: Smartphone,
      },
    ],
    useCases: [
      {
        title: 'Concourse & Hallway Activations',
        audience: 'Walking commuters & venue attendees',
        description: 'Provide high-speed micro-interactions in high-traffic transition corridors between conference breakout rooms.',
      },
      {
        title: 'Sponsor Hospitality Suites',
        audience: 'VIP guests & partners',
        description: 'Offer lighthearted leisure gaming on tablets alongside cocktail lounges and corporate suites.',
      },
      {
        title: 'University & Campus Career Fairs',
        audience: 'Students & fresh graduates',
        description: 'Attract tech-savvy students to your employer recruitment booth with fast arcade challenges.',
      },
    ],
    workflow: [
      { step: '01', title: 'Pick A Casual Engine', desc: 'Select from arcade catching, memory matching, or reaction reflex.' },
      { step: '02', title: 'Calibrate Difficulty', desc: 'Adjust falling speeds, game duration, and point values for your specific audience.' },
      { step: '03', title: 'Activate Instant Play', desc: 'Distribute via QR stickers, tabletop stands, or digital signage displays.' },
      { step: '04', title: 'Track Live Scoreboards', desc: 'Watch leaderboard rankings shift in real-time as competitive spirit builds.' },
    ],
    recommendedGames: [
      { id: 'catch-brand', name: 'Catch the Brand', slug: '/games/catch-the-brand', desc: 'The quintessential casual arcade catch experience.', icon: 'ShoppingBasket' },
      { id: 'reaction-tap', name: 'Formula Reaction Lights', slug: '/games/reaction-challenge', desc: 'Lightning-fast 15-second reaction duel.', icon: 'Zap' },
      { id: 'memory-match', name: 'Brand Memory Match', slug: '/games/memory-match', desc: 'Accessible memory puzzle suitable for all age brackets.', icon: 'Grid3X3' },
    ],
    relatedSolutions: [
      { name: 'Interactive Event Games', path: '/interactive-event-games', desc: 'Live event experiences and stage leaderboards.' },
      { name: 'Roadshow Games', path: '/roadshow-games', desc: 'High-foot-traffic mall roadshow setups.' },
      { name: 'Digital Event Games', path: '/digital-event-games', desc: 'Scalable browser gaming technology.' },
    ],
  },

  '/roadshow-games': {
    heroBadge: 'Mall & Retail Roadshows',
    benefits: [
      {
        title: 'Mall Concourse Foot Traffic Magnet',
        desc: 'Draw curious families, teenagers, and professionals to your roadshow booth with vibrant arcade graphics and cheerful audio cues.',
        icon: Users,
      },
      {
        title: 'Multi-Day License Options',
        desc: 'Flexible pricing models supporting 3-day weekend concourse blitzes to 14-day multi-state shopping mall marketing tours.',
        icon: Building2,
      },
      {
        title: 'Works on Touch Kiosks & iPads',
        desc: 'Seamlessly runs on floor-standing touchscreen kiosks, promoter iPads, Android tablets, or attendee personal smartphones.',
        icon: Smartphone,
      },
      {
        title: 'Daily High Score Resets',
        desc: 'Configure daily leaderboard rotations so roadshow visitors have fresh opportunities to win top prizes every single day.',
        icon: Trophy,
      },
    ],
    useCases: [
      {
        title: 'Telco & Smartphone Roadshows',
        audience: 'Mall shoppers & tech enthusiasts',
        description: 'Demonstrate device responsiveness by hosting live touch-based reaction and catch challenges directly on display phones.',
      },
      {
        title: 'Banking & Financial Roadshows',
        audience: 'Credit card applicants & shoppers',
        description: 'Break conservative barriers and offer fun interactive gameplay as a reward for opening a new account.',
      },
      {
        title: 'FMCG & Beverage Sampling Tours',
        audience: 'General public & family shoppers',
        description: 'Pair free drink sampling with high-speed brand catching games for instant branded merchandise giveaways.',
      },
    ],
    workflow: [
      { step: '01', title: 'Book Roadshow Duration', desc: 'Select multi-day event licensing matching your mall concourse schedule.' },
      { step: '02', title: 'Skin With Campaign Art', desc: 'Incorporate promotional graphics, mascot illustrations, and retail offer banners.' },
      { step: '03', title: 'Mount on Kiosks & Tablets', desc: 'Lock browser to fullscreen arcade mode on your booth hardware.' },
      { step: '04', title: 'Reward Daily High Scorers', desc: 'Hand out product gift hampers or shopping vouchers to top leaderboard leaders.' },
    ],
    recommendedGames: [
      { id: 'catch-brand', name: 'Catch the Brand', slug: '/games/catch-the-brand', desc: 'Great for family-friendly mall foot traffic.', icon: 'ShoppingBasket' },
      { id: 'memory-match', name: 'Brand Memory Match', slug: '/games/memory-match', desc: 'Engaging puzzle that keeps shoppers at your booth longer.', icon: 'Grid3X3' },
      { id: 'reaction-tap', name: 'Formula Reaction Lights', slug: '/games/reaction-challenge', desc: 'Exciting reflex challenge that sparks friendly crowd rivalry.', icon: 'Zap' },
    ],
    relatedSolutions: [
      { name: 'Brand Activation Games', path: '/brand-activation-games', desc: 'Consumer activations and marketing campaigns.' },
      { name: 'Exhibition Games', path: '/exhibition-games', desc: 'Trade show booths and industry expos.' },
      { name: 'Event Mini-Games', path: '/event-mini-games', desc: 'High-throughput casual gaming.' },
    ],
  },

  '/exhibition-games': {
    heroBadge: 'Trade Show & Booth Attraction',
    benefits: [
      {
        title: 'Cut Through Expo Hall Noise',
        desc: 'In a sea of identical roller banners and brochures, interactive digital gaming makes your booth stand out from 30 meters away.',
        icon: Sparkles,
      },
      {
        title: 'Authentic Icebreaker For Sales Reps',
        desc: 'Trade delegates love a light challenge. Sales engineers can strike up organic conversations while prospects take a turn at the game.',
        icon: Users,
      },
      {
        title: 'Real-Time Booth Leaderboard',
        desc: 'Mount a TV screen displaying the top trade delegates of the day, turning passive passers-by into competitive contenders.',
        icon: Tv,
      },
      {
        title: 'Zero Booth Clutter',
        desc: 'Replaces bulky mechanical prize wheels or bulky carnival equipment with an elegant touchscreen or QR-driven digital station.',
        icon: Smartphone,
      },
    ],
    useCases: [
      {
        title: 'B2B Tech Conferences',
        audience: 'Software buyers, CTOs & developers',
        description: 'Provide an engaging break from keynote slides with a branded millisecond reaction reflex test.',
      },
      {
        title: 'Healthcare & Pharma Expos',
        audience: 'Medical practitioners & clinic owners',
        description: 'Showcase medical product lines and diagnostic equipment via interactive memory match cards.',
      },
      {
        title: 'Property & Real Estate Expos',
        audience: 'Homebuyers & real estate investors',
        description: 'Engage visitors with games while property consultants prepare personalized investment brochures.',
      },
    ],
    workflow: [
      { step: '01', title: 'Register Exhibition Event', desc: 'Configure multi-day trade show schedule and lock in your custom theme.' },
      { step: '02', title: 'Mount Booth TV & Tablets', desc: 'Connect stage leaderboard to booth TV and place QR codes at reception counters.' },
      { step: '03', title: 'Invite Delegates To Play', desc: 'Sales reps invite visitors to beat the reigning booth high score.' },
      { step: '04', title: 'Announce 5 PM Prize Winners', desc: 'Gather crowds at your booth before expo closing for daily prize awards.' },
    ],
    recommendedGames: [
      { id: 'reaction-tap', name: 'Formula Reaction Lights', slug: '/games/reaction-challenge', desc: 'High-prestige reflex test favored by engineering & corporate delegates.', icon: 'Zap' },
      { id: 'catch-brand', name: 'Catch the Brand', slug: '/games/catch-the-brand', desc: 'High-energy item catcher featuring brand assets and sponsor tokens.', icon: 'ShoppingBasket' },
      { id: 'memory-match', name: 'Brand Memory Match', slug: '/games/memory-match', desc: 'Highlights complex product matrices through visual pair discovery.', icon: 'Grid3X3' },
    ],
    relatedSolutions: [
      { name: 'Corporate Event Games', path: '/corporate-event-games', desc: 'Engagement for conferences and annual summits.' },
      { name: 'Brand Activation Games', path: '/brand-activation-games', desc: 'Experiential marketing and consumer engagement.' },
      { name: 'Branded Event Games', path: '/branded-event-games', desc: 'Custom themes, logos, and event assets.' },
    ],
  },

  '/branded-event-games': {
    heroBadge: 'Full Visual Customization',
    benefits: [
      {
        title: 'Complete Visual Alignment',
        desc: 'Customize background illustrations, player avatars, collectible icons, hazard obstacles, and bonus badges to match brand guidelines.',
        icon: Sliders,
      },
      {
        title: 'Custom Audio & Sound Design',
        desc: 'Upload branded sound effects, catchy jingles, success chimes, and background audio to reinforce your acoustic brand identity.',
        icon: Sparkles,
      },
      {
        title: 'Branded Start & Result Screens',
        desc: 'Visual editor for start dialogs, gameplay instructions, and final score podiums featuring your sponsor banners and logos.',
        icon: Layers,
      },
      {
        title: 'No Third-Party Watermarks',
        desc: 'Clean, professional presentation dedicated 100% to your organization and event sponsors—no unwanted advertising or clutter.',
        icon: ShieldCheck,
      },
    ],
    useCases: [
      {
        title: 'Luxury & Lifestyle Brands',
        audience: 'VIP clientele & fashion buyers',
        description: 'Maintain strict typographic and visual luxury standards with bespoke minimalist backgrounds and gold foil motifs.',
      },
      {
        title: 'Entertainment & Gaming Launches',
        audience: 'Gamers, creators & pop-culture fans',
        description: 'Incorporate vibrant characters and energetic soundscapes for movie premieres and game releases.',
      },
      {
        title: 'Financial Services & Fintech',
        audience: 'High-net-worth clients & investors',
        description: 'Sleek dark mode palettes with corporate trust colors, ensuring serious brand prestige throughout.',
      },
    ],
    workflow: [
      { step: '01', title: 'Open Theme Customizer', desc: 'Start with a curated system theme or build from scratch in the visual studio.' },
      { step: '02', title: 'Drag & Drop Brand Graphics', desc: 'Upload PNGs with alpha transparency for smooth, professional rendering.' },
      { step: '03', title: 'Live Playtest Preview', desc: 'Inspect how custom assets appear in real-time before publishing live.' },
      { step: '04', title: 'Lock To Your Live Event', desc: 'Assign your finalized custom theme to your event license with one click.' },
    ],
    recommendedGames: [
      { id: 'catch-brand', name: 'Catch the Brand', slug: '/games/catch-the-brand', desc: 'Customize catcher basket, positive targets, hazards, and bonus items.', icon: 'ShoppingBasket' },
      { id: 'memory-match', name: 'Brand Memory Match', slug: '/games/memory-match', desc: 'Customize 8 distinct card faces plus branded card back cover.', icon: 'Grid3X3' },
      { id: 'reaction-tap', name: 'Formula Reaction Lights', slug: '/games/reaction-challenge', desc: 'Customize starting light graphics, backgrounds, and reflex audio cues.', icon: 'Zap' },
    ],
    relatedSolutions: [
      { name: 'Interactive Event Games', path: '/interactive-event-games', desc: 'Browser-based gameplay and live leaderboards.' },
      { name: 'Corporate Event Games', path: '/corporate-event-games', desc: 'Annual dinners and team summit competitions.' },
      { name: 'Digital Event Games', path: '/digital-event-games', desc: 'High-performance HTML5 browser engines.' },
    ],
  },

  '/digital-event-games': {
    heroBadge: 'HTML5 Cloud Browser Architecture',
    benefits: [
      {
        title: 'Global Low-Latency Edge Delivery',
        desc: 'Assets and game states deployed globally via distributed cloud infrastructure for lightning-fast loads across 4G, 5G, and venue Wi-Fi.',
        icon: Zap,
      },
      {
        title: 'Offline Resilient Gameplay',
        desc: 'Game code and visual assets load directly in the participant browser, delivering smooth gameplay even if crowded venue Wi-Fi experiences latency.',
        icon: ShieldCheck,
      },
      {
        title: 'Scalable Event Architecture',
        desc: 'Designed to handle event crowd rushes with rapid score submissions and live leaderboard updates without bottlenecks.',
        icon: Users,
      },
      {
        title: 'Responsive Cross-Screen Engine',
        desc: 'Intelligent viewport scaling supports portrait phones, horizontal tablets, laptop screens, and giant stage LED walls with pixel perfection.',
        icon: Smartphone,
      },
    ],
    useCases: [
      {
        title: 'Hybrid & Virtual Conferences',
        audience: 'Remote & in-person attendees',
        description: 'Unify remote web stream viewers and in-venue delegates on one synchronized global leaderboard.',
      },
      {
        title: 'Multi-City Simultaneous Summits',
        audience: 'Offices in KL, Singapore, Jakarta, Tokyo',
        description: 'Host synchronized cross-border challenges where regional offices battle for inter-city supremacy in real-time.',
      },
      {
        title: 'Stadium & Arena Experiences',
        audience: 'Thousands of live arena spectators',
        description: 'Flash QR codes across stadium jumbotrons during halftimes for instant mass stadium participation.',
      },
    ],
    workflow: [
      { step: '01', title: 'Provision Cloud Event', desc: 'Instant event licensing with zero server provisioning or manual hosting required.' },
      { step: '02', title: 'Distribute Digital Token', desc: 'Share secure public play links, embed in event apps, or display on stage screens.' },
      { step: '03', title: 'Real-Time Edge Score Sync', desc: 'Player scores submit securely to ACID-compliant leaderboard ledgers.' },
      { step: '04', title: 'Export Live Event Analytics', desc: 'Review comprehensive participation volume, score distributions, and player rosters.' },
    ],
    recommendedGames: [
      { id: 'catch-brand', name: 'Catch the Brand', slug: '/games/catch-the-brand', desc: 'Fast-paced arcade item catching optimized for mobile and desktop browsers.', icon: 'ShoppingBasket' },
      { id: 'reaction-tap', name: 'Formula Reaction Lights', slug: '/games/reaction-challenge', desc: 'Precision millisecond timestamping for uncompromised fair play.', icon: 'Zap' },
      { id: 'memory-match', name: 'Brand Memory Match', slug: '/games/memory-match', desc: 'Card flip animations powered by responsive GPU canvas rendering.', icon: 'Grid3X3' },
    ],
    relatedSolutions: [
      { name: 'Interactive Event Games', path: '/interactive-event-games', desc: 'QR gameplay and live venue displays.' },
      { name: 'Brand Activation Games', path: '/brand-activation-games', desc: 'Experiential marketing activations.' },
      { name: 'Corporate Event Games', path: '/corporate-event-games', desc: 'Conferences and gala entertainment.' },
    ],
  },
};

export const SeoLandingPage: React.FC<SeoLandingPageProps> = ({ pathname }) => {
  const { isAuthenticated } = useAuth();
  const pageSeo = getPageSeo(pathname);
  const details = SOLUTION_DETAILS[pathname] || SOLUTION_DETAILS['/interactive-event-games'];

  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(null);
  const [demoModalOpen, setDemoModalOpen] = useState(false);
  const [demoGameId, setDemoGameId] = useState<string>('catch-brand');

  const handleLaunchDemo = (gameId: string) => {
    setDemoGameId(gameId);
    setDemoModalOpen(true);
  };

  const handleGetStarted = () => {
    if (isAuthenticated) {
      navigateTo('/events');
    } else {
      navigateTo('/login');
    }
  };

  return (
    <div className="min-h-screen bg-white text-slate-900 flex flex-col font-sans selection:bg-amber-100 selection:text-amber-900">
      {/* Central Reusable SEO Head Updater */}
      <SEO config={pageSeo} />

      {/* Global Header */}
      <LandingHeader onExploreGames={() => navigateTo('/games')} />

      <main className="flex-1">
        {/* Breadcrumb Navigation Bar */}
        <div className="w-full bg-slate-50 border-b border-slate-200/80 py-2.5">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <nav className="flex items-center gap-2 text-xs text-slate-500 font-medium">
              <InternalLink
                href="/"
                className="hover:text-amber-600 transition-colors"
              >
                Home
              </InternalLink>
              <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-slate-900 font-semibold">{pageSeo.h1}</span>
            </nav>
          </div>
        </div>

        {/* 1. HERO SECTION */}
        <section className="relative pt-12 pb-16 md:pt-16 md:pb-24 bg-gradient-to-b from-amber-500/5 via-slate-50/50 to-white border-b border-slate-100 overflow-hidden">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="max-w-4xl mx-auto text-center space-y-6">
              {/* Badge */}
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-800 text-xs font-bold uppercase tracking-wider shadow-xs">
                <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                <span>{details.heroBadge}</span>
              </div>

              {/* Primary H1 */}
              <h1 className="text-3xl sm:text-5xl md:text-6xl font-black text-slate-900 tracking-tight leading-[1.1]">
                {pageSeo.h1}
              </h1>

              {/* Subheading */}
              <p className="text-base sm:text-lg md:text-xl text-slate-600 leading-relaxed max-w-3xl mx-auto">
                {pageSeo.subheading || pageSeo.description}
              </p>

              {/* Primary Action Buttons */}
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3.5 pt-2">
                <button
                  onClick={handleGetStarted}
                  className="w-full sm:w-auto px-7 py-3.5 rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-sm transition-all shadow-lg shadow-amber-500/25 hover:shadow-amber-500/35 active:scale-95 cursor-pointer flex items-center justify-center gap-2"
                >
                  <span>Create Your Event</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleLaunchDemo('catch-brand')}
                  className="w-full sm:w-auto px-6 py-3.5 rounded-2xl bg-white hover:bg-slate-50 text-slate-800 font-bold text-sm border border-slate-300 transition-all hover:border-slate-400 active:scale-95 cursor-pointer flex items-center justify-center gap-2 shadow-xs"
                >
                  <Gamepad2 className="w-4 h-4 text-amber-600" />
                  <span>Try Interactive Demo</span>
                </button>
              </div>

              {/* Trust signals */}
              <div className="pt-6 flex flex-wrap items-center justify-center gap-6 text-xs text-slate-500 font-medium">
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>No App Install Required</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>Live Stage Leaderboards</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>Full Brand Customization</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 2. CORE BENEFITS & CAPABILITIES */}
        <section className="py-16 md:py-24 bg-white border-b border-slate-100">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-3xl mx-auto mb-12 md:mb-16 space-y-3">
              <span className="text-xs font-bold uppercase tracking-wider text-amber-600">Why Event Game Studio</span>
              <h2 className="text-2xl sm:text-4xl font-black text-slate-900 tracking-tight">
                Engineered for Live Crowd Engagement
              </h2>
              <p className="text-sm sm:text-base text-slate-600">
                Traditional event marketing creates passive spectators. Interactive event games create active brand advocates.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {details.benefits.map((b, idx) => {
                const IconComponent = b.icon;
                return (
                  <div
                    key={idx}
                    className="p-6 rounded-2xl bg-slate-50 hover:bg-white border border-slate-200/80 hover:border-amber-400 hover:shadow-xl hover:shadow-amber-500/5 transition-all space-y-4 group"
                  >
                    <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-700 flex items-center justify-center group-hover:scale-105 group-hover:bg-amber-500 group-hover:text-slate-950 transition-all">
                      <IconComponent className="w-6 h-6" />
                    </div>
                    <h3 className="text-lg font-bold text-slate-900 group-hover:text-amber-800 transition-colors">
                      {b.title}
                    </h3>
                    <p className="text-xs text-slate-600 leading-relaxed">{b.desc}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* 3. STEP-BY-STEP WORKFLOW */}
        <section className="py-16 md:py-24 bg-slate-50/70 border-b border-slate-100">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-3xl mx-auto mb-12 md:mb-16 space-y-3">
              <span className="text-xs font-bold uppercase tracking-wider text-amber-600">Seamless Execution</span>
              <h2 className="text-2xl sm:text-4xl font-black text-slate-900 tracking-tight">
                How It Works on Event Day
              </h2>
              <p className="text-sm sm:text-base text-slate-600">
                From initial brand setup to live stage prize presentations in four simple steps.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {details.workflow.map((item, idx) => (
                <div
                  key={idx}
                  className="relative p-6 rounded-2xl bg-white border border-slate-200/80 shadow-xs space-y-3"
                >
                  <div className="text-2xl font-black text-amber-500/50">{item.step}</div>
                  <h3 className="text-base font-bold text-slate-900">{item.title}</h3>
                  <p className="text-xs text-slate-600 leading-relaxed">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* 4. REAL-WORLD EVENT APPLICATIONS */}
        <section className="py-16 md:py-24 bg-white border-b border-slate-100">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-3xl mx-auto mb-12 md:mb-16 space-y-3">
              <span className="text-xs font-bold uppercase tracking-wider text-amber-600">Proven Formats</span>
              <h2 className="text-2xl sm:text-4xl font-black text-slate-900 tracking-tight">
                Where These Games Excel
              </h2>
              <p className="text-sm sm:text-base text-slate-600">
                Tailored for event organizers, experiential marketing agencies, and corporate brand teams.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {details.useCases.map((uc, idx) => (
                <div
                  key={idx}
                  className="p-6 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-4 hover:border-slate-300 transition-all"
                >
                  <div className="inline-block px-3 py-1 rounded-full bg-white border border-slate-200 text-[11px] font-bold text-slate-700">
                    {uc.audience}
                  </div>
                  <h3 className="text-xl font-black text-slate-900">{uc.title}</h3>
                  <p className="text-xs text-slate-600 leading-relaxed">{uc.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* 5. RECOMMENDED GAME ENGINES */}
        <section className="py-16 md:py-24 bg-slate-900 text-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-3xl mx-auto mb-12 md:mb-16 space-y-3">
              <span className="text-xs font-bold uppercase tracking-wider text-amber-400">Playable Engines</span>
              <h2 className="text-2xl sm:text-4xl font-black text-white tracking-tight">
                Available Event Game Engines
              </h2>
              <p className="text-sm sm:text-base text-slate-300">
                Ready-to-deploy, fully brandable interactive mini-games available in our studio.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {details.recommendedGames.map((game, idx) => (
                <div
                  key={idx}
                  className="p-6 rounded-2xl bg-slate-800/80 border border-slate-700/80 hover:border-amber-400/80 transition-all space-y-4 flex flex-col justify-between"
                >
                  <div className="space-y-3">
                    <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center">
                      <Gamepad2 className="w-6 h-6" />
                    </div>
                    <h3 className="text-xl font-bold text-white">{game.name}</h3>
                    <p className="text-xs text-slate-300 leading-relaxed">{game.desc}</p>
                  </div>

                  <div className="pt-4 flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => handleLaunchDemo(game.id)}
                      className="flex-1 py-2.5 px-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition-colors cursor-pointer text-center"
                    >
                      Play Demo
                    </button>
                    <InternalLink
                      href={game.slug}
                      className="py-2.5 px-3 rounded-xl bg-slate-700 hover:bg-slate-600 text-white font-bold text-xs transition-colors text-center flex items-center gap-1"
                    >
                      <span>Details</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </InternalLink>
                  </div>
                </div>
              ))}
            </div>

            <div className="text-center pt-10">
              <InternalLink
                href="/games"
                className="inline-flex items-center gap-2 text-xs font-bold text-amber-400 hover:text-amber-300 underline underline-offset-4"
              >
                <span>View Full Event Games Catalog</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </InternalLink>
            </div>
          </div>
        </section>

        {/* 6. FAQ ACCORDION */}
        {pageSeo.faqs && pageSeo.faqs.length > 0 && (
          <section className="py-16 md:py-24 bg-white border-b border-slate-100">
            <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="text-center max-w-2xl mx-auto mb-10 space-y-2">
                <span className="text-xs font-bold uppercase tracking-wider text-amber-600">Frequently Asked</span>
                <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
                  Common Questions
                </h2>
              </div>

              <div className="space-y-3">
                {pageSeo.faqs.map((faq, idx) => {
                  const isOpen = openFaqIndex === idx;
                  return (
                    <div
                      key={idx}
                      className="rounded-2xl border border-slate-200 overflow-hidden transition-colors"
                    >
                      <button
                        onClick={() => setOpenFaqIndex(isOpen ? null : idx)}
                        className="w-full p-4 sm:p-5 text-left flex items-center justify-between gap-4 bg-slate-50 hover:bg-slate-100/70 transition-colors cursor-pointer"
                        aria-expanded={isOpen}
                      >
                        <span className="text-sm font-bold text-slate-900">{faq.question}</span>
                        <ChevronDown
                          className={`w-4 h-4 text-slate-500 shrink-0 transition-transform duration-200 ${
                            isOpen ? 'rotate-180 text-amber-600' : ''
                          }`}
                        />
                      </button>
                      {isOpen && (
                        <div className="p-4 sm:p-5 bg-white border-t border-slate-200 text-xs sm:text-sm text-slate-600 leading-relaxed">
                          {faq.answer}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        )}

        {/* 7. RELATED SOLUTIONS & INTERNAL LINKING */}
        <section className="py-12 bg-slate-50 border-b border-slate-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="space-y-4">
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500">
                Explore Related Event Solutions
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {details.relatedSolutions.map((sol, idx) => (
                  <InternalLink
                    key={idx}
                    href={sol.path}
                    className="p-4 rounded-xl bg-white border border-slate-200 hover:border-amber-400 hover:shadow-sm text-left transition-all group block"
                  >
                    <div className="text-sm font-bold text-slate-900 group-hover:text-amber-800 flex items-center justify-between">
                      <span>{sol.name}</span>
                      <ArrowRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-amber-600 group-hover:translate-x-0.5 transition-all" />
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1">{sol.desc}</p>
                  </InternalLink>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* 8. FINAL CTA BANNER */}
        <section className="py-16 md:py-20 bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-6">
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-black tracking-tight text-slate-950">
              Ready to Make Your Event Playable?
            </h2>
            <p className="text-base sm:text-lg text-slate-900/80 max-w-2xl mx-auto font-medium">
              Join leading corporate event agencies, brand managers, and exhibition organizers creating unforgettable interactive activations.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={handleGetStarted}
                className="w-full sm:w-auto px-8 py-4 rounded-2xl bg-slate-950 hover:bg-slate-900 text-white font-black text-sm transition-all shadow-xl shadow-slate-950/20 active:scale-95 cursor-pointer"
              >
                Create Event Now
              </button>
              <InternalLink
                href="/contact"
                className="w-full sm:w-auto px-7 py-4 rounded-2xl bg-white/90 hover:bg-white text-slate-950 font-bold text-sm transition-all active:scale-95 text-center inline-block"
              >
                Speak to Event Specialist
              </InternalLink>
            </div>
          </div>
        </section>
      </main>

      {/* Global Footer */}
      <LandingFooter />

      {/* Interactive Demo Modal */}
      {demoModalOpen && (
        <LandingDemoModal
          isOpen={demoModalOpen}
          onClose={() => setDemoModalOpen(false)}
          initialGameId={demoGameId}
        />
      )}
    </div>
  );
};
