import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { GameTheme, registerThemes, setActiveTheme, normalizeGameTheme, getActiveTheme } from '../themes';
import { apiFetch } from '../lib/api';

export interface User {
  id: string;
  email: string;
  name: string;
  avatar_url: string | null;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  role: 'owner' | 'admin' | 'designer' | 'viewer';
  logo_url: string | null;
}

export interface GameCustomization {
  id: string;
  organization_id: string;
  name: string;
  slug: string;
  status: string;
  background_url: string | null;
  basket_config: string | null;
  items_config: string | null;
  settings_config: string | null;
  created_at: string;
  updated_at: string;
}

interface AuthContextType {
  currentUser: User | null;
  currentOrganization: Organization | null;
  organizations: Organization[];
  isAuthenticated: boolean;
  isLoading: boolean;
  token: string | null;
  activeGame: GameCustomization | null;
  themes: GameTheme[];
  activeTheme: GameTheme | null;
  login: (idToken: string) => Promise<void>;
  logout: () => void;
  switchOrganization: (orgId: string) => Promise<void>;
  createOrganization: (name: string, logoUrl?: string) => Promise<string>;
  refreshSession: () => Promise<void>;
  fetchActiveGame: () => Promise<void>;
  fetchThemes: () => Promise<GameTheme[]>;
  createTheme: (themeData: Partial<GameTheme>) => Promise<GameTheme>;
  updateTheme: (themeId: string, themeData: Partial<GameTheme>) => Promise<GameTheme>;
  deleteTheme: (themeId: string) => Promise<void>;
  activateTheme: (themeId: string) => Promise<GameTheme>;
  duplicateTheme: (themeId: string, newName?: string) => Promise<GameTheme>;
  updateGameCustomization: (data: {
    background_url?: string | null;
    basket_config?: any;
    items_config?: any;
    settings_config?: any;
  }) => Promise<void>;
  uploadAsset: (file: File) => Promise<string>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [currentOrganization, setCurrentOrganization] = useState<Organization | null>(null);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [token, setToken] = useState<string | null>(localStorage.getItem('app_token'));
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [activeGame, setActiveGame] = useState<GameCustomization | null>(null);
  const [themes, setThemes] = useState<GameTheme[]>([]);
  const [activeTheme, setActiveThemeState] = useState<GameTheme | null>(() => getActiveTheme());

  const authFetch = useCallback(
    async (url: string, options: RequestInit = {}) => {
      const currentToken = token || localStorage.getItem('app_token');
      const headers = new Headers(options.headers || {});
      if (currentToken && !headers.has('Authorization')) {
        headers.set('Authorization', `Bearer ${currentToken}`);
      }
      return apiFetch(url, { ...options, headers });
    },
    [token]
  );

