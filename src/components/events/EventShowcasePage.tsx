import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { apiFetch } from '../../lib/api';
import { navigateTo } from '../../hooks/useRouteContext';
import {
  EventShowcase,
  EventShowcaseMedia,
  ShowcaseMediaType,
  UploadQueueItem,
} from '../../types/showcase';
import { ShowcaseMediaCard } from './showcase/ShowcaseMediaCard';
import { ShowcaseMediaUploadQueue } from './showcase/ShowcaseMediaUploadQueue';
import { ShowcaseMediaPreviewModal } from './showcase/ShowcaseMediaPreviewModal';
import {
  ArrowLeft,
  Sparkles,
  Globe,
  EyeOff,
  Clock,
  Save,
  Plus,
  AlertCircle,
  CheckCircle2,
  Image as ImageIcon,
  Film,
  Building2,
  UploadCloud,
  FileText,
  Layers,
  Calendar,
  Gamepad2,
  ExternalLink,
} from 'lucide-react';

interface EventShowcasePageProps {
  eventId: string;
}

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
const ALLOWED_VIDEO_TYPES = [
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'video/x-matroska',
  'video/ogg',
  'video/3gpp',
];
const MAX_IMAGE_SIZE = 25 * 1024 * 1024; // 25MB
const MAX_VIDEO_SIZE = 200 * 1024 * 1024; // 200MB

