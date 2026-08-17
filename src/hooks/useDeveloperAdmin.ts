import { useState, useCallback, useEffect } from 'react';
import { apiFetch } from '../lib/api';
import { PlatformGame, PlatformStats } from '../types/developer';
import { GameTheme, normalizeGameTheme } from '../themes';

export function useDeveloperAdmin() {
  const [games, setGames] = useState<PlatformGame[]>([]);
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const getHeaders = useCallback(() => {
    const token = localStorage.getItem('app_token');
    return {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  }, []);

  const fetchStats = useCallback(async () => {
    try {
      const res = await apiFetch('/api/developer/stats', { headers: getHeaders() });
      if (res.ok) {
        const data = await res.json();
        setStats(data.stats);
      }
    } catch (err: any) {
      console.error('Failed to fetch developer stats:', err);
    }
  }, [getHeaders]);

  const fetchGames = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch('/api/developer/games', { headers: getHeaders() });
      if (res.ok) {
        const data = await res.json();
        setGames(data.games || []);
      } else {
        const err = await res.json().catch(() => ({}));
        setError(err.error || 'Failed to fetch platform games');
      }
    } catch (err: any) {
      console.error('Failed to fetch games:', err);
      setError(err.message || 'Network error fetching games');
    } finally {
      setLoading(false);
    }
  }, [getHeaders]);

  const fetchGameDetails = useCallback(
    async (gameId: string): Promise<{ game: PlatformGame; themes: GameTheme[] } | null> => {
      try {
        const res = await apiFetch(`/api/developer/games/${gameId}`, { headers: getHeaders() });
        if (!res.ok) throw new Error('Game not found');
        const data = await res.json();
        return {
          game: data.game,
          themes: (data.themes || []).map((t: any) => normalizeGameTheme(t)),
        };
      } catch (err: any) {
        console.error('Error fetching game details:', err);
        return null;
      }
    },
    [getHeaders]
  );

  const createGame = useCallback(
    async (gameData: Partial<PlatformGame>): Promise<PlatformGame> => {
      const res = await apiFetch('/api/developer/games', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(gameData),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || err.error || 'Failed to create platform game');
      }

      const data = await res.json();
      setGames((prev) => [...prev, data.game]);
      return data.game;
    },
    [getHeaders]
  );

  const updateGame = useCallback(
    async (gameId: string, gameData: Partial<PlatformGame>): Promise<PlatformGame> => {
      const res = await apiFetch(`/api/developer/games/${gameId}`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify(gameData),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || err.error || 'Failed to update game');
      }

      const data = await res.json();
      setGames((prev) => prev.map((g) => (g.id === gameId ? data.game : g)));
      return data.game;
    },
    [getHeaders]
  );

  const deleteGame = useCallback(
    async (gameId: string): Promise<void> => {
      const res = await apiFetch(`/api/developer/games/${gameId}`, {
        method: 'DELETE',
        headers: getHeaders(),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to delete game');
      }

      setGames((prev) => prev.filter((g) => g.id !== gameId));
    },
    [getHeaders]
  );

  const fetchGameThemes = useCallback(
    async (gameId: string): Promise<GameTheme[]> => {
      try {
        const res = await apiFetch(`/api/developer/games/${gameId}/themes`, { headers: getHeaders() });
        if (!res.ok) throw new Error('Failed to fetch themes');
        const data = await res.json();
        return (data.themes || []).map((t: any) => normalizeGameTheme(t));
      } catch (err: any) {
        console.error('Error fetching game themes:', err);
        return [];
      }
    },
    [getHeaders]
  );

  const createSystemTheme = useCallback(
    async (gameId: string, themeData: Partial<GameTheme>): Promise<GameTheme> => {
      const res = await apiFetch(`/api/developer/games/${gameId}/themes`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(themeData),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to create system theme');
      }

      const data = await res.json();
      return normalizeGameTheme(data.theme);
    },
    [getHeaders]
  );

  const updateSystemTheme = useCallback(
    async (themeId: string, themeData: Partial<GameTheme>): Promise<GameTheme> => {
      const res = await apiFetch(`/api/developer/themes/${themeId}`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify(themeData),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to update system theme');
      }

      const data = await res.json();
      return normalizeGameTheme(data.theme);
    },
    [getHeaders]
  );

  const deleteSystemTheme = useCallback(
    async (themeId: string): Promise<void> => {
      const res = await apiFetch(`/api/developer/themes/${themeId}`, {
        method: 'DELETE',
        headers: getHeaders(),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to delete system theme');
      }
    },
    [getHeaders]
  );

  const duplicateSystemTheme = useCallback(
    async (themeId: string, newName?: string): Promise<GameTheme> => {
      const res = await apiFetch(`/api/developer/themes/${themeId}/duplicate`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ name: newName }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to duplicate system theme');
      }

      const data = await res.json();
      return normalizeGameTheme(data.theme);
    },
    [getHeaders]
  );

  const setPrimaryDefaultTheme = useCallback(
    async (themeId: string): Promise<void> => {
      const res = await apiFetch(`/api/developer/themes/${themeId}/set-default`, {
        method: 'POST',
        headers: getHeaders(),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to set primary default theme');
      }
    },
    [getHeaders]
  );

  const unsetPrimaryDefaultTheme = useCallback(
    async (themeId: string): Promise<void> => {
      const res = await apiFetch(`/api/developer/themes/${themeId}/unset-default`, {
        method: 'POST',
        headers: getHeaders(),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to unset primary default theme');
      }
    },
    [getHeaders]
  );

  useEffect(() => {
    fetchGames();
    fetchStats();
  }, [fetchGames, fetchStats]);

  return {
    games,
    stats,
    loading,
    error,
    fetchGames,
    fetchStats,
    fetchGameDetails,
    createGame,
    updateGame,
    deleteGame,
    fetchGameThemes,
    createSystemTheme,
    updateSystemTheme,
    deleteSystemTheme,
    duplicateSystemTheme,
    setPrimaryDefaultTheme,
    unsetPrimaryDefaultTheme,
  };
}
