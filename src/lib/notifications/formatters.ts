import React from 'react';
import {
  CreditCard,
  Calendar,
  Palette,
  Trophy,
  Sparkles,
  ShieldAlert,
  Wallet,
  Bell,
  LucideIcon,
} from 'lucide-react';
import { NotificationCategory, NotificationPriority, NotificationRecord, NOTIFICATION_CATALOG } from './types';

export function formatNotificationTime(dateStr: string): string {
  if (!dateStr) return '';
  const now = Date.now();
  const date = new Date(dateStr).getTime();
  if (isNaN(date)) return '';
  
  const diffSec = Math.max(0, Math.floor((now - date) / 1000));
  if (diffSec < 45) return 'just now';
  if (diffSec < 3600) {
    const mins = Math.max(1, Math.floor(diffSec / 60));
    return `${mins} ${mins === 1 ? 'minute' : 'minutes'} ago`;
  }
  if (diffSec < 86400) {
    const hours = Math.max(1, Math.floor(diffSec / 3600));
    return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
  }
  if (diffSec < 172800) return 'Yesterday';
  if (diffSec < 604800) {
    const days = Math.floor(diffSec / 86400);
    return `${days} ${days === 1 ? 'day' : 'days'} ago`;
  }

  const d = new Date(date);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/**
 * Resolves destination navigation route for a notification.
 * Uses explicit action_url, catalog defaultActionUrl, or entity/category fallback.
 */
export function resolveNotificationUrl(notif: NotificationRecord): string {
  if (notif.action_url && notif.action_url.trim().length > 0) {
    return notif.action_url;
  }
  const catalogItem = NOTIFICATION_CATALOG[notif.type];
  if (catalogItem?.defaultActionUrl) {
    return catalogItem.defaultActionUrl;
  }
  switch (notif.category) {
    case 'event':
    case 'leaderboard':
      return '/events';
    case 'wallet':
    case 'billing':
      return '/wallet';
    case 'theme':
      return '/games';
    case 'showcase':
      return notif.entity_id ? `/showcase/${notif.entity_id}` : '/events';
    default:
      return '/events';
  }
}

export interface CategoryVisualConfig {
  label: string;
  icon: LucideIcon;
  badgeClass: string;
  iconBgClass: string;
  iconColorClass: string;
}

export const CATEGORY_VISUALS: Record<NotificationCategory, CategoryVisualConfig> = {
  billing: {
    label: 'Billing',
    icon: CreditCard,
    badgeClass: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
    iconBgClass: 'bg-emerald-500/10',
    iconColorClass: 'text-emerald-400',
  },
  event: {
    label: 'Events',
    icon: Calendar,
    badgeClass: 'text-sky-400 bg-sky-500/10 border-sky-500/30',
    iconBgClass: 'bg-sky-500/10',
    iconColorClass: 'text-sky-400',
  },
  theme: {
    label: 'Themes',
    icon: Palette,
    badgeClass: 'text-purple-400 bg-purple-500/10 border-purple-500/30',
    iconBgClass: 'bg-purple-500/10',
    iconColorClass: 'text-purple-400',
  },
  leaderboard: {
    label: 'Leaderboard',
    icon: Trophy,
    badgeClass: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
    iconBgClass: 'bg-amber-500/10',
    iconColorClass: 'text-amber-400',
  },
  showcase: {
    label: 'Showcase',
    icon: Sparkles,
    badgeClass: 'text-pink-400 bg-pink-500/10 border-pink-500/30',
    iconBgClass: 'bg-pink-500/10',
    iconColorClass: 'text-pink-400',
  },
  security: {
    label: 'Security',
    icon: ShieldAlert,
    badgeClass: 'text-rose-400 bg-rose-500/10 border-rose-500/30',
    iconBgClass: 'bg-rose-500/10',
    iconColorClass: 'text-rose-400',
  },
  wallet: {
    label: 'Wallet',
    icon: Wallet,
    badgeClass: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
    iconBgClass: 'bg-amber-500/10',
    iconColorClass: 'text-amber-400',
  },
};

export const PRIORITY_VISUALS: Record<NotificationPriority, { label: string; badgeClass: string; dotClass: string }> = {
  urgent: {
    label: 'Urgent',
    badgeClass: 'text-rose-300 bg-rose-500/20 border-rose-500/40',
    dotClass: 'bg-rose-500',
  },
  high: {
    label: 'High',
    badgeClass: 'text-amber-300 bg-amber-500/20 border-amber-500/40',
    dotClass: 'bg-amber-500',
  },
  normal: {
    label: 'Normal',
    badgeClass: 'text-sky-300 bg-sky-500/20 border-sky-500/40',
    dotClass: 'bg-sky-500',
  },
  low: {
    label: 'Low',
    badgeClass: 'text-slate-400 bg-slate-500/20 border-slate-500/40',
    dotClass: 'bg-slate-500',
  },
};