export const EventShowcasePage: React.FC<EventShowcasePageProps> = ({ eventId }) => {
  const { currentOrganization } = useAuth();
  const userRole = currentOrganization?.role || 'viewer';
  const isViewer = userRole === 'viewer';

  // Event & Showcase data states
  const [eventData, setEventData] = useState<any | null>(null);
  const [showcase, setShowcase] = useState<EventShowcase | null>(null);
  const [mediaList, setMediaList] = useState<EventShowcaseMedia[]>([]);

  // Loading & Action states
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Form fields
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [clientName, setClientName] = useState('');
  const [clientLogoUrl, setClientLogoUrl] = useState('');
  const [coverImageUrl, setCoverImageUrl] = useState('');

  // Media & Upload States
  const [uploadQueue, setUploadQueue] = useState<UploadQueueItem[]>([]);
  const [previewMedia, setPreviewMedia] = useState<EventShowcaseMedia | null>(null);
  const [isDraggingPhotos, setIsDraggingPhotos] = useState(false);
  const [isDraggingVideos, setIsDraggingVideos] = useState(false);

  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const videoInputRef = useRef<HTMLInputElement | null>(null);

  // 1. Fetch Event & Showcase
  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch Event details
      const eventRes = await apiFetch(`/api/events/${eventId}`);
      if (!eventRes.ok) {
        throw new Error('Event not found or access denied');
      }
      const eData = await eventRes.json();
      setEventData(eData.event);

      // Fetch Showcase details
      const showcaseRes = await apiFetch(`/api/events/${eventId}/showcase`);
      if (showcaseRes.status === 404) {
        setShowcase(null);
        setTitle(eData.event?.name || 'Event Showcase');
      } else if (showcaseRes.ok) {
        const sData = await showcaseRes.json();
        const sc: EventShowcase = sData.showcase;
        setShowcase(sc);
        if (sc) {
          setTitle(sc.title || '');
          setDescription(sc.description || '');
          setClientName(sc.client_name || '');
          setClientLogoUrl(sc.client_logo_url || '');
          setCoverImageUrl(sc.cover_image_url || '');

          // Fetch Showcase Media
          const mediaRes = await apiFetch(`/api/events/${eventId}/showcase/media`);
          if (mediaRes.ok) {
            const mData = await mediaRes.json();
            setMediaList(mData.media || []);
          }
        }
      }
    } catch (err: any) {
      console.error('Load showcase page error:', err);
      setError(err.message || 'Failed to load showcase');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (eventId) {
      loadData();
    }
  }, [eventId]);

  // Handle Save (Draft or Update)
  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!title.trim()) {
      setError('Showcase title is required');
      return;
    }

    try {
      setSaving(true);
      setError(null);
      setSuccessMsg(null);

      const payload = {
        title: title.trim(),
        description: description.trim() || null,
        client_name: clientName.trim() || null,
        client_logo_url: clientLogoUrl.trim() || null,
        cover_image_url: coverImageUrl.trim() || null,
      };

      let res;
      if (!showcase) {
        // Create as Draft
        res = await apiFetch(`/api/events/${eventId}/showcase`, {
          method: 'POST',
          body: JSON.stringify({
            ...payload,
            status: 'DRAFT',
          }),
        });
      } else {
        // Update
        res = await apiFetch(`/api/events/${eventId}/showcase`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
      }

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to save showcase');
      }

      const resData = await res.json();
      setShowcase(resData.showcase);
      setSuccessMsg('Showcase saved successfully!');
      setTimeout(() => setSuccessMsg(null), 3500);
    } catch (err: any) {
      console.error('Save showcase error:', err);
      setError(err.message || 'Failed to save showcase');
    } finally {
      setSaving(false);
    }
  };

  // Handle Publish / Unpublish
  const handlePublishToggle = async () => {
    if (!showcase) {
      // First save draft, then publish
      await handleSave();
    }

    try {
      setPublishing(true);
      setError(null);

      const isPublished = showcase?.status === 'PUBLISHED';
      const endpoint = isPublished
        ? `/api/events/${eventId}/showcase/unpublish`
        : `/api/events/${eventId}/showcase/publish`;

      const res = await apiFetch(endpoint, { method: 'POST' });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Failed to ${isPublished ? 'unpublish' : 'publish'} showcase`);
      }

      const data = await res.json();
      setShowcase(data.showcase);
      setSuccessMsg(
        isPublished
          ? 'Showcase unpublished (saved as Unpublished).'
          : 'Showcase published! It is now live.'
      );
      setTimeout(() => setSuccessMsg(null), 3500);
    } catch (err: any) {
      console.error('Publish toggle error:', err);
      setError(err.message || 'Action failed');
    } finally {
      setPublishing(false);
    }
  };

  // ----------------------------------------------------
  // MEDIA UPLOAD MANAGEMENT
  // ----------------------------------------------------
  const handleFilesSelected = (files: FileList | null, forceType?: ShowcaseMediaType) => {
    if (!files || files.length === 0 || isViewer) return;

    // Ensure showcase is created first
    if (!showcase) {
      setError('Please save the showcase basic information first before uploading media.');
      return;
    }

    const newQueueItems: UploadQueueItem[] = [];

    Array.from(files).forEach((file) => {
      const mime = file.type.toLowerCase();
      let mediaType: ShowcaseMediaType | null = forceType || null;

      if (!mediaType) {
        if (ALLOWED_IMAGE_TYPES.includes(mime) || mime.startsWith('image/')) {
          mediaType = 'IMAGE';
        } else if (ALLOWED_VIDEO_TYPES.includes(mime) || mime.startsWith('video/')) {
          mediaType = 'VIDEO';
        }
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
      newQueueItems.forEach((item) => {
        uploadItem(item);
      });
    }

    if (photoInputRef.current) photoInputRef.current.value = '';
    if (videoInputRef.current) videoInputRef.current.value = '';
  };

  const uploadItem = async (item: UploadQueueItem) => {
    setUploadQueue((prev) =>
      prev.map((q) => (q.id === item.id ? { ...q, status: 'uploading', progress: 5, errorMessage: undefined } : q))
    );

    try {
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
      let finalPublicUrl = uploadInfo.publicUrl;

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();

        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) {
            const percent = Math.round((e.loaded / e.total) * 85) + 5;
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
              // Ignore
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

      setUploadQueue((prev) =>
        prev.map((q) =>
          q.id === item.id
            ? { ...q, status: 'completed', progress: 100, resultMedia: recData.media }
            : q
        )
      );

      setMediaList((prev) => [...prev, recData.media]);
    } catch (err: any) {
      console.error('Upload failed:', err);
      setUploadQueue((prev) =>
        prev.map((q) =>
          q.id === item.id
            ? { ...q, status: 'error', errorMessage: err.message || 'Upload failed' }
            : q
        )
      );
    }
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
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      console.error('Delete media error:', err);
      setError(err.message || 'Failed to delete media');
    }
  };

  const handleMovePhoto = async (index: number, direction: 'up' | 'down') => {
    const photos = mediaList.filter((m) => m.media_type === 'IMAGE');
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= photos.length) return;

    const newPhotos = [...photos];
    const temp = newPhotos[targetIdx];
    newPhotos[targetIdx] = newPhotos[index];
    newPhotos[index] = temp;

    // Combine photos and videos in new order
    const videos = mediaList.filter((m) => m.media_type === 'VIDEO');
    const combinedIds = [...newPhotos, ...videos].map((m) => m.id);
    await reorderList(combinedIds);
  };

  const handleMoveVideo = async (index: number, direction: 'up' | 'down') => {
    const videos = mediaList.filter((m) => m.media_type === 'VIDEO');
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= videos.length) return;

    const newVideos = [...videos];
    const temp = newVideos[targetIdx];
    newVideos[targetIdx] = newVideos[index];
    newVideos[index] = temp;

    const photos = mediaList.filter((m) => m.media_type === 'IMAGE');
    const combinedIds = [...photos, ...newVideos].map((m) => m.id);
    await reorderList(combinedIds);
  };

  const reorderList = async (mediaIds: string[]) => {
    try {
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
    } catch (err: any) {
      console.error('Reorder media error:', err);
      setError(err.message || 'Failed to reorder');
    }
  };

  const handleUpdateThumbnail = async (mediaId: string, thumbnailUrl: string) => {
    setMediaList((prev) =>
      prev.map((m) => (m.id === mediaId ? { ...m, thumbnail_url: thumbnailUrl } : m))
    );
    if (previewMedia && previewMedia.id === mediaId) {
      setPreviewMedia((prev) => (prev ? { ...prev, thumbnail_url: thumbnailUrl } : null));
    }
  };

  const photos = mediaList.filter((m) => m.media_type === 'IMAGE');
  const videos = mediaList.filter((m) => m.media_type === 'VIDEO');

  const getStatusBadge = (status?: string) => {
    switch (status) {
      case 'PUBLISHED':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping inline-block" />
            <Globe className="w-3.5 h-3.5" />
            PUBLISHED
          </span>
        );
      case 'UNPUBLISHED':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-slate-800 border border-slate-700 text-slate-300">
            <EyeOff className="w-3.5 h-3.5 text-slate-400" />
            UNPUBLISHED
          </span>
        );
      case 'DRAFT':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-500/10 border border-amber-500/30 text-amber-400">
            <Clock className="w-3.5 h-3.5" />
            DRAFT
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-slate-800 border border-slate-700 text-slate-400">
            NOT CREATED
          </span>
        );
    }
  };

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-16 text-center space-y-3">
        <div className="w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-xs text-slate-400 font-medium">Loading Event Showcase...</p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 space-y-8 pb-16">
      {/* Hidden File Inputs */}
      <input
        ref={photoInputRef}
        type="file"
        multiple
        accept="image/jpeg,image/jpg,image/png,image/webp"
        className="hidden"
        onChange={(e) => handleFilesSelected(e.target.files, 'IMAGE')}
      />
      <input
        ref={videoInputRef}
        type="file"
        multiple
        accept="video/mp4,video/webm,video/quicktime,video/*"
        className="hidden"
        onChange={(e) => handleFilesSelected(e.target.files, 'VIDEO')}
      />

      {/* Notifications */}
      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-2xl flex items-center justify-between gap-3 text-xs text-red-300">
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
        <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl flex items-center gap-2.5 text-xs text-emerald-300">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Top Header & Navigation */}
      <div className="space-y-4">
        {/* Back Link */}
        <div>
          <button
            type="button"
            onClick={() => navigateTo('/events')}
            className="inline-flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-amber-400 transition-colors py-1 cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Events</span>
          </button>
        </div>

        {/* Page Title & Main Actions */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="p-2.5 bg-amber-500/10 border border-amber-500/30 rounded-2xl text-amber-400">
                <Sparkles className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-black text-slate-100 tracking-tight">
                  Event Showcase
                </h1>
                <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
                  <span>For Event:</span>
                  <span className="font-semibold text-slate-200">{eventData?.name}</span>
                  {eventData?.public_token && (
                    <span className="font-mono text-[11px] text-slate-500 bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                      /e/{eventData.public_token}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 pt-1">
              <div>{getStatusBadge(showcase?.status)}</div>
              {showcase?.published_at && (
                <span className="text-[11px] text-slate-400">
                  Published on {new Date(showcase.published_at).toLocaleDateString()}
                </span>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          {!isViewer && (
            <div className="flex items-center gap-3 flex-wrap">
              <button
                type="button"
                onClick={() => handleSave()}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 border border-slate-700 transition-all cursor-pointer shadow-sm"
              >
                <Save className="w-4 h-4 text-amber-400" />
                <span>{saving ? 'Saving...' : showcase ? 'Save Changes' : 'Save Draft'}</span>
              </button>

              {showcase?.status === 'PUBLISHED' ? (
                <button
                  type="button"
                  onClick={handlePublishToggle}
                  disabled={publishing}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-300 border border-slate-700 transition-colors cursor-pointer"
                >
                  <EyeOff className="w-4 h-4 text-slate-400" />
                  <span>{publishing ? 'Unpublishing...' : 'Unpublish Showcase'}</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handlePublishToggle}
                  disabled={publishing}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 transition-all shadow-md shadow-emerald-500/20 cursor-pointer"
                >
                  <Globe className="w-4 h-4" />
                  <span>{publishing ? 'Publishing...' : 'Publish Showcase'}</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Global Upload Queue Progress */}
      <ShowcaseMediaUploadQueue
        queue={uploadQueue}
        onRetry={(id) => {
          const item = uploadQueue.find((q) => q.id === id);
          if (item) uploadItem(item);
        }}
        onRemove={(id) => setUploadQueue((prev) => prev.filter((q) => q.id !== id))}
        onClearCompleted={() => setUploadQueue((prev) => prev.filter((q) => q.status !== 'completed'))}
      />

      {/* ---------------------------------------------------- */}
      {/* SECTION 1: Basic Information */}
      {/* ---------------------------------------------------- */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-7 space-y-6 shadow-lg">
        <div className="flex items-center gap-2.5 border-b border-slate-800 pb-4">
          <FileText className="w-5 h-5 text-amber-400" />
          <h2 className="text-base font-bold text-slate-100">Basic Information</h2>
        </div>

        <form onSubmit={handleSave} className="space-y-4">
          {/* Showcase Title */}
          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1.5">
              Showcase Title <span className="text-amber-400">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Acme Tech Summit Game Activation"
              disabled={isViewer}
              className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 rounded-xl px-4 py-2.5 text-xs text-slate-100 placeholder:text-slate-600 outline-none transition-all disabled:opacity-60"
              required
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1.5">
              Description & Highlights
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              placeholder="Detail the activation goals, attendee engagement, leaderboard performance, and key highlights..."
              disabled={isViewer}
              className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 rounded-xl px-4 py-2.5 text-xs text-slate-100 placeholder:text-slate-600 outline-none resize-none transition-all disabled:opacity-60"
            />
          </div>

          {/* Client Info */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1.5">
                Client / Sponsor Name
              </label>
              <input
                type="text"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                placeholder="e.g. Acme Corporation"
                disabled={isViewer}
                className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-xl px-4 py-2.5 text-xs text-slate-100 placeholder:text-slate-600 outline-none transition-all disabled:opacity-60"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1.5">
                Client Logo URL
              </label>
              <input
                type="url"
                value={clientLogoUrl}
                onChange={(e) => setClientLogoUrl(e.target.value)}
                placeholder="https://.../client-logo.png"
                disabled={isViewer}
                className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-xl px-4 py-2.5 text-xs text-slate-100 placeholder:text-slate-600 outline-none transition-all disabled:opacity-60"
              />
            </div>
          </div>

          {/* Client Logo Preview */}
          {clientLogoUrl && (
            <div className="flex items-center gap-3 p-3 bg-slate-950/70 border border-slate-800 rounded-xl">
              <span className="text-[11px] font-semibold text-slate-400">Client Logo Preview:</span>
              <img
                src={clientLogoUrl}
                alt="Client Logo"
                className="h-8 max-w-[160px] object-contain rounded"
                onError={(e) => ((e.target as any).style.display = 'none')}
              />
            </div>
          )}
        </form>
      </div>

      {/* ---------------------------------------------------- */}
      {/* SECTION 2: Cover Image */}
      {/* ---------------------------------------------------- */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-7 space-y-4 shadow-lg">
        <div className="flex items-center gap-2.5 border-b border-slate-800 pb-4">
          <ImageIcon className="w-5 h-5 text-emerald-400" />
          <h2 className="text-base font-bold text-slate-100">Cover Image</h2>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1.5">
              Cover Image URL
            </label>
            <input
              type="url"
              value={coverImageUrl}
              onChange={(e) => setCoverImageUrl(e.target.value)}
              placeholder="https://.../showcase-hero-banner.jpg"
              disabled={isViewer}
              className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-xl px-4 py-2.5 text-xs text-slate-100 placeholder:text-slate-600 outline-none transition-all disabled:opacity-60"
            />
          </div>

          {/* Cover Preview Card */}
          {coverImageUrl ? (
            <div className="relative rounded-2xl overflow-hidden border border-slate-800 max-h-56 bg-slate-950 shadow-inner group">
              <img
                src={coverImageUrl}
                alt="Showcase Cover"
                className="w-full h-56 object-cover"
                onError={(e) => ((e.target as any).style.display = 'none')}
              />
              <div className="absolute bottom-3 left-3 bg-slate-950/80 backdrop-blur-md px-3 py-1 rounded-lg text-xs font-semibold text-slate-200 border border-slate-800">
                Cover Image Preview
              </div>
              {!isViewer && (
                <button
                  type="button"
                  onClick={() => setCoverImageUrl('')}
                  className="absolute top-3 right-3 bg-slate-950/80 hover:bg-red-500 text-slate-300 hover:text-white px-2.5 py-1 rounded-lg text-xs transition-colors"
                >
                  Clear
                </button>
              )}
            </div>
          ) : (
            <div className="p-8 border border-dashed border-slate-800 rounded-2xl text-center space-y-2 bg-slate-950/30">
              <ImageIcon className="w-8 h-8 text-slate-600 mx-auto" />
              <p className="text-xs text-slate-400">
                Add a high-resolution banner image URL to represent this event showcase on cards and public listings.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ---------------------------------------------------- */}
      {/* SECTION 3: Photos */}
      {/* ---------------------------------------------------- */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-7 space-y-6 shadow-lg">
        <div className="flex items-center justify-between border-b border-slate-800 pb-4 gap-3 flex-wrap">
          <div className="flex items-center gap-2.5">
            <ImageIcon className="w-5 h-5 text-emerald-400" />
            <h2 className="text-base font-bold text-slate-100">Photos</h2>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
              {photos.length}
            </span>
          </div>

          {!isViewer && (
            <button
              type="button"
              onClick={() => photoInputRef.current?.click()}
              className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold px-4 py-2 rounded-xl text-xs transition-all shadow-md shadow-emerald-500/20 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Upload Photos</span>
            </button>
          )}
        </div>

        {/* Drag & Drop Photo Area */}
        {!isViewer && (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDraggingPhotos(true);
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              setIsDraggingPhotos(false);
            }}
            onDrop={(e) => {
              e.preventDefault();
              setIsDraggingPhotos(false);
              if (e.dataTransfer.files) {
                handleFilesSelected(e.dataTransfer.files, 'IMAGE');
              }
            }}
            onClick={() => photoInputRef.current?.click()}
            className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all ${
              isDraggingPhotos
                ? 'border-emerald-400 bg-emerald-500/10 scale-[1.01]'
                : 'border-slate-800 hover:border-emerald-500/40 bg-slate-950/40 hover:bg-slate-950/60'
            }`}
          >
            <div className="flex flex-col items-center justify-center space-y-2">
              <UploadCloud className="w-6 h-6 text-emerald-400" />
              <p className="text-xs font-semibold text-slate-200">
                Drag & Drop Photos here, or <span className="text-emerald-400 underline">Browse Files</span>
              </p>
              <span className="text-[11px] text-slate-500">
                Supported formats: JPG, PNG, WEBP (Max 25MB each)
              </span>
            </div>
          </div>
        )}

        {/* Photos Grid */}
        {photos.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-500">
            No photos added to this showcase yet.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {photos.map((photo, idx) => (
              <ShowcaseMediaCard
                key={photo.id}
                media={photo}
                index={idx}
                totalCount={photos.length}
                canEdit={!isViewer}
                onPreview={setPreviewMedia}
                onDelete={handleDeleteMedia}
                onMoveUp={(i) => handleMovePhoto(i, 'up')}
                onMoveDown={(i) => handleMovePhoto(i, 'down')}
              />
            ))}
          </div>
        )}
      </div>

      {/* ---------------------------------------------------- */}
      {/* SECTION 4: Videos */}
      {/* ---------------------------------------------------- */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-7 space-y-6 shadow-lg">
        <div className="flex items-center justify-between border-b border-slate-800 pb-4 gap-3 flex-wrap">
          <div className="flex items-center gap-2.5">
            <Film className="w-5 h-5 text-purple-400" />
            <h2 className="text-base font-bold text-slate-100">Videos</h2>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-500/10 border border-purple-500/30 text-purple-400">
              {videos.length}
            </span>
          </div>

          {!isViewer && (
            <button
              type="button"
              onClick={() => videoInputRef.current?.click()}
              className="flex items-center gap-2 bg-purple-600 hover:bg-purple-500 text-white font-bold px-4 py-2 rounded-xl text-xs transition-all shadow-md shadow-purple-600/20 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Upload Videos</span>
            </button>
          )}
        </div>

        {/* Drag & Drop Video Area */}
        {!isViewer && (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDraggingVideos(true);
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              setIsDraggingVideos(false);
            }}
            onDrop={(e) => {
              e.preventDefault();
              setIsDraggingVideos(false);
              if (e.dataTransfer.files) {
                handleFilesSelected(e.dataTransfer.files, 'VIDEO');
              }
            }}
            onClick={() => videoInputRef.current?.click()}
            className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all ${
              isDraggingVideos
                ? 'border-purple-400 bg-purple-500/10 scale-[1.01]'
                : 'border-slate-800 hover:border-purple-500/40 bg-slate-950/40 hover:bg-slate-950/60'
            }`}
          >
            <div className="flex flex-col items-center justify-center space-y-2">
              <UploadCloud className="w-6 h-6 text-purple-400" />
              <p className="text-xs font-semibold text-slate-200">
                Drag & Drop Videos here, or <span className="text-purple-400 underline">Browse Files</span>
              </p>
              <span className="text-[11px] text-slate-500">
                Supported formats: MP4, WEBM, MOV (Max 200MB each with direct upload)
              </span>
            </div>
          </div>
        )}

        {/* Videos Grid */}
        {videos.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-500">
            No video clips added to this showcase yet.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {videos.map((video, idx) => (
              <ShowcaseMediaCard
                key={video.id}
                media={video}
                index={idx}
                totalCount={videos.length}
                canEdit={!isViewer}
                onPreview={setPreviewMedia}
                onDelete={handleDeleteMedia}
                onMoveUp={(i) => handleMoveVideo(i, 'up')}
                onMoveDown={(i) => handleMoveVideo(i, 'down')}
              />
            ))}
          </div>
        )}
      </div>

      {/* Bottom Sticky Save Bar if needed */}
      {!isViewer && (
        <div className="flex items-center justify-between p-4 bg-slate-900/90 border border-slate-800 rounded-2xl backdrop-blur-md">
          <span className="text-xs text-slate-400">
            Ready to publish or save your showcase updates?
          </span>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => handleSave()}
              disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 transition-all shadow-md shadow-amber-500/20 cursor-pointer"
            >
              <Save className="w-4 h-4" />
              <span>{saving ? 'Saving...' : 'Save Showcase'}</span>
            </button>
          </div>
        </div>
      )}

      {/* Media Preview Modal (Image Lightbox & HTML5 Video Player) */}
      <ShowcaseMediaPreviewModal
        media={previewMedia}
        onClose={() => setPreviewMedia(null)}
        onUpdateThumbnail={handleUpdateThumbnail}
        canEdit={!isViewer}
      />
    </div>
  );
};
