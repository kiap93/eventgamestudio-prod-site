import {
  NotificationRecord,
  NotificationType,
  NotificationPriority,
  NotificationCategory,
  NOTIFICATION_CATALOG,
  renderNotificationContent,
} from './types.js';
import { createNotification } from '../db/notifications.js';
import { getOrgMembers } from '../db/members.js';
import { getUserById } from '../db/users.js';

export interface BaseBusinessEvent {
  organizationId?: string | null;
  actorUserId?: string | null;
  metadata?: Record<string, any>;
}

export interface WelcomeCreditAddedEvent extends BaseBusinessEvent {
  eventType: 'WELCOME_CREDIT_ADDED';
  recipientUserId: string;
  amount: number | string;
  currency?: string;
}

export interface PaymentSuccessEvent extends BaseBusinessEvent {
  eventType: 'PAYMENT_SUCCESS';
  recipientUserId?: string | null;
  referenceId: string;
  amount: number | string;
  currency?: string;
  subject: string;
  eventId?: string | null;
  paymentType?: 'EVENT_PAYMENT' | 'TOPUP' | 'SUBSCRIPTION';
}

export interface PaymentPendingEvent extends BaseBusinessEvent {
  eventType: 'PAYMENT_PENDING';
  recipientUserId?: string | null;
  orderId: string;
  amount: number | string;
  currency?: string;
  subject: string;
  checkoutUrl?: string | null;
}

export interface EventCreatedEvent extends BaseBusinessEvent {
  eventType: 'EVENT_CREATED';
  recipientUserId?: string | null;
  eventId: string;
  eventName: string;
  startDate: string;
  endDate: string;
}

export interface EventLiveEvent extends BaseBusinessEvent {
  eventType: 'EVENT_LIVE';
  recipientUserId?: string | null;
  eventId: string;
  eventName: string;
  liveUrl?: string | null;
}

export interface EventExpiringEvent extends BaseBusinessEvent {
  eventType: 'EVENT_EXPIRING';
  recipientUserId?: string | null;
  eventId: string;
  eventName: string;
  timeRemaining: string; // e.g. "24 hours", "6 hours"
}

export interface EventExpiredEvent extends BaseBusinessEvent {
  eventType: 'EVENT_EXPIRED';
  recipientUserId?: string | null;
  eventId: string;
  eventName: string;
}

export interface WalletLowBalanceEvent extends BaseBusinessEvent {
  eventType: 'WALLET_LOW_BALANCE';
  recipientUserId?: string | null;
  currentBalance: string | number;
  currency?: string;
  threshold?: string | number;
}

export interface ThemeReadyEvent extends BaseBusinessEvent {
  eventType: 'THEME_READY';
  recipientUserId?: string | null;
  themeId: string;
  themeName: string;
  gameType?: string;
  gameName?: string;
}

export interface LeaderboardHighScoreEvent extends BaseBusinessEvent {
  eventType: 'LEADERBOARD_HIGH_SCORE';
  recipientUserId?: string | null;
  eventId: string;
  eventName: string;
  playerName: string;
  score: number;
  rank?: number;
}

export interface ShowcaseApprovedEvent extends BaseBusinessEvent {
  eventType: 'SHOWCASE_APPROVED';
  recipientUserId?: string | null;
  eventId: string;
  eventName: string;
  rewardAmount?: string | number | null;
}

export interface SecuritySettingsChangedEvent extends BaseBusinessEvent {
  eventType: 'SECURITY_SETTINGS_CHANGED';
  recipientUserId?: string | null;
  action: 'ROLE_CHANGED' | 'MEMBER_REMOVED' | 'MEMBER_INVITED' | 'ORG_SETTINGS_UPDATED';
  details: string;
}

export type BusinessNotificationEvent =
  | WelcomeCreditAddedEvent
  | PaymentSuccessEvent
  | PaymentPendingEvent
  | EventCreatedEvent
  | EventLiveEvent
  | EventExpiringEvent
  | EventExpiredEvent
  | WalletLowBalanceEvent
  | ThemeReadyEvent
  | LeaderboardHighScoreEvent
  | ShowcaseApprovedEvent
  | SecuritySettingsChangedEvent;

/**
 * Adapter interface for multi-channel delivery (In-App, Email, Push).
 */
