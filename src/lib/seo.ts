export interface SeoBreadcrumb {
  name: string;
  item: string;
}

export interface SeoFaqItem {
  question: string;
  answer: string;
}

export interface PageSeoConfig {
  title: string;
  description: string;
  canonical: string;
  robots?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogUrl?: string;
  ogImage?: string;
  ogType?: 'website' | 'article' | 'product';
  twitterCard?: 'summary_large_image' | 'summary';
  twitterTitle?: string;
  twitterDescription?: string;
  twitterImage?: string;
  h1: string;
  subheading?: string;
  breadcrumbs?: SeoBreadcrumb[];
  faqs?: SeoFaqItem[];
  jsonLd?: Record<string, any> | Record<string, any>[];
  keywords?: string[];
}

export const SITE_DOMAIN = 'https://eventgamestudio.com';
export const DEFAULT_OG_IMAGE = `${SITE_DOMAIN}/og-image.jpg`;
export const SITE_NAME = 'Event Game Studio';

/**
 * Base Organization Schema.org
 */
export function getOrganizationSchema(): Record<string, any> {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: SITE_NAME,
    url: SITE_DOMAIN,
    logo: `${SITE_DOMAIN}/logo.png`,
    description:
      'Multi-tenant SaaS platform for interactive event mini-games, custom branded activations, live leaderboard management, and duration-based event licensing.',
    sameAs: [],
  };
}

/**
 * Base WebSite Schema.org
 */
export function getWebSiteSchema(): Record<string, any> {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE_NAME,
    url: SITE_DOMAIN,
    potentialAction: {
      '@type': 'SearchAction',
      target: `${SITE_DOMAIN}/games?q={search_term_string}`,
      'query-input': 'required name=search_term_string',
    },
  };
}

/**
 * BreadcrumbList Schema Generator
 */
export function getBreadcrumbSchema(breadcrumbs: SeoBreadcrumb[]): Record<string, any> {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: breadcrumbs.map((crumb, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: crumb.name,
      item: crumb.item.startsWith('http') ? crumb.item : `${SITE_DOMAIN}${crumb.item}`,
    })),
  };
}

/**
 * FAQPage Schema Generator
 */
export function getFaqPageSchema(faqs: SeoFaqItem[]): Record<string, any> {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((faq) => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: faq.answer,
      },
    })),
  };
}

/**
 * Central Public SEO Configuration Registry
 */
