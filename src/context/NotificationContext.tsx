import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from './AuthContext';
import { apiFetch } from '../lib/api';
import { getSupabaseClient } from '../lib/supabase';
import { NotificationRecord, NotificationCategory } from '../lib/notifications/types';

export interface NotificationContextType {
  notifications: NotificationRecord[];
  unreadCount: number;
  loading: boolean;
  isOpenCenter: boolean;
  setIsOpenCenter: (open: boolean) => void;
  selectedCategory: NotificationCategory | 'all';
  setSelectedCategory: (cat: NotificationCategory | 'all') => void;
  unreadOnlyFilter: boolean;
  setUnreadOnlyFilter: (unreadOnly: boolean) => void;
  fetchNotifications: (options?: {
    unreadOnly?: boolean;
    category?: NotificationCategory | 'all';
    limit?: number;
    offset?: number;
  }) => Promise<void>;
  refreshUnreadCount: () => Promise<void>;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  deleteNotification: (id: string) => Promise<void>;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentUser, currentOrganization, isAuthenticated } = useAuth();

  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(false);
  const [isOpenCenter, setIsOpenCenter] = useState<boolean>(false);
  const [selectedCategory, setSelectedCategory] = useState<NotificationCategory | 'all'>('all');
  const [unreadOnlyFilter, setUnreadOnlyFilter] = useState<boolean>(false);

  const isMountedRef = useRef<boolean>(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Fetch unread count for badge
  const refreshUnreadCount = useCallback(async () => {
    if (!isAuthenticated || !currentUser) {
      setUnreadCount(0);
      return;
    }

    try {
      const orgParam = currentOrganization?.id ? `?organizationId=${encodeURIComponent(currentOrganization.id)}` : '';
      const res = await apiFetch(`/api/notifications/unread-count${orgParam}`);
      if (res.ok) {
        const data = await res.json();
        if (isMountedRef.current && typeof data.unread_count === 'number') {
          setUnreadCount(data.unread_count);
        }
      }
    } catch (err) {
      console.error('[NotificationContext] Failed to fetch unread count:', err);
    }
  }, [isAuthenticated, currentUser, currentOrganization?.id]);

  // Fetch notifications list
  const fetchNotifications = useCallback(
    async (options?: {
      unreadOnly?: boolean;
      category?: NotificationCategory | 'all';
      limit?: number;
      offset?: number;
    }) => {
      if (!isAuthenticated || !currentUser) {
        setNotifications([]);
        return;
      }

      setLoading(true);
      try {
        const unread = options?.unreadOnly ?? unreadOnlyFilter;
        const cat = options?.category ?? selectedCategory;
        const limit = options?.limit ?? 40;
        const offset = options?.offset ?? 0;

        const params = new URLSearchParams();
        if (currentOrganization?.id) {
          params.set('organizationId', currentOrganization.id);
        }
        if (unread) {
          params.set('unreadOnly', 'true');
        }
        if (cat && cat !== 'all') {
          params.set('category', cat);
        }
        params.set('limit', String(limit));
        params.set('offset', String(offset));

        const res = await apiFetch(`/api/notifications?${params.toString()}`);
        if (res.ok) {
          const data = await res.json();
          if (isMountedRef.current) {
            setNotifications(data.notifications || []);
            if (typeof data.unread_count === 'number') {
              setUnreadCount(data.unread_count);
            }
          }
        }
      } catch (err) {
        console.error('[NotificationContext] Failed to fetch notifications:', err);
      } finally {
        if (isMountedRef.current) {
          setLoading(false);
        }
      }
    },
    [isAuthenticated, currentUser, currentOrganization?.id, unreadOnlyFilter, selectedCategory]
  );

  // Mark a single notification as read
  const markAsRead = useCallback(
    async (id: string) => {
      // Optimistic update
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, is_read: true, read_at: new Date().toISOString() } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));

      try {
        await apiFetch(`/api/notifications/${id}/read`, { method: 'PATCH' });
      } catch (err) {
        console.error('[NotificationContext] Failed to mark notification read:', err);
      }
    },
    []
  );

  // Mark all notifications as read
  const markAllAsRead = useCallback(async () => {
    // Optimistic update
    setNotifications((prev) =>
      prev.map((n) => ({ ...n, is_read: true, read_at: new Date().toISOString() }))
    );
    setUnreadCount(0);

    try {
      await apiFetch('/api/notifications/mark-all-read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(currentOrganization?.id ? { organizationId: currentOrganization.id } : {}),
      });
    } catch (err) {
      console.error('[NotificationContext] Failed to mark all read:', err);
    }
  }, [currentOrganization?.id]);

  // Delete notification
  const deleteNotification = useCallback(async (id: string) => {
    // Optimistic update
    setNotifications((prev) => {
      const target = prev.find((n) => n.id === id);
      if (target && !target.is_read) {
        setUnreadCount((c) => Math.max(0, c - 1));
      }
      return prev.filter((n) => n.id !== id);
    });

    try {
      await apiFetch(`/api/notifications/${id}`, { method: 'DELETE' });
    } catch (err) {
      console.error('[NotificationContext] Failed to delete notification:', err);
    }
  }, []);

  // Initial load and periodic unread check
  useEffect(() => {
    if (!isAuthenticated || !currentUser) {
      setNotifications([]);
      setUnreadCount(0);
      return;
    }

    refreshUnreadCount();
    fetchNotifications();

    // Periodic polling every 30 seconds
    const interval = setInterval(() => {
      refreshUnreadCount();
    }, 30000);

    // Refresh on window focus
    const handleFocus = () => {
      refreshUnreadCount();
    };
    window.addEventListener('focus', handleFocus);

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', handleFocus);
    };
  }, [isAuthenticated, currentUser?.id, currentOrganization?.id, refreshUnreadCount, fetchNotifications]);

  // Supabase Realtime Subscription
  useEffect(() => {
    if (!isAuthenticated || !currentUser) return;

    const supabase = getSupabaseClient();
    if (!supabase) return;

    try {
      const channel = supabase
        .channel(`user-notifications-${currentUser.id}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'notifications',
            filter: `recipient_user_id=eq.${currentUser.id}`,
          },
          () => {
            // Realtime event triggered in database
            refreshUnreadCount();
            fetchNotifications();
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    } catch (err) {
      console.warn('[NotificationContext] Supabase realtime subscription unavailable:', err);
    }
  }, [isAuthenticated, currentUser?.id, refreshUnreadCount, fetchNotifications]);

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        loading,
        isOpenCenter,
        setIsOpenCenter,
        selectedCategory,
        setSelectedCategory,
        unreadOnlyFilter,
        setUnreadOnlyFilter,
        fetchNotifications,
        refreshUnreadCount,
        markAsRead,
        markAllAsRead,
        deleteNotification,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotifications = (): NotificationContextType => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
};
