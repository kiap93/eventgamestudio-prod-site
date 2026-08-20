import React from 'react';
import { UploadQueueItem } from '../../../types/showcase';
import {
  UploadCloud,
  CheckCircle2,
  AlertCircle,
  RotateCw,
  X,
  Film,
  Image as ImageIcon,
  Loader2,
} from 'lucide-react';

interface ShowcaseMediaUploadQueueProps {
  queue: UploadQueueItem[];
  onRetry: (itemId: string) => void;
  onRemove: (itemId: string) => void;
  onClearCompleted: () => void;
}

export const ShowcaseMediaUploadQueue: React.FC<ShowcaseMediaUploadQueueProps> = ({
  queue,
  onRetry,
  onRemove,
  onClearCompleted,
}) => {
  if (queue.length === 0) return null;

  const completedCount = queue.filter((i) => i.status === 'completed').length;
  const errorCount = queue.filter((i) => i.status === 'error').length;
  const inProgressCount = queue.filter((i) => i.status === 'uploading' || i.status === 'saving' || i.status === 'pending').length;

  const formatSize = (bytes: number) => {
    if (!bytes) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="bg-slate-950/90 border border-slate-800 rounded-3xl p-5 space-y-4 shadow-xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center justify-center">
            <UploadCloud className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-slate-200">
              Media Upload Queue ({queue.length})
            </h4>
            <div className="flex items-center gap-2 text-[11px] text-slate-400">
              {inProgressCount > 0 && <span className="text-amber-400 font-medium">{inProgressCount} uploading...</span>}
              {completedCount > 0 && <span className="text-emerald-400 font-medium">{completedCount} finished</span>}
              {errorCount > 0 && <span className="text-red-400 font-medium">{errorCount} failed</span>}
            </div>
          </div>
        </div>

        {completedCount > 0 && inProgressCount === 0 && (
          <button
            type="button"
            onClick={onClearCompleted}
            className="text-xs text-slate-400 hover:text-slate-200 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 hover:bg-slate-800 transition-colors"
          >
            Clear Completed
          </button>
        )}
      </div>

      {/* Queue items list */}
      <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1">
        {queue.map((item) => {
          const isVideo = item.mediaType === 'VIDEO';

          return (
            <div
              key={item.id}
              className="p-3 bg-slate-900/80 border border-slate-800/80 rounded-2xl flex items-center gap-3 transition-all"
            >
              {/* Thumbnail / Icon */}
              <div className="w-10 h-10 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-center shrink-0 overflow-hidden relative">
                {item.previewUrl ? (
                  isVideo ? (
                    <div className="relative w-full h-full flex items-center justify-center bg-purple-950/40">
                      <Film className="w-5 h-5 text-purple-400" />
                    </div>
                  ) : (
                    <img
                      src={item.previewUrl}
                      alt={item.file.name}
                      className="w-full h-full object-cover"
                    />
                  )
                ) : isVideo ? (
                  <Film className="w-5 h-5 text-purple-400" />
                ) : (
                  <ImageIcon className="w-5 h-5 text-emerald-400" />
                )}
              </div>

              {/* Info & Progress */}
              <div className="flex-1 min-w-0 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span
                      className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${
                        isVideo ? 'bg-purple-500/20 text-purple-300' : 'bg-emerald-500/20 text-emerald-300'
                      }`}
                    >
                      {item.mediaType}
                    </span>
                    <span className="text-xs font-semibold text-slate-200 truncate" title={item.file.name}>
                      {item.file.name}
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-400 shrink-0 font-mono">
                    {formatSize(item.file.size)}
                  </span>
                </div>

                {/* Progress Bar & Status text */}
                <div className="space-y-1">
                  <div className="w-full h-1.5 bg-slate-950 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-300 ${
                        item.status === 'error'
                          ? 'bg-red-500'
                          : item.status === 'completed'
                          ? 'bg-emerald-500'
                          : 'bg-amber-400'
                      }`}
                      style={{
                        width:
                          item.status === 'completed'
                            ? '100%'
                            : item.status === 'error'
                            ? '100%'
                            : `${item.progress}%`,
                      }}
                    />
                  </div>

                  <div className="flex items-center justify-between text-[10px]">
                    {item.status === 'uploading' && (
                      <span className="text-amber-400 font-medium flex items-center gap-1">
                        <Loader2 className="w-3 h-3 animate-spin" /> Uploading {item.progress}%
                      </span>
                    )}
                    {item.status === 'saving' && (
                      <span className="text-amber-400 font-medium flex items-center gap-1">
                        <Loader2 className="w-3 h-3 animate-spin" /> Saving metadata...
                      </span>
                    )}
                    {item.status === 'completed' && (
                      <span className="text-emerald-400 font-medium flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" /> Upload complete
                      </span>
                    )}
                    {item.status === 'pending' && (
                      <span className="text-slate-400">Queued for upload...</span>
                    )}
                    {item.status === 'error' && (
                      <span className="text-red-400 font-medium flex items-center gap-1 truncate" title={item.errorMessage}>
                        <AlertCircle className="w-3 h-3 shrink-0" /> {item.errorMessage || 'Upload failed'}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Actions: Retry or Remove */}
              <div className="flex items-center gap-1 shrink-0">
                {item.status === 'error' && (
                  <button
                    type="button"
                    onClick={() => onRetry(item.id)}
                    className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 transition-colors"
                    title="Retry Upload"
                  >
                    <RotateCw className="w-3.5 h-3.5" />
                  </button>
                )}

                {(item.status === 'completed' || item.status === 'error') && (
                  <button
                    type="button"
                    onClick={() => onRemove(item.id)}
                    className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
                    title="Dismiss"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
