import {
  NotificationRecord,
  NotificationType,
  NotificationPriority,
  NotificationCategory,
  NOTIFICATION_CATALOG,
  renderNotificationContent,
} from './types.js';
import {
  createNotification,
  getNotificationByDeduplicationKey,
} from '../db/notifications.js';
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
  orderId?: string;
  referenceId?: string;
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
  gameName?: string;
  startDate?: string;
  endDate?: string;
}

export interface EventLiveEvent extends BaseBusinessEvent {
  eventType: 'EVENT_LIVE';
  recipientUserId?: string | null;
  eventId: string;
  eventName: string;
  liveUrl?: string | null;
  publicUrl?: string | null;
}

export interface EventExpiringEvent extends BaseBusinessEvent {
  eventType: 'EVENT_EXPIRING';
  recipientUserId?: string | null;
  eventId: string;
  eventName: string;
  timeRemaining: string; // e.g. "24 hours", "6 hours"
  endDate?: string;
}

export interface EventExpiredEvent extends BaseBusinessEvent {
  eventType: 'EVENT_EXPIRED';
  recipientUserId?: string | null;
  eventId: string;
  eventName: string;
  reason?: string;
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
  previewUrl?: string;
}

export interface ShowcaseDraftCreatedEvent extends BaseBusinessEvent {
  eventType: 'SHOWCASE_DRAFT_CREATED';
  recipientUserId?: string | null;
  eventId: string;
  eventName: string;
  showcaseId?: string;
  showcaseTitle?: string;
}

export interface ShowcasePublishedEvent extends BaseBusinessEvent {
  eventType: 'SHOWCASE_PUBLISHED';
  recipientUserId?: string | null;
  eventId: string;
  eventName: string;
  showcaseId?: string;
  showcaseTitle?: string;
}

export interface ShowcaseUnpublishedEvent extends BaseBusinessEvent {
  eventType: 'SHOWCASE_UNPUBLISHED';
  recipientUserId?: string | null;
  eventId: string;
  eventName: string;
  showcaseId?: string;
  showcaseTitle?: string;
}

export interface ShowcaseUpdatedEvent extends BaseBusinessEvent {
  eventType: 'SHOWCASE_UPDATED';
  recipientUserId?: string | null;
  eventId: string;
  eventName: string;
  showcaseId?: string;
  showcaseTitle?: string;
}

export interface SecuritySettingsChangedEvent extends BaseBusinessEvent {
  eventType: 'SECURITY_SETTINGS_CHANGED';
  recipientUserId?: string | null;
  action: 'ROLE_CHANGED' | 'MEMBER_REMOVED' | 'MEMBER_INVITED' | 'ORG_SETTINGS_UPDATED';
  details: string;
  changeDescription?: string;
}

export interface PaymentFailedEvent extends BaseBusinessEvent {
  eventType: 'PAYMENT_FAILED';
  recipientUserId?: string | null;
  referenceId: string;
  amount: number | string;
  currency?: string;
  subject: string;
  reason?: string;
  eventId?: string | null;
  orderId?: string;
}

export interface EventPaymentFailedEvent extends BaseBusinessEvent {
  eventType: 'EVENT_PAYMENT_FAILED';
  recipientUserId?: string | null;
  eventId: string;
  eventName: string;
  amount?: number | string;
  currency?: string;
  reason?: string;
}

export interface EventApproachingEvent extends BaseBusinessEvent {
  eventType: 'EVENT_APPROACHING';
  recipientUserId?: string | null;
  eventId: string;
  eventName: string;
  startDate: string;
  setupDate?: string;
}

export interface InsufficientBalanceEvent extends BaseBusinessEvent {
  eventType: 'INSUFFICIENT_BALANCE';
  recipientUserId?: string | null;
  currentBalance: number | string;
  requiredAmount: number | string;
  currency?: string;
  eventId?: string | null;
  eventName?: string | null;
  context?: string;
}

export interface OrgInvitationEvent extends BaseBusinessEvent {
  eventType: 'ORG_INVITATION';
  recipientUserId?: string | null;
  inviteeEmail: string;
  orgName: string;
  role: string;
  invitationId?: string;
  inviteUrl?: string;
  actionUrl?: string;
}

export interface MemberJoinedEvent extends BaseBusinessEvent {
  eventType: 'MEMBER_JOINED';
  recipientUserId?: string | null;
  memberUserId: string;
  memberName: string;
  orgName: string;
  role?: string;
}

