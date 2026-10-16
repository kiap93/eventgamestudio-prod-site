import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useLocalization } from '../../context/LocalizationContext';
import {
  Volume2,
  VolumeX,
  Maximize2,
  Minimize2,
  RotateCcw,
  Sparkles,
  Trophy,
  Play,
  CheckCircle2,
  Clock,
  Zap,
  Bomb,
  Rocket,
  Flame,
  ArrowRight,
  ChevronRight,
  Shuffle,
  Shield,
  Sun,
  Circle,
  Droplet,
  Heart,
  Star,
  Diamond,
  Hexagon,
  Boxes,
  X,
  Crown,
  Move,
  Target,
} from 'lucide-react';
import { GameComponentProps } from '../types';
import { LayoutElementKey } from '../../themes/layout';
import {
  Match3GameConfig,
  Match3GameState,
  Match3Status,
  Match3Tile,
  Match3Stats,
  SpecialTileType,
  DEFAULT_MATCH3_CONFIG,
  DEFAULT_TILE_DEFINITIONS,
  TileVisualDefinition,
} from './types';
import {
  createInitialBoard,
  cloneBoard,
  areAdjacent,
  isValidSwap,
  resolveSwap,
  hasValidMoves,
  shuffleBoard,
} from './engine';
import { match3Sounds } from './match3Sounds';
import { ResultScreenRenderer } from '../shared/ResultScreenRenderer';
import { StartScreenRenderer } from '../shared/StartScreenRenderer';
import { useResponsiveLayout } from '../../themes/responsive';
import { resolveThemeDefaultBgImage } from '../../themes';
import { EventLeaderboardEntry } from '../../types';
import { apiFetch } from '../../lib/api';

export const MATCH3_DESIGN_WIDTH = 1024;
export const MATCH3_DESIGN_HEIGHT = 576;

export interface Match3GameProps extends Partial<GameComponentProps<Match3GameConfig>> {
  className?: string;
  isSimulation?: boolean;
  editableLayout?: boolean;
  selectedElementKey?: LayoutElementKey | null;
  onSelectElementKey?: (key: LayoutElementKey) => void;
  onElementPointerDown?: (
    key: LayoutElementKey,
    isResize: boolean,
    e: React.PointerEvent<HTMLDivElement>
  ) => void;
}

interface FloatingPopup {
  id: string;
  x: number;
  y: number;
  text: string;
  color?: string;
  isCombo?: boolean;
  comboCount?: number;
  rotation?: number;
}

interface DragState {
  pointerId: number;
  startRow: number;
  startCol: number;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  dx: number;
  dy: number;
  tileWidth: number;
  tileHeight: number;
  isDragging: boolean;
  targetRow: number | null;
  targetCol: number | null;
  thresholdReached: boolean;
}

interface ActiveSwapAnimation {
  r1: number;
  c1: number;
  r2: number;
  c2: number;
  phase: 'swapping' | 'rejecting';
}

interface MatchParticle {
  id: string;
  xPct: number;
  yPct: number;
  dx: string;
  dy: string;
  color: string;
  size: number;
  char?: string;
}

interface RocketStreak {
  id: string;
  direction: 'horizontal' | 'vertical';
  index: number;
}

interface BombShockwave {
  id: string;
  xPct: number;
  yPct: number;
  color: string;
}

interface RocketBombWindUpState {
  bombRow: number;
  bombCol: number;
  rocketRow: number;
  rocketCol: number;
}

interface RocketBombAttackState {
  id: string;
  bombRow: number;
  bombCol: number;
  clearedRows: number[];
  clearedCols: number[];
}

interface DoubleBombWindUpState {
  r1: number;
  c1: number;
  r2: number;
  c2: number;
}

interface DoubleBombAttackState {
  id: string;
  centerRow: number;
  centerCol: number;
  clearedCoords: Array<{ row: number; col: number }>;
}

interface DoubleRocketWindUpState {
  r1: number;
  c1: number;
  r2: number;
  c2: number;
}

interface DoubleRocketAttackState {
  id: string;
  centerRow: number;
  centerCol: number;
}

interface ComboBannerState {
  id: string;
  title: string;
  subtitle: string;
  type?: 'rocket-bomb' | 'double-bomb' | 'double-rocket';
}