export const SEO_PAGE_CONFIGS: Record<string, PageSeoConfig> = {
  // 1. Homepage
  '/': {
    title: 'Interactive Event Games & Branded Mini-Games | Event Game Studio',
    description:
      'Create branded interactive games for corporate events, exhibitions, roadshows, product launches and brand activations. Customize games, themes and event branding with Event Game Studio.',
    canonical: `${SITE_DOMAIN}/`,
    h1: 'Interactive Event Games & Branded Mini-Games',
    subheading: 'Make Your Events Playable.',
    ogType: 'website',
    ogImage: DEFAULT_OG_IMAGE,
    jsonLd: [getOrganizationSchema(), getWebSiteSchema()],
  },

  // 2. Interactive Event Games
  '/interactive-event-games': {
    title: 'Interactive Event Games for Live Experiences | Event Game Studio',
    description:
      'Drive massive crowd engagement with browser-based interactive event games, QR participation, and live big-screen leaderboards for exhibitions and corporate summits.',
    canonical: `${SITE_DOMAIN}/interactive-event-games`,
    h1: 'Interactive Event Games for Live Experiences',
    subheading:
      'Transform passive attendees into active participants with zero-friction browser arcade games and competitive live leaderboards.',
    breadcrumbs: [
      { name: 'Home', item: '/' },
      { name: 'Interactive Event Games', item: '/interactive-event-games' },
    ],
    faqs: [
      {
        question: 'Do attendees need to download or install an app to play?',
        answer:
          'No app download or app store visit is required. All Event Game Studio games run instantly inside standard mobile and desktop web browsers via QR code scan or custom event URL.',
      },
      {
        question: 'Can we display a live leaderboard on stage screens or projector displays?',
        answer:
          'Yes. Every event includes real-time live leaderboard displays designed specifically for stage LED backdrops, projector screens, and kiosk monitors with automatic score updates.',
      },
      {
        question: 'How fast can an attendee start playing at a crowded event?',
        answer:
          'Attendees scan a QR code with their phone camera and can start playing in under 3 seconds. There are no lengthy registration forms or app installs to slow down event flow.',
      },
    ],
  },

  // 3. Corporate Event Games
  '/corporate-event-games': {
    title: 'Corporate Event Games & Interactive Activities | Event Game Studio',
    description:
      'Engage employees and guests at annual dinners, corporate conferences, town halls, and team building summits with custom branded corporate event games.',
    canonical: `${SITE_DOMAIN}/corporate-event-games`,
    h1: 'Corporate Event Games & Interactive Activities',
    subheading:
      'Energize company dinners, annual summits, and corporate milestone celebrations with friendly competition and branded company leaderboards.',
    breadcrumbs: [
      { name: 'Home', item: '/' },
      { name: 'Corporate Event Games', item: '/corporate-event-games' },
    ],
    faqs: [
      {
        question: 'Can Event Game Studio be used for annual corporate dinners and gala events?',
        answer:
          'Absolutely. Event Game Studio is built specifically for corporate galas, annual dinners, and awards nights to provide dinner table entertainment, inter-department challenges, and stage prize giveaways.',
      },
      {
        question: 'Can we customize the games with company colors, logos, and executive photos?',
        answer:
          'Yes. You can customize the catcher avatars, falling brand icons, background scenery, card pairs, and starting screens with your company branding, logos, and event graphics.',
      },
      {
        question: 'Can multiple departments or branches compete against each other?',
        answer:
          'Yes. Participants enter their name or table number, and the live leaderboard tracks top scorers in real-time, allowing table-by-table or department-wide competitions.',
      },
    ],
  },

  // 4. Brand Activation Games
  '/brand-activation-games': {
    title: 'Branded Games for Brand Activations | Event Game Studio',
    description:
      'Elevate marketing activations, experiential pop-ups, and product campaigns with customized branded mini-games that capture attention and drive leads.',
    canonical: `${SITE_DOMAIN}/brand-activation-games`,
    h1: 'Branded Games for Brand Activations',
    subheading:
      'Turn experiential marketing campaigns into immersive brand experiences with custom game assets, product placements, and social share moments.',
    breadcrumbs: [
      { name: 'Home', item: '/' },
      { name: 'Brand Activation Games', item: '/brand-activation-games' },
    ],
    faqs: [
      {
        question: 'How do brand activation games improve visitor dwell time?',
        answer:
          'Gamified activations increase booth dwell time by over 300% compared to static marketing collaterals, keeping prospects engaged while brand ambassadors interact with waiting players.',
      },
      {
        question: 'Can we feature our actual retail products inside the game?',
        answer:
          'Yes. Products can be uploaded as falling collectable items, card flip pairs, or bonus reward tokens, reinforcing visual product recognition throughout gameplay.',
      },
      {
        question: 'Is it possible to capture participant contact details for giveaways?',
        answer:
          'Yes. Attendees submit their player nickname and optional contact handle upon achieving a high score so marketing teams can contact winners and distribute promotional rewards.',
      },
    ],
  },

  // 5. Event Mini-Games
  '/event-mini-games': {
    title: 'Interactive Mini-Games for Events | Event Game Studio',
    description:
      'Discover fast-paced 15-to-60 second arcade mini-games engineered for high throughput, massive crowd circulation, and instant competitive replayability at events.',
    canonical: `${SITE_DOMAIN}/event-mini-games`,
    h1: 'Interactive Mini-Games for Events',
    subheading:
      'High-throughput, fast-paced mini-games designed specifically to keep event queues moving while delivering unforgettable participant excitement.',
    breadcrumbs: [
      { name: 'Home', item: '/' },
      { name: 'Event Mini-Games', item: '/event-mini-games' },
    ],
    faqs: [
      {
        question: 'Why are short 15-to-60 second games best for live event crowds?',
        answer:
          'Short round durations guarantee high throughput, preventing bottleneck queues while giving hundreds of attendees an opportunity to play and compete within event hours.',
      },
      {
        question: 'What types of mini-games are available?',
        answer:
          'Current platform engines include Catch the Brand (fast-paced arcade catching), Brand Memory Match (card pair puzzle), and Formula Reaction Lights (millisecond reflex test).',
      },
    ],
  },

  // 6. Roadshow Games
  '/roadshow-games': {
    title: 'Interactive Games for Roadshows & Pop-Ups | Event Game Studio',
    description:
      'Drive foot traffic and consumer participation at shopping mall roadshows, outdoor pop-ups, and retail concourses with interactive touchscreen games.',
    canonical: `${SITE_DOMAIN}/roadshow-games`,
    h1: 'Interactive Games for Roadshows',
    subheading:
      'Attract shoppers and passers-by at mall concourses and mobile marketing tours with vibrant touchscreen kiosk games and instant reward mechanisms.',
    breadcrumbs: [
      { name: 'Home', item: '/' },
      { name: 'Roadshow Games', item: '/roadshow-games' },
    ],
    faqs: [
      {
        question: 'Can Event Game Studio run on standalone touchscreen kiosks and iPads?',
        answer:
          'Yes. Games fully support touch input, motion controls, and mouse clicks across iPads, Android tablets, touch kiosks, and large touch-enabled TVs.',
      },
      {
        question: 'Can the games operate across multi-day roadshows in different cities?',
        answer:
          'Yes. Events can be scheduled for any duration from 1 day up to multi-week retail roadshows, maintaining leaderboard continuity or resetting daily for fresh winners.',
      },
    ],
  },

  // 7. Exhibition Games
  '/exhibition-games': {
    title: 'Interactive Games for Exhibitions & Booths | Event Game Studio',
    description:
      'Stand out on crowded trade show floors. Attract qualified booth visitors, break the ice, and run engaging trade booth competitions with Event Game Studio.',
    canonical: `${SITE_DOMAIN}/exhibition-games`,
    h1: 'Interactive Games for Exhibitions & Booths',
    subheading:
      'Stop booth foot traffic in its tracks with engaging competitive challenges that make your trade show exhibition booth the talk of the expo hall.',
    breadcrumbs: [
      { name: 'Home', item: '/' },
      { name: 'Exhibition Games', item: '/exhibition-games' },
    ],
    faqs: [
      {
        question: 'How do games help exhibition booths generate more leads?',
        answer:
          'Interactive games create an inviting atmosphere that naturally draws attendees into your booth footprint, giving sales representatives an easy, authentic conversational opening.',
      },
      {
        question: 'Can we run daily prize competitions at our trade booth?',
        answer:
          'Yes. The live leaderboard can be filtered by daily scores or overall event scores, making it seamless to announce daily top-scorer prize winners at 5 PM expo closing.',
      },
    ],
  },

  // 8. Branded Event Games
  '/branded-event-games': {
    title: 'Branded Event Games for Marketing Experiences | Event Game Studio',
    description:
      'Fully tailor games to match your visual identity. Upload brand logos, custom item graphics, background illustrations, audio, and corporate typography.',
    canonical: `${SITE_DOMAIN}/branded-event-games`,
    h1: 'Branded Event Games for Marketing Experiences',
    subheading:
      'Seamless brand integration from start screen to result podium. Your logos, your colors, your products—no generic third-party watermarks.',
    breadcrumbs: [
      { name: 'Home', item: '/' },
      { name: 'Branded Event Games', item: '/branded-event-games' },
    ],
    faqs: [
      {
        question: 'What parts of the game can be customized with our brand identity?',
        answer:
          'You can customize the canvas background, player avatar, scoring target items, obstacle hazard items, bonus multiplier items, audio effects, start screen dialogs, and game over result screens.',
      },
      {
        question: 'Do we need a developer or designer to create a custom theme?',
        answer:
          'No coding is needed. Our visual Theme Customizer allows anyone on your team to upload PNG/JPEG assets, preview changes in real-time, and publish live event themes in minutes.',
      },
    ],
  },

  // 9. Digital Event Games
  '/digital-event-games': {
    title: 'Digital Event Games for Live Experiences | Event Game Studio',
    description:
      'Modern HTML5 browser games engineered for zero-latency live events. Scalable cloud infrastructure supporting thousands of concurrent event players.',
    canonical: `${SITE_DOMAIN}/digital-event-games`,
    h1: 'Digital Event Games for Live Experiences',
    subheading:
      'High-performance browser gaming built on enterprise cloud infrastructure, delivering seamless interactive participation across any mobile or stage display.',
    breadcrumbs: [
      { name: 'Home', item: '/' },
      { name: 'Digital Event Games', item: '/digital-event-games' },
    ],
    faqs: [
      {
        question: 'What happens if venue Wi-Fi is slow or spotty?',
        answer:
          'Our games are lightweight and cache all assets upon initial load. Once loaded into the player browser, gameplay runs locally with 60fps smoothness and only syncs high scores upon completion.',
      },
      {
        question: 'Can games be embedded into our event microsite or virtual event platform?',
        answer:
          'Yes. Games can be shared via public URL, QR code, or embedded directly into your event landing page or virtual conference portal.',
      },
    ],
  },

  // 10. Games Catalog Index
  '/games': {
    title: 'Interactive Event Games Catalog | Event Game Studio',
    description:
      'Explore our curated collection of customizable event games: Catch the Brand, Brand Memory Match, Formula Reaction Lights, and upcoming Trivia Speed Quiz.',
    canonical: `${SITE_DOMAIN}/games`,
    h1: 'Interactive Event Games',
    subheading:
      'Select from proven interactive game engines designed for corporate summits, brand activations, retail roadshows, and trade exhibitions.',
    breadcrumbs: [
      { name: 'Home', item: '/' },
      { name: 'Games', item: '/games' },
    ],
  },

  // 11. Game Detail: Catch the Brand
  '/games/catch-the-brand': {
    title: 'Catch the Brand Arcade Game | Event Game Studio',
    description:
      'Fast-paced arcade catching game for live events. Customize the catcher basket, falling brand items, hazards, and bonus multiplier icons for your brand activation.',
    canonical: `${SITE_DOMAIN}/games/catch-the-brand`,
    h1: 'Catch the Brand',
    subheading:
      'Fast-paced arcade catcher where players catch positive brand items, dodge obstacles, and collect golden bonus multiplier tokens.',
    breadcrumbs: [
      { name: 'Home', item: '/' },
      { name: 'Games', item: '/games' },
      { name: 'Catch the Brand', item: '/games/catch-the-brand' },
    ],
    faqs: [
      {
        question: 'How does Catch the Brand work?',
        answer:
          'Items fall from the top of the screen at escalating speeds. The player controls a branded catcher at the bottom (via keyboard arrows, touch drag, or tilt motion) to catch positive targets (+10), dodge hazards (-10), and grab rare bonus multipliers (+50).',
      },
      {
        question: 'What event durations and formats work best with Catch the Brand?',
        answer:
          'Default rounds last 20 seconds, making it ideal for high-traffic roadshows, busy expo booths, and corporate gala dinner stage competitions.',
      },
    ],
  },

  // 12. Game Detail: Memory Match
  '/games/memory-match': {
    title: 'Brand Memory Match Puzzle Game | Event Game Studio',
    description:
      'Classic pair-matching memory puzzle customized with 8 pairs of your brand products, logos, or team portraits for corporate summits and roadshows.',
    canonical: `${SITE_DOMAIN}/games/memory-match`,
    h1: 'Brand Memory Match',
    subheading:
      'Engaging 16-card memory puzzle where players flip and match customized brand cards while racing against the countdown clock.',
    breadcrumbs: [
      { name: 'Home', item: '/' },
      { name: 'Games', item: '/games' },
      { name: 'Brand Memory Match', item: '/games/memory-match' },
    ],
    faqs: [
      {
        question: 'How does Brand Memory Match work?',
        answer:
          'A 4x4 grid of 16 facedown cards is displayed. Players tap cards to reveal hidden brand graphics and find matching pairs. Quick consecutive matches trigger combo score multipliers before the timer expires.',
      },
      {
        question: 'Can we upload 8 distinct product photos or sponsor logos?',
        answer:
          'Yes! You can customize all 8 unique card pair faces plus the card back design to showcase your entire product lineup or event sponsors.',
      },
    ],
  },

  // 13. Game Detail: Reaction Challenge
  '/games/reaction-challenge': {
    title: 'Formula Reaction Challenge Reflex Game | Event Game Studio',
    description:
      'Test participant reflex speed down to the millisecond in an F1-style starting light sequence. Ideal for auto shows, sports activations, and VIP booth contests.',
    canonical: `${SITE_DOMAIN}/games/reaction-challenge`,
    h1: 'Formula Reaction Challenge',
    subheading:
      'High-adrenaline reflex speed test based on motorsport starting lights. When the red lights extinguish, react as fast as humanly possible!',
    breadcrumbs: [
      { name: 'Home', item: '/' },
      { name: 'Games', item: '/games' },
      { name: 'Reaction Challenge', item: '/games/reaction-challenge' },
    ],
    faqs: [
      {
        question: 'How does Formula Reaction Challenge work?',
        answer:
          'Five red starting lights illuminate sequentially. At a randomized split-second interval, all lights go out simultaneously. Players must tap or press immediately to record their reaction latency in milliseconds.',
      },
      {
        question: 'How does scoring and false-start handling work?',
        answer:
          'Fastest reaction times (e.g. 185ms) rank highest on the leaderboard. If a participant taps before the lights turn off, a Jump Start penalty is flagged, encouraging focused replayability.',
      },
    ],
  },

  // 14. Game Detail: Speed Quiz (Roadmap)
  '/games/speed-quiz': {
    title: 'Event Trivia Speed Quiz (Roadmap) | Event Game Studio',
    description:
      'Interactive timed multiple-choice trivia challenge for live event booths and activations. Currently in development on the Event Game Studio platform roadmap.',
    canonical: `${SITE_DOMAIN}/games/speed-quiz`,
    robots: 'noindex, follow',
    h1: 'Event Trivia Speed Quiz',
    subheading:
      'Interactive timed multiple-choice trivia challenge scheduled on the Event Game Studio development roadmap.',
    breadcrumbs: [
      { name: 'Home', item: '/' },
      { name: 'Games', item: '/games' },
      { name: 'Speed Quiz', item: '/games/speed-quiz' },
    ],
    faqs: [
      {
        question: 'What is the release status of Event Trivia Speed Quiz?',
        answer:
          'The Trivia Speed Quiz engine is currently in active development on our platform roadmap. It is not yet available for live event licensing. You can explore Catch the Brand, Memory Match, and Reaction Challenge today.',
      },
    ],
  },

  // 15. Showcase Index
  '/showcase': {
    title: 'Event Game Showcases & Live Activations | Event Game Studio',
    description:
      'Browse real-world event game activations, corporate gala setups, branded roadshows, and interactive exhibition booths created with Event Game Studio.',
    canonical: `${SITE_DOMAIN}/showcase`,
    h1: 'Event Game Showcases & Live Activations',
    subheading:
      'Explore successful interactive event games deployed by leading event agencies and corporate organizers across Malaysia and Singapore.',
    breadcrumbs: [
      { name: 'Home', item: '/' },
      { name: 'Showcase', item: '/showcase' },
    ],
  },

  // 16. Contact Page
  '/contact': {
    title: 'Contact Event Game Studio | Enquiries & Custom Event Quotes',
    description:
      'Get in touch with the Event Game Studio team for customized event game activations, agency partnerships, WhatsApp support, or multi-day roadshow licensing.',
    canonical: `${SITE_DOMAIN}/contact`,
    h1: 'Contact Event Game Studio',
    subheading:
      'Ready to make your upcoming event playable? Connect with our team for event consultation, custom quotes, or instant WhatsApp support.',
    breadcrumbs: [
      { name: 'Home', item: '/' },
      { name: 'Contact', item: '/contact' },
    ],
    faqs: [
      {
        question: 'How quickly does the team respond to event enquiries?',
        answer:
          'Enquiries submitted through our contact form receive a response within 4 business hours. For urgent same-day event questions, you can message our team directly via WhatsApp.',
      },
      {
        question: 'Can you assist with bespoke 3D design or custom game mechanics?',
        answer:
          'Yes. In addition to our self-serve Theme Customizer, our creative studio team offers end-to-end bespoke visual design and custom game theme creation for brand campaigns.',
      },
    ],
  },
};

/**
 * Resolves SEO configuration for a given path or falls back to default.
 */
export function getPageSeo(pathname: string): PageSeoConfig {
  const cleanPath = pathname.split('?')[0].split('#')[0].replace(/\/+$/, '') || '/';
  
  if (SEO_PAGE_CONFIGS[cleanPath]) {
    return SEO_PAGE_CONFIGS[cleanPath];
  }

  // Check game alias routes
  if (cleanPath === '/games/catch-brand') {
    return SEO_PAGE_CONFIGS['/games/catch-the-brand'];
  }
  if (cleanPath === '/games/reaction-tap' || cleanPath === '/games/reaction-time') {
    return SEO_PAGE_CONFIGS['/games/reaction-challenge'];
  }

  // Fallback default
  return {
    title: 'Interactive Event Games & Branded Mini-Games | Event Game Studio',
    description:
      'Create branded interactive games for corporate events, exhibitions, roadshows, product launches and brand activations with Event Game Studio.',
    canonical: `${SITE_DOMAIN}${cleanPath}`,
    h1: 'Interactive Event Games & Branded Mini-Games',
    ogType: 'website',
    ogImage: DEFAULT_OG_IMAGE,
  };
}
