/**
 * Centralized Notification System Catalog & Core Types
 * Event Game Studio
 */

export type NotificationType =
  | 'welcome_credit_added'
  | 'payment_success'
  | 'payment_pending'
  | 'payment_failed'
  | 'event_created'
  | 'event_approaching'
  | 'event_live'
  | 'event_expiring'
  | 'event_expired'
  | 'event_payment_failed'
  | 'wallet_low_balance'
  | 'insufficient_balance'
  | 'theme_ready'
  | 'leaderboard_high_score'
  | 'showcase_draft_created'
  | 'showcase_published'
  | 'showcase_unpublished'
  | 'showcase_updated'
  | 'org_invitation'
  | 'member_joined'
  | 'security_settings_changed';

export type NotificationCategory =
  | 'billing'
  | 'event'
  | 'theme'
  | 'leaderboard'
  | 'showcase'
  | 'security'
  | 'wallet';

export type NotificationPriority = 'low' | 'normal' | 'high' | 'urgent';

export interface NotificationRecord {
  id: string;
  recipient_user_id: string;
  organization_id?: string | null;
  type: NotificationType;
  category: NotificationCategory;
  title: string;
  message: string;
  priority: NotificationPriority;
  action_url?: string | null;
  entity_type?: string | null;
  entity_id?: string | null;
  metadata?: Record<string, any>;
  is_read: boolean;
  read_at?: string | null;
  deduplication_key?: string | null;
  created_at: string;
  expires_at?: string | null;
}

export interface NotificationCatalogItem {
  type: NotificationType;
  category: NotificationCategory;
  defaultTitle: string;
  defaultMessage: string;
  priority: NotificationPriority;
  defaultActionUrl?: string;
  mandatory: boolean; // cannot be muted / opted out
  duplicatesAllowed: boolean;
  retentionDays: number;
}

/**
 * Authoritative Notification Catalog defining all 12 platform notification types,
 * default templates, priority levels, categories, and delivery behavior.
 */
