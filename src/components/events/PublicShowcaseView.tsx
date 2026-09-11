import React, { useState, useEffect, useCallback } from 'react';
import { useRouteContext, navigateTo } from '../../hooks/useRouteContext';
import { useAuth } from '../../context/AuthContext';
import { apiFetch } from '../../lib/api';
import { EventShowcase, EventShowcaseMedia } from '../../types/showcase';
import { GAME_REGISTRY } from '../../games/registry';
import { formatEventDateRange } from '../../lib/dateUtils';
import {
  Gamepad2,
  Share2,
  Check,
  Calendar,
  Sparkles,
  ArrowLeft,
  Eye,
  Play,
  Film,
  Image as ImageIcon,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  X,
  Building2,
  Info,
  Layers,
  ArrowRight,
} from 'lucide-react';

interface PublicShowcaseEvent {
  id: string;
  name: string;
  game_type: string;
  start_date: string;
  end_date: string;
  event_timezone?: string;
}

export const PublicShowcaseView: React.FC = () => {
  const routeContext = useRouteContext();
  const { isAuthenticated } = useAuth();

  const showcaseParam = routeContext.showcaseId || (typeof window !== 'undefined' ? window.location.pathname.split('/')[2] : '');

  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [showcase, setShowcase] = useState<EventShowcase | null>(null);
  const [event, setEvent] = useState<PublicShowcaseEvent | null>(null);
  const [media, setMedia] = useState<EventShowcaseMedia[]>([]);
  const [isPreview, setIsPreview] = useState<boolean>(false);

  // Gallery filter & lightbox
  const [activeTab, setActiveTab] = useState<'ALL' | 'IMAGE' | 'VIDEO'>('ALL');
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [copySuccess, setCopySuccess] = useState<boolean>(false);
  const [shareFeedback, setShareFeedback] = useState<string | null>(null);

  // Fetch showcase data
  useEffect(() => {
    let isMounted = true;

    async function loadShowcase() {
      if (!showcaseParam) {
        setError('Showcase identifier is missing.');
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        // 1. Try dedicated public showcase endpoint: /api/showcases/:id
        let res = await apiFetch(`/api/showcases/${encodeURIComponent(showcaseParam)}`);

        if (res.ok) {
          const data = await res.json();
          if (isMounted) {
            setShowcase(data.showcase || null);
            setEvent(data.event || null);
            setMedia(Array.isArray(data.media) ? data.media : []);
            setIsPreview(Boolean(data.isPreview));
            setLoading(false);
          }
          return;
        }

        // 2. Fallback to /api/events/:id/showcase in case parameter was event ID
        res = await apiFetch(`/api/events/${encodeURIComponent(showcaseParam)}/showcase`);
        if (res.ok) {
          const data = await res.json();
          if (isMounted && data.showcase) {
            setShowcase(data.showcase);
            // Also fetch media
            try {
              const mediaRes = await apiFetch(`/api/events/${encodeURIComponent(showcaseParam)}/showcase/media`);
              if (mediaRes.ok) {
                const mediaData = await mediaRes.json();
                setMedia(Array.isArray(mediaData.media) ? mediaData.media : []);
              }
            } catch (mediaErr) {
              console.warn('Failed to load showcase media fallback:', mediaErr);
            }
            setLoading(false);
            return;
          }
        }

        // 3. Status-specific error messages
        if (res.status === 404) {
          setError('This showcase is either not published or does not exist.');
        } else if (res.status === 403) {
          setError('This showcase is private and not currently viewable.');
        } else {
          setError('Unable to load showcase at this time.');
        }
      } catch (err: any) {
        console.error('Error fetching showcase:', err);
        if (isMounted) {
          setError(err.message || 'Failed to connect to the showcase service.');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    loadShowcase();

    return () => {
      isMounted = false;
    };
  }, [showcaseParam]);

  // Filtered media list
  const filteredMedia = media.filter((item) => {
    if (activeTab === 'IMAGE') return item.media_type === 'IMAGE';
    if (activeTab === 'VIDEO') return item.media_type === 'VIDEO';
    return true;
  });

  const photoCount = media.filter((m) => m.media_type === 'IMAGE').length;
  const videoCount = media.filter((m) => m.media_type === 'VIDEO').length;

  // Share handlers
  const currentUrl = typeof window !== 'undefined' ? window.location.href : '';
  const shareTitle = showcase ? `${showcase.title} — Event Game Studio Showcase` : 'Event Game Studio Showcase';
  const shareText = showcase?.description || 'Check out this interactive event mini-game activation on Event Game Studio!';

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: shareTitle,
          text: shareText,
          url: currentUrl,
        });
        setShareFeedback('Shared successfully!');
        setTimeout(() => setShareFeedback(null), 3000);
        return;
      } catch (err: any) {
        if (err.name === 'AbortError') return;
      }
    }

    // Fallback: Copy to clipboard
    try {
      await navigator.clipboard.writeText(currentUrl);
      setCopySuccess(true);
      setShareFeedback('Link copied to clipboard!');
      setTimeout(() => {
        setCopySuccess(false);
        setShareFeedback(null), 3000;
      }, 3000);
    } catch {
      setShareFeedback('Failed to copy link.');
      setTimeout(() => setShareFeedback(null), 3000);
    }
  };

  const handleSocialShare = (platform: 'whatsapp' | 'twitter' | 'linkedin' | 'facebook') => {
    const encodedUrl = encodeURIComponent(currentUrl);
    const encodedText = encodeURIComponent(shareTitle);
    let shareUrl = '';

    switch (platform) {
      case 'whatsapp':
        shareUrl = `https://wa.me/?text=${encodedText}%20${encodedUrl}`;
        break;
      case 'twitter':
        shareUrl = `https://twitter.com/intent/tweet?text=${encodedText}&url=${encodedUrl}`;
        break;
      case 'linkedin':
        shareUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`;
        break;
      case 'facebook':
        shareUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`;
        break;
    }

    if (shareUrl) {
      window.open(shareUrl, '_blank', 'noopener,noreferrer');
    }
  };

  // Keyboard navigation for Lightbox
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (lightboxIndex === null) return;
      if (e.key === 'Escape') {
        setLightboxIndex(null);
      } else if (e.key === 'ArrowRight') {
        setLightboxIndex((prev) => (prev !== null && prev < filteredMedia.length - 1 ? prev + 1 : 0));
      } else if (e.key === 'ArrowLeft') {
        setLightboxIndex((prev) => (prev !== null && prev > 0 ? prev - 1 : filteredMedia.length - 1));
      }
    },
    [lightboxIndex, filteredMedia.length]
  );

  useEffect(() => {
    if (lightboxIndex !== null) {
      window.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [lightboxIndex, handleKeyDown]);

  const activeMedia = lightboxIndex !== null ? filteredMedia[lightboxIndex] : null;

  // Resolve game metadata
  const gameDef = event?.game_type ? GAME_REGISTRY[event.game_type] : null;
  const gameName = gameDef?.name || event?.game_type || 'Interactive Event Mini-Game';

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-amber-500 selection:text-slate-950">
      {/* 1. STICKY TOP BRAND HEADER */}
      <header
        id="public-showcase-header"
        className="sticky top-0 z-40 w-full bg-slate-950/90 backdrop-blur-xl border-b border-slate-800/80 transition-all"
      >
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 sm:h-20 flex items-center justify-between gap-4">
          {/* Brand Logo & Back to Home */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigateTo('/')}
              className="flex items-center gap-2.5 text-left group transition-transform focus:outline-none"
              aria-label="EventGameStudio Home"
            >
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500 to-amber-400 flex items-center justify-center shadow-lg shadow-amber-500/20 group-hover:scale-105 transition-transform">
                <Gamepad2 className="w-5 h-5 text-slate-950" />
              </div>
              <div>
                <span className="text-base sm:text-lg font-black tracking-tight text-white block group-hover:text-amber-400 transition-colors">
                  EventGame<span className="text-amber-400">Studio</span>
                </span>
                <span className="text-[10px] text-slate-400 font-semibold tracking-wider uppercase block -mt-1">
                  Public Showcase
                </span>
              </div>
            </button>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2.5 sm:gap-3">
            <button
              id="showcase-share-btn-top"
              onClick={handleShare}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold bg-slate-900 hover:bg-slate-800 text-slate-200 hover:text-white border border-slate-700/70 transition-all active:scale-95 shadow-sm"
              title="Share this showcase"
            >
              {copySuccess ? (
                <>
                  <Check className="w-4 h-4 text-emerald-400" />
                  <span className="text-emerald-400 hidden sm:inline">Copied!</span>
                </>
              ) : (
                <>
                  <Share2 className="w-4 h-4 text-amber-400" />
                  <span className="hidden sm:inline">Share</span>
                </>
              )}
            </button>

            <button
              onClick={() => (isAuthenticated ? navigateTo('/events') : navigateTo('/login'))}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 transition-all active:scale-95 shadow-md shadow-amber-500/20"
            >
              <span className="hidden sm:inline">Create Event</span>
              <span className="sm:hidden">Create</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </header>

      {/* Share toast message */}
      {shareFeedback && (
        <div className="fixed top-20 right-4 z-50 animate-in fade-in slide-in-from-top duration-200">
          <div className="bg-slate-900 border border-amber-500/40 text-amber-300 text-xs sm:text-sm font-medium px-4 py-2.5 rounded-xl shadow-xl flex items-center gap-2">
            <Check className="w-4 h-4 text-amber-400" />
            <span>{shareFeedback}</span>
          </div>
        </div>
      )}

      {/* 2. PREVIEW MODE BANNER (For Org Members viewing unlisted/draft showcases) */}
      {isPreview && (
        <aside aria-label="Showcase preview mode" className="bg-amber-500/15 border-b border-amber-500/30 text-amber-200 px-4 py-2.5 text-xs sm:text-sm">
          <div className="max-w-6xl mx-auto flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Eye className="w-4 h-4 text-amber-400 flex-shrink-0" />
              <span>
                <strong>Showcase Preview:</strong> You are viewing this showcase as an organization member. It is not currently public.
              </span>
            </div>
            {event?.id && (
              <button
                onClick={() => navigateTo(`/events/${event.id}/showcase`)}
                className="text-xs font-bold text-amber-400 hover:text-amber-300 underline underline-offset-2 flex-shrink-0"
              >
                Showcase Manager &rarr;
              </button>
            )}
          </div>
        </aside>
      )}

      {/* 3. MAIN BODY CONTAINER */}
      <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
        {/* Loading State */}
        {loading && (
          <div className="py-24 flex flex-col items-center justify-center space-y-4">
            <div className="w-10 h-10 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-slate-400 font-medium">Loading event showcase...</p>
          </div>
        )}

        {/* Error / Not Found State */}
        {!loading && error && (
          <div className="py-16 sm:py-24 max-w-lg mx-auto text-center">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center text-amber-400 mb-6 shadow-xl">
              <Sparkles className="w-8 h-8 opacity-60" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-white mb-3 tracking-tight">
              Showcase Not Available
            </h1>
            <p className="text-sm text-slate-400 mb-8 leading-relaxed">{error}</p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <button
                onClick={() => navigateTo('/')}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 transition-all shadow-lg shadow-amber-500/20"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to EventGameStudio
              </button>
              {isAuthenticated && (
                <button
                  onClick={() => navigateTo('/events')}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700/80 transition-all"
                >
                  Go to My Events
                </button>
              )}
            </div>
          </div>
        )}

        {/* Loaded Showcase Presentation */}
        {!loading && !error && showcase && (
          <article className="space-y-8 sm:space-y-12 animate-in fade-in duration-300">
            {/* HERO BANNER SECTION */}
            <section
              id="showcase-hero"
              className="relative rounded-3xl overflow-hidden bg-slate-900 border border-slate-800/80 shadow-2xl"
            >
              {/* Cover Backdrop */}
              {showcase.cover_image_url ? (
                <div className="relative w-full h-56 sm:h-80 md:h-96 overflow-hidden">
                  <img
                    src={showcase.cover_image_url}
                    alt={showcase.title}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/60 to-transparent" />
                </div>
              ) : (
                <div className="relative w-full h-40 sm:h-56 bg-gradient-to-br from-slate-900 via-slate-950 to-amber-950/20 flex items-center justify-center overflow-hidden">
                  <div className="absolute -right-12 -bottom-12 w-64 h-64 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
                  <Sparkles className="w-16 h-16 text-amber-400/20" />
                </div>
              )}

              {/* Hero Information Block */}
              <div className="relative p-6 sm:p-10 -mt-16 sm:-mt-20">
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                  <div className="space-y-4 max-w-3xl">
                    {/* Client / Brand Tag */}
                    {(showcase.client_name || showcase.client_logo_url) && (
                      <div className="inline-flex items-center gap-2.5 px-3 py-1.5 rounded-full bg-slate-900/90 border border-slate-700/80 backdrop-blur-md shadow-md">
                        {showcase.client_logo_url ? (
                          <img
                            src={showcase.client_logo_url}
                            alt={showcase.client_name || 'Client Logo'}
                            referrerPolicy="no-referrer"
                            className="w-5 h-5 rounded-full object-cover"
                          />
                        ) : (
                          <Building2 className="w-4 h-4 text-amber-400" />
                        )}
                        <span className="text-xs font-semibold text-slate-200">
                          {showcase.client_name || 'Featured Brand'}
                        </span>
                      </div>
                    )}

                    {/* Showcase Title */}
                    <h1 className="text-2xl sm:text-4xl md:text-5xl font-black text-white tracking-tight leading-tight">
                      {showcase.title}
                    </h1>

                    {/* Event Metadata Badges */}
                    <div className="flex flex-wrap items-center gap-2.5 pt-1 text-xs text-slate-300">
                      {/* Game Type Badge */}
                      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 font-semibold">
                        <Gamepad2 className="w-3.5 h-3.5" />
                        {gameName}
                      </span>

                      {/* Event Date Badge */}
                      {event && (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800/80 border border-slate-700/80 text-slate-300">
                          <Calendar className="w-3.5 h-3.5 text-slate-400" />
                          {formatEventDateRange(event.start_date, event.end_date)}
                        </span>
                      )}

                      {/* Event Name */}
                      {event?.name && (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800/80 border border-slate-700/80 text-slate-300 font-medium">
                          <Layers className="w-3.5 h-3.5 text-slate-400" />
                          {event.name}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Share Action */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      id="showcase-share-btn-hero"
                      onClick={handleShare}
                      className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 transition-all active:scale-95 shadow-lg shadow-amber-500/20"
                    >
                      <Share2 className="w-4 h-4" />
                      <span>{copySuccess ? 'Link Copied!' : 'Share Showcase'}</span>
                    </button>
                  </div>
                </div>
              </div>
            </section>

            {/* DESCRIPTION / STORY SECTION */}
            {showcase.description && (
              <section
                id="showcase-story"
                className="bg-slate-900/60 border border-slate-800/80 rounded-3xl p-6 sm:p-8 backdrop-blur-sm"
              >
                <h2 className="text-xs font-bold uppercase tracking-wider text-amber-400 mb-3 flex items-center gap-2">
                  <Info className="w-3.5 h-3.5" />
                  Activation Overview
                </h2>
                <div className="prose prose-invert max-w-none text-slate-300 text-sm sm:text-base leading-relaxed whitespace-pre-line">
                  {showcase.description}
                </div>
              </section>
            )}

            {/* MEDIA GALLERY SECTION */}
            <section id="showcase-gallery" className="space-y-6">
              {/* Gallery Header & Filter Pills */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-800">
                <div>
                  <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2.5">
                    Event Gallery
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-slate-800 text-slate-400">
                      {media.length}
                    </span>
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Photos and live recordings from the event activation
                  </p>
                </div>

                {/* Filter Tabs */}
                {media.length > 0 && (
                  <div className="flex items-center gap-1.5 p-1 bg-slate-900 rounded-xl border border-slate-800 self-start sm:self-auto">
                    <button
                      onClick={() => setActiveTab('ALL')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                        activeTab === 'ALL'
                          ? 'bg-amber-500 text-slate-950 shadow'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      All ({media.length})
                    </button>
                    <button
                      onClick={() => setActiveTab('IMAGE')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                        activeTab === 'IMAGE'
                          ? 'bg-amber-500 text-slate-950 shadow'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      <ImageIcon className="w-3 h-3" />
                      Photos ({photoCount})
                    </button>
                    <button
                      onClick={() => setActiveTab('VIDEO')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                        activeTab === 'VIDEO'
                          ? 'bg-amber-500 text-slate-950 shadow'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      <Film className="w-3 h-3" />
                      Videos ({videoCount})
                    </button>
                  </div>
                )}
              </div>

              {/* Empty Gallery State */}
              {media.length === 0 ? (
                <div className="py-16 text-center bg-slate-900/40 border border-slate-800/80 rounded-3xl p-8">
                  <ImageIcon className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                  <p className="text-sm font-medium text-slate-400">
                    No photos or videos have been published for this showcase yet.
                  </p>
                </div>
              ) : filteredMedia.length === 0 ? (
                <div className="py-12 text-center bg-slate-900/40 border border-slate-800/80 rounded-3xl p-8">
                  <p className="text-sm text-slate-400">
                    No {activeTab.toLowerCase()} items found in this showcase.
                  </p>
                </div>
              ) : (
                /* Media Grid */
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                  {filteredMedia.map((item, index) => {
                    const isVideo = item.media_type === 'VIDEO';
                    const thumbnailSrc = item.thumbnail_url || item.media_url;

                    return (
                      <div
                        key={item.id}
                        id={`showcase-media-card-${item.id}`}
                        onClick={() => setLightboxIndex(index)}
                        className="group relative aspect-video rounded-2xl overflow-hidden bg-slate-900 border border-slate-800 hover:border-amber-500/50 transition-all duration-200 cursor-pointer shadow-md hover:shadow-xl hover:shadow-amber-500/5 focus:outline-none"
                        tabIndex={0}
                        role="button"
                        aria-label={`View ${isVideo ? 'video' : 'photo'} ${item.file_name}`}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setLightboxIndex(index);
                          }
                        }}
                      >
                        {/* Thumbnail / Image Cover */}
                        <img
                          src={thumbnailSrc}
                          alt={item.file_name}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          loading="lazy"
                        />

                        {/* Video Play Badge & Overlay */}
                        {isVideo && (
                          <div className="absolute inset-0 bg-slate-950/40 flex items-center justify-center group-hover:bg-slate-950/20 transition-colors">
                            <div className="w-12 h-12 rounded-full bg-amber-500 text-slate-950 flex items-center justify-center shadow-lg shadow-amber-500/30 group-hover:scale-110 transition-transform">
                              <Play className="w-5 h-5 fill-current ml-0.5" />
                            </div>
                            <div className="absolute bottom-2.5 right-2.5 px-2 py-1 rounded-md bg-slate-950/80 backdrop-blur-sm border border-slate-700/80 text-[10px] font-bold text-amber-400 flex items-center gap-1">
                              <Film className="w-3 h-3" />
                              VIDEO
                            </div>
                          </div>
                        )}

                        {/* Image Hover Zoom Icon */}
                        {!isVideo && (
                          <div className="absolute inset-0 bg-slate-950/0 group-hover:bg-slate-950/30 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                            <div className="w-10 h-10 rounded-full bg-slate-900/80 text-white backdrop-blur-md flex items-center justify-center shadow-lg">
                              <Eye className="w-5 h-5 text-amber-400" />
                            </div>
                          </div>
                        )}

                        {/* File Name Tag */}
                        <div className="absolute bottom-0 inset-x-0 p-2.5 bg-gradient-to-t from-slate-950 via-slate-950/70 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                          <p className="text-xs text-white truncate font-medium">{item.file_name}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* SHARE & BRAND FOOTER CARD */}
            <section
              id="showcase-share-footer"
              className="bg-gradient-to-br from-slate-900 via-slate-900 to-amber-950/20 border border-slate-800 rounded-3xl p-6 sm:p-10 shadow-xl"
            >
              <div className="flex flex-col md:flex-row items-center justify-between gap-6 text-center md:text-left">
                <div className="space-y-2 max-w-xl">
                  <h3 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                    Share this Activation Showcase
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
                    Inspire your audience and event stakeholders with live gameplay moments and brand engagement results.
                  </p>
                </div>

                {/* Social Share Buttons */}
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <button
                    onClick={() => handleSocialShare('whatsapp')}
                    className="px-3.5 py-2 rounded-xl text-xs font-bold bg-slate-800 hover:bg-emerald-950 hover:text-emerald-300 text-slate-300 border border-slate-700/80 transition-all active:scale-95"
                  >
                    WhatsApp
                  </button>
                  <button
                    onClick={() => handleSocialShare('twitter')}
                    className="px-3.5 py-2 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 hover:text-white text-slate-300 border border-slate-700/80 transition-all active:scale-95"
                  >
                    X / Twitter
                  </button>
                  <button
                    onClick={() => handleSocialShare('linkedin')}
                    className="px-3.5 py-2 rounded-xl text-xs font-bold bg-slate-800 hover:bg-blue-950 hover:text-blue-300 text-slate-300 border border-slate-700/80 transition-all active:scale-95"
                  >
                    LinkedIn
                  </button>
                  <button
                    onClick={handleShare}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 transition-all active:scale-95 shadow-md shadow-amber-500/20"
                  >
                    {copySuccess ? <Check className="w-3.5 h-3.5" /> : <Share2 className="w-3.5 h-3.5" />}
                    <span>{copySuccess ? 'Copied!' : 'Copy Link'}</span>
                  </button>
                </div>
              </div>
            </section>
          </article>
        )}
      </main>

      {/* 4. LIGHTBOX PREVIEW MODAL */}
      {lightboxIndex !== null && activeMedia && (
        <div
          id="showcase-lightbox"
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/90 backdrop-blur-xl animate-in fade-in duration-200"
          onClick={() => setLightboxIndex(null)}
        >
          {/* Modal Content */}
          <div
            className="relative w-full max-w-5xl bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[92vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/70">
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className={`w-8 h-8 rounded-xl flex items-center justify-center ${
                    activeMedia.media_type === 'VIDEO'
                      ? 'bg-amber-500/20 text-amber-400'
                      : 'bg-blue-500/20 text-blue-400'
                  }`}
                >
                  {activeMedia.media_type === 'VIDEO' ? (
                    <Film className="w-4 h-4" />
                  ) : (
                    <ImageIcon className="w-4 h-4" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-xs sm:text-sm font-bold text-white truncate">
                    {activeMedia.file_name}
                  </p>
                  <p className="text-[11px] text-slate-400">
                    {lightboxIndex + 1} of {filteredMedia.length}
                  </p>
                </div>
              </div>

              {/* Close Button */}
              <button
                onClick={() => setLightboxIndex(null)}
                className="w-8 h-8 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-colors"
                aria-label="Close media preview"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Media Body */}
            <div className="relative flex-1 bg-black flex items-center justify-center min-h-[300px] max-h-[70vh] overflow-hidden">
              {activeMedia.media_type === 'VIDEO' ? (
                <video
                  src={activeMedia.media_url}
                  poster={activeMedia.thumbnail_url || undefined}
                  controls
                  autoPlay
                  playsInline
                  className="w-full h-full max-h-[70vh] object-contain"
                />
              ) : (
                <img
                  src={activeMedia.media_url}
                  alt={activeMedia.file_name}
                  referrerPolicy="no-referrer"
                  className="w-full h-full max-h-[70vh] object-contain"
                />
              )}

              {/* Previous / Next Arrow Controls */}
              {filteredMedia.length > 1 && (
                <>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setLightboxIndex((prev) =>
                        prev !== null && prev > 0 ? prev - 1 : filteredMedia.length - 1
                      );
                    }}
                    className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-slate-900/80 hover:bg-slate-900 text-white backdrop-blur-md flex items-center justify-center border border-slate-700/80 transition-all active:scale-95"
                    aria-label="Previous item"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setLightboxIndex((prev) =>
                        prev !== null && prev < filteredMedia.length - 1 ? prev + 1 : 0
                      );
                    }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-slate-900/80 hover:bg-slate-900 text-white backdrop-blur-md flex items-center justify-center border border-slate-700/80 transition-all active:scale-95"
                    aria-label="Next item"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-3.5 border-t border-slate-800 bg-slate-950/70 flex items-center justify-between text-xs text-slate-400">
              <span className="truncate">{activeMedia.file_name}</span>
              <a
                href={activeMedia.media_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-amber-400 hover:text-amber-300 font-semibold"
              >
                <span>View Full Quality</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>
        </div>
      )}

      {/* 5. BRAND FOOTER */}
      <footer className="w-full border-t border-slate-800/80 bg-slate-950 py-8 text-center text-xs text-slate-500">
        <div className="max-w-6xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Gamepad2 className="w-4 h-4 text-amber-400" />
            <span className="font-bold text-slate-300">EventGameStudio</span>
            <span>&copy; {new Date().getFullYear()}</span>
          </div>
          <p className="text-slate-400">
            Interactive event mini-games, branded activations, and live leaderboards.
          </p>
        </div>
      </footer>
    </div>
  );
};
