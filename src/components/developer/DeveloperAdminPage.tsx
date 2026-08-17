import React from 'react';
import { useRouteContext, navigateTo } from '../../hooks/useRouteContext';
import { useDeveloperAdmin } from '../../hooks/useDeveloperAdmin';
import { DeveloperAdminLayout } from './DeveloperAdminLayout';
import { DeveloperGamesList } from './DeveloperGamesList';
import { DeveloperGameDetail } from './DeveloperGameDetail';
import { DeveloperThemeEditor } from './DeveloperThemeEditor';

export const DeveloperAdminPage: React.FC = () => {
  const route = useRouteContext();
  const {
    games,
    stats,
    loading,
    fetchGames,
    fetchGameDetails,
    createGame,
    updateGame,
    deleteGame,
    createSystemTheme,
    updateSystemTheme,
    deleteSystemTheme,
    duplicateSystemTheme,
    setPrimaryDefaultTheme,
    unsetPrimaryDefaultTheme,
  } = useDeveloperAdmin();

  // 1. If viewing a specific theme editor: /developer/games/:gameId/themes/:themeId/edit or /developer/themes/:themeId/edit
  if (route.developerThemeId && route.developerAction === 'edit-theme') {
    return (
      <DeveloperAdminLayout activeSection="themes">
        <DeveloperThemeEditor
          gameId={route.developerGameId || ''}
          themeId={route.developerThemeId}
          onBack={() => {
            if (route.developerGameId) {
              navigateTo(`/developer/games/${route.developerGameId}`);
            } else {
              navigateTo('/developer');
            }
          }}
        />
      </DeveloperAdminLayout>
    );
  }

  // 2. If viewing a specific game: /developer/games/:gameId
  if (route.developerGameId) {
    return (
      <DeveloperAdminLayout activeSection="games">
        <DeveloperGameDetail
          gameId={route.developerGameId}
          onBack={() => navigateTo('/developer')}
          fetchGameDetails={fetchGameDetails}
          onUpdateGame={updateGame}
          onCreateSystemTheme={createSystemTheme}
          onDuplicateSystemTheme={duplicateSystemTheme}
          onDeleteSystemTheme={deleteSystemTheme}
          onSetPrimaryDefaultTheme={setPrimaryDefaultTheme}
          onUnsetPrimaryDefaultTheme={unsetPrimaryDefaultTheme}
        />
      </DeveloperAdminLayout>
    );
  }

  // 3. Default: Games Catalog & System Themes Overview
  return (
    <DeveloperAdminLayout activeSection="games">
      <DeveloperGamesList
        games={games}
        stats={stats}
        loading={loading}
        onRefresh={fetchGames}
        onCreateGame={createGame}
        onUpdateGame={updateGame}
        onDeleteGame={deleteGame}
      />
    </DeveloperAdminLayout>
  );
};
