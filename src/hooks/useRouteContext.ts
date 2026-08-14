import { useState, useEffect } from 'react';
import { DEFAULT_GAME_TYPE } from '../games/registry';

export type PresentationMode =
  | 'public_game'
  | 'public_event'
  | 'studio'
  | 'studio_preview'
  | 'login'
  | 'accept_invite'
  | 'create_org';

export interface RouteContext {
  mode: PresentationMode;
  isPublicGameRoute: boolean;
  isPublicEventRoute: boolean;
  isStudioRoute: boolean;
  isPreviewRoute: boolean;
  publicToken?: string;
  organizationSlug?: string;
  gameSlug?: string;
  deploymentId?: string;
  gameType?: string;
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
  'accept-invite',
  'create-organization',
  'api',
  'assets',
  'play',
  'games',
]);

export function parseRoute(pathname: string): RouteContext {
  const cleanPath = pathname.trim();
  const parts = cleanPath.split('?')[0].split('/').filter(Boolean);
  const searchParams = new URLSearchParams(window.location.search);
  const queryGameType = searchParams.get('game') || searchParams.get('gameType') || DEFAULT_GAME_TYPE;

  // 1. Check for Public Event Route: /e/:publicToken
  if (parts.length >= 2 && parts[0].toLowerCase() === 'e') {
    return {
      mode: 'public_event',
      isPublicGameRoute: true,
      isPublicEventRoute: true,
      isStudioRoute: false,
      isPreviewRoute: false,
      publicToken: parts[1],
      gameType: queryGameType,
      pathname: cleanPath,
    };
  }

  // 2. Check for Accept Invite
  if (cleanPath.startsWith('/accept-invite')) {
    return {
      mode: 'accept_invite',
      isPublicGameRoute: false,
      isPublicEventRoute: false,
      isStudioRoute: false,
      isPreviewRoute: false,
      pathname: cleanPath,
    };
  }

  // 3. Check for Create Organization
  if (cleanPath.startsWith('/create-organization')) {
    return {
      mode: 'create_org',
      isPublicGameRoute: false,
      isPublicEventRoute: false,
      isStudioRoute: false,
      isPreviewRoute: false,
      pathname: cleanPath,
    };
  }

  // 4. Check for Login
  if (cleanPath === '/login') {
    return {
      mode: 'login',
      isPublicGameRoute: false,
      isPublicEventRoute: false,
      isStudioRoute: false,
      isPreviewRoute: false,
      pathname: cleanPath,
    };
  }

  // 5. Check for Studio Preview (/preview or /studio/preview or /game/preview)
  if (cleanPath === '/preview' || cleanPath.startsWith('/studio/preview') || cleanPath === '/game/preview') {
    return {
      mode: 'studio_preview',
      isPublicGameRoute: false,
      isPublicEventRoute: false,
      isStudioRoute: true,
      isPreviewRoute: true,
      gameType: queryGameType,
      pathname: cleanPath,
    };
  }

  // 6. Check for generic Play Route: /play/:deploymentId or /play/:orgSlug/:gameSlug
  if (parts.length >= 2 && parts[0].toLowerCase() === 'play') {
    return {
      mode: 'public_game',
      isPublicGameRoute: true,
      isPublicEventRoute: false,
      isStudioRoute: false,
      isPreviewRoute: false,
      deploymentId: parts[1],
      organizationSlug: parts[2] ? parts[1] : undefined,
      gameSlug: parts[2] || parts[1],
      gameType: queryGameType,
      pathname: cleanPath,
    };
  }

  // 7. Check for Public Game Route: /{organization-slug}/{game-slug}
  // Matches 2 parts where the first part is NOT a reserved keyword
  // Examples: /acme/durian, /durian-corp/spooky-halloween, /demo/durian-catcher
  if (parts.length === 2 && !RESERVED_PREFIXES.has(parts[0].toLowerCase())) {
    return {
      mode: 'public_game',
      isPublicGameRoute: true,
      isPublicEventRoute: false,
      isStudioRoute: false,
      isPreviewRoute: false,
      organizationSlug: parts[0],
      gameSlug: parts[1],
      gameType: queryGameType,
      pathname: cleanPath,
    };
  }

  // Also support /game or /game/:gameSlug as public game route
  if (parts.length >= 1 && (parts[0].toLowerCase() === 'game' || parts[0].toLowerCase() === 'games') && cleanPath !== '/game/preview') {
    return {
      mode: 'public_game',
      isPublicGameRoute: true,
      isPublicEventRoute: false,
      isStudioRoute: false,
      isPreviewRoute: false,
      organizationSlug: undefined,
      gameSlug: parts[1] || 'durian',
      gameType: parts[0].toLowerCase() === 'games' && parts[1] ? parts[1] : queryGameType,
      pathname: cleanPath,
    };
  }

  // 8. Default: Studio Route (e.g. /, /studio, /events, /game-themes, /team)
  return {
    mode: 'studio',
    isPublicGameRoute: false,
    isPublicEventRoute: false,
    isStudioRoute: true,
    isPreviewRoute: false,
    gameType: queryGameType,
    pathname: cleanPath,
  };
}

export function useRouteContext(): RouteContext {
  const [routeContext, setRouteContext] = useState<RouteContext>(() =>
    parseRoute(window.location.pathname)
  );

  useEffect(() => {
    const handleLocationChange = () => {
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

export function navigateTo(url: string) {
  if (window.location.pathname !== url) {
    window.history.pushState(null, '', url);
    window.dispatchEvent(new Event('popstate'));
  }
}
