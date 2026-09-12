import { Request, Response } from 'express';
import { AuthenticatedRequest } from '../auth.js';
import {
  listNotifications,
  getUnreadNotificationCount,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  deleteNotification,
} from '../db/notifications.js';
import { dispatchNotificationEvent, BusinessNotificationEvent } from './dispatcher.js';
import { NotificationCategory } from './types.js';

/**
 * GET /api/notifications
 * List notifications for the authenticated user.
 */
export async function handleListNotifications(req: AuthenticatedRequest, res: Response) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized: Authentication required' });
      return;
    }

    const unreadOnly = req.query.unread_only === 'true' || req.query.unreadOnly === 'true';
    const organizationId = (req.query.organization_id as string) || (req.query.organizationId as string) || undefined;
    const category = (req.query.category as NotificationCategory) || undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 30;
    const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : 0;

    const result = await listNotifications({
      userId,
      organizationId,
      unreadOnly,
      category,
      limit,
      offset,
    });

    res.json({
      notifications: result.notifications,
      total: result.total,
      unread_count: result.unread_count,
    });
  } catch (err: any) {
    console.error('Error in handleListNotifications:', err);
    res.status(500).json({ error: err.message || 'Failed to list notifications' });
  }
}

/**
 * GET /api/notifications/unread-count
 * Fast endpoint for header notification badge.
 */
export async function handleGetUnreadNotificationCount(req: AuthenticatedRequest, res: Response) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized: Authentication required' });
      return;
    }

    const organizationId = (req.query.organization_id as string) || (req.query.organizationId as string) || undefined;
    const count = await getUnreadNotificationCount(userId, organizationId);

    res.json({ unread_count: count });
  } catch (err: any) {
    console.error('Error in handleGetUnreadNotificationCount:', err);
    res.status(500).json({ error: err.message || 'Failed to count unread notifications' });
  }
}

/**
 * PATCH /api/notifications/:id/read
 * Mark an individual notification as read.
 */
export async function handleMarkNotificationAsRead(req: AuthenticatedRequest, res: Response) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized: Authentication required' });
      return;
    }

    const notificationId = req.params.id;
    if (!notificationId) {
      res.status(400).json({ error: 'Notification ID is required' });
      return;
    }

    const updated = await markNotificationAsRead(notificationId, userId);
    if (!updated) {
      res.status(404).json({ error: 'Notification not found' });
      return;
    }

    res.json({ notification: updated });
  } catch (err: any) {
    console.error('Error in handleMarkNotificationAsRead:', err);
    res.status(500).json({ error: err.message || 'Failed to update notification' });
  }
}

/**
 * POST /api/notifications/mark-all-read
 * Mark all notifications as read for current user and active organization.
 */
export async function handleMarkAllNotificationsAsRead(req: AuthenticatedRequest, res: Response) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized: Authentication required' });
      return;
    }

    const organizationId = (req.body?.organization_id as string) || (req.query?.organization_id as string) || undefined;
    const result = await markAllNotificationsAsRead(userId, organizationId);

    res.json({ success: true, marked_count: result.marked_count });
  } catch (err: any) {
    console.error('Error in handleMarkAllNotificationsAsRead:', err);
    res.status(500).json({ error: err.message || 'Failed to mark all notifications as read' });
  }
}

/**
 * DELETE /api/notifications/:id
 * Dismiss or delete a notification record.
 */
export async function handleDeleteNotification(req: AuthenticatedRequest, res: Response) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized: Authentication required' });
      return;
    }

    const notificationId = req.params.id;
    if (!notificationId) {
      res.status(400).json({ error: 'Notification ID is required' });
      return;
    }

    const success = await deleteNotification(notificationId, userId);
    res.json({ success });
  } catch (err: any) {
    console.error('Error in handleDeleteNotification:', err);
    res.status(500).json({ error: err.message || 'Failed to delete notification' });
  }
}

/**
 * POST /api/developer/notifications/dispatch-test
 * Developer test endpoint to trigger business events and verify dispatching.
 */
export async function handleDispatchTestNotification(req: AuthenticatedRequest, res: Response) {
  try {
    const event = req.body as BusinessNotificationEvent;
    if (!event || !event.eventType) {
      res.status(400).json({ error: 'Valid BusinessNotificationEvent with eventType is required' });
      return;
    }

    // Default recipient to calling user if not supplied
    if (!event.recipientUserId && !event.organizationId && req.user?.id) {
      event.recipientUserId = req.user.id;
    }

    const createdNotifications = await dispatchNotificationEvent(event);
    res.json({
      success: true,
      created_count: createdNotifications.length,
      notifications: createdNotifications,
    });
  } catch (err: any) {
    console.error('Error in handleDispatchTestNotification:', err);
    res.status(500).json({ error: err.message || 'Failed to dispatch test notification' });
  }
}
