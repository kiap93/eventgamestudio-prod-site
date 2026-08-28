import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Trophy,
  RotateCcw,
  Volume2,
  VolumeX,
  Pause,
  Play,
  Sparkles,
  Clock,
  Flame,
  Maximize2,
  Minimize2,
  CheckCircle2,
  Send,
  Star,
  Award,
  Zap,
  Grid3X3,
  Ticket,
  ShoppingBag,
  PartyPopper,
  Disc,
  Tent,
  Gift,
  HelpCircle,
  Medal,
} from 'lucide-react';
import { GameComponentProps } from '../types';
import { MemoryCard, MemoryMatchConfig } from './types';
import { createShuffledDeck } from './cardDeck';
import { memorySounds } from './memorySounds';
import { GameState, GameStats, EventLeaderboardEntry } from '../../types';
import { getMemoryMatchConfig } from '../../themes/types';
import { apiFetch } from '../../lib/api';

import {
  calculateMemoryMatchScore,
  MEMORY_MATCH_GAME_VERSION,
  MEMORY_MATCH_SCORING_VERSION,
} from './scoring';

// Icon resolver helper for cards
const renderCardIcon = (iconName?: string, className: string = 'w-8 h-8') => {
  switch (iconName) {
    case 'Ticket':
      return <Ticket className={className} />;
    case 'Sparkles':
      return <Sparkles className={className} />;
    case 'Star':
      return <Star className={className} />;
    case 'ShoppingBag':
      return <ShoppingBag className={className} />;
    case 'Tent':
      return <Tent className={className} />;
    case 'PartyPopper':
      return <PartyPopper className={className} />;
    case 'Trophy':
      return <Trophy className={className} />;
    case 'Disc':
      return <Disc className={className} />;
    case 'Flame':
      return <Flame className={className} />;
    default:
      return <Gift className={className} />;
  }
};

