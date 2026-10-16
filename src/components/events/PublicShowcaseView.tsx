import React, { useState, useEffect, useCallback } from 'react';
import { useRouteContext, navigateTo } from '../../hooks/useRouteContext';
import { useAuth } from '../../context/AuthContext';
import { useLocalization } from '../../context/LocalizationContext';
import { apiFetch } from '../../lib/api';
import { LandingHeader } from '../landing/LandingHeader';
import { LandingFooter } from '../landing/LandingFooter';
import { SEO } from '../common/SEO';
import { InternalLink } from '../common/InternalLink';
import { EventShowcase, EventShowcaseMedia } from '../../types/showcase';
import {
  Sparkles,
  Calendar,
  Building2,
  Gamepad2,
  Share2,
  Check,
  ArrowLeft,
  Eye,
  Film,
  Image as ImageIcon,
  X,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  ShieldAlert,
  Trophy,
  Users,
} from 'lucide-react';

export const PublicShowcaseView: React.FC = () => {
  const { showcaseId } = useRouteContext();
  const { currentOrganization, currentUser } = useAuth();
  const { t } = useLocalization();

  const [showcase, setShowcase] = useState<EventShowcase | null>(null);
  const [mediaList, setMediaList] = useState<EventShowcaseMedia[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  useEffect(() => {
    let isMounted = true;
    if (!showcaseId) {
      setError('No showcase specified.');
      setLoading(false);
      return;
    }

    async function loadData() {
      setLoading(true);
      setError(null);
      try {
        const [scRes, mediaRes] = await Promise.all([
          apiFetch(`/api/showcases/${showcaseId}`),
          apiFetch(`/api/showcases/${showcaseId}/media`),
        ]);

        if (!scRes.ok) {
          if (scRes.status === 404) {
            throw new Error('Showcase not found or has been removed.');
          }
          if (scRes.status === 403) {
            throw new Error('This showcase is private or awaiting publication.');
          }
          const errData = await scRes.json().catch(() => ({}));
          throw new Error(errData.error || 'Failed to load showcase');
        }

        const scData = await scRes.json();
        const sc: EventShowcase = scData.showcase || scData;

        let mList: EventShowcaseMedia[] = [];
        if (mediaRes.ok) {
          const mData = await mediaRes.json();
          mList = mData.media || mData.mediaList || [];
        }

        if (isMounted) {
          setShowcase(sc);
          setMediaList(mList);
          setLoading(false);
        }
      } catch (err: any) {
        if (isMounted) {
          setError(err.message || 'Failed to load showcase');
          setLoading(false);
        }
      }
    }

    loadData();
    return () => {
      isMounted = false;
    };
  }, [showcaseId]);

  const handleShare = async () => {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({
          title: showcase?.title || 'Event Game Studio Showcase',
          text: showcase?.description || 'Check out this interactive event game activation!',
          url,
        });
        return;
      } catch {
        // User cancelled or share failed, fallback to clipboard
      }
    }

    if (navigator.clipboard) {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (lightboxIndex === null) return;
      if (e.key === 'Escape') setLightboxIndex(null);
      if (e.key === 'ArrowRight') {
        setLightboxIndex((prev) =>
          prev !== null ? (prev + 1) % mediaList.length : null
        );
      }
      if (e.key === 'ArrowLeft') {
        setLightboxIndex((prev) =>
          prev !== null ? (prev - 1 + mediaList.length) % mediaList.length : null
        );
      }
    },
    [lightboxIndex, mediaList.length]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const isOwnerOrAdmin =
    showcase &&
    currentOrganization &&
    showcase.organization_id === currentOrganization.id &&
    ['owner', 'admin'].includes(currentOrganization.role);

  const isDeveloper = currentUser?.is_developer === true;
  const isPreviewMode = showcase && showcase.status !== 'PUBLISHED' && (isOwnerOrAdmin || isDeveloper);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
        <LandingHeader onOpenCatalog={() => {}} />
        <div className="flex-1 flex flex-col items-center justify-center p-6 space-y-4">
          <div className="w-10 h-10 border-3 border-amber-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-xs text-slate-400 font-medium tracking-wide">
            {t('common.loading', undefined, 'Loading showcase...')}
          </p>
        </div>
        <LandingFooter />
      </div>
    );
  }

  if (error || !showcase) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
        <LandingHeader onOpenCatalog={() => {}} />
        <div className="flex-1 max-w-lg mx-auto w-full px-6 py-20 flex flex-col items-center justify-center text-center">
          <div className="w-14 h-14 bg-rose-500/10 border border-rose-500/30 rounded-3xl flex items-center justify-center text-rose-400 mb-4">
            <ShieldAlert className="w-7 h-7" />
          </div>
          <h2 className="text-xl font-bold text-slate-100 mb-2">
            {t('showcase.unavailableTitle', undefined, 'Showcase Unavailable')}
          </h2>
          <p className="text-xs text-slate-400 mb-6 leading-relaxed">
            {error || t('showcase.unavailableDesc', undefined, 'The requested event activation showcase could not be loaded.')}
          </p>
          <InternalLink
            to="/showcase"
            className="px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl shadow-lg transition-all flex items-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>{t('showcase.backToShowcases', undefined, 'Explore All Showcases')}</span>
          </InternalLink>
        </div>
        <LandingFooter />
      </div>
    );
  }

  const currentMedia = lightboxIndex !== null ? mediaList[lightboxIndex] : null;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-amber-500 selection:text-slate-950">
      <SEO
        title={`${showcase.title} | Event Game Studio Showcase`}
        description={showcase.description || 'Interactive event mini-game case study and event activation photos.'}
      />

      <LandingHeader onOpenCatalog={() => {}} />

      {/* Preview mode alert bar for authorized admins/devs */}
      {isPreviewMode && (
        <div className="bg-amber-500/15 border-b border-amber-500/30 px-4 py-2.5 text-center text-xs text-amber-300 font-medium flex items-center justify-center gap-2">
          <Eye className="w-3.5 h-3.5" />
          <span>{t('showcase.previewBadge', undefined, 'Preview Mode: This showcase is not published publicly. You are viewing it as an organization member or platform admin.')}</span>
        </div>
      )}

      <main className="flex-1 pb-20">
        {/* Cover / Hero Header */}
        <div className="relative bg-slate-900 border-b border-slate-800 pt-24 pb-16 overflow-hidden">
          {showcase.cover_image_url && (
            <div className="absolute inset-0 opacity-20 pointer-events-none">
              <img
                src={showcase.cover_image_url}
                alt={showcase.title}
                className="w-full h-full object-cover blur-2xl scale-110"
              />
              <div className="absolute inset-0 bg-gradient-to-b from-slate-950/80 via-slate-950/90 to-slate-950" />
            </div>
          )}

          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 relative">
            <div className="mb-6 flex items-center justify-between gap-4">
              <InternalLink
                to="/showcase"
                className="text-xs text-slate-400 hover:text-slate-200 transition-colors flex items-center gap-1.5 cursor-pointer font-medium"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>{t('showcase.backToShowcases', undefined, 'Back to Showcases')}</span>
              </InternalLink>

              <button
                type="button"
                onClick={handleShare}
                className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer shadow-sm"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Share2 className="w-3.5 h-3.5" />}
                <span>{copied ? t('common.linkCopied', undefined, 'Copied!') : t('common.share', undefined, 'Share')}</span>
              </button>
            </div>

            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
              <div className="space-y-3 max-w-3xl">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-semibold">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>{t('showcase.featuredActivation', undefined, 'Event Activation Showcase')}</span>
                </div>

                <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-slate-100 tracking-tight">
                  {showcase.title}
                </h1>

                {showcase.description && (
                  <p className="text-xs sm:text-sm text-slate-300 leading-relaxed max-w-2xl">
                    {showcase.description}
                  </p>
                )}
              </div>

              {showcase.client_logo_url && (
                <div className="shrink-0 p-3 bg-slate-950/80 rounded-2xl border border-slate-800 shadow-md">
                  <img
                    src={showcase.client_logo_url}
                    alt={showcase.client_name || 'Client Logo'}
                    className="max-h-16 max-w-[140px] object-contain"
                  />
                </div>
              )}
            </div>

            {/* Quick Metrics Bar */}
            <div className="mt-8 pt-6 border-t border-slate-800/80 grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
              {showcase.client_name && (
                <div className="flex items-center gap-2.5 text-slate-300">
                  <Building2 className="w-4 h-4 text-amber-400 shrink-0" />
                  <div>
                    <p className="text-[10px] text-slate-500 uppercase font-bold">{t('showcase.client', undefined, 'Client')}</p>
                    <p className="font-semibold text-slate-200">{showcase.client_name}</p>
                  </div>
                </div>
              )}

              {showcase.published_at && (
                <div className="flex items-center gap-2.5 text-slate-300">
                  <Calendar className="w-4 h-4 text-amber-400 shrink-0" />
                  <div>
                    <p className="text-[10px] text-slate-500 uppercase font-bold">{t('showcase.published', undefined, 'Date')}</p>
                    <p className="font-semibold text-slate-200">
                      {new Date(showcase.published_at).toLocaleDateString(undefined, {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </p>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-2.5 text-slate-300">
                <ImageIcon className="w-4 h-4 text-amber-400 shrink-0" />
                <div>
                  <p className="text-[10px] text-slate-500 uppercase font-bold">{t('showcase.mediaCount', undefined, 'Media Assets')}</p>
                  <p className="font-semibold text-slate-200">{mediaList.length} Photos & Clips</p>
                </div>
              </div>

              <div className="flex items-center gap-2.5 text-slate-300">
                <Trophy className="w-4 h-4 text-amber-400 shrink-0" />
                <div>
                  <p className="text-[10px] text-slate-500 uppercase font-bold">{t('showcase.deployment', undefined, 'Platform')}</p>
                  <p className="font-semibold text-slate-200">Event Game Studio</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Media Gallery Section */}
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 mt-12">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
              <ImageIcon className="w-5 h-5 text-amber-400" />
              <span>{t('showcase.galleryTitle', undefined, 'Activation Gallery')}</span>
            </h2>
            <span className="text-xs text-slate-400">
              {mediaList.length} {mediaList.length === 1 ? 'item' : 'items'}
            </span>
          </div>

          {mediaList.length === 0 ? (
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-12 text-center text-slate-500 text-xs">
              <ImageIcon className="w-10 h-10 mx-auto opacity-30 mb-3" />
              <p>{t('showcase.noMediaYet', undefined, 'No photos or video clips uploaded to this showcase yet.')}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {mediaList.map((item, index) => (
                <div
                  key={item.id}
                  onClick={() => setLightboxIndex(index)}
                  className="group relative bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden cursor-pointer aspect-video shadow-md hover:border-amber-500/50 transition-all"
                >
                  {item.media_type === 'VIDEO' ? (
                    <div className="w-full h-full relative bg-slate-950 flex items-center justify-center">
                      <video
                        src={item.media_url}
                        className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"
                        preload="metadata"
                      />
                      <div className="absolute inset-0 flex items-center justify-center bg-slate-950/40 group-hover:bg-transparent transition-colors">
                        <div className="w-12 h-12 bg-amber-500/90 rounded-full flex items-center justify-center text-slate-950 shadow-lg group-hover:scale-110 transition-transform">
                          <Film className="w-5 h-5 ml-0.5" />
                        </div>
                      </div>
                    </div>
                  ) : (
                    <img
                      src={item.media_url}
                      alt={item.file_name || showcase.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  )}

                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity p-4 flex flex-col justify-end">
                    <p className="text-xs font-semibold text-slate-200 truncate">{item.file_name}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Lightbox Modal */}
      {lightboxIndex !== null && currentMedia && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/95 backdrop-blur-md flex flex-col items-center justify-center p-4"
          onClick={() => setLightboxIndex(null)}
        >
          {/* Top Bar */}
          <div
            className="absolute top-4 inset-x-4 max-w-6xl mx-auto flex items-center justify-between z-10"
            onClick={(e) => e.stopPropagation()}
          >
            <span className="text-xs text-slate-400 font-mono">
              {lightboxIndex + 1} / {mediaList.length}
            </span>
            <button
              type="button"
              onClick={() => setLightboxIndex(null)}
              className="p-2 bg-slate-900/80 hover:bg-slate-800 text-slate-300 rounded-full border border-slate-700 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Media Center */}
          <div
            className="max-w-5xl max-h-[80vh] w-full flex items-center justify-center relative p-2"
            onClick={(e) => e.stopPropagation()}
          >
            {currentMedia.media_type === 'VIDEO' ? (
              <video
                src={currentMedia.media_url}
                controls
                autoPlay
                className="max-w-full max-h-[75vh] rounded-2xl shadow-2xl border border-slate-800"
              />
            ) : (
              <img
                src={currentMedia.media_url}
                alt={currentMedia.file_name}
                className="max-w-full max-h-[75vh] object-contain rounded-2xl shadow-2xl border border-slate-800"
              />
            )}
          </div>

          {/* Navigation Controls */}
          {mediaList.length > 1 && (
            <>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setLightboxIndex((prev) =>
                    prev !== null ? (prev - 1 + mediaList.length) % mediaList.length : null
                  );
                }}
                className="absolute left-4 p-3 bg-slate-900/80 hover:bg-slate-800 text-slate-200 rounded-full border border-slate-700 transition-colors cursor-pointer"
              >
                <ChevronLeft className="w-6 h-6" />
              </button>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setLightboxIndex((prev) =>
                    prev !== null ? (prev + 1) % mediaList.length : null
                  );
                }}
                className="absolute right-4 p-3 bg-slate-900/80 hover:bg-slate-800 text-slate-200 rounded-full border border-slate-700 transition-colors cursor-pointer"
              >
                <ChevronRight className="w-6 h-6" />
              </button>
            </>
          )}
        </div>
      )}

      <LandingFooter />
    </div>
  );
};
