import React, { useState, useEffect } from 'react';
import { apiFetch } from '../../lib/api';
import { EventShowcase, ShowcaseStatus } from '../../types/showcase';
import { isEventEligibleForShowcase } from '../../lib/dateUtils';
import { ShowcaseMediaManager } from './showcase/ShowcaseMediaManager';
import {
  Sparkles,
  Globe,
  EyeOff,
  Check,
  AlertCircle,
  Building2,
  Image as ImageIcon,
  FileText,
  Clock,
  ExternalLink,
  Plus,
  Save,
  CheckCircle2,
  Film,
  Layers,
  XCircle,
  Lock,
  Trash2,
  Eye,
  Share2,
} from 'lucide-react';

interface EventShowcaseTabProps {
  event: any;
  userRole?: string;
  onShowcaseChanged?: (showcase: EventShowcase | null) => void;
  initialLifetimeRewardStatus?: any;
}

export const EventShowcaseTab: React.FC<EventShowcaseTabProps> = ({
  event,
  userRole,
  onShowcaseChanged,
}) => {
  const [showcase, setShowcase] = useState<EventShowcase | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [subSection, setSubSection] = useState<'details' | 'media'>('details');

  // Form fields
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [clientName, setClientName] = useState('');
  const [clientLogoUrl, setClientLogoUrl] = useState('');
  const [coverImageUrl, setCoverImageUrl] = useState('');
  const [copiedShowcase, setCopiedShowcase] = useState(false);

  const isViewer = userRole === 'viewer';
  const isBlocked = showcase?.status === 'BLOCKED';
  const isLocked = isViewer || isBlocked;

  const handleShareShowcase = async () => {
    const targetId = showcase?.id || event.id;
    const showcaseUrl = `${window.location.origin}/showcase/${targetId}`;
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: showcase?.title || title || event.name || 'Event Showcase',
          url: showcaseUrl,
        });
        return;
      } catch (err: any) {
        if (err.name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(showcaseUrl);
      setCopiedShowcase(true);
      setTimeout(() => setCopiedShowcase(false), 2000);
    } catch (err) {
      console.error('Failed to copy showcase URL', err);
    }
  };

  const fetchShowcase = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await apiFetch(`/api/events/${event.id}/showcase`);

      if (res.status === 404) {
        setShowcase(null);
        setTitle(event.name || '');
        return;
      }

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to load showcase');
      }

      const data = await res.json();
      const sc: EventShowcase | null = data.showcase;
      setShowcase(sc);

      if (sc) {
        setTitle(sc.title || '');
        setDescription(sc.description || '');
        setClientName(sc.client_name || '');
        setClientLogoUrl(sc.client_logo_url || '');
        setCoverImageUrl(sc.cover_image_url || '');
      } else {
        setTitle(event.name || '');
      }
    } catch (err: any) {
      console.error('Error fetching showcase:', err);
      setError(err.message || 'Failed to load event showcase');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (event?.id) {
      fetchShowcase();
    }
  }, [event?.id]);

  const handleCreateShowcase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('Showcase title is required');
      return;
    }

    const eligibility = isEventEligibleForShowcase(event);
    if (!eligibility.eligible) {
      setError(eligibility.reason || 'Showcase is only available for completed events.');
      return;
    }

    try {
      setSaving(true);
      setError(null);
      setSuccessMsg(null);

      const res = await apiFetch(`/api/events/${event.id}/showcase`, {
        method: 'POST',
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || null,
          client_name: clientName.trim() || null,
          client_logo_url: clientLogoUrl.trim() || null,
          cover_image_url: coverImageUrl.trim() || null,
          status: 'PUBLISHED',
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to create showcase');
      }

      const data = await res.json();
      setShowcase(data.showcase);
      setSuccessMsg('Showcase created and published successfully!');
      if (onShowcaseChanged) onShowcaseChanged(data.showcase);
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      console.error('Create showcase error:', err);
      setError(err.message || 'Failed to create showcase');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveShowcase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('Showcase title is required');
      return;
    }

    try {
      setSaving(true);
      setError(null);
      setSuccessMsg(null);

      const res = await apiFetch(`/api/events/${event.id}/showcase`, {
        method: 'PATCH',
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || null,
          client_name: clientName.trim() || null,
          client_logo_url: clientLogoUrl.trim() || null,
          cover_image_url: coverImageUrl.trim() || null,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to save showcase');
      }

      const data = await res.json();
      setShowcase(data.showcase);
      setSuccessMsg('Showcase changes saved successfully!');
      if (onShowcaseChanged) onShowcaseChanged(data.showcase);
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      console.error('Save showcase error:', err);
      setError(err.message || 'Failed to save showcase');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteShowcase = async () => {
    if (!window.confirm('Are you sure you want to delete this showcase? It will be removed from public view.')) {
      return;
    }

    try {
      setDeleting(true);
      setError(null);
      const res = await apiFetch(`/api/events/${event.id}/showcase`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to delete showcase');
      }

      setShowcase(null);
      setTitle(event.name || '');
      setDescription('');
      setClientName('');
      setClientLogoUrl('');
      setCoverImageUrl('');
      setSuccessMsg('Showcase deleted successfully.');
      if (onShowcaseChanged) onShowcaseChanged(null);
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      console.error('Delete showcase error:', err);
      setError(err.message || 'Failed to delete showcase');
    } finally {
      setDeleting(false);
    }
  };

  const handlePublish = async () => {
    try {
      setPublishing(true);
      setError(null);
      const res = await apiFetch(`/api/events/${event.id}/showcase/publish`, {
        method: 'POST',
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to publish showcase');
      }

      const data = await res.json();
      setShowcase(data.showcase);
      setSuccessMsg('Showcase published! It is now publicly visible.');
      if (onShowcaseChanged) onShowcaseChanged(data.showcase);
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      console.error('Publish showcase error:', err);
      setError(err.message || 'Failed to publish showcase');
    } finally {
      setPublishing(false);
    }
  };

  const handleUnpublish = async () => {
    try {
      setPublishing(true);
      setError(null);
      const res = await apiFetch(`/api/events/${event.id}/showcase/unpublish`, {
        method: 'POST',
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to unpublish showcase');
      }

      const data = await res.json();
      setShowcase(data.showcase);
      setSuccessMsg('Showcase unpublished (saved as private).');
      if (onShowcaseChanged) onShowcaseChanged(data.showcase);
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      console.error('Unpublish showcase error:', err);
      setError(err.message || 'Failed to unpublish showcase');
    } finally {
      setPublishing(false);
    }
  };

  if (loading) {
    return (
      <div className="py-16 text-center space-y-3">
        <div className="w-7 h-7 border-3 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-xs text-slate-400">Loading showcase details...</p>
      </div>
    );
  }

  const getVisibilityBadge = (status?: string) => {
    switch (status) {
      case 'PUBLISHED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/15 border border-emerald-500/30 text-emerald-400">
            <Globe className="w-3.5 h-3.5 text-emerald-400" />
            PUBLISHED (PUBLIC)
          </span>
        );
      case 'BLOCKED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-500/15 border border-rose-500/30 text-rose-400">
            <XCircle className="w-3.5 h-3.5 text-rose-400" />
            BLOCKED BY MODERATION
          </span>
        );
      case 'DRAFT':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/10 border border-amber-500/30 text-amber-400">
            <FileText className="w-3.5 h-3.5 text-amber-400" />
            DRAFT
          </span>
        );
      case 'UNPUBLISHED':
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-800 border border-slate-700 text-slate-400">
            <EyeOff className="w-3.5 h-3.5 text-slate-500" />
            UNPUBLISHED (PRIVATE)
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Notifications */}
      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-2xl flex items-center gap-2 text-xs text-red-300">
          <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
          <span>{error}</span>
        </div>
      )}

      {successMsg && (
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl flex items-center gap-2 text-xs text-emerald-300">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Moderation Block Banner */}
      {showcase && showcase.status === 'BLOCKED' && (
        <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-2xl flex items-start gap-3">
          <XCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
          <div className="space-y-1.5 flex-1">
            <div className="text-xs font-bold text-rose-300">Showcase Blocked by Moderation</div>
            <p className="text-xs text-rose-200/90 leading-relaxed bg-rose-950/40 p-2.5 rounded-xl border border-rose-500/20">
              <span className="font-semibold text-rose-300">Moderator Note:</span> {showcase.moderation_reason || 'This showcase has been hidden from public view for violating content guidelines.'}
            </p>
          </div>
        </div>
      )}


      {/* If Showcase does not exist yet */}
      {!showcase ? (
        !isEventEligibleForShowcase(event).eligible ? (
          <div className="bg-slate-950/60 border border-slate-800 rounded-3xl p-8 text-center space-y-3">
            <div className="w-12 h-12 bg-slate-900 border border-slate-800 rounded-2xl flex items-center justify-center mx-auto text-slate-500">
              <Lock className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-bold text-slate-200">Showcase Not Available</h3>
              <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
                {isEventEligibleForShowcase(event).reason ||
                  'Event Showcases can only be created for completed events (paid events whose scheduled end date has passed).'}
              </p>
            </div>
          </div>
        ) : (
        <div className="space-y-6">
          <div className="bg-slate-950/60 border border-slate-800 rounded-3xl p-6 text-center space-y-3">
            <div className="w-12 h-12 bg-amber-500/10 border border-amber-500/20 rounded-2xl flex items-center justify-center mx-auto text-amber-400">
              <Sparkles className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-bold text-slate-200">No Showcase Created Yet</h3>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                Create an Event Showcase to display your event photos, branding, and activation results. Normal showcases publish immediately without administrative pre-approval.
              </p>
            </div>
          </div>

          {!isViewer && (
            <form onSubmit={handleCreateShowcase} className="space-y-4 bg-slate-950/40 border border-slate-800 rounded-3xl p-5">
              <div className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                Create Event Showcase
              </div>

              <div className="space-y-3">
                {/* Title */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Showcase Title <span className="text-amber-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Acme Corp Summer Festival Activation"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 placeholder:text-slate-600 focus:border-amber-500 outline-none"
                    required
                  />
                </div>

                {/* Client Name & Logo */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Client / Sponsor Name
                    </label>
                    <input
                      type="text"
                      value={clientName}
                      onChange={(e) => setClientName(e.target.value)}
                      placeholder="e.g. Acme Corporation"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 placeholder:text-slate-600 focus:border-amber-500 outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Client Logo URL
                    </label>
                    <input
                      type="url"
                      value={clientLogoUrl}
                      onChange={(e) => setClientLogoUrl(e.target.value)}
                      placeholder="https://.../logo.png"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 placeholder:text-slate-600 focus:border-amber-500 outline-none"
                    />
                  </div>
                </div>

                {/* Cover Image URL */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Cover Image URL
                  </label>
                  <input
                    type="url"
                    value={coverImageUrl}
                    onChange={(e) => setCoverImageUrl(e.target.value)}
                    placeholder="https://.../cover-banner.jpg"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 placeholder:text-slate-600 focus:border-amber-500 outline-none"
                  />
                </div>

                {/* Description */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Description & Highlights
                  </label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={3}
                    placeholder="Describe the campaign objectives, activation context, and performance..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 placeholder:text-slate-600 focus:border-amber-500 outline-none resize-none"
                  />
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-bold px-4 py-2.5 rounded-xl text-xs transition-all shadow-md shadow-amber-500/20 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>{saving ? 'Creating & Publishing...' : 'Create & Publish Showcase'}</span>
                </button>
              </div>
            </form>
          )}
        </div>
        )
      ) : (
        /* Showcase Exists - Management & Edit Form */
        <div className="space-y-6">
          {/* Status & Action Bar */}
          <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Visibility:</span>
                {getVisibilityBadge(showcase.status)}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {showcase.status === 'PUBLISHED' && !isBlocked && showcase.status !== 'DELETED' && (
                <>
                  <button
                    type="button"
                    onClick={() => window.open(`/showcase/${showcase.id || event.id}`, '_blank')}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors cursor-pointer"
                    title="View Public Showcase in New Tab"
                  >
                    <Eye className="w-3.5 h-3.5 text-emerald-400" />
                    <span>View Public Showcase</span>
                    <ExternalLink className="w-3 h-3 text-slate-400" />
                  </button>
                  <button
                    type="button"
                    onClick={handleShareShowcase}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors cursor-pointer"
                    title="Share Public Showcase URL"
                  >
                    {copiedShowcase ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-emerald-400 font-bold">Link copied</span>
                      </>
                    ) : (
                      <>
                        <Share2 className="w-3.5 h-3.5 text-amber-400" />
                        <span>Share</span>
                      </>
                    )}
                  </button>
                </>
              )}

              {!isViewer && !isBlocked && (
                <>
                  {/* Publish / Unpublish Toggle */}
                  {showcase.status === 'PUBLISHED' ? (
                    <button
                      type="button"
                      onClick={handleUnpublish}
                      disabled={publishing}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors cursor-pointer disabled:opacity-50"
                    >
                      <EyeOff className="w-3.5 h-3.5" />
                      <span>{publishing ? 'Unpublishing...' : 'Unpublish'}</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handlePublish}
                      disabled={publishing}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition-all shadow-md shadow-emerald-600/20 cursor-pointer disabled:opacity-50"
                    >
                      <Globe className="w-3.5 h-3.5" />
                      <span>{publishing ? 'Publishing...' : 'Publish'}</span>
                    </button>
                  )}

                  {/* Delete Showcase Button */}
                  <button
                    type="button"
                    onClick={handleDeleteShowcase}
                    disabled={deleting}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 border border-rose-800/40 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                    <span>{deleting ? 'Deleting...' : 'Delete'}</span>
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Sub Navigation: Details vs Media */}
          <div className="flex items-center gap-1.5 border-b border-slate-800 pb-3">
            <button
              type="button"
              onClick={() => setSubSection('details')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                subSection === 'details'
                  ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                  : 'bg-slate-900/80 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Overview & Branding</span>
            </button>

            <button
              type="button"
              onClick={() => setSubSection('media')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                subSection === 'media'
                  ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                  : 'bg-slate-900/80 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800'
              }`}
            >
              <Film className="w-3.5 h-3.5 text-purple-400" />
              <span>Photos & Videos Gallery</span>
            </button>
          </div>

          {subSection === 'media' ? (
            <ShowcaseMediaManager
              eventId={event.id}
              showcase={showcase}
              userRole={isLocked ? 'viewer' : userRole}
            />
          ) : (
            /* Form */
            <form onSubmit={handleSaveShowcase} className="space-y-4">
              {isLocked && (
                <div className="p-2.5 bg-slate-900/80 border border-slate-800 rounded-xl flex items-center gap-2 text-[11px] text-slate-400">
                  <Lock className="w-3.5 h-3.5 text-slate-500" />
                  <span>
                    {isBlocked
                      ? 'Showcase is blocked by administrative moderation. Editing is locked.'
                      : 'You have read-only access to this showcase.'}
                  </span>
                </div>
              )}

              {/* Title */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Showcase Title <span className="text-amber-400">*</span>
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Showcase title"
                  disabled={isLocked}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 placeholder:text-slate-600 focus:border-amber-500 outline-none disabled:opacity-60 disabled:cursor-not-allowed"
                  required
                />
              </div>

              {/* Client Info */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Client / Sponsor Name
                  </label>
                  <input
                    type="text"
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                    placeholder="e.g. Acme Corporation"
                    disabled={isLocked}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 placeholder:text-slate-600 focus:border-amber-500 outline-none disabled:opacity-60 disabled:cursor-not-allowed"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Client Logo URL
                  </label>
                  <input
                    type="url"
                    value={clientLogoUrl}
                    onChange={(e) => setClientLogoUrl(e.target.value)}
                    placeholder="https://.../logo.png"
                    disabled={isLocked}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 placeholder:text-slate-600 focus:border-amber-500 outline-none disabled:opacity-60 disabled:cursor-not-allowed"
                  />
                </div>
              </div>

              {/* Logo Preview */}
              {clientLogoUrl && (
                <div className="flex items-center gap-2 p-2 bg-slate-950/60 border border-slate-800 rounded-xl">
                  <span className="text-[10px] text-slate-400 font-semibold">Client Logo Preview:</span>
                  <img
                    src={clientLogoUrl}
                    alt="Client Logo"
                    className="h-6 max-w-[120px] object-contain rounded"
                    onError={(e) => ((e.target as any).style.display = 'none')}
                  />
                </div>
              )}

              {/* Cover Image URL */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Cover Image URL
                </label>
                <input
                  type="url"
                  value={coverImageUrl}
                  onChange={(e) => setCoverImageUrl(e.target.value)}
                  placeholder="https://.../cover.jpg"
                  disabled={isLocked}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 placeholder:text-slate-600 focus:border-amber-500 outline-none disabled:opacity-60 disabled:cursor-not-allowed"
                />
              </div>

              {/* Cover Preview */}
              {coverImageUrl && (
                <div className="relative rounded-xl overflow-hidden border border-slate-800 max-h-36 bg-slate-950">
                  <img
                    src={coverImageUrl}
                    alt="Showcase Cover"
                    className="w-full h-36 object-cover"
                    onError={(e) => ((e.target as any).style.display = 'none')}
                  />
                  <div className="absolute bottom-2 left-2 bg-slate-950/80 px-2 py-0.5 rounded text-[10px] text-slate-300">
                    Cover Preview
                  </div>
                </div>
              )}

              {/* Description */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Description & Highlights
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  placeholder="Campaign background, goals, highlights..."
                  disabled={isLocked}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 placeholder:text-slate-600 focus:border-amber-500 outline-none resize-none disabled:opacity-60 disabled:cursor-not-allowed"
                />
              </div>

              {!isLocked && (
                <div className="flex justify-end pt-2">
                  <button
                    type="submit"
                    disabled={saving}
                    className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-bold px-4 py-2 rounded-xl text-xs transition-all shadow-md shadow-amber-500/20 cursor-pointer"
                  >
                    <Save className="w-4 h-4" />
                    <span>{saving ? 'Saving...' : 'Save Showcase Changes'}</span>
                  </button>
                </div>
              )}
            </form>
          )}
        </div>
      )}
    </div>
  );
};
