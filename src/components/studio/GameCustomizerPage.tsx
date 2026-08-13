import React, { useState, useEffect } from 'react';
import { ThemeList } from './ThemeList';
import { ThemeEditor } from './ThemeEditor';

export const GameCustomizerPage: React.FC = () => {
  // Parse initial theme ID from current URL if matching /game-themes/:themeId/edit
  const getThemeIdFromUrl = (): string | null => {
    const pathname = window.location.pathname;
    const match = pathname.match(/^\/game-themes\/([^/]+)\/edit$/);
    return match ? match[1] : null;
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
    const newPath = `/game-themes/${themeId}/edit`;
    if (window.location.pathname !== newPath) {
      window.history.pushState({ themeId }, '', newPath);
    }
    setEditingThemeId(themeId);
  };

  const handleBackToList = () => {
    const newPath = '/game-themes';
    if (window.location.pathname !== newPath) {
      window.history.pushState(null, '', newPath);
    }
    setEditingThemeId(null);
  };

  if (editingThemeId) {
    return <ThemeEditor themeId={editingThemeId} onBack={handleBackToList} />;
  }

  return <ThemeList onEditTheme={handleOpenEditor} />;
};
