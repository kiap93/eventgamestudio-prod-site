import React, { useState, useRef, useEffect } from 'react';
import { Bell, CheckCheck, ArrowRight } from 'lucide-react';
import { useNotifications } from '../../context/NotificationContext';
import { formatNotificationTime, resolveNotificationUrl } from '../../lib/notifications/formatters';
import { NotificationRecord } from '../../lib/notifications/types';
import { navigateTo } from '../../hooks/useRouteContext';

export const NotificationBell: React.FC = () => {
  const {
    notifications,
    unreadCount,
    loading,
    markAsRead,
    markAllAsRead,
    setIsOpenCenter,
    fetchNotifications,
  } = useNotifications();

  const [isOpen, setIsOpen] = useState(false);
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
    const targetUrl = resolveNotificationUrl(notif);
    if (targetUrl) {
      navigateTo(targetUrl);
    }
  };

  const handleViewAllClick = () => {
    setIsOpen(false);
    setIsOpenCenter(true);
  };

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
        aria-label="Notifications"
        className={`relative p-2 rounded-xl transition-all cursor-pointer flex items-center justify-center shrink-0 ${
          isOpen
            ? 'bg-slate-800 text-amber-400 ring-1 ring-amber-500/40 shadow-sm'
            : 'text-slate-300 hover:text-white hover:bg-slate-800/80 bg-slate-950 border border-slate-800'
        }`}
      >
        <Bell className="w-4 h-4 transition-transform group-hover:rotate-12" />
        {unreadCount > 0 && (
          <span
            id="notification-unread-badge"
            className="absolute -top-1 -right-1 flex h-4 min-w-4 px-1 items-center justify-center rounded-full bg-amber-500 text-slate-950 text-[10px] font-black shadow-lg shadow-amber-500/30 ring-2 ring-slate-950 animate-in zoom-in-75"
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown Popover */}
      {isOpen && (
        <div
          id="notification-dropdown-popover"
          className="absolute right-0 mt-2 w-80 sm:w-96 max-w-[calc(100vw-24px)] bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl z-50 overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150"
        >
          {/* Header: [Notifications (unread badge)]   [View all →] */}
          <div className="p-3.5 border-b border-slate-800 flex items-center justify-between bg-slate-900/95 backdrop-blur-sm shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-slate-100">Notifications</span>
              {unreadCount > 0 && (
                <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  {unreadCount} unread
                </span>
              )}
            </div>

            <button
              id="view-all-notifications-btn"
              onClick={handleViewAllClick}
              className="text-xs font-semibold text-amber-400 hover:text-amber-300 flex items-center gap-1 transition-colors cursor-pointer"
            >
              <span>View all</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>

          {/* Notifications List (Newest first) */}
          <div className="max-h-[380px] overflow-y-auto divide-y divide-slate-800/60 scrollbar-thin">
            {loading && notifications.length === 0 ? (
              <div className="py-12 flex flex-col items-center justify-center text-slate-500 gap-2">
                <div className="w-5 h-5 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
                <span className="text-xs">Loading notifications...</span>
              </div>
            ) : notifications.length === 0 ? (
              <div className="py-12 px-4 text-center">
                <div className="w-10 h-10 rounded-full bg-slate-800/80 text-slate-400 flex items-center justify-center mx-auto mb-2.5">
                  <CheckCheck className="w-5 h-5 text-emerald-400" />
                </div>
                <div className="text-xs font-semibold text-slate-200">
                  No notifications yet
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  You're all caught up.
                </div>
              </div>
            ) : (
              notifications.slice(0, 15).map((notif) => {
                return (
                  <button
                    key={notif.id}
                    onClick={() => handleNotificationClick(notif)}
                    className={`w-full p-3 text-left transition-colors cursor-pointer flex items-start gap-2.5 relative ${
                      !notif.is_read
                        ? 'bg-slate-850/90 hover:bg-slate-800'
                        : 'bg-slate-900/40 hover:bg-slate-850/60 opacity-80 hover:opacity-100'
                    }`}
                  >
                    {/* Unread indicator dot ● */}
                    <div className="w-2 shrink-0 pt-1.5 flex justify-center">
                      {!notif.is_read ? (
                        <span className="w-2 h-2 rounded-full bg-amber-400 shadow-sm shadow-amber-400/50" />
                      ) : (
                        <span className="w-2 h-2" />
                      )}
                    </div>

                    {/* Content Body */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-1.5 mb-0.5">
                        <span
                          className={`text-xs leading-snug line-clamp-1 ${
                            !notif.is_read ? 'font-bold text-white' : 'font-medium text-slate-300'
                          }`}
                        >
                          {notif.title}
                        </span>
                        <span className="text-[10px] text-slate-400 shrink-0 font-mono">
                          {formatNotificationTime(notif.created_at)}
                        </span>
                      </div>

                      <p className="text-[11px] text-slate-400 line-clamp-2 leading-relaxed">
                        {notif.message}
                      </p>
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {/* Footer: [Mark all as read] */}
          <div className="p-2.5 border-t border-slate-800 bg-slate-900/95 flex items-center justify-center shrink-0">
            <button
              id="dropdown-mark-all-read-btn"
              onClick={markAllAsRead}
              disabled={unreadCount === 0}
              className={`w-full py-2 px-3 text-xs rounded-xl font-semibold transition-all flex items-center justify-center gap-1.5 ${
                unreadCount > 0
                  ? 'text-amber-300 hover:text-amber-200 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 cursor-pointer'
                  : 'text-slate-500 bg-slate-950/40 border border-slate-800/80 cursor-default opacity-60'
              }`}
            >
              <CheckCheck className="w-3.5 h-3.5" />
              <span>Mark all as read</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
