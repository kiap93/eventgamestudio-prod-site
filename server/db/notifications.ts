import { getSupabaseServerClient, isLocalFallbackAllowed, isSupabaseConfigured } from '../supabase.js';
import {
  NotificationRecord,
  NotificationType,
  NotificationCategory,
  NotificationPriority,
  NOTIFICATION_CATALOG,
  calculateNotificationExpiry,
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

function readLocalNotifications(env?: Record<string, any>): NotificationRecord[] {
  try {
    if (!isLocalFallbackAllowed(env)) return [];
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

function writeLocalNotifications(notifications: NotificationRecord[], env?: Record<string, any>) {
  try {
    if (!isLocalFallbackAllowed(env)) return;
    ensureUploadsDir();
    fs.writeFileSync(LOCAL_NOTIFICATIONS_FILE, JSON.stringify(notifications, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error writing local notifications fallback:', err);
  }
}

export interface CreateNotificationParams {
  recipientUserId?: string;
  recipient_user_id?: string;
  organizationId?: string | null;
  organization_id?: string | null;
  type: NotificationType;
  category?: NotificationCategory;
  title?: string;
  message?: string;
  priority?: NotificationPriority;
  actionUrl?: string | null;
  action_url?: string | null;
  entityType?: string | null;
  entity_type?: string | null;
  entityId?: string | null;
  entity_id?: string | null;
  metadata?: Record<string, any>;
  deduplicationKey?: string | null;
  deduplication_key?: string | null;
  expiresAt?: string | null;
  expires_at?: string | null;
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
  const recipientUserId = params.recipientUserId || params.recipient_user_id;
  const organizationId = params.organizationId !== undefined ? params.organizationId : (params.organization_id || null);
  const type = params.type;
  const customTitle = params.title;
  const customMessage = params.message;
  const customPriority = params.priority;
  const customActionUrl = params.actionUrl !== undefined ? params.actionUrl : params.action_url;
  const entityType = params.entityType !== undefined ? params.entityType : (params.entity_type || null);
  const entityId = params.entityId !== undefined ? params.entityId : (params.entity_id || null);
  const metadata = params.metadata || {};
  const deduplicationKey = params.deduplicationKey !== undefined ? params.deduplicationKey : (params.deduplication_key || null);
  const expiresAt = params.expiresAt !== undefined ? params.expiresAt : (params.expires_at || null);

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

  // Authoritative catalog-driven expiry calculation
  // Strictly decoupled from retention: only items with expiresByDefault: true expire automatically.
  const finalExpiresAt = calculateNotificationExpiry(type, new Date(), expiresAt);

  // 1. Application-level fast check (performance optimization)
  if (deduplicationKey) {
    const existing = await getNotificationByDeduplicationKey(
      recipientUserId,
      deduplicationKey,
      env
    );
    if (existing) {
      // Deduplication key exists - return existing record idempotently marked as not newly inserted
      return { ...existing, is_inserted: false };
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

  if (isSupabaseConfigured(env)) {
    const supabase = getSupabaseServerClient(env);
    try {
      // 1. Attempt atomic stored procedure with database-level ON CONFLICT DO NOTHING
      const { data: rpcData, error: rpcError } = await supabase.rpc(
        'insert_notification_idempotent',
        {
          p_id: newRecord.id,
          p_recipient_user_id: newRecord.recipient_user_id,
          p_organization_id: newRecord.organization_id,
          p_type: newRecord.type,
          p_category: newRecord.category,
          p_title: newRecord.title,
          p_message: newRecord.message,
          p_priority: newRecord.priority,
          p_action_url: newRecord.action_url,
          p_entity_type: newRecord.entity_type,
          p_entity_id: newRecord.entity_id,
          p_metadata: newRecord.metadata,
          p_deduplication_key: newRecord.deduplication_key,
          p_created_at: newRecord.created_at,
          p_expires_at: newRecord.expires_at,
        }
      );

      if (!rpcError && rpcData) {
        const row = Array.isArray(rpcData) ? rpcData[0] : rpcData;
        if (row) {
          const record: NotificationRecord = {
            id: row.id,
            recipient_user_id: row.recipient_user_id,
            organization_id: row.organization_id,
            type: row.type,
            category: row.category,
            title: row.title,
            message: row.message,
            priority: row.priority,
            action_url: row.action_url,
            entity_type: row.entity_type,
            entity_id: row.entity_id,
            metadata: row.metadata,
            is_read: row.is_read,
            read_at: row.read_at,
            deduplication_key: row.deduplication_key,
            created_at: row.created_at,
            expires_at: row.expires_at,
            is_inserted: row.is_inserted ?? true,
          };
          if (isLocalFallbackAllowed(env) && record.is_inserted !== false) {
            const locals = readLocalNotifications(env);
            locals.unshift(record);
            writeLocalNotifications(locals.slice(0, 500), env);
          }
          return record;
        }
      }

      // 2. Direct table insert fallback with ON CONFLICT (recipient_user_id, deduplication_key) DO NOTHING
      const insertOptions = deduplicationKey
        ? { onConflict: 'recipient_user_id, deduplication_key', ignoreDuplicates: true }
        : undefined;

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
        }, insertOptions)
        .select('*')
        .maybeSingle();

      if (error) {
        // If unique constraint conflict (code 23505) occurs on deduplication_key, retrieve existing
        if (error.code === '23505' && deduplicationKey) {
          const existing = await getNotificationByDeduplicationKey(recipientUserId, deduplicationKey, env);
          if (existing) return { ...existing, is_inserted: false };
        }

        console.error('Error inserting notification into Supabase:', error);
        if (!isLocalFallbackAllowed(env)) {
          throw new Error(`Failed to create notification in database: ${error.message}`);
        }
      } else if (data) {
        const record: NotificationRecord = { ...(data as NotificationRecord), is_inserted: true };
        if (isLocalFallbackAllowed(env)) {
          const locals = readLocalNotifications(env);
          locals.unshift(record);
          writeLocalNotifications(locals.slice(0, 500), env);
        }
        return record;
      } else if (deduplicationKey) {
        // When ignoreDuplicates suppresses a conflict, PostgREST returns null data
        const existing = await getNotificationByDeduplicationKey(recipientUserId, deduplicationKey, env);
        if (existing) {
          return { ...existing, is_inserted: false };
        }
      }
    } catch (dbErr: any) {
      console.error('Supabase notification insertion exception:', dbErr);
      if (!isLocalFallbackAllowed(env)) {
        throw dbErr;
      }
    }
  }

  // Local fallback storage with atomic deduplication check
  if (isLocalFallbackAllowed(env)) {
    const locals = readLocalNotifications(env);
    if (deduplicationKey) {
      const existing = locals.find(
        (n) => n.recipient_user_id === recipientUserId && n.deduplication_key === deduplicationKey
      );
      if (existing) {
        return { ...existing, is_inserted: false };
      }
    }
    const record: NotificationRecord = { ...newRecord, is_inserted: true };
    locals.unshift(record);
    writeLocalNotifications(locals.slice(0, 500), env);
    return record;
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
  if (isSupabaseConfigured(env)) {
    const supabase = getSupabaseServerClient(env);
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
    const locals = readLocalNotifications(env);
    const found = locals.find(
      (n) => n.recipient_user_id === recipientUserId && n.deduplication_key === deduplicationKey
    );
    return found || null;
  }

  return null;
}

/**
 * List notifications for a user with optional organization, category, unread filters, and pagination.
 * Automatically filters out expired notifications (expires_at IS NULL OR expires_at > NOW()).
 */
export async function listNotifications(
  params: ListNotificationsParams,
  env?: Record<string, any>
): Promise<{ notifications: NotificationRecord[]; total: number; unread_count: number }> {
  const {
    userId,
    organizationId: rawOrganizationId,
    unreadOnly = false,
    category,
    limit = 20,
    offset = 0,
  } = params;

  if (!userId || typeof userId !== 'string' || !userId.trim()) {
    return { notifications: [], total: 0, unread_count: 0 };
  }

  // Sanitize organizationId against string literals like 'undefined' or 'null'
  const organizationId =
    rawOrganizationId &&
    rawOrganizationId !== 'undefined' &&
    rawOrganizationId !== 'null' &&
    rawOrganizationId.trim() !== ''
      ? rawOrganizationId.trim()
      : undefined;

  const isValidUUID = (val?: string | null): boolean =>
    typeof val === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);

  const nowIso = new Date().toISOString();
  const nowTime = Date.now();

  if (isSupabaseConfigured(env)) {
    const supabase = getSupabaseServerClient(env);
    // Only query Supabase when userId is a valid UUID because recipient_user_id is type UUID in Postgres
    if (isValidUUID(userId)) {
      try {
        // 1. Get total unread count for badge (strictly active notifications)
        let unreadCount = 0;
        try {
          let unreadQuery = supabase
            .from('notifications')
            .select('id', { count: 'exact', head: true })
            .eq('recipient_user_id', userId)
            .eq('is_read', false)
            .or(`expires_at.is.null,expires_at.gt.${nowIso}`);

          if (organizationId && isValidUUID(organizationId)) {
            unreadQuery = unreadQuery.or(`organization_id.eq.${organizationId},organization_id.is.null`);
          }

          const { count: uCount, error: unreadErr } = await unreadQuery;
          if (!unreadErr && typeof uCount === 'number') {
            unreadCount = uCount;
          }
        } catch (uErr) {
          console.warn('[Notifications] Notice fetching unread count from Supabase:', uErr);
        }

        // 2. Query notifications list (strictly active notifications)
        let query = supabase
          .from('notifications')
          .select('*', { count: 'exact' })
          .eq('recipient_user_id', userId)
          .or(`expires_at.is.null,expires_at.gt.${nowIso}`);

        if (organizationId && isValidUUID(organizationId)) {
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
            unread_count: unreadCount,
          };
        }

        if (error) {
          console.warn('[Notifications] Notice fetching notifications from Supabase:', error.message);
        }
      } catch (err: any) {
        console.warn('[Notifications] Supabase listNotifications exception:', err?.message || err);
      }
    }
  }

  // Local fallback
  if (isLocalFallbackAllowed(env)) {
    try {
      // Filter by recipient and strictly active (not expired)
      let locals = readLocalNotifications(env).filter(
        (n) => n.recipient_user_id === userId && (!n.expires_at || new Date(n.expires_at).getTime() > nowTime)
      );

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

      locals.sort((a, b) => {
        const timeA = a.created_at ? new Date(a.created_at).getTime() : 0;
        const timeB = b.created_at ? new Date(b.created_at).getTime() : 0;
        return timeB - timeA;
      });

      const total = locals.length;
      const paginated = locals.slice(offset, offset + limit);

      return {
        notifications: paginated,
        total,
        unread_count: unreadCount,
      };
    } catch (localErr) {
      console.warn('[Notifications] Error in local notifications fallback:', localErr);
    }
  }

  return { notifications: [], total: 0, unread_count: 0 };
}

/**
 * Gets count of unread notifications for a user (strictly active notifications: expires_at IS NULL OR expires_at > NOW()).
 */
export async function getUnreadNotificationCount(
  userId: string,
  rawOrganizationId?: string | null,
  env?: Record<string, any>
): Promise<number> {
  if (!userId || typeof userId !== 'string' || !userId.trim()) {
    return 0;
  }

  const organizationId =
    rawOrganizationId &&
    rawOrganizationId !== 'undefined' &&
    rawOrganizationId !== 'null' &&
    rawOrganizationId.trim() !== ''
      ? rawOrganizationId.trim()
      : undefined;

  const isValidUUID = (val?: string | null): boolean =>
    typeof val === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);

  const nowIso = new Date().toISOString();
  const nowTime = Date.now();

  if (isSupabaseConfigured(env)) {
    const supabase = getSupabaseServerClient(env);
    if (isValidUUID(userId)) {
      try {
        let query = supabase
          .from('notifications')
          .select('id', { count: 'exact', head: true })
          .eq('recipient_user_id', userId)
          .eq('is_read', false)
          .or(`expires_at.is.null,expires_at.gt.${nowIso}`);

        if (organizationId && isValidUUID(organizationId)) {
          query = query.or(`organization_id.eq.${organizationId},organization_id.is.null`);
        }

        const { count, error } = await query;
        if (!error && typeof count === 'number') {
          return count;
        }
      } catch (err) {
        console.warn('[Notifications] Error counting unread notifications in DB:', err);
      }
    }
  }

  if (isLocalFallbackAllowed(env)) {
    try {
      const locals = readLocalNotifications(env).filter(
        (n) =>
          n.recipient_user_id === userId &&
          !n.is_read &&
          (!n.expires_at || new Date(n.expires_at).getTime() > nowTime) &&
          (!organizationId || !n.organization_id || n.organization_id === organizationId)
      );
      return locals.length;
    } catch (localErr) {
      console.warn('[Notifications] Error in local unread count fallback:', localErr);
    }
  }

  return 0;
}

/**
 * Mark a single notification as read by its recipient.
 * Only active notifications (expires_at IS NULL OR expires_at > NOW()) can be marked as read.
 */
export async function markNotificationAsRead(
  notificationId: string,
  userId: string,
  env?: Record<string, any>
): Promise<NotificationRecord | null> {
  if (!notificationId || !userId) return null;

  const isValidUUID = (val?: string | null): boolean =>
    typeof val === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);

  const now = new Date().toISOString();
  const nowTime = Date.now();

  if (isSupabaseConfigured(env)) {
    const supabase = getSupabaseServerClient(env);
    if (isValidUUID(notificationId) && isValidUUID(userId)) {
      try {
        const { data, error } = await supabase
          .from('notifications')
          .update({
            is_read: true,
            read_at: now,
          })
          .eq('id', notificationId)
          .eq('recipient_user_id', userId)
          .or(`expires_at.is.null,expires_at.gt.${now}`)
          .select('*')
          .maybeSingle();

        if (!error && data) {
          // Also update local fallback if present
          if (isLocalFallbackAllowed(env)) {
            const locals = readLocalNotifications(env);
            const idx = locals.findIndex(
              (n) =>
                n.id === notificationId &&
                n.recipient_user_id === userId &&
                (!n.expires_at || new Date(n.expires_at).getTime() > nowTime)
            );
            if (idx !== -1) {
              locals[idx].is_read = true;
              locals[idx].read_at = now;
              writeLocalNotifications(locals, env);
            }
          }
          return data as NotificationRecord;
        }
      } catch (err) {
        console.warn('[Notifications] Error marking notification as read in DB:', err);
      }
    }
  }

  if (isLocalFallbackAllowed(env)) {
    const locals = readLocalNotifications(env);
    const idx = locals.findIndex(
      (n) =>
        n.id === notificationId &&
        n.recipient_user_id === userId &&
        (!n.expires_at || new Date(n.expires_at).getTime() > nowTime)
    );
    if (idx !== -1) {
      locals[idx].is_read = true;
      locals[idx].read_at = now;
      writeLocalNotifications(locals, env);
      return locals[idx];
    }
  }

  return null;
}

/**
 * Mark all active unread notifications for a user (and optional organization) as read.
 * Does NOT mark expired notifications as read.
 */
export async function markAllNotificationsAsRead(
  userId: string,
  rawOrganizationId?: string | null,
  env?: Record<string, any>
): Promise<{ marked_count: number }> {
  if (!userId) return { marked_count: 0 };

  const organizationId =
    rawOrganizationId &&
    rawOrganizationId !== 'undefined' &&
    rawOrganizationId !== 'null' &&
    rawOrganizationId.trim() !== ''
      ? rawOrganizationId.trim()
      : undefined;

  const isValidUUID = (val?: string | null): boolean =>
    typeof val === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);

  const now = new Date().toISOString();
  const nowTime = Date.now();

  if (isSupabaseConfigured(env)) {
    const supabase = getSupabaseServerClient(env);
    if (isValidUUID(userId)) {
      try {
        let query = supabase
          .from('notifications')
          .update({
            is_read: true,
            read_at: now,
          })
          .eq('recipient_user_id', userId)
          .eq('is_read', false)
          .or(`expires_at.is.null,expires_at.gt.${now}`);

        if (organizationId && isValidUUID(organizationId)) {
          query = query.or(`organization_id.eq.${organizationId},organization_id.is.null`);
        }

        const { data, error } = await query.select('id');

        if (!error && data) {
          if (isLocalFallbackAllowed(env)) {
            const locals = readLocalNotifications(env);
            let count = 0;
            locals.forEach((n) => {
              if (
                n.recipient_user_id === userId &&
                !n.is_read &&
                (!n.expires_at || new Date(n.expires_at).getTime() > nowTime) &&
                (!organizationId || !n.organization_id || n.organization_id === organizationId)
              ) {
                n.is_read = true;
                n.read_at = now;
                count++;
              }
            });
            if (count > 0) {
              writeLocalNotifications(locals, env);
            }
          }
          return { marked_count: data.length };
        }
      } catch (err) {
        console.warn('[Notifications] Error marking all notifications as read in DB:', err);
      }
    }
  }

  if (isLocalFallbackAllowed(env)) {
    const locals = readLocalNotifications(env);
    let markedCount = 0;
    locals.forEach((n) => {
      if (
        n.recipient_user_id === userId &&
        !n.is_read &&
        (!n.expires_at || new Date(n.expires_at).getTime() > nowTime) &&
        (!organizationId || !n.organization_id || n.organization_id === organizationId)
      ) {
        n.is_read = true;
        n.read_at = now;
        markedCount++;
      }
    });
    if (markedCount > 0) {
      writeLocalNotifications(locals, env);
    }
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
  if (!notificationId || !userId) return false;

  const isValidUUID = (val?: string | null): boolean =>
    typeof val === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);

  if (isSupabaseConfigured(env)) {
    const supabase = getSupabaseServerClient(env);
    if (isValidUUID(notificationId) && isValidUUID(userId)) {
      try {
        const { error } = await supabase
          .from('notifications')
          .delete()
          .eq('id', notificationId)
          .eq('recipient_user_id', userId);

        if (!error) {
          if (isLocalFallbackAllowed(env)) {
            const locals = readLocalNotifications(env).filter(
              (n) => !(n.id === notificationId && n.recipient_user_id === userId)
            );
            writeLocalNotifications(locals, env);
          }
          return true;
        }
      } catch (err) {
        console.warn('[Notifications] Error deleting notification from DB:', err);
      }
    }
  }

  if (isLocalFallbackAllowed(env)) {
    const locals = readLocalNotifications(env).filter(
      (n) => !(n.id === notificationId && n.recipient_user_id === userId)
    );
    writeLocalNotifications(locals, env);
    return true;
  }

  return false;
}

/**
 * Cleans up old notifications based on the catalog retention policy (storage lifecycle),
 * completely decoupled from notification visibility expiration (expires_at).
 * Notifications are deleted only when created_at is older than retentionDays.
 */
export async function cleanupNotificationsByRetention(env?: Record<string, any>): Promise<number> {
  if (isSupabaseConfigured(env)) {
    const supabase = getSupabaseServerClient(env);
    try {
      const { data, error } = await supabase.rpc('cleanup_notifications_retention');
      if (!error && typeof data === 'number') {
        return data;
      }
    } catch (rpcErr) {
      console.warn('[Notifications] Stored procedure cleanup_notifications_retention fallback:', rpcErr);
    }
  }

  if (isLocalFallbackAllowed(env)) {
    const locals = readLocalNotifications(env);
    const nowTime = Date.now();
    const remaining = locals.filter((n) => {
      const catalogItem = NOTIFICATION_CATALOG[n.type];
      const retentionDays = catalogItem?.retentionDays ?? 90;
      const cutoffTime = nowTime - retentionDays * 24 * 60 * 60 * 1000;
      const createdTime = new Date(n.created_at).getTime();
      return createdTime >= cutoffTime;
    });

    const deletedCount = locals.length - remaining.length;
    if (deletedCount > 0) {
      writeLocalNotifications(remaining, env);
    }
    return deletedCount;
  }

  return 0;
}

/**
 * Backward compatibility alias for cleanupNotificationsByRetention.
 */
export const cleanupExpiredNotifications = cleanupNotificationsByRetention;