export interface NotificationChannelAdapter {
  name: 'in_app' | 'email' | 'push';
  send(
    notification: NotificationRecord,
    recipient: { id: string; email?: string; name?: string },
    env?: Record<string, any>
  ): Promise<void>;
}

/**
 * In-App Delivery Channel Adapter.
 */
class InAppChannelAdapter implements NotificationChannelAdapter {
  name = 'in_app' as const;

  async send(
    notification: NotificationRecord,
    _recipient: { id: string; email?: string; name?: string },
    _env?: Record<string, any>
  ): Promise<void> {
    // Already stored in database by NotificationDispatcher via NotificationService
  }
}

/**
 * Email Channel Adapter (Extensible for Google Mail / Resend / SendGrid / SMTP).
 */
class EmailChannelAdapter implements NotificationChannelAdapter {
  name = 'email' as const;

  async send(
    notification: NotificationRecord,
    recipient: { id: string; email?: string; name?: string },
    _env?: Record<string, any>
  ): Promise<void> {
    if (!recipient.email) return;

    // Email delivery is reserved for high and urgent mandatory notifications
    const catalogItem = NOTIFICATION_CATALOG[notification.type];
    if (notification.priority !== 'high' && notification.priority !== 'urgent' && !catalogItem?.mandatory) {
      return;
    }

    try {
      // Future automated delivery / background worker processing
      // Currently safely logged for audit trail without blocking in-app flow
      if (process.env.NODE_ENV !== 'production') {
        console.log(`[EMAIL ADAPTER] Notification queue to ${recipient.email}: [${notification.title}] - ${notification.message}`);
      }
    } catch (err) {
      console.error('[EMAIL ADAPTER] Email dispatch failed:', err);
    }
  }
}

/**
 * Push Channel Adapter (Extensible for Web Push API / FCM / APNS).
 */
class PushChannelAdapter implements NotificationChannelAdapter {
  name = 'push' as const;

  async send(
    notification: NotificationRecord,
    recipient: { id: string; email?: string; name?: string },
    _env?: Record<string, any>
  ): Promise<void> {
    // Push notifications adapter stub ready for Service Worker Push API subscription
    if (process.env.NODE_ENV !== 'production' && notification.priority === 'urgent') {
      console.log(`[PUSH ADAPTER] Push alert to user ${recipient.id}: ${notification.title}`);
    }
  }
}

/**
 * Central Notification Dispatcher
 * The single, authoritative ingress pipeline for all platform business notifications.
 */
export class NotificationDispatcher {
  private adapters: NotificationChannelAdapter[] = [
    new InAppChannelAdapter(),
    new EmailChannelAdapter(),
    new PushChannelAdapter(),
  ];

  /**
   * Register a custom channel adapter (e.g. Webhook, SMS, Slack, etc.)
   */
  public registerAdapter(adapter: NotificationChannelAdapter) {
    this.adapters.push(adapter);
  }

  /**
   * Dispatches a business event to the appropriate recipients and notification channels.
   */
  public async dispatch(
    event: BusinessNotificationEvent,
    env?: Record<string, any>
  ): Promise<NotificationRecord[]> {
    try {
      // 1. Resolve Target Recipients
      const recipientUserIds = await this.resolveRecipients(event, env);
      if (!recipientUserIds || recipientUserIds.length === 0) {
        return [];
      }

      // 2. Resolve Notification Payload & Template Mapping
      const payloadConfig = this.buildPayloadConfig(event);

      // 3. Create Notification for each recipient with deduplication
      const createdNotifications: NotificationRecord[] = [];

      for (const userId of recipientUserIds) {
        try {
          // Per-user deduplication key
          const userDeduplicationKey = payloadConfig.deduplicationKey
            ? `${payloadConfig.deduplicationKey}_${userId}`
            : null;

          const record = await createNotification(
            {
              recipientUserId: userId,
              organizationId: event.organizationId || null,
              type: payloadConfig.type,
              title: payloadConfig.customTitle,
              message: payloadConfig.customMessage,
              priority: payloadConfig.priority,
              actionUrl: payloadConfig.actionUrl,
              entityType: payloadConfig.entityType,
              entityId: payloadConfig.entityId,
              metadata: payloadConfig.metadata,
              deduplicationKey: userDeduplicationKey,
            },
            env
          );

          createdNotifications.push(record);

          // 4. Distribute to Secondary Channel Adapters (Email, Push)
          const recipientUser = await getUserById(userId, env);
          const recipientMeta = recipientUser
            ? { id: recipientUser.id, email: recipientUser.email, name: recipientUser.name }
            : { id: userId };

          for (const adapter of this.adapters) {
            try {
              await adapter.send(record, recipientMeta, env);
            } catch (adapterErr) {
              console.error(`[DISPATCHER] Adapter ${adapter.name} error:`, adapterErr);
            }
          }
        } catch (itemErr) {
          console.error(`[DISPATCHER] Failed to create notification for user ${userId}:`, itemErr);
        }
      }

      return createdNotifications;
    } catch (dispatchErr) {
      console.error('[DISPATCHER] Exception in dispatchNotificationEvent:', dispatchErr);
      return [];
    }
  }

