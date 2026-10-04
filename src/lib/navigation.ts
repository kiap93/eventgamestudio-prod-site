import React from 'react';
import { Calendar, Gamepad2, Users } from 'lucide-react';
import { navigateTo } from '../hooks/useRouteContext';

export interface NavigationItem {
  id: 'events' | 'games' | 'team';
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

export const MAIN_NAVIGATION_ITEMS: NavigationItem[] = [
  { id: 'events', label: 'Events', href: '/events', icon: Calendar },
  { id: 'games', label: 'Games', href: '/games', icon: Gamepad2 },
  { id: 'team', label: 'Team', href: '/team', icon: Users },
];

/**
 * Returns filtered navigation items according to role-based access permissions.
 * - Designer: MUST NOT see Events or Team menu. Only Games / Themes.
 * - Viewer: MUST NOT see Team menu. Only Events (read-only) and Games.
 * - Owner & Admin: Full access to Events, Games, and Team.
 */
export const getNavigationItemsForRole = (role?: string | null): NavigationItem[] => {
  if (!role) return MAIN_NAVIGATION_ITEMS;

  if (role === 'designer') {
    return MAIN_NAVIGATION_ITEMS.filter((item) => item.id === 'games');
  }

  if (role === 'viewer') {
    return MAIN_NAVIGATION_ITEMS.filter((item) => item.id === 'events' || item.id === 'games');
  }

  return MAIN_NAVIGATION_ITEMS;
};

/**
 * Matches whether currentPath belongs to the main section represented by sectionHref.
 * This function ONLY controls visual active styling and never blocks navigation.
 */
export const matchesMainSection = (currentPath: string, sectionHref: string): boolean => {
  const normalizedPath = (currentPath || '/').split('?')[0].split('#')[0];

  if (sectionHref === '/events') {
    return normalizedPath === '/events' || normalizedPath.startsWith('/events/');
  }

  if (sectionHref === '/games') {
    return (
      normalizedPath === '/games' ||
      normalizedPath.startsWith('/games/') ||
      normalizedPath === '/game-themes' ||
      normalizedPath.startsWith('/game-themes/') ||
      normalizedPath === '/studio' ||
      normalizedPath.startsWith('/studio/')
    );
  }

  if (sectionHref === '/team') {
    return normalizedPath === '/team' || normalizedPath.startsWith('/team/');
  }

  if (sectionHref === '/wallet') {
    return (
      (normalizedPath === '/wallet' || normalizedPath.startsWith('/wallet/')) &&
      !normalizedPath.startsWith('/wallet/top-up')
    );
  }

  if (sectionHref === '/wallet/top-up') {
    return normalizedPath === '/wallet/top-up' || normalizedPath.startsWith('/wallet/top-up/');
  }

  return normalizedPath === sectionHref;
};

/**
 * Performs navigation when a main section tab is clicked.
 * - Active state only controls styling.
 * - Clicking a main navigation tab must always navigate to that tab's root landing route.
 * - Do NOT use logic such as `if (isActive) return;` to prevent navigation.
 * - If the current route is already the root landing route, it remains there and dispatches popstate to reset ephemeral state.
 * - If the current route is a nested route, it navigates to the root route.
 */
export const handleMainTabNavigation = (href: string): void => {
  if (typeof window === 'undefined') return;

  const currentPath = window.location.pathname;
  const currentSearch = window.location.search;
  const currentFull = currentPath + currentSearch;

  if (currentFull !== href) {
    navigateTo(href);
  } else {
    // If already on the root landing route, dispatch popstate to clean up any open sub-modals/drawers
    window.dispatchEvent(new Event('popstate'));
  }
};
