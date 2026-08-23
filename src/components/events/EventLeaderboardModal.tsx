import React, { useState, useEffect } from 'react';
import {
  Trophy,
  X,
  Trash2,
  RefreshCw,
  Search,
  Users,
  Award,
  Zap,
  Clock,
  AlertTriangle,
  Medal,
  Calendar,
} from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { EventLeaderboardEntry, EventScoreStats } from '../../types';

interface EventLeaderboardModalProps {
  isOpen: boolean;
  onClose: () => void;
  event: any;
  userRole?: string;
}

export const EventLeaderboardModal: React.FC<EventLeaderboardModalProps> = ({
  isOpen,
  onClose,
  event,
  userRole,
}) => {
  const [scores, setScores] = useState<EventLeaderboardEntry[]>([]);
  const [stats, setStats] = useState<EventScoreStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Actions state
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [isClearing, setIsClearing] = useState(false);

  const isOwnerOrAdmin = ['owner', 'admin'].includes(userRole || '');

  const fetchScores = async () => {
    if (!event?.id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/events/${event.id}/admin/high-scores?limit=100`);
      if (!res.ok) {
        // Fallback to public endpoint if admin endpoint fails
        const pubRes = await apiFetch(`/api/events/${event.id}/high-scores?limit=100`);
        if (!pubRes.ok) {
          throw new Error('Failed to load event leaderboard');
        }
        const pubData = await pubRes.json();
        setScores(pubData.scores || []);
        setStats(null);
        return;
      }
      const data = await res.json();
      setScores(data.scores || []);
      setStats(data.stats || null);
    } catch (err: any) {
      console.error('Fetch scores error:', err);
      setError(err.message || 'Could not load leaderboard data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && event?.id) {
      fetchScores();
      setSearchTerm('');
      setShowClearConfirm(false);
    }
  }, [isOpen, event?.id]);

  const handleDeleteScore = async (scoreId: string) => {
    if (!event?.id) return;
    setDeletingId(scoreId);
    try {
      const res = await apiFetch(`/api/events/${event.id}/high-scores/${scoreId}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to delete score');
      }
      // Remove score from local list and refresh
      setScores((prev) => prev.filter((s) => s.id !== scoreId));
      fetchScores();
    } catch (err: any) {
      alert(err.message || 'Error deleting score');
    } finally {
      setDeletingId(null);
    }
  };

  const handleClearLeaderboard = async () => {
    if (!event?.id) return;
    setIsClearing(true);
    try {
      const res = await apiFetch(`/api/events/${event.id}/high-scores/clear`, {
        method: 'POST',
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to clear leaderboard');
      }
      setScores([]);
      setShowClearConfirm(false);
      fetchScores();
    } catch (err: any) {
      alert(err.message || 'Error clearing leaderboard');
    } finally {
      setIsClearing(false);
    }
  };

  if (!isOpen || !event) return null;

  const filteredScores = scores.filter((s) =>
    s.player_name.toLowerCase().includes(searchTerm.toLowerCase().trim())
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm overflow-hidden animate-in fade-in">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center">
              <Trophy className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                <span>{event.name}</span>
                <span className="text-xs font-normal text-slate-400 font-mono">Leaderboard</span>
              </h2>
              <p className="text-xs text-slate-400">
                Independent High Score rankings for this event
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={fetchScores}
              disabled={loading}
              className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors"
              title="Refresh Leaderboard"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Quick Stats Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-4 bg-slate-950/30 border-b border-slate-800/80">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-3">
            <div className="flex items-center gap-1.5 text-slate-400 text-xs mb-1">
              <Users className="w-3.5 h-3.5 text-blue-400" />
              <span>Total Entries</span>
            </div>
            <div className="text-lg font-bold text-white font-mono">
              {stats?.totalEntries ?? scores.length}
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-3">
            <div className="flex items-center gap-1.5 text-slate-400 text-xs mb-1">
              <Award className="w-3.5 h-3.5 text-emerald-400" />
              <span>Unique Players</span>
            </div>
            <div className="text-lg font-bold text-emerald-400 font-mono">
              {stats?.uniquePlayers ?? new Set(scores.map((s) => s.player_name.toLowerCase())).size}
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-3">
            <div className="flex items-center gap-1.5 text-slate-400 text-xs mb-1">
              <Trophy className="w-3.5 h-3.5 text-amber-400" />
              <span>Top Score</span>
            </div>
            <div className="text-lg font-bold text-amber-400 font-mono">
              {stats?.highScore ?? (scores.length > 0 ? Math.max(...scores.map((s) => s.score)) : 0)}
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-3">
            <div className="flex items-center gap-1.5 text-slate-400 text-xs mb-1">
              <Zap className="w-3.5 h-3.5 text-teal-400" />
              <span>Average Score</span>
            </div>
            <div className="text-lg font-bold text-teal-400 font-mono">
              {stats?.averageScore ?? (scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b.score, 0) / scores.length) : 0)}
            </div>
          </div>
        </div>

        {/* Filter / Search Bar & Actions */}
        <div className="p-4 border-b border-slate-800/80 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search player nickname..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-slate-950 border border-slate-800 focus:border-amber-400 rounded-xl text-xs text-white placeholder-slate-500 outline-none transition-colors"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white text-xs"
              >
                Clear
              </button>
            )}
          </div>

          {isOwnerOrAdmin && scores.length > 0 && (
            <button
              onClick={() => setShowClearConfirm(true)}
              className="px-3 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors shrink-0"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Reset Board</span>
            </button>
          )}
        </div>

        {/* Leaderboard Table / Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {error && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs mb-3">
              {error}
            </div>
          )}

          {loading ? (
            <div className="py-16 text-center text-slate-400 flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
              <span className="text-xs">Loading Event High Scores...</span>
            </div>
          ) : filteredScores.length === 0 ? (
            <div className="py-16 text-center text-slate-400">
              <Trophy className="w-12 h-12 text-slate-700 mx-auto mb-3" />
              <p className="text-sm font-semibold text-slate-300">
                {searchTerm ? 'No matching player scores' : 'No High Scores Yet'}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                {searchTerm ? 'Try a different search term' : 'Scores will appear here once players play this event'}
              </p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {filteredScores.map((entry) => {
                let rankBadge = (
                  <span className="w-7 h-7 rounded-lg bg-slate-800 text-slate-400 font-bold text-xs flex items-center justify-center shrink-0">
                    #{entry.rank}
                  </span>
                );

                if (entry.rank === 1) {
                  rankBadge = (
                    <span className="w-7 h-7 rounded-lg bg-amber-500/20 border border-amber-400 text-amber-300 font-black text-xs flex items-center justify-center shrink-0 shadow-[0_0_10px_rgba(245,158,11,0.3)]">
                      🥇
                    </span>
                  );
                } else if (entry.rank === 2) {
                  rankBadge = (
                    <span className="w-7 h-7 rounded-lg bg-slate-400/20 border border-slate-400 text-slate-200 font-black text-xs flex items-center justify-center shrink-0">
                      🥈
                    </span>
                  );
                } else if (entry.rank === 3) {
                  rankBadge = (
                    <span className="w-7 h-7 rounded-lg bg-amber-700/20 border border-amber-600 text-amber-400 font-black text-xs flex items-center justify-center shrink-0">
                      🥉
                    </span>
                  );
                }

                const createdDate = new Date(entry.created_at).toLocaleDateString([], {
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                });

                return (
                  <div
                    key={entry.id}
                    className="flex items-center justify-between p-3 rounded-xl bg-slate-950/60 border border-slate-800 hover:border-slate-700 transition-colors"
                  >
                    <div className="flex items-center gap-3 overflow-hidden">
                      {rankBadge}
                      <div className="overflow-hidden">
                        <div className="text-sm font-bold text-white truncate font-mono">
                          {entry.player_name}
                        </div>
                        <div className="text-[11px] text-slate-500 flex items-center gap-1.5">
                          <Clock className="w-3 h-3" />
                          <span>{createdDate}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="text-base font-black text-emerald-400 font-mono">
                        {entry.score.toLocaleString()}
                      </span>

                      {isOwnerOrAdmin && (
                        <button
                          onClick={() => handleDeleteScore(entry.id)}
                          disabled={deletingId === entry.id}
                          className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors disabled:opacity-50"
                          title="Delete Score Entry"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Clear Leaderboard Confirmation Modal Overlay */}
        {showClearConfirm && (
          <div className="p-4 bg-red-950/40 border-t border-red-900/60 flex flex-col sm:flex-row items-center justify-between gap-3 animate-in fade-in">
            <div className="flex items-center gap-2 text-left">
              <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
              <div className="text-xs">
                <span className="font-bold text-red-300 block">Reset entire leaderboard?</span>
                <span className="text-red-400/80">This will permanently delete all {scores.length} scores for this event.</span>
              </div>
            </div>
            <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
              <button
                onClick={() => setShowClearConfirm(false)}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleClearLeaderboard}
                disabled={isClearing}
                className="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-1"
              >
                {isClearing ? 'Resetting...' : 'Yes, Reset Leaderboard'}
              </button>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 flex items-center justify-between bg-slate-950/30">
          <span className="text-xs text-slate-500">
            Showing {filteredScores.length} of {scores.length} recorded entries
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
