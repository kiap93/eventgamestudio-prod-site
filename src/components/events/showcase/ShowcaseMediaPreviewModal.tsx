import React, { useState, useRef } from 'react';
import { EventShowcaseMedia } from '../../../types/showcase';
import { useLocalization } from '../../../context/LocalizationContext';
import {
  X,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  Image as ImageIcon,
  Film,
  Calendar,
  HardDrive,
  Check,
  Camera,
  Download,
} from 'lucide-react';

interface ShowcaseMediaPreviewModalProps {
  media: EventShowcaseMedia | null;
  onClose: () => void;
  onUpdateThumbnail?: (mediaId: string, thumbnailUrl: string) => Promise<void>;
  canEdit?: boolean;
}

export const ShowcaseMediaPreviewModal: React.FC<ShowcaseMediaPreviewModalProps> = ({
  media,
  onClose,
  onUpdateThumbnail,
  canEdit = false,
}) => {
  const { t } = useLocalization();
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isCapturingPoster, setIsCapturingPoster] = useState(false);
  const [customPosterUrl, setCustomPosterUrl] = useState('');
  const [isSettingCustomPoster, setIsSettingCustomPoster] = useState(false);
  const [captureSuccess, setCaptureSuccess] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  if (!media) return null;

  const isVideo = media.media_type === 'VIDEO';

  const formatFileSize = (bytes?: number | null) => {
    const num = Number(bytes);
    if (!num || isNaN(num) || num <= 0) return '0 B';
    if (num < 1024) return `${num} B`;
    if (num < 1024 * 1024) return `${(num / 1024).toFixed(1)} KB`;
    return `${(num / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleCaptureVideoFrame = async () => {
    if (!videoRef.current || !onUpdateThumbnail) return;
    try {
      setIsCapturingPoster(true);
      const video = videoRef.current;
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 360;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        await onUpdateThumbnail(media.id, dataUrl);
        setCaptureSuccess(true);
        setTimeout(() => setCaptureSuccess(false), 3000);
      }
    } catch (err) {
      console.error('Failed to capture video frame:', err);
    } finally {
      setIsCapturingPoster(false);
    }
  };

  const handleApplyCustomPoster = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customPosterUrl.trim() || !onUpdateThumbnail) return;
    try {
      setIsCapturingPoster(true);
      await onUpdateThumbnail(media.id, customPosterUrl.trim());
      setCaptureSuccess(true);
      setIsSettingCustomPoster(false);
      setCustomPosterUrl('');
      setTimeout(() => setCaptureSuccess(false), 3000);
    } catch (err) {
      console.error('Failed to update poster:', err);
    } finally {
      setIsCapturingPoster(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-4xl bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/70">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                isVideo
                  ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                  : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
              }`}
            >
              {isVideo ? <Film className="w-5 h-5" /> : <ImageIcon className="w-5 h-5" />}
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-slate-100 truncate">{media.file_name}</h3>
              <div className="flex items-center gap-3 text-[11px] text-slate-400">
                <span>{media.media_type}</span>
                <span>•</span>
                <span>{formatFileSize(media.file_size)}</span>
                <span>•</span>
                <span>{media.mime_type}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <a
              href={media.media_url}
              target="_blank"
              rel="noopener noreferrer"
              download={media.file_name}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
              title={t('common.download', undefined, 'Download')}
            >
              <Download className="w-4 h-4" />
            </a>
            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="relative flex-1 overflow-auto p-4 flex items-center justify-center bg-slate-950/90 min-h-[300px]">
          {isVideo ? (
            <div className="w-full flex flex-col items-center">
              <div className="relative w-full max-h-[60vh] rounded-2xl overflow-hidden bg-black flex items-center justify-center shadow-lg">
                <video
                  ref={videoRef}
                  src={media.media_url}
                  poster={media.thumbnail_url || undefined}
                  controls
                  playsInline
                  crossOrigin="anonymous"
                  className="w-full max-h-[60vh] object-contain rounded-2xl"
                  onPlay={() => setIsPlaying(true)}
                  onPause={() => setIsPlaying(false)}
                />
              </div>

              {/* Video Thumbnail Tools */}
              {canEdit && onUpdateThumbnail && (
                <div className="w-full mt-4 p-3 bg-slate-900 border border-slate-800 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2 text-slate-300">
                    <Camera className="w-4 h-4 text-purple-400" />
                    <span>{t('showcase.videoPosterThumbnail')}</span>
                    {media.thumbnail_url ? (
                      <span className="text-emerald-400 font-semibold flex items-center gap-1">
                        <Check className="w-3.5 h-3.5" /> Set
                      </span>
                    ) : (
                      <span className="text-slate-500">{t('showcase.autoDefault')}</span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={handleCaptureVideoFrame}
                      disabled={isCapturingPoster}
                      className="px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <Camera className="w-3.5 h-3.5" />
                      <span>{isCapturingPoster ? 'Capturing...' : 'Capture Current Frame as Poster'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setIsSettingCustomPoster(!isSettingCustomPoster)}
                      className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium transition-colors cursor-pointer"
                    >
                      Custom URL
                    </button>
                  </div>
                </div>
              )}

              {/* Custom Poster Input Box */}
              {isSettingCustomPoster && (
                <form
                  onSubmit={handleApplyCustomPoster}
                  className="w-full mt-2 p-3 bg-slate-900/90 border border-slate-800 rounded-2xl flex items-center gap-2"
                >
                  <input
                    type="url"
                    value={customPosterUrl}
                    onChange={(e) => setCustomPosterUrl(e.target.value)}
                    placeholder="https://.../video-poster.jpg"
                    className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-100 placeholder:text-slate-600 focus:border-purple-500 outline-none"
                    required
                  />
                  <button
                    type="submit"
                    disabled={isCapturingPoster}
                    className="px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-semibold text-xs transition-colors cursor-pointer"
                  >
                    {t('common.apply', undefined, 'Apply')}
                  </button>
                </form>
              )}

              {captureSuccess && (
                <div className="mt-2 text-xs text-emerald-400 font-medium flex items-center gap-1">
                  <Check className="w-4 h-4" /> Thumbnail poster updated successfully!
                </div>
              )}
            </div>
          ) : (
            <div className="w-full flex items-center justify-center p-2">
              <img
                src={media.media_url}
                alt={media.file_name}
                className="max-w-full max-h-[68vh] object-contain rounded-2xl shadow-xl"
              />
            </div>
          )}
        </div>

        {/* Footer info */}
        <div className="px-6 py-3 border-t border-slate-800 bg-slate-950/70 flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-slate-500" />
              Uploaded {new Date(media.created_at).toLocaleString()}
            </span>
          </div>

          <div>
            <span className="font-mono text-slate-500 text-[11px]">ID: {media.id.slice(0, 8)}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
