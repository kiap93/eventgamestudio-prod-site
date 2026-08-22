import { useState, useEffect } from 'react';
import { DEFAULT_GAME_TYPE } from '../games/registry';

export type PresentationMode =
  | 'landing'
  | 'public_game'
  | 'public_event'
  | 'studio'
  | 'studio_preview'
  | 'login'
  | 'accept_invite'
  | 'create_org'
  | 'developer_admin';

export interface RouteContext {
  mode: PresentationMode;
  isPublicGameRoute: boolean;
  isPublicEventRoute: boolean;
  isStudioRoute: boolean;
  isPreviewRoute: boolean;
  isDeveloperAdminRoute: boolean;
  isShowcaseRoute?: boolean;
  eventId?: string;
  publicToken?: string;
  organizationSlug?: string;
  gameSlug?: string;
  deploymentId?: string;
  gameType?: string;
  developerGameId?: string;
  developerThemeId?: string;
  developerSection?: 'games' | 'showcases' | 'themes';
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
  'accept-invite',
  'create-organization',
  'api',
  'assets',
  'play',
  'games',
  'developer',
  'wallet',
]);

export function parseRoute(pathname: string): RouteContext {
  const cleanPath = pathname.trim();
  const parts = cleanPath.split('?')[0].split('/').filter(Boolean);
  const searchParams = new URLSearchParams(window.location.search);
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
      isStudioRoute: false,
      isPreviewRoute: false,
      isDeveloperAdminRoute: false,
      pathname: cleanPath,
    };
  }

  // 0. Check for Developer Admin routes (/developer/...)
  if (parts.length >= 1 && parts[0].toLowerCase() === 'developer') {
    // /developer
    // /developer/games
    // /developer/games/:gameId
    // /developer/games/:gameId/themes/new
    // /developer/games/:gameId/themes/:themeId/edit
    // /developer/themes/:themeId/edit
    let developerGameId: string | undefined = undefined;
    let developerThemeId: string | undefined = undefined;
    let developerAction: RouteContext['developerAction'] = undefined;
    let developerSection: RouteContext['developerSection'] = 'games';

    if (parts[1] === 'showcases') {
      developerSection = 'showcases';
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
      isStudioRoute: false,
      isPreviewRoute: false,
      isDeveloperAdminRoute: true,
      developerGameId,
      developerThemeId,
      developerSection,
      developerAction,
      pathname: cleanPath,
    };
  }

  // 1. Check for Public Event Route: /e/:publicToken
  if (parts.length >= 2 && parts[0].toLowerCase() === 'e') {
    return {
      mode: 'public_event',
      isPublicGameRoute: true,
      isPublicEventRoute: true,
      isStudioRoute: false,
      isPreviewRoute: false,
      isDeveloperAdminRoute: false,
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
      isStudioRoute: false,
      isPreviewRoute: false,
      isDeveloperAdminRoute: false,
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
  const currentFull = window.location.pathname + window.location.search;
  if (currentFull !== url) {
    window.history.pushState(null, '', url);
    window.dispatchEvent(new Event('popstate'));
  }
}
