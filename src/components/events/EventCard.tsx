import React, { useState } from 'react';
import {
  Calendar,
  Clock,
  ExternalLink,
  Copy,
  Check,
  Edit2,
  Trash2,
  Ban,
  Gamepad2,
  Sparkles,
} from 'lucide-react';
import { navigateTo } from '../../hooks/useRouteContext';

interface EventCardProps {
  event: any;
  userRole?: string;
  onEdit: (event: any) => void;
  onDelete: (eventId: string) => void;
  onCancel: (eventId: string) => void;
}

export const EventCard: React.FC<EventCardProps> = ({
  event,
  userRole,
  onEdit,
  onDelete,
  onCancel,
}) => {
  const [copied, setCopied] = useState(false);

  const publicUrl = `${window.location.origin}/e/${event.public_token}`;
  const isViewer = userRole === 'viewer';
  const isOwnerOrAdmin = ['owner', 'admin'].includes(userRole || '');

  const copyLink = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy public URL', err);
    }
  };

  const openPublicGame = (e: React.MouseEvent) => {
    e.stopPropagation();
    window.open(publicUrl, '_blank');
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'live':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping inline-block" />
            Live Now
          </span>
        );
      case 'scheduled':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-blue-500/10 border border-blue-500/30 text-blue-400">
            <Clock className="w-3 h-3" />
            Scheduled
          </span>
        );
      case 'expired':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-slate-800 border border-slate-700 text-slate-400">
            Expired
          </span>
        );
      case 'cancelled':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-red-500/10 border border-red-500/30 text-red-400">
            <Ban className="w-3 h-3" />
            Cancelled
          </span>
        );
      case 'draft':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-500/10 border border-amber-500/30 text-amber-400">
            Draft
          </span>
        );
    }
  };

  const gameName = event.game?.name || 'Durian Catcher';
  const themeName = event.game_theme?.name || 'Theme';

  const startDateFormatted = new Date(event.starts_at).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const expireDateFormatted = new Date(event.expires_at).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-lg hover:border-slate-700 transition-all flex flex-col justify-between space-y-4">
      {/* Top Card Section: Status and Title */}
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          {getStatusBadge(event.calculated_status || event.status)}
          <span className="text-[10px] font-mono text-slate-500">
            Token: {event.public_token}
          </span>
        </div>

        <div>
          <h3 className="text-base font-bold text-slate-100 group-hover:text-amber-400 transition-colors">
            {event.name}
          </h3>
          {/* Game & Theme single association */}
          <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-400">
            <Gamepad2 className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span className="font-semibold text-slate-300">{gameName}</span>
            <span className="text-slate-600">/</span>
            <span className="text-amber-300 font-medium">{themeName}</span>
          </div>
        </div>
      </div>

      {/* Schedule Window Details */}
      <div className="bg-slate-950/80 border border-slate-800/80 rounded-2xl p-3 space-y-1.5 text-[11px]">
        <div className="flex items-center justify-between text-slate-400">
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3 text-slate-500" />
            Starts:
          </span>
          <span className="text-slate-200 font-mono">{startDateFormatted}</span>
        </div>
        <div className="flex items-center justify-between text-slate-400">
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3 text-slate-500" />
            Expires:
          </span>
          <span className="text-slate-200 font-mono">{expireDateFormatted}</span>
        </div>
      </div>

      {/* Public URL Box */}
      <div className="flex items-center justify-between gap-2 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs">
        <span className="font-mono text-[11px] text-slate-400 truncate">
          /e/{event.public_token}
        </span>
        <button
          onClick={copyLink}
          className="flex items-center gap-1 text-[11px] font-semibold text-amber-400 hover:text-amber-300 shrink-0 transition-colors"
          title="Copy Public Link"
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-emerald-400">Copied</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>

      {/* Card Actions */}
      <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button
            onClick={openPublicGame}
            className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 px-3 py-1.5 rounded-xl text-xs font-bold transition-all shadow-sm shadow-amber-500/20"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>Open Event Link</span>
          </button>
        </div>

        {!isViewer && (
          <div className="flex items-center gap-1">
            <button
              onClick={() => onEdit(event)}
              className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-slate-100 rounded-lg text-xs transition-colors"
              title="Edit Event"
            >
              <Edit2 className="w-3.5 h-3.5" />
            </button>

            {event.status !== 'cancelled' && (
              <button
                onClick={() => onCancel(event.id)}
                className="p-1.5 bg-slate-800 hover:bg-red-500/20 text-slate-400 hover:text-red-400 rounded-lg text-xs transition-colors"
                title="Cancel Event"
              >
                <Ban className="w-3.5 h-3.5" />
              </button>
            )}

            {isOwnerOrAdmin && (
              <button
                onClick={() => onDelete(event.id)}
                className="p-1.5 bg-slate-800 hover:bg-red-500/20 text-slate-400 hover:text-red-400 rounded-lg text-xs transition-colors"
                title="Delete Event"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
