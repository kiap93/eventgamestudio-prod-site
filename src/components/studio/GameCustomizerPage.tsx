import React, { useState, useEffect } from 'react';
import { ThemeList } from './ThemeList';
import { ThemeEditor } from './ThemeEditor';
import { navigateTo, navigateBack } from '../../hooks/useRouteContext';

export const GameCustomizerPage: React.FC = () => {
  // Parse initial theme ID from current URL (supports /studio/:themeId, /game-themes/:themeId/edit, /game-themes/:themeId, ?editTheme=)
  const getThemeIdFromUrl = (): string | null => {
    if (typeof window === 'undefined') return null;
    const pathname = window.location.pathname;
    const searchParams = new URLSearchParams(window.location.search);

    const studioMatch = pathname.match(/^\/studio\/([^/?#]+)/);
    if (studioMatch) return decodeURIComponent(studioMatch[1]);

    const gameThemesMatch = pathname.match(/^\/game-themes\/([^/?#]+)(?:\/edit)?/);
    if (gameThemesMatch && gameThemesMatch[1].toLowerCase() !== 'new') {
      return decodeURIComponent(gameThemesMatch[1]);
    }

    const queryTheme = searchParams.get('editTheme') || searchParams.get('themeId');
    if (queryTheme && queryTheme.trim()) {
      return queryTheme.trim();
    }

    return null;
  };

  const [editingThemeId, setEditingThemeId] = useState<string | null>(() => getThemeIdFromUrl());

  // Listen to popstate (browser back / forward button)
  useEffect(() => {
    const handlePopState = () => {
      const id = getThemeIdFromUrl();
      setEditingThemeId(id);
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  const handleOpenEditor = (themeId: string) => {
    const newPath = `/studio/${encodeURIComponent(themeId)}`;
    navigateTo(newPath);
    setEditingThemeId(themeId);
  };

  const handleBackToList = () => {
    navigateBack('/games');
    setEditingThemeId(null);
  };

  if (editingThemeId) {
    return <ThemeEditor themeId={editingThemeId} onBack={handleBackToList} />;
  }

  return <ThemeList onEditTheme={handleOpenEditor} />;
};

