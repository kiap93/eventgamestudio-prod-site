import { useState, useEffect } from 'react';
import { DEFAULT_GAME_TYPE } from '../games/types';

export type PresentationMode =
  | 'landing'
  | 'contact'
  | 'public_game'
  | 'public_event'
  | 'public_showcase'
  | 'public_showcases'
  | 'public_games'
  | 'public_game_detail'
  | 'seo_landing'
  | 'event_preview'
  | 'studio'
  | 'studio_preview'
  | 'login'
  | 'accept_invite'
  | 'create_org'
  | 'theme_setup'
  | 'developer_admin'
  | 'verify_email'
  | 'reset_password';

export interface RouteContext {
  mode: PresentationMode;
  isPublicGameRoute: boolean;
  isPublicEventRoute: boolean;
  isPublicShowcaseRoute?: boolean;
  isEventPreviewRoute: boolean;
  isStudioRoute: boolean;
  isPreviewRoute: boolean;
  isDeveloperAdminRoute: boolean;
  isShowcaseRoute?: boolean;
  showcaseId?: string;
  seoSlug?: string;
  publicGameSlug?: string;
  eventId?: string;
  publicToken?: string;
  organizationSlug?: string;
  gameSlug?: string;
  deploymentId?: string;
  gameType?: string;
  developerGameId?: string;
  developerThemeId?: string;
  developerOrgId?: string;
  developerSection?: 'games' | 'showcases' | 'themes' | 'pricing' | 'organizations' | 'email' | 'errors' | 'contact';
  developerAction?: 'new-theme' | 'edit-theme' | 'new-game' | 'edit-game' | 'test-play';
  pathname: string;
}

// System reserved route prefixes that are NOT organization slugs
const RESERVED_PREFIXES = new Set([
  'studio',
  'game-themes',
  'events',
  'e',
  'team',
  'preview',
  'login',
  'contact',
  'accept-invite',
  'create-organization',
  'theme-setup',
  'api',
  'assets',
  'play',
  'games',
  'game-showcase',
  'developer',
  'admin',
  'wallet',
  'showcase',
  'showcases',
  'verify-email',
  'reset-password',
  'interactive-event-games',
  'corporate-event-games',
  'brand-activation-games',
  'event-mini-games',
  'roadshow-games',
  'exhibition-games',
  'branded-event-games',
  'digital-event-games',
]);

