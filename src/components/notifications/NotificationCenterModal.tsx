import React, { useState, useMemo } from 'react';
import {
  X,
  CheckCheck,
  Trash2,
  ExternalLink,
  Search,
  Filter,
  Bell,
  SlidersHorizontal,
  Check,
  ChevronRight,
  Sparkles,
} from 'lucide-react';
import { useNotifications } from '../../context/NotificationContext';
import { useLocalization } from '../../context/LocalizationContext';
import { formatNotificationTime, CATEGORY_VISUALS, PRIORITY_VISUALS, resolveNotificationUrl } from '../../lib/notifications/formatters';
import { NotificationRecord, NotificationCategory } from '../../lib/notifications/types';
import { navigateTo } from '../../hooks/useRouteContext';

export const NotificationCenterModal: React.FC = () => {
  const { t } = useLocalization();
  const {
    isOpenCenter,
    setIsOpenCenter,
    notifications,
    unreadCount,
    loading,
    markAsRead,
    markAllAsRead,
    deleteNotification,
  } = useNotifications();

  const CATEGORIES: { key: NotificationCategory | 'all'; label: string }[] = useMemo(() => [
    { key: 'all', label: t('notification.all', undefined, 'All Notifications') },
    { key: 'event', label: t('nav.events') },
    { key: 'billing', label: t('nav.wallet', undefined, 'Billing') },
    { key: 'wallet', label: t('nav.wallet') },
    { key: 'theme', label: t('studio.title', undefined, 'Themes') },
    { key: 'leaderboard', label: t('event.leaderboard') },
    { key: 'showcase', label: t('showcase.title') },
    { key: 'security', label: t('common.security', undefined, 'Security') },
  ], [t]);

  const [activeCategory, setActiveCategory] = useState<NotificationCategory | 'all'>('all');
  const [unreadOnly, setUnreadOnly] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');

  if (!isOpenCenter) return null;

  // Filtered notifications
  const filteredNotifications = useMemo(() => {
    return notifications.filter((n) => {
      // 1. Unread filter
      if (unreadOnly && n.is_read) return false;

      // 2. Category filter
      if (activeCategory !== 'all' && n.category !== activeCategory) return false;

      // 3. Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchTitle = n.title?.toLowerCase().includes(q);
        const matchMsg = n.message?.toLowerCase().includes(q);
        const matchCat = n.category?.toLowerCase().includes(q);
        if (!matchTitle && !matchMsg && !matchCat) return false;
      }

      return true;
    });
  }, [notifications, unreadOnly, activeCategory, searchQuery]);

  const handleActionClick = async (notif: NotificationRecord) => {
    if (!notif.is_read) {
      await markAsRead(notif.id);
    }
    const targetUrl = resolveNotificationUrl(notif);
    if (targetUrl) {
      setIsOpenCenter(false);
      navigateTo(targetUrl);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
      <div
        id="notification-center-modal"
        className="relative w-full max-w-4xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden animate-in zoom-in-95 duration-200"
      >
        {/* Header */}
        <div className="p-4 sm:p-6 border-b border-slate-800 flex items-center justify-between bg-slate-900/90 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Bell className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg sm:text-xl font-bold text-white">{t('notification.title')}</h2>
                {unreadCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    {unreadCount} {t('notification.unread')}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400">
                {t('notification.description', undefined, 'Manage all your account, event, billing, and showcase activity alerts.')}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <button
                id="modal-mark-all-read"
                onClick={markAllAsRead}
                className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-750 text-xs font-semibold text-amber-300 hover:text-amber-200 transition-colors border border-slate-700/60 cursor-pointer"
              >
                <CheckCheck className="w-4 h-4" />
                <span>{t('notification.markAllRead')}</span>
              </button>
            )}

            <button
              onClick={() => setIsOpenCenter(false)}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Controls: Category Tabs & Search Bar */}
        <div className="p-4 border-b border-slate-800 bg-slate-950/40 space-y-3 shrink-0">
          <div className="flex flex-col sm:flex-row gap-2 sm:items-center justify-between">
            {/* Search Input */}
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t('notification.searchPlaceholder')}
                className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-4 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500/50"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Unread Only Toggle */}
            <div className="flex items-center gap-2 shrink-0">
              <button
                id="unread-filter-toggle"
                onClick={() => setUnreadOnly(!unreadOnly)}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                  unreadOnly
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 ring-1 ring-amber-500/30'
                    : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
                }`}
              >
                <div
                  className={`w-3.5 h-3.5 rounded border flex items-center justify-center ${
                    unreadOnly
                      ? 'border-amber-400 bg-amber-400 text-slate-950'
                      : 'border-slate-600'
                  }`}
                >
                  {unreadOnly && <Check className="w-3 h-3 stroke-[3]" />}
                </div>
                <span>{t('notification.unreadOnly')}</span>
              </button>
            </div>
          </div>

          {/* Category Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
            {CATEGORIES.map((cat) => {
              const count =
                cat.key === 'all'
                  ? notifications.length
                  : notifications.filter((n) => n.category === cat.key).length;

              const unreadCatCount =
                cat.key === 'all'
                  ? notifications.filter((n) => !n.is_read).length
                  : notifications.filter((n) => n.category === cat.key && !n.is_read).length;

              return (
                <button
                  key={cat.key}
                  onClick={() => setActiveCategory(cat.key)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition-colors cursor-pointer border ${
                    activeCategory === cat.key
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 font-bold'
                      : 'bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border-slate-800'
                  }`}
                >
                  <span>{cat.label}</span>
                  {count > 0 && (
                    <span
                      className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                        unreadCatCount > 0
                          ? 'bg-amber-500 text-slate-950 font-bold'
                          : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Notifications List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2.5 divide-y divide-transparent">
          {loading && notifications.length === 0 ? (
            <div className="py-20 flex flex-col items-center justify-center text-slate-500 gap-3">
              <div className="w-7 h-7 border-3 border-amber-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-xs">{t('common.loading')}</p>
            </div>
          ) : filteredNotifications.length === 0 ? (
            <div className="py-20 text-center space-y-3">
              <div className="w-14 h-14 rounded-3xl bg-slate-800/80 text-slate-400 flex items-center justify-center mx-auto border border-slate-750">
                <CheckCheck className="w-7 h-7 text-emerald-400" />
              </div>
              <h3 className="text-sm font-bold text-slate-200">
                {unreadOnly
                  ? t('notification.noNotificationsFound', undefined, 'No unread notifications')
                  : searchQuery
                  ? t('notification.noNotificationsFound', undefined, 'No matching notifications found')
                  : t('notification.noNotifications', undefined, 'No notifications in this category')}
              </h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                {unreadOnly
                  ? t('notification.allCaughtUp', undefined, 'You are all caught up! Switch off the unread filter to see your full history.')
                  : t('notification.historyArchive', undefined, 'When relevant activity happens in your workspace, notifications will be archived here.')}
              </p>
            </div>
          ) : (
            filteredNotifications.map((notif) => {
              const categoryVisual = CATEGORY_VISUALS[notif.category] || CATEGORY_VISUALS.event;
              const priorityVisual = PRIORITY_VISUALS[notif.priority] || PRIORITY_VISUALS.normal;
              const IconComponent = categoryVisual.icon;

              return (
                <div
                  key={notif.id}
                  className={`p-4 rounded-2xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                    !notif.is_read
                      ? 'bg-slate-850/90 border-amber-500/30 shadow-sm'
                      : 'bg-slate-900/60 border-slate-800 hover:border-slate-700 opacity-85 hover:opacity-100'
                  }`}
                >
                  <div className="flex items-start gap-3.5 flex-1 min-w-0">
                    {/* Icon */}
                    <div
                      className={`w-10 h-10 rounded-2xl shrink-0 flex items-center justify-center border ${categoryVisual.badgeClass}`}
                    >
                      <IconComponent className="w-5 h-5" />
                    </div>

                    {/* Content Details */}
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`text-xs uppercase font-bold px-2 py-0.5 rounded-lg border ${categoryVisual.badgeClass}`}
                        >
                          {categoryVisual.label}
                        </span>

                        <span
                          className={`text-xs uppercase font-bold px-2 py-0.5 rounded-lg border ${priorityVisual.badgeClass}`}
                        >
                          {priorityVisual.label}
                        </span>

                        {!notif.is_read && (
                          <span className="w-2 h-2 rounded-full bg-amber-400 ring-2 ring-amber-400/30" />
                        )}

                        <span className="text-[11px] text-slate-400 ml-auto font-mono">
                          {formatNotificationTime(notif.created_at)}
                        </span>
                      </div>

                      <h4
                        className={`text-sm ${
                          !notif.is_read ? 'font-bold text-white' : 'font-semibold text-slate-200'
                        }`}
                      >
                        {notif.title}
                      </h4>

                      <p className="text-xs text-slate-300 leading-relaxed max-w-2xl">
                        {notif.message}
                      </p>
                    </div>
                  </div>

                  {/* Actions Right */}
                  <div className="flex items-center gap-2 sm:self-center shrink-0 border-t sm:border-t-0 border-slate-800 pt-2 sm:pt-0">
                    {resolveNotificationUrl(notif) && (
                      <button
                        onClick={() => handleActionClick(notif)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-bold transition-colors cursor-pointer shadow-sm shadow-amber-500/20"
                      >
                        <span>{t('common.view')}</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </button>
                    )}

                    {!notif.is_read ? (
                      <button
                        onClick={() => markAsRead(notif.id)}
                        title={t('notification.markAllRead')}
                        className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-750 text-xs font-medium text-slate-300 hover:text-white transition-colors border border-slate-700/60 cursor-pointer"
                      >
                        {t('notification.markAsRead', undefined, 'Mark read')}
                      </button>
                    ) : (
                      <span className="text-[11px] text-slate-400 px-2 py-1 flex items-center gap-1">
                        <Check className="w-3 h-3 text-emerald-400" />
                        <span>{t('notification.read', undefined, 'Read')}</span>
                      </span>
                    )}

                    <button
                      onClick={() => deleteNotification(notif.id)}
                      title={t('common.delete')}
                      className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-xl transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-3 sm:p-4 border-t border-slate-800 bg-slate-900/90 flex items-center justify-between text-xs text-slate-400 shrink-0">
          <span className="text-[11px] font-mono">
            {t('common.showing', undefined, 'Showing')} {filteredNotifications.length} {t('common.of', undefined, 'of')} {notifications.length} {t('notification.title', undefined, 'notifications')}
          </span>

          <button
            onClick={() => setIsOpenCenter(false)}
            className="px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-200 text-xs font-semibold transition-colors cursor-pointer"
          >
            {t('common.close')}
          </button>
        </div>
      </div>
    </div>
  );
};