export const MemoryMatchGame: React.FC<GameComponentProps<MemoryMatchConfig>> = ({
  activeTheme,
  settings,
  config,
  eventId,
  publicToken,
  onStatsChange,
  onGameStateChange,
  isMuted = false,
  isFullscreen = false,
  onToggleFullscreen,
  onToggleMute,
}) => {
  const memoryConfig = getMemoryMatchConfig(activeTheme);
  const gameDuration = config?.gameDurationSeconds ?? settings?.gameDurationSeconds ?? memoryConfig.gameplay.gameDurationSeconds ?? 45;
  const mismatchDelay = config?.mismatchDelayMs ?? memoryConfig.gameplay.mismatchDelayMs ?? 850;
  const matchPoints = config?.matchPoints ?? memoryConfig.gameplay.matchPoints ?? 100;
  const comboPoints = config?.comboPoints ?? memoryConfig.gameplay.comboPoints ?? 30;
  const cardBackUrl = memoryConfig.cardBackUrl;

  const [gameState, setGameState] = useState<GameState>('START');

  const [countdown, setCountdown] = useState<number>(3);
  const [cards, setCards] = useState<MemoryCard[]>([]);
  const [flippedIndices, setFlippedIndices] = useState<number[]>([]);
  const [isLocked, setIsLocked] = useState<boolean>(false);

  // Score & Metrics
  const [score, setScore] = useState<number>(0);
  const [moves, setMoves] = useState<number>(0);
  const [matchedPairsCount, setMatchedPairsCount] = useState<number>(0);
  const [comboStreak, setComboStreak] = useState<number>(0);
  const [maxComboStreak, setMaxComboStreak] = useState<number>(0);
  const [timeRemaining, setTimeRemaining] = useState<number>(gameDuration);
  const [isVictory, setIsVictory] = useState<boolean>(false);
  const [sessionId, setSessionId] = useState<string>(() => `mm_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`);

  // Leaderboard / Score Submission
  const [playerName, setPlayerName] = useState<string>(() => {
    return localStorage.getItem('event_player_name') || '';
  });
  const [isSubmittingScore, setIsSubmittingScore] = useState(false);
  const [scoreSubmitted, setScoreSubmitted] = useState(false);
  const [submittedRank, setSubmittedRank] = useState<number | null>(null);
  const [leaderboardScores, setLeaderboardScores] = useState<EventLeaderboardEntry[]>([]);
  const [loadingLeaderboard, setLoadingLeaderboard] = useState(false);
  const [activeEndTab, setActiveEndTab] = useState<'summary' | 'leaderboard'>('summary');

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const countdownTimerRef = useRef<NodeJS.Timeout | null>(null);
  const hasEventContext = Boolean(publicToken || (eventId && eventId !== 'undefined' && eventId !== 'null'));

  // Stable callback and state refs to prevent premature timer teardowns
  const onGameStateChangeRef = useRef(onGameStateChange);
  useEffect(() => {
    onGameStateChangeRef.current = onGameStateChange;
  }, [onGameStateChange]);

  const onStatsChangeRef = useRef(onStatsChange);
  useEffect(() => {
    onStatsChangeRef.current = onStatsChange;
  }, [onStatsChange]);

  const timeRemainingRef = useRef(timeRemaining);
  timeRemainingRef.current = timeRemaining;
  const movesRef = useRef(moves);
  movesRef.current = moves;
  const matchedPairsCountRef = useRef(matchedPairsCount);
  matchedPairsCountRef.current = matchedPairsCount;

  // Sync sound settings
  useEffect(() => {
    memorySounds.setMuted(isMuted || settings?.soundEnabled === false);
    memorySounds.setVolume(settings?.volume ?? 0.8);
  }, [isMuted, settings]);

  // Sync game state to parent
  const updateGameState = useCallback((newState: GameState) => {
    setGameState(newState);
    onGameStateChangeRef.current?.(newState);
  }, []);

  // Sync stats to parent
  useEffect(() => {
    const stats: GameStats = {
      score,
      highScore: 0,
      greenCaught: matchedPairsCount, // Matched pairs
      orangeCaught: moves, // Total moves
      goldenCaught: comboStreak, // Current streak
      duriansMissed: Math.max(0, moves - matchedPairsCount), // Mismatches
      timeRemaining,
      itemsCaughtById: {
        pairs: matchedPairsCount,
        moves,
      },
    };
    onStatsChangeRef.current?.(stats);
  }, [score, matchedPairsCount, moves, comboStreak, timeRemaining]);

  // Initialize fresh card deck on theme change or mount
  const initBoard = useCallback(() => {
    const newDeck = createShuffledDeck(activeTheme);
    setCards(newDeck);
    setFlippedIndices([]);
    setIsLocked(false);
    setScore(0);
    setMoves(0);
    setMatchedPairsCount(0);
    setComboStreak(0);
    setMaxComboStreak(0);
    setTimeRemaining(gameDuration);
    setIsVictory(false);
    setScoreSubmitted(false);
    setSubmittedRank(null);
    setSessionId(`mm_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`);
  }, [activeTheme, gameDuration]);

  useEffect(() => {
    initBoard();
  }, [initBoard]);

  // Main countdown trigger (3.. 2.. 1.. GO!)
  const startCountdown = useCallback(() => {
    initBoard();
    setCountdown(3);
    updateGameState('COUNTDOWN');
  }, [initBoard, updateGameState]);

  // Dedicated countdown effect (3 -> 2 -> 1 -> PLAYING)
  useEffect(() => {
    if (gameState !== 'COUNTDOWN') {
      if (countdownTimerRef.current) {
        clearInterval(countdownTimerRef.current);
        countdownTimerRef.current = null;
      }
      return;
    }

    let current = 3;
    setCountdown(3);
    memorySounds.playTick(false);

    const interval = setInterval(() => {
      current -= 1;
      if (current > 0) {
        setCountdown(current);
        memorySounds.playTick(false);
      } else {
        clearInterval(interval);
        countdownTimerRef.current = null;
        memorySounds.playTick(true);
        setGameState('PLAYING');
        onGameStateChangeRef.current?.('PLAYING');
      }
    }, 1000);

    countdownTimerRef.current = interval;

    return () => {
      clearInterval(interval);
      countdownTimerRef.current = null;
    };
  }, [gameState]);

  // High score submission
  const fetchLeaderboard = useCallback(async () => {
    if (!hasEventContext) {
      try {
        const raw = localStorage.getItem('arcade_local_leaderboard');
        if (raw) {
          const parsed = JSON.parse(raw);
          setLeaderboardScores(Array.isArray(parsed) ? parsed : []);
        }
      } catch {
        setLeaderboardScores([]);
      }
      return;
    }

    setLoadingLeaderboard(true);
    try {
      const url = publicToken
        ? `/api/public/events/${publicToken}/high-scores?limit=50`
        : `/api/events/${eventId}/high-scores?limit=50`;
      const res = await apiFetch(url);
      if (res.ok) {
        const data = await res.json();
        setLeaderboardScores(data.scores || []);
      }
    } catch (err) {
      console.warn('Leaderboard fetch error:', err);
    } finally {
      setLoadingLeaderboard(false);
    }
  }, [hasEventContext, publicToken, eventId]);

  // Handle Game Over / Victory
  const handleGameOver = useCallback(
    (won: boolean) => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      setIsVictory(won);
      setGameState('GAME_OVER');
      onGameStateChangeRef.current?.('GAME_OVER');

      const finalDuration = Math.max(1, gameDuration - timeRemainingRef.current);
      const finalPairs = won ? 8 : matchedPairsCountRef.current;
      const finalScore = calculateMemoryMatchScore({
        moves: movesRef.current,
        duration: finalDuration,
        matchedPairs: finalPairs,
        totalPairs: 8,
      });

      setScore(finalScore);

      if (won) {
        memorySounds.playVictory();
      } else {
        memorySounds.playMismatch();
      }

      fetchLeaderboard();
    },
    [gameDuration, fetchLeaderboard]
  );

  // Playing state game duration timer
  useEffect(() => {
    if (gameState !== 'PLAYING') {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    const interval = setInterval(() => {
      const current = timeRemainingRef.current;
      if (current <= 1) {
        clearInterval(interval);
        timerRef.current = null;
        setTimeRemaining(0);
        handleGameOver(false);
      } else {
        const next = current - 1;
        setTimeRemaining(next);
        if (next <= 5) {
          memorySounds.playTick(false);
        }
      }
    }, 1000);

    timerRef.current = interval;

    return () => {
      clearInterval(interval);
      timerRef.current = null;
    };
  }, [gameState, handleGameOver]);

  // Card Flip Click Handler
  const handleCardClick = (index: number) => {
    if (gameState !== 'PLAYING' || isLocked) return;

    const clickedCard = cards[index];
    if (!clickedCard || clickedCard.isFlipped || clickedCard.isMatched) return;

    // Flip the clicked card
    memorySounds.playCardFlip();
    const updatedCards = [...cards];
    updatedCards[index] = { ...clickedCard, isFlipped: true };
    setCards(updatedCards);

    const newFlipped = [...flippedIndices, index];
    setFlippedIndices(newFlipped);

    // If this is the 1st card flipped, wait for the second card
    if (newFlipped.length === 1) {
      return;
    }

    // If 2 cards are flipped, evaluate the match
    if (newFlipped.length === 2) {
      setIsLocked(true);
      const [firstIdx, secondIdx] = newFlipped;
      const firstCard = updatedCards[firstIdx];
      const secondCard = updatedCards[secondIdx];

      const newMoves = moves + 1;
      setMoves(newMoves);

      // Check for match
      if (firstCard.pairId === secondCard.pairId) {
        // MATCH SUCCESS!
        const newStreak = comboStreak + 1;
        setComboStreak(newStreak);
        setMaxComboStreak((prev) => Math.max(prev, newStreak));

        const streakBonus = (newStreak - 1) * comboPoints;
        const addedPoints = matchPoints + streakBonus;
        setScore((prev) => prev + addedPoints);

        memorySounds.playMatchSuccess(newStreak);

        setTimeout(() => {
          setCards((prevDeck) => {
            const nextDeck = [...prevDeck];
            nextDeck[firstIdx] = { ...nextDeck[firstIdx], isMatched: true };
            nextDeck[secondIdx] = { ...nextDeck[secondIdx], isMatched: true };
            return nextDeck;
          });

          const newMatchedCount = matchedPairsCount + 1;
          setMatchedPairsCount(newMatchedCount);
          setFlippedIndices([]);
          setIsLocked(false);

          // If all 8 pairs matched -> VICTORY!
          if (newMatchedCount >= 8) {
            handleGameOver(true);
          }
        }, 350);
      } else {
        // MATCH FAILED!
        setComboStreak(0);
        memorySounds.playMismatch();

        // Shake both cards
        setCards((prevDeck) => {
          const nextDeck = [...prevDeck];
          nextDeck[firstIdx] = { ...nextDeck[firstIdx], isShaking: true };
          nextDeck[secondIdx] = { ...nextDeck[secondIdx], isShaking: true };
          return nextDeck;
        });

        // Flip both back after mismatch delay
        setTimeout(() => {
          setCards((prevDeck) => {
            const nextDeck = [...prevDeck];
            nextDeck[firstIdx] = { ...nextDeck[firstIdx], isFlipped: false, isShaking: false };
            nextDeck[secondIdx] = { ...nextDeck[secondIdx], isFlipped: false, isShaking: false };
            return nextDeck;
          });
          setFlippedIndices([]);
          setIsLocked(false);
        }, mismatchDelay);
      }
    }
  };

  const handleSubmitScore = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (isSubmittingScore || scoreSubmitted) return;

    const trimmedName = playerName.trim() || 'Player';
    localStorage.setItem('event_player_name', trimmedName);
    setIsSubmittingScore(true);

    const metadataPayload = {
      gameType: 'memory-match',
      moves,
      matchedPairs: isVictory ? 8 : matchedPairsCount,
      totalPairs: 8,
      duration: Math.max(1, gameDuration - timeRemaining),
      isVictory,
      timeRemaining,
      sessionId,
      gameVersion: MEMORY_MATCH_GAME_VERSION,
      scoringVersion: MEMORY_MATCH_SCORING_VERSION,
    };

    if (!hasEventContext) {
      try {
        const localEntry: EventLeaderboardEntry = {
          id: 'local_' + Date.now(),
          event_id: 'studio-preview',
          player_name: trimmedName,
          score,
          metadata: metadataPayload,
          created_at: new Date().toISOString(),
          rank: 1,
        };

        const existingRaw = localStorage.getItem('arcade_local_leaderboard');
        let list: EventLeaderboardEntry[] = [];
        if (existingRaw) {
          try {
            list = JSON.parse(existingRaw);
          } catch {
            list = [];
          }
        }
        list.push(localEntry);
        list.sort((a, b) => b.score - a.score);
        const ranked = list.map((item, idx) => ({ ...item, rank: idx + 1 }));
        localStorage.setItem('arcade_local_leaderboard', JSON.stringify(ranked.slice(0, 50)));

        const myRank = ranked.findIndex((r) => r.id === localEntry.id) + 1;
        setScoreSubmitted(true);
        setSubmittedRank(myRank > 0 ? myRank : 1);
        setLeaderboardScores(ranked.slice(0, 50));
        setActiveEndTab('leaderboard');
      } finally {
        setIsSubmittingScore(false);
      }
      return;
    }

    try {
      const url = publicToken
        ? `/api/public/events/${publicToken}/high-scores`
        : `/api/events/${eventId}/high-scores`;

      const res = await apiFetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          player_name: trimmedName,
          score,
          metadata: metadataPayload,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setScoreSubmitted(true);
        setSubmittedRank(data.rank || 1);
        fetchLeaderboard();
        setActiveEndTab('leaderboard');
      }
    } catch (err) {
      console.error('Score submission error:', err);
    } finally {
      setIsSubmittingScore(false);
    }
  };

  const handlePause = () => {
    if (gameState === 'PLAYING') {
      memorySounds.playButtonClick();
      updateGameState('PAUSED');
    }
  };

  const handleResume = () => {
    if (gameState === 'PAUSED') {
      memorySounds.playButtonClick();
      updateGameState('PLAYING');
    }
  };

  const handleRestart = () => {
    memorySounds.playButtonClick();
    startCountdown();
  };

  const accuracyPercent = moves > 0 ? Math.min(100, Math.round((matchedPairsCount / moves) * 100)) : 0;
  const gameTitle = activeTheme?.branding?.gameTitle || activeTheme?.name || 'MEMORY MATCH';
  const customBgUrl = activeTheme?.background_url && activeTheme.background_url.trim() !== '' && !activeTheme.background_url.includes('carnival/background.png')
    ? activeTheme.background_url
    : null;

  return (
    <div
      className="relative w-full h-full min-h-0 flex flex-col items-center justify-between overflow-hidden select-none bg-[#07130b]"
      style={{
        backgroundColor: activeTheme?.visuals_config?.bgGradientTo || '#07130b',
        backgroundImage: customBgUrl
          ? `url(${customBgUrl})`
          : `radial-gradient(circle at 50% 20%, ${
              activeTheme?.visuals_config?.bgGradientFrom || 'rgba(30, 16, 53, 0.6)'
            } 0%, ${activeTheme?.visuals_config?.bgGradientTo || '#07130b'} 100%)`,
        backgroundSize: customBgUrl ? 'cover' : undefined,
        backgroundPosition: customBgUrl ? 'center' : undefined,
      }}
    >
      {/* ========================================================================= */}
      {/* 1. TOP HUD / HEADER BAR                                                   */}
      {/* ========================================================================= */}
      <header className="w-full h-11 sm:h-13 bg-slate-900/90 backdrop-blur-md border-b border-slate-800/80 px-3 sm:px-5 flex items-center justify-between z-20 shadow-md shrink-0">
        {/* Game Title & Theme Badge */}
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shrink-0">
            <Grid3X3 className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xs sm:text-sm font-black text-slate-100 uppercase tracking-wide truncate max-w-[120px] sm:max-w-[200px]">
              {gameTitle}
            </h1>
            <span className="hidden sm:inline-block text-[10px] text-amber-400 font-bold uppercase tracking-wider">
              4×4 Concentration
            </span>
          </div>
        </div>

        {/* Core HUD Metrics (Pairs Matched, Moves, Timer, Score) */}
        <div className="flex items-center gap-1.5 sm:gap-3 font-mono">
          {/* Pairs Matched */}
          <div className="flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-1 rounded-xl bg-slate-950/70 border border-slate-800 text-[11px] sm:text-xs">
            <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-slate-400 hidden xs:inline">Pairs:</span>
            <span className="font-bold text-emerald-400">
              {matchedPairsCount}
              <span className="text-slate-600">/8</span>
            </span>
          </div>

          {/* Moves */}
          <div className="flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-1 rounded-xl bg-slate-950/70 border border-slate-800 text-[11px] sm:text-xs">
            <RotateCcw className="w-3.5 h-3.5 text-cyan-400" />
            <span className="text-slate-400 hidden xs:inline">Moves:</span>
            <span className="font-bold text-cyan-300">{moves}</span>
          </div>

          {/* Timer */}
          <div
            className={`flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1 rounded-xl border text-[11px] sm:text-xs font-bold transition-colors ${
              timeRemaining <= 10
                ? 'bg-rose-500/20 border-rose-500/50 text-rose-400 animate-pulse'
                : 'bg-slate-950/70 border-slate-800 text-amber-400'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>{timeRemaining}s</span>
          </div>

          {/* Score */}
          <div className="flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3.5 py-1 rounded-xl bg-amber-500/10 border border-amber-500/40 text-[11px] sm:text-xs font-bold text-amber-300">
            <Trophy className="w-3.5 h-3.5 text-amber-400" />
            <span>{score}</span>
          </div>

          {/* Combo Streak Indicator */}
          {comboStreak > 1 && (
            <div className="hidden md:flex items-center gap-1 px-2 py-0.5 rounded-lg bg-orange-500/20 border border-orange-500/40 text-[10px] font-bold text-orange-400 animate-bounce">
              <Flame className="w-3 h-3 text-orange-400" />
              <span>{comboStreak}x</span>
            </div>
          )}
        </div>

        {/* Quick Controls (Mute, Pause, Restart, Fullscreen) */}
        <div className="flex items-center gap-1 sm:gap-1.5">
          {gameState === 'PLAYING' && (
            <button
              onClick={handlePause}
              className="p-1.5 sm:p-2 bg-slate-800/80 hover:bg-slate-700 text-slate-300 rounded-xl text-xs transition-colors cursor-pointer"
              title="Pause Game"
            >
              <Pause className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </button>
          )}

          {gameState === 'PAUSED' && (
            <button
              onClick={handleResume}
              className="p-1.5 sm:p-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs transition-colors cursor-pointer"
              title="Resume Game"
            >
              <Play className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </button>
          )}

          {(gameState === 'PLAYING' || gameState === 'PAUSED') && (
            <button
              onClick={handleRestart}
              className="p-1.5 sm:p-2 bg-slate-800/80 hover:bg-slate-700 text-slate-300 rounded-xl text-xs transition-colors cursor-pointer"
              title="Restart Board"
            >
              <RotateCcw className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </button>
          )}

          <button
            onClick={onToggleMute}
            className="p-1.5 sm:p-2 bg-slate-800/80 hover:bg-slate-700 text-slate-300 rounded-xl text-xs transition-colors cursor-pointer"
            title={isMuted ? 'Unmute Audio' : 'Mute Audio'}
          >
            {isMuted ? (
              <VolumeX className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-rose-400" />
            ) : (
              <Volume2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-400" />
            )}
          </button>

          {onToggleFullscreen && (
            <button
              onClick={onToggleFullscreen}
              className="p-1.5 sm:p-2 bg-slate-800/80 hover:bg-slate-700 text-slate-300 rounded-xl text-xs transition-colors cursor-pointer"
              title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
            >
              {isFullscreen ? (
                <Minimize2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              ) : (
                <Maximize2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              )}
            </button>
          )}
        </div>
      </header>

      {/* ========================================================================= */}
      {/* 2. MAIN 4x4 CARD BOARD GRID AREA (Fills available space, centered square)  */}
      {/* ========================================================================= */}
      <main className="flex-1 w-full min-h-0 flex items-center justify-center p-2 sm:p-4 md:p-6 relative overflow-hidden">
        <div className="w-full h-full max-h-[min(100%,660px)] max-w-[min(100%,660px)] aspect-square grid grid-cols-4 grid-rows-4 gap-2 sm:gap-3 md:gap-3.5 m-auto">
          {cards.map((card, index) => {
            const isFaceUp = card.isFlipped || card.isMatched;

            return (
              <div
                key={card.id}
                onClick={() => handleCardClick(index)}
                className={`relative w-full h-full cursor-pointer perspective-1000 select-none group transition-transform ${
                  card.isShaking ? 'animate-wobble' : ''
                }`}
                style={{ perspective: '1000px' }}
              >
                {/* Card 3D Inner Wrapper */}
                <div
                  className={`relative w-full h-full rounded-xl sm:rounded-2xl transition-transform duration-350 ease-out shadow-md ${
                    isFaceUp ? 'rotate-y-180' : 'hover:scale-[1.02] active:scale-[0.98]'
                  }`}
                  style={{
                    transformStyle: 'preserve-3d',
                    transform: isFaceUp ? 'rotateY(180deg)' : 'rotateY(0deg)',
                  }}
                >
                  {/* ------------------------------------------------------------- */}
                  {/* BACK FACE (Default Face-Down State)                           */}
                  {/* ------------------------------------------------------------- */}
                  <div
                    className="absolute inset-0 w-full h-full rounded-xl sm:rounded-2xl border p-1.5 sm:p-2 flex flex-col items-center justify-center overflow-hidden transition-all shadow-inner"
                    style={{
                      backfaceVisibility: 'hidden',
                      backgroundColor: activeTheme?.visuals_config?.cardBadBg || '#0f172a',
                      borderColor: activeTheme?.visuals_config?.cardBadBorder || '#334155',
                    }}
                  >
                    {cardBackUrl ? (
                      <img
                        src={cardBackUrl}
                        alt="Card Back"
                        className="max-h-[85%] max-w-[85%] object-contain filter drop-shadow-md pointer-events-none"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <>
                        <div className="absolute inset-1 rounded-lg border border-dashed border-slate-700/50 flex items-center justify-center pointer-events-none" />
                        <div className="w-6 h-6 sm:w-9 sm:h-9 rounded-xl bg-slate-950/80 border border-amber-500/30 flex items-center justify-center text-amber-400/80 group-hover:text-amber-300 group-hover:scale-110 transition-transform">
                          <Grid3X3 className="w-3.5 h-3.5 sm:w-5 sm:h-5" />
                        </div>
                      </>
                    )}
                  </div>


                  {/* ------------------------------------------------------------- */}
                  {/* FRONT FACE (Flipped Face-Up / Matched State)                  */}
                  {/* ------------------------------------------------------------- */}
                  <div
                    className={`absolute inset-0 w-full h-full rounded-xl sm:rounded-2xl border flex flex-col items-center justify-between p-1 sm:p-2 transition-all ${
                      card.isMatched
                        ? 'shadow-[0_0_15px_rgba(16,185,129,0.35)]'
                        : 'shadow-[0_0_12px_rgba(245,158,11,0.25)]'
                    }`}
                    style={{
                      backfaceVisibility: 'hidden',
                      transform: 'rotateY(180deg)',
                      backgroundColor: card.isMatched
                        ? activeTheme?.visuals_config?.cardGoodBg || 'rgba(6, 78, 59, 0.85)'
                        : card.bgColor || activeTheme?.visuals_config?.cardFrontBg || 'rgba(15, 23, 42, 0.95)',
                      borderColor: card.isMatched
                        ? activeTheme?.visuals_config?.cardGoodBorder || '#10b981'
                        : card.borderColor || activeTheme?.visuals_config?.cardBadBorder || '#f59e0b',
                    }}
                  >
                    {/* Top Right Matched Checkmark Badge */}
                    {card.isMatched && (
                      <div className="absolute top-1 right-1 sm:top-1.5 sm:right-1.5 w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-emerald-500 text-slate-950 flex items-center justify-center shadow-md animate-bounce">
                        <CheckCircle2 className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                      </div>
                    )}

                    {/* Card Image or Vector Icon */}
                    <div className="flex-1 w-full min-h-0 flex items-center justify-center p-0.5 sm:p-1">
                      {card.imageUrl ? (
                        <img
                          src={card.imageUrl}
                          alt={card.name}
                          className="max-h-[85%] max-w-[85%] object-contain drop-shadow-md transition-transform"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div
                          className="p-1.5 sm:p-2 rounded-xl flex items-center justify-center"
                          style={{ color: card.color || '#fbbf24' }}
                        >
                          {renderCardIcon(card.iconName, 'w-6 h-6 sm:w-9 sm:h-9')}
                        </div>
                      )}
                    </div>

                    {/* Card Title Label */}
                    <span className="text-[9px] sm:text-[11px] font-bold text-slate-100 text-center tracking-tight truncate max-w-full px-1">
                      {card.name}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* ======================================================================= */}
        {/* 3. START GAME OVERLAY                                                   */}
        {/* ======================================================================= */}
        {gameState === 'START' && (
          <div className="absolute inset-0 w-full h-full bg-slate-950/85 backdrop-blur-md flex flex-col items-center justify-center p-4 sm:p-6 z-30 animate-in fade-in duration-200">
            <div className="max-w-sm w-full bg-slate-900/95 border border-slate-800 rounded-3xl p-6 text-center space-y-4 shadow-2xl">
              <div className="w-14 h-14 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center mx-auto text-amber-400">
                <Grid3X3 className="w-7 h-7" />
              </div>
              <div className="space-y-1">
                <h2 className="text-xl sm:text-2xl font-black text-white uppercase tracking-wide">
                  {gameTitle}
                </h2>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Flip cards, find all 8 matching pairs, and score max bonus points before time expires!
                </p>
              </div>

              {/* Rules Summary Pills */}
              <div className="grid grid-cols-3 gap-2 py-2 text-[11px] font-mono">
                <div className="p-2 rounded-xl bg-slate-950/80 border border-slate-800 text-slate-300">
                  <span className="block text-[10px] text-slate-500 uppercase">Grid</span>
                  <span className="font-bold text-amber-400">16 Cards</span>
                </div>
                <div className="p-2 rounded-xl bg-slate-950/80 border border-slate-800 text-slate-300">
                  <span className="block text-[10px] text-slate-500 uppercase">Pairs</span>
                  <span className="font-bold text-emerald-400">8 Pairs</span>
                </div>
                <div className="p-2 rounded-xl bg-slate-950/80 border border-slate-800 text-slate-300">
                  <span className="block text-[10px] text-slate-500 uppercase">Timer</span>
                  <span className="font-bold text-cyan-400">{gameDuration}s</span>
                </div>
              </div>

              <button
                onClick={startCountdown}
                className="w-full py-3 bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-slate-950 font-black text-sm uppercase tracking-wider rounded-xl transition-all shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2 cursor-pointer"
              >
                <Play className="w-4 h-4 fill-current" />
                <span>Start Match</span>
              </button>
            </div>
          </div>
        )}

        {/* ======================================================================= */}
        {/* 4. COUNTDOWN OVERLAY                                                    */}
        {/* ======================================================================= */}
        {gameState === 'COUNTDOWN' && (
          <div className="absolute inset-0 w-full h-full bg-slate-950/75 backdrop-blur-sm flex flex-col items-center justify-center z-30 animate-in fade-in duration-150">
            <div className="text-6xl sm:text-8xl font-black text-amber-400 font-mono tracking-wider animate-ping">
              {countdown}
            </div>
            <p className="text-xs uppercase tracking-widest text-slate-400 font-bold mt-4">
              Get Ready!
            </p>
          </div>
        )}

        {/* ======================================================================= */}
        {/* 5. PAUSED OVERLAY                                                       */}
        {/* ======================================================================= */}
        {gameState === 'PAUSED' && (
          <div className="absolute inset-0 w-full h-full bg-slate-950/85 backdrop-blur-md flex flex-col items-center justify-center p-4 z-30 animate-in fade-in duration-150">
            <div className="max-w-xs w-full bg-slate-900 border border-slate-800 rounded-3xl p-6 text-center space-y-4 shadow-2xl">
              <h2 className="text-xl font-bold text-white uppercase tracking-wider">Game Paused</h2>
              <div className="space-y-2">
                <button
                  onClick={handleResume}
                  className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs uppercase tracking-wider rounded-xl transition-colors flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Play className="w-4 h-4 fill-current" />
                  <span>Resume Game</span>
                </button>
                <button
                  onClick={handleRestart}
                  className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs uppercase tracking-wider rounded-xl transition-colors flex items-center justify-center gap-2 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Restart Board</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ======================================================================= */}
        {/* 6. GAME OVER / VICTORY COMPLETION MODAL                                 */}
        {/* ======================================================================= */}
        {gameState === 'GAME_OVER' && (
          <div className="absolute inset-0 w-full h-full bg-slate-950/90 backdrop-blur-lg flex flex-col items-center justify-center p-3 sm:p-6 z-30 animate-in zoom-in-95 duration-200">
            <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6 text-center space-y-4 shadow-2xl relative overflow-hidden">
              {/* Result Status Banner */}
              <div className="space-y-1">
                {isVictory ? (
                  <>
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-bold">
                      <Trophy className="w-3.5 h-3.5" />
                      <span>VICTORY! ALL 8 PAIRS MATCHED</span>
                    </div>
                    <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                      Brilliant Memory!
                    </h2>
                  </>
                ) : (
                  <>
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-bold">
                      <Clock className="w-3.5 h-3.5" />
                      <span>TIME EXPIRED</span>
                    </div>
                    <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                      Good Effort!
                    </h2>
                  </>
                )}
              </div>

              {/* Score & Summary Grid */}
              <div className="grid grid-cols-4 gap-2 bg-slate-950/80 border border-slate-800 rounded-2xl p-3 text-center">
                <div className="space-y-0.5">
                  <span className="text-[10px] text-slate-500 uppercase font-bold">Score</span>
                  <span className="block text-base sm:text-lg font-black text-amber-400 font-mono">
                    {score}
                  </span>
                </div>
                <div className="space-y-0.5">
                  <span className="text-[10px] text-slate-500 uppercase font-bold">Moves</span>
                  <span className="block text-base sm:text-lg font-black text-cyan-300 font-mono">
                    {moves}
                  </span>
                </div>
                <div className="space-y-0.5">
                  <span className="text-[10px] text-slate-500 uppercase font-bold">Pairs</span>
                  <span className="block text-base sm:text-lg font-black text-emerald-400 font-mono">
                    {matchedPairsCount}/8
                  </span>
                </div>
                <div className="space-y-0.5">
                  <span className="text-[10px] text-slate-500 uppercase font-bold">Accuracy</span>
                  <span className="block text-base sm:text-lg font-black text-purple-400 font-mono">
                    {accuracyPercent}%
                  </span>
                </div>
              </div>

              {/* High Score Submission or Success Notice */}
              {!scoreSubmitted ? (
                <form onSubmit={handleSubmitScore} className="flex gap-2">
                  <input
                    type="text"
                    value={playerName}
                    onChange={(e) => setPlayerName(e.target.value)}
                    placeholder="Enter Player Name..."
                    maxLength={20}
                    className="flex-1 bg-slate-950 border border-slate-700 focus:border-amber-500 rounded-xl px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 outline-none"
                  />
                  <button
                    type="submit"
                    disabled={isSubmittingScore}
                    className="px-4 py-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-bold text-xs rounded-xl transition-all shadow-md shadow-amber-500/20 flex items-center gap-1.5 shrink-0 cursor-pointer"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>{isSubmittingScore ? 'Saving...' : 'Submit'}</span>
                  </button>
                </form>
              ) : (
                <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center gap-2 text-emerald-400 text-xs font-semibold">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>
                    Score submitted! Ranked #{submittedRank || 1}
                  </span>
                </div>
              )}

              {/* Primary Action Buttons */}
              <div className="flex items-center gap-2 pt-1">
                <button
                  onClick={startCountdown}
                  className="flex-1 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs uppercase tracking-wider rounded-xl transition-all shadow-lg shadow-amber-500/20 flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Play Again</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};
