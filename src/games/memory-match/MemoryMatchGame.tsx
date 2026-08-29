import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
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
  Megaphone,
} from 'lucide-react';
import { GameComponentProps } from '../types';
import { MemoryCard, MemoryMatchConfig } from './types';
import { createShuffledDeck } from './cardDeck';
import { memorySounds } from './memorySounds';
import { generateRandomCardPositions, CardPosition } from './memoryMatchBoardLayout';
import { GameState, GameStats, EventLeaderboardEntry } from '../../types';
import { getMemoryMatchConfig, getCardFrontBg, getCardGoodBg } from '../../themes/types';
import { normalizeGameLayout, GameLayoutConfig } from '../../themes/layout';
import { GameLayoutHudOverlay } from '../../components/studio/GameLayoutHudOverlay';
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
  const memoryConfig = useMemo(() => getMemoryMatchConfig(activeTheme), [activeTheme]);
  const boardConfig = memoryConfig.board;
  const cardConfig = memoryConfig.card || boardConfig.card;
  const showLeaderboard = memoryConfig.ui?.showLeaderboard ?? true;
  const rows = boardConfig.rows;
  const cols = boardConfig.cols;
  const totalCards = (rows * cols) % 2 === 0 ? rows * cols : 16;
  const totalPairs = Math.floor(totalCards / 2);

  const gameDuration = config?.gameDurationSeconds ?? settings?.gameDurationSeconds ?? memoryConfig.gameplay.gameDurationSeconds ?? 45;
  const mismatchDelay = config?.mismatchDelayMs ?? memoryConfig.gameplay.mismatchDelayMs ?? 850;
  const matchPoints = config?.matchPoints ?? memoryConfig.gameplay.matchPoints ?? 100;
  const comboPoints = config?.comboPoints ?? memoryConfig.gameplay.comboPoints ?? 30;
  const cardBackUrl = memoryConfig.cardBackUrl;

  const [gameState, setGameState] = useState<GameState>('START');

  const [countdown, setCountdown] = useState<number>(3);
  const [cards, setCards] = useState<MemoryCard[]>(() => createShuffledDeck(activeTheme));
  const [randomPositions, setRandomPositions] = useState<CardPosition[]>(() =>
    generateRandomCardPositions(createShuffledDeck(activeTheme).length, boardConfig, cardConfig)
  );
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

  const themeId = activeTheme?.id;
  const cardBorderRadius = cardConfig?.borderRadius ?? 16;
  const cardWidth = cardConfig?.width ?? 120;
  const cardHeight = cardConfig?.height ?? 120;
  const cardAspect = cardWidth / cardHeight;
  const gridContainerAspect = (cols * cardWidth) / (rows * cardHeight);

  const boardLayoutKey = `${boardConfig.layoutMode}_${boardConfig.rows}_${boardConfig.cols}_${boardConfig.cardGap}_${cardWidth}_${cardHeight}_${cardBorderRadius}_${cardConfig?.rotationMode}_${cardConfig?.rotation}_${cardConfig?.rotationRange}`;

  // Initialize fresh card deck on theme change or mount
  const initBoard = useCallback(() => {
    const newDeck = createShuffledDeck(activeTheme);
    setCards(newDeck);
    setRandomPositions(generateRandomCardPositions(newDeck.length, boardConfig, cardConfig));
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
  }, [activeTheme, boardConfig, cardConfig, gameDuration]);

  // Only re-initialize board on mount or when theme/layout configuration changes
  useEffect(() => {
    initBoard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [themeId, boardLayoutKey]);

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
    if (!showLeaderboard) return;

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
  }, [showLeaderboard, hasEventContext, publicToken, eventId]);

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
      const finalPairs = won ? totalPairs : matchedPairsCountRef.current;
      const finalScore = calculateMemoryMatchScore({
        moves: movesRef.current,
        duration: finalDuration,
        matchedPairs: finalPairs,
        totalPairs: totalPairs,
      });

      setScore(finalScore);

      if (won) {
        memorySounds.playVictory();
      } else {
        memorySounds.playMismatch();
      }

      if (showLeaderboard) {
        fetchLeaderboard();
      }
    },
    [gameDuration, totalPairs, fetchLeaderboard, showLeaderboard]
  );

  const handleGameOverRef = useRef(handleGameOver);
  useEffect(() => {
    handleGameOverRef.current = handleGameOver;
  }, [handleGameOver]);

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
        handleGameOverRef.current(false);
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
  }, [gameState]);

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

          // If all pairs matched -> VICTORY!
          if (newMatchedCount >= totalPairs) {
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
      matchedPairs: isVictory ? totalPairs : matchedPairsCount,
      totalPairs: totalPairs,
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

  const layout: GameLayoutConfig = useMemo(
    () => normalizeGameLayout(activeTheme?.layout),
    [activeTheme?.layout]
  );

  const clientLogoUrl =
    activeTheme?.clientLogo ||
    activeTheme?.logo ||
    activeTheme?.branding?.clientLogo ||
    (activeTheme as any)?.branding?.clientLogoUrl ||
    (activeTheme as any)?.branding?.logoUrl;

  const gameTitle =
    activeTheme?.branding?.gameTitle ||
    activeTheme?.gameTitle ||
    activeTheme?.name ||
    'MEMORY MATCH';

  const sponsorSubtitle =
    activeTheme?.branding?.subtitle ||
    activeTheme?.subtitle ||
    'Official Event Arcade Challenge';

  const hudColor = activeTheme?.branding?.hudColor || '#c8e038';
  const accentColor =
    activeTheme?.branding?.accentColor ||
    activeTheme?.visuals_config?.accentColor ||
    '#10b981';

  const effectiveCardFrontBg = useMemo(() => {
    return getCardFrontBg(
      activeTheme?.visuals_config?.cardFrontBg,
      activeTheme?.visuals_config?.cardFrontBgOpacity
    );
  }, [activeTheme?.visuals_config?.cardFrontBg, activeTheme?.visuals_config?.cardFrontBgOpacity]);

  const effectiveCardGoodBg = useMemo(() => {
    return getCardGoodBg(
      activeTheme?.visuals_config?.cardGoodBg,
      activeTheme?.visuals_config?.cardGoodBgOpacity
    );
  }, [activeTheme?.visuals_config?.cardGoodBg, activeTheme?.visuals_config?.cardGoodBgOpacity]);

  const customBgUrl = activeTheme?.background_url && activeTheme.background_url.trim() !== ''
    ? activeTheme.background_url
    : null;

  return (
    <div
      className="relative w-full h-full min-w-0 min-h-0 overflow-hidden select-none bg-[#07130b]"
      style={{
        backgroundColor: activeTheme?.visuals_config?.bgGradientTo || '#07130b',
        backgroundImage: customBgUrl
          ? `url(${customBgUrl})`
          : `radial-gradient(circle at 50% 20%, ${
              activeTheme?.visuals_config?.bgGradientFrom || 'rgba(30, 16, 53, 0.6)'
            } 0%, ${activeTheme?.visuals_config?.bgGradientTo || '#07130b'} 100%)`,
        backgroundSize: 'cover',
        backgroundPosition: 'center center',
        backgroundRepeat: 'no-repeat',
      }}
    >
      {/* ========================================================================= */}
      {/* 1. MAIN CARD BOARD AREA (Grid vs Random / Scattered Layout)               */}
      {/* ========================================================================= */}
      <div className="absolute inset-0 flex items-center justify-center p-3 sm:p-6 md:p-8 overflow-hidden z-10 pointer-events-auto">
        {boardConfig.layoutMode === 'grid' ? (
          <div
            className="w-full h-full max-h-[min(100%,680px)] max-w-[min(100%,680px)] m-auto"
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
              gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
              aspectRatio: `${gridContainerAspect}`,
              gap: `${boardConfig.cardGap ?? 12}px`,
            }}
          >
            {cards.map((card, index) => {
              const isFaceUp = card.isFlipped || card.isMatched;
              const cardRotationAngle = card.rotation ?? 0;

              return (
                <div
                  key={card.id}
                  onClick={() => handleCardClick(index)}
                  className={`relative w-full h-full cursor-pointer perspective-1000 select-none group transition-transform ${
                    card.isShaking ? 'animate-wobble' : ''
                  }`}
                  style={{
                    perspective: '1000px',
                    transform: `rotate(${cardRotationAngle}deg)`,
                  }}
                >
                  {/* Card 3D Inner Wrapper */}
                  <div
                    className={`relative w-full h-full transition-transform duration-350 ease-out shadow-md ${
                      isFaceUp ? 'rotate-y-180' : 'hover:scale-[1.02] active:scale-[0.98]'
                    }`}
                    style={{
                      transformStyle: 'preserve-3d',
                      transform: isFaceUp ? 'rotateY(180deg)' : 'rotateY(0deg)',
                      borderRadius: `${cardBorderRadius}px`,
                    }}
                  >
                    {/* BACK FACE (Default Face-Down State) */}
                    <div
                      className="absolute inset-0 w-full h-full border p-1.5 sm:p-2 flex flex-col items-center justify-center overflow-hidden transition-all shadow-inner"
                      style={{
                        backfaceVisibility: 'hidden',
                        backgroundColor: activeTheme?.visuals_config?.cardBadBg || '#0f172a',
                        borderColor: activeTheme?.visuals_config?.cardBadBorder || '#334155',
                        borderRadius: `${cardBorderRadius}px`,
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
                          <div
                            className="absolute inset-1 border border-dashed border-slate-700/50 flex items-center justify-center pointer-events-none"
                            style={{ borderRadius: `${Math.max(4, cardBorderRadius - 4)}px` }}
                          />
                          <div className="w-6 h-6 sm:w-9 sm:h-9 rounded-xl bg-slate-950/80 border border-amber-500/30 flex items-center justify-center text-amber-400/80 group-hover:text-amber-300 group-hover:scale-110 transition-transform">
                            <Grid3X3 className="w-3.5 h-3.5 sm:w-5 sm:h-5" />
                          </div>
                        </>
                      )}
                    </div>

                    {/* FRONT FACE (Flipped Face-Up / Matched State) */}
                    <div
                      className={`absolute inset-0 w-full h-full border flex flex-col items-center justify-between p-1 sm:p-2 transition-all ${
                        card.isMatched
                          ? 'shadow-[0_0_15px_rgba(16,185,129,0.35)]'
                          : 'shadow-[0_0_12px_rgba(245,158,11,0.25)]'
                      }`}
                      style={{
                        backfaceVisibility: 'hidden',
                        transform: 'rotateY(180deg)',
                        borderRadius: `${cardBorderRadius}px`,
                        backgroundColor: card.isMatched
                          ? effectiveCardGoodBg
                          : effectiveCardFrontBg,
                        borderColor: card.isMatched
                          ? activeTheme?.visuals_config?.cardGoodBorder || '#10b981'
                          : activeTheme?.visuals_config?.cardBadBorder || card.borderColor || '#f59e0b',
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
        ) : (
          /* RANDOM / SCATTERED BOARD */
          <div className="relative w-full h-full max-h-[min(100%,660px)] max-w-[min(100%,660px)] m-auto overflow-hidden">
            {cards.map((card, index) => {
              const pos = randomPositions[index] || {
                x: 50,
                y: 50,
                rotation: 0,
                widthPercent: 18,
                heightPercent: 24,
                zIndex: index + 1,
              };
              const isFaceUp = card.isFlipped || card.isMatched;

              return (
                <div
                  key={card.id}
                  onClick={() => handleCardClick(index)}
                  style={{
                    position: 'absolute',
                    left: `${pos.x}%`,
                    top: `${pos.y}%`,
                    width: `${pos.widthPercent}%`,
                    height: `${pos.heightPercent}%`,
                    transform: `translate(-50%, -50%) rotate(${pos.rotation}deg)`,
                    zIndex: isFaceUp ? 60 : pos.zIndex,
                  }}
                  className={`cursor-pointer perspective-1000 select-none group transition-all duration-200 active:scale-95 ${
                    card.isShaking ? 'animate-wobble' : ''
                  }`}
                >
                  {/* Card 3D Inner Wrapper */}
                  <div
                    className={`relative w-full h-full transition-transform duration-350 ease-out shadow-md hover:shadow-xl hover:scale-105 ${
                      isFaceUp ? 'rotate-y-180' : ''
                    }`}
                    style={{
                      transformStyle: 'preserve-3d',
                      transform: isFaceUp ? 'rotateY(180deg)' : 'rotateY(0deg)',
                      borderRadius: `${cardBorderRadius}px`,
                    }}
                  >
                    {/* BACK FACE (Default Face-Down State) */}
                    <div
                      className="absolute inset-0 w-full h-full border p-1.5 sm:p-2 flex flex-col items-center justify-center overflow-hidden transition-all shadow-inner"
                      style={{
                        backfaceVisibility: 'hidden',
                        backgroundColor: activeTheme?.visuals_config?.cardBadBg || '#0f172a',
                        borderColor: activeTheme?.visuals_config?.cardBadBorder || '#334155',
                        borderRadius: `${cardBorderRadius}px`,
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
                          <div
                            className="absolute inset-1 border border-dashed border-slate-700/50 flex items-center justify-center pointer-events-none"
                            style={{ borderRadius: `${Math.max(4, cardBorderRadius - 4)}px` }}
                          />
                          <div className="w-6 h-6 sm:w-9 sm:h-9 rounded-xl bg-slate-950/80 border border-amber-500/30 flex items-center justify-center text-amber-400/80 group-hover:text-amber-300 group-hover:scale-110 transition-transform">
                            <Grid3X3 className="w-3.5 h-3.5 sm:w-5 sm:h-5" />
                          </div>
                        </>
                      )}
                    </div>

                    {/* FRONT FACE (Flipped Face-Up / Matched State) */}
                    <div
                      className={`absolute inset-0 w-full h-full border flex flex-col items-center justify-between p-1 sm:p-2 transition-all ${
                        card.isMatched
                          ? 'shadow-[0_0_15px_rgba(16,185,129,0.35)]'
                          : 'shadow-[0_0_12px_rgba(245,158,11,0.25)]'
                      }`}
                      style={{
                        backfaceVisibility: 'hidden',
                        transform: 'rotateY(180deg)',
                        borderRadius: `${cardBorderRadius}px`,
                        backgroundColor: card.isMatched
                          ? effectiveCardGoodBg
                          : effectiveCardFrontBg,
                        borderColor: card.isMatched
                          ? activeTheme?.visuals_config?.cardGoodBorder || '#10b981'
                          : activeTheme?.visuals_config?.cardBadBorder || card.borderColor || '#f59e0b',
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
        )}
      </div>

      {/* ========================================================================= */}
      {/* 2. IN-GAME DYNAMIC UI LAYOUT (5 Positionable HUD Elements)                */}
      {/* ========================================================================= */}
      {(gameState === 'PLAYING' || gameState === 'PAUSED') && (
        <GameLayoutHudOverlay
          layout={layout}
          theme={activeTheme}
          score={score}
          timeRemaining={timeRemaining}
        />
      )}

      {/* ========================================================================= */}
      {/* 3. PERSISTENT IN-GAME CONTROLS DOCK (Top-Right)                           */}
      {/* ========================================================================= */}
      <div className="absolute top-3 right-3 z-40 pointer-events-auto flex items-center gap-1.5 bg-slate-950/85 backdrop-blur-sm p-1.5 rounded-xl border border-slate-700/80 shadow-lg">
        {gameState === 'PLAYING' && (
          <button
            onClick={handlePause}
            className="p-1.5 rounded-lg bg-[#0c2012]/90 border border-[#b2c833] text-[#c8e038] hover:bg-[#1a3820] transition-all font-mono text-xs font-bold"
            title="Pause Game"
          >
            <Pause className="w-3.5 h-3.5" />
          </button>
        )}

        {gameState === 'PAUSED' && (
          <button
            onClick={handleResume}
            className="p-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition-all font-mono text-xs font-bold"
            title="Resume Game"
          >
            <Play className="w-3.5 h-3.5" />
          </button>
        )}

        {(gameState === 'PLAYING' || gameState === 'PAUSED') && (
          <button
            onClick={handleRestart}
            className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 transition-all font-mono text-xs font-bold"
            title="Restart Board"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        )}

        <button
          onClick={onToggleMute}
          className="p-1.5 rounded-lg bg-[#0c2012]/90 border border-[#b2c833] text-[#c8e038] hover:bg-[#1a3820] transition-all"
          title={isMuted ? 'Unmute Sound' : 'Mute Sound'}
        >
          {isMuted ? (
            <VolumeX className="w-3.5 h-3.5 text-rose-400" />
          ) : (
            <Volume2 className="w-3.5 h-3.5 text-emerald-400" />
          )}
        </button>

        {onToggleFullscreen && (
          <button
            onClick={onToggleFullscreen}
            className="p-1.5 rounded-lg bg-[#0c2012]/90 border border-[#b2c833] text-[#c8e038] hover:bg-[#1a3820] transition-all font-mono text-xs font-bold"
            title={isFullscreen ? 'Exit Fullscreen' : 'Toggle Fullscreen'}
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
        )}
      </div>

      {/* ========================================================================= */}
      {/* 4. SECONDARY GAMEPLAY INFO BADGE (Pairs matched & combo streak)           */}
      {/* ========================================================================= */}
      {(gameState === 'PLAYING' || gameState === 'PAUSED') && (
        <div className="absolute bottom-3 left-3 z-30 pointer-events-none flex items-center gap-2">
          <div className="bg-slate-950/80 backdrop-blur-sm border border-slate-800/80 rounded-xl px-2.5 py-1 text-slate-300 text-xs font-mono flex items-center gap-1.5 shadow-md">
            <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-slate-400">Pairs:</span>
            <span className="font-bold text-emerald-400">
              {matchedPairsCount}/{totalPairs}
            </span>
          </div>

          {comboStreak > 1 && (
            <div className="bg-orange-500/20 backdrop-blur-sm border border-orange-500/40 rounded-xl px-2.5 py-1 text-orange-400 text-xs font-mono font-bold flex items-center gap-1 shadow-md animate-bounce">
              <Flame className="w-3.5 h-3.5 text-orange-400" />
              <span>{comboStreak}x Combo</span>
            </div>
          )}
        </div>
      )}
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
                  Flip cards, find all {totalPairs} matching pairs, and score max bonus points before time expires!
                </p>
              </div>

              {/* Rules Summary Pills */}
              <div className="grid grid-cols-3 gap-2 py-2 text-[11px] font-mono">
                <div className="p-2 rounded-xl bg-slate-950/80 border border-slate-800 text-slate-300">
                  <span className="block text-[10px] text-slate-500 uppercase">Grid</span>
                  <span className="font-bold text-amber-400">{totalCards} Cards</span>
                </div>
                <div className="p-2 rounded-xl bg-slate-950/80 border border-slate-800 text-slate-300">
                  <span className="block text-[10px] text-slate-500 uppercase">Pairs</span>
                  <span className="font-bold text-emerald-400">{totalPairs} Pairs</span>
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
                      <span>VICTORY! ALL {totalPairs} PAIRS MATCHED</span>
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
                    {matchedPairsCount}/{totalPairs}
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
              {showLeaderboard && (
                !scoreSubmitted ? (
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
                )
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
    </div>
  );
};