export function parseRoute(pathname: string): RouteContext {
  const cleanPath = pathname.trim();
  const parts = cleanPath.split('?')[0].split('/').filter(Boolean);
  const searchParams = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
  const queryGameType = searchParams.get('game') || searchParams.get('gameType') || DEFAULT_GAME_TYPE;

  // Check for static asset files (e.g. /logo.png, /favicon.ico, /assets/*, /images/*, /uploads/*)
  const isStaticFile =
    /\.(png|jpe?g|gif|svg|ico|webp|css|js|woff2?|ttf|eot|json|mp4|webm|mp3|wav|ogg)$/i.test(cleanPath) ||
    cleanPath.startsWith('/assets/') ||
    cleanPath.startsWith('/images/') ||
    cleanPath.startsWith('/public/') ||
    cleanPath.startsWith('/uploads/');

  if (isStaticFile) {
    return {
      mode: 'landing',
      isPublicGameRoute: false,
      isPublicEventRoute: false,
      isEventPreviewRoute: false,
      isStudioRoute: false,
      isPreviewRoute: false,
      isDeveloperAdminRoute: false,
      pathname: cleanPath,
    };
  }

  // 0. Check for Developer Admin routes (/developer/... or /admin/...)
  if (parts.length >= 1 && (parts[0].toLowerCase() === 'developer' || parts[0].toLowerCase() === 'admin')) {
    // /developer
    // /developer/games
    // /developer/games/:gameId
    // /developer/games/:gameId/themes/new
    // /developer/games/:gameId/themes/:themeId/edit
    // /developer/themes/:themeId/edit
    let developerGameId: string | undefined = undefined;
    let developerThemeId: string | undefined = undefined;
    let developerOrgId: string | undefined = undefined;
    let developerAction: RouteContext['developerAction'] = undefined;
    let developerSection: RouteContext['developerSection'] = 'games';

    if (parts[1] === 'organizations') {
      developerSection = 'organizations';
      if (parts[2]) {
        developerOrgId = parts[2];
      }
    } else if (parts[1] === 'errors' || parts[1] === 'error-logs') {
      developerSection = 'errors';
    } else if (parts[1] === 'email' || parts[1] === 'mail') {
      developerSection = 'email';
    } else if (parts[1] === 'contact' || parts[1] === 'contacts' || parts[1] === 'contact-settings') {
      developerSection = 'contact';
    } else if (parts[1] === 'showcases') {
      developerSection = 'showcases';
    } else if (parts[1] === 'pricing' || parts[1] === 'events') {
      developerSection = 'pricing';
    } else if (parts[1] === 'games' && parts[2]) {
      developerGameId = parts[2];
      if (parts[3] === 'themes') {
        if (parts[4] === 'new') {
          developerAction = 'new-theme';
        } else if (parts[4]) {
          developerThemeId = parts[4];
          if (parts[5] === 'edit') developerAction = 'edit-theme';
          if (parts[5] === 'test') developerAction = 'test-play';
        }
      }
    } else if (parts[1] === 'themes' && parts[2]) {
      developerThemeId = parts[2];
      developerSection = 'themes';
      if (parts[3] === 'edit') developerAction = 'edit-theme';
      if (parts[3] === 'test') developerAction = 'test-play';
    }

    return {
      mode: 'developer_admin',
      isPublicGameRoute: false,
      isPublicEventRoute: false,
      isEventPreviewRoute: false,
      isStudioRoute: false,
      isPreviewRoute: false,
      isDeveloperAdminRoute: true,
      developerGameId,
      developerThemeId,
      developerOrgId,
      developerSection,
      developerAction,
      pathname: cleanPath,
    };
  }

  // 1. Check for Public Event Routes: /play/:publicToken or /e/:publicToken
  if (parts.length >= 2 && (parts[0].toLowerCase() === 'e' || parts[0].toLowerCase() === 'play')) {
    return {
      mode: 'public_event',
      isPublicGameRoute: true,
      isPublicEventRoute: true,
      isEventPreviewRoute: false,
      isStudioRoute: false,
      isPreviewRoute: false,
      isDeveloperAdminRoute: false,
      publicToken: parts[1],
      gameType: queryGameType,
      pathname: cleanPath,
    };
  }

  // 1.2. Check for Public Showcase Routes: /showcase/:showcaseId or /showcase index
  if (parts.length >= 1 && (parts[0].toLowerCase() === 'showcase' || parts[0].toLowerCase() === 'showcases')) {
    if (parts.length >= 2) {
      return {
        mode: 'public_showcase',
        isPublicGameRoute: false,
        isPublicEventRoute: false,
        isPublicShowcaseRoute: true,
        isEventPreviewRoute: false,
        isStudioRoute: false,
        isPreviewRoute: false,
        isDeveloperAdminRoute: false,
        showcaseId: parts[1],
        pathname: cleanPath,
      };
    } else {
      return {
        mode: 'public_showcases',
        isPublicGameRoute: false,
        isPublicEventRoute: false,
        isPublicShowcaseRoute: true,
        isEventPreviewRoute: false,
        isStudioRoute: false,
        isPreviewRoute: false,
        isDeveloperAdminRoute: false,
        pathname: cleanPath,
      };
    }
  }

  // 1.3. Check for Public SEO Solutions Landing Pages
  const SEO_LANDING_SLUGS = new Set([
    'interactive-event-games',
    'corporate-event-games',
    'brand-activation-games',
    'event-mini-games',
    'roadshow-games',
    'exhibition-games',
    'branded-event-games',
    'digital-event-games',
  ]);

  if (parts.length === 1 && SEO_LANDING_SLUGS.has(parts[0].toLowerCase())) {
    return {
      mode: 'seo_landing',
      isPublicGameRoute: false,
      isPublicEventRoute: false,
      isEventPreviewRoute: false,
      isStudioRoute: false,
      isPreviewRoute: false,
      isDeveloperAdminRoute: false,
      seoSlug: parts[0].toLowerCase(),
      pathname: cleanPath,
    };
  }

  // 1.4. Check for Public Game Showcase Pages (/game-showcase or /game-showcase/:gameSlug)
  if (parts.length >= 1 && parts[0].toLowerCase() === 'game-showcase') {
    if (parts.length === 1) {
      return {
        mode: 'public_games',
        isPublicGameRoute: false,
        isPublicEventRoute: false,
        isEventPreviewRoute: false,
        isStudioRoute: false,
        isPreviewRoute: false,
        isDeveloperAdminRoute: false,
        pathname: cleanPath,
      };
    } else if (parts.length === 2) {
      return {
        mode: 'public_game_detail',
        isPublicGameRoute: false,
        isPublicEventRoute: false,
        isEventPreviewRoute: false,
        isStudioRoute: false,
        isPreviewRoute: false,
        isDeveloperAdminRoute: false,
        publicGameSlug: parts[1].toLowerCase(),
        pathname: cleanPath,
      };
    }
  }

  // 1.5. Check for Authenticated Event Preview Route: /events/:eventId/preview or /events/preview/:eventId
  if (parts.length >= 2 && parts[0].toLowerCase() === 'events') {
    if (parts.length >= 3 && parts[2].toLowerCase() === 'preview') {
      return {
        mode: 'event_preview',
        isPublicGameRoute: false,
        isPublicEventRoute: false,
        isEventPreviewRoute: true,
        isStudioRoute: true,
        isPreviewRoute: true,
        isDeveloperAdminRoute: false,
        eventId: parts[1],
        gameType: queryGameType,
        pathname: cleanPath,
      };
    } else if (parts[1]?.toLowerCase() === 'preview' && parts[2]) {
      return {
        mode: 'event_preview',
        isPublicGameRoute: false,
        isPublicEventRoute: false,
        isEventPreviewRoute: true,
        isStudioRoute: true,
        isPreviewRoute: true,
        isDeveloperAdminRoute: false,
        eventId: parts[2],
        gameType: queryGameType,
        pathname: cleanPath,
      };
    }
  }

  // 2. Check for Accept Invite
  if (cleanPath.startsWith('/accept-invite')) {
    return {
      mode: 'accept_invite',
      isPublicGameRoute: false,
      isPublicEventRoute: false,
      isEventPreviewRoute: false,
      isStudioRoute: false,
      isPreviewRoute: false,
      isDeveloperAdminRoute: false,
      pathname: cleanPath,
    };
  }

  // 3. Check for Create Organization
  if (cleanPath.startsWith('/create-organization')) {
    return {
      mode: 'create_org',
      isPublicGameRoute: false,
      isPublicEventRoute: false,
      isEventPreviewRoute: false,
      isStudioRoute: false,
      isPreviewRoute: false,
      isDeveloperAdminRoute: false,
      pathname: cleanPath,
    };
  }

  // 4. Check for Login
  if (cleanPath === '/login' || cleanPath.startsWith('/login?')) {
    return {
      mode: 'login',
      isPublicGameRoute: false,
      isPublicEventRoute: false,
      isEventPreviewRoute: false,
      isStudioRoute: false,
      isPreviewRoute: false,
      isDeveloperAdminRoute: false,
      pathname: cleanPath,
    };
  }

    // 4.1. Check for Email Verification: /verify-email
  if (cleanPath.startsWith('/verify-email')) {
    return {
      mode: 'verify_email',
      isPublicGameRoute: false,
      isPublicEventRoute: false,
      isEventPreviewRoute: false,
      isStudioRoute: false,
      isPreviewRoute: false,
      isDeveloperAdminRoute: false,
      pathname: cleanPath,
    };
  }

  // 4.15. Check for Password Reset: /reset-password
  if (cleanPath.startsWith('/reset-password')) {
    return {
      mode: 'reset_password',
      isPublicGameRoute: false,
      isPublicEventRoute: false,
      isEventPreviewRoute: false,
      isStudioRoute: false,
      isPreviewRoute: false,
      isDeveloperAdminRoute: false,
      pathname: cleanPath,
    };
  }

  // 4.2. Check for Theme Setup Onboarding Page: /theme-setup
  if (cleanPath === '/theme-setup' || cleanPath.startsWith('/theme-setup/')) {
    return {
      mode: 'theme_setup',
      isPublicGameRoute: false,
      isPublicEventRoute: false,
      isEventPreviewRoute: false,
      isStudioRoute: true,
      isPreviewRoute: false,
      isDeveloperAdminRoute: false,
      pathname: cleanPath,
    };
  }

  // 4.5. Check for Public Contact Page: /contact
  if (
    cleanPath === '/contact' ||
    cleanPath.startsWith('/contact?') ||
    cleanPath.startsWith('/contact/') ||
    (parts.length >= 1 && parts[0].toLowerCase() === 'contact')
  ) {
    return {
      mode: 'contact',
      isPublicGameRoute: false,
      isPublicEventRoute: false,
      isEventPreviewRoute: false,
      isStudioRoute: false,
      isPreviewRoute: false,
      isDeveloperAdminRoute: false,
      pathname: cleanPath,
    };
  }

  // 5. Check for Public Landing Page: /
  if (cleanPath === '' || cleanPath === '/') {
    return {
      mode: 'landing',
      isPublicGameRoute: false,
      isPublicEventRoute: false,
      isEventPreviewRoute: false,
      isStudioRoute: false,
      isPreviewRoute: false,
      isDeveloperAdminRoute: false,
      pathname: cleanPath,
    };
  }

  // 6. Default: Studio Route (e.g. /studio, /events, /events/:eventId/showcase, /game-themes, /team, /dashboard)
  let eventId: string | undefined = undefined;
  let isShowcaseRoute = false;

  if (parts.length >= 2 && parts[0].toLowerCase() === 'events') {
    eventId = parts[1];
    if (parts.length >= 3 && parts[2].toLowerCase() === 'showcase') {
      isShowcaseRoute = true;
    }
  }

  return {
    mode: 'studio',
    isPublicGameRoute: false,
    isPublicEventRoute: false,
    isEventPreviewRoute: false,
    isStudioRoute: true,
    isPreviewRoute: false,
    isDeveloperAdminRoute: false,
    isShowcaseRoute,
    eventId,
    gameType: queryGameType,
    pathname: cleanPath,
  };
}