export const NOTIFICATION_CATALOG: Record<NotificationType, NotificationCatalogItem> = {
  welcome_credit_added: {
    type: 'welcome_credit_added',
    category: 'wallet',
    defaultTitle: 'Welcome Credit Added',
    defaultMessage: 'Your organization received {amount} in Welcome Credits! You can apply it towards activating your first live event.',
    priority: 'normal',
    defaultActionUrl: '/wallet',
    mandatory: true,
    duplicatesAllowed: false,
    retentionDays: 90,
  },
  payment_success: {
    type: 'payment_success',
    category: 'billing',
    defaultTitle: 'Payment Successful',
    defaultMessage: 'Payment of {amount} for {subject} was completed successfully.',
    priority: 'high',
    defaultActionUrl: '/wallet',
    mandatory: true,
    duplicatesAllowed: true,
    retentionDays: 180,
  },
  payment_pending: {
    type: 'payment_pending',
    category: 'billing',
    defaultTitle: 'Payment Pending',
    defaultMessage: 'An order of {amount} for {subject} is awaiting payment confirmation.',
    priority: 'normal',
    defaultActionUrl: '/wallet',
    mandatory: false,
    duplicatesAllowed: false,
    retentionDays: 30,
  },
  event_created: {
    type: 'event_created',
    category: 'event',
    defaultTitle: 'New Event Created',
    defaultMessage: 'Event "{event_name}" has been created for {start_date} to {end_date}. Complete payment before setup day to go live.',
    priority: 'normal',
    defaultActionUrl: '/events',
    mandatory: false,
    duplicatesAllowed: true,
    retentionDays: 90,
  },
  event_live: {
    type: 'event_live',
    category: 'event',
    defaultTitle: 'Event Is Now Live!',
    defaultMessage: '"{event_name}" is active and playable! Attendees can join via the live event QR and URL.',
    priority: 'high',
    defaultActionUrl: '/events',
    mandatory: true,
    duplicatesAllowed: false,
    retentionDays: 60,
  },
  event_expiring: {
    type: 'event_expiring',
    category: 'event',
    defaultTitle: 'Event Expiring Soon',
    defaultMessage: '"{event_name}" will conclude in {time_remaining}. Ensure all live attendees have recorded their final scores.',
    priority: 'high',
    defaultActionUrl: '/events',
    mandatory: true,
    duplicatesAllowed: false,
    retentionDays: 30,
  },
  event_expired: {
    type: 'event_expired',
    category: 'event',
    defaultTitle: 'Event Concluded',
    defaultMessage: '"{event_name}" has ended. Final scores and leaderboard rankings are archived in your event dashboard.',
    priority: 'normal',
    defaultActionUrl: '/events',
    mandatory: false,
    duplicatesAllowed: false,
    retentionDays: 60,
  },
  wallet_low_balance: {
    type: 'wallet_low_balance',
    category: 'wallet',
    defaultTitle: 'Low Wallet Balance',
    defaultMessage: 'Your organization balance is {current_balance}. Top up soon to ensure uninterrupted event launches.',
    priority: 'high',
    defaultActionUrl: '/wallet/top-up',
    mandatory: false,
    duplicatesAllowed: false,
    retentionDays: 30,
  },
  theme_ready: {
    type: 'theme_ready',
    category: 'theme',
    defaultTitle: 'Theme Ready',
    defaultMessage: 'Custom theme "{theme_name}" for {game_name} is ready to be applied to your events.',
    priority: 'low',
    defaultActionUrl: '/games',
    mandatory: false,
    duplicatesAllowed: true,
    retentionDays: 45,
  },
  leaderboard_high_score: {
    type: 'leaderboard_high_score',
    category: 'leaderboard',
    defaultTitle: 'New High Score Record!',
    defaultMessage: '{player_name} set a new high score of {score} points on "{event_name}"!',
    priority: 'normal',
    defaultActionUrl: '/events',
    mandatory: false,
    duplicatesAllowed: true,
    retentionDays: 30,
  },
  showcase_draft_created: {
    type: 'showcase_draft_created',
    category: 'showcase',
    defaultTitle: 'Showcase Draft Created',
    defaultMessage: 'Draft showcase created for "{event_name}". You can preview and publish it anytime.',
    priority: 'normal',
    defaultActionUrl: '/events',
    mandatory: false,
    duplicatesAllowed: false,
    retentionDays: 60,
  },
  showcase_published: {
    type: 'showcase_published',
    category: 'showcase',
    defaultTitle: 'Showcase Published',
    defaultMessage: 'Your showcase for "{event_name}" is now live on the community showcase hub!',
    priority: 'normal',
    defaultActionUrl: '/events',
    mandatory: false,
    duplicatesAllowed: false,
    retentionDays: 90,
  },
  showcase_unpublished: {
    type: 'showcase_unpublished',
    category: 'showcase',
    defaultTitle: 'Showcase Unpublished',
    defaultMessage: 'Your showcase for "{event_name}" has been unpublished and is no longer publicly visible.',
    priority: 'normal',
    defaultActionUrl: '/events',
    mandatory: false,
    duplicatesAllowed: false,
    retentionDays: 60,
  },
  showcase_updated: {
    type: 'showcase_updated',
    category: 'showcase',
    defaultTitle: 'Showcase Updated',
    defaultMessage: 'Showcase details for "{event_name}" have been updated.',
    priority: 'low',
    defaultActionUrl: '/events',
    mandatory: false,
    duplicatesAllowed: true,
    retentionDays: 45,
  },
  payment_failed: {
    type: 'payment_failed',
    category: 'billing',
    defaultTitle: 'Payment Failed',
    defaultMessage: 'Payment of {amount} for {subject} was not successful. Please retry with a valid payment method.',
    priority: 'urgent',
    defaultActionUrl: '/wallet',
    mandatory: true,
    duplicatesAllowed: true,
    retentionDays: 90,
  },
  event_payment_failed: {
    type: 'event_payment_failed',
    category: 'billing',
    defaultTitle: 'Event Activation Payment Failed',
    defaultMessage: 'Payment for event "{event_name}" could not be completed. Please review your billing details to activate the event.',
    priority: 'urgent',
    defaultActionUrl: '/events',
    mandatory: true,
    duplicatesAllowed: true,
    retentionDays: 90,
  },
  event_approaching: {
    type: 'event_approaching',
    category: 'event',
    defaultTitle: 'Your Event Starts Tomorrow',
    defaultMessage: '"{event_name}" starts on {start_date}. Ensure custom themes and arcade setups are ready.',
    priority: 'normal',
    defaultActionUrl: '/events',
    mandatory: false,
    duplicatesAllowed: false,
    retentionDays: 30,
  },
  insufficient_balance: {
    type: 'insufficient_balance',
    category: 'wallet',
    defaultTitle: 'Insufficient Balance',
    defaultMessage: 'Your organization wallet has insufficient funds ({current_balance}) to complete this transaction ({required_amount}).',
    priority: 'high',
    defaultActionUrl: '/wallet/top-up',
    mandatory: true,
    duplicatesAllowed: true,
    retentionDays: 45,
  },
  org_invitation: {
    type: 'org_invitation',
    category: 'security',
    defaultTitle: 'Team Workspace Invitation',
    defaultMessage: 'You have been invited to join "{org_name}" as a {role}.',
    priority: 'normal',
    defaultActionUrl: '/team',
    mandatory: true,
    duplicatesAllowed: false,
    retentionDays: 60,
  },
  member_joined: {
    type: 'member_joined',
    category: 'security',
    defaultTitle: 'New Team Member Joined',
    defaultMessage: '{member_name} has joined the organization "{org_name}".',
    priority: 'normal',
    defaultActionUrl: '/team',
    mandatory: false,
    duplicatesAllowed: true,
    retentionDays: 45,
  },
  security_settings_changed: {
    type: 'security_settings_changed',
    category: 'security',
    defaultTitle: 'Security Alert: Role or Workspace Changed',
    defaultMessage: 'A security or team permission change occurred: {details}',
    priority: 'urgent',
    defaultActionUrl: '/team',
    mandatory: true,
    duplicatesAllowed: true,
    retentionDays: 180,
  },
};

