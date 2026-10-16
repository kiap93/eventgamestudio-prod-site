import { useState, useEffect, useCallback } from 'react';
import { PlatformGame, PlatformStats } from '../types/developer';
import { GameTheme } from '../themes/types';
import { apiFetch } from '../lib/api';

export function useDeveloperAdmin() {
  const [games, setGames] = useState<PlatformGame[]>([]);
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchGames = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch('/api/developer/games');
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to fetch platform games');
      }
      const data = await res.json();
      const loadedGames: PlatformGame[] = data.games || [];
      setGames(loadedGames);
      setStats(
        data.stats || {
          totalGames: loadedGames.length,
          activeGames: loadedGames.filter((g) => g.status === 'active').length,
          totalDefaultThemes: loadedGames.reduce((acc, g) => acc + (g.system_theme_count || 0), 0),
          activeThemes: loadedGames.reduce((acc, g) => acc + (g.theme_count || 0), 0),
        }
      );
    } catch (err: any) {
      setError(err.message || 'Error fetching platform games');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchGames();
  }, [fetchGames]);

  const fetchGameDetails = useCallback(
    async (gameId: string): Promise<{ game: PlatformGame; themes: GameTheme[] } | null> => {
      try {
        const [gameRes, themesRes] = await Promise.all([
          apiFetch(`/api/developer/games/${gameId}`),
          apiFetch(`/api/developer/games/${gameId}/themes`),
        ]);

        if (!gameRes.ok) return null;
        const gameData = await gameRes.json();
        const themesData = themesRes.ok ? await themesRes.json() : { themes: [] };

        return {
          game: gameData.game || gameData,
          themes: themesData.themes || [],
        };
      } catch (err) {
        console.error('Error fetching game details:', err);
        return null;
      }
    },
    []
  );

  const createGame = useCallback(
    async (data: Partial<PlatformGame>): Promise<PlatformGame> => {
      const res = await apiFetch('/api/developer/games', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to create game');
      }

      const resData = await res.json();
      const newGame: PlatformGame = resData.game || resData;
      setGames((prev) => [newGame, ...prev]);
      return newGame;
    },
    []
  );

  const updateGame = useCallback(
    async (gameId: string, data: Partial<PlatformGame>): Promise<PlatformGame> => {
      const res = await apiFetch(`/api/developer/games/${gameId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to update game');
      }

      const resData = await res.json();
      const updatedGame: PlatformGame = resData.game || resData;
      setGames((prev) => prev.map((g) => (g.id === gameId ? updatedGame : g)));
      return updatedGame;
    },
    []
  );

  const deleteGame = useCallback(async (gameId: string): Promise<void> => {
    const res = await apiFetch(`/api/developer/games/${gameId}`, {
      method: 'DELETE',
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to delete game');
    }

    setGames((prev) => prev.filter((g) => g.id !== gameId));
  }, []);

  const createSystemTheme = useCallback(
    async (gameId: string, data: Partial<GameTheme>): Promise<GameTheme> => {
      const res = await apiFetch(`/api/developer/games/${gameId}/themes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to create system theme');
      }

      const resData = await res.json();
      return resData.theme || resData;
    },
    []
  );

  const updateSystemTheme = useCallback(
    async (themeId: string, data: Partial<GameTheme>): Promise<GameTheme> => {
      const res = await apiFetch(`/api/developer/themes/${themeId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to update system theme');
      }

      const resData = await res.json();
      return resData.theme || resData;
    },
    []
  );

  const deleteSystemTheme = useCallback(async (themeId: string): Promise<void> => {
    const res = await apiFetch(`/api/developer/themes/${themeId}`, {
      method: 'DELETE',
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to delete system theme');
    }
  }, []);

  const duplicateSystemTheme = useCallback(
    async (themeId: string, name?: string): Promise<GameTheme> => {
      const res = await apiFetch(`/api/developer/themes/${themeId}/duplicate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to duplicate system theme');
      }

      const resData = await res.json();
      return resData.theme || resData;
    },
    []
  );

  const setPrimaryDefaultTheme = useCallback(async (themeId: string): Promise<void> => {
    const res = await apiFetch(`/api/developer/themes/${themeId}/set-default`, {
      method: 'POST',
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to set primary default theme');
    }
  }, []);

  const unsetPrimaryDefaultTheme = useCallback(async (themeId: string): Promise<void> => {
    const res = await apiFetch(`/api/developer/themes/${themeId}/unset-default`, {
      method: 'POST',
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to unset primary default theme');
    }
  }, []);

  return {
    games,
    stats,
    loading,
    error,
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
  };
}