export function useRouteContext(): RouteContext {
  const [routeContext, setRouteContext] = useState<RouteContext>(() =>
    parseRoute(window.location.pathname)
  );

  useEffect(() => {
    let lastPath = window.location.pathname + window.location.search;

    const handleLocationChange = () => {
      const newPath = window.location.pathname + window.location.search;
      if (newPath !== lastPath) {
        try {
          if (window.sessionStorage) {
            window.sessionStorage.setItem('egs_previous_route', lastPath);
          }
        } catch {
          // ignore storage errors in restricted contexts
        }
        lastPath = newPath;
      }
      setRouteContext(parseRoute(window.location.pathname));
    };

    window.addEventListener('popstate', handleLocationChange);
    window.addEventListener('hashchange', handleLocationChange);

    return () => {
      window.removeEventListener('popstate', handleLocationChange);
      window.removeEventListener('hashchange', handleLocationChange);
    };
  }, []);

  return routeContext;
}

/**
 * Returns the previous internal application route if one is known and valid.
 * Returns null if the page was directly opened, reloaded, or arrived from an external origin.
 */
export function getPreviousInternalRoute(): string | null {
  if (typeof window === 'undefined') return null;

  try {
    // 1. Check window.history.state for tracked previous route
    const statePrev = window.history.state?.prevRoute;
    if (statePrev && typeof statePrev === 'string' && statePrev !== window.location.pathname) {
      return statePrev;
    }

    // 2. Check sessionStorage for recorded previous internal route
    const sessionPrev = window.sessionStorage?.getItem('egs_previous_route');
    if (sessionPrev && sessionPrev !== window.location.pathname) {
      return sessionPrev;
    }

    // 3. Check document.referrer (if same origin and not current pathname)
    if (document.referrer) {
      const referrerUrl = new URL(document.referrer, window.location.origin);
      if (referrerUrl.origin === window.location.origin) {
        const refPath = referrerUrl.pathname + referrerUrl.search;
        if (refPath !== window.location.pathname) {
          return refPath;
        }
      }
    }
  } catch {
    // Graceful fallback on storage / URL parse failure
  }

  return null;
}

export function navigateTo(url: string, state?: any) {
  if (typeof window === 'undefined') return;
  const currentFull = window.location.pathname + window.location.search;
  if (currentFull !== url) {
    try {
      if (window.sessionStorage) {
        window.sessionStorage.setItem('egs_previous_route', currentFull);
      }
    } catch {
      // Ignore storage errors in restricted contexts
    }
    window.history.pushState({ ...state, prevRoute: currentFull }, '', url);
  }
  window.dispatchEvent(new Event('popstate'));
}

/**
 * Navigates to the previous page in history if a meaningful internal route exists,
 * otherwise safely falls back to the specified route (default: /dashboard).
 */
export function navigateBack(fallbackUrl: string = '/dashboard') {
  if (typeof window === 'undefined') return;

  const prev = getPreviousInternalRoute();

  // If there's valid browser history with a known internal previous route:
  if (window.history.length > 1 && prev) {
    window.history.back();
    return;
  }

  // If we have a recorded internal route but browser history stack is 1:
  if (prev && prev !== window.location.pathname) {
    navigateTo(prev);
    return;
  }

  // Safe fallback if there is no meaningful previous internal route:
  navigateTo(fallbackUrl);
}