  /**
   * Resolves recipient user IDs from the business event.
   * If specific user is given, returns that user.
   * If only organization is given, resolves organization owners and admins.
   */
  private async resolveRecipients(
    event: BusinessNotificationEvent,
    env?: Record<string, any>
  ): Promise<string[]> {
    if (event.recipientUserId) {
      return [event.recipientUserId];
    }

    if (event.organizationId) {
      try {
        const members = await getOrgMembers(event.organizationId, env);
        // Target owners and admins for organizational events
        const managers = members.filter(
          (m) => m.role === 'owner' || m.role === 'admin'
        );
        if (managers.length > 0) {
          return managers.map((m) => m.user_id);
        }
        // Fallback to all members if no specific admin found
        return members.map((m) => m.user_id);
      } catch (err) {
        console.error('[DISPATCHER] Could not resolve organization members for notification:', err);
      }
    }

    return [];
  }

  /**
   * Maps a domain business event to its notification catalog type, metadata, and deduplication rule.
   */
  private buildPayloadConfig(event: BusinessNotificationEvent): {
    type: NotificationType;
    priority?: NotificationPriority;
    customTitle?: string;
    customMessage?: string;
    actionUrl?: string;
    entityType?: string;
    entityId?: string;
    metadata: Record<string, any>;
    deduplicationKey?: string;
  } {
    switch (event.eventType) {
      case 'WELCOME_CREDIT_ADDED': {
        const amountStr = typeof event.amount === 'number' ? `RM${event.amount.toLocaleString()}` : String(event.amount);
        return {
          type: 'welcome_credit_added',
          actionUrl: '/wallet',
          entityType: 'wallet',
          metadata: {
            amount: amountStr,
            currency: event.currency || 'MYR',
            ...event.metadata,
          },
          deduplicationKey: `welcome_credit_${event.organizationId || event.recipientUserId}`,
        };
      }

      case 'PAYMENT_SUCCESS': {
        const amountStr = typeof event.amount === 'number' ? `RM${event.amount.toLocaleString()}` : String(event.amount);
        return {
          type: 'payment_success',
          actionUrl: event.eventId ? `/events` : '/wallet',
          entityType: event.eventId ? 'event' : 'wallet_transaction',
          entityId: event.eventId || event.referenceId,
          metadata: {
            amount: amountStr,
            subject: event.subject,
            reference_id: event.referenceId,
            event_id: event.eventId,
            ...event.metadata,
          },
          deduplicationKey: `payment_success_${event.referenceId}`,
        };
      }

      case 'PAYMENT_PENDING': {
        const amountStr = typeof event.amount === 'number' ? `RM${event.amount.toLocaleString()}` : String(event.amount);
        return {
          type: 'payment_pending',
          actionUrl: event.checkoutUrl || '/wallet',
          entityType: 'topup_order',
          entityId: event.orderId,
          metadata: {
            amount: amountStr,
            subject: event.subject,
            order_id: event.orderId,
            ...event.metadata,
          },
          deduplicationKey: `payment_pending_${event.orderId}`,
        };
      }

      case 'EVENT_CREATED': {
        return {
          type: 'event_created',
          actionUrl: '/events',
          entityType: 'event',
          entityId: event.eventId,
          metadata: {
            event_id: event.eventId,
            event_name: event.eventName,
            start_date: event.startDate,
            end_date: event.endDate,
            ...event.metadata,
          },
          deduplicationKey: `event_created_${event.eventId}`,
        };
      }

      case 'EVENT_LIVE': {
        return {
          type: 'event_live',
          actionUrl: event.liveUrl || '/events',
          entityType: 'event',
          entityId: event.eventId,
          metadata: {
            event_id: event.eventId,
            event_name: event.eventName,
            live_url: event.liveUrl,
            ...event.metadata,
          },
          deduplicationKey: `event_live_${event.eventId}`,
        };
      }

      case 'EVENT_EXPIRING': {
        // Daily deduplication key so we don't spam multiple times on the same day
        const todayStr = new Date().toISOString().split('T')[0];
        return {
          type: 'event_expiring',
          actionUrl: '/events',
          entityType: 'event',
          entityId: event.eventId,
          metadata: {
            event_id: event.eventId,
            event_name: event.eventName,
            time_remaining: event.timeRemaining,
            ...event.metadata,
          },
          deduplicationKey: `event_expiring_${event.eventId}_${todayStr}`,
        };
      }

      case 'EVENT_EXPIRED': {
        return {
          type: 'event_expired',
          actionUrl: '/events',
          entityType: 'event',
          entityId: event.eventId,
          metadata: {
            event_id: event.eventId,
            event_name: event.eventName,
            ...event.metadata,
          },
          deduplicationKey: `event_expired_${event.eventId}`,
        };
      }

      case 'WALLET_LOW_BALANCE': {
        const balStr = typeof event.currentBalance === 'number' ? `RM${event.currentBalance.toLocaleString()}` : String(event.currentBalance);
        const todayStr = new Date().toISOString().split('T')[0];
        return {
          type: 'wallet_low_balance',
          actionUrl: '/wallet/top-up',
          entityType: 'wallet',
          metadata: {
            current_balance: balStr,
            currency: event.currency || 'MYR',
            threshold: event.threshold,
            ...event.metadata,
          },
          deduplicationKey: `wallet_low_balance_${event.organizationId}_${todayStr}`,
        };
      }

      case 'THEME_READY': {
        return {
          type: 'theme_ready',
          actionUrl: '/games',
          entityType: 'theme',
          entityId: event.themeId,
          metadata: {
            theme_id: event.themeId,
            theme_name: event.themeName,
            game_name: event.gameName || event.gameType || 'Game',
            ...event.metadata,
          },
          deduplicationKey: `theme_ready_${event.themeId}`,
        };
      }

      case 'LEADERBOARD_HIGH_SCORE': {
        return {
          type: 'leaderboard_high_score',
          actionUrl: '/events',
          entityType: 'event_score',
          entityId: event.eventId,
          metadata: {
            event_id: event.eventId,
            event_name: event.eventName,
            player_name: event.playerName,
            score: event.score,
            rank: event.rank || 1,
            ...event.metadata,
          },
          deduplicationKey: `high_score_${event.eventId}_${event.playerName}_${event.score}`,
        };
      }

      case 'SHOWCASE_APPROVED': {
        const rewardNote = event.rewardAmount
          ? `An owner reward of RM${Number(event.rewardAmount).toLocaleString()} has been credited to your wallet.`
          : '';
        return {
          type: 'showcase_approved',
          actionUrl: '/events',
          entityType: 'showcase',
          entityId: event.eventId,
          metadata: {
            event_id: event.eventId,
            event_name: event.eventName,
            reward_note: rewardNote,
            reward_amount: event.rewardAmount,
            ...event.metadata,
          },
          deduplicationKey: `showcase_approved_${event.eventId}`,
        };
      }

      case 'SECURITY_SETTINGS_CHANGED': {
        return {
          type: 'security_settings_changed',
          actionUrl: '/team',
          entityType: 'organization',
          entityId: event.organizationId || undefined,
          metadata: {
            action: event.action,
            details: event.details,
            ...event.metadata,
          },
          deduplicationKey: `security_${event.organizationId}_${event.action}_${Math.floor(Date.now() / 60000)}`,
        };
      }
    }
  }
}

// Singleton export
export const notificationDispatcher = new NotificationDispatcher();

/**
 * Canonical helper for business domains to dispatch notifications without direct DB coupling.
 */
export async function dispatchNotificationEvent(
  event: BusinessNotificationEvent,
  env?: Record<string, any>
): Promise<NotificationRecord[]> {
  return notificationDispatcher.dispatch(event, env);
}