export const Match3Game: React.FC<Match3GameProps> = ({
  activeTheme,
  settings,
  config,
  eventId,
  publicToken,
  isEventPreview = false,
  isEventTest = false,
  overrideOrientation,
  isSimulation = false,
  isMuted = false,
  isFullscreen = false,
  className = '',
  onToggleFullscreen,
  onToggleMute,
  onGameStateChange,
  onStatsChange,
  editableLayout = false,
  selectedElementKey = null,
  onSelectElementKey,
  onElementPointerDown,
}) => {
  const { t } = useLocalization();

  // Active authoritative configuration
  const match3Config: Match3GameConfig = useMemo(() => {
    const rawConfig = (activeTheme?.game_config as Match3GameConfig) || config;
    const soundsConfig = activeTheme?.sounds_config;
    return {
      ...DEFAULT_MATCH3_CONFIG,
      ...rawConfig,
      rows: Math.max(5, Math.min(10, rawConfig?.rows ?? DEFAULT_MATCH3_CONFIG.rows)),
      cols: Math.max(5, Math.min(10, rawConfig?.cols ?? DEFAULT_MATCH3_CONFIG.cols)),
      tileTypesCount: Math.max(4, Math.min(8, rawConfig?.tileTypesCount ?? DEFAULT_MATCH3_CONFIG.tileTypesCount)),
      gameDurationSeconds: Math.max(10, Math.min(300, rawConfig?.gameDurationSeconds ?? DEFAULT_MATCH3_CONFIG.gameDurationSeconds)),
      minimumMatch: Math.max(3, Math.min(5, rawConfig?.minimumMatch ?? DEFAULT_MATCH3_CONFIG.minimumMatch)),
      comboEnabled: rawConfig?.comboEnabled !== undefined ? Boolean(rawConfig.comboEnabled) : DEFAULT_MATCH3_CONFIG.comboEnabled,
      specialTilesEnabled: rawConfig?.specialTilesEnabled !== undefined ? Boolean(rawConfig.specialTilesEnabled) : DEFAULT_MATCH3_CONFIG.specialTilesEnabled,
      cascadeEnabled: rawConfig?.cascadeEnabled !== undefined ? Boolean(rawConfig.cascadeEnabled) : DEFAULT_MATCH3_CONFIG.cascadeEnabled,
      shuffleWhenNoMoves: rawConfig?.shuffleWhenNoMoves !== undefined ? Boolean(rawConfig.shuffleWhenNoMoves) : DEFAULT_MATCH3_CONFIG.shuffleWhenNoMoves,
      objective: rawConfig?.objective || DEFAULT_MATCH3_CONFIG.objective,
      scoring: rawConfig?.scoring || DEFAULT_MATCH3_CONFIG.scoring,
      hazardConfig: rawConfig?.hazardConfig || DEFAULT_MATCH3_CONFIG.hazardConfig,
      soundEnabled: soundsConfig?.soundEnabled !== undefined ? Boolean(soundsConfig.soundEnabled) : (rawConfig?.soundEnabled ?? DEFAULT_MATCH3_CONFIG.soundEnabled),
      soundVolume: soundsConfig?.soundVolume !== undefined ? Number(soundsConfig.soundVolume) : (rawConfig?.soundVolume ?? DEFAULT_MATCH3_CONFIG.soundVolume),
      bgmEnabled: soundsConfig?.bgmEnabled !== undefined ? Boolean(soundsConfig.bgmEnabled) : (rawConfig?.bgmEnabled ?? DEFAULT_MATCH3_CONFIG.bgmEnabled),
    };
  }, [activeTheme, config]);

  // Sync mute & volume and custom sounds to sound manager
  useEffect(() => {
    match3Sounds.loadThemeSounds(activeTheme?.sounds_config);
    match3Sounds.setMuted(isMuted || !match3Config.soundEnabled);
    if (match3Config.soundVolume !== undefined) {
      match3Sounds.setVolume(match3Config.soundVolume);
    }
  }, [isMuted, activeTheme?.sounds_config, match3Config.soundEnabled, match3Config.soundVolume]);

  // Objective tracking state
  const objective = match3Config.objective || DEFAULT_MATCH3_CONFIG.objective;
  const [collectedTilesCount, setCollectedTilesCount] = useState<number>(0);
  const collectedTilesCountRef = useRef<number>(0);
  collectedTilesCountRef.current = collectedTilesCount;

  const [hazardsClearedCount, setHazardsClearedCount] = useState<number>(0);
  const hazardsClearedCountRef = useRef<number>(0);
  hazardsClearedCountRef.current = hazardsClearedCount;

  const [isVictory, setIsVictory] = useState<boolean>(false);

  // Game state
  const [status, setStatus] = useState<Match3Status>('ready');
  const [board, setBoard] = useState<Match3Tile[][]>(() =>
    createInitialBoard(match3Config.rows, match3Config.cols, match3Config.tileTypesCount, Math.random, {
      minimumMatch: match3Config.minimumMatch,
      specialTilesEnabled: match3Config.specialTilesEnabled,
      hazardConfig: match3Config.hazardConfig,
    })
  );

  // Synchronize board when dimensions, tile count, or hazards change while in ready/editor preview mode
  useEffect(() => {
    if (status === 'ready') {
      setBoard(
        createInitialBoard(match3Config.rows, match3Config.cols, match3Config.tileTypesCount, Math.random, {
          minimumMatch: match3Config.minimumMatch,
          specialTilesEnabled: match3Config.specialTilesEnabled,
          hazardConfig: match3Config.hazardConfig,
        })
      );
      setRemainingTime(match3Config.gameDurationSeconds);
    }
  }, [
    status,
    match3Config.rows,
    match3Config.cols,
    match3Config.tileTypesCount,
    match3Config.minimumMatch,
    match3Config.specialTilesEnabled,
    match3Config.hazardConfig?.enabled,
    match3Config.hazardConfig?.initialCount,
    match3Config.hazardConfig?.type,
    match3Config.gameDurationSeconds,
  ]);

  // Handle BGM lifecycle
  useEffect(() => {
    if (status === 'playing' && match3Config.bgmEnabled && !isMuted && match3Config.soundEnabled) {
      match3Sounds.startBgm();
    } else {
      match3Sounds.stopBgm();
    }
    return () => {
      match3Sounds.stopBgm();
    };
  }, [status, match3Config.bgmEnabled, isMuted, match3Config.soundEnabled]);

  const [score, setScore] = useState<number>(0);
  const [combo, setCombo] = useState<number>(0);
  const [bestCombo, setBestCombo] = useState<number>(0);
  const [matchesCount, setMatchesCount] = useState<number>(0);
  const [specialsCreatedCount, setSpecialsCreatedCount] = useState<number>(0);
  const [remainingTime, setRemainingTime] = useState<number>(match3Config.gameDurationSeconds);
  const [countdownValue, setCountdownValue] = useState<number>(3);
  const [selectedCoord, setSelectedCoord] = useState<{ row: number; col: number } | null>(null);
  const [isInvalidSwapAnim, setIsInvalidSwapAnim] = useState<{ r1: number; c1: number; r2: number; c2: number } | null>(null);
  const [clearingCoords, setClearingCoords] = useState<Set<string>>(new Set());
  const [droppingCoords, setDroppingCoords] = useState<Set<string>>(new Set());
  const [popups, setPopups] = useState<FloatingPopup[]>([]);
  const [isShufflingNotice, setIsShufflingNotice] = useState<boolean>(false);
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});

  // Candy Crush drag & animation states
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [activeSwapAnim, setActiveSwapAnim] = useState<ActiveSwapAnimation | null>(null);
  const [isSwapAnimating, setIsSwapAnimating] = useState<boolean>(false);
  const [particles, setParticles] = useState<MatchParticle[]>([]);
  const [rocketStreaks, setRocketStreaks] = useState<RocketStreak[]>([]);
  const [bombShockwaves, setBombShockwaves] = useState<BombShockwave[]>([]);

  // Dedicated Special Combo Effect States
  const [rocketBombWindUp, setRocketBombWindUp] = useState<RocketBombWindUpState | null>(null);
  const [rocketBombAttack, setRocketBombAttack] = useState<RocketBombAttackState | null>(null);
  const [doubleBombWindUp, setDoubleBombWindUp] = useState<DoubleBombWindUpState | null>(null);
  const [doubleBombAttack, setDoubleBombAttack] = useState<DoubleBombAttackState | null>(null);
  const [doubleRocketWindUp, setDoubleRocketWindUp] = useState<DoubleRocketWindUpState | null>(null);
  const [doubleRocketAttack, setDoubleRocketAttack] = useState<DoubleRocketAttackState | null>(null);
  const [comboBanner, setComboBanner] = useState<ComboBannerState | null>(null);
  const [isComboShaking, setIsComboShaking] = useState<boolean>(false);

  // Synchronous refs for 0-latency pointer event handling
  const dragStateRef = useRef<DragState | null>(null);
  const isSwapAnimatingRef = useRef<boolean>(false);
  const wasDraggedRef = useRef<boolean>(false);

  // Leaderboard & submission
  const [sessionId, setSessionId] = useState<string>(
    () => `m3_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
  );
  const [playerName, setPlayerName] = useState<string>('');
  const [scoreSubmitted, setScoreSubmitted] = useState<boolean>(false);
  const [submittedRank, setSubmittedRank] = useState<number | null>(null);
  const [isSubmittingScore, setIsSubmittingScore] = useState<boolean>(false);
  const [leaderboardScores, setLeaderboardScores] = useState<EventLeaderboardEntry[]>([]);
  const [loadingLeaderboard, setLoadingLeaderboard] = useState<boolean>(false);
  const [leaderboardError, setLeaderboardError] = useState<string | null>(null);
  const [showLeaderboardModal, setShowLeaderboardModal] = useState<boolean>(false);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const mainRef = useRef<HTMLElement | null>(null);
  const [boardSize, setBoardSize] = useState<number>(0);

  // Responsive layout calculation
  const orientationPreference = overrideOrientation || activeTheme?.layout?.orientation || 'auto';
  const responsive = useResponsiveLayout(containerRef, orientationPreference);

  // Authoritatively compute strictly square board size: boardWidth === boardHeight === Math.min(availableWidth, availableHeight)
  const measureBoard = useCallback(() => {
    const el = mainRef.current;
    if (!el) return;

    const rect = typeof el.getBoundingClientRect === 'function' ? el.getBoundingClientRect() : { width: 0, height: 0 };
    const style = typeof window !== 'undefined' && typeof window.getComputedStyle === 'function' ? window.getComputedStyle(el) : null;
    const padX = style ? (parseFloat(style.paddingLeft || '0') + parseFloat(style.paddingRight || '0')) : 0;
    const padY = style ? (parseFloat(style.paddingTop || '0') + parseFloat(style.paddingBottom || '0')) : 0;
    const availableWidth = Math.max(160, Math.floor((rect.width || 0) - padX));
    const availableHeight = Math.max(160, Math.floor((rect.height || 0) - padY));
    const calculatedSize = Math.floor(Math.min(availableWidth, availableHeight));

    if (calculatedSize > 0) {
      setBoardSize((prev) => (Math.abs(prev - calculatedSize) > 1 ? calculatedSize : prev));
    }
  }, []);

  useEffect(() => {
    measureBoard();
    const el = mainRef.current;
    if (!el) return;

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const cr = entry.contentRect;
          if (cr.width > 0 && cr.height > 0) {
            const calculatedSize = Math.floor(Math.min(cr.width, cr.height));
            if (calculatedSize > 0) {
              setBoardSize((prev) => (Math.abs(prev - calculatedSize) > 1 ? calculatedSize : prev));
            }
          }
        }
      });
      ro.observe(el);
    }

    window.addEventListener('resize', measureBoard);
    return () => {
      if (ro) ro.disconnect();
      window.removeEventListener('resize', measureBoard);
    };
  }, [status, measureBoard]);

  // Fallback board size if not yet measured by ResizeObserver
  const fallbackBoardSize = useMemo(() => {
    const w = (responsive.width || (typeof window !== 'undefined' ? window.innerWidth : 800)) - 32;
    const h = (responsive.height || (typeof window !== 'undefined' ? window.innerHeight : 600)) - 130;
    return Math.max(200, Math.floor(Math.min(w, h)));
  }, [responsive.width, responsive.height]);

  const activeBoardSize = boardSize > 0 ? boardSize : fallbackBoardSize;

  const timerRef = useRef<any>(null);
  const gameOverTimeoutRef = useRef<any>(null);
  const swapTokenRef = useRef<number>(0);
  const statusRef = useRef<Match3Status>(status);
  statusRef.current = status;
  const remainingTimeRef = useRef<number>(remainingTime);
  remainingTimeRef.current = remainingTime;
  const scoreRef = useRef<number>(score);
  scoreRef.current = score;

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (gameOverTimeoutRef.current) clearTimeout(gameOverTimeoutRef.current);
      setRocketBombWindUp(null);
      setRocketBombAttack(null);
      setDoubleBombWindUp(null);
      setDoubleBombAttack(null);
      setDoubleRocketWindUp(null);
      setDoubleRocketAttack(null);
      setComboBanner(null);
      setIsComboShaking(false);
    };
  }, []);

  // Propagate game state change
  useEffect(() => {
    if (onGameStateChange) {
      if (status === 'playing' || status === 'resolving') {
        onGameStateChange('PLAYING');
      } else if (status === 'game_over' || status === 'result') {
        onGameStateChange('GAME_OVER');
      } else {
        onGameStateChange('IDLE');
      }
    }
  }, [status, onGameStateChange]);

  // Propagate stats change
  useEffect(() => {
    if (onStatsChange) {
      onStatsChange({
        score,
        lives: 1,
        timeElapsed: match3Config.gameDurationSeconds - remainingTime,
        rating: { tier: 'Pro', stars: 3, label: 'Match-3 Master' },
      });
    }
  }, [score, remainingTime, match3Config.gameDurationSeconds, onStatsChange]);

  // Countdown timer
  useEffect(() => {
    if (status !== 'countdown') return;

    match3Sounds.playCountdown(countdownValue);
    if (countdownValue > 0) {
      const timer = setTimeout(() => {
        setCountdownValue((prev) => prev - 1);
      }, 900);
      return () => clearTimeout(timer);
    } else {
      const timer = setTimeout(() => {
        setStatus('playing');
        setRemainingTime(match3Config.gameDurationSeconds);
        remainingTimeRef.current = match3Config.gameDurationSeconds;
      }, 400);
      return () => clearTimeout(timer);
    }
  }, [status, countdownValue, match3Config.gameDurationSeconds]);

  // Main gameplay clock - stays active continuously during both playing and resolving
  const isGameActive = status === 'playing' || status === 'resolving';
  useEffect(() => {
    if (!isGameActive) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    const interval = setInterval(() => {
      setRemainingTime((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          remainingTimeRef.current = 0;
          let wonOnTimeout = false;
          if (objective.type === 'score') {
            wonOnTimeout = scoreRef.current >= (objective.targetScore || 10000);
          } else if (objective.type === 'collect') {
            wonOnTimeout = collectedTilesCountRef.current >= (objective.targetCollectCount || 30);
          } else if (objective.type === 'remove') {
            wonOnTimeout = hazardsClearedCountRef.current >= (objective.targetHazardCount || 3);
          }
          setIsVictory(wonOnTimeout);
          setStatus('game_over');
          if (gameOverTimeoutRef.current) clearTimeout(gameOverTimeoutRef.current);
          gameOverTimeoutRef.current = setTimeout(() => {
            setStatus('result');
          }, 1400);
          return 0;
        }
        const nextTime = prev - 1;
        remainingTimeRef.current = nextTime;
        return nextTime;
      });
    }, 1000);

    timerRef.current = interval;
    return () => clearInterval(interval);
  }, [isGameActive]);

  // Start game handler
  const handleStartGame = () => {
    // Invalidate any in-flight swaps and clear pending timeouts
    swapTokenRef.current++;
    if (timerRef.current) clearInterval(timerRef.current);
    if (gameOverTimeoutRef.current) clearTimeout(gameOverTimeoutRef.current);
    gameOverTimeoutRef.current = null;

    setScore(0);
    scoreRef.current = 0;
    setCombo(0);
    setBestCombo(0);
    setMatchesCount(0);
    setSpecialsCreatedCount(0);
    setCollectedTilesCount(0);
    collectedTilesCountRef.current = 0;
    setHazardsClearedCount(0);
    hazardsClearedCountRef.current = 0;
    setIsVictory(false);
    setRemainingTime(match3Config.gameDurationSeconds);
    remainingTimeRef.current = match3Config.gameDurationSeconds;
    setSelectedCoord(null);
    setClearingCoords(new Set());
    setDroppingCoords(new Set());
    setActiveSwapAnim(null);
    setIsSwapAnimating(false);
    isSwapAnimatingRef.current = false;
    dragStateRef.current = null;
    setDragState(null);
    wasDraggedRef.current = false;
    setParticles([]);
    setRocketStreaks([]);
    setBombShockwaves([]);
    setRocketBombWindUp(null);
    setRocketBombAttack(null);
    setComboBanner(null);
    setIsComboShaking(false);
    setPopups([]);
    setScoreSubmitted(false);
    setSubmittedRank(null);
    setSessionId(`m3_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`);
    setBoard(
      createInitialBoard(match3Config.rows, match3Config.cols, match3Config.tileTypesCount, Math.random, {
        minimumMatch: match3Config.minimumMatch,
        specialTilesEnabled: match3Config.specialTilesEnabled,
        hazardConfig: match3Config.hazardConfig,
      })
    );
    setCountdownValue(3);
    setStatus('countdown');
  };

  // Check no-move shuffle during play
  const checkAndShuffleIfNeeded = useCallback((currentB: Match3Tile[][]) => {
    if (!match3Config.shuffleWhenNoMoves) return;
    if (!hasValidMoves(currentB, {
      minimumMatch: match3Config.minimumMatch,
      specialTilesEnabled: match3Config.specialTilesEnabled,
      hazardConfig: match3Config.hazardConfig,
    })) {
      setIsShufflingNotice(true);
      match3Sounds.playShuffle();
      setTimeout(() => {
        setBoard((prev) =>
          shuffleBoard(prev, match3Config.tileTypesCount, Math.random, {
            minimumMatch: match3Config.minimumMatch,
            specialTilesEnabled: match3Config.specialTilesEnabled,
            hazardConfig: match3Config.hazardConfig,
          })
        );
        setIsShufflingNotice(false);
      }, 800);
    }
  }, [match3Config.shuffleWhenNoMoves, match3Config.tileTypesCount, match3Config.minimumMatch, match3Config.specialTilesEnabled, match3Config.hazardConfig]);

  // Trigger floating arcade score popup
  const addPopup = (x: number, y: number, text: string, color?: string, isCombo?: boolean, comboCount?: number) => {
    const id = `pop_${Date.now()}_${Math.random()}`;
    const rotation = (Math.random() - 0.5) * 8;
    setPopups((prev) => [...prev, { id, x, y, text, color, isCombo, comboCount, rotation }]);
    setTimeout(() => {
      setPopups((prev) => prev.filter((p) => p.id !== id));
    }, 850);
  };

  // Spawns lightweight sparkle particles around matched tiles
  const spawnParticlesForCoords = (
    coords: Array<{ row: number; col: number; special?: SpecialTileType | null }>,
    isColorBomb = false
  ) => {
    const newParticles: MatchParticle[] = [];
    const colors = isColorBomb
      ? ['#ec4899', '#f59e0b', '#3b82f6', '#10b981', '#8b5cf6', '#f43f5e']
      : ['#fbbf24', '#fef08a', '#ffffff', '#60a5fa', '#34d399'];

    coords.forEach((c) => {
      const centerX = ((c.col + 0.5) / match3Config.cols) * 100;
      const centerY = ((c.row + 0.5) / match3Config.rows) * 100;
      const count = isColorBomb ? 8 : 5;

      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const dist = 22 + Math.random() * 32;
        const dx = `${Math.cos(angle) * dist}px`;
        const dy = `${Math.sin(angle) * dist}px`;
        const color = colors[Math.floor(Math.random() * colors.length)];
        const chars = ['✦', '★', '✨', '●'];
        const char = chars[Math.floor(Math.random() * chars.length)];

        newParticles.push({
          id: `p_${Date.now()}_${Math.random()}`,
          xPct: centerX,
          yPct: centerY,
          dx,
          dy,
          color,
          size: 10 + Math.random() * 8,
          char,
        });
      }
    });

    if (newParticles.length > 0) {
      setParticles((prev) => [...prev.slice(-30), ...newParticles]);
      setTimeout(() => {
        const idsToRemove = new Set(newParticles.map((p) => p.id));
        setParticles((prev) => prev.filter((p) => !idsToRemove.has(p.id)));
      }, 500);
    }
  };

  // Triggers rocket beam visual streaks across cleared rows/cols
  const triggerRocketStreaks = (
    clearedCoords: Array<{ row: number; col: number; special?: SpecialTileType | null }>
  ) => {
    const newStreaks: RocketStreak[] = [];
    clearedCoords.forEach((c) => {
      if (c.special === 'rocket-horizontal') {
        newStreaks.push({ id: `rh_${Date.now()}_${c.row}`, direction: 'horizontal', index: c.row });
      } else if (c.special === 'rocket-vertical') {
        newStreaks.push({ id: `rv_${Date.now()}_${c.col}`, direction: 'vertical', index: c.col });
      }
    });
    if (newStreaks.length > 0) {
      setRocketStreaks((prev) => [...prev, ...newStreaks]);
      setTimeout(() => {
        const streakIds = new Set(newStreaks.map((s) => s.id));
        setRocketStreaks((prev) => prev.filter((s) => !streakIds.has(s.id)));
      }, 350);
    }
  };

  // Triggers bomb radial shockwave rings
  const triggerBombShockwave = (
    clearedCoords: Array<{ row: number; col: number; special?: SpecialTileType | null }>
  ) => {
    const newShockwaves: BombShockwave[] = [];
    clearedCoords.forEach((c) => {
      if (c.special === 'bomb' || c.special === 'color-bomb') {
        newShockwaves.push({
          id: `bomb_${Date.now()}_${c.row}_${c.col}`,
          xPct: ((c.col + 0.5) / match3Config.cols) * 100,
          yPct: ((c.row + 0.5) / match3Config.rows) * 100,
          color: c.special === 'color-bomb' ? '#ec4899' : '#f43f5e',
        });
      }
    });
    if (newShockwaves.length > 0) {
      setBombShockwaves((prev) => [...prev, ...newShockwaves]);
      setTimeout(() => {
        const shockIds = new Set(newShockwaves.map((s) => s.id));
        setBombShockwaves((prev) => prev.filter((s) => !shockIds.has(s.id)));
      }, 400);
    }
  };

  // Spawns energetic fiery spark and ember particles for Rocket + Bomb mega combo
  const spawnRocketBombParticles = (
    bombRow: number,
    bombCol: number,
    clearedRows: number[],
    clearedCols: number[]
  ) => {
    const newParticles: MatchParticle[] = [];
    const colors = ['#f59e0b', '#fbbf24', '#fef08a', '#ef4444', '#ffffff', '#fb923c'];
    const bombXPct = ((bombCol + 0.5) / match3Config.cols) * 100;
    const bombYPct = ((bombRow + 0.5) / match3Config.rows) * 100;

    // Epic radial burst from bomb center
    for (let i = 0; i < 22; i++) {
      const angle = (i / 22) * Math.PI * 2 + (Math.random() - 0.5) * 0.25;
      const dist = 32 + Math.random() * 45;
      const dx = `${Math.cos(angle) * dist}px`;
      const dy = `${Math.sin(angle) * dist}px`;
      const color = colors[Math.floor(Math.random() * colors.length)];
      const chars = ['✦', '★', '🔥', '✨', '⚡'];
      const char = chars[Math.floor(Math.random() * chars.length)];

      newParticles.push({
        id: `p_rb_${Date.now()}_${i}_${Math.random()}`,
        xPct: bombXPct,
        yPct: bombYPct,
        dx,
        dy,
        color,
        size: 13 + Math.random() * 9,
        char,
      });
    }

    if (newParticles.length > 0) {
      setParticles((prev) => [...prev.slice(-30), ...newParticles]);
      setTimeout(() => {
        const idsToRemove = new Set(newParticles.map((p) => p.id));
        setParticles((prev) => prev.filter((p) => !idsToRemove.has(p.id)));
      }, 550);
    }
  };

  // Spawns fiery volcanic particles for Double Bomb mega explosion
  const spawnDoubleBombParticles = (centerRow: number, centerCol: number) => {
    const newParticles: MatchParticle[] = [];
    const colors = ['#f43f5e', '#ef4444', '#fb923c', '#f59e0b', '#fef08a', '#ffffff'];
    const centerXPct = ((centerCol + 0.5) / match3Config.cols) * 100;
    const centerYPct = ((centerRow + 0.5) / match3Config.rows) * 100;

    for (let i = 0; i < 28; i++) {
      const angle = (i / 28) * Math.PI * 2 + (Math.random() - 0.5) * 0.2;
      const dist = 38 + Math.random() * 55;
      const dx = `${Math.cos(angle) * dist}px`;
      const dy = `${Math.sin(angle) * dist}px`;
      const color = colors[Math.floor(Math.random() * colors.length)];
      const chars = ['💥', '🔥', '✦', '★', '⚡'];
      const char = chars[Math.floor(Math.random() * chars.length)];

      newParticles.push({
        id: `p_bb_${Date.now()}_${i}_${Math.random()}`,
        xPct: centerXPct,
        yPct: centerYPct,
        dx,
        dy,
        color,
        size: 14 + Math.random() * 10,
        char,
      });
    }

    if (newParticles.length > 0) {
      setParticles((prev) => [...prev.slice(-30), ...newParticles]);
      setTimeout(() => {
        const idsToRemove = new Set(newParticles.map((p) => p.id));
        setParticles((prev) => prev.filter((p) => !idsToRemove.has(p.id)));
      }, 600);
    }
  };

  // Spawns electric crossfire particles for Double Rocket combo
  const spawnDoubleRocketParticles = (centerRow: number, centerCol: number) => {
    const newParticles: MatchParticle[] = [];
    const colors = ['#38bdf8', '#0284c7', '#60a5fa', '#3b82f6', '#ffffff', '#e0f2fe'];
    const centerXPct = ((centerCol + 0.5) / match3Config.cols) * 100;
    const centerYPct = ((centerRow + 0.5) / match3Config.rows) * 100;

    // Cross impact particles
    for (let i = 0; i < 24; i++) {
      const angle = (i / 24) * Math.PI * 2 + (Math.random() - 0.5) * 0.25;
      const dist = 30 + Math.random() * 45;
      const dx = `${Math.cos(angle) * dist}px`;
      const dy = `${Math.sin(angle) * dist}px`;
      const color = colors[Math.floor(Math.random() * colors.length)];
      const chars = ['⚡', '✦', '✨', '★'];
      const char = chars[Math.floor(Math.random() * chars.length)];

      newParticles.push({
        id: `p_rr_${Date.now()}_${i}_${Math.random()}`,
        xPct: centerXPct,
        yPct: centerYPct,
        dx,
        dy,
        color,
        size: 13 + Math.random() * 8,
        char,
      });
    }

    if (newParticles.length > 0) {
      setParticles((prev) => [...prev.slice(-30), ...newParticles]);
      setTimeout(() => {
        const idsToRemove = new Set(newParticles.map((p) => p.id));
        setParticles((prev) => prev.filter((p) => !idsToRemove.has(p.id)));
      }, 550);
    }
  };

  // Perform swap execution & step animations
  const executeSwap = useCallback(async (r1: number, c1: number, r2: number, c2: number) => {
    if (statusRef.current !== 'playing' || remainingTimeRef.current <= 0) return;

    if (!isValidSwap(board, r1, c1, r2, c2, {
      minimumMatch: match3Config.minimumMatch,
      specialTilesEnabled: match3Config.specialTilesEnabled,
    })) {
      match3Sounds.playInvalid();
      setIsInvalidSwapAnim({ r1, c1, r2, c2 });
      setTimeout(() => {
        setIsInvalidSwapAnim(null);
      }, 400);
      return;
    }

    const thisSwapToken = ++swapTokenRef.current;
    setStatus('resolving');
    setSelectedCoord(null);

    const resolution = resolveSwap(
      board,
      r1,
      c1,
      r2,
      c2,
      match3Config.tileTypesCount,
      match3Config.scoring,
      Math.random,
      {
        minimumMatch: match3Config.minimumMatch,
        comboEnabled: match3Config.comboEnabled,
        specialTilesEnabled: match3Config.specialTilesEnabled,
        cascadeEnabled: match3Config.cascadeEnabled,
        hazardConfig: match3Config.hazardConfig,
      }
    );

    // Initial visual swap
    const swappedInit = cloneBoard(board);
    const t1 = { ...swappedInit[r1][c1] };
    const t2 = { ...swappedInit[r2][c2] };
    swappedInit[r1][c1] = { ...t2, row: r1, col: c1 };
    swappedInit[r2][c2] = { ...t1, row: r2, col: c2 };
    setBoard(swappedInit);

    // Detect dedicated special combos
    const isRocketBomb = Boolean(
      resolution.isSpecialCombo &&
      resolution.specialComboType === 'rocket-bomb'
    );
    const isDoubleBomb = Boolean(
      resolution.isSpecialCombo &&
      resolution.specialComboType === 'double-bomb'
    );
    const isDoubleRocket = Boolean(
      resolution.isSpecialCombo &&
      resolution.specialComboType === 'double-rocket'
    );

    if (isRocketBomb) {
      const details = resolution.specialComboDetails;
      const bombRow = details?.bombRow ?? (swappedInit[r1][c1].special === 'bomb' ? r1 : r2);
      const bombCol = details?.bombCol ?? (swappedInit[r1][c1].special === 'bomb' ? c1 : c2);
      const rocketRow = details?.rocketRow ?? (swappedInit[r1][c1].special?.includes('rocket') ? r1 : r2);
      const rocketCol = details?.rocketCol ?? (swappedInit[r1][c1].special?.includes('rocket') ? c1 : c2);
      const clearedRows = details?.clearedRows || [bombRow - 1, bombRow, bombRow + 1].filter((r) => r >= 0 && r < match3Config.rows);
      const clearedCols = details?.clearedCols || [bombCol - 1, bombCol, bombCol + 1].filter((c) => c >= 0 && c < match3Config.cols);

      // Phase 1: Clear combo wind-up (enlarge, energy connection, bright pulse)
      match3Sounds.playRocketBombWindUp();
      setRocketBombWindUp({ bombRow, bombCol, rocketRow, rocketCol });
      await new Promise((res) => setTimeout(res, 280));
      if (swapTokenRef.current !== thisSwapToken) return;
      setRocketBombWindUp(null);

      // Phase 2: Detonation audio, screen shake, and combo banner
      match3Sounds.playRocketBombDetonation();
      setIsComboShaking(true);
      setTimeout(() => setIsComboShaking(false), 360);

      const bannerId = `banner_${Date.now()}`;
      setComboBanner({
        id: bannerId,
        title: 'ROCKET + BOMB!',
        subtitle: 'TRIPLE ROW & COLUMN SWEEP!',
        type: 'rocket-bomb',
      });
      setTimeout(() => {
        setComboBanner((prev) => (prev?.id === bannerId ? null : prev));
      }, 1150);

      // Phase 3: Launch multiple horizontal and vertical rockets + explosion shockwaves
      const attackId = `attack_${Date.now()}`;
      setRocketBombAttack({
        id: attackId,
        bombRow,
        bombCol,
        clearedRows,
        clearedCols,
      });
      spawnRocketBombParticles(bombRow, bombCol, clearedRows, clearedCols);
      setTimeout(() => {
        setRocketBombAttack((prev) => (prev?.id === attackId ? null : prev));
      }, 550);
    } else if (isDoubleBomb) {
      const details = resolution.specialComboDetails;
      const centerRow = details?.centerRow ?? r2;
      const centerCol = details?.centerCol ?? c2;
      const clearedCoords = (resolution.steps[0]?.clearedCoords || []).map((c) => ({
        row: c.row,
        col: c.col,
      }));

      // Phase 1: Compression and charging wind-up between both bombs
      match3Sounds.playDoubleBombWindUp();
      setDoubleBombWindUp({ r1, c1, r2, c2 });
      await new Promise((res) => setTimeout(res, 280));
      if (swapTokenRef.current !== thisSwapToken) return;
      setDoubleBombWindUp(null);

      // Phase 2: Detonation audio, heavy screen shake, and DOUBLE BOMB combo banner
      match3Sounds.playDoubleBombDetonation();
      setIsComboShaking(true);
      setTimeout(() => setIsComboShaking(false), 420);

      const bannerId = `banner_${Date.now()}`;
      setComboBanner({
        id: bannerId,
        title: 'DOUBLE BOMB!',
        subtitle: 'MEGA BLAST!',
        type: 'double-bomb',
      });
      setTimeout(() => {
        setComboBanner((prev) => (prev?.id === bannerId ? null : prev));
      }, 1150);

      // Phase 3: Mega explosion attack centered on combination's attack center
      const attackId = `attack_${Date.now()}`;
      setDoubleBombAttack({
        id: attackId,
        centerRow,
        centerCol,
        clearedCoords,
      });
      spawnDoubleBombParticles(centerRow, centerCol);
      setTimeout(() => {
        setDoubleBombAttack((prev) => (prev?.id === attackId ? null : prev));
      }, 580);
    } else if (isDoubleRocket) {
      const details = resolution.specialComboDetails;
      const centerRow = details?.centerRow ?? r2;
      const centerCol = details?.centerCol ?? c2;

      // Phase 1: Rocket ignition and charging wind-up between both rockets
      match3Sounds.playDoubleRocketWindUp();
      setDoubleRocketWindUp({ r1, c1, r2, c2 });
      await new Promise((res) => setTimeout(res, 260));
      if (swapTokenRef.current !== thisSwapToken) return;
      setDoubleRocketWindUp(null);

      // Phase 2: Crossfire launch audio, screen shake, and DOUBLE ROCKET combo banner
      match3Sounds.playDoubleRocketFire();
      setIsComboShaking(true);
      setTimeout(() => setIsComboShaking(false), 340);

      const bannerId = `banner_${Date.now()}`;
      setComboBanner({
        id: bannerId,
        title: 'DOUBLE ROCKET!',
        subtitle: 'CROSSFIRE STRIKE!',
        type: 'double-rocket',
      });
      setTimeout(() => {
        setComboBanner((prev) => (prev?.id === bannerId ? null : prev));
      }, 1150);

      // Phase 3: Launch cross-shaped horizontal & vertical laser beams with impact flash
      const attackId = `attack_${Date.now()}`;
      setDoubleRocketAttack({
        id: attackId,
        centerRow,
        centerCol,
      });
      spawnDoubleRocketParticles(centerRow, centerCol);
      setTimeout(() => {
        setDoubleRocketAttack((prev) => (prev?.id === attackId ? null : prev));
      }, 550);
    } else {
      await new Promise((res) => setTimeout(res, 120));
      if (swapTokenRef.current !== thisSwapToken) return;
    }

    // Maintain local visual board across cascade steps to accurately detect moving/spawning tiles
    let previousVisualBoard: Match3Tile[][] = swappedInit;

    // Iterate through cascade steps
    let currentScoreAccum = score;
    for (let i = 0; i < resolution.steps.length; i++) {
      if (swapTokenRef.current !== thisSwapToken) return;

      const step = resolution.steps[i];

      // Mark clearing tiles
      const stepClearing = new Set<string>();
      step.clearedCoords.forEach((c) => stepClearing.add(`${c.row},${c.col}`));
      setClearingCoords(stepClearing);

      // Audio and special FX based on step contents
      if (i === 0 && (isRocketBomb || isDoubleBomb || isDoubleRocket)) {
        // Handled by our dedicated high-impact combo attack visuals and sound
      } else {
        const hasRocket = step.clearedCoords.some((c) => c.special?.includes('rocket'));
        const hasBomb = step.clearedCoords.some((c) => c.special === 'bomb');
        const hasColorBomb = step.clearedCoords.some((c) => c.special === 'color-bomb');

        spawnParticlesForCoords(step.clearedCoords, hasColorBomb);
        if (hasRocket) triggerRocketStreaks(step.clearedCoords);
        if (hasBomb || hasColorBomb) triggerBombShockwave(step.clearedCoords);

        if (hasColorBomb) {
          match3Sounds.playColorBomb();
        } else if (hasBomb) {
          match3Sounds.playBomb();
        } else if (hasRocket) {
          match3Sounds.playRocket();
        } else {
          match3Sounds.playMatch(step.combo);
        }
      }

      currentScoreAccum += step.scoreGained;
      setScore(currentScoreAccum);
      scoreRef.current = currentScoreAccum;
      setCombo(step.combo);
      setBestCombo((prev) => Math.max(prev, step.combo));
      setMatchesCount((prev) => prev + step.matchesCount);
      setSpecialsCreatedCount((prev) => prev + step.specialsCreated.length);

      if (step.hazardsClearedCount && step.hazardsClearedCount > 0) {
        match3Sounds.playHazardClear();
        setHazardsClearedCount((prev) => {
          const next = prev + step.hazardsClearedCount!;
          hazardsClearedCountRef.current = next;
          return next;
        });
      }

      if (step.clearedTileTypes) {
        const targetTile = objective.targetTileType || 'tile-01';
        if (step.clearedTileTypes[targetTile]) {
          const count = step.clearedTileTypes[targetTile];
          setCollectedTilesCount((prev) => {
            const next = prev + count;
            collectedTilesCountRef.current = next;
            return next;
          });
        }
      }

      // Add arcade popup at anchor
      if (step.clearedCoords.length > 0) {
        const isDedicatedCombo = i === 0 && (isRocketBomb || isDoubleBomb || isDoubleRocket);
        const anchor = isDedicatedCombo && resolution.specialComboDetails
          ? {
              col: resolution.specialComboDetails.centerCol ?? step.clearedCoords[0].col,
              row: resolution.specialComboDetails.centerRow ?? step.clearedCoords[0].row,
            }
          : step.clearedCoords[0];
        const isCombo = isDedicatedCombo || step.combo > 1;
        const comboTxt = (i === 0 && isRocketBomb)
          ? 'ROCKET + BOMB! '
          : (i === 0 && isDoubleBomb)
          ? 'DOUBLE BOMB! '
          : (i === 0 && isDoubleRocket)
          ? 'DOUBLE ROCKET! '
          : isCombo
          ? `COMBO x${step.combo}! `
          : '';
        const popupColor = (i === 0 && isDoubleBomb)
          ? '#f43f5e'
          : (i === 0 && isDoubleRocket)
          ? '#38bdf8'
          : (i === 0 && isRocketBomb)
          ? '#f59e0b'
          : '#fbbf24';
        addPopup(anchor.col, anchor.row, `${comboTxt}+${step.scoreGained}`, popupColor, isCombo, step.combo);
      }

      await new Promise((res) =>
        setTimeout(
          res,
          i === 0 && (isRocketBomb || isDoubleBomb || isDoubleRocket) ? 340 : 260
        )
      );
      if (swapTokenRef.current !== thisSwapToken) return;

      // Determine which tiles actually moved because of gravity or were newly spawned
      const prevTilePositions = new Map<string, { row: number; col: number }>();
      for (let r = 0; r < previousVisualBoard.length; r++) {
        for (let c = 0; c < previousVisualBoard[r].length; c++) {
          const prevTile = previousVisualBoard[r][c];
          if (prevTile && prevTile.id) {
            prevTilePositions.set(prevTile.id, { row: r, col: c });
          }
        }
      }

      const dropped = new Set<string>();
      for (let r = 0; r < step.board.length; r++) {
        for (let c = 0; c < step.board[r].length; c++) {
          const tile = step.board[r][c];
          if (!tile) continue;
          const prevPos = prevTilePositions.get(tile.id);
          if (!prevPos) {
            // Newly spawned tile (did not exist in previous board)
            dropped.add(`${r},${c}`);
          } else if (prevPos.row !== r || prevPos.col !== c) {
            // Tile moved to another row/column
            dropped.add(`${r},${c}`);
          }
          // Same tile ID at the exact same row/column -> stationary, do NOT animate
        }
      }

      setDroppingCoords(dropped);
      setBoard(step.board);
      setClearingCoords(new Set());
      previousVisualBoard = step.board;

      await new Promise((res) => setTimeout(res, 220));
      setDroppingCoords(new Set());
      if (swapTokenRef.current !== thisSwapToken) return;
    }

    setBoard(resolution.finalBoard);

    // Evaluate objective victory
    let isWon = false;
    if (objective.type === 'score' && currentScoreAccum >= (objective.targetScore || 10000)) {
      isWon = true;
    } else if (objective.type === 'collect' && collectedTilesCountRef.current >= (objective.targetCollectCount || 30)) {
      isWon = true;
    } else if (objective.type === 'remove' && hazardsClearedCountRef.current >= (objective.targetHazardCount || 3)) {
      isWon = true;
    }

    if (isWon) {
      setIsVictory(true);
      match3Sounds.playColorBomb();
      const bannerId = `banner_win_${Date.now()}`;
      setComboBanner({
        id: bannerId,
        title: 'OBJECTIVE COMPLETE!',
        subtitle: objective.type === 'collect'
          ? 'TILES TARGET ACHIEVED!'
          : objective.type === 'remove'
          ? 'ALL OBSTACLES CLEARED!'
          : 'TARGET SCORE ACHIEVED!',
      });
      setTimeout(() => {
        setStatus('game_over');
        if (!gameOverTimeoutRef.current) {
          gameOverTimeoutRef.current = setTimeout(() => {
            setStatus('result');
          }, 1400);
        }
      }, 750);
      return;
    }

    // CRITICAL: If TIME reached 0 or game ended during swap resolution, DO NOT return to 'playing'
    if (remainingTimeRef.current <= 0 || statusRef.current === 'game_over' || statusRef.current === 'result') {
      if (statusRef.current !== 'result') {
        setStatus('game_over');
        if (!gameOverTimeoutRef.current) {
          gameOverTimeoutRef.current = setTimeout(() => {
            setStatus('result');
          }, 1400);
        }
      }
      return;
    }

    setStatus('playing');

    // Check if shuffle is needed
    checkAndShuffleIfNeeded(resolution.finalBoard);
  }, [board, score, match3Config, checkAndShuffleIfNeeded]);

  // Unified Candy Crush swap animation handler (supports both valid slide and invalid rejection)
  const handleInitiateSwap = useCallback(async (r1: number, c1: number, r2: number, c2: number) => {
    if (statusRef.current !== 'playing' || remainingTimeRef.current <= 0 || isSwapAnimatingRef.current) return;

    const valid = isValidSwap(board, r1, c1, r2, c2, {
      minimumMatch: match3Config.minimumMatch,
      specialTilesEnabled: match3Config.specialTilesEnabled,
      hazardConfig: match3Config.hazardConfig,
    });

    isSwapAnimatingRef.current = true;
    setIsSwapAnimating(true);
    setSelectedCoord(null);

    if (!valid) {
      match3Sounds.playInvalid();
      setActiveSwapAnim({ r1, c1, r2, c2, phase: 'rejecting' });
      setIsInvalidSwapAnim({ r1, c1, r2, c2 });

      await new Promise((res) => setTimeout(res, 320));
      setActiveSwapAnim(null);
      setIsInvalidSwapAnim(null);
      isSwapAnimatingRef.current = false;
      setIsSwapAnimating(false);
      return;
    }

    // Valid swap: smooth 180ms cubic-bezier slide
    match3Sounds.playSwap();
    setActiveSwapAnim({ r1, c1, r2, c2, phase: 'swapping' });

    await new Promise((res) => setTimeout(res, 180));
    setActiveSwapAnim(null);
    isSwapAnimatingRef.current = false;
    setIsSwapAnimating(false);

    // Call executeSwap for authoritative board resolution
    executeSwap(r1, c1, r2, c2);
  }, [board, match3Config, executeSwap]);

  // Fallback tap handler (for accessibility / single-tap selection)
  const handleTileTapFallback = (r: number, c: number) => {
    if (status !== 'playing' || statusRef.current !== 'playing' || remainingTimeRef.current <= 0 || isSwapAnimatingRef.current) return;

    if (!selectedCoord) {
      setSelectedCoord({ row: r, col: c });
      return;
    }

    if (selectedCoord.row === r && selectedCoord.col === c) {
      setSelectedCoord(null);
      return;
    }

    if (areAdjacent(selectedCoord.row, selectedCoord.col, r, c)) {
      const prevCoord = selectedCoord;
      setSelectedCoord(null);
      handleInitiateSwap(prevCoord.row, prevCoord.col, r, c);
    } else {
      setSelectedCoord({ row: r, col: c });
    }
  };

  // Modern Pointer Events drag/swipe interaction
  const handlePointerDown = (r: number, c: number, e: React.PointerEvent<HTMLDivElement>) => {
    if (status !== 'playing' || statusRef.current !== 'playing' || remainingTimeRef.current <= 0 || isSwapAnimatingRef.current) return;

    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}

    const rect = e.currentTarget.getBoundingClientRect();
    const tileW = rect.width || 56;
    const tileH = rect.height || 56;

    const newDrag: DragState = {
      pointerId: e.pointerId,
      startRow: r,
      startCol: c,
      startX: e.clientX,
      startY: e.clientY,
      currentX: e.clientX,
      currentY: e.clientY,
      dx: 0,
      dy: 0,
      tileWidth: tileW,
      tileHeight: tileH,
      isDragging: false,
      targetRow: null,
      targetCol: null,
      thresholdReached: false,
    };

    dragStateRef.current = newDrag;
    setDragState(newDrag);
    wasDraggedRef.current = false;
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragStateRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    if (statusRef.current !== 'playing' || remainingTimeRef.current <= 0 || isSwapAnimatingRef.current) return;

    const rawDx = e.clientX - drag.startX;
    const rawDy = e.clientY - drag.startY;
    const dist = Math.hypot(rawDx, rawDy);

    if (dist > 6) {
      wasDraggedRef.current = true;
    }

    const isHorizontal = Math.abs(rawDx) >= Math.abs(rawDy);
    const threshold = Math.max(16, (isHorizontal ? drag.tileWidth : drag.tileHeight) * 0.28);

    let targetRow: number | null = null;
    let targetCol: number | null = null;
    let clampedDx = 0;
    let clampedDy = 0;
    let thresholdReached = false;

    if (isHorizontal) {
      if (rawDx > 0) {
        targetRow = drag.startRow;
        targetCol = drag.startCol + 1;
      } else if (rawDx < 0) {
        targetRow = drag.startRow;
        targetCol = drag.startCol - 1;
      }
      const inBounds = targetCol !== null && targetCol >= 0 && targetCol < match3Config.cols;
      const maxDisplacement = inBounds ? drag.tileWidth : drag.tileWidth * 0.25;
      clampedDx = Math.max(-maxDisplacement, Math.min(maxDisplacement, rawDx));
      clampedDy = 0;
      thresholdReached = inBounds && Math.abs(rawDx) >= threshold;
      if (!inBounds) {
        targetRow = null;
        targetCol = null;
      }
    } else {
      if (rawDy > 0) {
        targetRow = drag.startRow + 1;
        targetCol = drag.startCol;
      } else if (rawDy < 0) {
        targetRow = drag.startRow - 1;
        targetCol = drag.startCol;
      }
      const inBounds = targetRow !== null && targetRow >= 0 && targetRow < match3Config.rows;
      const maxDisplacement = inBounds ? drag.tileHeight : drag.tileHeight * 0.25;
      clampedDy = Math.max(-maxDisplacement, Math.min(maxDisplacement, rawDy));
      clampedDx = 0;
      thresholdReached = inBounds && Math.abs(rawDy) >= threshold;
      if (!inBounds) {
        targetRow = null;
        targetCol = null;
      }
    }

    const updated: DragState = {
      ...drag,
      currentX: e.clientX,
      currentY: e.clientY,
      dx: clampedDx,
      dy: clampedDy,
      isDragging: dist > 6,
      targetRow,
      targetCol,
      thresholdReached,
    };

    dragStateRef.current = updated;
    setDragState(updated);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragStateRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;

    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {}

    dragStateRef.current = null;
    setDragState(null);

    if (drag.thresholdReached && drag.targetRow !== null && drag.targetCol !== null) {
      handleInitiateSwap(drag.startRow, drag.startCol, drag.targetRow, drag.targetCol);
    } else if (!wasDraggedRef.current) {
      handleTileTapFallback(drag.startRow, drag.startCol);
    }
  };

  const handlePointerCancel = (e: React.PointerEvent<HTMLDivElement>) => {
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {}
    dragStateRef.current = null;
    setDragState(null);
  };

  // Leaderboard fetch
  const fetchLeaderboard = async () => {
    try {
      setLoadingLeaderboard(true);
      const url = publicToken
        ? `/api/public/events/${publicToken}/high-scores?limit=10`
        : eventId
        ? `/api/events/${eventId}/admin/high-scores?limit=10`
        : null;

      if (url) {
        const res = await apiFetch(url);
        if (res.ok) {
          const data = await res.json();
          setLeaderboardScores(data.scores || []);
        }
      }
    } catch (err: any) {
      setLeaderboardError(err.message || 'Error loading leaderboard');
    } finally {
      setLoadingLeaderboard(false);
    }
  };

  // Score submission
  const handleSubmitScore = async (customName?: string) => {
    const trimmedName = (customName || playerName || 'Player').trim();
    if (!trimmedName || isSubmittingScore || scoreSubmitted) return;

    setIsSubmittingScore(true);
    const isOrganizerTest = isEventTest || isEventPreview;
    const metadataPayload = {
      gameType: 'match-3',
      matches: matchesCount,
      bestCombo,
      specialTilesCreated: specialsCreatedCount,
      duration: match3Config.gameDurationSeconds - remainingTime,
      sessionId,
      isEventTest: isOrganizerTest ? true : undefined,
      score_environment: isOrganizerTest ? 'test' : undefined,
      is_test: isOrganizerTest ? true : undefined,
    };

    try {
      if (publicToken || (eventId && eventId !== 'undefined' && eventId !== 'null')) {
        const url = !isOrganizerTest && publicToken
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
            is_test: isOrganizerTest ? true : undefined,
          }),
        });
        const data = await res.json();
        if (res.ok && data.success) {
          setScoreSubmitted(true);
          setSubmittedRank(data.rank || 1);
          await fetchLeaderboard();
          return { success: true, rank: data.rank };
        }
      }

      // Local fallback
      setScoreSubmitted(true);
      setSubmittedRank(1);
      return { success: true, rank: 1 };
    } catch (err: any) {
      console.error('Score submission error:', err);
      return { success: false, error: err.message };
    } finally {
      setIsSubmittingScore(false);
    }
  };

  // Background visual style
  const bgStyle = useMemo<React.CSSProperties>(() => {
    const bgUrl =
      activeTheme?.background_url ||
      activeTheme?.background ||
      resolveThemeDefaultBgImage(activeTheme, 'match-3');
    if (bgUrl) {
      return {
        backgroundImage: `url("${bgUrl}")`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundColor: '#070b14',
      };
    }
    return {
      backgroundColor: '#070b14',
    };
  }, [activeTheme]);

  // Visual tile lookup helper
  const getVisualTile = (tileType: string): TileVisualDefinition => {
    const customDefs: TileVisualDefinition[] | undefined =
      (activeTheme?.game_config as any)?.tileDefinitions ||
      (config as any)?.tileDefinitions ||
      match3Config?.tileDefinitions;
    if (Array.isArray(customDefs)) {
      const match = customDefs.find((d) => d.id === tileType);
      if (match) return match;
    }
    return (
      DEFAULT_TILE_DEFINITIONS.find((d) => d.id === tileType) ||
      DEFAULT_TILE_DEFINITIONS[0]
    );
  };

  const renderTileSymbol = (symbolName: string, className: string = 'w-6 h-6') => {
    switch (symbolName) {
      case 'Diamond':
        return <Diamond className={className} />;
      case 'Hexagon':
        return <Hexagon className={className} />;
      case 'Shield':
        return <Shield className={className} />;
      case 'Sun':
        return <Sun className={className} />;
      case 'Circle':
        return <Circle className={className} />;
      case 'Droplet':
        return <Droplet className={className} />;
      case 'Heart':
        return <Heart className={className} />;
      case 'Star':
        return <Star className={className} />;
      case 'Zap':
        return <Zap className={className} />;
      case 'Crown':
        return <Crown className={className} />;
      case 'Sparkles':
        return <Sparkles className={className} />;
      default:
        return <Sparkles className={className} />;
    }
  };

  // Render Leaderboard Modal
  const renderLeaderboardModal = () => {
    if (!showLeaderboardModal) return null;
    return (
      <div
        className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 cursor-default pointer-events-auto"
        onClick={(e) => {
          e.stopPropagation();
          setShowLeaderboardModal(false);
        }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div
          className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-5 text-slate-100 flex flex-col max-h-[85vh] shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <Trophy className="w-5 h-5 text-amber-400" />
              <h3 className="font-bold text-base">{t('game.leaderboard', undefined, 'Leaderboard')}</h3>
            </div>
            <button
              type="button"
              onClick={() => setShowLeaderboardModal(false)}
              className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-200 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto py-3 space-y-1.5 min-h-[160px]">
            {loadingLeaderboard ? (
              <div className="py-8 text-slate-400 text-xs flex flex-col items-center gap-2">
                <div className="w-5 h-5 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
                <span>{t('game.loadingLeaderboard', undefined, 'Loading Leaderboard...')}</span>
              </div>
            ) : leaderboardScores.length === 0 ? (
              <div className="py-8 text-center text-slate-400 text-xs">
                <Trophy className="w-8 h-8 text-slate-600 mx-auto mb-2 opacity-50" />
                <p className="font-bold text-slate-300">{t('game.noScoresYetTitle', undefined, 'No Scores Yet!')}</p>
                <p className="text-[10px] text-slate-500 mt-0.5">{t('game.beFirstToPlay', undefined, 'Be the first to play and set a record!')}</p>
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
                  <span className="font-bold text-amber-400">{entry.score.toLocaleString()} pts</span>
                </div>
              ))
            )}
          </div>
          <div className="pt-3 border-t border-slate-800 flex justify-end">
            <button
              type="button"
              onClick={() => setShowLeaderboardModal(false)}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold font-mono transition-colors cursor-pointer"
            >
              {t('common.close', undefined, 'Close')}
            </button>
          </div>
        </div>
      </div>
    );
  };

  // 1. START SCREEN
  if (status === 'ready') {
    return (
      <div
        ref={containerRef}
        className={`relative w-full h-full select-none overflow-hidden flex flex-col justify-center items-center font-sans ${className}`}
        style={{
          ...bgStyle,
          '--game-ui-scale': responsive.uiScale,
          '--game-design-width': `${responsive.designWidth}px`,
          '--game-design-height': `${responsive.designHeight}px`,
        } as React.CSSProperties}
      >
        <StartScreenRenderer
          startConfig={(activeTheme?.game_config as any)?.screens?.start}
          gameType="match-3"
          theme={activeTheme}
          responsive={responsive}
          targetDimensions={{
            width: responsive.designWidth,
            height: responsive.designHeight,
            isPortrait: responsive.isPortrait,
          }}
          gameMeta={{
            gameTitle: activeTheme?.branding?.gameTitle || 'MATCH-3 CASCADE',
            gameSubtitle: activeTheme?.branding?.subtitle || 'Swap tiles, create combos, and clear the board!',
            duration: match3Config.gameDurationSeconds,
          }}
          onStartGame={handleStartGame}
          onShowLeaderboard={() => {
            fetchLeaderboard();
            setShowLeaderboardModal(true);
          }}
          leaderboardData={leaderboardScores}
          loadingLeaderboard={loadingLeaderboard}
          leaderboardError={leaderboardError}
        />
        {renderLeaderboardModal()}
      </div>
    );
  }

  // 2. RESULT SCREEN
  if (status === 'result') {
    const stats: Match3Stats = {
      score,
      combo,
      bestCombo,
      matches: matchesCount,
      specialTilesCreated: specialsCreatedCount,
      duration: match3Config.gameDurationSeconds - remainingTime,
    };

    return (
      <div
        ref={containerRef}
        className={`relative w-full h-full select-none overflow-hidden flex flex-col justify-center items-center font-sans ${className}`}
        style={{
          ...bgStyle,
          '--game-ui-scale': responsive.uiScale,
          '--game-design-width': `${responsive.designWidth}px`,
          '--game-design-height': `${responsive.designHeight}px`,
        } as React.CSSProperties}
      >
        <ResultScreenRenderer
          gameType="match-3"
          resultConfig={(activeTheme?.game_config as any)?.screens?.result}
          layout={activeTheme?.layout}
          targetDimensions={{ width: responsive.designWidth, height: responsive.designHeight }}
          isPortrait={responsive.isPortrait}
          theme={activeTheme}
          stats={{
            score,
            moves: matchesCount,
            matches: matchesCount,
            matchedPairsCount: specialsCreatedCount,
            pairs: specialsCreatedCount,
            bestCombo,
            specialTilesCreated: specialsCreatedCount,
            timeElapsedSeconds: match3Config.gameDurationSeconds - remainingTime,
            accuracyPercent: Math.min(100, Math.max(10, bestCombo * 20)),
            gameType: 'match-3',
          }}
          currentPlayerName={playerName}
          leaderboardData={leaderboardScores}
          loadingLeaderboard={loadingLeaderboard}
          leaderboardError={leaderboardError}
          isEventPreview={isEventPreview}
          isEventTest={isEventTest}
          scoreSubmitted={scoreSubmitted}
          submittedRank={submittedRank}
          isSubmittingScore={isSubmittingScore}
          onSubmitScore={async (name) => {
            setPlayerName(name);
            await handleSubmitScore(name);
          }}
          onAction={(action) => {
            if (action === 'playAgain') {
              handleStartGame();
            }
          }}
        />
      </div>
    );
  }

  // 3. MAIN GAMEPLAY VIEWPORT
  return (
    <div
      ref={containerRef}
      className={`relative w-full h-full select-none overflow-hidden flex flex-col justify-between items-center font-sans ${className}`}
      style={{
        ...bgStyle,
        touchAction: 'manipulation',
        '--game-ui-scale': responsive.uiScale,
        '--game-design-width': `${responsive.designWidth}px`,
        '--game-design-height': `${responsive.designHeight}px`,
      } as React.CSSProperties}
    >
      {/* HUD Header Toolbar */}
      <header className="w-full max-w-4xl px-3 sm:px-4 h-14 sm:h-16 shrink-0 flex items-center justify-between flex-nowrap z-20">
        {/* Left: Client Logo & Score */}
        <div className="flex items-center gap-2.5">
          {activeTheme?.layout?.clientLogo?.visible !== false && (
            (activeTheme?.branding?.clientLogoUrl || activeTheme?.branding?.logoUrl) ? (
              <img
                src={activeTheme.branding.clientLogoUrl || activeTheme.branding.logoUrl || ''}
                alt="Logo"
                className={`h-8 sm:h-10 object-contain drop-shadow transition-all ${
                  editableLayout
                    ? `cursor-pointer pointer-events-auto ${
                        selectedElementKey === 'clientLogo'
                          ? 'ring-2 ring-amber-400 rounded-lg p-0.5'
                          : 'hover:ring-1 hover:ring-slate-400/60 rounded-lg p-0.5'
                      }`
                    : ''
                }`}
                onClick={(e) => {
                  if (editableLayout) {
                    e.stopPropagation();
                    onSelectElementKey?.('clientLogo');
                  }
                }}
                onPointerDown={(e) => {
                  if (editableLayout && onElementPointerDown) {
                    e.stopPropagation();
                    onElementPointerDown('clientLogo', false, e);
                  }
                }}
              />
            ) : editableLayout ? (
              <div
                className={`h-8 sm:h-10 px-2 rounded-lg bg-slate-900 border border-slate-700 flex items-center gap-1 text-[10px] text-slate-300 font-bold cursor-pointer pointer-events-auto ${
                  selectedElementKey === 'clientLogo' ? 'ring-2 ring-amber-400' : ''
                }`}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectElementKey?.('clientLogo');
                }}
                onPointerDown={(e) => {
                  if (onElementPointerDown) {
                    e.stopPropagation();
                    onElementPointerDown('clientLogo', false, e);
                  }
                }}
              >
                <span>Logo</span>
              </div>
            ) : null
          )}

          {activeTheme?.layout?.scoreHud?.visible !== false && (
            <div
              className={`flex items-center gap-2 bg-slate-950/80 backdrop-blur-md border border-slate-800 px-3 sm:px-4 py-1.5 sm:py-2 rounded-2xl shadow-lg min-w-[7.5rem] sm:min-w-[9.5rem] shrink-0 transition-all ${
                editableLayout
                  ? `cursor-pointer pointer-events-auto ${
                      selectedElementKey === 'scoreHud'
                        ? 'ring-2 ring-amber-400 shadow-xl'
                        : 'hover:ring-1 hover:ring-slate-400/60'
                    }`
                  : ''
              }`}
              onClick={(e) => {
                if (editableLayout) {
                  e.stopPropagation();
                  onSelectElementKey?.('scoreHud');
                }
              }}
              onPointerDown={(e) => {
                if (editableLayout && onElementPointerDown) {
                  e.stopPropagation();
                  onElementPointerDown('scoreHud', false, e);
                }
              }}
            >
              <div className="p-1.5 bg-amber-500/20 text-amber-400 rounded-xl shrink-0">
                <Trophy className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block leading-tight">
                  {t('common.score', undefined, 'SCORE')}
                </span>
                <span className="text-xl sm:text-2xl font-black font-mono tabular-nums text-amber-400 tracking-tight leading-none min-w-[5.5rem] text-right whitespace-nowrap block">
                  {score.toLocaleString()}
                </span>
                {objective.type === 'score' && (
                  <span className="text-[9px] font-mono text-slate-400 block text-right tabular-nums whitespace-nowrap">
                    Goal: {(objective.targetScore || 10000).toLocaleString()}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Center: Title / Combo Multiplier Indicator */}
        <div
          className={`flex flex-col items-center justify-center min-w-[6.5rem] sm:min-w-[9rem] h-10 shrink-0 transition-all ${
            editableLayout
              ? `cursor-pointer pointer-events-auto ${
                  selectedElementKey === 'gameTitle'
                    ? 'ring-2 ring-amber-400 rounded-xl p-0.5'
                    : 'hover:ring-1 hover:ring-slate-400/60 rounded-xl p-0.5'
                }`
              : ''
          }`}
          onClick={(e) => {
            if (editableLayout) {
              e.stopPropagation();
              onSelectElementKey?.('gameTitle');
            }
          }}
          onPointerDown={(e) => {
            if (editableLayout && onElementPointerDown) {
              e.stopPropagation();
              onElementPointerDown('gameTitle', false, e);
            }
          }}
        >
          {activeTheme?.layout?.gameTitle?.visible !== false && activeTheme?.branding?.gameTitle && (
            <span className="text-[11px] sm:text-xs font-black tracking-wider uppercase text-amber-300 drop-shadow mb-0.5 truncate max-w-[140px] sm:max-w-[200px]">
              {activeTheme.branding.gameTitle}
            </span>
          )}
          {combo > 1 ? (
            <div className="animate-match3-combo bg-gradient-to-r from-amber-500 to-rose-500 text-slate-950 font-black px-3 sm:px-3.5 py-1 sm:py-1.5 rounded-full text-xs sm:text-sm tracking-wide shadow-xl border border-amber-300 flex items-center gap-1.5 whitespace-nowrap">
              <Flame className="w-4 h-4 animate-spin shrink-0" />
              <span>COMBO ×{combo}</span>
            </div>
          ) : (
            <div className="invisible pointer-events-none px-3 sm:px-3.5 py-0.5 text-xs font-black whitespace-nowrap" aria-hidden="true">
              COMBO ×1
            </div>
          )}
        </div>

        {/* Right: Timer & Controls */}
        <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
          {activeTheme?.layout?.timer?.visible !== false && (
            <div
              className={`flex items-center gap-2 bg-slate-950/80 backdrop-blur-md border border-slate-800 px-3 sm:px-4 py-1.5 sm:py-2 rounded-2xl shadow-lg min-w-[5.5rem] sm:min-w-[7.5rem] shrink-0 transition-all ${
                editableLayout
                  ? `cursor-pointer pointer-events-auto ${
                      selectedElementKey === 'timer'
                        ? 'ring-2 ring-amber-400'
                        : 'hover:ring-1 hover:ring-slate-400/60'
                    }`
                  : ''
              }`}
              onClick={(e) => {
                if (editableLayout) {
                  e.stopPropagation();
                  onSelectElementKey?.('timer');
                }
              }}
              onPointerDown={(e) => {
                if (editableLayout && onElementPointerDown) {
                  e.stopPropagation();
                  onElementPointerDown('timer', false, e);
                }
              }}
            >
              <div className={`p-1.5 rounded-xl shrink-0 ${remainingTime <= 10 ? 'bg-rose-500/20 text-rose-400 animate-pulse' : 'bg-cyan-500/20 text-cyan-400'}`}>
                <Clock className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block leading-tight">
                  {t('common.time', undefined, 'TIME')}
                </span>
                <span className={`text-xl sm:text-2xl font-black font-mono tabular-nums tracking-tight leading-none min-w-[2.5rem] sm:min-w-[3rem] text-right whitespace-nowrap block ${remainingTime <= 10 ? 'text-rose-400 animate-pulse' : 'text-slate-100'}`}>
                  {remainingTime}s
                </span>
              </div>
            </div>
          )}

          {onToggleMute && (
            <button
              type="button"
              onClick={onToggleMute}
              className="p-2 sm:p-2.5 bg-slate-900/80 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 rounded-xl transition-all shadow-md active:scale-95 cursor-pointer shrink-0"
              title={isMuted ? 'Unmute' : 'Mute'}
            >
              {isMuted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4 text-emerald-400" />}
            </button>
          )}

          {onToggleFullscreen && (
            <button
              type="button"
              onClick={onToggleFullscreen}
              className="p-2 sm:p-2.5 bg-slate-900/80 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 rounded-xl transition-all shadow-md active:scale-95 cursor-pointer shrink-0"
              title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4 text-amber-400" /> : <Maximize2 className="w-4 h-4 text-slate-300" />}
            </button>
          )}
        </div>
      </header>

      {/* Center 8x8 Board Container */}
      <main
        ref={mainRef}
        className="flex-1 min-h-0 min-w-0 w-full flex items-center justify-center p-2 sm:p-3 relative z-10 touch-none select-none overflow-hidden"
      >
        {/* Floating Objective HUD Badge */}
        {objective.type !== 'score' && (
          <div className="absolute top-2 left-1/2 -translate-x-1/2 z-30 pointer-events-none flex items-center gap-2 px-3.5 py-1.5 bg-slate-950/90 backdrop-blur-md border border-amber-500/40 rounded-full shadow-2xl text-xs font-bold text-slate-100 select-none">
            {objective.type === 'collect' && (() => {
              const targetTileVisual = getVisualTile(objective.targetTileType || 'tile-01');
              const targetCount = objective.targetCollectCount || 30;
              const isDone = collectedTilesCount >= targetCount;
              return (
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1 text-amber-300">
                    <Target className="w-3.5 h-3.5" />
                    <span>Target:</span>
                  </div>
                  {(() => {
                    const hasTargetCustomSprite = Boolean(
                      targetTileVisual.imageUrl &&
                      typeof targetTileVisual.imageUrl === 'string' &&
                      targetTileVisual.imageUrl.trim() !== '' &&
                      !failedImages[targetTileVisual.imageUrl]
                    );
                    return (
                      <div
                        className="w-5 h-5 rounded-md flex items-center justify-center overflow-hidden shrink-0"
                        style={{
                          background: hasTargetCustomSprite ? 'transparent' : targetTileVisual.bgColor,
                          borderColor: hasTargetCustomSprite ? 'transparent' : targetTileVisual.borderColor,
                          borderWidth: hasTargetCustomSprite ? '0px' : '1px',
                          borderStyle: 'solid',
                        }}
                      >
                        {hasTargetCustomSprite ? (
                          <img
                            src={targetTileVisual.imageUrl!}
                            alt={targetTileVisual.name}
                            className="w-full h-full object-cover pointer-events-none select-none"
                            onError={() => {
                              setFailedImages((prev) => ({ ...prev, [targetTileVisual.imageUrl!]: true }));
                            }}
                          />
                        ) : (
                          renderTileSymbol(targetTileVisual.symbol, 'w-3 h-3')
                        )}
                      </div>
                    );
                  })()}
                  <span className="text-slate-300">{targetTileVisual.name}:</span>
                  <span className={`font-mono font-bold ${isDone ? 'text-emerald-400' : 'text-amber-400'}`}>
                    {collectedTilesCount} / {targetCount}
                  </span>
                </div>
              );
            })()}

            {objective.type === 'remove' && (() => {
              const targetCount = objective.targetHazardCount || 3;
              const isDone = hazardsClearedCount >= targetCount;
              return (
                <div className="flex items-center gap-2">
                  <Shield className="w-3.5 h-3.5 text-rose-400" />
                  <span className="text-slate-300">Clear Obstacles:</span>
                  <span className={`font-mono font-bold ${isDone ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {hazardsClearedCount} / {targetCount}
                  </span>
                </div>
              );
            })()}
          </div>
        )}
        <div
          className={`relative bg-slate-950/90 backdrop-blur-xl border-4 border-slate-800/80 rounded-2xl sm:rounded-3xl p-2.5 sm:p-3.5 shadow-2xl overflow-hidden touch-none select-none shrink-0 ${
            isComboShaking ? 'animate-match3-screen-shake' : ''
          }`}
          style={{
            width: `${activeBoardSize}px`,
            height: `${activeBoardSize}px`,
            maxWidth: '100%',
            maxHeight: '100%',
            aspectRatio: '1 / 1',
            boxSizing: 'border-box',
            touchAction: 'none',
            userSelect: 'none',
            WebkitUserSelect: 'none',
          }}
        >
          {/* Shuffling Board Banner */}
          {isShufflingNotice && (
            <div className="absolute inset-0 z-40 bg-slate-950/85 backdrop-blur-md rounded-3xl flex flex-col items-center justify-center space-y-2 animate-in fade-in duration-200 pointer-events-none">
              <Shuffle className="w-10 h-10 text-amber-400 animate-spin" />
              <span className="text-base font-black text-slate-100 uppercase tracking-widest">
                No Moves Left • Shuffling Board!
              </span>
            </div>
          )}

          {/* Grid Board */}
          <div
            className={`grid gap-1 sm:gap-1.5 w-full h-full touch-none select-none ${
              status !== 'playing' || remainingTime <= 0 ? 'pointer-events-none select-none' : ''
            }`}
            style={{
              gridTemplateColumns: `repeat(${match3Config.cols}, minmax(0, 1fr))`,
              gridTemplateRows: `repeat(${match3Config.rows}, minmax(0, 1fr))`,
              width: '100%',
              height: '100%',
              boxSizing: 'border-box',
              touchAction: 'none',
              userSelect: 'none',
              WebkitUserSelect: 'none',
            }}
          >
            {board.map((rowArr, r) =>
              rowArr.map((tile, c) => {
                const visual = getVisualTile(tile.type);
                const hasCustomSprite = Boolean(
                  visual.imageUrl &&
                  typeof visual.imageUrl === 'string' &&
                  visual.imageUrl.trim() !== '' &&
                  !failedImages[visual.imageUrl]
                );
                const isSelected = selectedCoord?.row === r && selectedCoord?.col === c;
                const isClearing = clearingCoords.has(`${r},${c}`);
                const isDropping = droppingCoords.has(`${r},${c}`);

                // Active swap animation state
                let swapTransform = '';
                let isSwapTile = false;
                let isSwapRejecting = false;

                if (activeSwapAnim) {
                  if (activeSwapAnim.r1 === r && activeSwapAnim.c1 === c) {
                    isSwapTile = true;
                    if (activeSwapAnim.phase === 'swapping') {
                      const dxPct = (activeSwapAnim.c2 - activeSwapAnim.c1) * 100;
                      const dyPct = (activeSwapAnim.r2 - activeSwapAnim.r1) * 100;
                      swapTransform = `translate3d(${dxPct}%, ${dyPct}%, 0) scale(1.04)`;
                    } else {
                      const dxPct = (activeSwapAnim.c2 - activeSwapAnim.c1) * 35;
                      const dyPct = (activeSwapAnim.r2 - activeSwapAnim.r1) * 35;
                      swapTransform = `translate3d(${dxPct}%, ${dyPct}%, 0)`;
                      isSwapRejecting = true;
                    }
                  } else if (activeSwapAnim.r2 === r && activeSwapAnim.c2 === c) {
                    isSwapTile = true;
                    if (activeSwapAnim.phase === 'swapping') {
                      const dxPct = (activeSwapAnim.c1 - activeSwapAnim.c2) * 100;
                      const dyPct = (activeSwapAnim.r1 - activeSwapAnim.r2) * 100;
                      swapTransform = `translate3d(${dxPct}%, ${dyPct}%, 0) scale(1.04)`;
                    } else {
                      const dxPct = (activeSwapAnim.c1 - activeSwapAnim.c2) * 35;
                      const dyPct = (activeSwapAnim.r1 - activeSwapAnim.r2) * 35;
                      swapTransform = `translate3d(${dxPct}%, ${dyPct}%, 0)`;
                      isSwapRejecting = true;
                    }
                  }
                }

                // Drag state transforms
                const isBeingDragged = dragState?.startRow === r && dragState?.startCol === c;
                const isDragTarget = dragState?.targetRow === r && dragState?.targetCol === c;

                let dragTransform = '';
                if (isBeingDragged) {
                  dragTransform = `translate3d(${dragState.dx}px, ${dragState.dy}px, 0) scale(1.08)`;
                } else if (isDragTarget) {
                  dragTransform = `translate3d(${-dragState.dx * 0.38}px, ${-dragState.dy * 0.38}px, 0)`;
                }

                const computedTransform = isSwapTile ? swapTransform : dragTransform;

                const isInvalid = isSwapRejecting || (
                  isInvalidSwapAnim && (
                    (isInvalidSwapAnim.r1 === r && isInvalidSwapAnim.c1 === c) ||
                    (isInvalidSwapAnim.r2 === r && isInvalidSwapAnim.c2 === c)
                  )
                );

                const isRocketBombWindUpTile = Boolean(
                  rocketBombWindUp && (
                    (rocketBombWindUp.bombRow === r && rocketBombWindUp.bombCol === c) ||
                    (rocketBombWindUp.rocketRow === r && rocketBombWindUp.rocketCol === c)
                  )
                );

                const isDoubleBombWindUpTile = Boolean(
                  doubleBombWindUp && (
                    (doubleBombWindUp.r1 === r && doubleBombWindUp.c1 === c) ||
                    (doubleBombWindUp.r2 === r && doubleBombWindUp.c2 === c)
                  )
                );

                const isDoubleRocketWindUpTile = Boolean(
                  doubleRocketWindUp && (
                    (doubleRocketWindUp.r1 === r && doubleRocketWindUp.c1 === c) ||
                    (doubleRocketWindUp.r2 === r && doubleRocketWindUp.c2 === c)
                  )
                );

                const isWindUpTile = isRocketBombWindUpTile || isDoubleBombWindUpTile || isDoubleRocketWindUpTile;

                // Z-index hierarchy
                const zIndexClass = isWindUpTile
                  ? 'z-40'
                  : isBeingDragged
                  ? 'z-30'
                  : isSwapTile
                  ? 'z-30'
                  : isDragTarget
                  ? 'z-20'
                  : isSelected
                  ? 'z-20'
                  : 'z-10';

                return (
                  <div
                    key={tile.id}
                    onPointerDown={(e) => handlePointerDown(r, c, e)}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    onPointerCancel={handlePointerCancel}
                    className={`relative rounded-xl sm:rounded-2xl flex items-center justify-center cursor-pointer select-none touch-none will-change-transform w-full h-full max-w-full max-h-full overflow-hidden ${zIndexClass} ${
                      isDoubleBombWindUpTile
                        ? 'ring-4 ring-rose-400 shadow-[0_0_36px_rgba(244,63,94,0.95)] animate-match3-bomb-windup'
                        : isDoubleRocketWindUpTile
                        ? 'ring-4 ring-sky-300 shadow-[0_0_32px_rgba(56,189,248,0.95)] animate-match3-rocket-windup'
                        : isRocketBombWindUpTile
                        ? 'ring-4 ring-amber-300 shadow-[0_0_30px_rgba(251,191,36,0.95)] animate-match3-windup'
                        : isSelected
                        ? 'ring-4 ring-amber-400 shadow-[0_0_20px_rgba(251,191,36,0.7)]'
                        : isBeingDragged
                        ? 'ring-2 ring-amber-300'
                        : hasCustomSprite
                        ? 'hover:scale-[1.03] active:scale-95'
                        : 'hover:scale-[1.03] active:scale-95 shadow-md'
                    } ${isClearing ? 'animate-match3-pop pointer-events-none' : ''} ${
                      isDropping && !isClearing ? 'animate-match3-drop' : ''
                    } ${isInvalid ? 'animate-match3-shake' : ''}`}
                    style={{
                      width: '100%',
                      height: '100%',
                      maxWidth: '100%',
                      maxHeight: '100%',
                      boxSizing: 'border-box',
                      background: hasCustomSprite ? 'transparent' : visual.bgColor,
                      borderColor: isDoubleBombWindUpTile
                        ? '#fda4af'
                        : isDoubleRocketWindUpTile
                        ? '#7dd3fc'
                        : isRocketBombWindUpTile
                        ? '#fde047'
                        : hasCustomSprite
                        ? 'transparent'
                        : visual.borderColor,
                      borderWidth: isWindUpTile ? '3px' : hasCustomSprite ? '0px' : '2px',
                      borderStyle: 'solid',
                      boxShadow: isDoubleBombWindUpTile
                        ? '0 0 36px rgba(244,63,94,0.95), 0 0 18px rgba(239,68,68,0.9), inset 0 2px 6px rgba(255,255,255,0.85)'
                        : isDoubleRocketWindUpTile
                        ? '0 0 32px rgba(56,189,248,0.95), 0 0 16px rgba(2,132,199,0.9), inset 0 2px 6px rgba(255,255,255,0.85)'
                        : isRocketBombWindUpTile
                        ? '0 0 32px rgba(251,191,36,0.95), 0 0 16px rgba(245,158,11,0.9), inset 0 2px 6px rgba(255,255,255,0.8)'
                        : isBeingDragged
                        ? hasCustomSprite
                          ? '0 8px 24px rgba(0,0,0,0.5), 0 0 16px rgba(251, 191, 36, 0.6)'
                          : `0 10px 24px ${visual.glowColor}, 0 0 20px rgba(251, 191, 36, 0.6), inset 0 2px 4px rgba(255,255,255,0.6)`
                        : isSelected
                        ? hasCustomSprite
                          ? '0 0 16px rgba(251,191,36,0.85)'
                          : `0 0 20px rgba(251,191,36,0.8), inset 0 2px 4px rgba(255,255,255,0.4)`
                        : hasCustomSprite
                        ? 'none'
                        : `0 4px 10px ${visual.glowColor}, inset 0 2px 4px rgba(255,255,255,0.4), inset 0 -3px 6px rgba(0,0,0,0.3)`,
                      transform: computedTransform || undefined,
                      transition: isBeingDragged
                        ? 'none'
                        : isSwapTile && activeSwapAnim?.phase === 'swapping'
                        ? 'transform 180ms cubic-bezier(0.25, 1, 0.5, 1)'
                        : isDragTarget
                        ? 'transform 70ms linear'
                        : 'transform 150ms ease-out, box-shadow 150ms ease-out',
                      filter: isWindUpTile ? 'brightness(1.55)' : (isBeingDragged || (isDragTarget && dragState?.thresholdReached)) ? 'brightness(1.18)' : undefined,
                      touchAction: 'none',
                      userSelect: 'none',
                      WebkitUserSelect: 'none',
                    }}
                  >
                    {/* Inner 3D Highlight Shine (suppressed for custom sprites) */}
                    {!hasCustomSprite && (
                      <div className="absolute top-1 left-1.5 right-1.5 h-[35%] rounded-t-xl bg-white/25 pointer-events-none" />
                    )}

                    {/* Hazard Obstacle Overlay */}
                    {tile.hazard && (
                      <div
                        className={`absolute inset-0 z-20 flex items-center justify-center pointer-events-none ${
                          tile.hazard === 'stone'
                            ? 'bg-slate-800/90 border-2 border-slate-500 shadow-inner'
                            : tile.hazard === 'ice'
                            ? 'bg-sky-400/50 backdrop-blur-[2px] border-2 border-white/80 shadow-[inset_0_0_8px_rgba(255,255,255,0.7)]'
                            : 'bg-emerald-500/40 rounded-full border-2 border-emerald-300'
                        }`}
                      >
                        {tile.hazard === 'stone' && (
                          <div className="text-slate-300 flex flex-col items-center">
                            <Shield className="w-5 h-5 sm:w-6 sm:h-6 text-slate-400 drop-shadow" />
                            <span className="text-[9px] font-mono font-bold text-slate-400 uppercase tracking-tighter">STONE</span>
                          </div>
                        )}
                        {tile.hazard === 'ice' && (
                          <div className="text-white flex flex-col items-center animate-pulse">
                            <Sparkles className="w-5 h-5 sm:w-6 sm:h-6 text-cyan-200 drop-shadow" />
                            <span className="text-[9px] font-mono font-bold text-white uppercase tracking-tighter">ICE</span>
                          </div>
                        )}
                        {tile.hazard === 'bubble' && (
                          <div className="text-emerald-200">
                            <Circle className="w-5 h-5 sm:w-6 sm:h-6 text-emerald-200 animate-spin" />
                          </div>
                        )}
                      </div>
                    )}

                    {/* Tile Face: Custom Artwork or Geometric Symbol */}
                    {hasCustomSprite ? (
                      <div className="absolute inset-0 w-full h-full flex items-center justify-center overflow-hidden pointer-events-none select-none z-10">
                        <img
                          src={visual.imageUrl!}
                          alt={visual.name}
                          className="w-full h-full object-cover pointer-events-none select-none"
                          onError={() => {
                            setFailedImages((prev) => ({ ...prev, [visual.imageUrl!]: true }));
                          }}
                        />
                        {/* Special Tile Overlay Badges on top of custom artwork */}
                        {tile.special === 'rocket-horizontal' && (
                          <div className="absolute inset-0 flex items-center justify-center z-20">
                            <div className="flex items-center gap-0.5 bg-black/60 backdrop-blur-xs p-1.5 rounded-full border border-amber-300 shadow-lg">
                              <Rocket className="w-5 h-5 sm:w-6 sm:h-6 text-amber-300 transform -rotate-90 animate-pulse" />
                            </div>
                          </div>
                        )}
                        {tile.special === 'rocket-vertical' && (
                          <div className="absolute inset-0 flex items-center justify-center z-20">
                            <div className="flex items-center gap-0.5 bg-black/60 backdrop-blur-xs p-1.5 rounded-full border border-amber-300 shadow-lg">
                              <Rocket className="w-5 h-5 sm:w-6 sm:h-6 text-amber-300 animate-pulse" />
                            </div>
                          </div>
                        )}
                        {tile.special === 'bomb' && (
                          <div className="absolute inset-0 flex items-center justify-center z-20">
                            <div className="bg-black/60 backdrop-blur-xs p-1.5 rounded-full border border-rose-400 shadow-lg animate-pulse">
                              <Bomb className="w-5 h-5 sm:w-6 sm:h-6 text-rose-400" />
                            </div>
                          </div>
                        )}
                        {tile.special === 'color-bomb' && (
                          <div className="absolute inset-0 flex items-center justify-center z-20">
                            <div className="bg-gradient-to-tr from-pink-500 via-amber-400 to-indigo-500 p-1.5 rounded-full shadow-lg border border-white animate-spin">
                              <Sparkles className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="relative text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)] z-10 flex items-center justify-center pointer-events-none">
                        {tile.special === 'rocket-horizontal' ? (
                          <div className="flex items-center gap-0.5 bg-black/40 p-1.5 rounded-full border border-amber-300">
                            <Rocket className="w-5 h-5 sm:w-6 sm:h-6 text-amber-300 transform -rotate-90 animate-pulse" />
                          </div>
                        ) : tile.special === 'rocket-vertical' ? (
                          <div className="flex items-center gap-0.5 bg-black/40 p-1.5 rounded-full border border-amber-300">
                            <Rocket className="w-5 h-5 sm:w-6 sm:h-6 text-amber-300 animate-pulse" />
                          </div>
                        ) : tile.special === 'bomb' ? (
                          <div className="bg-black/50 p-1.5 rounded-full border border-rose-400 animate-pulse">
                            <Bomb className="w-5 h-5 sm:w-6 sm:h-6 text-rose-400" />
                          </div>
                        ) : tile.special === 'color-bomb' ? (
                          <div className="bg-gradient-to-tr from-pink-500 via-amber-400 to-indigo-500 p-1.5 rounded-full shadow-lg border border-white animate-spin">
                            <Sparkles className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
                          </div>
                        ) : (
                          renderTileSymbol(visual.symbol, 'w-5 h-5 sm:w-7 sm:h-7 stroke-[2.5]')
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Rocket + Bomb Wind-Up Energy Connection */}
          {rocketBombWindUp && (
            <svg
              className="absolute inset-0 w-full h-full pointer-events-none z-30 overflow-visible"
              aria-hidden="true"
            >
              <defs>
                <filter id="rb-energy-glow" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="blur1" />
                  <feGaussianBlur in="SourceGraphic" stdDeviation="8" result="blur2" />
                  <feMerge>
                    <feMergeNode in="blur2" />
                    <feMergeNode in="blur1" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>
              <line
                x1={`${((rocketBombWindUp.bombCol + 0.5) / match3Config.cols) * 100}%`}
                y1={`${((rocketBombWindUp.bombRow + 0.5) / match3Config.rows) * 100}%`}
                x2={`${((rocketBombWindUp.rocketCol + 0.5) / match3Config.cols) * 100}%`}
                y2={`${((rocketBombWindUp.rocketRow + 0.5) / match3Config.rows) * 100}%`}
                stroke="#fbbf24"
                strokeWidth="6"
                strokeLinecap="round"
                filter="url(#rb-energy-glow)"
                className="animate-match3-energy-link"
              />
              <line
                x1={`${((rocketBombWindUp.bombCol + 0.5) / match3Config.cols) * 100}%`}
                y1={`${((rocketBombWindUp.bombRow + 0.5) / match3Config.rows) * 100}%`}
                x2={`${((rocketBombWindUp.rocketCol + 0.5) / match3Config.cols) * 100}%`}
                y2={`${((rocketBombWindUp.rocketRow + 0.5) / match3Config.rows) * 100}%`}
                stroke="#ffffff"
                strokeWidth="2.5"
                strokeLinecap="round"
              />
            </svg>
          )}

          {/* Double Bomb Wind-Up Energy Connection */}
          {doubleBombWindUp && (
            <svg
              className="absolute inset-0 w-full h-full pointer-events-none z-30 overflow-visible"
              aria-hidden="true"
            >
              <defs>
                <filter id="bb-fire-glow" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur in="SourceGraphic" stdDeviation="5" result="blur1" />
                  <feGaussianBlur in="SourceGraphic" stdDeviation="10" result="blur2" />
                  <feMerge>
                    <feMergeNode in="blur2" />
                    <feMergeNode in="blur1" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>
              <line
                x1={`${((doubleBombWindUp.c1 + 0.5) / match3Config.cols) * 100}%`}
                y1={`${((doubleBombWindUp.r1 + 0.5) / match3Config.rows) * 100}%`}
                x2={`${((doubleBombWindUp.c2 + 0.5) / match3Config.cols) * 100}%`}
                y2={`${((doubleBombWindUp.r2 + 0.5) / match3Config.rows) * 100}%`}
                stroke="#f43f5e"
                strokeWidth="8"
                strokeLinecap="round"
                filter="url(#bb-fire-glow)"
                className="animate-match3-energy-link-fire"
              />
              <line
                x1={`${((doubleBombWindUp.c1 + 0.5) / match3Config.cols) * 100}%`}
                y1={`${((doubleBombWindUp.r1 + 0.5) / match3Config.rows) * 100}%`}
                x2={`${((doubleBombWindUp.c2 + 0.5) / match3Config.cols) * 100}%`}
                y2={`${((doubleBombWindUp.r2 + 0.5) / match3Config.rows) * 100}%`}
                stroke="#ffffff"
                strokeWidth="3.5"
                strokeLinecap="round"
              />
            </svg>
          )}

          {/* Double Rocket Wind-Up Energy Connection */}
          {doubleRocketWindUp && (
            <svg
              className="absolute inset-0 w-full h-full pointer-events-none z-30 overflow-visible"
              aria-hidden="true"
            >
              <defs>
                <filter id="rr-electric-glow" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="blur1" />
                  <feGaussianBlur in="SourceGraphic" stdDeviation="8" result="blur2" />
                  <feMerge>
                    <feMergeNode in="blur2" />
                    <feMergeNode in="blur1" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>
              <line
                x1={`${((doubleRocketWindUp.c1 + 0.5) / match3Config.cols) * 100}%`}
                y1={`${((doubleRocketWindUp.r1 + 0.5) / match3Config.rows) * 100}%`}
                x2={`${((doubleRocketWindUp.c2 + 0.5) / match3Config.cols) * 100}%`}
                y2={`${((doubleRocketWindUp.r2 + 0.5) / match3Config.rows) * 100}%`}
                stroke="#38bdf8"
                strokeWidth="7"
                strokeLinecap="round"
                filter="url(#rr-electric-glow)"
                className="animate-match3-energy-link-electric"
              />
              <line
                x1={`${((doubleRocketWindUp.c1 + 0.5) / match3Config.cols) * 100}%`}
                y1={`${((doubleRocketWindUp.r1 + 0.5) / match3Config.rows) * 100}%`}
                x2={`${((doubleRocketWindUp.c2 + 0.5) / match3Config.cols) * 100}%`}
                y2={`${((doubleRocketWindUp.r2 + 0.5) / match3Config.rows) * 100}%`}
                stroke="#ffffff"
                strokeWidth="3"
                strokeLinecap="round"
              />
            </svg>
          )}

          {/* Rocket + Bomb Attack Visuals */}
          {rocketBombAttack && (
            <>
              {/* Highlight sweeps across the 3 rows being cleared */}
              {rocketBombAttack.clearedRows.map((rIdx) => (
                <div
                  key={`rb_highlight_r_${rIdx}`}
                  className="absolute left-0 right-0 pointer-events-none z-10 bg-amber-400/20 border-y border-amber-300/40"
                  style={{
                    top: `${(rIdx / match3Config.rows) * 100}%`,
                    height: `${(1 / match3Config.rows) * 100}%`,
                  }}
                />
              ))}

              {/* Highlight sweeps across the 3 columns being cleared */}
              {rocketBombAttack.clearedCols.map((cIdx) => (
                <div
                  key={`rb_highlight_c_${cIdx}`}
                  className="absolute top-0 bottom-0 pointer-events-none z-10 bg-amber-400/20 border-x border-amber-300/40"
                  style={{
                    left: `${(cIdx / match3Config.cols) * 100}%`,
                    width: `${(1 / match3Config.cols) * 100}%`,
                  }}
                />
              ))}

              {/* Horizontal rocket sweeps across the 3 cleared rows */}
              {rocketBombAttack.clearedRows.map((rIdx) => {
                const topPct = ((rIdx + 0.5) / match3Config.rows) * 100;
                const bombXPct = ((rocketBombAttack.bombCol + 0.5) / match3Config.cols) * 100;
                return (
                  <div
                    key={`rb_sweep_r_${rIdx}`}
                    className="absolute left-0 right-0 pointer-events-none z-40 overflow-visible"
                    style={{ top: `${topPct}%`, transform: 'translateY(-50%)' }}
                  >
                    <div className="w-full h-3 sm:h-4 bg-gradient-to-r from-amber-400 via-yellow-100 to-amber-400 shadow-[0_0_24px_#f59e0b] animate-match3-lane-sweep-h" />
                    <div
                      className="absolute top-1/2 -translate-y-1/2 animate-match3-rocket-shoot-left"
                      style={{ ['--start-x' as any]: `${bombXPct}%` }}
                    >
                      <div className="flex items-center -rotate-90 text-amber-300 filter drop-shadow-[0_0_10px_#f59e0b]">
                        <Rocket className="w-6 h-6 sm:w-8 sm:h-8" />
                      </div>
                    </div>
                    <div
                      className="absolute top-1/2 -translate-y-1/2 animate-match3-rocket-shoot-right"
                      style={{ ['--start-x' as any]: `${bombXPct}%` }}
                    >
                      <div className="flex items-center rotate-90 text-amber-300 filter drop-shadow-[0_0_10px_#f59e0b]">
                        <Rocket className="w-6 h-6 sm:w-8 sm:h-8" />
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Vertical rocket sweeps across the 3 cleared columns */}
              {rocketBombAttack.clearedCols.map((cIdx) => {
                const leftPct = ((cIdx + 0.5) / match3Config.cols) * 100;
                const bombYPct = ((rocketBombAttack.bombRow + 0.5) / match3Config.rows) * 100;
                return (
                  <div
                    key={`rb_sweep_c_${cIdx}`}
                    className="absolute top-0 bottom-0 pointer-events-none z-40 overflow-visible"
                    style={{ left: `${leftPct}%`, transform: 'translateX(-50%)' }}
                  >
                    <div className="h-full w-3 sm:h-4 bg-gradient-to-b from-amber-400 via-yellow-100 to-amber-400 shadow-[0_0_24px_#f59e0b] animate-match3-lane-sweep-v" />
                    <div
                      className="absolute left-1/2 -translate-x-1/2 animate-match3-rocket-shoot-up"
                      style={{ ['--start-y' as any]: `${bombYPct}%` }}
                    >
                      <div className="flex items-center text-amber-300 filter drop-shadow-[0_0_10px_#f59e0b]">
                        <Rocket className="w-6 h-6 sm:w-8 sm:h-8" />
                      </div>
                    </div>
                    <div
                      className="absolute left-1/2 -translate-x-1/2 animate-match3-rocket-shoot-down"
                      style={{ ['--start-y' as any]: `${bombYPct}%` }}
                    >
                      <div className="flex items-center rotate-180 text-amber-300 filter drop-shadow-[0_0_10px_#f59e0b]">
                        <Rocket className="w-6 h-6 sm:w-8 sm:h-8" />
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Large central explosion burst and shockwaves centered on the Bomb's resolved position */}
              <div
                className="absolute pointer-events-none rounded-full bg-gradient-to-r from-amber-300 via-yellow-100 to-rose-500 z-40 animate-match3-mega-burst"
                style={{
                  left: `${((rocketBombAttack.bombCol + 0.5) / match3Config.cols) * 100}%`,
                  top: `${((rocketBombAttack.bombRow + 0.5) / match3Config.rows) * 100}%`,
                  width: '120px',
                  height: '120px',
                }}
              />
              <div
                className="absolute pointer-events-none rounded-full border-4 border-amber-400 shadow-[0_0_35px_#f59e0b] z-40 animate-match3-shockwave-large"
                style={{
                  left: `${((rocketBombAttack.bombCol + 0.5) / match3Config.cols) * 100}%`,
                  top: `${((rocketBombAttack.bombRow + 0.5) / match3Config.rows) * 100}%`,
                  width: '140px',
                  height: '140px',
                }}
              />
              <div
                className="absolute pointer-events-none rounded-full border-2 border-rose-400 shadow-[0_0_25px_#f43f5e] z-40 animate-match3-shockwave-secondary"
                style={{
                  left: `${((rocketBombAttack.bombCol + 0.5) / match3Config.cols) * 100}%`,
                  top: `${((rocketBombAttack.bombRow + 0.5) / match3Config.rows) * 100}%`,
                  width: '160px',
                  height: '160px',
                }}
              />
            </>
          )}

          {/* Double Bomb Attack Visuals (5x5 Mega Explosion) */}
          {doubleBombAttack && (
            <>
              {/* Highlight of all actual cleared 5x5 coords */}
              {doubleBombAttack.clearedCoords.map((coord) => (
                <div
                  key={`bb_highlight_${coord.row}_${coord.col}`}
                  className="absolute pointer-events-none z-20 rounded-xl bg-rose-500/35 border border-rose-300/60 shadow-[0_0_16px_rgba(244,63,94,0.6)] animate-match3-bomb-area-highlight"
                  style={{
                    top: `${(coord.row / match3Config.rows) * 100}%`,
                    left: `${(coord.col / match3Config.cols) * 100}%`,
                    width: `${(1 / match3Config.cols) * 100}%`,
                    height: `${(1 / match3Config.rows) * 100}%`,
                  }}
                />
              ))}

              {/* Central mega blast core */}
              <div
                className="absolute pointer-events-none rounded-full bg-gradient-to-r from-rose-500 via-amber-300 to-white z-40 animate-match3-double-bomb-burst"
                style={{
                  left: `${((doubleBombAttack.centerCol + 0.5) / match3Config.cols) * 100}%`,
                  top: `${((doubleBombAttack.centerRow + 0.5) / match3Config.rows) * 100}%`,
                  width: '140px',
                  height: '140px',
                }}
              />

              {/* Expanding shockwave ring 1 (Orange/Gold) */}
              <div
                className="absolute pointer-events-none rounded-full border-4 border-amber-400 shadow-[0_0_40px_#f59e0b] z-40 animate-match3-double-bomb-ring-1"
                style={{
                  left: `${((doubleBombAttack.centerCol + 0.5) / match3Config.cols) * 100}%`,
                  top: `${((doubleBombAttack.centerRow + 0.5) / match3Config.rows) * 100}%`,
                  width: '160px',
                  height: '160px',
                }}
              />

              {/* Expanding shockwave ring 2 (Hot Rose/Red) */}
              <div
                className="absolute pointer-events-none rounded-full border-4 border-rose-500 shadow-[0_0_45px_#f43f5e] z-40 animate-match3-double-bomb-ring-2"
                style={{
                  left: `${((doubleBombAttack.centerCol + 0.5) / match3Config.cols) * 100}%`,
                  top: `${((doubleBombAttack.centerRow + 0.5) / match3Config.rows) * 100}%`,
                  width: '180px',
                  height: '180px',
                }}
              />
            </>
          )}

          {/* Double Rocket Attack Visuals (Crossfire Strike) */}
          {doubleRocketAttack && (
            <>
              {/* Horizontal Crossfire Energy Beam */}
              <div
                className="absolute left-0 right-0 pointer-events-none z-40 overflow-visible"
                style={{
                  top: `${((doubleRocketAttack.centerRow + 0.5) / match3Config.rows) * 100}%`,
                  transform: 'translateY(-50%)',
                }}
              >
                <div className="w-full h-4 sm:h-5 bg-gradient-to-r from-sky-400 via-white to-sky-400 shadow-[0_0_28px_#38bdf8] animate-match3-cross-beam-h" />
                <div
                  className="absolute top-1/2 -translate-y-1/2 animate-match3-rocket-shoot-left"
                  style={{ ['--start-x' as any]: `${((doubleRocketAttack.centerCol + 0.5) / match3Config.cols) * 100}%` }}
                >
                  <div className="flex items-center -rotate-90 text-sky-200 filter drop-shadow-[0_0_12px_#38bdf8]">
                    <Rocket className="w-7 h-7 sm:w-9 sm:h-9" />
                  </div>
                </div>
                <div
                  className="absolute top-1/2 -translate-y-1/2 animate-match3-rocket-shoot-right"
                  style={{ ['--start-x' as any]: `${((doubleRocketAttack.centerCol + 0.5) / match3Config.cols) * 100}%` }}
                >
                  <div className="flex items-center rotate-90 text-sky-200 filter drop-shadow-[0_0_12px_#38bdf8]">
                    <Rocket className="w-7 h-7 sm:w-9 sm:h-9" />
                  </div>
                </div>
              </div>

              {/* Vertical Crossfire Energy Beam */}
              <div
                className="absolute top-0 bottom-0 pointer-events-none z-40 overflow-visible"
                style={{
                  left: `${((doubleRocketAttack.centerCol + 0.5) / match3Config.cols) * 100}%`,
                  transform: 'translateX(-50%)',
                }}
              >
                <div className="h-full w-4 sm:w-5 bg-gradient-to-b from-sky-400 via-white to-sky-400 shadow-[0_0_28px_#38bdf8] animate-match3-cross-beam-v" />
                <div
                  className="absolute left-1/2 -translate-x-1/2 animate-match3-rocket-shoot-up"
                  style={{ ['--start-y' as any]: `${((doubleRocketAttack.centerRow + 0.5) / match3Config.rows) * 100}%` }}
                >
                  <div className="flex items-center text-sky-200 filter drop-shadow-[0_0_12px_#38bdf8]">
                    <Rocket className="w-7 h-7 sm:w-9 sm:h-9" />
                  </div>
                </div>
                <div
                  className="absolute left-1/2 -translate-x-1/2 animate-match3-rocket-shoot-down"
                  style={{ ['--start-y' as any]: `${((doubleRocketAttack.centerRow + 0.5) / match3Config.rows) * 100}%` }}
                >
                  <div className="flex items-center rotate-180 text-sky-200 filter drop-shadow-[0_0_12px_#38bdf8]">
                    <Rocket className="w-7 h-7 sm:w-9 sm:h-9" />
                  </div>
                </div>
              </div>

              {/* Center Intersection Impact Flash */}
              <div
                className="absolute pointer-events-none rounded-full bg-gradient-to-r from-sky-300 via-white to-blue-400 z-50 animate-match3-cross-flash"
                style={{
                  left: `${((doubleRocketAttack.centerCol + 0.5) / match3Config.cols) * 100}%`,
                  top: `${((doubleRocketAttack.centerRow + 0.5) / match3Config.rows) * 100}%`,
                  width: '110px',
                  height: '110px',
                }}
              />
            </>
          )}

          {/* Arcade Combo Banner Popup */}
          {comboBanner && (
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 pointer-events-none flex flex-col items-center justify-center animate-match3-combo-banner select-none">
              <div
                className={`text-white font-black px-4 sm:px-6 py-2 rounded-2xl flex items-center gap-2.5 tracking-wider text-base sm:text-xl whitespace-nowrap shadow-2xl border-2 ${
                  comboBanner.type === 'double-bomb'
                    ? 'bg-gradient-to-r from-rose-600 via-orange-600 to-amber-500 shadow-[0_0_40px_rgba(244,63,94,0.95)] border-rose-300'
                    : comboBanner.type === 'double-rocket'
                    ? 'bg-gradient-to-r from-sky-600 via-blue-600 to-indigo-600 shadow-[0_0_40px_rgba(56,189,248,0.95)] border-sky-300'
                    : 'bg-gradient-to-r from-amber-500 via-orange-500 to-rose-600 shadow-[0_0_35px_rgba(245,158,11,0.9)] border-amber-300'
                }`}
              >
                {comboBanner.type === 'double-bomb' ? (
                  <>
                    <Bomb className="w-5 h-5 sm:w-6 sm:h-6 text-rose-200 shrink-0" />
                    <span>{comboBanner.title}</span>
                    <Bomb className="w-5 h-5 sm:w-6 sm:h-6 text-rose-200 shrink-0" />
                  </>
                ) : comboBanner.type === 'double-rocket' ? (
                  <>
                    <Rocket className="w-5 h-5 sm:w-6 sm:h-6 text-sky-200 -rotate-45 shrink-0" />
                    <span>{comboBanner.title}</span>
                    <Rocket className="w-5 h-5 sm:w-6 sm:h-6 text-sky-200 rotate-45 shrink-0" />
                  </>
                ) : (
                  <>
                    <Rocket className="w-5 h-5 sm:w-6 sm:h-6 text-amber-200 -rotate-45 shrink-0" />
                    <span>{comboBanner.title}</span>
                    <Bomb className="w-5 h-5 sm:w-6 sm:h-6 text-amber-200 shrink-0" />
                  </>
                )}
              </div>
              <span
                className={`text-[10px] sm:text-xs font-black tracking-widest uppercase drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)] mt-1.5 bg-black/60 px-3 py-0.5 rounded-full border ${
                  comboBanner.type === 'double-bomb'
                    ? 'text-rose-300 border-rose-400/40'
                    : comboBanner.type === 'double-rocket'
                    ? 'text-sky-300 border-sky-400/40'
                    : 'text-amber-300 border-amber-400/40'
                }`}
              >
                {comboBanner.subtitle}
              </span>
            </div>
          )}

          {/* Rocket beam streaks */}
          {rocketStreaks.map((s) => (
            <div
              key={s.id}
              className={`absolute pointer-events-none z-40 ${
                s.direction === 'horizontal'
                  ? 'left-0 right-0 h-2 bg-gradient-to-r from-transparent via-amber-300 to-transparent shadow-[0_0_16px_#fbbf24] animate-match3-beam-h'
                  : 'top-0 bottom-0 w-2 bg-gradient-to-b from-transparent via-amber-300 to-transparent shadow-[0_0_16px_#fbbf24] animate-match3-beam-v'
              }`}
              style={
                s.direction === 'horizontal'
                  ? { top: `${((s.index + 0.5) / match3Config.rows) * 100}%`, transform: 'translateY(-50%)' }
                  : { left: `${((s.index + 0.5) / match3Config.cols) * 100}%`, transform: 'translateX(-50%)' }
              }
            />
          ))}

          {/* Bomb Shockwaves */}
          {bombShockwaves.map((sw) => (
            <div
              key={sw.id}
              className="absolute pointer-events-none rounded-full border-4 shadow-[0_0_24px_rgba(251,191,36,0.8)] z-40 animate-match3-shockwave"
              style={{
                left: `${sw.xPct}%`,
                top: `${sw.yPct}%`,
                width: '120px',
                height: '120px',
                borderColor: sw.color,
              }}
            />
          ))}

          {/* Sparkle particles */}
          {particles.map((p) => (
            <div
              key={p.id}
              className="absolute pointer-events-none font-bold z-40 animate-match3-particle select-none"
              style={{
                left: `${p.xPct}%`,
                top: `${p.yPct}%`,
                color: p.color,
                fontSize: `${p.size}px`,
                textShadow: `0 0 10px ${p.color}`,
                ['--p-dx' as any]: p.dx,
                ['--p-dy' as any]: p.dy,
              }}
            >
              {p.char || '✦'}
            </div>
          ))}

          {/* Floating score popups */}
          {popups.map((p) => {
            const leftPct = (p.x / match3Config.cols) * 100;
            const topPct = (p.y / match3Config.rows) * 100;
            return (
              <div
                key={p.id}
                className={`absolute pointer-events-none font-black select-none z-50 animate-match3-float-score ${
                  p.isCombo
                    ? 'text-base sm:text-xl px-3.5 py-1.5 rounded-2xl bg-amber-950/90 border-2 border-amber-400 shadow-[0_0_25px_rgba(251,191,36,0.7)] text-amber-300'
                    : 'text-xs sm:text-sm px-2.5 py-1 rounded-xl bg-slate-950/90 border border-amber-400/50 shadow-xl text-amber-400'
                }`}
                style={{
                  left: `${leftPct}%`,
                  top: `${topPct}%`,
                  ['--popup-rotate' as any]: `${p.rotation || 0}deg`,
                }}
              >
                {p.text}
              </div>
            );
          })}
        </div>
      </main>

      {/* Footer Instructions / Progress */}
      <footer className="w-full max-w-4xl px-3 sm:px-4 h-9 sm:h-10 shrink-0 flex items-center justify-between text-xs text-slate-400 z-20 overflow-hidden select-none">
        <div className="flex items-center gap-2 truncate">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping shrink-0" />
          <span className="truncate">
            {activeTheme?.layout?.footerSponsor?.visible !== false && activeTheme?.branding?.subtitle
              ? activeTheme.branding.subtitle
              : t('studio.match3Tip', undefined, 'Swap adjacent tiles to create 3+ matches!')}
          </span>
        </div>
        <div className="flex items-center gap-3 font-mono shrink-0">
          <span className="tabular-nums">Matches: <strong className="text-slate-200">{matchesCount}</strong></span>
          <span className="tabular-nums">Specials: <strong className="text-amber-400">{specialsCreatedCount}</strong></span>
        </div>
      </footer>

      {/* Countdown Overlay (3, 2, 1, GO!) */}
      {status === 'countdown' && (
        <div className="absolute inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex flex-col items-center justify-center space-y-4">
          <span className="text-7xl sm:text-9xl font-black text-amber-400 font-mono tracking-tight animate-ping">
            {countdownValue > 0 ? countdownValue : 'GO!'}
          </span>
          <span className="text-sm sm:text-base font-bold text-slate-300 uppercase tracking-widest">
            {t('common.ready', undefined, 'GET READY!')}
          </span>
        </div>
      )}

      {/* Game Over Banner */}
      {status === 'game_over' && (
        <div className="absolute inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex flex-col items-center justify-center space-y-3 animate-in fade-in">
          <h2 className="text-4xl sm:text-6xl font-black text-amber-400 tracking-tight uppercase">
            {t('common.timeUp', undefined, 'GAME COMPLETE')}
          </h2>
          <p className="text-xl font-bold font-mono text-slate-100">
            Final Score: {score.toLocaleString()}
          </p>
        </div>
      )}

      {renderLeaderboardModal()}
    </div>
  );
};
