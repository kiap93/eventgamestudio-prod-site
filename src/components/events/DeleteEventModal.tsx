import React, { useState } from 'react';
import { Trash2, AlertTriangle, X, Loader2 } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { EventRecord, EventWithDetails } from '../../types';
import { useLocalization } from '../../context/LocalizationContext';

interface DeleteEventModalProps {
  isOpen: boolean;
  event: EventWithDetails | EventRecord | null;
  onClose: () => void;
  onSuccess: (eventId: string) => void;
}

export const DeleteEventModal: React.FC<DeleteEventModalProps> = ({
  isOpen,
  event,
  onClose,
  onSuccess,
}) => {
  const { t } = useLocalization();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen || !event) return null;

  const handleDelete = async () => {
    try {
      setSubmitting(true);
      setError(null);
      const res = await apiFetch(`/api/events/${event.id}`, {
        method: 'DELETE',
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.message || data.error || 'Failed to delete event');
      }

      onSuccess(event.id);
      onClose();
    } catch (err: any) {
      console.error('Delete event error:', err);
      setError(err.message || 'Error deleting event');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200 font-sans">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-slate-800 flex items-center justify-between bg-slate-900/50">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-400">
              <Trash2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-100">{t('event.deleteModalTitle')}</h2>
              <p className="text-xs text-slate-400 font-mono truncate max-w-[240px]">
                {event.name}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={submitting}
            className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4 text-xs text-slate-300">
          {error && (
            <div className="p-3.5 bg-red-500/10 border border-red-500/30 rounded-2xl text-red-300 text-xs flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 shrink-0 text-red-400 mt-0.5" />
              <div className="space-y-1">
                <p className="font-bold text-red-200">{t('events.deleteFailed', undefined, 'Deletion Failed')}</p>
                <p className="text-red-300 leading-relaxed">{error}</p>
              </div>
            </div>
          )}

          {/* Event Details Card */}
          <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-4 space-y-2">
            <div className="text-[11px] text-slate-400 uppercase tracking-wider font-semibold">
              {t('events.eventToDelete', undefined, 'Event to Delete')}
            </div>
            <div className="text-sm font-bold text-slate-100 break-words">
              {event.name}
            </div>
            {event.public_token && (
              <div className="text-[11px] text-slate-400 font-mono">
                {t('events.tokenLabel', { token: '' }, 'Token: ')}<span className="text-amber-400">{event.public_token}</span>
              </div>
            )}
          </div>

          {/* Cannot Be Undone Warning Callout */}
          <div className="p-3.5 bg-amber-500/10 border border-amber-500/30 rounded-2xl text-amber-300 text-xs flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
            <div className="space-y-1">
              <p className="font-bold text-amber-200">{t('events.deleteCannotBeUndoneWarning', undefined, 'Warning: This action cannot be undone.')}</p>
              <p className="text-amber-300/90 leading-relaxed">
                {t('events.deleteUnpaidWarningDesc', undefined, 'Permanently deleting this unpaid event will remove all configured tournament settings, test records, and public URLs.')}
              </p>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-6 border-t border-slate-800 bg-slate-900/50 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors cursor-pointer"
          >
            {t('common.cancel')}
          </button>

          <button
            type="button"
            onClick={handleDelete}
            disabled={submitting}
            className="flex items-center gap-2 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white font-bold px-5 py-2 rounded-xl text-xs transition-all shadow-lg shadow-red-600/20 cursor-pointer"
          >
            {submitting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>{t('common.deleting', undefined, 'Deleting...')}</span>
              </>
            ) : (
              <>
                <Trash2 className="w-3.5 h-3.5" />
                <span>{t('event.confirmDelete', undefined, 'Confirm Delete')}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
