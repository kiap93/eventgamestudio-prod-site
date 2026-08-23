import React from 'react';
import { useRouteContext, navigateTo } from '../../hooks/useRouteContext';
import { useAuth } from '../../context/AuthContext';
import { useDeveloperAdmin } from '../../hooks/useDeveloperAdmin';
import { DeveloperAdminLayout } from './DeveloperAdminLayout';
import { DeveloperGamesList } from './DeveloperGamesList';
import { DeveloperGameDetail } from './DeveloperGameDetail';
import { DeveloperThemeEditor } from './DeveloperThemeEditor';
import { DeveloperShowcaseReviews } from './DeveloperShowcaseReviews';
import { DeveloperPricingManager } from './DeveloperPricingManager';
import { DeveloperOrganizationsList } from './DeveloperOrganizationsList';
import { DeveloperOrganizationDetail } from './DeveloperOrganizationDetail';
import { ShieldAlert } from 'lucide-react';

export const DeveloperAdminPage: React.FC = () => {
  const { currentUser } = useAuth();
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

  // Guard: If not a verified developer admin, block access
  if (!currentUser?.is_developer) {
    return (
      <div className="min-w-screen min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center font-sans p-4">
        <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-6 text-center space-y-4 shadow-2xl">
          <div className="w-12 h-12 rounded-full bg-rose-500/20 text-rose-400 flex items-center justify-center mx-auto border border-rose-500/30">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <h1 className="text-xl font-bold text-white">Access Denied</h1>
          <p className="text-sm text-slate-400 leading-relaxed">
            You do not have developer permissions to access the Developer Admin portal.
          </p>
          <div className="pt-2">
            <button
              onClick={() => navigateTo('/events')}
              className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs rounded-xl transition-colors cursor-pointer"
            >
              Return to Events
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 1. If viewing Organizations: /developer/organizations or /developer/organizations/:orgId
  if (route.developerSection === 'organizations') {
    return (
      <DeveloperAdminLayout activeSection="organizations">
        {route.developerOrgId ? (
          <DeveloperOrganizationDetail orgId={route.developerOrgId} />
        ) : (
          <DeveloperOrganizationsList />
        )}
      </DeveloperAdminLayout>
    );
  }

  // 1a. If viewing Showcase Submissions & Review: /developer/showcases
  if (route.developerSection === 'showcases') {
    return (
      <DeveloperAdminLayout activeSection="showcases">
        <DeveloperShowcaseReviews />
      </DeveloperAdminLayout>
    );
  }

  // 1b. If viewing Event Pricing Control: /developer/pricing
  if (route.developerSection === 'pricing') {
    return (
      <DeveloperAdminLayout activeSection="pricing">
        <DeveloperPricingManager />
      </DeveloperAdminLayout>
    );
  }

  // 2. If viewing a specific theme editor: /developer/games/:gameId/themes/:themeId/edit or /developer/themes/:themeId/edit
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

  // 3. If viewing a specific game: /developer/games/:gameId
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

  // 4. Default: Games Catalog & System Themes Overview
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