export type BusinessNotificationEvent =
  | WelcomeCreditAddedEvent
  | PaymentSuccessEvent
  | PaymentPendingEvent
  | PaymentFailedEvent
  | EventCreatedEvent
  | EventApproachingEvent
  | EventLiveEvent
  | EventExpiringEvent
  | EventExpiredEvent
  | EventPaymentFailedEvent
  | WalletLowBalanceEvent
  | InsufficientBalanceEvent
  | ThemeReadyEvent
  | ShowcaseDraftCreatedEvent
  | ShowcasePublishedEvent
  | ShowcaseUnpublishedEvent
  | ShowcaseUpdatedEvent
  | OrgInvitationEvent
  | MemberJoinedEvent
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
  private static instance: NotificationDispatcher;

  public static getInstance(): NotificationDispatcher {
    if (!NotificationDispatcher.instance) {
      NotificationDispatcher.instance = new NotificationDispatcher();
    }
    return NotificationDispatcher.instance;
  }

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

          if (userDeduplicationKey) {
            const existing = await getNotificationByDeduplicationKey(
              userId,
              userDeduplicationKey,
              env
            );
            if (existing) {
              // Duplicate suppressed by deduplication key - do not recreate or re-alert
              continue;
            }
          }

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

    // For organization invitations, if the invitee already has a user account, resolve directly to that user
    if (event.eventType === 'ORG_INVITATION' && (event as OrgInvitationEvent).inviteeEmail) {
      try {
        const { getUserByEmail } = await import('../db/users.js');
        const existingInvitedUser = await getUserByEmail((event as OrgInvitationEvent).inviteeEmail, env);
        if (existingInvitedUser) {
          return [existingInvitedUser.id];
        }
      } catch (err) {
        console.warn('[DISPATCHER] Could not check existing user for invitation:', err);
      }
    }

    if (event.organizationId) {
      try {
        const members = await getOrgMembers(event.organizationId, env);
        // Showcase events strictly target the showcase/account owner, not all admins
        if (event.eventType.startsWith('SHOWCASE_')) {
          const owner = members.find((m) => m.role === 'owner');
          if (owner) {
            return [owner.user_id];
          }
        }

        // Target owners and admins for organizational events
        let managers = members.filter(
          (m) => m.role === 'owner' || m.role === 'admin'
        );

        // When a new member joins, notify existing managers (exclude the new member themselves)
        if (event.eventType === 'MEMBER_JOINED' && (event as MemberJoinedEvent).memberUserId) {
          const otherManagers = managers.filter((m) => m.user_id !== (event as MemberJoinedEvent).memberUserId);
          if (otherManagers.length > 0) {
            return otherManagers.map((m) => m.user_id);
          }
        }

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

      case 'SHOWCASE_DRAFT_CREATED': {
        return {
          type: 'showcase_draft_created',
          actionUrl: '/events',
          entityType: 'showcase',
          entityId: event.showcaseId || event.eventId,
          metadata: {
            event_id: event.eventId,
            event_name: event.eventName,
            showcase_id: event.showcaseId,
            ...event.metadata,
          },
          deduplicationKey: `showcase_draft_${event.showcaseId || event.eventId}`,
        };
      }

      case 'SHOWCASE_PUBLISHED': {
        return {
          type: 'showcase_published',
          actionUrl: '/events',
          entityType: 'showcase',
          entityId: event.showcaseId || event.eventId,
          metadata: {
            event_id: event.eventId,
            event_name: event.eventName,
            showcase_id: event.showcaseId,
            ...event.metadata,
          },
          deduplicationKey: `showcase_published_${event.showcaseId || event.eventId}`,
        };
      }

      case 'SHOWCASE_UNPUBLISHED': {
        return {
          type: 'showcase_unpublished',
          actionUrl: '/events',
          entityType: 'showcase',
          entityId: event.showcaseId || event.eventId,
          metadata: {
            event_id: event.eventId,
            event_name: event.eventName,
            showcase_id: event.showcaseId,
            ...event.metadata,
          },
          deduplicationKey: `showcase_unpublished_${event.showcaseId || event.eventId}`,
        };
      }

      case 'SHOWCASE_UPDATED': {
        return {
          type: 'showcase_updated',
          actionUrl: '/events',
          entityType: 'showcase',
          entityId: event.showcaseId || event.eventId,
          metadata: {
            event_id: event.eventId,
            event_name: event.eventName,
            showcase_id: event.showcaseId,
            ...event.metadata,
          },
          deduplicationKey: `showcase_updated_${event.showcaseId || event.eventId}_${Math.floor(Date.now() / 60000)}`,
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

      case 'PAYMENT_FAILED': {
        const amountStr = typeof event.amount === 'number' ? `RM${event.amount.toLocaleString()}` : String(event.amount);
        return {
          type: 'payment_failed',
          actionUrl: event.eventId ? `/events` : '/wallet',
          entityType: event.eventId ? 'event' : (event.orderId ? 'topup_order' : 'payment'),
          entityId: event.orderId || event.eventId || event.referenceId,
          metadata: {
            amount: amountStr,
            subject: event.subject,
            reference_id: event.referenceId,
            reason: event.reason,
            order_id: event.orderId,
            event_id: event.eventId,
            currency: event.currency || 'MYR',
            ...event.metadata,
          },
          deduplicationKey: `payment_failed_${event.referenceId}`,
        };
      }

      case 'EVENT_PAYMENT_FAILED': {
        const amountStr = event.amount !== undefined
          ? (typeof event.amount === 'number' ? `RM${event.amount.toLocaleString()}` : String(event.amount))
          : undefined;
        const minuteEpoch = Math.floor(Date.now() / 60000);
        return {
          type: 'event_payment_failed',
          actionUrl: '/events',
          entityType: 'event',
          entityId: event.eventId,
          metadata: {
            event_id: event.eventId,
            event_name: event.eventName,
            amount: amountStr,
            reason: event.reason,
            currency: event.currency || 'MYR',
            ...event.metadata,
          },
          deduplicationKey: `event_payment_failed_${event.eventId}_${minuteEpoch}`,
        };
      }

      case 'EVENT_APPROACHING': {
        return {
          type: 'event_approaching',
          actionUrl: '/events',
          entityType: 'event',
          entityId: event.eventId,
          metadata: {
            event_id: event.eventId,
            event_name: event.eventName,
            start_date: event.startDate,
            setup_date: event.setupDate,
            ...event.metadata,
          },
          deduplicationKey: `event_approaching_${event.eventId}_${event.startDate}`,
        };
      }

      case 'INSUFFICIENT_BALANCE': {
        const currentBalStr = typeof event.currentBalance === 'number' ? `RM${event.currentBalance.toLocaleString()}` : String(event.currentBalance);
        const reqAmountStr = typeof event.requiredAmount === 'number' ? `RM${event.requiredAmount.toLocaleString()}` : String(event.requiredAmount);
        const minuteEpoch = Math.floor(Date.now() / 60000);
        return {
          type: 'insufficient_balance',
          actionUrl: '/wallet/top-up',
          entityType: 'wallet',
          entityId: event.organizationId || undefined,
          metadata: {
            current_balance: currentBalStr,
            required_amount: reqAmountStr,
            currency: event.currency || 'MYR',
            event_id: event.eventId,
            event_name: event.eventName,
            context: event.context,
            ...event.metadata,
          },
          deduplicationKey: `insufficient_balance_${event.organizationId || event.recipientUserId}_${minuteEpoch}`,
        };
      }

      case 'ORG_INVITATION': {
        return {
          type: 'org_invitation',
          actionUrl: event.actionUrl || event.inviteUrl || '/team',
          entityType: 'invitation',
          entityId: event.invitationId,
          metadata: {
            org_name: event.orgName,
            role: event.role,
            invitee_email: event.inviteeEmail,
            invitation_id: event.invitationId,
            invite_url: event.inviteUrl,
            ...event.metadata,
          },
          deduplicationKey: `org_invitation_${event.organizationId}_${event.inviteeEmail.toLowerCase()}`,
        };
      }

      case 'MEMBER_JOINED': {
        return {
          type: 'member_joined',
          actionUrl: '/team',
          entityType: 'organization_member',
          entityId: event.memberUserId,
          metadata: {
            member_name: event.memberName,
            org_name: event.orgName,
            role: event.role,
            member_user_id: event.memberUserId,
            ...event.metadata,
          },
          deduplicationKey: `member_joined_${event.organizationId}_${event.memberUserId}`,
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