/**
 * Interpolates template strings using metadata keys.
 * E.g. "Payment of {amount} for {subject}" -> "Payment of RM1,400 for Gala Night"
 */
export function interpolateNotificationTemplate(
  template: string,
  metadata?: Record<string, any>
): string {
  if (!template || !metadata) return template;
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, key) => {
    if (key in metadata && metadata[key] !== undefined && metadata[key] !== null) {
      return String(metadata[key]);
    }
    return match;
  });
}

/**
 * Renders the authoritative title, message, and action URL for a given notification type and metadata.
 */
export function renderNotificationContent(
  type: NotificationType,
  metadata?: Record<string, any>,
  customTitle?: string,
  customMessage?: string,
  customActionUrl?: string
): { title: string; message: string; actionUrl?: string; priority: NotificationPriority; category: NotificationCategory } {
  const catalogItem = NOTIFICATION_CATALOG[type];
  if (!catalogItem) {
    return {
      title: customTitle || 'Notification',
      message: customMessage || 'You have a new update.',
      actionUrl: customActionUrl,
      priority: 'normal',
      category: 'event',
    };
  }

  const rawTitle = customTitle || catalogItem.defaultTitle;
  const rawMessage = customMessage || catalogItem.defaultMessage;
  const rawAction = customActionUrl || catalogItem.defaultActionUrl;

  return {
    title: interpolateNotificationTemplate(rawTitle, metadata),
    message: interpolateNotificationTemplate(rawMessage, metadata),
    actionUrl: rawAction ? interpolateNotificationTemplate(rawAction, metadata) : undefined,
    priority: catalogItem.priority,
    category: catalogItem.category,
  };
}
