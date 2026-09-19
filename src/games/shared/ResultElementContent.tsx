import React, { useState, useEffect } from 'react';
import {
  ResultScreenElement,
  ResultCardElement,
  ResultGroupElement,
  ResultTextElement,
  ResultImageElement,
  ResultScoreElement,
  ResultMovesElement,
  ResultPairsElement,
  ResultTimeElement,
  ResultAccuracyElement,
  ResultButtonElement,
  ResultLeaderboardElement,
  ResultAverageReactionElement,
  ResultBestReactionElement,
  ResultWorstReactionElement,
  ResultRoundResultsElement,
  ResultRatingElement,
} from './resultScreenTypes';
import {
  Award,
  RotateCcw,
  LogOut,
  Image as ImageIcon,
  Trophy,
  Medal,
  Crown,
  Clock,
  Sparkles,
  Zap,
  Users,
  AlertCircle,
  Loader2,
  Send,
  CheckCircle2,
} from 'lucide-react';
import { ResultScreenStats } from './ResultScreenRenderer';
import { EventLeaderboardEntry } from '../../types';

export const SIMULATED_LEADERBOARD_ENTRIES: EventLeaderboardEntry[] = [
  {
    id: 'sim_1',
    event_id: 'sim',
    player_name: 'Alex',
    score: 1250,
    rank: 1,
    created_at: new Date().toISOString(),
    metadata: { moves: 14, duration: 24, accuracyPercent: 92 },
  },
  {
    id: 'sim_2',
    event_id: 'sim',
    player_name: 'Jamie',
    score: 1100,
    rank: 2,
    created_at: new Date().toISOString(),
    metadata: { moves: 16, duration: 28, accuracyPercent: 86 },
  },
  {
    id: 'sim_3',
    event_id: 'sim',
    player_name: 'Taylor',
    score: 980,
    rank: 3,
    created_at: new Date().toISOString(),
    metadata: { moves: 18, duration: 32, accuracyPercent: 80 },
  },
  {
    id: 'sim_4',
    event_id: 'sim',
    player_name: 'Jordan',
    score: 850,
    rank: 4,
    created_at: new Date().toISOString(),
    metadata: { moves: 20, duration: 35, accuracyPercent: 75 },
  },
  {
    id: 'sim_5',
    event_id: 'sim',
    player_name: 'Morgan',
    score: 720,
    rank: 5,
    created_at: new Date().toISOString(),
    metadata: { moves: 22, duration: 40, accuracyPercent: 70 },
  },
];

export const SIMULATED_REACTION_LEADERBOARD_ENTRIES: EventLeaderboardEntry[] = [
  {
    id: 'sim_r1',
    event_id: 'sim',
    player_name: 'Max V.',
    score: 182,
    rank: 1,
    created_at: new Date().toISOString(),
    metadata: { reactionTimeMs: 182, gameType: 'reaction-time' },
  },
  {
    id: 'sim_r2',
    event_id: 'sim',
    player_name: 'Lewis H.',
    score: 194,
    rank: 2,
    created_at: new Date().toISOString(),
    metadata: { reactionTimeMs: 194, gameType: 'reaction-time' },
  },
  {
    id: 'sim_r3',
    event_id: 'sim',
    player_name: 'Lando N.',
    score: 201,
    rank: 3,
    created_at: new Date().toISOString(),
    metadata: { reactionTimeMs: 201, gameType: 'reaction-time' },
  },
  {
    id: 'sim_r4',
    event_id: 'sim',
    player_name: 'Charles L.',
    score: 215,
    rank: 4,
    created_at: new Date().toISOString(),
    metadata: { reactionTimeMs: 215, gameType: 'reaction-time' },
  },
  {
    id: 'sim_r5',
    event_id: 'sim',
    player_name: 'Oscar P.',
    score: 228,
    rank: 5,
    created_at: new Date().toISOString(),
    metadata: { reactionTimeMs: 228, gameType: 'reaction-time' },
  },
];

export const FONT_FAMILY_PRESETS = [
  { label: 'System Default', value: 'inherit' },
  { label: 'Inter (Clean Sans)', value: "'Inter', sans-serif" },
  { label: 'Roboto (Modern Sans)', value: "'Roboto', sans-serif" },
  { label: 'Poppins (Geometric)', value: "'Poppins', sans-serif" },
  { label: 'Montserrat (Bold Clean)', value: "'Montserrat', sans-serif" },
  { label: 'Orbitron (Sci-Fi Arcade)', value: "'Orbitron', sans-serif" },
  { label: 'Press Start 2P (Pixel 8-Bit)', value: "'Press Start 2P', monospace" },
  { label: 'Playfair Display (Luxury Serif)', value: "'Playfair Display', serif" },
  { label: 'Cinzel (Mythic Fantasy)', value: "'Cinzel', serif" },
  { label: 'Bebas Neue (Impact Display)', value: "'Bebas Neue', sans-serif" },
  { label: 'Fredoka (Playful Rounded)', value: "'Fredoka', sans-serif" },
  { label: 'JetBrains Mono (Monospace)', value: "'JetBrains Mono', monospace" },
  { label: 'Georgia (Editorial Serif)', value: 'Georgia, serif' },
  { label: 'Impact (Poster Heavy)', value: 'Impact, sans-serif' },
];

