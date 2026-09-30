import React, { useState } from 'react';
import { EventShowcaseMedia } from '../../../types/showcase';
import { useLocalization } from '../../../context/LocalizationContext';
import {
  Film,
  Image as ImageIcon,
  Play,
  Trash2,
  ChevronUp,
  ChevronDown,
  Eye,
  Camera,
  ExternalLink,
  GripVertical,
} from 'lucide-react';

interface ShowcaseMediaCardProps {
  media: EventShowcaseMedia;
  index: number;
  totalCount: number;
  canEdit: boolean;
  onPreview: (media: EventShowcaseMedia) => void;
  onDelete: (mediaId: string) => Promise<void>;
  onMoveUp: (index: number) => void;
  onMoveDown: (index: number) => void;
}

export const ShowcaseMediaCard: React.FC<ShowcaseMediaCardProps> = ({
  media,
  index,
  totalCount,
  canEdit,
  onPreview,
  onDelete,
  onMoveUp,
  onMoveDown,
}) => {
  const { t } = useLocalization();
  const [isDeleting, setIsDeleting] = useState(false);
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);

  const isVideo = media.media_type === 'VIDEO';

  const formatFileSize = (bytes?: number | null) => {
    const num = Number(bytes);
    if (!num || isNaN(num) || num <= 0) return '0 B';
    if (num < 1024) return `${num} B`;
    if (num < 1024 * 1024) return `${(num / 1024).toFixed(1)} KB`;
    return `${(num / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleDelete = async () => {
    try {
      setIsDeleting(true);
      await onDelete(media.id);
    } finally {
      setIsDeleting(false);
      setShowConfirmDelete(false);
    }
  };

  return (
    <div className="group relative bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-2xl overflow-hidden transition-all shadow-md hover:shadow-xl flex flex-col">
      {/* Media Preview Aspect Container */}
      <div className="relative aspect-video bg-slate-950 flex items-center justify-center overflow-hidden">
        {isVideo ? (
          media.thumbnail_url ? (
            <img
              src={media.thumbnail_url}
              alt={media.file_name}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            />
          ) : (
            <video
              src={media.media_url}
              className="w-full h-full object-cover"
              muted
              playsInline
              preload="metadata"
            />
          )
        ) : (
          <img
            src={media.media_url}
            alt={media.file_name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            loading="lazy"
          />
        )}

        {/* Type Badge */}
        <div className="absolute top-2 left-2 z-10">
          <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold backdrop-blur-md shadow-sm ${
              isVideo
                ? 'bg-purple-950/80 text-purple-300 border border-purple-500/30'
                : 'bg-emerald-950/80 text-emerald-300 border border-emerald-500/30'
            }`}
          >
            {isVideo ? <Film className="w-3 h-3" /> : <ImageIcon className="w-3 h-3" />}
            {media.media_type}
          </span>
        </div>

        {/* Order Badge */}
        <div className="absolute top-2 right-2 z-10">
          <span className="px-1.5 py-0.5 rounded-md text-[10px] font-mono font-bold bg-slate-950/80 text-slate-300 backdrop-blur-md border border-slate-800">
            #{index + 1}
          </span>
        </div>

        {/* Hover overlay with quick preview trigger */}
        <div
          onClick={() => onPreview(media)}
          className="absolute inset-0 bg-slate-950/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 cursor-pointer z-10"
        >
          {isVideo ? (
            <div className="w-11 h-11 rounded-full bg-purple-600/90 text-white flex items-center justify-center shadow-lg transform scale-90 group-hover:scale-100 transition-transform">
              <Play className="w-5 h-5 ml-0.5" />
            </div>
          ) : (
            <div className="w-10 h-10 rounded-full bg-slate-900/90 text-white flex items-center justify-center shadow-lg border border-slate-700">
              <Eye className="w-4 h-4" />
            </div>
          )}
        </div>
      </div>

      {/* Info & Card Footer */}
      <div className="p-3 bg-slate-900/90 flex flex-col justify-between flex-1 gap-2">
        <div>
          <h5 className="text-xs font-semibold text-slate-200 truncate" title={media.file_name}>
            {media.file_name}
          </h5>
          <div className="flex items-center gap-2 text-[10px] text-slate-400 mt-0.5">
            <span>{formatFileSize(media.file_size)}</span>
            <span>•</span>
            <span className="truncate">{media.mime_type}</span>
          </div>
        </div>

        {/* Controls Bar */}
        <div className="flex items-center justify-between pt-1 border-t border-slate-800/80">
          {/* Reorder buttons */}
          {canEdit ? (
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                onClick={() => onMoveUp(index)}
                disabled={index === 0}
                className="p-1 rounded-lg hover:bg-slate-800 disabled:opacity-30 text-slate-400 hover:text-slate-200 transition-colors"
                title={t('showcase.moveUp')}
              >
                <ChevronUp className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => onMoveDown(index)}
                disabled={index === totalCount - 1}
                className="p-1 rounded-lg hover:bg-slate-800 disabled:opacity-30 text-slate-400 hover:text-slate-200 transition-colors"
                title={t('showcase.moveDown')}
              >
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <div />
          )}

          {/* Action buttons */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => onPreview(media)}
              className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
              title={t('showcase.previewMedia')}
            >
              <Eye className="w-3.5 h-3.5" />
            </button>

            {canEdit && (
              <>
                {showConfirmDelete ? (
                  <div className="flex items-center gap-1 bg-red-950/80 px-2 py-0.5 rounded-lg border border-red-800">
                    <span className="text-[10px] text-red-300 font-semibold">{t('showcase.deleteMediaTitle')}</span>
                    <button
                      type="button"
                      onClick={handleDelete}
                      disabled={isDeleting}
                      className="text-[10px] font-bold text-red-400 hover:text-red-200 disabled:opacity-50"
                    >
                      {t('common.confirm')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowConfirmDelete(false)}
                      className="text-[10px] text-slate-400 hover:text-slate-200 ml-1"
                    >
                      {t('common.cancel')}
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowConfirmDelete(true)}
                    className="p-1.5 rounded-lg hover:bg-red-500/10 text-slate-400 hover:text-red-400 transition-colors"
                    title={t('showcase.removeMedia')}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
