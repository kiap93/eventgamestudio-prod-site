import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Trophy,
  RotateCcw,
  Volume2,
  VolumeX,
  Pause,
  Play,
  Square,
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
  Move,
} from 'lucide-react';
import { GameComponentProps } from '../types';
import { MemoryCard, MemoryMatchConfig } from './types';
import { createShuffledDeck } from './cardDeck';
import { memorySounds } from './memorySounds';
import { generateCardPositions, generateRandomCardPositions, CardPosition } from './memoryMatchBoardLayout';
import { GameState, GameStats, EventLeaderboardEntry } from '../../types';
import { getMemoryMatchConfig, getCardFrontBg, getCardGoodBg, resolveScreenBackground } from '../../themes';
import {
  normalizeGameLayout,
  GameLayoutConfig,
  LayoutElementKey,
} from '../../themes/layout';
import { useResponsiveLayout, getEffectiveGameLayout } from '../../themes/responsive';
import { GameLayoutHudOverlay } from '../../components/studio/GameLayoutHudOverlay';
import { apiFetch } from '../../lib/api';
import { ResultScreenRenderer } from './ResultScreenRenderer';
import { StartScreenRenderer } from './StartScreenRenderer';

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

// Explicit Auto Demo state machine phases
export type AutoDemoPhase =
  | 'idle'
  | 'flip-first'
  | 'wait-first'
  | 'show-first'
  | 'flip-second'
  | 'show-pair'
  | 'resolve-match'
  | 'resolve-mismatch'
  | 'flip-back'
  | 'pause-after-resolution'
  | 'next'
  | 'complete';

// Auto Demo timing and behavior constants (ms)
const AUTO_DEMO_FIRST_CARD_DELAY = 600; // time before flipping second card
const AUTO_DEMO_SECOND_CARD_VISIBLE = 800; // duration BOTH cards remain visibly face-up before resolution
const AUTO_DEMO_AFTER_RESOLUTION = 400; // pause after resolving (flipped back or matched) before next action
const AUTO_DEMO_INITIAL_ACTION_DELAY = 400; // brief pause before first action starts after countdown
const AUTO_DEMO_CYCLE_RESTART_DELAY = 1200; // pause when cycle completes before starting new deck
const AUTO_DEMO_WRONG_MATCH_CHANCE = 0.30;

export interface MemoryMatchGameProps extends GameComponentProps<MemoryMatchConfig> {
  className?: string;
  isStudioPreview?: boolean;
  autoDemo?: boolean;
  initialGameState?: GameState;
  autoStart?: boolean;
  editableLayout?: boolean;
  selectedElementKey?: LayoutElementKey | null;
  onSelectElementKey?: (key: LayoutElementKey) => void;
  onElementPointerDown?: (
    key: LayoutElementKey,
    isResize: boolean,
    e: React.PointerEvent<HTMLDivElement>
  ) => void;
  onStopGame?: () => void;
}

