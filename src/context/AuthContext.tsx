import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { GameTheme, registerThemes, setActiveTheme, normalizeGameTheme, getActiveTheme } from '../themes';
import { apiFetch, migrateLegacyAppToken } from '../lib/api';
import { navigateTo } from '../hooks/useRouteContext';

export interface User {
  id: string;
  email: string;
  name: string;
  avatar_url: string | null;
  is_developer?: boolean;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  role: 'owner' | 'admin' | 'designer' | 'viewer';
  logo_url: string | null;
  country_code?: string | null;
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
  loginWithEmail: (email: string, password: string) => Promise<{ success: boolean; unverified?: boolean; email?: string }>;
  registerWithEmail: (email: string, password: string, confirmPassword: string) => Promise<{ success: boolean; message: string; email: string }>;
  resendVerificationEmail: (email: string) => Promise<{ success: boolean; message: string; already_verified?: boolean }>;
  verifyEmail: (token: string) => Promise<{ success: boolean; message: string }>;
  requestPasswordReset: (email: string) => Promise<{ success: boolean; message: string }>;
  resetPassword: (token: string, password: string, confirmPassword: string) => Promise<{ success: boolean; message: string }>;
  logout: () => void;
  switchOrganization: (orgId: string) => Promise<void>;
  createOrganization: (name: string, logoUrl?: string, countryCode?: string) => Promise<string>;
  startCreateOrganization: () => void;
  cancelCreateOrganization: () => void;
  updateOrganizationCountry: (countryCode: string) => Promise<void>;
  refreshSession: () => Promise<void>;
  fetchActiveGame: () => Promise<void>;
  fetchThemes: (gameId?: string) => Promise<GameTheme[]>;
  fetchSystemThemes: (gameId?: string) => Promise<GameTheme[]>;
  createTheme: (themeData: Partial<GameTheme>) => Promise<GameTheme>;
  updateTheme: (themeId: string, themeData: Partial<GameTheme>) => Promise<GameTheme>;
  renameTheme: (themeId: string, newName: string) => Promise<GameTheme>;
  deleteTheme: (themeId: string) => Promise<void>;
  duplicateTheme: (themeId: string, newName?: string) => Promise<GameTheme>;
  cloneSystemTheme: (systemThemeId: string, customName?: string, gameId?: string) => Promise<GameTheme>;
  cloneAllSystemThemes: (gameId: string) => Promise<GameTheme[]>;
  updateGameCustomization: (data: {
    background_url?: string | null;
    basket_config?: any;
    items_config?: any;
    settings_config?: any;
  }) => Promise<void>;
  uploadAsset: (file: File) => Promise<string>;
  updateUserProfile: (data: { name?: string; avatar_url?: string | null }) => Promise<User>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [currentOrganization, setCurrentOrganization] = useState<Organization | null>(null);
  const [previousActiveOrg, setPreviousActiveOrg] = useState<Organization | null>(null);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [token, setToken] = useState<string | null>(() => {
    migrateLegacyAppToken();
    return typeof localStorage !== 'undefined' ? localStorage.getItem('app_token') : null;
  });
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