export interface ResultElementContentProps {
  element: ResultScreenElement;
  parentWidth: number;
  parentHeight: number;
  stats?: ResultScreenStats;
  isSimulation?: boolean;
  isEditor?: boolean;
  isEventPreview?: boolean;
  isEventTest?: boolean;
  onAction?: (action: string) => void;
  renderChild?: (child: ResultScreenElement, parentW: number, parentH: number) => React.ReactNode;
  leaderboardData?: EventLeaderboardEntry[];
  loadingLeaderboard?: boolean;
  leaderboardError?: string | null;
  currentPlayerName?: string;
  currentEntryId?: string;
  scoreSubmitted?: boolean;
  submittedRank?: number | null;
  isSubmittingScore?: boolean;
  submissionError?: string | null;
  onSubmitScore?: (playerName: string) => Promise<{ success: boolean; rank?: number; error?: string } | void> | void;
}

interface LeaderboardElementRendererProps {
  lbEl: ResultLeaderboardElement;
  parentWidth: number;
  parentHeight: number;
  stats?: ResultScreenStats;
  isSimulation?: boolean;
  isEditor?: boolean;
  isEventPreview?: boolean;
  isEventTest?: boolean;
  leaderboardData?: EventLeaderboardEntry[];
  loadingLeaderboard?: boolean;
  leaderboardError?: string | null;
  currentPlayerName?: string;
  currentEntryId?: string;
  scoreSubmitted?: boolean;
  submittedRank?: number | null;
  isSubmittingScore?: boolean;
  submissionError?: string | null;
  onSubmitScore?: (playerName: string) => Promise<{ success: boolean; rank?: number; error?: string } | void> | void;
}

