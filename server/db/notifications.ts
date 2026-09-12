import { getSupabaseServerClient, isLocalFallbackAllowed, isSupabaseConfigured } from '../supabase.js';
import {
  NotificationRecord,
  NotificationType,
  NotificationCategory,
  NotificationPriority,
  NOTIFICATION_CATALOG,
  renderNotificationContent,
} from '../notifications/types.js';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const uploadsDir = path.join(process.cwd(), 'uploads');
const LOCAL_NOTIFICATIONS_FILE = path.join(uploadsDir, 'notifications.json');

function ensureUploadsDir() {
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
}

function readLocalNotifications(): NotificationRecord[] {
  try {
    if (!isLocalFallbackAllowed()) return [];
    ensureUploadsDir();
    if (!fs.existsSync(LOCAL_NOTIFICATIONS_FILE)) {
      return [];
    }
    const data = fs.readFileSync(LOCAL_NOTIFICATIONS_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (err) {
    console.error('Error reading local notifications fallback:', err);
    return [];
  }
}

function writeLocalNotifications(notifications: NotificationRecord[]) {
  try {
    if (!isLocalFallbackAllowed()) return;
    ensureUploadsDir();
    fs.writeFileSync(LOCAL_NOTIFICATIONS_FILE, JSON.stringify(notifications, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error writing local notifications fallback:', err);
  }
}

export interface CreateNotificationParams {
  recipientUserId: string;
  organizationId?: string | null;
  type: NotificationType;
  title?: string;
  message?: string;
  priority?: NotificationPriority;
  actionUrl?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  metadata?: Record<string, any>;
  deduplicationKey?: string | null;
  expiresAt?: string | null;
}

export interface ListNotificationsParams {
  userId: string;
  organizationId?: string | null;
  unreadOnly?: boolean;
  category?: NotificationCategory;
  limit?: number;
  offset?: number;
}

/**
 * Creates and stores a notification record with deduplication and catalog validation.
 */
export async function createNotification(
  params: CreateNotificationParams,
  env?: Record<string, any>
): Promise<NotificationRecord> {
  const {
    recipientUserId,
    organizationId = null,
    type,
    title: customTitle,
    message: customMessage,
    priority: customPriority,
    actionUrl: customActionUrl,
    entityType = null,
    entityId = null,
    metadata = {},
    deduplicationKey = null,
    expiresAt = null,
  } = params;

  if (!recipientUserId) {
    throw new Error('recipientUserId is required to create a notification');
  }

  const catalogItem = NOTIFICATION_CATALOG[type];
  const rendered = renderNotificationContent(
    type,
    metadata,
    customTitle,
    customMessage,
    customActionUrl || undefined
  );

  const finalPriority = customPriority || rendered.priority;
  const finalCategory = rendered.category;

  // Calculate default expiration date if none specified
  let finalExpiresAt = expiresAt;
  if (!finalExpiresAt && catalogItem?.retentionDays) {
    const d = new Date();
    d.setDate(d.getDate() + catalogItem.retentionDays);
    finalExpiresAt = d.toISOString();
  }

  // 1. Check deduplication in database or local fallback
  if (deduplicationKey) {
    const existing = await getNotificationByDeduplicationKey(
      recipientUserId,
      deduplicationKey,
      env
    );
    if (existing) {
      // If duplicates are not allowed, return existing record idempotently
      if (!catalogItem || !catalogItem.duplicatesAllowed) {
        return existing;
      }
    }
  }

  const notificationId = crypto.randomUUID();
  const now = new Date().toISOString();

  const newRecord: NotificationRecord = {
    id: notificationId,
    recipient_user_id: recipientUserId,
    organization_id: organizationId,
    type,
    category: finalCategory,
    title: rendered.title,
    message: rendered.message,
    priority: finalPriority,
    action_url: rendered.actionUrl || null,
    entity_type: entityType,
    entity_id: entityId,
    metadata,
    is_read: false,
    read_at: null,
    deduplication_key: deduplicationKey,
    created_at: now,
    expires_at: finalExpiresAt,
  };

  const supabase = getSupabaseServerClient(env);
  if (isSupabaseConfigured(env)) {
    try {
      const { data, error } = await supabase
        .from('notifications')
        .insert({
          id: newRecord.id,
          recipient_user_id: newRecord.recipient_user_id,
          organization_id: newRecord.organization_id,
          type: newRecord.type,
          category: newRecord.category,
          title: newRecord.title,
          message: newRecord.message,
          priority: newRecord.priority,
          action_url: newRecord.action_url,
          entity_type: newRecord.entity_type,
          entity_id: newRecord.entity_id,
          metadata: newRecord.metadata,
          is_read: false,
          read_at: null,
          deduplication_key: newRecord.deduplication_key,
          created_at: newRecord.created_at,
          expires_at: newRecord.expires_at,
        })
        .select('*')
        .single();

      if (error) {
        // If unique constraint conflict on deduplication_key, retrieve existing
        if (error.code === '23505' && deduplicationKey) {
          const existing = await getNotificationByDeduplicationKey(recipientUserId, deduplicationKey, env);
          if (existing) return existing;
        }

        console.error('Error inserting notification into Supabase:', error);
        if (!isLocalFallbackAllowed(env)) {
          throw new Error(`Failed to create notification in database: ${error.message}`);
        }
      } else if (data) {
        // Also keep local fallback updated if active
        if (isLocalFallbackAllowed(env)) {
          const locals = readLocalNotifications();
          locals.unshift(data as NotificationRecord);
          writeLocalNotifications(locals.slice(0, 500));
        }
        return data as NotificationRecord;
      }
    } catch (dbErr: any) {
      console.error('Supabase notification insertion exception:', dbErr);
      if (!isLocalFallbackAllowed(env)) {
        throw dbErr;
      }
    }
  }

  // Local fallback storage
  if (isLocalFallbackAllowed(env)) {
    const locals = readLocalNotifications();
    locals.unshift(newRecord);
    writeLocalNotifications(locals.slice(0, 500));
    return newRecord;
  }

  throw new Error('Notification storage is unavailable');
}

/**
 * Find notification by deduplication key for a specific recipient user.
 */
export async function getNotificationByDeduplicationKey(
  recipientUserId: string,
  deduplicationKey: string,
  env?: Record<string, any>
): Promise<NotificationRecord | null> {
  const supabase = getSupabaseServerClient(env);
  if (isSupabaseConfigured(env)) {
    try {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('recipient_user_id', recipientUserId)
        .eq('deduplication_key', deduplicationKey)
        .maybeSingle();

      if (!error && data) {
        return data as NotificationRecord;
      }
    } catch (err) {
      console.error('Error looking up notification by deduplication key in DB:', err);
    }
  }

  if (isLocalFallbackAllowed(env)) {
    const locals = readLocalNotifications();
    const found = locals.find(
      (n) => n.recipient_user_id === recipientUserId && n.deduplication_key === deduplicationKey
    );
    return found || null;
  }

  return null;
}

/**
 * List notifications for a user with optional organization, category, unread filters, and pagination.
 */
export async function listNotifications(
  params: ListNotificationsParams,
  env?: Record<string, any>
): Promise<{ notifications: NotificationRecord[]; total: number; unread_count: number }> {
  const {
    userId,
    organizationId,
    unreadOnly = false,
    category,
    limit = 20,
    offset = 0,
  } = params;

  const supabase = getSupabaseServerClient(env);
  if (isSupabaseConfigured(env)) {
    try {
      // 1. Get total unread count for badge
      let unreadQuery = supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('recipient_user_id', userId)
        .eq('is_read', false);

      if (organizationId) {
        unreadQuery = unreadQuery.or(`organization_id.eq.${organizationId},organization_id.is.null`);
      }

      const { count: unreadCount } = await unreadQuery;

      // 2. Query notifications list
      let query = supabase
        .from('notifications')
        .select('*', { count: 'exact' })
        .eq('recipient_user_id', userId);

      if (organizationId) {
        query = query.or(`organization_id.eq.${organizationId},organization_id.is.null`);
      }

      if (unreadOnly) {
        query = query.eq('is_read', false);
      }

      if (category) {
        query = query.eq('category', category);
      }

      query = query
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      const { data, count, error } = await query;

      if (!error && data) {
        return {
          notifications: data as NotificationRecord[],
          total: count ?? data.length,
          unread_count: unreadCount ?? 0,
        };
      }

      if (error && !isLocalFallbackAllowed(env)) {
        console.error('Error fetching notifications from Supabase:', error);
        throw new Error(`Failed to list notifications: ${error.message}`);
      }
    } catch (err: any) {
      console.error('Supabase listNotifications exception:', err);
      if (!isLocalFallbackAllowed(env)) throw err;
    }
  }

  // Local fallback
  if (isLocalFallbackAllowed(env)) {
    let locals = readLocalNotifications().filter((n) => n.recipient_user_id === userId);

    if (organizationId) {
      locals = locals.filter((n) => !n.organization_id || n.organization_id === organizationId);
    }

    const unreadCount = locals.filter((n) => !n.is_read).length;

    if (unreadOnly) {
      locals = locals.filter((n) => !n.is_read);
    }

    if (category) {
      locals = locals.filter((n) => n.category === category);
    }

    locals.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    const total = locals.length;
    const paginated = locals.slice(offset, offset + limit);

    return {
      notifications: paginated,
      total,
      unread_count: unreadCount,
    };
  }

  return { notifications: [], total: 0, unread_count: 0 };
}

/**
 * Gets count of unread notifications for a user.
 */
export async function getUnreadNotificationCount(
  userId: string,
  organizationId?: string | null,
  env?: Record<string, any>
): Promise<number> {
  const supabase = getSupabaseServerClient(env);
  if (isSupabaseConfigured(env)) {
    try {
      let query = supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('recipient_user_id', userId)
        .eq('is_read', false);

      if (organizationId) {
        query = query.or(`organization_id.eq.${organizationId},organization_id.is.null`);
      }

      const { count, error } = await query;
      if (!error && typeof count === 'number') {
        return count;
      }
    } catch (err) {
      console.error('Error counting unread notifications in DB:', err);
    }
  }

  if (isLocalFallbackAllowed(env)) {
    const locals = readLocalNotifications().filter(
      (n) =>
        n.recipient_user_id === userId &&
        !n.is_read &&
        (!organizationId || !n.organization_id || n.organization_id === organizationId)
    );
    return locals.length;
  }

  return 0;
}

/**
 * Mark a single notification as read by its recipient.
 */
export async function markNotificationAsRead(
  notificationId: string,
  userId: string,
  env?: Record<string, any>
): Promise<NotificationRecord | null> {
  const now = new Date().toISOString();
  const supabase = getSupabaseServerClient(env);

  if (isSupabaseConfigured(env)) {
    try {
      const { data, error } = await supabase
        .from('notifications')
        .update({
          is_read: true,
          read_at: now,
        })
        .eq('id', notificationId)
        .eq('recipient_user_id', userId)
        .select('*')
        .maybeSingle();

      if (!error && data) {
        // Also update local fallback if present
        if (isLocalFallbackAllowed(env)) {
          const locals = readLocalNotifications();
          const idx = locals.findIndex((n) => n.id === notificationId && n.recipient_user_id === userId);
          if (idx !== -1) {
            locals[idx].is_read = true;
            locals[idx].read_at = now;
            writeLocalNotifications(locals);
          }
        }
        return data as NotificationRecord;
      }
    } catch (err) {
      console.error('Error marking notification as read in DB:', err);
    }
  }

  if (isLocalFallbackAllowed(env)) {
    const locals = readLocalNotifications();
    const idx = locals.findIndex((n) => n.id === notificationId && n.recipient_user_id === userId);
    if (idx !== -1) {
      locals[idx].is_read = true;
      locals[idx].read_at = now;
      writeLocalNotifications(locals);
      return locals[idx];
    }
  }

  return null;
}

/**
 * Mark all notifications for a user (and optional organization) as read.
 */
export async function markAllNotificationsAsRead(
  userId: string,
  organizationId?: string | null,
  env?: Record<string, any>
): Promise<{ marked_count: number }> {
  const now = new Date().toISOString();
  const supabase = getSupabaseServerClient(env);

  if (isSupabaseConfigured(env)) {
    try {
      let query = supabase
        .from('notifications')
        .update({
          is_read: true,
          read_at: now,
        })
        .eq('recipient_user_id', userId)
        .eq('is_read', false);

      if (organizationId) {
        query = query.or(`organization_id.eq.${organizationId},organization_id.is.null`);
      }

      const { data, error } = await query.select('id');

      if (!error && data) {
        if (isLocalFallbackAllowed(env)) {
          const locals = readLocalNotifications();
          let count = 0;
          locals.forEach((n) => {
            if (
              n.recipient_user_id === userId &&
              !n.is_read &&
              (!organizationId || !n.organization_id || n.organization_id === organizationId)
            ) {
              n.is_read = true;
              n.read_at = now;
              count++;
            }
          });
          writeLocalNotifications(locals);
        }
        return { marked_count: data.length };
      }
    } catch (err) {
      console.error('Error marking all notifications as read in DB:', err);
    }
  }

  if (isLocalFallbackAllowed(env)) {
    const locals = readLocalNotifications();
    let markedCount = 0;
    locals.forEach((n) => {
      if (
        n.recipient_user_id === userId &&
        !n.is_read &&
        (!organizationId || !n.organization_id || n.organization_id === organizationId)
      ) {
        n.is_read = true;
        n.read_at = now;
        markedCount++;
      }
    });
    writeLocalNotifications(locals);
    return { marked_count: markedCount };
  }

  return { marked_count: 0 };
}

/**
 * Dismiss or delete a notification record.
 */
export async function deleteNotification(
  notificationId: string,
  userId: string,
  env?: Record<string, any>
): Promise<boolean> {
  const supabase = getSupabaseServerClient(env);

  if (isSupabaseConfigured(env)) {
    try {
      const { error } = await supabase
        .from('notifications')
        .delete()
        .eq('id', notificationId)
        .eq('recipient_user_id', userId);

      if (!error) {
        if (isLocalFallbackAllowed(env)) {
          const locals = readLocalNotifications().filter(
            (n) => !(n.id === notificationId && n.recipient_user_id === userId)
          );
          writeLocalNotifications(locals);
        }
        return true;
      }
    } catch (err) {
      console.error('Error deleting notification from DB:', err);
    }
  }

  if (isLocalFallbackAllowed(env)) {
    const locals = readLocalNotifications().filter(
      (n) => !(n.id === notificationId && n.recipient_user_id === userId)
    );
    writeLocalNotifications(locals);
    return true;
  }

  return false;
}

/**
 * Cleans up expired notifications past their retention window.
 */
export async function cleanupExpiredNotifications(env?: Record<string, any>): Promise<number> {
  const now = new Date().toISOString();
  const supabase = getSupabaseServerClient(env);

  if (isSupabaseConfigured(env)) {
    try {
      const { data, error } = await supabase
        .from('notifications')
        .delete()
        .lt('expires_at', now)
        .select('id');

      if (!error && data) {
        return data.length;
      }
    } catch (err) {
      console.error('Error cleaning up expired notifications in DB:', err);
    }
  }

  if (isLocalFallbackAllowed(env)) {
    const locals = readLocalNotifications();
    const remaining = locals.filter((n) => !n.expires_at || n.expires_at >= now);
    const deletedCount = locals.length - remaining.length;
    writeLocalNotifications(remaining);
    return deletedCount;
  }

  return 0;
}