  const fetchThemes = useCallback(async (gameId?: string): Promise<GameTheme[]> => {
    const currentToken = localStorage.getItem('app_token');
    if (!currentToken) return [];

    try {
      const url = gameId ? `/api/themes?gameId=${encodeURIComponent(gameId)}` : '/api/themes';
      const res = await authFetch(url);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.themes)) {
          const normalizedList = data.themes.map((t: any) => normalizeGameTheme(t));
          registerThemes(normalizedList);
          setThemes(normalizedList);

          const defaultTheme = normalizedList[0];
          if (defaultTheme && !activeTheme) {
            setActiveTheme(defaultTheme);
            setActiveThemeState(defaultTheme);
          }
          return normalizedList;
        }
      }
    } catch (err) {
      console.error('Failed to fetch themes:', err);
    }
    return [];
  }, [authFetch, activeTheme]);

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
    const normalized = normalizeGameTheme(data.theme || data);
    setThemes((prev) => prev.map((t) => (t.id === themeId ? normalized : t)));
    if (activeTheme?.id === themeId) {
      setActiveTheme(normalized);
      setActiveThemeState(normalized);
    }
    return normalized;
  };

  const renameTheme = async (themeId: string, newName: string): Promise<GameTheme> => {
    const trimmed = typeof newName === 'string' ? newName.trim() : '';
    const res = await authFetch(`/api/themes/${themeId}/rename`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: trimmed }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to rename theme');
    }

    const data = await res.json();
    const normalized = normalizeGameTheme(data.theme || data);
    setThemes((prev) => prev.map((t) => (t.id === themeId ? normalized : t)));
    if (activeTheme?.id === themeId) {
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

  const fetchSystemThemes = useCallback(
    async (gameId?: string): Promise<GameTheme[]> => {
      const currentToken = localStorage.getItem('app_token');
      if (!currentToken) return [];

      const url = gameId ? `/api/themes/system?gameId=${encodeURIComponent(gameId)}` : '/api/themes/system';
      const res = await authFetch(url);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Failed to load system themes (${res.status})`);
      }

      const data = await res.json();
      if (Array.isArray(data.themes)) {
        return data.themes.map((t: any) => ({
          ...normalizeGameTheme(t),
          is_system: true,
          ownership_type: 'system',
        }));
      }
      return [];
    },
    [authFetch]
  );

  const cloneSystemTheme = async (systemThemeId: string, customName?: string, gameId?: string): Promise<GameTheme> => {
    const res = await authFetch(`/api/themes/clone-system/${systemThemeId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: customName, game_id: gameId }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to clone theme');
    }

    const data = await res.json();
    const normalized = normalizeGameTheme(data.theme);
    setThemes((prev) => [...prev, normalized]);
    return normalized;
  };

  const cloneAllSystemThemes = async (gameId: string): Promise<GameTheme[]> => {
    const res = await authFetch('/api/themes/clone-all-system', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ game_id: gameId }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to clone all system themes');
    }

    const data = await res.json();
    const normalizedList: GameTheme[] = Array.isArray(data.themes)
      ? data.themes.map((t: any) => normalizeGameTheme(t))
      : [];
    setThemes((prev) => [...prev, ...normalizedList]);
    return normalizedList;
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
        try { localStorage.removeItem('durian_app_token'); } catch {}
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

  const applyAuthSession = useCallback(async (data: any) => {
    if (!data.token) return;
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
  }, [authFetch, fetchThemes]);

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
      await applyAuthSession(data);
    } finally {
      setIsLoading(false);
    }
  };

  const loginWithEmail = async (
    email: string,
    password: string
  ): Promise<{ success: boolean; unverified?: boolean; email?: string }> => {
    setIsLoading(true);
    try {
      const res = await apiFetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 403 && data.code === 'EMAIL_NOT_VERIFIED') {
          return { success: false, unverified: true, email: data.email || email };
        }
        throw new Error(data.error || 'Invalid email or password');
      }

      await applyAuthSession(data);
      return { success: true };
    } finally {
      setIsLoading(false);
    }
  };

  const registerWithEmail = async (
    email: string,
    password: string,
    confirmPassword: string
  ): Promise<{ success: boolean; message: string; email: string }> => {
    setIsLoading(true);
    try {
      const res = await apiFetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, confirmPassword }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Registration failed');
      }

      return {
        success: true,
        message: data.message || 'Account created. Please check your email and click the verification link to continue.',
        email: data.email || email,
      };
    } finally {
      setIsLoading(false);
    }
  };

  const resendVerificationEmail = async (
    email: string
  ): Promise<{ success: boolean; message: string; already_verified?: boolean }> => {
    const res = await apiFetch('/api/auth/resend-verification', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || "We couldn't send the verification email. Please try again.");
    }

    return {
      success: true,
      message: data.message || 'Verification email sent. Please check your inbox.',
      already_verified: data.already_verified === true,
    };
  };

  const verifyEmail = async (token: string): Promise<{ success: boolean; message: string }> => {
    setIsLoading(true);
    try {
      const res = await apiFetch('/api/auth/verify-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const error = new Error(data.error || 'Email verification failed');
        (error as any).code = data.code;
        (error as any).email = data.email;
        throw error;
      }

      if (data.token) {
        await applyAuthSession(data);
      }

      return {
        success: true,
        message: data.message || 'Email verified successfully! You can now access your account.',
      };
    } finally {
      setIsLoading(false);
    }
  };

  const requestPasswordReset = async (email: string): Promise<{ success: boolean; message: string }> => {
    const res = await apiFetch('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || 'Failed to request password reset');
    }

    return {
      success: true,
      message: data.message || 'If an account with that email exists, a password reset link has been sent.',
    };
  };

  const resetPassword = async (
    token: string,
    password: string,
    confirmPassword: string
  ): Promise<{ success: boolean; message: string }> => {
    setIsLoading(true);
    try {
      const res = await apiFetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password, confirmPassword }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const error = new Error(data.error || 'Failed to reset password');
        (error as any).code = data.code;
        throw error;
      }

      return {
        success: true,
        message: data.message || 'Password has been reset successfully. Please log in with your new password.',
      };
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    localStorage.removeItem('app_token');
    try { localStorage.removeItem('durian_app_token'); } catch {}
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
      if (data.organizations) {
        setOrganizations(data.organizations);
      }
      await fetchActiveGame();
      await fetchThemes();
    } finally {
      setIsLoading(false);
    }
  };

  const startCreateOrganization = useCallback(() => {
    console.log('[AuthContext] Initiating new organization creation flow');
    if (currentOrganization) {
      setPreviousActiveOrg(currentOrganization);
    }
    setCurrentOrganization(null);
    navigateTo('/create-organization');
  }, [currentOrganization]);

  const cancelCreateOrganization = useCallback(() => {
    console.log('[AuthContext] Cancelling organization creation flow, restoring active organization');
    if (previousActiveOrg) {
      setCurrentOrganization(previousActiveOrg);
    } else if (organizations.length > 0) {
      setCurrentOrganization(organizations[0]);
    }
  }, [previousActiveOrg, organizations]);

  const createOrganization = async (name: string, logoUrl?: string, countryCode?: string): Promise<string> => {
    console.log('[AuthContext] Sending POST /api/organizations request:', {
      name,
      hasLogo: Boolean(logoUrl),
      countryCode,
    });

    const res = await authFetch('/api/organizations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, logo_url: logoUrl, country_code: countryCode }),
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      console.error('[AuthContext] POST /api/organizations failed with status:', res.status, errorData);
      throw new Error(errorData.error || 'Failed to create organization');
    }

    const data = await res.json().catch(() => ({}));
    console.log('[AuthContext] POST /api/organizations response received:', {
      status: res.status,
      hasToken: Boolean(data.token),
      hasOrganization: Boolean(data.organization),
      orgId: data.organization?.id,
    });

    // Validate required API response shape (Requirement 2 & 8)
    if (!data.token || typeof data.token !== 'string') {
      console.error('[AuthContext] Organization creation error: missing or invalid token in response:', data);
      throw new Error('Server returned an invalid response: missing authentication token.');
    }

    if (!data.organization || typeof data.organization !== 'object' || !data.organization.id) {
      console.error('[AuthContext] Organization creation error: missing organization or organization.id in response:', data);
      throw new Error('Server returned an invalid response: missing organization information.');
    }

    // Save token and update state immediately (Requirement 3)
    console.log('[AuthContext] Organization creation success. Updating token and currentOrganization:', {
      id: data.organization.id,
      name: data.organization.name,
      country_code: data.organization.country_code,
    });

    localStorage.setItem('app_token', data.token);
    setToken(data.token);
    setCurrentOrganization(data.organization);
    setOrganizations((prev) => {
      const exists = prev.some((o) => o.id === data.organization.id);
      return exists ? prev.map((o) => (o.id === data.organization.id ? data.organization : o)) : [...prev, data.organization];
    });

    // Post-creation secondary initialization (Requirement 4: Non-blocking)
    try {
      await fetchActiveGame();
    } catch (gameErr) {
      console.error('[AuthContext] Post-creation fetchActiveGame failed (non-blocking):', gameErr);
    }

    try {
      await fetchThemes();
    } catch (themesErr) {
      console.error('[AuthContext] Post-creation fetchThemes failed (non-blocking):', themesErr);
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('wallet_updated'));
    }

    return data.organization.id;
  };

  const updateOrganizationCountry = async (countryCode: string): Promise<void> => {
    if (!currentOrganization) throw new Error('No active organization');
    const res = await authFetch(`/api/organizations/${currentOrganization.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ country_code: countryCode }),
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new Error(errorData.error || 'Failed to update organization country');
    }

    const data = await res.json();
    const updated = {
      ...currentOrganization,
      country_code: data.organization.country_code || countryCode,
    };
    setCurrentOrganization(updated);
    setOrganizations((prev) =>
      prev.map((o) => (o.id === updated.id ? { ...o, country_code: updated.country_code } : o))
    );
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

  const updateUserProfile = async (data: { name?: string; avatar_url?: string | null }): Promise<User> => {
    const res = await authFetch('/api/auth/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to update profile');
    }

    const resData = await res.json();
    setCurrentUser(resData.user);
    return resData.user;
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
        loginWithEmail,
        registerWithEmail,
        resendVerificationEmail,
        verifyEmail,
        requestPasswordReset,
        resetPassword,
        logout,
        switchOrganization,
        createOrganization,
        startCreateOrganization,
        cancelCreateOrganization,
        updateOrganizationCountry,
        refreshSession,
        fetchActiveGame,
        fetchThemes,
        fetchSystemThemes,
        createTheme,
        updateTheme,
        renameTheme,
        deleteTheme,
        duplicateTheme,
        cloneSystemTheme,
        cloneAllSystemThemes,
        updateGameCustomization,
        uploadAsset,
        updateUserProfile,
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