const LeaderboardElementRenderer: React.FC<LeaderboardElementRendererProps> = ({
  lbEl,
  parentWidth,
  parentHeight,
  stats,
  isSimulation = false,
  isEditor = false,
  isEventPreview = false,
  isEventTest = false,
  leaderboardData,
  loadingLeaderboard = false,
  leaderboardError = null,
  currentPlayerName,
  currentEntryId,
  scoreSubmitted = false,
  submittedRank = null,
  isSubmittingScore = false,
  submissionError = null,
  onSubmitScore,
}) => {
  const style = lbEl.style || {};

  const maxRows = Math.max(1, Math.min(10, lbEl.maxRows ?? style.maxRows ?? 5));
  const showHeader = (lbEl.showHeader ?? style.showHeader) !== false;
  const headerText = lbEl.headerText || style.headerText || 'LEADERBOARD';
  const showRank = (lbEl.showRank ?? style.showRank) !== false;
  const showPlayerName = (lbEl.showPlayerName ?? style.showPlayerName) !== false;
  const showScore = (lbEl.showScore ?? style.showScore) !== false;
  const showMoves = Boolean(lbEl.showMoves ?? style.showMoves);
  const showTime = Boolean(lbEl.showTime ?? style.showTime);
  const showAccuracy = Boolean(lbEl.showAccuracy ?? style.showAccuracy);

  // Submission style & content config
  const submissionConfig = lbEl.submission || style.submission || {};
  const inputPlaceholder =
    lbEl.inputPlaceholder || style.inputPlaceholder || submissionConfig.inputPlaceholder || 'Enter your name';
  const inputMaxLength =
    lbEl.inputMaxLength || style.inputMaxLength || submissionConfig.inputMaxLength || 20;
  const submitButtonText =
    lbEl.submitButtonText || style.submitButtonText || submissionConfig.submitButtonText || 'SUBMIT SCORE';
  const successMessage =
    lbEl.successMessage || style.successMessage || submissionConfig.successMessage || 'Score submitted!';

  // Interactive / Simulation State
  const [localName, setLocalName] = useState<string>(() => currentPlayerName || '');
  const [localSubmitting, setLocalSubmitting] = useState<boolean>(false);
  const [localSubmitted, setLocalSubmitted] = useState<boolean>(false);
  const [localRank, setLocalRank] = useState<number | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  // Sync localName with currentPlayerName from parent game session
  useEffect(() => {
    setLocalName(currentPlayerName || '');
  }, [currentPlayerName]);

  // Reset submission state when scoreSubmitted resets for a new game
  useEffect(() => {
    if (!scoreSubmitted) {
      setLocalSubmitted(false);
      setLocalRank(null);
      setLocalError(null);
    }
  }, [scoreSubmitted]);

  // Synced submission statuses
  const isSubmitted = scoreSubmitted || localSubmitted;
  const isSubmitting = isSubmittingScore || localSubmitting;
  const effectiveRank = submittedRank ?? localRank;
  const effectiveError = submissionError || localError;
  const effectiveCurrentName =
    (scoreSubmitted ? currentPlayerName : undefined) || (localSubmitted ? localName : currentPlayerName);

  // Base entries
  const isReactionGame =
    stats?.gameType === 'reaction-time' ||
    stats?.gameType === 'reaction-tap' ||
    stats?.averageReactionTimeMs !== undefined;

  const simPreset = isReactionGame
    ? SIMULATED_REACTION_LEADERBOARD_ENTRIES
    : SIMULATED_LEADERBOARD_ENTRIES;

  const baseEntries: EventLeaderboardEntry[] =
    isSimulation || isEditor
      ? (leaderboardData && leaderboardData.length > 0 ? leaderboardData : simPreset)
      : (leaderboardData || []);

  let entries = [...baseEntries];
  if ((isSimulation || isEditor) && isSubmitted && localName.trim()) {
    const alreadyInList = entries.some(
      (e) => e.player_name.trim().toLowerCase() === localName.trim().toLowerCase()
    );
    if (!alreadyInList) {
      const simScore = stats?.score ?? (isReactionGame ? 219 : 1000);
      const newSimEntry: EventLeaderboardEntry = {
        id: 'sim_curr_' + Date.now(),
        event_id: 'sim',
        player_name: localName.trim(),
        score: simScore,
        rank: effectiveRank || 1,
        created_at: new Date().toISOString(),
        metadata: {
          moves: stats?.moves ?? 16,
          duration: stats?.timeElapsedSeconds ?? 28,
          accuracyPercent: stats?.accuracyPercent ?? 88,
          reactionTimeMs: stats?.averageReactionTimeMs ?? 219,
          gameType: isReactionGame ? 'reaction-time' : undefined,
        },
      };
      entries.push(newSimEntry);
      if (isReactionGame) {
        entries.sort((a, b) => a.score - b.score);
      } else {
        entries.sort((a, b) => b.score - a.score);
      }
      entries = entries.map((item, idx) => ({ ...item, rank: idx + 1 }));
    }
  }

  const baseFontSize = style.fontSize || 16;
  const containerFontSize = `${(baseFontSize / parentWidth) * 100}cqi`;
  const headerFontSize = `${((baseFontSize * 1.05) / parentWidth) * 100}cqi`;
  const statFontSize = `${((baseFontSize * 0.85) / parentWidth) * 100}cqi`;
  const rowSpacing = typeof style.rowSpacing === 'number' ? style.rowSpacing : 4;

  const containerStyle: React.CSSProperties = {
    width: '100%',
    height: '100%',
    backgroundColor: style.backgroundColor || 'rgba(15, 23, 42, 0.92)',
    border:
      typeof style.borderWidth === 'number' && style.borderWidth > 0
        ? `${(style.borderWidth / parentWidth) * 100}cqi solid ${style.borderColor || '#334155'}`
        : '1px solid #334155',
    borderRadius:
      typeof style.borderRadius === 'number'
        ? `${(style.borderRadius / parentWidth) * 100}cqi`
        : '18px',
    padding:
      typeof style.padding === 'number'
        ? `${(style.padding / parentWidth) * 100}cqi`
        : '10px 14px',
    boxShadow:
      style.shadow !== false ? '0 12px 30px -6px rgba(0, 0, 0, 0.5)' : undefined,
    opacity: typeof style.opacity === 'number' ? style.opacity : undefined,
    fontFamily: style.fontFamily || 'inherit',
    display: 'flex',
    flexDirection: 'column',
    boxSizing: 'border-box',
    overflow: 'hidden',
  };

  const displayRows = entries.slice(0, maxRows);

  const handleScoreSubmit = async (e?: React.FormEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (isSubmitting || isSubmitted) return;

    const trimmed = localName.trim();
    if (!trimmed) {
      setLocalError('Please enter your name.');
      return;
    }
    if (trimmed.length > inputMaxLength) {
      setLocalError(`Name must be ${inputMaxLength} characters or less.`);
      return;
    }
    setLocalError(null);

    if (onSubmitScore) {
      const result = await onSubmitScore(trimmed);
      if (result && !result.success && result.error) {
        setLocalError(result.error);
      }
    } else {
      setLocalSubmitting(true);
      setTimeout(() => {
        setLocalSubmitting(false);
        setLocalSubmitted(true);
        const simScore = stats?.score ?? (isReactionGame ? 219 : 1000);
        const betterCount = isReactionGame
          ? simPreset.filter((s) => s.score < simScore).length
          : simPreset.filter((s) => s.score > simScore).length;
        setLocalRank(betterCount + 1);
      }, 350);
    }
  };

  return (
    <div
      style={containerStyle}
      className="flex flex-col select-none"
    >
      {/* Optional Leaderboard Header */}
      {showHeader && (
        <div
          className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-slate-800/80 shrink-0"
          style={{ color: style.headerColor || '#fbbf24' }}
        >
          <div className="flex items-center gap-1.5 min-w-0">
            <Trophy className="w-3.5 h-3.5 shrink-0 text-amber-400" />
            <span
              className="font-black uppercase tracking-wider truncate"
              style={{ fontSize: headerFontSize }}
            >
              {headerText}
            </span>
          </div>
          <span className="text-[10px] text-slate-500 font-mono shrink-0 ml-2">
            Top {maxRows}
          </span>
        </div>
      )}

      {/* Ranking Table Rows */}
      <div
        className="flex-1 min-h-0 flex flex-col justify-around overflow-hidden"
        style={{ gap: `${rowSpacing}px` }}
      >
        {!isSimulation && !isEditor && loadingLeaderboard ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-1.5 text-slate-400">
            <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
            <span style={{ fontSize: statFontSize }}>Loading rankings...</span>
          </div>
        ) : !isSimulation && !isEditor && leaderboardError ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-1 text-slate-500">
            <AlertCircle className="w-4 h-4 text-rose-400/80" />
            <span style={{ fontSize: statFontSize }}>Leaderboard unavailable</span>
          </div>
        ) : displayRows.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-1 text-slate-500">
            <Users className="w-4 h-4 text-slate-600" />
            <span style={{ fontSize: statFontSize }}>No scores recorded yet</span>
          </div>
        ) : (
          displayRows.map((entry, idx) => {
            const rankNum = entry.rank || idx + 1;
            const isTop1 = rankNum === 1;
            const isTop2 = rankNum === 2;
            const isTop3 = rankNum === 3;
            const isCurrentPlayer =
              style.highlightCurrentPlayer !== false &&
              ((currentEntryId && entry.id === currentEntryId) ||
                (effectiveCurrentName &&
                  entry.player_name &&
                  entry.player_name.trim().toLowerCase() ===
                    effectiveCurrentName.trim().toLowerCase()));

            const rowBg = isCurrentPlayer
              ? style.highlightColor || 'rgba(245, 158, 11, 0.18)'
              : idx % 2 === 0
              ? style.rowBackgroundColor || 'rgba(30, 41, 59, 0.45)'
              : style.alternateRowBackgroundColor || 'transparent';

            const rankColor =
              style.rankColor ||
              (isTop1 ? '#fbbf24' : isTop2 ? '#e2e8f0' : isTop3 ? '#d97706' : '#94a3b8');

            return (
              <div
                key={entry.id || `rank-${idx}`}
                className={`flex items-center justify-between px-2 py-1 rounded-lg transition-colors overflow-hidden shrink-0 ${
                  isCurrentPlayer ? 'ring-1 ring-amber-400/40 font-semibold' : ''
                }`}
                style={{
                  backgroundColor: rowBg,
                  fontSize: containerFontSize,
                }}
              >
                {/* Left: Rank & Player Name */}
                <div className="flex items-center gap-2 min-w-0 flex-1 mr-2">
                  {showRank && (
                    <div
                      className="w-5 flex items-center justify-center font-mono font-bold shrink-0 text-center"
                      style={{ color: rankColor }}
                    >
                      {isTop1 ? (
                        <Crown className="w-3.5 h-3.5 fill-amber-400 text-amber-500" />
                      ) : isTop2 ? (
                        <Medal className="w-3.5 h-3.5 text-slate-300" />
                      ) : isTop3 ? (
                        <Medal className="w-3.5 h-3.5 text-amber-700" />
                      ) : (
                        <span style={{ fontSize: statFontSize }}>#{rankNum}</span>
                      )}
                    </div>
                  )}

                  {showPlayerName && (
                    <span
                      className="truncate font-medium"
                      style={{
                        color: isCurrentPlayer
                          ? '#fef08a'
                          : style.textColor || '#f8fafc',
                      }}
                    >
                      {entry.player_name || 'Player'}
                      {isCurrentPlayer && (
                        <span className="ml-1 text-[10px] text-amber-400/90 font-mono font-normal">
                          (You)
                        </span>
                      )}
                    </span>
                  )}
                </div>

                {/* Middle: Optional Extended Stats (Moves, Time, Accuracy) */}
                <div className="flex items-center gap-2 shrink-0">
                  {showMoves && entry.metadata?.moves !== undefined && (
                    <span
                      className="font-mono text-cyan-400 text-right"
                      style={{ fontSize: statFontSize }}
                      title="Moves"
                    >
                      {entry.metadata.moves}m
                    </span>
                  )}
                  {showTime &&
                    (entry.metadata?.duration !== undefined ||
                      entry.metadata?.timeElapsedSeconds !== undefined) && (
                      <span
                        className="font-mono text-sky-400 text-right"
                        style={{ fontSize: statFontSize }}
                        title="Duration"
                      >
                        {entry.metadata.duration ?? entry.metadata.timeElapsedSeconds}s
                      </span>
                    )}
                  {showAccuracy && entry.metadata?.accuracyPercent !== undefined && (
                    <span
                      className="font-mono text-purple-400 text-right"
                      style={{ fontSize: statFontSize }}
                      title="Accuracy"
                    >
                      {entry.metadata.accuracyPercent}%
                    </span>
                  )}

                  {/* Right: Score */}
                  {showScore && (
                    <span
                      className="font-mono font-black text-right shrink-0"
                      style={{
                        color: style.scoreColor || '#fbbf24',
                      }}
                    >
                      {isReactionGame || entry.metadata?.gameType === 'reaction-time' || entry.metadata?.reactionTimeMs !== undefined
                        ? `${entry.score} ms`
                        : Number(entry.score || 0).toLocaleString()}
                    </span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Integrated Player Submission Section (Always Included in Leaderboard Element) */}
      <div
        className="mt-2 pt-2 border-t border-slate-800/80 shrink-0 select-auto"
        onClick={(e) => isEditor && e.stopPropagation()}
      >
        {isEventPreview && !isEventTest ? (
          <div className="p-2 min-h-[38px] sm:min-h-[44px] rounded-lg bg-amber-500/10 border border-amber-500/30 flex flex-col justify-center gap-0.5 text-left px-2.5">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1 text-amber-400 font-bold text-xs uppercase tracking-wide">
                <Trophy className="w-3.5 h-3.5 text-amber-400 shrink-0" /> PREVIEW SCORE: {stats?.score !== undefined ? stats.score.toLocaleString() : 0}
              </span>
              <span className="text-[9px] text-amber-300/80 font-mono uppercase bg-amber-500/20 px-1.5 py-0.5 rounded border border-amber-500/30">
                Studio Preview
              </span>
            </div>
            <p className="text-[10px] text-slate-300">
              This is a studio preview score. It will not be added to the live event leaderboard.
            </p>
          </div>
        ) : !isSubmitted ? (
          <form
            onSubmit={handleScoreSubmit}
            className="space-y-1.5"
          >
            {isEventTest && (
              <div className="p-1.5 rounded bg-amber-500/10 border border-amber-500/30 text-[9px] text-amber-300 flex items-center justify-between">
                <span className="font-bold flex items-center gap-1">
                  <Trophy className="w-3 h-3 text-amber-400 shrink-0" />
                  PRE-EVENT TEST MODE
                </span>
                <span className="text-slate-400 text-[8px]">Cleared on event start</span>
              </div>
            )}
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                value={localName}
                onChange={(e) => {
                  setLocalName(e.target.value);
                  if (localError) setLocalError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    e.stopPropagation();
                    handleScoreSubmit();
                  }
                }}
                placeholder={inputPlaceholder}
                maxLength={inputMaxLength}
                disabled={isSubmitting || isEditor}
                className="flex-1 min-w-0 bg-slate-950/90 border border-slate-700/80 focus:border-amber-500 rounded-lg px-3 py-1.5 min-h-[38px] sm:min-h-[44px] text-slate-100 placeholder:text-slate-500 outline-none transition-colors disabled:opacity-50"
                style={{ fontSize: statFontSize }}
              />
              <button
                type="submit"
                disabled={isSubmitting || isEditor}
                className="px-3.5 py-1.5 min-h-[38px] sm:min-h-[44px] bg-amber-500 hover:bg-amber-400 active:bg-amber-600 disabled:opacity-50 text-slate-950 font-black uppercase tracking-wider rounded-lg transition-all shadow-md shadow-amber-500/20 flex items-center justify-center gap-1.5 shrink-0 cursor-pointer disabled:cursor-not-allowed"
                style={{ fontSize: statFontSize }}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Submitting...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5" />
                    <span>{submitButtonText}</span>
                  </>
                )}
              </button>
            </div>

            {effectiveError && (
              <div className="flex items-center gap-1 text-rose-400 text-[10px] pl-0.5 animate-in fade-in duration-150">
                <AlertCircle className="w-3 h-3 shrink-0" />
                <span>{effectiveError}</span>
              </div>
            )}
          </form>
        ) : (
          <div className="p-2 min-h-[38px] sm:min-h-[44px] rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-between gap-2 text-emerald-400 font-semibold px-2.5">
            <div className="flex items-center gap-1.5 truncate">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
              <span className="truncate text-xs" style={{ fontSize: statFontSize }}>
                {successMessage}
              </span>
            </div>
            {effectiveRank && (
              <div className="shrink-0 font-mono text-xs font-black bg-emerald-500/20 px-2 py-0.5 rounded text-emerald-300">
                Your Rank: #{effectiveRank}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export const ResultElementContent: React.FC<ResultElementContentProps> = ({
  element: el,
  parentWidth,
  parentHeight,
  stats,
  isSimulation = false,
  isEditor = false,
  isEventPreview = false,
  isEventTest = false,
  onAction,
  renderChild,
  leaderboardData,
  loadingLeaderboard = false,
  leaderboardError = null,
  currentPlayerName,
  currentEntryId,
  scoreSubmitted = false,
  submittedRank = null,
  isSubmittingScore = false,
  submissionError = null,
  onSubmitScore,
}) => {
  switch (el.type) {
    case 'card': {
      const cardEl = el as ResultCardElement;
      const style = cardEl.style;
      return (
        <div
          style={{
            width: '100%',
            height: '100%',
            backgroundColor: style?.backgroundColor || 'rgba(15, 23, 42, 0.95)',
            backgroundImage: style?.backgroundImageUrl ? `url(${style.backgroundImageUrl})` : undefined,
            backgroundSize: style?.backgroundSize || 'cover',
            backgroundPosition: style?.backgroundPosition || 'center',
            backgroundRepeat: style?.backgroundRepeat || 'no-repeat',
            borderWidth: typeof style?.borderWidth === 'number' ? `${(style.borderWidth / parentWidth) * 100}cqi` : '1px',
            borderStyle: (style?.borderWidth ?? 1) > 0 ? 'solid' : 'none',
            borderColor: style?.borderColor || '#334155',
            borderRadius: typeof style?.borderRadius === 'number' ? `${(style.borderRadius / parentWidth) * 100}cqi` : '24px',
            boxShadow:
              style?.shadow !== false
                ? '0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.05)'
                : undefined,
            opacity: typeof style?.opacity === 'number' ? style.opacity : undefined,
            backdropFilter: 'blur(12px)',
            position: 'relative',
            overflow: 'hidden',
            containerType: 'inline-size',
          }}
          className="transition-all"
        >
          {Array.isArray(cardEl.children) &&
            renderChild &&
            cardEl.children.map((child) => renderChild(child, cardEl.width, cardEl.height))}
        </div>
      );
    }

    case 'group': {
      const groupEl = el as ResultGroupElement;
      return (
        <div className="w-full h-full relative" style={{ containerType: 'inline-size' }}>
          {Array.isArray(groupEl.children) &&
            renderChild &&
            groupEl.children.map((child) => renderChild(child, groupEl.width, groupEl.height))}
        </div>
      );
    }

    case 'text': {
      const textEl = el as ResultTextElement;
      const textStyle = textEl.style;

      // Vertical alignment mapping
      const verticalAlign = textStyle?.verticalAlign || 'center';
      const alignItems =
        verticalAlign === 'top'
          ? 'flex-start'
          : verticalAlign === 'bottom'
          ? 'flex-end'
          : 'center';

      // Horizontal alignment mapping
      const textAlign = textStyle?.textAlign || 'center';
      const justifyContent =
        textAlign === 'left'
          ? 'flex-start'
          : textAlign === 'right'
          ? 'flex-end'
          : textAlign === 'justify'
          ? 'stretch'
          : 'center';

      const fontSize = textStyle?.fontSize
        ? `clamp(6px, ${(textStyle.fontSize / parentWidth) * 100}cqi, 200px)`
        : 'clamp(10px, 3.2cqi, 48px)';

      const letterSpacing =
        typeof textStyle?.letterSpacing === 'number'
          ? `${(textStyle.letterSpacing / parentWidth) * 100}cqi`
          : undefined;

      return (
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems,
            justifyContent,
            overflow: 'hidden',
            boxSizing: 'border-box',
            padding: '2px',
          }}
          className="select-none pointer-events-none"
        >
          <div
            style={{
              width: '100%',
              maxWidth: '100%',
              color: textStyle?.color || '#ffffff',
              fontFamily: textStyle?.fontFamily || 'inherit',
              fontSize,
              fontWeight: textStyle?.fontWeight || 'bold',
              fontStyle: textStyle?.fontStyle || 'normal',
              lineHeight: textStyle?.lineHeight ?? 1.2,
              letterSpacing,
              textTransform: textStyle?.textTransform || 'none',
              textDecoration: textStyle?.textDecoration || 'none',
              textShadow: textStyle?.textShadow || undefined,
              textAlign,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              overflowWrap: 'break-word',
              opacity: typeof textStyle?.opacity === 'number' ? textStyle.opacity : undefined,
            }}
          >
            {textEl.text}
          </div>
        </div>
      );
    }

    case 'image': {
      const imgEl = el as ResultImageElement;
      const style = imgEl.style;
      const objectFit = style?.objectFit || imgEl.objectFit || 'contain';
      const objectPosition = style?.objectPosition || imgEl.objectPosition || 'center';
      const borderRadius =
        typeof style?.borderRadius === 'number'
          ? `${(style.borderRadius / parentWidth) * 100}cqi`
          : undefined;
      const borderWidth =
        typeof style?.borderWidth === 'number'
          ? `${(style.borderWidth / parentWidth) * 100}cqi`
          : undefined;
      const borderColor = style?.borderColor || undefined;
      const shadow = style?.shadow
        ? '0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.05)'
        : undefined;
      const opacity = typeof style?.opacity === 'number' ? style.opacity : undefined;

      return (
        <div
          style={{
            width: '100%',
            height: '100%',
            borderRadius,
            borderWidth,
            borderColor,
            borderStyle: borderWidth ? 'solid' : undefined,
            boxShadow: shadow,
            opacity,
            overflow: 'hidden',
          }}
          className="w-full h-full flex items-center justify-center pointer-events-none select-none"
        >
          {imgEl.imageUrl ? (
            <img
              src={imgEl.imageUrl}
              alt=""
              className="w-full h-full select-none pointer-events-none"
              style={{
                objectFit,
                objectPosition,
                borderRadius,
              }}
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-slate-800/40 rounded-xl text-slate-500 border border-slate-700/50">
              <ImageIcon className="w-8 h-8 opacity-40" />
            </div>
          )}
        </div>
      );
    }

    case 'score':
    case 'moves':
    case 'pairs':
    case 'time':
    case 'accuracy':
    case 'average-reaction':
    case 'best-reaction':
    case 'worst-reaction':
    case 'rating': {
      const statEl = el as
        | ResultScoreElement
        | ResultMovesElement
        | ResultPairsElement
        | ResultTimeElement
        | ResultAccuracyElement
        | ResultAverageReactionElement
        | ResultBestReactionElement
        | ResultWorstReactionElement
        | ResultRatingElement;
      const style = statEl.style;

      // Extract default labels & values
      let defaultLabel = 'STAT';
      let defaultValueColor = '#fbbf24';
      let valueDisplay = '0';

      const isReaction =
        stats?.gameType === 'reaction-time' ||
        stats?.gameType === 'reaction-tap' ||
        stats?.averageReactionTimeMs !== undefined;

      if (el.type === 'score') {
        defaultLabel = 'SCORE';
        defaultValueColor = '#fbbf24';
        if (isReaction && stats?.score !== undefined) {
          valueDisplay = `${stats.score} ms`;
        } else if (isReaction) {
          valueDisplay = '219 ms';
        } else {
          valueDisplay = stats?.score !== undefined ? stats.score.toLocaleString() : '1,250';
        }
      } else if (el.type === 'moves') {
        defaultLabel = 'MOVES';
        defaultValueColor = '#67e8f9';
        valueDisplay = stats?.moves !== undefined ? String(stats.moves) : '14';
      } else if (el.type === 'pairs') {
        defaultLabel = 'PAIRS';
        defaultValueColor = '#34d399';
        valueDisplay =
          stats?.matchedPairsCount !== undefined
            ? `${stats.matchedPairsCount}/${stats.totalPairs}`
            : '8/8';
      } else if (el.type === 'time') {
        defaultLabel = 'TIME';
        defaultValueColor = '#38bdf8';
        valueDisplay =
          stats?.timeElapsedSeconds !== undefined
            ? `${stats.timeElapsedSeconds}s`
            : '24s';
      } else if (el.type === 'accuracy') {
        defaultLabel = 'ACCURACY';
        defaultValueColor = '#c084fc';
        valueDisplay =
          stats?.accuracyPercent !== undefined
            ? `${stats.accuracyPercent}%`
            : '88%';
      } else if (el.type === 'average-reaction') {
        defaultLabel = 'AVERAGE REACTION';
        defaultValueColor = '#38bdf8';
        valueDisplay =
          stats?.averageReactionTimeMs !== undefined
            ? `${stats.averageReactionTimeMs} ms`
            : '219 ms';
      } else if (el.type === 'best-reaction') {
        defaultLabel = 'BEST REACTION';
        defaultValueColor = '#34d399';
        valueDisplay =
          stats?.bestReactionTimeMs !== undefined
            ? `${stats.bestReactionTimeMs} ms`
            : '195 ms';
      } else if (el.type === 'worst-reaction') {
        defaultLabel = 'WORST REACTION';
        defaultValueColor = '#f87171';
        valueDisplay =
          stats?.worstReactionTimeMs !== undefined
            ? `${stats.worstReactionTimeMs} ms`
            : '247 ms';
      } else if (el.type === 'rating') {
        defaultLabel = 'RATING';
        defaultValueColor = '#fbbf24';
        valueDisplay = stats?.rating || 'SUPERHUMAN';
      }

      const labelText = statEl.label || defaultLabel;
      const isHorizontal = style?.layout === 'horizontal';

      // Alignment handling
      const textAlign = style?.textAlign || 'center';
      const verticalAlign = style?.verticalAlign || 'center';

      let containerAlignItems = 'center';
      let containerJustifyContent = 'center';

      if (!isHorizontal) {
        // Vertical layout (column)
        containerAlignItems =
          textAlign === 'left' ? 'flex-start' : textAlign === 'right' ? 'flex-end' : 'center';
        containerJustifyContent =
          verticalAlign === 'top'
            ? 'flex-start'
            : verticalAlign === 'bottom'
            ? 'flex-end'
            : 'center';
      } else {
        // Horizontal layout (row)
        containerJustifyContent =
          textAlign === 'left' ? 'flex-start' : textAlign === 'right' ? 'flex-end' : 'center';
        containerAlignItems =
          verticalAlign === 'top'
            ? 'flex-start'
            : verticalAlign === 'bottom'
            ? 'flex-end'
            : 'center';
      }

      // Label Typography
      const labelFontFamily = style?.labelFontFamily || 'inherit';
      const labelFontSize = style?.labelFontSize
        ? `clamp(6px, ${(style.labelFontSize / parentWidth) * 100}cqi, 80px)`
        : 'clamp(8px, 1.2cqi, 24px)';
      const labelFontWeight = style?.labelFontWeight || 'bold';
      const labelFontStyle = style?.labelFontStyle || 'normal';
      const labelColor = style?.labelColor || '#94a3b8';
      const labelLetterSpacing =
        typeof style?.labelLetterSpacing === 'number'
          ? `${(style.labelLetterSpacing / parentWidth) * 100}cqi`
          : '0.05em';
      const labelTextTransform = style?.labelTextTransform || 'uppercase';

      // Value Typography
      const valueFontFamily = style?.valueFontFamily || 'monospace';
      const valueFontSize = style?.valueFontSize
        ? `clamp(8px, ${(style.valueFontSize / parentWidth) * 100}cqi, 160px)`
        : style?.fontSize
        ? `clamp(8px, ${(style.fontSize / parentWidth) * 100}cqi, 160px)`
        : 'clamp(12px, 2.2cqi, 64px)';
      const valueFontWeight = style?.valueFontWeight || '900';
      const valueFontStyle = style?.valueFontStyle || 'normal';
      const valueColor = style?.valueColor || defaultValueColor;
      const valueLetterSpacing =
        typeof style?.valueLetterSpacing === 'number'
          ? `${(style.valueLetterSpacing / parentWidth) * 100}cqi`
          : undefined;
      const valueTextTransform = style?.valueTextTransform || 'none';
      const valueLineHeight = style?.valueLineHeight ?? 1;

      return (
        <div
          style={{
            width: '100%',
            height: '100%',
            backgroundColor: style?.backgroundColor || 'rgba(2, 6, 23, 0.85)',
            borderColor: style?.borderColor || '#334155',
            borderWidth:
              typeof style?.borderWidth === 'number'
                ? `${(style.borderWidth / parentWidth) * 100}cqi`
                : '1px',
            borderStyle: style?.borderWidth === 0 ? 'none' : 'solid',
            borderRadius:
              typeof style?.borderRadius === 'number'
                ? `${(style.borderRadius / parentWidth) * 100}cqi`
                : '16px',
            display: 'flex',
            flexDirection: isHorizontal ? 'row' : 'column',
            alignItems: containerAlignItems,
            justifyContent: containerJustifyContent,
            gap:
              typeof style?.gap === 'number'
                ? `${style.gap}px`
                : isHorizontal
                ? '8px'
                : '2px',
            padding: '4px 8px',
            boxSizing: 'border-box',
            overflow: 'hidden',
          }}
          className="shadow-inner pointer-events-none select-none"
        >
          {style?.showLabel !== false && (
            <span
              style={{
                color: labelColor,
                fontFamily: labelFontFamily,
                fontSize: labelFontSize,
                fontWeight: labelFontWeight,
                fontStyle: labelFontStyle,
                letterSpacing: labelLetterSpacing,
                textTransform: labelTextTransform,
                textShadow: style?.labelTextShadow || undefined,
                textAlign,
                lineHeight: 1.2,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                overflowWrap: 'break-word',
                maxWidth: isHorizontal ? '50%' : '100%',
              }}
              className="block truncate"
            >
              {labelText}
            </span>
          )}
          <span
            style={{
              color: valueColor,
              fontFamily: valueFontFamily,
              fontSize: valueFontSize,
              fontWeight: valueFontWeight,
              fontStyle: valueFontStyle,
              letterSpacing: valueLetterSpacing,
              textTransform: valueTextTransform,
              lineHeight: valueLineHeight,
              textShadow: style?.valueTextShadow || undefined,
              textAlign,
              whiteSpace: 'nowrap',
              wordBreak: 'break-word',
              overflowWrap: 'break-word',
              maxWidth: isHorizontal && style?.showLabel !== false ? '50%' : '100%',
            }}
            className="block tracking-tight truncate"
          >
            {valueDisplay}
          </span>
        </div>
      );
    }

    case 'round-results': {
      const roundEl = el as ResultRoundResultsElement;
      const style = roundEl.style;
      const labelText = roundEl.label || 'ROUND RESULTS';
      const rounds = stats?.rounds || [
        { round: 1, reactionTimeMs: 218 },
        { round: 2, reactionTimeMs: 231 },
        { round: 3, reactionTimeMs: 195 },
        { round: 4, reactionTimeMs: 247 },
        { round: 5, reactionTimeMs: 204 },
      ];

      return (
        <div
          className="w-full h-full flex flex-col justify-center items-center select-none overflow-hidden px-2 py-1 shadow-inner pointer-events-none"
          style={{
            backgroundColor: style?.backgroundColor || 'rgba(2, 6, 23, 0.85)',
            border:
              typeof style?.borderWidth === 'number' && style.borderWidth > 0
                ? `${(style.borderWidth / parentWidth) * 100}cqi solid ${style.borderColor || '#334155'}`
                : '1px solid #334155',
            borderRadius:
              typeof style?.borderRadius === 'number'
                ? `${(style.borderRadius / parentWidth) * 100}cqi`
                : '16px',
          }}
        >
          {style?.showLabel !== false && (
            <div
              className="font-bold uppercase tracking-wider mb-1"
              style={{
                fontSize: 'clamp(9px, 1.2cqi, 16px)',
                color: style?.labelColor || '#94a3b8',
              }}
            >
              {labelText}
            </div>
          )}
          <div className="flex items-center justify-center gap-1.5 flex-wrap w-full">
            {rounds.map((r) => {
              const isFalseStart = r.falseStart;
              return (
                <div
                  key={r.round}
                  className={`px-2 py-0.5 rounded-lg font-mono text-center shrink-0 border ${
                    isFalseStart
                      ? 'bg-rose-500/20 text-rose-400 border-rose-500/40'
                      : 'bg-slate-900/90 text-slate-200 border-slate-700/80'
                  }`}
                  style={{ fontSize: 'clamp(9px, 1.3cqi, 18px)' }}
                >
                  <span className="text-[10px] text-slate-400 mr-1 font-sans">R{r.round}:</span>
                  <span className="font-black text-amber-400">
                    {isFalseStart ? 'JUMP' : `${r.reactionTimeMs}ms`}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      );
    }

    case 'button': {
      const btnEl = el as ResultButtonElement;
      const style = btnEl.style;

      const fontSize = style?.fontSize
        ? `clamp(8px, ${(style.fontSize / parentWidth) * 100}cqi, 100px)`
        : 'clamp(10px, 1.4cqi, 32px)';

      const letterSpacing =
        typeof style?.letterSpacing === 'number'
          ? `${(style.letterSpacing / parentWidth) * 100}cqi`
          : '0.05em';

      const commonButtonStyles: React.CSSProperties = {
        width: '100%',
        height: '100%',
        backgroundColor: style?.backgroundColor || '#f59e0b',
        color: style?.textColor || '#020617',
        borderColor: style?.borderColor,
        borderWidth:
          typeof style?.borderWidth === 'number'
            ? `${(style.borderWidth / parentWidth) * 100}cqi`
            : undefined,
        borderStyle:
          typeof style?.borderWidth === 'number' && style.borderWidth > 0 ? 'solid' : undefined,
        borderRadius:
          typeof style?.borderRadius === 'number'
            ? `${(style.borderRadius / parentWidth) * 100}cqi`
            : '18px',
        fontFamily: style?.fontFamily || 'inherit',
        fontSize,
        fontWeight: style?.fontWeight || '900',
        fontStyle: style?.fontStyle || 'normal',
        letterSpacing,
        textTransform: style?.textTransform || 'uppercase',
        textShadow: style?.textShadow || undefined,
        boxShadow:
          style?.shadow !== false ? '0 10px 25px -5px rgba(245, 158, 11, 0.4)' : undefined,
        opacity: typeof style?.opacity === 'number' ? style.opacity : undefined,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '8px',
        cursor: isSimulation || isEditor ? 'default' : 'pointer',
        padding: '4px 12px',
        boxSizing: 'border-box',
        overflow: 'hidden',
      };

      const buttonInner = (
        <>
          {btnEl.action === 'playAgain' && <RotateCcw className="w-4 h-4 shrink-0" />}
          {btnEl.action === 'exit' && <LogOut className="w-4 h-4 shrink-0" />}
          <span className="truncate">{btnEl.text}</span>
        </>
      );

      // In the Visual Editor, render as non-blocking visual element allowing parent canvas element wrapper to handle drag/select
      if (isEditor) {
        return (
          <div
            style={commonButtonStyles}
            className="select-none pointer-events-none"
          >
            {buttonInner}
          </div>
        );
      }

      // In Live Gameplay / Simulation, render as native interactive button
      return (
        <button
          type="button"
          onClick={() => onAction?.(btnEl.action)}
          disabled={isSimulation}
          style={commonButtonStyles}
          className="transition-all hover:brightness-110 active:scale-95 select-none"
        >
          {buttonInner}
        </button>
      );
    }

    case 'leaderboard': {
      return (
        <LeaderboardElementRenderer
          lbEl={el as ResultLeaderboardElement}
          parentWidth={parentWidth}
          parentHeight={parentHeight}
          stats={stats}
          isSimulation={isSimulation}
          isEditor={isEditor}
          isEventPreview={isEventPreview}
          isEventTest={isEventTest}
          leaderboardData={leaderboardData}
          loadingLeaderboard={loadingLeaderboard}
          leaderboardError={leaderboardError}
          currentPlayerName={currentPlayerName}
          currentEntryId={currentEntryId}
          scoreSubmitted={scoreSubmitted}
          submittedRank={submittedRank}
          isSubmittingScore={isSubmittingScore}
          submissionError={submissionError}
          onSubmitScore={onSubmitScore}
        />
      );
    }

    default:
      return null;
  }
};
