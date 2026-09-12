import React, { useState, useRef, useEffect } from 'react';
import { Bell, CheckCheck, ExternalLink, Trash2, X, SlidersHorizontal, ChevronRight } from 'lucide-react';
import { useNotifications } from '../../context/NotificationContext';
import { formatNotificationTime, CATEGORY_VISUALS, PRIORITY_VISUALS } from '../../lib/notifications/formatters';
import { NotificationRecord } from '../../lib/notifications/types';
import { navigateTo } from '../../hooks/useRouteContext';

export const NotificationBell: React.FC = () => {
  const {
    notifications,
    unreadCount,
    loading,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    setIsOpenCenter,
    fetchNotifications,
  } = useNotifications();

  const [isOpen, setIsOpen] = useState(false);
  const [filterUnreadOnly, setFilterUnreadOnly] = useState(false);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  // Close dropdown on outside click or escape
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const handleNotificationClick = async (notif: NotificationRecord) => {
    if (!notif.is_read) {
      await markAsRead(notif.id);
    }
    setIsOpen(false);
    if (notif.action_url) {
      navigateTo(notif.action_url);
    }
  };

  const displayedNotifications = filterUnreadOnly
    ? notifications.filter((n) => !n.is_read)
    : notifications;

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell Button */}
      <button
        id="notification-bell-btn"
        onClick={() => {
          if (!isOpen) {
            fetchNotifications();
          }
          setIsOpen(!isOpen);
        }}
        title="Notifications"
        className={`relative p-2 rounded-xl transition-all cursor-pointer flex items-center justify-center ${
          isOpen
            ? 'bg-slate-800 text-amber-400 ring-1 ring-amber-500/40'
            : 'text-slate-300 hover:text-white hover:bg-slate-800/80 bg-slate-950 border border-slate-800'
        }`}
      >
        <Bell className="w-4 h-4 transition-transform group-hover:rotate-12" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-4 min-w-4 px-1 items-center justify-center rounded-full bg-amber-500 text-slate-950 text-[10px] font-black shadow-lg shadow-amber-500/30 ring-2 ring-slate-950 animate-in zoom-in-75">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Flyout Dropdown */}
      {isOpen && (
        <div
          id="notification-flyout"
          className="absolute right-0 mt-2 w-80 sm:w-96 max-w-[calc(100vw-24px)] bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl z-50 overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150"
        >
          {/* Header */}
          <div className="p-3.5 border-b border-slate-800 flex items-center justify-between bg-slate-900/90 backdrop-blur-sm">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-slate-100">Notifications</span>
              {unreadCount > 0 && (
                <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  {unreadCount} unread
                </span>
              )}
            </div>

            <div className="flex items-center gap-1.5">
              {unreadCount > 0 && (
                <button
                  id="mark-all-read-btn"
                  onClick={markAllAsRead}
                  title="Mark all notifications as read"
                  className="flex items-center gap-1 text-[11px] font-medium text-amber-400 hover:text-amber-300 hover:bg-amber-500/10 px-2 py-1 rounded-lg transition-colors cursor-pointer"
                >
                  <CheckCheck className="w-3.5 h-3.5" />
                  <span>Mark all read</span>
                </button>
              )}
            </div>
          </div>

          {/* Quick Filters */}
          <div className="px-3.5 py-2 border-b border-slate-800/80 bg-slate-950/40 flex items-center justify-between text-xs">
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setFilterUnreadOnly(false)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                  !filterUnreadOnly
                    ? 'bg-slate-800 text-white font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                All
              </button>
              <button
                onClick={() => setFilterUnreadOnly(true)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                  filterUnreadOnly
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30 font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Unread
              </button>
            </div>

            <button
              onClick={() => {
                setIsOpen(false);
                setIsOpenCenter(true);
              }}
              className="text-[11px] text-slate-400 hover:text-amber-400 flex items-center gap-1 transition-colors cursor-pointer font-medium"
            >
              <span>View full center</span>
              <ChevronRight className="w-3 h-3" />
            </button>
          </div>

          {/* Notifications List */}
          <div className="max-h-[380px] overflow-y-auto divide-y divide-slate-800/50">
            {loading && notifications.length === 0 ? (
              <div className="py-12 flex flex-col items-center justify-center text-slate-500 gap-2">
                <div className="w-5 h-5 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
                <span className="text-xs">Loading notifications...</span>
              </div>
            ) : displayedNotifications.length === 0 ? (
              <div className="py-12 px-4 text-center">
                <div className="w-10 h-10 rounded-full bg-slate-800/80 text-slate-400 flex items-center justify-center mx-auto mb-2.5">
                  <CheckCheck className="w-5 h-5 text-emerald-400" />
                </div>
                <div className="text-xs font-semibold text-slate-300">
                  {filterUnreadOnly ? 'No unread notifications' : 'All caught up!'}
                </div>
                <div className="text-[11px] text-slate-500 mt-1 max-w-[200px] mx-auto">
                  {filterUnreadOnly
                    ? 'All your notifications have been marked as read.'
                    : 'New alerts regarding events, billing, and games will appear here.'}
                </div>
              </div>
            ) : (
              displayedNotifications.slice(0, 15).map((notif) => {
                const categoryVisual = CATEGORY_VISUALS[notif.category] || CATEGORY_VISUALS.event;
                const priorityVisual = PRIORITY_VISUALS[notif.priority] || PRIORITY_VISUALS.normal;
                const IconComponent = categoryVisual.icon;

                return (
                  <div
                    key={notif.id}
                    onClick={() => handleNotificationClick(notif)}
                    className={`p-3 text-left transition-colors cursor-pointer group flex items-start gap-3 relative ${
                      !notif.is_read
                        ? 'bg-slate-900/90 hover:bg-slate-850'
                        : 'bg-slate-950/40 hover:bg-slate-900/60 opacity-80 hover:opacity-100'
                    }`}
                  >
                    {/* Unread indicator bar */}
                    {!notif.is_read && (
                      <div className="absolute left-0 top-3 bottom-3 w-0.5 bg-amber-400 rounded-r" />
                    )}

                    {/* Category Icon */}
                    <div
                      className={`w-8 h-8 rounded-xl shrink-0 flex items-center justify-center border ${categoryVisual.badgeClass}`}
                    >
                      <IconComponent className="w-4 h-4" />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0 pr-1">
                      <div className="flex items-center justify-between gap-1.5 mb-0.5">
                        <span
                          className={`text-xs truncate ${
                            !notif.is_read ? 'font-bold text-slate-100' : 'font-medium text-slate-300'
                          }`}
                        >
                          {notif.title}
                        </span>
                        <span className="text-[10px] text-slate-500 shrink-0 font-mono">
                          {formatNotificationTime(notif.created_at)}
                        </span>
                      </div>

                      <p className="text-[11px] text-slate-400 line-clamp-2 leading-relaxed">
                        {notif.message}
                      </p>

                      <div className="flex items-center gap-2 mt-1.5">
                        <span
                          className={`text-[9px] uppercase font-bold px-1.5 py-0.5 rounded border ${categoryVisual.badgeClass}`}
                        >
                          {categoryVisual.label}
                        </span>

                        {notif.priority === 'urgent' && (
                          <span
                            className={`text-[9px] uppercase font-bold px-1.5 py-0.5 rounded border ${priorityVisual.badgeClass}`}
                          >
                            Urgent
                          </span>
                        )}

                        {notif.action_url && (
                          <span className="text-[10px] text-amber-400 group-hover:underline flex items-center gap-0.5 ml-auto font-medium">
                            <span>Open</span>
                            <ExternalLink className="w-2.5 h-2.5" />
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer */}
          <div className="p-2.5 border-t border-slate-800 bg-slate-900/90 flex items-center justify-between text-xs">
            <button
              onClick={() => {
                setIsOpen(false);
                setIsOpenCenter(true);
              }}
              className="w-full text-center py-1.5 text-xs text-amber-400 hover:text-amber-300 hover:bg-amber-500/10 rounded-xl transition-colors font-semibold cursor-pointer"
            >
              Open Notification Center
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