  const fetchThemes = useCallback(async (): Promise<GameTheme[]> => {
    const currentToken = localStorage.getItem('app_token');
    if (!currentToken) return [];

    try {
      const res = await authFetch('/api/themes');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.themes)) {
          const normalizedList = data.themes.map((t: any) => normalizeGameTheme(t));
          registerThemes(normalizedList);
          setThemes(normalizedList);

          const active = normalizedList.find((t: GameTheme) => t.is_active) || normalizedList[0];
          if (active) {
            setActiveTheme(active);
            setActiveThemeState(active);
          }
          return normalizedList;
        }
      }
    } catch (err) {
      console.error('Failed to fetch themes:', err);
    }
    return [];
  }, [authFetch]);

  const createTheme = async (themeData: Partial<GameTheme>): Promise<GameTheme> => {
    const res = await authFetch('/api/themes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(themeData),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to create theme');
    }

    const data = await res.json();
    const normalized = normalizeGameTheme(data.theme);
    setThemes((prev) => [...prev, normalized]);
    return normalized;
  };

  const updateTheme = async (themeId: string, themeData: Partial<GameTheme>): Promise<GameTheme> => {
    const res = await authFetch(`/api/themes/${themeId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(themeData),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to update theme');
    }

    const data = await res.json();
    const normalized = normalizeGameTheme(data.theme);
    setThemes((prev) => prev.map((t) => (t.id === themeId ? normalized : t)));
    if (normalized.is_active || activeTheme?.id === themeId) {
      setActiveTheme(normalized);
      setActiveThemeState(normalized);
    }
    return normalized;
  };

  const deleteTheme = async (themeId: string): Promise<void> => {
    const res = await authFetch(`/api/themes/${themeId}`, {
      method: 'DELETE',
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to delete theme');
    }

    setThemes((prev) => prev.filter((t) => t.id !== themeId));
  };

  const activateTheme = async (themeId: string): Promise<GameTheme> => {
    const res = await authFetch(`/api/themes/${themeId}/activate`, {
      method: 'POST',
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to activate theme');
    }

    const data = await res.json();
    const normalized = normalizeGameTheme(data.theme);
    setThemes((prev) =>
      prev.map((t) => ({
        ...t,
        is_active: t.id === themeId,
      }))
    );
    setActiveTheme(normalized);
    setActiveThemeState(normalized);
    return normalized;
  };

  const duplicateTheme = async (themeId: string, newName?: string): Promise<GameTheme> => {
    const res = await authFetch(`/api/themes/${themeId}/duplicate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to duplicate theme');
    }

    const data = await res.json();
    const normalized = normalizeGameTheme(data.theme);
    setThemes((prev) => [...prev, normalized]);
    return normalized;
  };

  const fetchActiveGame = useCallback(async () => {
    const currentToken = localStorage.getItem('app_token');
    if (!currentToken) return;
    try {
      const res = await authFetch('/api/games');
      if (res.ok) {
        const data = await res.json();
        if (data.games && data.games.length > 0) {
          setActiveGame(data.games[0]);
        }
      }
    } catch (err) {
      console.error('Failed to fetch active game', err);
    }
  }, [authFetch]);

  const refreshSession = useCallback(async () => {
    const currentToken = localStorage.getItem('app_token');
    if (!currentToken) {
      setIsLoading(false);
      return;
    }

    try {
      const res = await authFetch('/api/auth/me');

      if (res.ok) {
        const data = await res.json();
        setCurrentUser(data.user);
        setOrganizations(data.organizations || []);
        setCurrentOrganization(data.activeOrganization || null);
        if (data.activeOrganization) {
          fetchActiveGame();
          fetchThemes();
        }
      } else {
        localStorage.removeItem('app_token');
        setToken(null);
        setCurrentUser(null);
        setCurrentOrganization(null);
        setOrganizations([]);
      }
    } catch (err) {
      console.error('Failed to refresh session:', err);
    } finally {
      setIsLoading(false);
    }
  }, [authFetch, fetchActiveGame, fetchThemes]);

  useEffect(() => {
    refreshSession();
  }, [refreshSession]);

  const login = async (idToken: string) => {
    setIsLoading(true);
    try {
      const res = await apiFetch('/api/auth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || 'Authentication failed');
      }

      const data = await res.json();
      localStorage.setItem('app_token', data.token);
      setToken(data.token);
      setCurrentUser(data.user);
      setOrganizations(data.organizations || []);

      const active = data.organizations?.find((o: Organization) => o.id === data.activeOrganizationId) || null;
      setCurrentOrganization(active);

      if (active) {
        const gameRes = await authFetch('/api/games');
        if (gameRes.ok) {
          const gameData = await gameRes.json();
          if (gameData.games && gameData.games.length > 0) {
            setActiveGame(gameData.games[0]);
          }
        }
        await fetchThemes();
      }
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    localStorage.removeItem('app_token');
    setToken(null);
    setCurrentUser(null);
    setCurrentOrganization(null);
    setOrganizations([]);
    setActiveGame(null);
    setThemes([]);
  };

  const switchOrganization = async (orgId: string) => {
    setIsLoading(true);
    try {
      const res = await authFetch('/api/auth/switch-org', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organizationId: orgId }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to switch organization');
      }

      const data = await res.json();
      localStorage.setItem('app_token', data.token);
      setToken(data.token);
      setCurrentOrganization(data.activeOrganization);
      await fetchActiveGame();
      await fetchThemes();
    } finally {
      setIsLoading(false);
    }
  };

  const createOrganization = async (name: string, logoUrl?: string): Promise<string> => {
    const res = await authFetch('/api/organizations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, logo_url: logoUrl }),
    });

    if (!res.ok) {
      const errorData = await res.json();
      throw new Error(errorData.error || 'Failed to create organization');
    }

    const data = await res.json();
    localStorage.setItem('app_token', data.token);
    setToken(data.token);
    setCurrentOrganization(data.organization);
    setOrganizations((prev) => [...prev, data.organization]);
    await fetchActiveGame();
    await fetchThemes();
    return data.organization.id;
  };

  const updateGameCustomization = async (data: {
    background_url?: string | null;
    basket_config?: any;
    items_config?: any;
    settings_config?: any;
  }) => {
    if (!activeGame) return;

    const res = await authFetch(`/api/games/${activeGame.id}/customization`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to update game customization');
    }

    const updatedData = await res.json();
    setActiveGame(updatedData.game);
  };

  const uploadAsset = async (file: File): Promise<string> => {
    const formData = new FormData();
    formData.append('file', file);

    const res = await authFetch('/api/upload', {
      method: 'POST',
      body: formData,
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to upload asset');
    }

    const data = await res.json();
    return data.url;
  };

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        currentOrganization,
        organizations,
        isAuthenticated: !!currentUser,
        isLoading,
        token,
        activeGame,
        themes,
        activeTheme,
        login,
        logout,
        switchOrganization,
        createOrganization,
        refreshSession,
        fetchActiveGame,
        fetchThemes,
        createTheme,
        updateTheme,
        deleteTheme,
        activateTheme,
        duplicateTheme,
        updateGameCustomization,
        uploadAsset,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

