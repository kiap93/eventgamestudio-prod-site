import { useState, useEffect } from 'react';

export type PresentationMode =
  | 'public_game'
  | 'studio'
  | 'studio_preview'
  | 'login'
  | 'accept_invite'
  | 'create_org';

export interface RouteContext {
  mode: PresentationMode;
  isPublicGameRoute: boolean;
  isStudioRoute: boolean;
  isPreviewRoute: boolean;
  organizationSlug?: string;
  gameSlug?: string;
  pathname: string;
}

// System reserved route prefixes that are NOT organization slugs
const RESERVED_PREFIXES = new Set([
  'studio',
  'game-themes',
  'team',
  'preview',
  'login',
  'accept-invite',
  'create-organization',
  'api',
  'assets',
]);

export function parseRoute(pathname: string): RouteContext {
  const cleanPath = pathname.trim();
  const parts = cleanPath.split('/').filter(Boolean);

  // 1. Check for Accept Invite
  if (cleanPath.startsWith('/accept-invite')) {
    return {
      mode: 'accept_invite',
      isPublicGameRoute: false,
      isStudioRoute: false,
      isPreviewRoute: false,
      pathname: cleanPath,
    };
  }

  // 2. Check for Create Organization
  if (cleanPath.startsWith('/create-organization')) {
    return {
      mode: 'create_org',
      isPublicGameRoute: false,
      isStudioRoute: false,
      isPreviewRoute: false,
      pathname: cleanPath,
    };
  }

  // 3. Check for Login
  if (cleanPath === '/login') {
    return {
      mode: 'login',
      isPublicGameRoute: false,
      isStudioRoute: false,
      isPreviewRoute: false,
      pathname: cleanPath,
    };
  }

  // 4. Check for Studio Preview (/preview or /studio/preview or /game/preview)
  if (cleanPath === '/preview' || cleanPath.startsWith('/studio/preview') || cleanPath === '/game/preview') {
    return {
      mode: 'studio_preview',
      isPublicGameRoute: false,
      isStudioRoute: true,
      isPreviewRoute: true,
      pathname: cleanPath,
    };
  }

  // 5. Check for Public Game Route: /{organization-slug}/{game-slug}
  // Matches 2 parts where the first part is NOT a reserved keyword
  // Examples: /acme/durian, /durian-corp/spooky-halloween, /demo/durian-catcher
  if (parts.length === 2 && !RESERVED_PREFIXES.has(parts[0].toLowerCase())) {
    return {
      mode: 'public_game',
      isPublicGameRoute: true,
      isStudioRoute: false,
      isPreviewRoute: false,
      organizationSlug: parts[0],
      gameSlug: parts[1],
      pathname: cleanPath,
    };
  }

  // Also support /game or /game/:gameSlug as public game route
  if (parts.length >= 1 && parts[0].toLowerCase() === 'game' && cleanPath !== '/game/preview') {
    return {
      mode: 'public_game',
      isPublicGameRoute: true,
      isStudioRoute: false,
      isPreviewRoute: false,
      organizationSlug: undefined,
      gameSlug: parts[1] || 'durian',
      pathname: cleanPath,
    };
  }

  // 6. Default: Studio Route (e.g. /, /studio, /game-themes, /team)
  return {
    mode: 'studio',
    isPublicGameRoute: false,
    isStudioRoute: true,
    isPreviewRoute: false,
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
