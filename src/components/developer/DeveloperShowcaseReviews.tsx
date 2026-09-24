import React, { useState, useEffect } from 'react';
import { apiFetch } from '../../lib/api';
import { AdminShowcaseListItem, EventShowcaseMedia } from '../../types/showcase';
import {
  Sparkles,
  Search,
  Filter,
  CheckCircle2,
  XCircle,
  Clock,
  Globe,
  EyeOff,
  Building2,
  Calendar,
  Image as ImageIcon,
  Film,
  ExternalLink,
  Gift,
  RefreshCw,
  AlertCircle,
  Eye,
  MessageSquare,
  Check,
  X,
  Layers,
  ArrowUpRight,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  Ban,
  Share2,
} from 'lucide-react';

export const DeveloperShowcaseReviews: React.FC = () => {
  const [showcases, setShowcases] = useState<AdminShowcaseListItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Modals
  const [selectedShowcase, setSelectedShowcase] = useState<AdminShowcaseListItem | null>(null);
  const [previewMedia, setPreviewMedia] = useState<EventShowcaseMedia[]>([]);
  const [previewMediaLoading, setPreviewMediaLoading] = useState<boolean>(false);
  const [showPreviewModal, setShowPreviewModal] = useState<boolean>(false);

  // Reject Modal
  const [rejectingShowcase, setRejectingShowcase] = useState<AdminShowcaseListItem | null>(null);
  const [rejectionReason, setRejectionReason] = useState<string>('');
  const [actionLoading, setActionLoading] = useState<boolean>(false);

  // Approve Modal / State
  const [approvingShowcase, setApprovingShowcase] = useState<AdminShowcaseListItem | null>(null);

  // Block Modal
  const [blockingShowcase, setBlockingShowcase] = useState<AdminShowcaseListItem | null>(null);
  const [blockReason, setBlockReason] = useState<string>('');

  // Unblock Modal
  const [unblockingShowcase, setUnblockingShowcase] = useState<AdminShowcaseListItem | null>(null);
  const [unblockReason, setUnblockReason] = useState<string>('');

  // Delete Modal
  const [deletingShowcase, setDeletingShowcase] = useState<AdminShowcaseListItem | null>(null);
  const [deleteReason, setDeleteReason] = useState<string>('');
  const [copiedShowcaseId, setCopiedShowcaseId] = useState<string | null>(null);

  // Dedicated Pending Reward Queue state (loaded from /api/developer/showcase-rewards?status=AWAITING_APPROVAL)
  const [pendingRewards, setPendingRewards] = useState<AdminShowcaseListItem[]>([]);
  const [pendingRewardsLoading, setPendingRewardsLoading] = useState<boolean>(true);
  const [pendingRewardsError, setPendingRewardsError] = useState<string | null>(null);

  const fetchPendingRewards = async () => {
    try {
      setPendingRewardsLoading(true);
      setPendingRewardsError(null);
      const res = await apiFetch('/api/developer/showcase-rewards?status=AWAITING_APPROVAL');
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to fetch pending rewards queue');
      }
      const data = await res.json();
      setPendingRewards(data.showcases || []);
    } catch (err: any) {
      console.error('Fetch pending showcase rewards error:', err);
      setPendingRewardsError(err.message || 'Failed to load pending rewards');
    } finally {
      setPendingRewardsLoading(false);
    }
  };

  const handleShareShowcase = async (sc: AdminShowcaseListItem) => {
    const targetId = sc.id || sc.event_id;
    const showcaseUrl = `${window.location.origin}/showcase/${targetId}`;
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: sc.title || 'Event Showcase',
          url: showcaseUrl,
        });
        return;
      } catch (err: any) {
        if (err.name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(showcaseUrl);
      setCopiedShowcaseId(sc.id);
      setTimeout(() => setCopiedShowcaseId(null), 2000);
    } catch (err) {
      console.error('Failed to copy showcase URL', err);
    }
  };

  const fetchShowcases = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await apiFetch('/api/developer/showcases');
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to fetch showcases');
      }
      const data = await res.json();
      setShowcases(data.showcases || []);
    } catch (err: any) {
      console.error('Fetch admin showcases error:', err);
      setError(err.message || 'Failed to load showcases list');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPendingRewards();
    fetchShowcases();
  }, []);

  const openPreview = async (sc: AdminShowcaseListItem) => {
    setSelectedShowcase(sc);
    setShowPreviewModal(true);
    try {
      setPreviewMediaLoading(true);
      const res = await apiFetch(`/api/events/${sc.event_id}/showcase/media`);
      if (res.ok) {
        const data = await res.json();
        setPreviewMedia(data.media || []);
      } else {
        setPreviewMedia([]);
      }
    } catch {
      setPreviewMedia([]);
    } finally {
      setPreviewMediaLoading(false);
    }
  };

  const handleApprove = async (showcaseId: string) => {
    try {
      setActionLoading(true);
      setError(null);
      setActionSuccess(null);

      const res = await apiFetch(`/api/developer/showcases/${showcaseId}/reward/approve`, {
        method: 'POST',
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Failed to approve showcase reward');
      }

      setActionSuccess(data.message || 'Owner first-event showcase reward approved and RM300 credit granted!');
      setApprovingShowcase(null);
      // Immediately remove from local pending rewards list
      setPendingRewards((prev) => prev.filter((item) => item.id !== showcaseId));
      if (selectedShowcase?.id === showcaseId) {
        setSelectedShowcase({
          ...selectedShowcase,
          reward_review_status: 'REWARDED',
          reward_status: 'REWARDED',
          reward_granted_at: new Date().toISOString(),
        });
      }
      window.dispatchEvent(new CustomEvent('wallet_updated'));
      fetchPendingRewards();
      fetchShowcases();
      setTimeout(() => setActionSuccess(null), 5000);
    } catch (err: any) {
      console.error('Approve showcase reward error:', err);
      setError(err.message || 'Failed to approve showcase reward');
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectingShowcase) return;
    if (!rejectionReason.trim()) {
      setError('Please provide a reason for rejecting the showcase reward.');
      return;
    }

    try {
      setActionLoading(true);
      setError(null);
      setActionSuccess(null);

      const res = await apiFetch(`/api/developer/showcases/${rejectingShowcase.id}/reward/reject`, {
        method: 'POST',
        body: JSON.stringify({ reason: rejectionReason.trim() }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Failed to reject showcase reward');
      }

      setActionSuccess('Showcase reward rejected with feedback sent to the organization. Showcase remains live and published.');
      // Immediately remove from local pending rewards list
      setPendingRewards((prev) => prev.filter((item) => item.id !== rejectingShowcase.id));
      setRejectingShowcase(null);
      setRejectionReason('');
      if (selectedShowcase?.id === rejectingShowcase.id) {
        setSelectedShowcase({
          ...selectedShowcase,
          reward_review_status: 'REJECTED',
          reward_status: 'REJECTED',
          reward_rejection_reason: rejectionReason.trim(),
        });
      }
      fetchPendingRewards();
      fetchShowcases();
      setTimeout(() => setActionSuccess(null), 5000);
    } catch (err: any) {
      console.error('Reject showcase reward error:', err);
      setError(err.message || 'Failed to reject showcase reward');
    } finally {
      setActionLoading(false);
    }
  };

  const handleBlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!blockingShowcase) return;
    if (!blockReason.trim()) {
      setError('Please provide a moderation reason for blocking this showcase.');
      return;
    }

    try {
      setActionLoading(true);
      setError(null);
      setActionSuccess(null);

      const res = await apiFetch(`/api/developer/showcases/${blockingShowcase.id}/block`, {
        method: 'POST',
        body: JSON.stringify({ reason: blockReason.trim() }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Failed to block showcase');
      }

      setActionSuccess('Showcase has been blocked and removed from public access.');
      if (selectedShowcase?.id === blockingShowcase.id) {
        setSelectedShowcase({
          ...selectedShowcase,
          status: 'BLOCKED',
          publication_status: 'UNPUBLISHED',
          moderation_reason: blockReason.trim(),
          moderated_at: new Date().toISOString(),
        });
      }
      setBlockingShowcase(null);
      setBlockReason('');
      fetchShowcases();
      setTimeout(() => setActionSuccess(null), 5000);
    } catch (err: any) {
      console.error('Block showcase error:', err);
      setError(err.message || 'Failed to block showcase');
    } finally {
      setActionLoading(false);
    }
  };

  const handleUnblock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!unblockingShowcase) return;

    try {
      setActionLoading(true);
      setError(null);
      setActionSuccess(null);

      const res = await apiFetch(`/api/developer/showcases/${unblockingShowcase.id}/unblock`, {
        method: 'POST',
        body: JSON.stringify({ reason: unblockReason.trim() || undefined }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Failed to unblock showcase');
      }

      setActionSuccess('Showcase has been unblocked and restored to public view.');
      if (selectedShowcase?.id === unblockingShowcase.id) {
        setSelectedShowcase({
          ...selectedShowcase,
          status: 'PUBLISHED',
          publication_status: 'PUBLISHED',
          moderation_reason: null,
          moderated_at: null,
        });
      }
      setUnblockingShowcase(null);
      setUnblockReason('');
      fetchShowcases();
      setTimeout(() => setActionSuccess(null), 5000);
    } catch (err: any) {
      console.error('Unblock showcase error:', err);
      setError(err.message || 'Failed to unblock showcase');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deletingShowcase) return;
    if (!deleteReason.trim()) {
      setError('Please provide a reason for soft deleting this showcase.');
      return;
    }

    try {
      setActionLoading(true);
      setError(null);
      setActionSuccess(null);

      const res = await apiFetch(`/api/developer/showcases/${deletingShowcase.id}`, {
        method: 'DELETE',
        body: JSON.stringify({ reason: deleteReason.trim() }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Failed to delete showcase');
      }

      setActionSuccess('Showcase administratively soft-deleted and archived.');
      if (selectedShowcase?.id === deletingShowcase.id) {
        setSelectedShowcase({
          ...selectedShowcase,
          status: 'DELETED',
          publication_status: 'UNPUBLISHED',
          deleted_at: new Date().toISOString(),
          moderation_reason: deleteReason.trim(),
        });
      }
      setDeletingShowcase(null);
      setDeleteReason('');
      fetchShowcases();
      setTimeout(() => setActionSuccess(null), 5000);
    } catch (err: any) {
      console.error('Delete showcase error:', err);
      setError(err.message || 'Failed to delete showcase');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRefreshAll = () => {
    fetchPendingRewards();
    fetchShowcases();
  };

  // Authoritative reward approval checks (strictly decoupled from editorial review_status)
  const isRewardPending = (sc: AdminShowcaseListItem) =>
    sc.reward_review_status === 'AWAITING_APPROVAL' &&
    sc.status !== 'DELETED' &&
    sc.status !== 'BLOCKED';

  const isRewarded = (sc: AdminShowcaseListItem) =>
    sc.reward_review_status === 'REWARDED' &&
    sc.status !== 'DELETED';

  const isRewardRejected = (sc: AdminShowcaseListItem) =>
    sc.reward_review_status === 'REJECTED' &&
    sc.status !== 'DELETED';

  // Filtered showcases
  const filteredShowcases = showcases.filter((sc) => {
    // Status filter
    if (filterStatus !== 'ALL') {
      if (filterStatus === 'REWARD_PENDING' && !isRewardPending(sc)) return false;
      if (filterStatus === 'REWARDED' && !isRewarded(sc)) return false;
      if (filterStatus === 'REJECTED' && !isRewardRejected(sc)) return false;
      if (filterStatus === 'PUBLISHED' && (sc.status !== 'PUBLISHED' || sc.status === 'BLOCKED' || sc.status === 'DELETED')) return false;
      if (filterStatus === 'BLOCKED' && sc.status !== 'BLOCKED') return false;
      if (filterStatus === 'DELETED' && sc.status !== 'DELETED') return false;
      if (filterStatus === 'DRAFT' && sc.status !== 'DRAFT' && sc.status !== 'UNPUBLISHED') return false;
    }

    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchTitle = sc.title?.toLowerCase().includes(q);
      const matchClient = sc.client_name?.toLowerCase().includes(q);
      const matchEvent = sc.event_name?.toLowerCase().includes(q);
      const matchOrg = sc.organization_name?.toLowerCase().includes(q);
      return matchTitle || matchClient || matchEvent || matchOrg;
    }

    return true;
  });

  // Authoritative quick stats
  const countRewardPending = pendingRewards.length;
  const countRewarded = showcases.filter(isRewarded).length;
  const countRewardRejected = showcases.filter(isRewardRejected).length;
  const countPublished = showcases.filter((s) => (s.status === 'PUBLISHED' || s.publication_status === 'PUBLISHED') && s.status !== 'BLOCKED' && s.status !== 'DELETED').length;
  const countBlocked = showcases.filter((s) => s.status === 'BLOCKED').length;
  const countDeleted = showcases.filter((s) => s.status === 'DELETED').length;
  const countDraft = showcases.filter((s) => (s.status === 'DRAFT' || s.status === 'UNPUBLISHED') && s.status !== 'DELETED').length;
  const totalRewardedMYR = countRewarded * 300;

  return (
    <div className="space-y-6">
      {/* Top Banner / Headline */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900/60 border border-slate-800 rounded-3xl p-6">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <Gift className="w-5 h-5" />
            </span>
            <h1 className="text-xl font-black text-white tracking-tight">
              Event Showcase Submissions & Moderation
            </h1>
          </div>
          <p className="text-xs text-slate-400 max-w-2xl leading-relaxed">
            Manage public event marketing showcases and review first-event owner rewards. Showcase publishing is self-service and immediately live. Approving an eligible showcase grants <strong className="text-amber-400">RM300 Showcase Credit</strong> to the organization account owner without gating publication. Admins can also moderate sensitive showcases or soft-delete content.
          </p>
        </div>

        <button
          onClick={handleRefreshAll}
          disabled={loading || pendingRewardsLoading}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors shrink-0 cursor-pointer self-start md:self-auto"
        >
          <RefreshCw className={`w-4 h-4 ${loading || pendingRewardsLoading ? 'animate-spin' : ''}`} />
          <span>Refresh All</span>
        </button>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 space-y-1">
          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Reward Pending</div>
          <div className="text-2xl font-black text-amber-400 flex items-center gap-2">
            <span>{countRewardPending}</span>
            {countRewardPending > 0 && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-bold animate-pulse">
                Needs Action
              </span>
            )}
          </div>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 space-y-1">
          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Approved & Rewarded</div>
          <div className="text-2xl font-black text-emerald-400">{countRewarded}</div>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 space-y-1">
          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Published Live</div>
          <div className="text-2xl font-black text-emerald-300">{countPublished}</div>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 space-y-1">
          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Blocked by Moderation</div>
          <div className="text-2xl font-black text-rose-400 flex items-center gap-2">
            <span>{countBlocked}</span>
            {countBlocked > 0 && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 font-bold">
                Hidden
              </span>
            )}
          </div>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 space-y-1">
          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Total Rewards</div>
          <div className="text-2xl font-black text-amber-400">RM {totalRewardedMYR.toLocaleString()}</div>
        </div>
      </div>

      {/* Notifications */}
      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-2xl flex items-center gap-3 text-xs text-red-300">
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {actionSuccess && (
        <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl flex items-center gap-3 text-xs text-emerald-300">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{actionSuccess}</span>
        </div>
      )}

      {/* Dedicated Showcase Reward Approval Queue */}
      <div className="bg-slate-900/90 border-2 border-amber-500/30 rounded-3xl p-6 shadow-xl shadow-amber-500/5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/30 shadow-inner">
              <Gift className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h2 className="text-base font-black text-white tracking-wide uppercase">
                  Showcase Reward Approval Queue
                </h2>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                  {pendingRewardsLoading
                    ? 'Loading...'
                    : `${pendingRewards.length} reward${pendingRewards.length === 1 ? '' : 's'} waiting for approval`}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Eligible first-event showcase submissions awaiting owner promotional credit approval (RM300).
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={fetchPendingRewards}
            disabled={pendingRewardsLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors self-start sm:self-auto cursor-pointer"
            title="Refresh Pending Reward Queue"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${pendingRewardsLoading ? 'animate-spin' : ''}`} />
            <span>Sync Queue</span>
          </button>
        </div>

        {pendingRewardsLoading ? (
          <div className="py-8 text-center text-slate-400 text-xs flex items-center justify-center gap-2">
            <RefreshCw className="w-4 h-4 animate-spin text-amber-400" />
            <span>Checking pending reward approvals...</span>
          </div>
        ) : pendingRewardsError ? (
          <div className="py-4 px-4 rounded-2xl bg-rose-950/40 border border-rose-500/30 text-rose-300 text-xs flex items-center justify-between">
            <span>{pendingRewardsError}</span>
            <button
              onClick={fetchPendingRewards}
              className="text-xs underline font-bold hover:text-white"
            >
              Retry
            </button>
          </div>
        ) : pendingRewards.length === 0 ? (
          <div className="py-6 px-4 rounded-2xl bg-slate-950/60 border border-slate-800/80 text-center space-y-1">
            <div className="flex justify-center text-emerald-400 mb-1">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <p className="text-xs font-bold text-slate-200">No Rewards Waiting for Approval</p>
            <p className="text-[11px] text-slate-500 max-w-md mx-auto">
              All qualifying first-event showcases have been reviewed or already rewarded. New qualifying submissions with completed and paid events will appear here automatically.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {pendingRewards.map((sc) => {
              const publishedDate = sc.published_at || sc.created_at;
              const dateStr = publishedDate ? new Date(publishedDate).toLocaleDateString() : 'N/A';
              const ownerDisplay = sc.owner_email || sc.owner_name || (sc.owner_user_id ? `User #${sc.owner_user_id.slice(0, 8)}` : 'Account Owner');

              return (
                <div
                  key={sc.id}
                  className="bg-slate-950/80 border border-amber-500/30 hover:border-amber-500/50 rounded-2xl p-4 transition-all space-y-3"
                >
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                    <div className="space-y-1.5 flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-black text-white truncate max-w-md">
                          {sc.title || 'Untitled Showcase'}
                        </span>
                        <span className="px-2 py-0.5 rounded-md text-[11px] font-black bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-1">
                          <Gift className="w-3 h-3 text-amber-400" />
                          RM300 Reward
                        </span>
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-500/15 border border-emerald-500/30 text-emerald-400">
                          Paid & Completed
                        </span>
                      </div>

                      <div className="flex items-center gap-x-4 gap-y-1 text-xs text-slate-400 flex-wrap">
                        <div>
                          <span className="text-slate-500">Event:</span>{' '}
                          <span className="text-slate-300 font-semibold">{sc.event_name || 'Event #' + sc.event_id.slice(0, 8)}</span>
                        </div>
                        <div>
                          <span className="text-slate-500">Organization:</span>{' '}
                          <span className="text-slate-300 font-semibold">{sc.organization_name || 'Organization #' + sc.organization_id.slice(0, 8)}</span>
                        </div>
                        <div>
                          <span className="text-slate-500">Owner:</span>{' '}
                          <span className="text-amber-300/90 font-medium">{ownerDisplay}</span>
                        </div>
                        <div>
                          <span className="text-slate-500">Published:</span>{' '}
                          <span className="text-slate-300">{dateStr}</span>
                        </div>
                        <div>
                          <span className="text-slate-500">Media:</span>{' '}
                          <span className="text-slate-300">
                            {sc.image_count || 0} photos, {sc.video_count || 0} videos
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-start lg:self-center shrink-0">
                      {/* View / Inspect Button */}
                      <button
                        type="button"
                        onClick={() => openPreview(sc)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 hover:border-slate-600 transition-colors cursor-pointer"
                        title="Inspect showcase details, media, and description"
                      >
                        <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
                        <span>View / Inspect</span>
                      </button>

                      {/* Reject Reward Button */}
                      <button
                        type="button"
                        onClick={() => {
                          setRejectingShowcase(sc);
                          setRejectionReason('');
                        }}
                        disabled={actionLoading}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-rose-950/60 hover:bg-rose-900 text-rose-300 border border-rose-500/30 hover:border-rose-500/50 transition-colors cursor-pointer disabled:opacity-50"
                        title="Reject Showcase Reward (Showcase remains published)"
                      >
                        <X className="w-3.5 h-3.5" />
                        <span>Reject Reward</span>
                      </button>

                      {/* Approve RM300 Button */}
                      <button
                        type="button"
                        onClick={() => setApprovingShowcase(sc)}
                        disabled={actionLoading}
                        className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-black bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/20 transition-all cursor-pointer disabled:opacity-50"
                        title="Approve RM300 Showcase Reward"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Approve RM300</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Section Header for All Showcases */}
      <div className="pt-2">
        <div className="flex items-center justify-between gap-4 mb-3">
          <div>
            <h2 className="text-sm font-black text-slate-300 uppercase tracking-wider">
              All Showcases Management
            </h2>
            <p className="text-xs text-slate-500">
              Visibility, moderation, history, and status of all published and archived event showcases.
            </p>
          </div>
        </div>
      </div>

      {/* Controls & Filter Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900/40 border border-slate-800 rounded-2xl p-3">
        {/* Filter Pills */}
        <div className="flex flex-wrap items-center gap-1.5">
          {[
            { id: 'ALL', label: 'All Submissions', count: showcases.length },
            { id: 'REWARD_PENDING', label: 'Reward Pending', count: countRewardPending, highlight: true },
            { id: 'REWARDED', label: 'Rewarded (RM300)', count: countRewarded },
            { id: 'PUBLISHED', label: 'Published Live', count: countPublished },
            { id: 'REJECTED', label: 'Reward Rejected', count: countRewardRejected },
            { id: 'BLOCKED', label: 'Blocked', count: countBlocked, isBlocked: true },
            { id: 'DELETED', label: 'Deleted', count: countDeleted },
            { id: 'DRAFT', label: 'Drafts', count: countDraft },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFilterStatus(tab.id)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                filterStatus === tab.id
                  ? tab.isBlocked
                    ? 'bg-rose-600 text-white shadow-md shadow-rose-600/20'
                    : 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                  : 'bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800'
              }`}
            >
              <span>{tab.label}</span>
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-md ${
                  filterStatus === tab.id
                    ? 'bg-slate-950/30 text-white font-black'
                    : tab.highlight && tab.count > 0
                    ? 'bg-blue-500/20 text-blue-300 font-bold'
                    : tab.isBlocked && tab.count > 0
                    ? 'bg-rose-500/20 text-rose-300 font-bold'
                    : 'bg-slate-800 text-slate-500'
                }`}
              >
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative min-w-[240px]">
          <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search event, org, client..."
            className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-1.5 text-xs text-slate-200 placeholder:text-slate-600 focus:border-amber-500 outline-none"
          />
        </div>
      </div>

      {/* Showcases Table / List */}
      {loading ? (
        <div className="py-20 text-center space-y-3">
          <div className="w-8 h-8 border-3 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs text-slate-400">Loading showcase submissions...</p>
        </div>
      ) : filteredShowcases.length === 0 ? (
        <div className="py-16 text-center bg-slate-950/40 border border-slate-800 rounded-3xl p-8 space-y-3">
          <Sparkles className="w-8 h-8 text-slate-600 mx-auto" />
          <h3 className="text-sm font-bold text-slate-300">No Showcase Submissions Found</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            {filterStatus !== 'ALL'
              ? `There are currently no showcases matching the "${filterStatus}" status filter.`
              : 'No organization has created or submitted an event showcase yet.'}
          </p>
        </div>
      ) : (
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/80 border-b border-slate-800 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3">Showcase & Event</th>
                  <th className="px-4 py-3">Organization & Client</th>
                  <th className="px-4 py-3">Media</th>
                  <th className="px-4 py-3">Created / Published</th>
                  <th className="px-4 py-3">RM300 Reward</th>
                  <th className="px-4 py-3">Visibility</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-300">
                {filteredShowcases.map((sc) => {
                  return (
                    <tr key={sc.id} className="hover:bg-slate-800/30 transition-colors">
                      {/* Showcase Title & Event */}
                      <td className="px-4 py-3">
                        <div className="space-y-0.5">
                          <div className="font-bold text-slate-100 flex items-center gap-2">
                            <span>{sc.title}</span>
                            {sc.cover_image_url && (
                              <span className="w-2 h-2 rounded-full bg-emerald-400" title="Has Cover Banner" />
                            )}
                          </div>
                          <div className="text-[11px] text-slate-400 flex items-center gap-1">
                            <Calendar className="w-3 h-3 text-slate-500" />
                            <span>Event: {sc.event_name || 'Event #' + sc.event_id.slice(0, 8)}</span>
                          </div>
                        </div>
                      </td>

                      {/* Organization & Client */}
                      <td className="px-4 py-3">
                        <div className="space-y-0.5">
                          <div className="font-semibold text-slate-200 flex items-center gap-1.5">
                            <Building2 className="w-3 h-3 text-slate-400" />
                            <span>{sc.organization_name || 'Organization'}</span>
                          </div>
                          {sc.client_name ? (
                            <div className="text-[11px] text-amber-400/90 font-medium">
                              Client: {sc.client_name}
                            </div>
                          ) : (
                            <div className="text-[11px] text-slate-500 italic">No client specified</div>
                          )}
                        </div>
                      </td>

                      {/* Media Counts */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-950 border border-slate-800 text-[11px] font-semibold text-slate-300">
                            <ImageIcon className="w-3 h-3 text-blue-400" />
                            <span>{sc.image_count || 0}</span>
                          </span>
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-950 border border-slate-800 text-[11px] font-semibold text-slate-300">
                            <Film className="w-3 h-3 text-purple-400" />
                            <span>{sc.video_count || 0}</span>
                          </span>
                        </div>
                      </td>

                      {/* Creation / Publication Date */}
                      <td className="px-4 py-3">
                        <div className="text-[11px] text-slate-300">
                          {sc.published_at ? (
                            <span title={new Date(sc.published_at).toLocaleString()}>
                              Published: {new Date(sc.published_at).toLocaleDateString()}
                            </span>
                          ) : sc.created_at ? (
                            <span title={new Date(sc.created_at).toLocaleString()}>
                              Created: {new Date(sc.created_at).toLocaleDateString()}
                            </span>
                          ) : (
                            <span className="text-slate-500 italic">N/A</span>
                          )}
                        </div>
                      </td>

                      {/* RM300 Reward Status Badge */}
                      <td className="px-4 py-3">
                        {sc.status === 'DELETED' ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-800 border border-slate-700 text-slate-400">
                            <Trash2 className="w-3 h-3 text-slate-500" />
                            DELETED
                          </span>
                        ) : sc.status === 'BLOCKED' ? (
                          <div className="space-y-1">
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-500/20 border border-rose-500/40 text-rose-300">
                              <ShieldAlert className="w-3 h-3 text-rose-400" />
                              BLOCKED
                            </span>
                          </div>
                        ) : isRewarded(sc) ? (
                          <div className="space-y-1">
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/15 border border-emerald-500/30 text-emerald-400">
                              <CheckCircle2 className="w-3 h-3" />
                              Rewarded
                            </span>
                            <div className="text-[10px] font-semibold text-amber-400 flex items-center gap-1">
                              <Gift className="w-3 h-3 text-amber-400" />
                              <span>RM300 Granted</span>
                            </div>
                          </div>
                        ) : isRewardPending(sc) ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-500/15 border border-blue-500/30 text-blue-400 animate-pulse">
                            <Clock className="w-3 h-3" />
                            Reward Pending
                          </span>
                        ) : isRewardRejected(sc) ? (
                          <div className="space-y-1">
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-500/15 border border-rose-500/30 text-rose-400">
                              <XCircle className="w-3 h-3" />
                              Reward Declined
                            </span>
                            {sc.reward_rejection_reason && (
                              <div className="text-[10px] text-rose-400/80 line-clamp-1 max-w-[150px]" title={sc.reward_rejection_reason}>
                                {sc.reward_rejection_reason}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-800 text-slate-400 border border-slate-700">
                            {sc.reward_review_status === 'NOT_ELIGIBLE' || sc.reward_status === 'NOT_ELIGIBLE' ? 'Not Eligible' : 'Standard'}
                          </span>
                        )}
                      </td>

                      {/* Publication Status */}
                      <td className="px-4 py-3">
                        {sc.status === 'DELETED' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-900 border border-slate-800 text-slate-500 line-through">
                            Archived
                          </span>
                        ) : sc.status === 'BLOCKED' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-950/80 border border-rose-500/40 text-rose-300">
                            <Ban className="w-2.5 h-2.5 text-rose-400" />
                            Hidden (Blocked)
                          </span>
                        ) : sc.status === 'PUBLISHED' || sc.publication_status === 'PUBLISHED' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-950 border border-emerald-500/30 text-emerald-300">
                            <Globe className="w-2.5 h-2.5" />
                            Published Live
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-900 border border-slate-800 text-slate-500">
                            <EyeOff className="w-2.5 h-2.5" />
                            Unpublished
                          </span>
                        )}
                      </td>

                      {/* Action Buttons */}
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Publicly Viewable: View & Share */}
                          {((sc.status === 'PUBLISHED' || sc.publication_status === 'PUBLISHED') && sc.status !== 'BLOCKED' && sc.status !== 'DELETED') && (
                            <>
                              <button
                                type="button"
                                onClick={() => window.open(`/showcase/${sc.id || sc.event_id}`, '_blank')}
                                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 hover:border-slate-600 transition-colors cursor-pointer"
                                title="Open Public Showcase in New Tab"
                              >
                                <Eye className="w-3.5 h-3.5 text-emerald-400" />
                                <span>View</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleShareShowcase(sc)}
                                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 hover:border-slate-600 transition-colors cursor-pointer"
                                title="Share Public Showcase URL"
                              >
                                {copiedShowcaseId === sc.id ? (
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

                          {/* Inspect Modal Trigger */}
                          <button
                            onClick={() => openPreview(sc)}
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition-colors cursor-pointer"
                            title="Inspect Showcase Details & Media"
                          >
                            <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
                          </button>

                          {/* Approve Reward Action */}
                          {isRewardPending(sc) && (
                            <button
                              onClick={() => setApprovingShowcase(sc)}
                              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition-all shadow-sm shadow-emerald-600/30 cursor-pointer"
                              title="Approve First-Event Showcase Reward (RM300)"
                            >
                              <Check className="w-3.5 h-3.5" />
                              <span>Approve Reward</span>
                            </button>
                          )}

                          {/* Reject Reward Action */}
                          {isRewardPending(sc) && (
                            <button
                              onClick={() => {
                                setRejectingShowcase(sc);
                                setRejectionReason('');
                              }}
                              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-rose-600/20 hover:bg-rose-600 text-rose-300 hover:text-white border border-rose-500/30 transition-all cursor-pointer"
                              title="Reject Showcase Reward (Showcase remains published)"
                            >
                              <X className="w-3.5 h-3.5" />
                              <span>Reject Reward</span>
                            </button>
                          )}

                          {/* Block Action */}
                          {sc.status !== 'BLOCKED' && sc.status !== 'DELETED' && (
                            <button
                              onClick={() => {
                                setBlockingShowcase(sc);
                                setBlockReason('');
                              }}
                              className="p-1.5 rounded-lg bg-slate-900 hover:bg-amber-950/40 text-slate-400 hover:text-amber-300 border border-slate-800 hover:border-amber-500/40 transition-colors cursor-pointer"
                              title="Block Showcase (Hide Publicly)"
                            >
                              <ShieldAlert className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {/* Unblock Action */}
                          {sc.status === 'BLOCKED' && (
                            <button
                              onClick={() => {
                                setUnblockingShowcase(sc);
                                setUnblockReason('');
                              }}
                              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-emerald-950/70 hover:bg-emerald-900 text-emerald-300 border border-emerald-500/40 transition-all cursor-pointer"
                              title="Unblock Showcase (Restore Public Access)"
                            >
                              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                              <span>Unblock</span>
                            </button>
                          )}

                          {/* Soft Delete Action */}
                          {sc.status !== 'DELETED' && (
                            <button
                              onClick={() => {
                                setDeletingShowcase(sc);
                                setDeleteReason('');
                              }}
                              className="p-1.5 rounded-lg bg-slate-900 hover:bg-rose-950/40 text-slate-500 hover:text-rose-400 border border-slate-800 hover:border-rose-500/40 transition-colors cursor-pointer"
                              title="Admin Soft Delete Showcase"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Approve Confirmation Modal */}
      {approvingShowcase && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto">
              <Gift className="w-6 h-6" />
            </div>

            <div className="text-center space-y-1.5">
              <h3 className="text-base font-bold text-white">Approve Owner First-Event Reward</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                You are approving the first-event showcase reward for <strong className="text-slate-200">{approvingShowcase.title}</strong> (Org:{' '}
                <strong className="text-emerald-400">{approvingShowcase.organization_name}</strong>).
                {approvingShowcase.owner_user_id && (
                  <span className="block text-[11px] text-slate-400 font-mono mt-0.5">
                    Account Owner: {approvingShowcase.owner_user_id}
                  </span>
                )}
              </p>
            </div>

            <div className="p-3 bg-emerald-950/40 border border-emerald-500/30 rounded-2xl text-xs text-emerald-300 space-y-1">
              <div className="font-bold flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" />
                <span>Owner-Level Reward Execution</span>
              </div>
              <p className="text-[11px] text-emerald-200/80">
                1. Verifies lifetime eligibility for the Account Owner (limit 1 reward per owner).<br />
                2. Records the grant in <code>owner_showcase_rewards</code> atomically.<br />
                3. Idempotently deposits <strong>RM300 Showcase Credit</strong> into the organization wallet.<br />
                4. Showcase publishing and quality review remain independent workflows.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setApprovingShowcase(null)}
                disabled={actionLoading}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleApprove(approvingShowcase.id)}
                disabled={actionLoading}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-emerald-500 hover:bg-emerald-400 text-slate-950 transition-all shadow-md shadow-emerald-500/20 cursor-pointer disabled:opacity-50"
              >
                <Check className="w-4 h-4" />
                <span>{actionLoading ? 'Approving & Rewarding...' : 'Confirm Approval (RM300)'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject Feedback Modal */}
      {rejectingShowcase && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in">
          <form onSubmit={handleReject} className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <XCircle className="w-5 h-5 text-rose-400" />
                <h3 className="text-sm font-bold text-white">Reject First-Event Showcase Reward</h3>
              </div>
              <button
                type="button"
                onClick={() => setRejectingShowcase(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-300">
              Provide feedback on why this showcase reward is being declined. Note: Declining the reward does NOT unpublish the showcase from the public gallery.
            </p>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Reason for Rejection <span className="text-rose-400">*</span>
              </label>
              <textarea
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                rows={4}
                placeholder="e.g. Please provide at least 3 high-resolution photos of the booth activation and ensure the client logo is transparent."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-100 placeholder:text-slate-600 focus:border-rose-500 outline-none resize-none"
                required
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setRejectingShowcase(null)}
                disabled={actionLoading}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={actionLoading || !rejectionReason.trim()}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white transition-all shadow-md shadow-rose-600/20 cursor-pointer disabled:opacity-50"
              >
                <XCircle className="w-4 h-4" />
                <span>{actionLoading ? 'Rejecting...' : 'Reject with Feedback'}</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Inspect / Preview Showcase Modal */}
      {showPreviewModal && selectedShowcase && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-white">{selectedShowcase.title}</h3>
                  {selectedShowcase.status === 'DELETED' ? (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 border border-slate-700 text-slate-400">
                      DELETED
                    </span>
                  ) : selectedShowcase.status === 'BLOCKED' ? (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/20 border border-rose-500/40 text-rose-300 flex items-center gap-1">
                      <ShieldAlert className="w-3 h-3 text-rose-400" />
                      BLOCKED BY ADMIN
                    </span>
                  ) : isRewarded(selectedShowcase) ? (
                    <div className="flex items-center gap-1.5">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300">
                        Rewarded
                      </span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300">
                        RM300 Showcase Credit Granted
                      </span>
                    </div>
                  ) : isRewardPending(selectedShowcase) ? (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/20 text-blue-300 animate-pulse">
                      Reward Pending
                    </span>
                  ) : isRewardRejected(selectedShowcase) ? (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-300">
                      Reward Declined
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-slate-400">
                      {selectedShowcase.reward_review_status || 'Standard'}
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-400">
                  {selectedShowcase.organization_name} • Event: {selectedShowcase.event_name || selectedShowcase.event_id}
                </p>
              </div>

              <button
                onClick={() => setShowPreviewModal(false)}
                className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 overflow-y-auto space-y-6 flex-1 text-xs">
              {/* Blocked Moderation Banner */}
              {selectedShowcase.status === 'BLOCKED' && (
                <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-2xl flex items-start gap-3">
                  <ShieldAlert className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                  <div className="space-y-1.5 flex-1">
                    <div className="text-xs font-bold text-rose-300">Showcase Blocked by Moderation</div>
                    <p className="text-xs text-rose-200/90 leading-relaxed bg-rose-950/50 p-2.5 rounded-xl border border-rose-500/20">
                      <span className="font-semibold text-rose-300">Reason:</span> {selectedShowcase.moderation_reason || 'Violates community standards or sensitive content.'}
                    </p>
                    {selectedShowcase.moderated_at && (
                      <div className="text-[10px] text-rose-400/80">
                        Blocked on {new Date(selectedShowcase.moderated_at).toLocaleString()}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Soft-Deleted Banner */}
              {selectedShowcase.status === 'DELETED' && (
                <div className="p-4 bg-slate-800/60 border border-slate-700 rounded-2xl flex items-start gap-3">
                  <Trash2 className="w-5 h-5 text-slate-400 shrink-0 mt-0.5" />
                  <div className="space-y-1 flex-1">
                    <div className="text-xs font-bold text-slate-300">Showcase Administratively Soft-Deleted</div>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      {selectedShowcase.moderation_reason || 'Archived by developer administrator.'}
                    </p>
                    {selectedShowcase.deleted_at && (
                      <div className="text-[10px] text-slate-500">
                        Deleted at {new Date(selectedShowcase.deleted_at).toLocaleString()}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Cover & Client */}
              {selectedShowcase.cover_image_url && (
                <div className="relative rounded-2xl overflow-hidden border border-slate-800 max-h-48 bg-slate-950">
                  <img
                    src={selectedShowcase.cover_image_url}
                    alt="Showcase Cover"
                    className="w-full h-48 object-cover"
                    onError={(e) => ((e.target as any).style.display = 'none')}
                  />
                  {selectedShowcase.client_logo_url && (
                    <div className="absolute bottom-3 left-3 bg-slate-950/90 p-2 rounded-xl border border-slate-800">
                      <img
                        src={selectedShowcase.client_logo_url}
                        alt="Client Logo"
                        className="h-7 max-w-[120px] object-contain"
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Client & Description */}
              <div className="space-y-3 bg-slate-950/40 p-4 rounded-2xl border border-slate-800">
                {selectedShowcase.client_name && (
                  <div>
                    <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                      Client / Sponsor
                    </span>
                    <span className="text-sm font-bold text-amber-400">{selectedShowcase.client_name}</span>
                  </div>
                )}

                <div>
                  <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                    Description & Narrative
                  </span>
                  <p className="text-xs text-slate-300 leading-relaxed mt-1 whitespace-pre-wrap">
                    {selectedShowcase.description || 'No description provided.'}
                  </p>
                </div>
              </div>

              {/* Gallery Media */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                    Showcase Media Gallery ({previewMedia.length})
                  </span>
                </div>

                {previewMediaLoading ? (
                  <div className="py-8 text-center text-slate-500">Loading gallery items...</div>
                ) : previewMedia.length === 0 ? (
                  <div className="p-4 text-center bg-slate-950/40 border border-slate-800 rounded-xl text-slate-500">
                    No media items uploaded for this showcase.
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {previewMedia.map((m) => (
                      <div
                        key={m.id}
                        className="group relative rounded-xl overflow-hidden border border-slate-800 bg-slate-950 aspect-video flex items-center justify-center"
                      >
                        {m.media_type === 'IMAGE' ? (
                          <img
                            src={m.media_url}
                            alt={m.file_name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <video
                            src={m.media_url}
                            controls
                            className="w-full h-full object-cover"
                          />
                        )}
                        <a
                          href={m.media_url}
                          target="_blank"
                          rel="noreferrer"
                          className="absolute top-1.5 right-1.5 p-1 rounded-md bg-slate-950/80 text-slate-300 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity"
                          title="Open original"
                        >
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Audit Details */}
              <div className="bg-slate-950/60 p-4 rounded-2xl border border-slate-800 space-y-1.5 text-[11px] text-slate-400">
                <div className="font-bold text-slate-300">Audit Information:</div>
                <div>Submitted At: {selectedShowcase.submitted_at ? new Date(selectedShowcase.submitted_at).toLocaleString() : 'N/A'}</div>
                {selectedShowcase.reviewed_at && (
                  <div>Reviewed At: {new Date(selectedShowcase.reviewed_at).toLocaleString()}</div>
                )}
                {selectedShowcase.reward_granted_at && (
                  <div className="text-emerald-400 font-semibold flex items-center gap-1.5">
                    <Gift className="w-3.5 h-3.5 text-amber-400" />
                    <span>RM300 Showcase Credit Granted at {new Date(selectedShowcase.reward_granted_at).toLocaleString()} (Txn: {selectedShowcase.reward_transaction_id ? selectedShowcase.reward_transaction_id.slice(0, 8) + '...' : 'Recorded'})</span>
                  </div>
                )}
                {selectedShowcase.rejection_reason && (
                  <div className="text-rose-400">
                    Latest Rejection Reason: {selectedShowcase.rejection_reason}
                  </div>
                )}
                {selectedShowcase.moderation_reason && (
                  <div className="text-rose-400">
                    Moderation / Deletion Note: {selectedShowcase.moderation_reason}
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer Controls */}
            <div className="p-4 border-t border-slate-800 bg-slate-950/60 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                {/* Block / Unblock buttons in preview */}
                {selectedShowcase.status === 'BLOCKED' ? (
                  <button
                    onClick={() => {
                      setUnblockingShowcase(selectedShowcase);
                      setUnblockReason('');
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-950/80 hover:bg-emerald-900 text-emerald-300 border border-emerald-500/40 transition-all cursor-pointer"
                  >
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Unblock Showcase</span>
                  </button>
                ) : selectedShowcase.status !== 'DELETED' ? (
                  <button
                    onClick={() => {
                      setBlockingShowcase(selectedShowcase);
                      setBlockReason('');
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-amber-950/60 hover:bg-amber-900 text-amber-300 border border-amber-500/40 transition-all cursor-pointer"
                  >
                    <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
                    <span>Block Showcase</span>
                  </button>
                ) : null}

                {/* Soft Delete button in preview */}
                {selectedShowcase.status !== 'DELETED' && (
                  <button
                    onClick={() => {
                      setDeletingShowcase(selectedShowcase);
                      setDeleteReason('');
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-900 hover:bg-rose-950/40 text-slate-400 hover:text-rose-400 border border-slate-800 hover:border-rose-500/40 transition-all cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete</span>
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2">
                {/* Publicly Viewable: View & Share */}
                {((selectedShowcase.status === 'PUBLISHED' || selectedShowcase.publication_status === 'PUBLISHED') && selectedShowcase.status !== 'BLOCKED' && selectedShowcase.status !== 'DELETED') && (
                  <>
                    <button
                      type="button"
                      onClick={() => window.open(`/showcase/${selectedShowcase.id || selectedShowcase.event_id}`, '_blank')}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-all cursor-pointer"
                      title="Open Public Showcase in New Tab"
                    >
                      <Eye className="w-3.5 h-3.5 text-emerald-400" />
                      <span>View</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleShareShowcase(selectedShowcase)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-all cursor-pointer"
                      title="Share Public Showcase URL"
                    >
                      {copiedShowcaseId === selectedShowcase.id ? (
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

                {isRewardPending(selectedShowcase) && (
                  <>
                    <button
                      onClick={() => {
                        setRejectingShowcase(selectedShowcase);
                        setRejectionReason('');
                      }}
                      className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-rose-600/20 hover:bg-rose-600 text-rose-300 hover:text-white border border-rose-500/30 transition-all cursor-pointer"
                    >
                      Reject Reward
                    </button>
                    <button
                      onClick={() => setApprovingShowcase(selectedShowcase)}
                      className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-xs font-bold bg-emerald-500 hover:bg-emerald-400 text-slate-950 transition-all shadow-md shadow-emerald-500/20 cursor-pointer"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>Approve Reward (RM300)</span>
                    </button>
                  </>
                )}
                <button
                  onClick={() => setShowPreviewModal(false)}
                  className="px-4 py-1.5 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Block Confirmation Modal */}
      {blockingShowcase && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center mx-auto">
              <ShieldAlert className="w-6 h-6" />
            </div>

            <div className="text-center space-y-1.5">
              <h3 className="text-base font-bold text-white">Block Showcase</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Blocking will immediately unpublish <strong className="text-slate-200">{blockingShowcase.title}</strong> and hide it from all public gallery pages.
              </p>
            </div>

            <form onSubmit={handleBlock} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Reason for Blocking <span className="text-amber-400">*</span>
                </label>
                <textarea
                  value={blockReason}
                  onChange={(e) => setBlockReason(e.target.value)}
                  rows={4}
                  placeholder="e.g. Contains sensitive client proprietary assets, or violates community guidelines."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-100 placeholder:text-slate-600 focus:border-amber-500 outline-none resize-none"
                  required
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setBlockingShowcase(null)}
                  disabled={actionLoading}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading || !blockReason.trim()}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 transition-all shadow-md shadow-amber-500/20 cursor-pointer disabled:opacity-50"
                >
                  <ShieldAlert className="w-4 h-4" />
                  <span>{actionLoading ? 'Blocking...' : 'Confirm Block Showcase'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Unblock Confirmation Modal */}
      {unblockingShowcase && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto">
              <ShieldCheck className="w-6 h-6" />
            </div>

            <div className="text-center space-y-1.5">
              <h3 className="text-base font-bold text-white">Unblock Showcase</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Restore <strong className="text-slate-200">{unblockingShowcase.title}</strong> to published status and make it visible in the public showcase gallery.
              </p>
            </div>

            <form onSubmit={handleUnblock} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Optional Unblock / Resolution Note
                </label>
                <textarea
                  value={unblockReason}
                  onChange={(e) => setUnblockReason(e.target.value)}
                  rows={3}
                  placeholder="e.g. Sensitive assets reviewed and cleared with event organizer."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-100 placeholder:text-slate-600 focus:border-emerald-500 outline-none resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setUnblockingShowcase(null)}
                  disabled={actionLoading}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-emerald-500 hover:bg-emerald-400 text-slate-950 transition-all shadow-md shadow-emerald-500/20 cursor-pointer disabled:opacity-50"
                >
                  <ShieldCheck className="w-4 h-4" />
                  <span>{actionLoading ? 'Unblocking...' : 'Confirm Unblock Showcase'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingShowcase && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>

            <div className="text-center space-y-1.5">
              <h3 className="text-base font-bold text-white">Soft Delete Showcase</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Perform an administrative soft delete on <strong className="text-slate-200">{deletingShowcase.title}</strong>. This removes it from public discovery while preserving historical audit logs.
              </p>
            </div>

            <form onSubmit={handleDelete} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Reason for Deletion <span className="text-rose-400">*</span>
                </label>
                <textarea
                  value={deleteReason}
                  onChange={(e) => setDeleteReason(e.target.value)}
                  rows={3}
                  placeholder="e.g. Inappropriate content, copyright infringement, or spam."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-100 placeholder:text-slate-600 focus:border-rose-500 outline-none resize-none"
                  required
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setDeletingShowcase(null)}
                  disabled={actionLoading}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading || !deleteReason.trim()}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white transition-all shadow-md shadow-rose-600/20 cursor-pointer disabled:opacity-50"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>{actionLoading ? 'Deleting...' : 'Confirm Soft Delete'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