export const MemoryMatchGame: React.FC<MemoryMatchGameProps> = ({
  className = '',
  activeTheme,
  settings,
  config,
  eventId,
  publicToken,
  isEventPreview = false,
  isEventTest = false,
  onStatsChange,
  onGameStateChange,
  isMuted = false,
  isFullscreen = false,
  onToggleFullscreen,
  onToggleMute,
  isStudioPreview = false,
  autoDemo = false,
  initialGameState,
  autoStart,
  editableLayout = false,
  selectedElementKey = null,
  onSelectElementKey,
  onElementPointerDown,
  onStopGame,
}) => {
  const viewportRef = useRef<HTMLDivElement>(null);
  const orientationPreference = activeTheme?.layout?.orientation || 'auto';
  const responsive = useResponsiveLayout(viewportRef, orientationPreference);
  const { isPortrait, uiScale, designWidth, designHeight } = responsive;

  const memoryConfig = useMemo(() => getMemoryMatchConfig(activeTheme), [activeTheme]);
  const boardConfig = memoryConfig.board;
  const cardConfig = memoryConfig.card || boardConfig.card;
  const showLeaderboard = memoryConfig.ui?.showLeaderboard ?? true;
  const rows = boardConfig.rows;
  const cols = boardConfig.cols;
  const totalCards = (rows * cols) % 2 === 0 ? rows * cols : rows * cols - 1;
  const totalPairs = Math.floor(totalCards / 2);

  const hasMemoryGameConfig =
    activeTheme?.game_config &&
    typeof activeTheme.game_config === 'object' &&
    activeTheme.game_config.gameplay &&
    typeof activeTheme.game_config.gameplay.gameDurationSeconds === 'number';

  const gameDuration = hasMemoryGameConfig
    ? memoryConfig.gameplay.gameDurationSeconds
    : (
        activeTheme?.physics_config?.gameDurationSeconds ??
        settings?.gameDurationSeconds ??
        config?.gameDurationSeconds ??
        memoryConfig.gameplay.gameDurationSeconds ??
        45
      );
  const mismatchDelay =
    memoryConfig.gameplay.mismatchDelayMs ??
    settings?.mismatchDelayMs ??
    config?.mismatchDelayMs ??
    850;
  const matchPoints =
    memoryConfig.gameplay.matchPoints ??
    settings?.matchPoints ??
    config?.matchPoints ??
    100;
  const comboPoints =
    memoryConfig.gameplay.comboPoints ??
    settings?.comboPoints ??
    config?.comboPoints ??
    30;
  const cardBackUrl = memoryConfig.cardBackUrl;

  const [gameState, setGameState] = useState<GameState>(
    initialGameState || (autoStart ? 'PLAYING' : 'START')
  );

  const [countdown, setCountdown] = useState<number>(3);
  const [cards, setCards] = useState<MemoryCard[]>(() => {
    const deck = createShuffledDeck(activeTheme);
    return deck.slice(0, totalCards);
  });
  const [randomPositions, setRandomPositions] = useState<CardPosition[]>(() =>
    generateCardPositions(totalCards, boardConfig, cardConfig)
  );
  const [flippedIndices, setFlippedIndices] = useState<number[]>([]);
  const [firstFlippedCardId, setFirstFlippedCardId] = useState<string | null>(null);
  const firstFlippedCardIdRef = useRef<string | null>(null);
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
  const sessionIdRef = useRef<string>(sessionId);
  sessionIdRef.current = sessionId;

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
  const [showLeaderboardModal, setShowLeaderboardModal] = useState(false);

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const countdownTimerRef = useRef<NodeJS.Timeout | null>(null);
  const activeTimeoutsRef = useRef<Set<NodeJS.Timeout>>(new Set());
  const autoDemoTimeoutsRef = useRef<Set<NodeJS.Timeout>>(new Set());
  const autoDemoCycleRef = useRef<number>(0);
  const autoDemoActionRef = useRef<{
    token: string;
    firstCardId: string;
    secondCardId: string;
    type: 'WRONG' | 'CORRECT';
  } | null>(null);
  const hasEventContext = Boolean(publicToken || (eventId && eventId !== 'undefined' && eventId !== 'null'));

  const clearCardTimeouts = useCallback(() => {
    activeTimeoutsRef.current.forEach((t) => clearTimeout(t));
    activeTimeoutsRef.current.clear();
  }, []);

  const clearAutoDemoTimers = useCallback(() => {
    autoDemoTimeoutsRef.current.forEach((t) => clearTimeout(t));
    autoDemoTimeoutsRef.current.clear();
    autoDemoActionRef.current = null;
  }, []);

  const setManagedAutoDemoTimeout = useCallback(
    (callback: () => void, delayMs: number) => {
      const currentSession = sessionIdRef.current;
      const timeoutId = setTimeout(() => {
        autoDemoTimeoutsRef.current.delete(timeoutId);
        if (sessionIdRef.current !== currentSession) return;
        callback();
      }, delayMs);
      autoDemoTimeoutsRef.current.add(timeoutId);
      return timeoutId;
    },
    []
  );

  // Centralized gameplay timer, countdown, and animation cleanup
  const cleanupGameplay = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    clearCardTimeouts();
    clearAutoDemoTimers();
  }, [clearCardTimeouts, clearAutoDemoTimers]);

  // Cleanup all pending timers and timeouts on component unmount
  useEffect(() => {
    return () => {
      cleanupGameplay();
      clearAutoDemoTimers();
    };
  }, [cleanupGameplay, clearAutoDemoTimers]);

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
  const cardsRef = useRef(cards);
  cardsRef.current = cards;
  const comboStreakRef = useRef(comboStreak);
  comboStreakRef.current = comboStreak;

  const mismatchDelayRef = useRef(mismatchDelay);
  mismatchDelayRef.current = mismatchDelay;

  const matchPointsRef = useRef(matchPoints);
  matchPointsRef.current = matchPoints;

  const comboPointsRef = useRef(comboPoints);
  comboPointsRef.current = comboPoints;

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

  // Separate gameplay-reset key from visual hot-update key
  // Gameplay-reset properties: rows, cols, card content (pairs, images, names, card back), game duration, themeId
  const cardConfigSignature = `${memoryConfig.cardBackUrl || ''}_${(memoryConfig.pairs || []).map((p) => `${p.id}:${p.imageUrl || ''}:${p.name || ''}`).join('|')}`;
  const gameplayConfigKey = `${themeId}_${boardConfig.rows}_${boardConfig.cols}_${cardConfigSignature}_${gameDuration}`;

  // Visual hot-update properties: card width/height/gap/radius/rotation/layoutMode/random spacing
  // Changing these MUST NOT recreate the deck or reset gameplay/countdown
  const visualConfigKey = `${boardConfig.layoutMode}_${boardConfig.cardGap}_${cardWidth}_${cardHeight}_${cardBorderRadius}_${cardConfig?.rotationMode}_${cardConfig?.rotation}_${cardConfig?.rotationRange}_${boardConfig.randomLayout?.minSpacing}_${boardConfig.randomLayout?.rotationMin}_${boardConfig.randomLayout?.rotationMax}`;

  // Initialize fresh card deck and board positions only (pure data initialization, no timer teardown)
  const initBoard = useCallback(() => {
    const newDeck = createShuffledDeck(activeTheme).slice(0, totalCards);
    setCards(newDeck);
    setRandomPositions(generateCardPositions(newDeck.length, boardConfig, cardConfig));
    return newDeck;
  }, [activeTheme, totalCards, boardConfig, cardConfig]);

  // Defensive check: layoutMode must never affect card count
  useEffect(() => {
    if (cards.length !== totalCards) {
      console.warn('MemoryMatchGame card count mismatch', {
        cards: cards.length,
        expected: totalCards,
        rows,
        cols,
        layoutMode: boardConfig.layoutMode,
      });
    }

    if (boardConfig.layoutMode !== 'grid' && randomPositions.length !== cards.length) {
      console.warn('Card count and position count mismatch', {
        cards: cards.length,
        positions: randomPositions.length,
        layoutMode: boardConfig.layoutMode,
      });
    }
  }, [cards.length, randomPositions.length, totalCards, rows, cols, boardConfig.layoutMode]);

  // Start a fresh game session: reset gameplay, initialize board, and enter COUNTDOWN
  const startNewGame = useCallback(() => {
    console.debug('[MemoryMatch] GAME START');
    console.debug('[MemoryMatch] GAME RESET');
    cleanupGameplay();
    clearAutoDemoTimers();

    initBoard();

    setFlippedIndices([]);
    setFirstFlippedCardId(null);
    firstFlippedCardIdRef.current = null;
    setIsLocked(false);
    setScore(0);
    setMoves(0);
    setMatchedPairsCount(0);
    setComboStreak(0);
    setMaxComboStreak(0);
    setTimeRemaining(gameDuration);
    timeRemainingRef.current = gameDuration;
    movesRef.current = 0;
    matchedPairsCountRef.current = 0;
    setIsVictory(false);
    setScoreSubmitted(false);
    setSubmittedRank(null);

    const newSession = `mm_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    setSessionId(newSession);
    sessionIdRef.current = newSession;

    console.debug('[MemoryMatch] COUNTDOWN START');
    setCountdown(3);
    updateGameState('COUNTDOWN');
  }, [cleanupGameplay, clearAutoDemoTimers, initBoard, gameDuration, updateGameState]);

  // Alias startCountdown to startNewGame for buttons and callbacks
  const startCountdown = startNewGame;

  const startCountdownRef = useRef(startCountdown);
  useEffect(() => {
    startCountdownRef.current = startCountdown;
  }, [startCountdown]);

  const isFirstMountRef = useRef(true);

  // Gameplay configuration change effect (triggers game reset only when gameplay rules/deck change)
  useEffect(() => {
    if (isFirstMountRef.current) {
      isFirstMountRef.current = false;
      if (isStudioPreview && autoDemo) {
        startNewGame();
      }
      return;
    }
    console.debug('[MemoryMatch] GAMEPLAY CONFIG RESET', gameplayConfigKey);
    startNewGame();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameplayConfigKey]);

  // Hot visual configuration update effect (card width/height/gap/radius/rotation/scattered positions)
  // NEVER calls cleanupGameplay(), initBoard(), or startCountdown()
  useEffect(() => {
    if (isFirstMountRef.current) return;

    console.debug('[MemoryMatch] HOT VISUAL UPDATE', {
      width: cardWidth,
      height: cardHeight,
      borderRadius: cardBorderRadius,
      rotation: cardConfig?.rotation,
    });

    if (cardsRef.current.length > 0) {
      setRandomPositions(
        generateCardPositions(
          cardsRef.current.length,
          boardConfig,
          cardConfig
        )
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visualConfigKey]);

  // Mode switch transition handling (Auto Demo <-> Testing / Interactive)
  const prevAutoDemoRef = useRef<boolean | undefined>(autoDemo);
  useEffect(() => {
    if (!isStudioPreview) return;

    const prevAutoDemo = prevAutoDemoRef.current;
    prevAutoDemoRef.current = autoDemo;

    if (prevAutoDemo === undefined) {
      return; // Handled on first mount
    }

    // Changing: Testing (Interactive) -> Auto Demo
    if (prevAutoDemo === false && autoDemo === true) {
      startNewGame();
      return;
    }

    // Changing: Auto Demo -> Testing (Interactive)
    if (prevAutoDemo === true && autoDemo === false) {
      clearAutoDemoTimers();
      const newSession = `mm_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      setSessionId(newSession);
      sessionIdRef.current = newSession;
      setIsLocked(false);
      setFlippedIndices([]);
      setFirstFlippedCardId(null);
      firstFlippedCardIdRef.current = null;
      setCards((prev) =>
        prev.map((c) => (c.isMatched ? c : { ...c, isFlipped: false, isShaking: false }))
      );
    }
  }, [
    autoDemo,
    isStudioPreview,
    startNewGame,
    clearAutoDemoTimers,
  ]);

  // Centralized Stop Game function
  const stopGame = useCallback(() => {
    memorySounds.playButtonClick();

    // 1. Terminate current game & cancel all running timers, countdown, and pending card delays
    cleanupGameplay();

    // 2. Invalidate session ID to safely abort any pending async operations or closures
    const newSession = `mm_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    setSessionId(newSession);
    sessionIdRef.current = newSession;

    // 3. Reset gameplay state, metrics, and score tracking
    setIsLocked(false);
    setFlippedIndices([]);
    setFirstFlippedCardId(null);
    firstFlippedCardIdRef.current = null;
    setScore(0);
    setMoves(0);
    setMatchedPairsCount(0);
    setComboStreak(0);
    setMaxComboStreak(0);
    setTimeRemaining(gameDuration);
    timeRemainingRef.current = gameDuration;
    movesRef.current = 0;
    matchedPairsCountRef.current = 0;
    setIsVictory(false);
    setScoreSubmitted(false);
    setSubmittedRank(null);
    setCountdown(3);

    // 4. Reset cards to clean, fresh face-down state
    const newDeck = createShuffledDeck(activeTheme).slice(0, totalCards);
    setCards(newDeck);
    setRandomPositions(generateCardPositions(newDeck.length, boardConfig, cardConfig));

    // 5. Return to start / ready screen (START)
    updateGameState('START');
    onStopGame?.();
  }, [
    cleanupGameplay,
    activeTheme,
    totalCards,
    boardConfig,
    cardConfig,
    gameDuration,
    updateGameState,
    onStopGame,
  ]);

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
        : `/api/events/${eventId}/admin/high-scores?limit=50`;
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
      // If running Studio Auto Demo, never enter the real game over / submission screen
      if (isStudioPreview && autoDemo) {
        cleanupGameplay();
        clearAutoDemoTimers();
        startCountdown();
        return;
      }

      cleanupGameplay();
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
    [
      isStudioPreview,
      autoDemo,
      cleanupGameplay,
      clearAutoDemoTimers,
      startCountdown,
      gameDuration,
      totalPairs,
      fetchLeaderboard,
      showLeaderboard,
    ]
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

  // Studio-only Auto Demo sequence controller
  useEffect(() => {
    if (!isStudioPreview || !autoDemo) {
      clearAutoDemoTimers();
      return;
    }

    if (gameState !== 'PLAYING') {
      clearAutoDemoTimers();
      return;
    }

    const currentDeck = cardsRef.current.slice(0, totalCards);
    if (cardsRef.current.length !== totalCards) {
      console.warn('Auto Demo detected deck length mismatch with totalCards', {
        deckLength: cardsRef.current.length,
        totalCards,
      });
    }
    const pairMap = new Map<string, string[]>();
    currentDeck.forEach((card) => {
      if (!card.isMatched) {
        const list = pairMap.get(card.pairId) || [];
        list.push(card.id);
        pairMap.set(card.pairId, list);
      }
    });

    interface AvailablePair {
      pairId: string;
      cardIds: [string, string];
    }

    const availablePairs: AvailablePair[] = [];
    pairMap.forEach((cardIds, pairId) => {
      if (cardIds.length >= 2) {
        availablePairs.push({
          pairId,
          cardIds: [cardIds[0], cardIds[1]],
        });
      }
    });

    if (availablePairs.length === 0) return;

    // Shuffle pair presentation order so each demonstration cycle is varied
    for (let i = availablePairs.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [availablePairs[i], availablePairs[j]] = [availablePairs[j], availablePairs[i]];
    }

    // Randomize first vs second card flip order within each pair
    for (let i = 0; i < availablePairs.length; i++) {
      if (Math.random() > 0.5) {
        availablePairs[i].cardIds = [availablePairs[i].cardIds[1], availablePairs[i].cardIds[0]];
      }
    }

    interface DemoAction {
      type: 'WRONG' | 'CORRECT';
      firstCardId: string;
      secondCardId: string;
      pairId?: string;
    }

    const actionList: DemoAction[] = [];
    const remainingPairs = [...availablePairs];
    const recentWrongPairs = new Set<string>();

    const cycleNumber = autoDemoCycleRef.current;
    autoDemoCycleRef.current += 1;
    const patternModulo = cycleNumber % 3;
    let lastWasWrong = false;

    for (let i = 0; i < availablePairs.length; i++) {
      const targetPair = availablePairs[i];

      // Decide whether to insert a realistic WRONG attempt before solving targetPair
      // Conditions:
      // 1. Must have at least 2 distinct unmatched pairs remaining (guarantees firstCard.pairId !== secondCard.pairId)
      // 2. Never allow two consecutive wrong matches
      // 3. Keep wrong matches to ~30% of attempts with natural progression
      let shouldDoWrong = false;
      if (remainingPairs.length >= 2 && !lastWasWrong) {
        if (patternModulo === 0) {
          shouldDoWrong = (i === 0 || i === 3 || i === 5 || Math.random() < AUTO_DEMO_WRONG_MATCH_CHANCE);
        } else if (patternModulo === 1) {
          shouldDoWrong = (i === 1 || i === 4 || i === 6 || Math.random() < AUTO_DEMO_WRONG_MATCH_CHANCE);
        } else {
          shouldDoWrong = (i === 0 || i === 2 || i === 4 || Math.random() < AUTO_DEMO_WRONG_MATCH_CHANCE);
        }
      }

      if (shouldDoWrong && remainingPairs.length >= 2) {
        // Choose two distinct pairs: pairB (targetPair about to be solved) and pairA (another remaining pair)
        const pairB = targetPair;
        const candidates = remainingPairs.filter((p) => p.pairId !== pairB.pairId);
        if (candidates.length > 0) {
          const preferred = candidates.filter((p) => !recentWrongPairs.has(p.pairId));
          const pairA = preferred.length > 0
            ? preferred[Math.floor(Math.random() * preferred.length)]
            : candidates[Math.floor(Math.random() * candidates.length)];

          // Guarantee firstCard.pairId !== secondCard.pairId
          const cardAId = pairA.cardIds[Math.random() > 0.5 ? 1 : 0];
          const cardBId = pairB.cardIds[Math.random() > 0.5 ? 1 : 0];

          actionList.push({
            type: 'WRONG',
            firstCardId: cardAId,
            secondCardId: cardBId,
          });

          recentWrongPairs.add(pairA.pairId);
          recentWrongPairs.add(pairB.pairId);
          lastWasWrong = true;
        }
      }

      // Add the legitimate matching pair action
      actionList.push({
        type: 'CORRECT',
        firstCardId: targetPair.cardIds[0],
        secondCardId: targetPair.cardIds[1],
        pairId: targetPair.pairId,
      });

      // Remove targetPair from remainingPairs so subsequent steps never pick already-matched cards
      const remIdx = remainingPairs.findIndex((p) => p.pairId === targetPair.pairId);
      if (remIdx !== -1) {
        remainingPairs.splice(remIdx, 1);
      }
      lastWasWrong = false;
    }

    const activeSession = sessionIdRef.current;

    const executeAction = (actionIdx: number) => {
      if (!isStudioPreview || !autoDemo) return;
      if (sessionIdRef.current !== activeSession) return;

      if (actionIdx >= actionList.length) {
        // All pairs demonstrated in this cycle -> short pause, then loop with fresh deck
        setManagedAutoDemoTimeout(() => {
          if (!isStudioPreview || !autoDemo) return;
          if (sessionIdRef.current !== activeSession) return;
          startCountdownRef.current();
        }, AUTO_DEMO_CYCLE_RESTART_DELAY);
        return;
      }

      const action = actionList[actionIdx];
      const { firstCardId, secondCardId, type } = action;

      // Safety check: ensure both card slots exist and are not already matched
      const deckNow = cardsRef.current;
      const initialFirst = deckNow.find((c) => c.id === firstCardId);
      const initialSecond = deckNow.find((c) => c.id === secondCardId);
      if (!initialFirst || !initialSecond || initialFirst.isMatched || initialSecond.isMatched) {
        executeAction(actionIdx + 1);
        return;
      }

      const actionToken = `${activeSession}-${cycleNumber}-${actionIdx}`;
      autoDemoActionRef.current = {
        token: actionToken,
        firstCardId,
        secondCardId,
        type,
      };

      // Initial pause before first action starts
      const initialDelay = actionIdx === 0 ? AUTO_DEMO_INITIAL_ACTION_DELAY : 0;

      setManagedAutoDemoTimeout(() => {
        if (!isStudioPreview || !autoDemo) return;
        if (sessionIdRef.current !== activeSession) return;
        if (autoDemoActionRef.current?.token !== actionToken) return;

        const currentDeck = cardsRef.current;
        const currentFirst = currentDeck.find((c) => c.id === firstCardId);
        const currentSecond = currentDeck.find((c) => c.id === secondCardId);
        if (!currentFirst || !currentSecond || currentFirst.isMatched || currentSecond.isMatched) {
          executeAction(actionIdx + 1);
          return;
        }

        // ============================================
        // PHASE 1: FLIP FIRST CARD
        // ============================================
        console.log('[AutoDemo] ACTION START', {
          actionToken,
          type,
          firstCardId,
          secondCardId,
        });

        console.log('[MemoryMatch] FIRST FLIP', {
          firstCardId,
        });
        console.log('[AutoDemo] FIRST FLIP', {
          actionToken,
          firstCardId,
        });

        memorySounds.playCardFlip();
        setCards((prev) =>
          prev.map((c) =>
            c.id === firstCardId
              ? { ...c, isFlipped: true, isShaking: false }
              : c
          )
        );

        // STOP. Do not immediately select or flip the second card.
        // Wait AUTO_DEMO_FIRST_CARD_DELAY (600ms) for browser to paint first card face.

        // ============================================
        // PHASE 2: FLIP SECOND CARD
        // ============================================
        setManagedAutoDemoTimeout(() => {
          if (!isStudioPreview || !autoDemo) return;
          if (sessionIdRef.current !== activeSession) return;
          if (autoDemoActionRef.current?.token !== actionToken) return;

          const deckAfterFirst = cardsRef.current;
          const freshFirst = deckAfterFirst.find((c) => c.id === firstCardId);
          const freshSecond = deckAfterFirst.find((c) => c.id === secondCardId);
          if (!freshFirst || !freshSecond || freshFirst.isMatched || freshSecond.isMatched) {
            executeAction(actionIdx + 1);
            return;
          }

          console.log('[MemoryMatch] SECOND FLIP', {
            firstCardId,
            secondCardId,
            firstIsFlipped: true,
            secondIsFlipped: true,
          });
          console.log('[AutoDemo] SECOND FLIP', {
            actionToken,
            secondCardId,
          });

          memorySounds.playCardFlip();

          // Flip card B and STOP. Do NOT chain match/mismatch resolution in this callback!
          setCards((prev) =>
            prev.map((c) =>
              c.id === secondCardId
                ? { ...c, isFlipped: true, isShaking: false }
                : c
            )
          );

          // Count move
          const currentMoves = movesRef.current + 1;
          setMoves(currentMoves);
          movesRef.current = currentMoves;

          console.log('[AutoDemo] AFTER SECOND FLIP STATE', {
            actionToken,
            cards: cardsRef.current
              .filter((card) => card.id === firstCardId || card.id === secondCardId)
              .map((card) => ({
                id: card.id,
                isFlipped: card.id === secondCardId ? true : card.isFlipped,
                isMatched: card.isMatched,
              })),
          });

          // STOP. Schedule another timeout so BOTH cards remain visibly face-up.
          // Wait AUTO_DEMO_SECOND_CARD_VISIBLE (800ms).

          // ============================================
          // PHASE 3: EVALUATE & RESOLVE MATCH / MISMATCH
          // ============================================
          setManagedAutoDemoTimeout(() => {
            if (!isStudioPreview || !autoDemo) return;
            if (sessionIdRef.current !== activeSession) return;
            if (autoDemoActionRef.current?.token !== actionToken) return;

            const currentDeck = cardsRef.current;
            const resolvedFirst = currentDeck.find((c) => c.id === firstCardId);
            const resolvedSecond = currentDeck.find((c) => c.id === secondCardId);

            if (!resolvedFirst?.isFlipped || !resolvedSecond?.isFlipped) {
              console.warn('[AutoDemo] Second card was not visibly face-up before resolution', {
                firstCard: resolvedFirst,
                secondCard: resolvedSecond,
              });
            }

            if (!resolvedFirst || !resolvedSecond || resolvedFirst.isMatched || resolvedSecond.isMatched) {
              executeAction(actionIdx + 1);
              return;
            }

            console.log('[MemoryMatch] PAIR RESOLUTION', {
              type: type === 'CORRECT' ? 'MATCH' : 'MISMATCH',
              firstCardId,
              secondCardId,
            });
            console.log('[AutoDemo] RESOLVE', {
              actionToken,
              type,
            });

            if (type === 'CORRECT') {
              // Combo and score logic
              const currentStreak = comboStreakRef.current + 1;
              setComboStreak(currentStreak);
              comboStreakRef.current = currentStreak;
              setMaxComboStreak((prev) => Math.max(prev, currentStreak));

              const streakBonus = (currentStreak - 1) * comboPointsRef.current;
              const addedPoints = matchPointsRef.current + streakBonus;
              setScore((prev) => prev + addedPoints);

              memorySounds.playMatchSuccess(currentStreak);

              // Mark both cards matched (both keep isFlipped: true and isMatched: true)
              setCards((prev) =>
                prev.map((c) =>
                  c.id === firstCardId || c.id === secondCardId
                    ? { ...c, isFlipped: true, isMatched: true, isShaking: false }
                    : c
                )
              );

              const newMatched = matchedPairsCountRef.current + 1;
              setMatchedPairsCount(newMatched);
              matchedPairsCountRef.current = newMatched;

              // Pause after match resolution before advancing
              setManagedAutoDemoTimeout(() => {
                if (!isStudioPreview || !autoDemo) return;
                if (sessionIdRef.current !== activeSession) return;
                if (autoDemoActionRef.current?.token !== actionToken) return;

                executeAction(actionIdx + 1);
              }, AUTO_DEMO_AFTER_RESOLUTION);
            } else {
              // WRONG match
              // Reset combo streak
              setComboStreak(0);
              comboStreakRef.current = 0;

              // Play mismatch sound and set shaking, BOTH cards remain isFlipped: true!
              memorySounds.playMismatch();
              setCards((prev) =>
                prev.map((c) =>
                  c.id === firstCardId || c.id === secondCardId
                    ? { ...c, isFlipped: true, isShaking: true }
                    : c
                )
              );

              // Wait mismatchDelayMs while both remain visible and shaking
              const pauseDelay = mismatchDelayRef.current || 850;
              setManagedAutoDemoTimeout(() => {
                if (!isStudioPreview || !autoDemo) return;
                if (sessionIdRef.current !== activeSession) return;
                if (autoDemoActionRef.current?.token !== actionToken) return;

                // Flip both back face-down
                setCards((prev) =>
                  prev.map((c) =>
                    c.id === firstCardId || c.id === secondCardId
                      ? { ...c, isFlipped: false, isShaking: false }
                      : c
                  )
                );

                // Pause after flip-back before advancing to next action
                setManagedAutoDemoTimeout(() => {
                  if (!isStudioPreview || !autoDemo) return;
                  if (sessionIdRef.current !== activeSession) return;
                  if (autoDemoActionRef.current?.token !== actionToken) return;

                  executeAction(actionIdx + 1);
                }, AUTO_DEMO_AFTER_RESOLUTION);
              }, pauseDelay);
            }
          }, AUTO_DEMO_SECOND_CARD_VISIBLE);
        }, AUTO_DEMO_FIRST_CARD_DELAY);
      }, initialDelay);
    };

    executeAction(0);

    return () => {
      clearAutoDemoTimers();
    };
  }, [
    isStudioPreview,
    autoDemo,
    gameState,
    clearAutoDemoTimers,
    setManagedAutoDemoTimeout,
  ]);

  // Card Flip Click Handler (authoritative interactive gameplay)
  const handleCardClick = (cardId: string) => {
    if (gameState !== 'PLAYING' || isLocked) return;
    if (isStudioPreview && autoDemo) return;

    const clickedCard = cardsRef.current.find((c) => c.id === cardId);
    if (!clickedCard || clickedCard.isFlipped || clickedCard.isMatched) return;

    const currentSession = sessionIdRef.current;
    const firstCardId = firstFlippedCardIdRef.current;

    if (!firstCardId) {
      // ============================================
      // PHASE 1: FLIP FIRST CARD
      // ============================================
      firstFlippedCardIdRef.current = cardId;
      setFirstFlippedCardId(cardId);

      memorySounds.playCardFlip();
      setCards((prev) =>
        prev.map((c) =>
          c.id === cardId
            ? { ...c, isFlipped: true, isShaking: false }
            : c
        )
      );

      console.log('[MemoryMatch] FIRST FLIP', { firstCardId: cardId });
      return;
    }

    // Guard against clicking the exact same card twice
    if (firstCardId === cardId) return;

    // ============================================
    // PHASE 2: FLIP SECOND CARD
    // ============================================
    const secondCardId = cardId;
    setIsLocked(true); // Lock board immediately so player cannot click a 3rd card during evaluation
    firstFlippedCardIdRef.current = null;
    setFirstFlippedCardId(null);

    memorySounds.playCardFlip();
    setCards((prev) =>
      prev.map((c) =>
        c.id === secondCardId
          ? { ...c, isFlipped: true, isShaking: false }
          : c
      )
    );

    // Count move
    const newMoves = moves + 1;
    setMoves(newMoves);
    movesRef.current = newMoves;

    // Authoritative second-card flipped diagnostic log
    console.log('[MemoryMatch] SECOND FLIP', {
      firstCardId,
      secondCardId,
      firstIsFlipped: true,
      secondIsFlipped: true,
    });

    // ============================================
    // PHASE 3: BOTH CARDS REMAIN FACE-UP BEFORE RESOLUTION
    // ============================================
    // Allow the 350ms 3D flip animation to finish completely plus display time
    const displayDelay = Math.max(750, mismatchDelayRef.current || 850);

    const resolveTimeout = setTimeout(() => {
      activeTimeoutsRef.current.delete(resolveTimeout);
      if (sessionIdRef.current !== currentSession) return;

      const currentDeck = cardsRef.current;
      const cardA = currentDeck.find((c) => c.id === firstCardId);
      const cardB = currentDeck.find((c) => c.id === secondCardId);

      if (!cardA || !cardB || cardA.isMatched || cardB.isMatched) {
        setIsLocked(false);
        return;
      }

      const isMatch = cardA.pairId === cardB.pairId;

      console.log('[MemoryMatch] PAIR RESOLUTION', {
        type: isMatch ? 'MATCH' : 'MISMATCH',
        firstCardId,
        secondCardId,
      });

      if (isMatch) {
        // MATCH SUCCESS!
        const newStreak = comboStreak + 1;
        setComboStreak(newStreak);
        comboStreakRef.current = newStreak;
        setMaxComboStreak((prev) => Math.max(prev, newStreak));

        const streakBonus = (newStreak - 1) * comboPointsRef.current;
        const totalPoints = matchPointsRef.current + streakBonus;
        setScore((prev) => prev + totalPoints);

        memorySounds.playMatchSuccess(newStreak);

        // Mark both cards matched (both keep isFlipped: true and isMatched: true)
        setCards((prev) =>
          prev.map((c) =>
            c.id === firstCardId || c.id === secondCardId
              ? { ...c, isFlipped: true, isMatched: true, isShaking: false }
              : c
          )
        );

        const newMatchedCount = matchedPairsCount + 1;
        setMatchedPairsCount(newMatchedCount);
        matchedPairsCountRef.current = newMatchedCount;
        setIsLocked(false);

        // If all pairs matched -> VICTORY!
        if (newMatchedCount >= totalPairs) {
          handleGameOver(true);
        }
      } else {
        // MATCH FAILED (MISMATCH)!
        setComboStreak(0);
        comboStreakRef.current = 0;
        memorySounds.playMismatch();

        // Shake both cards while keeping them visibly face-up!
        setCards((prev) =>
          prev.map((c) =>
            c.id === firstCardId || c.id === secondCardId
              ? { ...c, isFlipped: true, isShaking: true }
              : c
          )
        );

        // Wait for wobble animation (400ms) before flipping back face-down
        const unflipTimeout = setTimeout(() => {
          activeTimeoutsRef.current.delete(unflipTimeout);
          if (sessionIdRef.current !== currentSession) return;

          setCards((prev) =>
            prev.map((c) =>
              c.id === firstCardId || c.id === secondCardId
                ? { ...c, isFlipped: false, isShaking: false }
                : c
            )
          );
          setIsLocked(false);
        }, 450);
        activeTimeoutsRef.current.add(unflipTimeout);
      }
    }, displayDelay);
    activeTimeoutsRef.current.add(resolveTimeout);
  };

  const handleSubmitScore = async (playerNameInput?: string | React.FormEvent) => {
    if (playerNameInput && typeof playerNameInput === 'object' && 'preventDefault' in playerNameInput) {
      playerNameInput.preventDefault();
    }
    if (isStudioPreview && autoDemo) {
      return { success: false, error: 'Auto demo scores cannot be submitted.' };
    }
    if (isEventPreview && !isEventTest) {
      return { success: false, error: 'Preview test scores are not submitted to the leaderboard.' };
    }
    if (isSubmittingScore || scoreSubmitted) return;

    const rawName = typeof playerNameInput === 'string' ? playerNameInput : playerName;
    const trimmedName = rawName.trim() || 'Player';
    setPlayerName(trimmedName);
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
      score_environment: isEventTest ? 'test' : undefined,
      is_test: isEventTest ? true : undefined,
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
        return { success: true, rank: myRank > 0 ? myRank : 1 };
      } finally {
        setIsSubmittingScore(false);
      }
    }

    // Public players must submit with publicToken; only organizer test sessions can submit via eventId
    if (!publicToken && !isEventTest) {
      setIsSubmittingScore(false);
      return { success: false, error: 'Public score submission requires a valid event token.' };
    }

    try {
      const url = publicToken
        ? `/api/public/events/${publicToken}/high-scores`
        : `/api/events/${eventId}/admin/high-scores`;

      const res = await apiFetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          player_name: trimmedName,
          score,
          session_id: sessionId,
          metadata: metadataPayload,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setScoreSubmitted(true);
        setSubmittedRank(data.rank || 1);
        fetchLeaderboard();
        setActiveEndTab('leaderboard');
        return { success: true, rank: data.rank || 1 };
      } else {
        const errData = await res.json().catch(() => ({}));
        return { success: false, error: errData.error || 'Failed to submit score' };
      }
    } catch (err: any) {
      console.error('Score submission error:', err);
      return { success: false, error: err?.message || 'Network error' };
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
    () => getEffectiveGameLayout(normalizeGameLayout(activeTheme?.layout, 'memory-match'), isPortrait, 'memory-match'),
    [activeTheme?.layout, isPortrait]
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

  const boardLayout = layout.memoryCardBoard || { visible: true, x: 50, y: 50 };
  const boardX =
    typeof boardLayout.x === 'number' && !isNaN(boardLayout.x) ? boardLayout.x : 50;
  const boardY =
    typeof boardLayout.y === 'number' && !isNaN(boardLayout.y) ? boardLayout.y : 50;

  // Show Memory Card Board only during allowed active game phases or in Studio layout editing mode.
  // When gameState === 'GAME_OVER', the board is completely removed from the rendered DOM.
  const showMemoryCardBoard =
    editableLayout ||
    gameState === 'START' ||
    gameState === 'COUNTDOWN' ||
    gameState === 'PLAYING' ||
    gameState === 'PAUSED';

  return (
    <div
      ref={viewportRef}
      className={`game-container game-viewport relative w-full h-full min-w-0 min-h-0 overflow-hidden flex items-center justify-center select-none bg-[#07130b] ${className}`}
      style={{
        backgroundColor: activeTheme?.visuals_config?.bgGradientTo || '#07130b',
        ...(customBgUrl
          ? {
              backgroundImage: `url(${customBgUrl})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center center',
            }
          : {}),
      }}
    >
      {/* Full container backdrop */}
      <div
        className="game-ui-backdrop"
        style={{
          backgroundColor: activeTheme?.visuals_config?.bgGradientTo || '#07130b',
          backgroundImage: customBgUrl
            ? `url(${customBgUrl})`
            : `radial-gradient(circle at 50% 20%, ${
                activeTheme?.visuals_config?.bgGradientFrom || 'rgba(30, 16, 53, 0.6)'
              } 0%, ${activeTheme?.visuals_config?.bgGradientTo || '#07130b'} 100%)`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
        }}
      >
        {customBgUrl && (
          <img
            src={customBgUrl}
            alt=""
            aria-hidden="true"
          />
        )}
      </div>

      {/* ========================================================================= */}
      {/* CANONICAL GAME SCALE WRAPPER: EXACT 1024x576 OR 576x1024 COORDINATE SPACE */}
      {/* ========================================================================= */}
      <div
        className="game-ui-layer relative overflow-hidden select-none"
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          width: `${designWidth}px`,
          height: `${designHeight}px`,
          minWidth: `${designWidth}px`,
          minHeight: `${designHeight}px`,
          maxWidth: `${designWidth}px`,
          maxHeight: `${designHeight}px`,
          transform: `translate(-50%, -50%) scale(${uiScale})`,
          transformOrigin: 'center center',
        }}
      >
        {/* ========================================================================= */}
        {/* 1. MAIN CARD BOARD AREA (Grid vs Random / Scattered Layout)               */}
        {/* ========================================================================= */}
        {showMemoryCardBoard && (
          boardConfig.layoutMode === 'grid' ? (
            <div
            style={{
              position: 'absolute',
              left: `${boardX}%`,
              top: `${boardY}%`,
              transform: 'translate(-50%, -50%)',
              display: 'grid',
              gridTemplateColumns: `repeat(${cols}, ${cardWidth}px)`,
              gridTemplateRows: `repeat(${rows}, ${cardHeight}px)`,
              gap: `${boardConfig.cardGap ?? 12}px`,
              justifyContent: 'center',
              alignContent: 'center',
              zIndex: editableLayout && selectedElementKey === 'memoryCardBoard' ? 45 : 10,
              touchAction: editableLayout ? 'none' : 'auto',
            }}
            onClick={(e) => {
              if (editableLayout) {
                e.stopPropagation();
                onSelectElementKey?.('memoryCardBoard');
              }
            }}
            onPointerDown={(e) => {
              if (editableLayout && onElementPointerDown) {
                e.stopPropagation();
                onElementPointerDown('memoryCardBoard', false, e);
              }
            }}
            className={`pointer-events-auto select-none ${
              editableLayout
                ? `cursor-move ${
                    selectedElementKey === 'memoryCardBoard'
                      ? 'ring-2 ring-amber-400 ring-offset-2 ring-offset-slate-950 rounded-2xl shadow-2xl'
                      : 'hover:ring-1 hover:ring-slate-400/60 rounded-2xl'
                  }`
                : ''
            }`}
          >
            {/* Studio Selection Badge */}
            {editableLayout && selectedElementKey === 'memoryCardBoard' && (
              <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-amber-500 text-slate-950 px-2 py-0.5 rounded text-[10px] font-mono font-black shadow pointer-events-none whitespace-nowrap z-50 flex items-center gap-1">
                <Move className="w-3 h-3" />
                <span>Memory Card Board</span>
                <span>
                  ({Math.round(boardX)}%, {Math.round(boardY)}%)
                </span>
              </div>
            )}

            {cards.slice(0, totalCards).map((card, index) => {
              const isFaceUp = card.isFlipped || card.isMatched;
              const cardRotationAngle =
                cardConfig?.rotationMode === 'fixed'
                  ? (cardConfig.rotation ?? 0)
                  : cardConfig?.rotationMode === 'none'
                  ? 0
                  : (card.rotation ?? 0);

              return (
                <div
                  key={card.id}
                  onClick={(e) => {
                    if (editableLayout) {
                      e.stopPropagation();
                      onSelectElementKey?.('memoryCardBoard');
                      return;
                    }
                    handleCardClick(card.id);
                  }}
                  className="relative cursor-pointer perspective-1000 select-none group transition-transform"
                  style={{
                    width: `${cardWidth}px`,
                    height: `${cardHeight}px`,
                    flex: 'none',
                    perspective: '1000px',
                    transform: `rotate(${cardRotationAngle}deg)`,
                  }}
                >
                  {/* Shake Wrapper: Isolates wobble animation from card rotation */}
                  <div
                    className={`w-full h-full ${card.isShaking ? 'animate-wobble' : ''}`}
                    style={{ transformStyle: 'preserve-3d', WebkitTransformStyle: 'preserve-3d' }}
                  >
                    {/* Card 3D Inner Wrapper */}
                    <div
                      className={`relative w-full h-full transition-transform duration-350 ease-out shadow-md ${
                        isFaceUp ? 'rotate-y-180' : 'hover:scale-[1.02] active:scale-[0.98]'
                      }`}
                      style={{
                        transformStyle: 'preserve-3d',
                        WebkitTransformStyle: 'preserve-3d',
                        transform: isFaceUp ? 'rotateY(180deg)' : 'rotateY(0deg)',
                        borderRadius: `${cardBorderRadius}px`,
                      }}
                    >
                    {/* BACK FACE (Default Face-Down State) */}
                    <div
                      className="absolute inset-0 w-full h-full border p-2 flex flex-col items-center justify-center overflow-hidden transition-all shadow-inner select-none"
                      style={{
                        backfaceVisibility: 'hidden',
                        WebkitBackfaceVisibility: 'hidden',
                        backgroundColor: activeTheme?.visuals_config?.cardBadBg || '#0f172a',
                        borderColor: activeTheme?.visuals_config?.cardBadBorder || '#334155',
                        borderRadius: `${cardBorderRadius}px`,
                        pointerEvents: isFaceUp ? 'none' : 'auto',
                        zIndex: isFaceUp ? 1 : 2,
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
                          <div className="w-8 h-8 rounded-xl bg-slate-950/80 border border-amber-500/30 flex items-center justify-center text-amber-400/80 group-hover:text-amber-300 group-hover:scale-110 transition-transform">
                            <Grid3X3 className="w-4 h-4" />
                          </div>
                        </>
                      )}
                    </div>

                    {/* FRONT FACE (Flipped Face-Up / Matched State) */}
                    <div
                      className={`absolute inset-0 w-full h-full border flex flex-col items-center justify-between p-1.5 transition-all select-none ${
                        card.isMatched
                          ? 'shadow-[0_0_15px_rgba(16,185,129,0.35)]'
                          : 'shadow-[0_0_12px_rgba(245,158,11,0.25)]'
                      }`}
                      style={{
                        backfaceVisibility: 'hidden',
                        WebkitBackfaceVisibility: 'hidden',
                        transform: 'rotateY(180deg)',
                        borderRadius: `${cardBorderRadius}px`,
                        backgroundColor: card.isMatched
                          ? effectiveCardGoodBg
                          : effectiveCardFrontBg,
                        borderColor: card.isMatched
                          ? activeTheme?.visuals_config?.cardGoodBorder || '#10b981'
                          : activeTheme?.visuals_config?.cardBadBorder || card.borderColor || '#f59e0b',
                        pointerEvents: isFaceUp ? 'auto' : 'none',
                        zIndex: isFaceUp ? 2 : 1,
                      }}
                    >
                      {/* Top Right Matched Checkmark Badge */}
                      {card.isMatched && (
                        <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-emerald-500 text-slate-950 flex items-center justify-center shadow-md animate-bounce">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                        </div>
                      )}

                      {/* Card Image or Vector Icon */}
                      <div className="flex-1 w-full min-h-0 flex items-center justify-center p-1">
                        {card.imageUrl ? (
                          <img
                            src={card.imageUrl}
                            alt={card.name}
                            className="max-h-[85%] max-w-[85%] object-contain drop-shadow-md transition-transform"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <div
                            className="p-1 rounded-xl flex items-center justify-center"
                            style={{ color: card.color || '#fbbf24' }}
                          >
                            {renderCardIcon(card.iconName, 'w-7 h-7')}
                          </div>
                        )}
                      </div>

                      {/* Card Title Label */}
                      <span className="text-[11px] font-bold text-slate-100 text-center tracking-tight truncate max-w-full px-1">
                        {card.name}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
              );
            })}
          </div>
        ) : (
          /* RANDOM / SCATTERED BOARD */
          <div
            style={{
              position: 'absolute',
              left: `${boardX}%`,
              top: `${boardY}%`,
              transform: 'translate(-50%, -50%)',
              width: `${
                boardConfig.layoutMode === 'up-down' || boardConfig.layoutMode === 'up-down-rotation'
                  ? cols * cardWidth + Math.max(0, cols - 1) * (boardConfig.cardGap ?? 12)
                  : Math.max(isPortrait ? 520 : 540, cols * cardWidth + Math.max(0, cols - 1) * (boardConfig.cardGap ?? 12))
              }px`,
              height: `${
                boardConfig.layoutMode === 'up-down' || boardConfig.layoutMode === 'up-down-rotation'
                  ? rows * cardHeight + Math.max(0, rows - 1) * (boardConfig.cardGap ?? 12) + Math.max(12, Math.round(cardHeight * 0.15)) * 2
                  : Math.max(isPortrait ? 620 : 410, rows * cardHeight + Math.max(0, rows - 1) * (boardConfig.cardGap ?? 12) + Math.round(cardHeight * 0.25))
              }px`,
              maxWidth: '100%',
              maxHeight: '100%',
              zIndex: editableLayout && selectedElementKey === 'memoryCardBoard' ? 45 : 10,
              touchAction: editableLayout ? 'none' : 'auto',
            }}
            onClick={(e) => {
              if (editableLayout) {
                e.stopPropagation();
                onSelectElementKey?.('memoryCardBoard');
              }
            }}
            onPointerDown={(e) => {
              if (editableLayout && onElementPointerDown) {
                e.stopPropagation();
                onElementPointerDown('memoryCardBoard', false, e);
              }
            }}
            className={`relative pointer-events-auto select-none ${
              editableLayout
                ? `cursor-move ${
                    selectedElementKey === 'memoryCardBoard'
                      ? 'ring-2 ring-amber-400 ring-offset-2 ring-offset-slate-950 rounded-2xl shadow-2xl'
                      : 'hover:ring-1 hover:ring-slate-400/60 rounded-2xl'
                  }`
                : ''
            }`}
          >
            {/* Studio Selection Badge */}
            {editableLayout && selectedElementKey === 'memoryCardBoard' && (
              <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-amber-500 text-slate-950 px-2 py-0.5 rounded text-[10px] font-mono font-black shadow pointer-events-none whitespace-nowrap z-50 flex items-center gap-1">
                <Move className="w-3 h-3" />
                <span>Memory Card Board</span>
                <span>
                  ({Math.round(boardX)}%, {Math.round(boardY)}%)
                </span>
              </div>
            )}

            {cards.slice(0, totalCards).map((card, index) => {
              const pos = randomPositions[index];
              if (!pos) return null;
              const isFaceUp = card.isFlipped || card.isMatched;

              return (
                <div
                  key={card.id}
                  onClick={(e) => {
                    if (editableLayout) {
                      e.stopPropagation();
                      onSelectElementKey?.('memoryCardBoard');
                      return;
                    }
                    handleCardClick(card.id);
                  }}
                  style={{
                    position: 'absolute',
                    left: `${pos.x}%`,
                    top: `${pos.y}%`,
                    width: `${cardWidth}px`,
                    height: `${cardHeight}px`,
                    flex: 'none',
                    transform: `translate(-50%, -50%) rotate(${pos.rotation}deg)`,
                    zIndex: isFaceUp ? 60 : pos.zIndex,
                  }}
                  className="cursor-pointer perspective-1000 select-none group transition-all duration-200 active:scale-95"
                >
                  {/* Shake Wrapper: Isolates wobble animation from card rotation and positioning */}
                  <div
                    className={`w-full h-full ${card.isShaking ? 'animate-wobble' : ''}`}
                    style={{ transformStyle: 'preserve-3d', WebkitTransformStyle: 'preserve-3d' }}
                  >
                    {/* Card 3D Inner Wrapper */}
                    <div
                      className={`relative w-full h-full transition-transform duration-350 ease-out shadow-md ${
                        isFaceUp ? 'rotate-y-180' : 'hover:scale-[1.02] active:scale-[0.98]'
                      }`}
                      style={{
                        transformStyle: 'preserve-3d',
                        WebkitTransformStyle: 'preserve-3d',
                        transform: isFaceUp ? 'rotateY(180deg)' : 'rotateY(0deg)',
                        borderRadius: `${cardBorderRadius}px`,
                      }}
                    >
                    {/* BACK FACE (Default Face-Down State) */}
                    <div
                      className="absolute inset-0 w-full h-full border p-2 flex flex-col items-center justify-center overflow-hidden transition-all shadow-inner select-none"
                      style={{
                        backfaceVisibility: 'hidden',
                        WebkitBackfaceVisibility: 'hidden',
                        backgroundColor: activeTheme?.visuals_config?.cardBadBg || '#0f172a',
                        borderColor: activeTheme?.visuals_config?.cardBadBorder || '#334155',
                        borderRadius: `${cardBorderRadius}px`,
                        pointerEvents: isFaceUp ? 'none' : 'auto',
                        zIndex: isFaceUp ? 1 : 2,
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
                          <div className="w-8 h-8 rounded-xl bg-slate-950/80 border border-amber-500/30 flex items-center justify-center text-amber-400/80 group-hover:text-amber-300 group-hover:scale-110 transition-transform">
                            <Grid3X3 className="w-4 h-4" />
                          </div>
                        </>
                      )}
                    </div>

                    {/* FRONT FACE (Flipped Face-Up / Matched State) */}
                    <div
                      className={`absolute inset-0 w-full h-full border flex flex-col items-center justify-between p-1.5 transition-all select-none ${
                        card.isMatched
                          ? 'shadow-[0_0_15px_rgba(16,185,129,0.35)]'
                          : 'shadow-[0_0_12px_rgba(245,158,11,0.25)]'
                      }`}
                      style={{
                        backfaceVisibility: 'hidden',
                        WebkitBackfaceVisibility: 'hidden',
                        transform: 'rotateY(180deg)',
                        borderRadius: `${cardBorderRadius}px`,
                        backgroundColor: card.isMatched
                          ? effectiveCardGoodBg
                          : effectiveCardFrontBg,
                        borderColor: card.isMatched
                          ? activeTheme?.visuals_config?.cardGoodBorder || '#10b981'
                          : activeTheme?.visuals_config?.cardBadBorder || card.borderColor || '#f59e0b',
                        pointerEvents: isFaceUp ? 'auto' : 'none',
                        zIndex: isFaceUp ? 2 : 1,
                      }}
                    >
                      {/* Top Right Matched Checkmark Badge */}
                      {card.isMatched && (
                        <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-emerald-500 text-slate-950 flex items-center justify-center shadow-md animate-bounce">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                        </div>
                      )}

                      {/* Card Image or Vector Icon */}
                      <div className="flex-1 w-full min-h-0 flex items-center justify-center p-1">
                        {card.imageUrl ? (
                          <img
                            src={card.imageUrl}
                            alt={card.name}
                            className="max-h-[85%] max-w-[85%] object-contain drop-shadow-md transition-transform"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <div
                            className="p-1 rounded-xl flex items-center justify-center"
                            style={{ color: card.color || '#fbbf24' }}
                          >
                            {renderCardIcon(card.iconName, 'w-7 h-7')}
                          </div>
                        )}
                      </div>

                      {/* Card Title Label */}
                      <span className="text-[11px] font-bold text-slate-100 text-center tracking-tight truncate max-w-full px-1">
                        {card.name}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
              );
            })}
          </div>
        ))}

        {/* ========================================================================= */}
        {/* 2. IN-GAME DYNAMIC UI LAYOUT (Positionable HUD Elements for Memory Match) */}
        {/* ========================================================================= */}
        {(gameState === 'PLAYING' || gameState === 'PAUSED' || editableLayout) && (
          <GameLayoutHudOverlay
            layout={layout}
            theme={activeTheme}
            gameType="memory-match"
            score={score}
            moves={moves}
            pairs={matchedPairsCount}
            totalPairs={totalPairs}
            timeRemaining={timeRemaining}
            editableLayout={editableLayout}
            selectedElementKey={selectedElementKey}
            onSelectElementKey={onSelectElementKey}
            onElementPointerDown={onElementPointerDown}
          />
        )}

        {/* ========================================================================= */}
        {/* 3. PERSISTENT IN-GAME CONTROLS DOCK (Top-Right)                           */}
        {/* ========================================================================= */}
        <div className="absolute top-3.5 right-4 z-40 pointer-events-auto flex items-center gap-1.5 bg-slate-950/85 backdrop-blur-sm p-1.5 rounded-xl border border-slate-700/80 shadow-lg">
          {/* Stop Game Button: Available during COUNTDOWN, PLAYING, and PAUSED */}
          {(gameState === 'COUNTDOWN' || gameState === 'PLAYING' || gameState === 'PAUSED') && (
            <button
              onClick={stopGame}
              className="p-1.5 sm:px-2 sm:py-1.5 rounded-lg bg-rose-950/80 border border-rose-600/70 text-rose-300 hover:bg-rose-900 hover:text-white transition-all font-mono text-xs font-bold flex items-center gap-1 shadow-sm active:scale-95 cursor-pointer"
              title="Stop Game (Return to Start Screen)"
              aria-label="Stop Game"
            >
              <Square className="w-3.5 h-3.5 fill-current text-rose-400" />
              <span className="hidden sm:inline">Stop</span>
            </button>
          )}

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
        {/* 4. SECONDARY GAMEPLAY COMBO BADGE                                         */}
        {/* ========================================================================= */}
        {(gameState === 'PLAYING' || gameState === 'PAUSED') && comboStreak > 1 && (
          <div className="absolute bottom-3.5 left-4 z-30 pointer-events-none flex items-center gap-2">
            <div className="bg-orange-500/20 backdrop-blur-sm border border-orange-500/40 rounded-xl px-2.5 py-1 text-orange-400 text-xs font-mono font-bold flex items-center gap-1 shadow-md animate-bounce">
              <Flame className="w-3.5 h-3.5 text-orange-400" />
              <span>{comboStreak}x Combo</span>
            </div>
          </div>
        )}

        {/* ======================================================================= */}
        {/* 5. START MATCH SCREEN MODAL                                             */}
        {/* ======================================================================= */}
        {gameState === 'START' && (
          <div className="absolute inset-0 pointer-events-auto z-30 overflow-hidden">
            <StartScreenRenderer
              startConfig={memoryConfig.screens?.start}
              theme={activeTheme}
              gameType="memory-match"
              gameMeta={{
                rows,
                cols,
                totalCards,
                totalPairs,
                duration: gameDuration,
                gameTitle,
                logoUrl: activeTheme?.branding?.clientLogoUrl || activeTheme?.clientLogo || activeTheme?.logo || null,
              }}
              onStartGame={startCountdown}
              onShowLeaderboard={() => setShowLeaderboardModal(true)}
              isEventPreview={isEventPreview}
              isEventTest={isEventTest}
              suppressBackground={true}
            />
          </div>
        )}

        {/* ======================================================================= */}
        {/* 6. COUNTDOWN OVERLAY                                                    */}
        {/* ======================================================================= */}
        {gameState === 'COUNTDOWN' && (
          <div className="absolute inset-0 w-full h-full bg-slate-950/75 backdrop-blur-sm flex flex-col items-center justify-center z-30 animate-in fade-in duration-150">
            <div className="text-7xl font-black text-amber-400 font-mono tracking-wider animate-ping">
              {countdown}
            </div>
            <p className="text-xs uppercase tracking-widest text-slate-400 font-bold mt-4">
              Get Ready!
            </p>
            <button
              onClick={stopGame}
              className="mt-6 px-3.5 py-1.5 bg-rose-950/70 hover:bg-rose-900 border border-rose-700/70 text-rose-300 hover:text-white rounded-xl text-xs font-mono font-bold flex items-center gap-1.5 transition-all shadow-md active:scale-95 cursor-pointer pointer-events-auto"
              title="Stop Countdown"
            >
              <Square className="w-3 h-3 fill-current text-rose-400" />
              <span>Stop Game</span>
            </button>
          </div>
        )}

        {/* ======================================================================= */}
        {/* 7. PAUSED OVERLAY                                                       */}
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
                <button
                  onClick={stopGame}
                  className="w-full py-2.5 bg-rose-950/50 hover:bg-rose-900/80 border border-rose-700/60 text-rose-300 hover:text-white font-bold text-xs uppercase tracking-wider rounded-xl transition-colors flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Square className="w-3.5 h-3.5 fill-current text-rose-400" />
                  <span>Stop Game</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ======================================================================= */}
        {/* 8. GAME OVER / VICTORY COMPLETION MODAL                                 */}
        {/* ======================================================================= */}
        {gameState === 'GAME_OVER' && (
          <ResultScreenRenderer
            resultConfig={memoryConfig.screens?.result}
            stats={{
              score,
              moves,
              matchedPairsCount,
              totalPairs,
              accuracyPercent,
              timeElapsedSeconds: Math.max(0, (memoryConfig.gameplay.gameDurationSeconds || 45) - timeRemaining),
              isVictory,
            }}
            theme={activeTheme}
            leaderboardData={leaderboardScores}
            loadingLeaderboard={loadingLeaderboard}
            currentPlayerName={playerName}
            isEventPreview={isEventPreview}
            isEventTest={isEventTest}
            scoreSubmitted={scoreSubmitted}
            submittedRank={submittedRank}
            isSubmittingScore={isSubmittingScore}
            onSubmitScore={handleSubmitScore}
            onAction={(action) => {
              if (action === 'playAgain') {
                startCountdown();
              } else if (action === 'exit') {
                stopGame();
              }
            }}
          />
        )}

        {/* ======================================================================= */}
        {/* 9. LEADERBOARD MODAL                                                    */}
        {/* ======================================================================= */}
        {showLeaderboardModal && (
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-5 text-slate-100 flex flex-col max-h-[85vh] shadow-2xl">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <Trophy className="w-5 h-5 text-amber-400" />
                  <h3 className="font-bold text-base">High Scores</h3>
                </div>
                <button
                  onClick={() => setShowLeaderboardModal(false)}
                  className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-200"
                >
                  <Square className="w-4 h-4" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto py-3 space-y-1.5 min-h-[160px]">
                {loadingLeaderboard ? (
                  <div className="py-8 text-slate-400 text-xs flex flex-col items-center gap-2">
                    <div className="w-5 h-5 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
                    <span>Loading Leaderboard...</span>
                  </div>
                ) : leaderboardScores.length === 0 ? (
                  <div className="py-8 text-center text-slate-400 text-xs">
                    <Trophy className="w-8 h-8 text-slate-600 mx-auto mb-2 opacity-50" />
                    <p className="font-bold text-slate-300">No Scores Yet!</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">Be the first to submit a high score!</p>
                  </div>
                ) : (
                  leaderboardScores.map((entry) => (
                    <div
                      key={entry.id}
                      className="flex items-center justify-between p-2 rounded-lg bg-slate-950/60 border border-slate-800/80 text-xs font-mono"
                    >
                      <div className="flex items-center gap-2">
                        <span className="w-5 text-slate-400 font-bold text-center">#{entry.rank}</span>
                        <span className="font-bold text-slate-200 truncate max-w-[150px]">{entry.player_name}</span>
                      </div>
                      <span className="font-bold text-amber-400">{entry.score} pts</span>
                    </div>
                  ))
                )}
              </div>
              <div className="pt-3 border-t border-slate-800 flex justify-end">
                <button
                  onClick={() => setShowLeaderboardModal(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold font-mono transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
