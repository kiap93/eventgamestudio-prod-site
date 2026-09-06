import React, { useState, useEffect, useRef } from 'react';
import { apiFetch } from '../../../lib/api';
import { EventShowcase, EventShowcaseMedia, ShowcaseMediaType, UploadQueueItem } from '../../../types/showcase';
import { ShowcaseMediaCard } from './ShowcaseMediaCard';
import { ShowcaseMediaUploadQueue } from './ShowcaseMediaUploadQueue';
import { ShowcaseMediaPreviewModal } from './ShowcaseMediaPreviewModal';
import {
  UploadCloud,
  Film,
  Image as ImageIcon,
  Layers,
  Sparkles,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  Plus,
  ArrowUpDown,
  Filter,
} from 'lucide-react';

interface ShowcaseMediaManagerProps {
  eventId: string;
  showcase: EventShowcase;
  userRole?: string;
  onMediaChanged?: () => void;
}

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-matroska', 'video/ogg', 'video/3gpp'];
const MAX_IMAGE_SIZE = 25 * 1024 * 1024; // 25MB
const MAX_VIDEO_SIZE = 200 * 1024 * 1024; // 200MB

export const ShowcaseMediaManager: React.FC<ShowcaseMediaManagerProps> = ({
  eventId,
  showcase,
  userRole,
  onMediaChanged,
}) => {
  const [mediaList, setMediaList] = useState<EventShowcaseMedia[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<'ALL' | 'IMAGE' | 'VIDEO'>('ALL');
  const [isDragging, setIsDragging] = useState(false);
  const [uploadQueue, setUploadQueue] = useState<UploadQueueItem[]>([]);
  const [previewMedia, setPreviewMedia] = useState<EventShowcaseMedia | null>(null);
  const [isReordering, setIsReordering] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const isViewer = userRole === 'viewer';

  const fetchMedia = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await apiFetch(`/api/events/${eventId}/showcase/media`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to load showcase media');
      }
      const data = await res.json();
      setMediaList(data.media || []);
    } catch (err: any) {
      console.error('Fetch showcase media error:', err);
      setError(err.message || 'Failed to load media');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (eventId && showcase?.id) {
      fetchMedia();
    }
  }, [eventId, showcase?.id]);

  // Handle files selection
  const handleFilesSelected = (files: FileList | null) => {
    if (!files || files.length === 0 || isViewer) return;

    const newQueueItems: UploadQueueItem[] = [];

    Array.from(files).forEach((file) => {
      const mime = file.type.toLowerCase();
      let mediaType: ShowcaseMediaType | null = null;

      if (ALLOWED_IMAGE_TYPES.includes(mime) || mime.startsWith('image/')) {
        mediaType = 'IMAGE';
      } else if (ALLOWED_VIDEO_TYPES.includes(mime) || mime.startsWith('video/')) {
        mediaType = 'VIDEO';
      }

      if (!mediaType) {
        setError(`Unsupported format: "${file.name}". Please upload JPG, PNG, WEBP images or MP4, WEBM, MOV videos.`);
        return;
      }

      // Check sizes
      if (mediaType === 'IMAGE' && file.size > MAX_IMAGE_SIZE) {
        setError(`Image "${file.name}" exceeds 25MB limit.`);
        return;
      }
      if (mediaType === 'VIDEO' && file.size > MAX_VIDEO_SIZE) {
        setError(`Video "${file.name}" exceeds 200MB limit.`);
        return;
      }

      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      const previewUrl = mediaType === 'IMAGE' ? URL.createObjectURL(file) : undefined;

      const item: UploadQueueItem = {
        id,
        file,
        mediaType,
        progress: 0,
        status: 'pending',
        previewUrl,
      };

      newQueueItems.push(item);
    });

    if (newQueueItems.length > 0) {
      setUploadQueue((prev) => [...prev, ...newQueueItems]);
      // Start uploading newly added items
      newQueueItems.forEach((item) => {
        uploadItem(item);
      });
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Perform single item upload flow
  const uploadItem = async (item: UploadQueueItem) => {
    // 1. Mark as uploading
    setUploadQueue((prev) =>
      prev.map((q) => (q.id === item.id ? { ...q, status: 'uploading', progress: 5, errorMessage: undefined } : q))
    );

    try {
      // 2. Request upload URL / direct endpoint
      const token = localStorage.getItem('auth_token') || sessionStorage.getItem('auth_token') || '';
      const urlRes = await apiFetch(`/api/events/${eventId}/showcase/media/upload-url`, {
        method: 'POST',
        body: JSON.stringify({
          fileName: item.file.name,
          fileType: item.file.type || (item.mediaType === 'VIDEO' ? 'video/mp4' : 'image/png'),
          fileSize: item.file.size,
          mediaType: item.mediaType,
        }),
      });

      if (!urlRes.ok) {
        const errData = await urlRes.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to prepare upload destination');
      }

      const { uploadInfo } = await urlRes.json();

      // 3. Upload Binary with Progress tracking
      let finalPublicUrl = uploadInfo.publicUrl;

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();

        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) {
            const percent = Math.round((e.loaded / e.total) * 85) + 5; // 5% to 90%
            setUploadQueue((prev) =>
              prev.map((q) => (q.id === item.id ? { ...q, progress: percent } : q))
            );
          }
        });

        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              if (xhr.responseText) {
                const resp = JSON.parse(xhr.responseText);
                if (resp.url) finalPublicUrl = resp.url;
              }
            } catch {
              // Ignore non-json response
            }
            resolve();
          } else {
            reject(new Error(`Upload failed with status ${xhr.status}`));
          }
        });

        xhr.addEventListener('error', () => reject(new Error('Network error during file upload')));
        xhr.addEventListener('abort', () => reject(new Error('Upload was aborted')));

        // Preferred production path: Direct signed Supabase storage upload (up to 200MB, zero server/worker RAM pressure)
        if (uploadInfo.signedUrl) {
          xhr.open('PUT', uploadInfo.signedUrl);
          xhr.setRequestHeader('Content-Type', item.file.type || 'application/octet-stream');
          xhr.send(item.file);
        } else if (uploadInfo.directUploadUrl) {
          // Direct Worker / server fallback upload strictly reserved for small assets (<= 10MB)
          const formData = new FormData();
          formData.append('file', item.file);
          formData.append('path', uploadInfo.path);
          formData.append('filename', uploadInfo.fileName || uploadInfo.path.split('/').pop() || 'media-file');

          xhr.open('POST', uploadInfo.directUploadUrl);
          if (token) {
            xhr.setRequestHeader('Authorization', `Bearer ${token}`);
          }
          xhr.send(formData);
        } else {
          reject(new Error('No valid upload destination available'));
        }
      });

      // 4. Save media record in showcase database
      setUploadQueue((prev) =>
        prev.map((q) => (q.id === item.id ? { ...q, status: 'saving', progress: 95 } : q))
      );

      const recordRes = await apiFetch(`/api/events/${eventId}/showcase/media`, {
        method: 'POST',
        body: JSON.stringify({
          media_type: item.mediaType,
          storage_path: uploadInfo.path,
          bucket: uploadInfo.bucket || 'showcase-media',
          media_url: finalPublicUrl,
          thumbnail_url: item.thumbnailUrl || null,
          file_name: item.file.name,
          file_size: item.file.size,
          mime_type: item.file.type || (item.mediaType === 'VIDEO' ? 'video/mp4' : 'image/png'),
        }),
      });

      if (!recordRes.ok) {
        const recErr = await recordRes.json().catch(() => ({}));
        throw new Error(recErr.error || 'Failed to save media metadata');
      }

      const recData = await recordRes.json();

      // 5. Mark Completed
      setUploadQueue((prev) =>
        prev.map((q) =>
          q.id === item.id
            ? { ...q, status: 'completed', progress: 100, resultMedia: recData.media }
            : q
        )
      );

      // Append to local media list
      setMediaList((prev) => [...prev, recData.media]);
      if (onMediaChanged) onMediaChanged();
    } catch (err: any) {
      console.error('Upload item failed:', err);
      setUploadQueue((prev) =>
        prev.map((q) =>
          q.id === item.id
            ? { ...q, status: 'error', errorMessage: err.message || 'Upload failed' }
            : q
        )
      );
    }
  };

  const handleRetry = (itemId: string) => {
    const item = uploadQueue.find((q) => q.id === itemId);
    if (item) {
      uploadItem(item);
    }
  };

  const handleRemoveQueueItem = (itemId: string) => {
    setUploadQueue((prev) => prev.filter((q) => q.id !== itemId));
  };

  const handleClearCompleted = () => {
    setUploadQueue((prev) => prev.filter((q) => q.status !== 'completed'));
  };

  const handleDeleteMedia = async (mediaId: string) => {
    try {
      const res = await apiFetch(`/api/events/${eventId}/showcase/media/${mediaId}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to delete media');
      }
      setMediaList((prev) => prev.filter((m) => m.id !== mediaId));
      setSuccessMsg('Media item deleted');
      if (onMediaChanged) onMediaChanged();
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      console.error('Delete media error:', err);
      setError(err.message || 'Failed to delete media item');
    }
  };

  const handleMoveUp = async (index: number) => {
    if (index === 0 || isViewer) return;
    const currentFiltered = filteredMedia;
    const newItems = [...currentFiltered];
    const temp = newItems[index - 1];
    newItems[index - 1] = newItems[index];
    newItems[index] = temp;

    // Apply reorder to all media
    await reorderList(newItems.map((m) => m.id));
  };

  const handleMoveDown = async (index: number) => {
    if (index === filteredMedia.length - 1 || isViewer) return;
    const currentFiltered = filteredMedia;
    const newItems = [...currentFiltered];
    const temp = newItems[index + 1];
    newItems[index + 1] = newItems[index];
    newItems[index] = temp;

    await reorderList(newItems.map((m) => m.id));
  };

  const reorderList = async (mediaIds: string[]) => {
    try {
      setIsReordering(true);
      const res = await apiFetch(`/api/events/${eventId}/showcase/media/reorder`, {
        method: 'PATCH',
        body: JSON.stringify({ media_ids: mediaIds }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to reorder media');
      }
      const data = await res.json();
      setMediaList(data.media);
      if (onMediaChanged) onMediaChanged();
    } catch (err: any) {
      console.error('Reorder media error:', err);
      setError(err.message || 'Failed to reorder');
    } finally {
      setIsReordering(false);
    }
  };

  const handleUpdateThumbnail = async (mediaId: string, thumbnailUrl: string) => {
    try {
      // Direct local update
      setMediaList((prev) =>
        prev.map((m) => (m.id === mediaId ? { ...m, thumbnail_url: thumbnailUrl } : m))
      );
      if (previewMedia && previewMedia.id === mediaId) {
        setPreviewMedia((prev) => (prev ? { ...prev, thumbnail_url: thumbnailUrl } : null));
      }
    } catch (err: any) {
      console.error('Update thumbnail error:', err);
    }
  };

  // Drag and drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!isViewer) setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (!isViewer && e.dataTransfer.files) {
      handleFilesSelected(e.dataTransfer.files);
    }
  };

  const photoCount = mediaList.filter((m) => m.media_type === 'IMAGE').length;
  const videoCount = mediaList.filter((m) => m.media_type === 'VIDEO').length;

  const filteredMedia = mediaList.filter((m) => {
    if (filterType === 'IMAGE') return m.media_type === 'IMAGE';
    if (filterType === 'VIDEO') return m.media_type === 'VIDEO';
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/jpeg,image/jpg,image/png,image/webp,video/mp4,video/webm,video/quicktime,video/*"
        className="hidden"
        onChange={(e) => handleFilesSelected(e.target.files)}
      />

      {/* Notifications */}
      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-2xl flex items-center justify-between gap-2 text-xs text-red-300">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
            <span>{error}</span>
          </div>
          <button
            onClick={() => setError(null)}
            className="text-[11px] text-red-400 hover:text-red-200 underline cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {successMsg && (
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl flex items-center gap-2 text-xs text-emerald-300">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Upload Drop Zone Area */}
      {!isViewer && (
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`relative border-2 border-dashed rounded-3xl p-6 sm:p-8 text-center cursor-pointer transition-all ${
            isDragging
              ? 'border-amber-400 bg-amber-500/10 scale-[1.01]'
              : 'border-slate-800 hover:border-amber-500/50 bg-slate-950/50 hover:bg-slate-950/80'
          }`}
        >
          <div className="flex flex-col items-center justify-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center shadow-lg shadow-amber-500/5">
              <UploadCloud className="w-6 h-6" />
            </div>

            <div className="space-y-1">
              <h4 className="text-sm font-bold text-slate-100">
                Drag & Drop Photos and Videos, or <span className="text-amber-400 underline">Browse Files</span>
              </h4>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                Upload campaign photography, live activation clips, and attendee highlights for the event showcase.
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-2 pt-1 text-[11px] text-slate-400">
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-900 border border-slate-800">
                <ImageIcon className="w-3.5 h-3.5 text-emerald-400" />
                Images: JPG, PNG, WEBP (Max 25MB)
              </span>
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-900 border border-slate-800">
                <Film className="w-3.5 h-3.5 text-purple-400" />
                Videos: MP4, WEBM, MOV (Max 200MB)
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Upload Queue Progress */}
      <ShowcaseMediaUploadQueue
        queue={uploadQueue}
        onRetry={handleRetry}
        onRemove={handleRemoveQueueItem}
        onClearCompleted={handleClearCompleted}
      />

      {/* Gallery Header & Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
        {/* Filter Pills */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setFilterType('ALL')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
              filterType === 'ALL'
                ? 'bg-amber-500 text-slate-950 font-bold shadow-md shadow-amber-500/20'
                : 'bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>All Media ({mediaList.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setFilterType('IMAGE')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
              filterType === 'IMAGE'
                ? 'bg-emerald-500 text-slate-950 font-bold shadow-md shadow-emerald-500/20'
                : 'bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800'
            }`}
          >
            <ImageIcon className="w-3.5 h-3.5" />
            <span>Photos ({photoCount})</span>
          </button>

          <button
            type="button"
            onClick={() => setFilterType('VIDEO')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
              filterType === 'VIDEO'
                ? 'bg-purple-600 text-white font-bold shadow-md shadow-purple-600/20'
                : 'bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800'
            }`}
          >
            <Film className="w-3.5 h-3.5" />
            <span>Videos ({videoCount})</span>
          </button>
        </div>

        {/* Refresh & Add button */}
        <div className="flex items-center gap-2 self-end sm:self-auto">
          <button
            type="button"
            onClick={fetchMedia}
            disabled={loading}
            className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800 transition-colors"
            title="Refresh media"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          {!isViewer && (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-3 py-1.5 rounded-xl text-xs transition-all shadow-md shadow-amber-500/20 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Media</span>
            </button>
          )}
        </div>
      </div>

      {/* Media Grid */}
      {loading && mediaList.length === 0 ? (
        <div className="py-16 text-center space-y-3">
          <div className="w-7 h-7 border-3 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs text-slate-400">Loading showcase media...</p>
        </div>
      ) : filteredMedia.length === 0 ? (
        <div className="bg-slate-950/40 border border-slate-800/80 rounded-3xl p-10 text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-slate-900 border border-slate-800 text-slate-500 flex items-center justify-center mx-auto">
            {filterType === 'VIDEO' ? (
              <Film className="w-6 h-6" />
            ) : filterType === 'IMAGE' ? (
              <ImageIcon className="w-6 h-6" />
            ) : (
              <Layers className="w-6 h-6" />
            )}
          </div>
          <div className="space-y-1">
            <h4 className="text-sm font-semibold text-slate-300">
              {filterType === 'ALL'
                ? 'No media uploaded yet'
                : filterType === 'IMAGE'
                ? 'No photos uploaded yet'
                : 'No videos uploaded yet'}
            </h4>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              {!isViewer
                ? 'Upload high-resolution event photos and video clips to showcase this campaign.'
                : 'No showcase media has been added to this event yet.'}
            </p>
          </div>
          {!isViewer && (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-400 hover:text-amber-300 pt-1"
            >
              <Plus className="w-3.5 h-3.5" /> Upload now
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {filteredMedia.map((media, idx) => (
            <ShowcaseMediaCard
              key={media.id}
              media={media}
              index={idx}
              totalCount={filteredMedia.length}
              canEdit={!isViewer}
              onPreview={setPreviewMedia}
              onDelete={handleDeleteMedia}
              onMoveUp={handleMoveUp}
              onMoveDown={handleMoveDown}
            />
          ))}
        </div>
      )}

      {/* Preview Modal */}
      <ShowcaseMediaPreviewModal
        media={previewMedia}
        onClose={() => setPreviewMedia(null)}
        onUpdateThumbnail={handleUpdateThumbnail}
        canEdit={!isViewer}
      />
    </div>
  );
};
