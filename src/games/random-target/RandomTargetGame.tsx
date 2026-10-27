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
  Clock,
  Target,
  Zap,
  Shield,
  Crosshair,
  AlertTriangle,
  X,
} from 'lucide-react';
import { GameComponentProps } from '../types';
import { LayoutElementKey } from '../../themes/layout';
import {
  RandomTargetGameConfig,
  RandomTargetStats,
  ActiveTarget,
  HitFeedback,
  ProjectileAnimation,
  DEFAULT_DESERT_CONFIG,
  DEFAULT_OCEAN_CONFIG,
  normalizeRandomTargetConfig,
} from './types';
import {
  calculateCurrentDifficulty,
  spawnRandomTarget,
  handleTargetHit,
  handleTargetExpirations,
  calculateAimAngleDeg,
} from './engine';
import { randomTargetSounds } from './randomTargetSounds';
import { ResultScreenRenderer } from '../shared/ResultScreenRenderer';
import { StartScreenRenderer } from '../shared/StartScreenRenderer';
import { getStartScreenConfig } from '../shared/startScreenResolver';
import { useResponsiveLayout } from '../../themes/responsive';
import { apiFetch } from '../../lib/api';

export const RANDOM_TARGET_DESIGN_WIDTH = 1024;
export const RANDOM_TARGET_DESIGN_HEIGHT = 576;

export interface RandomTargetGameProps extends Partial<GameComponentProps<RandomTargetGameConfig>> {
  className?: string;
  isSimulation?: boolean;
  editableLayout?: boolean;
  selectedElementKey?: LayoutElementKey | null;
  onSelectElementKey?: (key: LayoutElementKey) => void;
  stageScale?: number;
  stageWidth?: number;
  stageHeight?: number;
  overrideOrientation?: 'landscape' | 'portrait';
}

export const RandomTargetGame: React.FC<RandomTargetGameProps> = ({
  className = '',
  activeTheme,
  settings,
  config: propConfig,
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
  isSimulation = false,
  stageScale,
  stageWidth,
  stageHeight,
  overrideOrientation,
}) => {
  const { t } = useLocalization();

  // Merge theme game_config and propConfig with desert/ocean fallback using canonical normalizer
  const resolvedConfig = useMemo<RandomTargetGameConfig>(() => {
    const isOceanTheme = (activeTheme?.id || '').includes('ocean') || (activeTheme?.slug || '').includes('ocean');
    const baseDefault = isOceanTheme ? DEFAULT_OCEAN_CONFIG : DEFAULT_DESERT_CONFIG;

    return normalizeRandomTargetConfig(
      {
        ...((activeTheme?.game_config as any) || {}),
        ...(propConfig || {}),
      },
      baseDefault
    );
  }, [activeTheme, propConfig]);

  // Core Game State
  const [gameState, setGameState] = useState<'READY' | 'PLAYING' | 'GAME_OVER'>(
    isSimulation ? 'PLAYING' : 'READY'
  );
  const [remainingSeconds, setRemainingSeconds] = useState<number>(
    resolvedConfig.gameDurationSeconds || 30
  );
  const [stats, setStats] = useState<RandomTargetStats>({
    score: resolvedConfig.startingScore || 0,
    positiveHits: 0,
    negativeHits: 0,
    totalHits: 0,
    missedTargets: 0,
    accuracy: 100,
    highestStreak: 0,
    currentStreak: 0,
  });

  // Active runtime targets & visual feedback
  const [activeTargets, setActiveTargets] = useState<ActiveTarget[]>([]);
  const [hitFeedbacks, setHitFeedbacks] = useState<HitFeedback[]>([]);
  const [projectiles, setProjectiles] = useState<ProjectileAnimation[]>([]);

  // Bottom-right tool aim angle and recoil animation state
  const [toolAimDeg, setToolAimDeg] = useState<number>(0);
  const [toolRecoil, setToolRecoil] = useState<boolean>(false);
  const [muzzleFlash, setMuzzleFlash] = useState<boolean>(false);

  // References
  const stageRef = useRef<HTMLDivElement>(null);
  const gameLoopRef = useRef<number | null>(null);
  const lastSpawnTimeRef = useRef<number>(0);
  const startTimeRef = useRef<number>(0);
  const isGameOverTriggeredRef = useRef<boolean>(false);
  const timeoutIdsRef = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  const sessionIdRef = useRef<string>(
    `rt_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
  );

  // Synchronized refs to prevent game loop teardown on hit state updates
  const statsRef = useRef<RandomTargetStats>(stats);
  statsRef.current = stats;
  const activeTargetsRef = useRef<ActiveTarget[]>(activeTargets);
  activeTargetsRef.current = activeTargets;

  // Player Name & Score Submission State
  const [playerName, setPlayerName] = useState<string>(() => settings?.playerName || '');
  const [isSubmittingScore, setIsSubmittingScore] = useState<boolean>(false);
  const [scoreSubmitted, setScoreSubmitted] = useState<boolean>(false);
  const [playerRank, setPlayerRank] = useState<number | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Responsive scale hook matching EventGameStudio coordinate system
  const orientationPreference = activeTheme?.layout?.orientation || 'auto';
  const fallbackResponsive = useResponsiveLayout(stageRef, orientationPreference, overrideOrientation);
  const scale = stageScale ?? fallbackResponsive.uiScale;

  // Leaderboard data state
  const [leaderboardData, setLeaderboardData] = useState<any[]>([]);
  const [loadingLeaderboard, setLoadingLeaderboard] = useState<boolean>(false);
  const [showLeaderboardModal, setShowLeaderboardModal] = useState<boolean>(false);

  const registerTimeout = useCallback((fn: () => void, delayMs: number) => {
    const id = setTimeout(() => {
      timeoutIdsRef.current = timeoutIdsRef.current.filter((t) => t !== id);
      fn();
    }, delayMs);
    timeoutIdsRef.current.push(id);
    return id;
  }, []);

  const clearAllTimeouts = useCallback(() => {
    for (const id of timeoutIdsRef.current) {
      clearTimeout(id);
    }
    timeoutIdsRef.current = [];
  }, []);

  const fetchLeaderboard = useCallback(async () => {
    if (!eventId && !publicToken) return;
    setLoadingLeaderboard(true);
    try {
      const endpoint = publicToken
        ? `/api/events/public/${encodeURIComponent(publicToken)}/scores`
        : `/api/events/${encodeURIComponent(eventId!)}/scores`;
      const res = await apiFetch(endpoint);
      if (res.ok) {
        const data: any = await res.json();
        const list = Array.isArray(data?.scores) ? data.scores : Array.isArray(data) ? data : [];
        setLeaderboardData(list);
      }
    } catch {
      // Graceful non-blocking fallback
    } finally {
      setLoadingLeaderboard(false);
    }
  }, [eventId, publicToken]);

  // Audio configuration sync
  useEffect(() => {
    randomTargetSounds.setMuted(isMuted || !resolvedConfig.soundEnabled);
    randomTargetSounds.setVolume(resolvedConfig.soundVolume || 0.8);
    randomTargetSounds.setTheme(activeTheme?.id || 'desert-quick-draw');
  }, [isMuted, resolvedConfig.soundEnabled, resolvedConfig.soundVolume, activeTheme?.id]);

  // Notify parent of game state & stats changes
  useEffect(() => {
    onGameStateChange?.({
      status: gameState === 'PLAYING' ? 'playing' : gameState === 'READY' ? 'ready' : 'gameover',
      score: stats.score,
      timeRemaining: remainingSeconds,
      isMuted,
    });
  }, [gameState, stats.score, remainingSeconds, isMuted, onGameStateChange]);

  useEffect(() => {
    onStatsChange?.({
      score: stats.score,
      itemsCaught: stats.positiveHits,
      bonusCaught: stats.highestStreak,
      hazardsHit: stats.negativeHits,
      accuracy: stats.accuracy,
    });
  }, [stats, onStatsChange]);

  /**
   * Starts a new game round
   */
  const handleStartGame = useCallback(() => {
    clearAllTimeouts();
    const initialStats: RandomTargetStats = {
      score: resolvedConfig.startingScore || 0,
      positiveHits: 0,
      negativeHits: 0,
      totalHits: 0,
      missedTargets: 0,
      accuracy: 100,
      highestStreak: 0,
      currentStreak: 0,
    };
    statsRef.current = initialStats;
    activeTargetsRef.current = [];

    setGameState('PLAYING');
    setRemainingSeconds(resolvedConfig.gameDurationSeconds || 30);
    setStats(initialStats);
    setActiveTargets([]);
    setHitFeedbacks([]);
    setProjectiles([]);
    setToolAimDeg(0);
    setToolRecoil(false);
    setMuzzleFlash(false);

    // Reset score submission state for new session
    setScoreSubmitted(false);
    setIsSubmittingScore(false);
    setPlayerRank(null);
    setSubmitError(null);
    setPlayerName(settings?.playerName || '');
    try {
      localStorage.removeItem('event_player_name');
    } catch {
      // Ignore storage access errors
    }

    isGameOverTriggeredRef.current = false;
    startTimeRef.current = Date.now();
    lastSpawnTimeRef.current = Date.now();
    sessionIdRef.current = `rt_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    if (resolvedConfig.bgmEnabled) {
      randomTargetSounds.startBgm();
    }
  }, [resolvedConfig, clearAllTimeouts, settings?.playerName]);

  /**
   * Finalizes the game round and transitions to the Result / Score Submission screen
   */
  const handleGameOver = useCallback(() => {
    if (isGameOverTriggeredRef.current) return;
    isGameOverTriggeredRef.current = true;

    clearAllTimeouts();
    activeTargetsRef.current = [];
    setActiveTargets([]);
    setProjectiles([]);
    setToolRecoil(false);
    setMuzzleFlash(false);

    setGameState('GAME_OVER');
    randomTargetSounds.stopBgm();
    randomTargetSounds.playGameOver();

    if ((eventId || publicToken) && !isSimulation) {
      fetchLeaderboard();
    }
  }, [clearAllTimeouts, eventId, publicToken, isSimulation, fetchLeaderboard]);

  const handleGameOverRef = useRef(handleGameOver);
  handleGameOverRef.current = handleGameOver;

  /**
   * Submits player score with entered playerName to the authoritative event leaderboard
   */
  const handleSubmitScore = useCallback(
    async (e?: React.FormEvent) => {
      if (e) e.preventDefault();
      if (gameState !== 'GAME_OVER') return;
      if (isSubmittingScore || scoreSubmitted) return;
      if (isSimulation || (isEventPreview && !isEventTest)) return;
      if (!eventId && !publicToken) return;

      const trimmedName = playerName.trim();
      if (!trimmedName) {
        setSubmitError(t('game.enterNamePrompt', undefined, 'Please enter your name to submit your score.'));
        return;
      }

      setIsSubmittingScore(true);
      setSubmitError(null);

      try {
        const currentStats = statsRef.current;
        const isPublic = Boolean(publicToken) && !isEventTest && !isEventPreview;
        const payload = {
          player_name: trimmedName,
          playerName: trimmedName,
          score: currentStats.score,
          session_id: sessionIdRef.current,
          sessionId: sessionIdRef.current,
          metadata: {
            gameType: 'random-target',
            positiveHits: currentStats.positiveHits,
            negativeHits: currentStats.negativeHits,
            totalHits: currentStats.totalHits,
            missedTargets: currentStats.missedTargets,
            highestStreak: currentStats.highestStreak,
            accuracy: currentStats.accuracy,
            duration: resolvedConfig.gameDurationSeconds || 30,
            isEventTest,
            isEventPreview,
            isPublicSubmission: isPublic,
            score_environment: isEventTest ? 'TEST' : isEventPreview ? 'PREVIEW' : 'LIVE',
          },
        };

        const endpoint = isPublic
          ? `/api/events/public/${encodeURIComponent(publicToken!)}/scores`
          : `/api/events/${encodeURIComponent((eventId || publicToken)!)}/scores`;

        const res = await apiFetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        const data: any = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data?.error || data?.message || 'Failed to submit score');
        }

        setScoreSubmitted(true);
        if (typeof data?.rank === 'number') {
          setPlayerRank(data.rank);
        }
        await fetchLeaderboard();
      } catch (err: any) {
        console.warn('[RandomTargetGame] Error submitting high score:', err);
        setSubmitError(err?.message || 'Failed to submit score. Please try again.');
      } finally {
        setIsSubmittingScore(false);
      }
    },
    [
      gameState,
      isSubmittingScore,
      scoreSubmitted,
      isSimulation,
      isEventPreview,
      isEventTest,
      eventId,
      publicToken,
      playerName,
      resolvedConfig.gameDurationSeconds,
      fetchLeaderboard,
      t,
    ]
  );

  // Tool anchor coordinates in 1024x576 design space
  const toolAnchorX = RANDOM_TARGET_DESIGN_WIDTH - 16 - (resolvedConfig.interactionTool.size || 160) * 0.45;
  const toolAnchorY = RANDOM_TARGET_DESIGN_HEIGHT - 8 - (resolvedConfig.interactionTool.size || 160) * 0.45;

  /**
   * Handles target click / tap interaction
   */
  const handleTargetPointerDown = useCallback(
    (targetUid: string, e: React.PointerEvent<HTMLDivElement>) => {
      e.stopPropagation();
      e.preventDefault();

      if (gameState !== 'PLAYING' || isGameOverTriggeredRef.current) return;

      const now = Date.now();
      const currentTargets = activeTargetsRef.current;
      const currentTarget = currentTargets.find((t) => t.uid === targetUid);
      if (
        !currentTarget ||
        (currentTarget.state !== 'active' && currentTarget.state !== 'spawning') ||
        now - currentTarget.spawnTimeMs >= currentTarget.lifetimeMs
      ) {
        return;
      }

      const targetDesignX =
        (currentTarget.xPercent / 100) * RANDOM_TARGET_DESIGN_WIDTH + currentTarget.size / 2;
      const targetDesignY =
        (currentTarget.yPercent / 100) * RANDOM_TARGET_DESIGN_HEIGHT + currentTarget.size / 2;

      const aimAngle = calculateAimAngleDeg(toolAnchorX, toolAnchorY, targetDesignX, targetDesignY, 180);
      setToolAimDeg(aimAngle);

      // Trigger tool recoil & muzzle flash
      setToolRecoil(true);
      setMuzzleFlash(true);
      registerTimeout(() => setToolRecoil(false), 140);
      registerTimeout(() => setMuzzleFlash(false), 90);

      // Play tool sound and hit sound
      randomTargetSounds.playToolAction(resolvedConfig.interactionTool.type);

      // Execute authoritative target hit using latest refs
      const { updatedTargets, updatedStats, hitTarget } = handleTargetHit(
        targetUid,
        currentTargets,
        statsRef.current,
        resolvedConfig,
        now
      );

      activeTargetsRef.current = updatedTargets;
      statsRef.current = updatedStats;
      setActiveTargets(updatedTargets);
      setStats(updatedStats);

      if (hitTarget) {
        if (hitTarget.isPenalty) {
          randomTargetSounds.playNegativeHit();
        } else {
          randomTargetSounds.playPositiveHit();
        }

        // Add floating score feedback
        const feedbackId = `fb_${now}_${Math.random().toString(36).substring(2, 6)}`;
        setHitFeedbacks((prev) => [
          ...prev,
          {
            id: feedbackId,
            x: targetDesignX,
            y: targetDesignY,
            scoreDelta: hitTarget.score,
            isPenalty: hitTarget.isPenalty,
            label: hitTarget.isPenalty ? `${hitTarget.score}` : `+${hitTarget.score}`,
            createdAt: now,
          },
        ]);

        // Add projectile animation
        const projectileId = `proj_${now}_${Math.random().toString(36).substring(2, 6)}`;
        const projDuration = resolvedConfig.interactionTool.projectileSpeedMs || 200;
        setProjectiles((prev) => [
          ...prev,
          {
            id: projectileId,
            startX: toolAnchorX,
            startY: toolAnchorY,
            targetX: targetDesignX,
            targetY: targetDesignY,
            type: resolvedConfig.interactionTool.projectileEffect,
            progress: 0,
            createdAt: now,
          },
        ]);

        // Automatically clean up hit feedback and projectile after animation
        registerTimeout(() => {
          setHitFeedbacks((prev) => prev.filter((f) => f.id !== feedbackId));
        }, 850);

        registerTimeout(() => {
          setProjectiles((prev) => prev.filter((p) => p.id !== projectileId));
        }, projDuration);
      }
    },
    [gameState, resolvedConfig, toolAnchorX, toolAnchorY, registerTimeout]
  );

  /**
   * Handles click / tap in blank arena space (miss mechanic & tool aiming feedback)
   */
  const handleArenaPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (gameState !== 'PLAYING' || isGameOverTriggeredRef.current) return;

      const stageEl = stageRef.current;
      if (!stageEl) return;
      const rect = stageEl.getBoundingClientRect();
      // Compute click position relative to the scaled 1024x576 canvas
      const canvasLeft = rect.left + (rect.width - RANDOM_TARGET_DESIGN_WIDTH * scale) / 2;
      const canvasTop = rect.top + (rect.height - RANDOM_TARGET_DESIGN_HEIGHT * scale) / 2;
      const clickX = Math.max(0, Math.min(RANDOM_TARGET_DESIGN_WIDTH, (e.clientX - canvasLeft) / scale));
      const clickY = Math.max(0, Math.min(RANDOM_TARGET_DESIGN_HEIGHT, (e.clientY - canvasTop) / scale));

      const aimAngle = calculateAimAngleDeg(toolAnchorX, toolAnchorY, clickX, clickY, 180);
      setToolAimDeg(aimAngle);

      setToolRecoil(true);
      setMuzzleFlash(true);
      registerTimeout(() => setToolRecoil(false), 140);
      registerTimeout(() => setMuzzleFlash(false), 90);

      randomTargetSounds.playToolAction(resolvedConfig.interactionTool.type);

      const now = Date.now();
      const projectileId = `proj_${now}_${Math.random().toString(36).substring(2, 6)}`;
      const projDuration = resolvedConfig.interactionTool.projectileSpeedMs || 200;
      setProjectiles((prev) => [
        ...prev,
        {
          id: projectileId,
          startX: toolAnchorX,
          startY: toolAnchorY,
          targetX: clickX,
          targetY: clickY,
          type: resolvedConfig.interactionTool.projectileEffect,
          progress: 0,
          createdAt: now,
        },
      ]);

      registerTimeout(() => {
        setProjectiles((prev) => prev.filter((p) => p.id !== projectileId));
      }, projDuration);

      // Miss resets current streak and recalculates accuracy
      setStats((prev) => {
        const newMissed = prev.missedTargets + 1;
        const totalAttempts = prev.totalHits + newMissed;
        const newAccuracy = totalAttempts > 0 ? Math.round((prev.positiveHits / totalAttempts) * 100) : 100;
        const next = {
          ...prev,
          currentStreak: 0,
          missedTargets: newMissed,
          accuracy: newAccuracy,
        };
        statsRef.current = next;
        return next;
      });
    },
    [gameState, scale, resolvedConfig, toolAnchorX, toolAnchorY, registerTimeout]
  );

  // Fetch leaderboard data when available
  useEffect(() => {
    if (!eventId && !publicToken) return;
    fetchLeaderboard();
  }, [eventId, publicToken, fetchLeaderboard]);

  /**
   * Main game animation and spawning tick loop.
   * Uses stable refs for stats and handleGameOver so target hits never reset the countdown timer or BGM.
   */
  useEffect(() => {
    if (gameState !== 'PLAYING') return;

    const timerInterval = setInterval(() => {
      setRemainingSeconds((prev) => {
        if (prev <= 1) {
          clearInterval(timerInterval);
          handleGameOverRef.current();
          return 0;
        }
        if (prev <= 6) {
          randomTargetSounds.playCountdownTick(prev === 1);
        }
        return prev - 1;
      });
    }, 1000);

    // Frame update loop for spawning and target expiration
    const tick = () => {
      if (isGameOverTriggeredRef.current) return;

      const now = Date.now();
      const totalDurationMs = (resolvedConfig.gameDurationSeconds || 30) * 1000;
      const elapsedMs = now - startTimeRef.current;

      if (elapsedMs >= totalDurationMs) {
        handleGameOverRef.current();
        return;
      }

      const progress = Math.min(1, elapsedMs / totalDurationMs);
      const { spawnIntervalMs, targetLifetimeMs } = calculateCurrentDifficulty(
        progress,
        resolvedConfig
      );

      // Handle expirations and spawning using latest refs
      setActiveTargets((prevTargets) => {
        const { updatedTargets, updatedStats, newlyExpiredCount } = handleTargetExpirations(
          now,
          prevTargets,
          statsRef.current
        );
        if (newlyExpiredCount > 0) {
          statsRef.current = updatedStats;
          setStats(updatedStats);
        }

        let nextTargets = updatedTargets;

        // Spawn new target if interval elapsed
        if (now - lastSpawnTimeRef.current >= spawnIntervalMs) {
          const newTarget = spawnRandomTarget(resolvedConfig, updatedTargets, targetLifetimeMs);
          if (newTarget) {
            lastSpawnTimeRef.current = now;
            nextTargets = [...updatedTargets, newTarget];
          }
        }

        const cleaned = nextTargets.filter(
          (t) =>
            t.state === 'active' ||
            t.state === 'spawning' ||
            now - t.spawnTimeMs < t.lifetimeMs + 300
        );
        activeTargetsRef.current = cleaned;
        return cleaned;
      });

      gameLoopRef.current = requestAnimationFrame(tick);
    };

    gameLoopRef.current = requestAnimationFrame(tick);

    return () => {
      clearInterval(timerInterval);
      if (gameLoopRef.current) cancelAnimationFrame(gameLoopRef.current);
      randomTargetSounds.stopBgm();
    };
  }, [gameState, resolvedConfig]);

  // Clean up on component unmount
  useEffect(() => {
    return () => {
      clearAllTimeouts();
      randomTargetSounds.dispose();
      if (gameLoopRef.current) cancelAnimationFrame(gameLoopRef.current);
    };
  }, [clearAllTimeouts]);

  const backgroundImageUrl =
    activeTheme?.background_url ||
    (activeTheme?.id?.includes('ocean')
      ? '/assets/images/ocean_arcade_bg_1792994317724.jpg'
      : '/assets/images/desert_arcade_bg_1792994317277.jpg');

  return (
    <div
      ref={stageRef}
      className={`relative w-full h-full flex items-center justify-center overflow-hidden bg-slate-950 select-none ${className || ''}`}
      style={{
        touchAction: 'manipulation',
      }}
    >
      {/* 1024x576 Responsive Design Canvas */}
      <div
        className="relative overflow-hidden shadow-2xl rounded-lg"
        style={{
          width: `${RANDOM_TARGET_DESIGN_WIDTH}px`,
          height: `${RANDOM_TARGET_DESIGN_HEIGHT}px`,
          transform: `scale(${scale})`,
          transformOrigin: 'center center',
        }}
      >
        {/* Background Image with Graceful Gradient Fallback */}
        <div
          className="absolute inset-0 bg-cover bg-center pointer-events-none transition-opacity duration-500"
          style={{
            backgroundImage: `url(${backgroundImageUrl})`,
            backgroundColor: activeTheme?.visuals_config?.bgGradientFrom || '#0f172a',
          }}
        />

        {/* Ambient Overlay */}
        <div className="absolute inset-0 bg-black/15 pointer-events-none" />

        {/* ==================================================================== */}
        {/* TOP HUD BAR */}
        {/* ==================================================================== */}
        <div className="absolute top-0 left-0 right-0 h-16 px-6 flex items-center justify-between z-20 pointer-events-none">
          {/* Left: Score HUD */}
          <div className="flex items-center gap-3 bg-black/55 backdrop-blur-md px-4 py-2 rounded-xl border border-white/10 shadow-lg pointer-events-auto">
            <Trophy className="w-5 h-5 text-amber-400" />
            <div className="flex flex-col">
              <span className="text-[10px] uppercase font-bold tracking-wider text-slate-300">
                {t('common.score', undefined, 'SCORE')}
              </span>
              <span className="text-xl font-black font-mono tracking-tight text-white tabular-nums">
                {stats.score}
              </span>
            </div>
            {stats.currentStreak > 1 && (
              <div className="ml-2 px-2 py-0.5 bg-amber-500/25 border border-amber-400/30 rounded-md text-amber-300 text-xs font-bold animate-pulse">
                {stats.currentStreak}x {t('game.streak', undefined, 'STREAK')}
              </div>
            )}
          </div>

          {/* Center: Title / Theme Name */}
          <div className="hidden sm:flex flex-col items-center">
            <span className="text-sm font-black tracking-widest uppercase text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">
              {activeTheme?.branding?.gameTitle || 'RANDOM TARGET ARCADE'}
            </span>
            <span className="text-[11px] font-medium text-amber-200/90 drop-shadow">
              {activeTheme?.branding?.subtitle || 'Tap the targets before time runs out!'}
            </span>
          </div>

          {/* Right: Timer HUD & Action Controls */}
          <div className="flex items-center gap-3 pointer-events-auto">
            <div
              className={`flex items-center gap-2.5 px-4 py-2 rounded-xl border shadow-lg backdrop-blur-md transition-colors ${
                remainingSeconds <= 5
                  ? 'bg-rose-950/80 border-rose-500 text-rose-200 animate-pulse'
                  : 'bg-black/55 border-white/10 text-white'
              }`}
            >
              <Clock className={`w-5 h-5 ${remainingSeconds <= 5 ? 'text-rose-400' : 'text-amber-400'}`} />
              <div className="flex flex-col">
                <span className="text-[10px] uppercase font-bold tracking-wider text-slate-300">
                  {t('common.time', undefined, 'TIME')}
                </span>
                <span className="text-xl font-black font-mono tracking-tight tabular-nums">
                  00:{remainingSeconds.toString().padStart(2, '0')}
                </span>
              </div>
            </div>

            {/* Mute and Fullscreen Controls */}
            <div className="flex items-center gap-1.5 bg-black/55 backdrop-blur-md p-1.5 rounded-xl border border-white/10">
              <button
                type="button"
                onClick={onToggleMute}
                className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition-colors"
                title={isMuted ? 'Unmute' : 'Mute'}
              >
                {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              </button>
              {onToggleFullscreen && (
                <button
                  type="button"
                  onClick={onToggleFullscreen}
                  className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition-colors"
                  title="Fullscreen"
                >
                  {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ==================================================================== */}
        {/* PLAY ARENA (SPAWNED TARGETS) */}
        {/* ==================================================================== */}
        <div
          className="absolute inset-0 z-10 cursor-crosshair"
          onPointerDown={handleArenaPointerDown}
        >
          {activeTargets.map((target) => {
            const isHit = target.state === 'hit';
            const isExpired = target.state === 'expired';
            const isSpawning = target.state === 'spawning';

            return (
              <div
                key={target.uid}
                onPointerDown={(e) => handleTargetPointerDown(target.uid, e)}
                className={`absolute cursor-crosshair transform transition-all ${
                  isHit
                    ? 'scale-125 opacity-0 duration-300'
                    : isExpired
                    ? 'scale-75 opacity-0 duration-200'
                    : isSpawning
                    ? 'scale-90 opacity-95 duration-150 ease-out'
                    : 'scale-100 opacity-100 duration-150 hover:scale-105 active:scale-95'
                }`}
                style={{
                  left: `${target.xPercent}%`,
                  top: `${target.yPercent}%`,
                  width: `${target.size}px`,
                  height: `${target.size}px`,
                  touchAction: 'none',
                }}
              >
                {/* Visual Target Card / Circle */}
                <div
                  className={`relative w-full h-full rounded-2xl overflow-hidden shadow-2xl border-2 flex items-center justify-center p-1.5 ${
                    target.isPenalty
                      ? 'border-rose-500/80 bg-rose-950/70 shadow-rose-950/50'
                      : 'border-amber-400/90 bg-amber-950/70 shadow-amber-950/50'
                  }`}
                >
                  {/* Target Sprite Image with CSS Fallback */}
                  <img
                    src={target.imageUrl}
                    alt={target.name}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-contain pointer-events-none drop-shadow-md select-none"
                    onError={(e) => {
                      // Graceful SVG fallback icon if asset URL fails
                      (e.target as HTMLElement).style.display = 'none';
                    }}
                  />

                  {/* Fallback Graphic if Image is missing */}
                  <div className="absolute inset-0 flex flex-col items-center justify-center p-2 text-center pointer-events-none">
                    {target.isPenalty ? (
                      <AlertTriangle className="w-7 h-7 text-rose-400 mb-0.5" />
                    ) : (
                      <Sparkles className="w-7 h-7 text-amber-300 mb-0.5" />
                    )}
                    <span className="text-[10px] font-bold text-white uppercase tracking-tight leading-tight line-clamp-1">
                      {target.name}
                    </span>
                  </div>

                  {/* Penalty / Good Badge Indicator */}
                  <div
                    className={`absolute -top-2 -right-2 px-1.5 py-0.5 rounded-full text-[10px] font-black shadow-md ${
                      target.isPenalty ? 'bg-rose-600 text-white' : 'bg-amber-400 text-slate-950'
                    }`}
                  >
                    {target.score > 0 ? `+${target.score}` : `${target.score}`}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* ==================================================================== */}
        {/* PROJECTILE TRAILS & FLOATING HIT FEEDBACK */}
        {/* ==================================================================== */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none z-15">
          {projectiles.map((p) => (
            <line
              key={p.id}
              x1={p.startX}
              y1={p.startY}
              x2={p.targetX}
              y2={p.targetY}
              stroke={p.type === 'fishing-line' ? '#38bdf8' : '#fbbf24'}
              strokeWidth={p.type === 'fishing-line' ? 2 : 4}
              strokeDasharray={p.type === 'fishing-line' ? '4 2' : 'none'}
              className="animate-pulse"
              opacity={0.85}
            />
          ))}
        </svg>

        {hitFeedbacks.map((fb) => (
          <div
            key={fb.id}
            className={`absolute pointer-events-none font-black font-mono text-2xl tracking-tight z-25 transform -translate-x-1/2 -translate-y-1/2 animate-bounce drop-shadow-[0_4px_8px_rgba(0,0,0,0.9)] ${
              fb.isPenalty ? 'text-rose-400' : 'text-amber-300'
            }`}
            style={{
              left: `${fb.x}px`,
              top: `${fb.y}px`,
            }}
          >
            {fb.label}
          </div>
        ))}

        {/* ==================================================================== */}
        {/* BOTTOM-RIGHT INTERACTION TOOL (PISTOL / FISHING ROD) */}
        {/* ==================================================================== */}
        <div
          className="absolute bottom-2 right-4 z-20 pointer-events-none flex items-end justify-end"
          style={{
            width: `${resolvedConfig.interactionTool.size}px`,
            height: `${resolvedConfig.interactionTool.size}px`,
          }}
        >
          <div
            className={`relative w-full h-full transition-transform duration-100 ease-out origin-bottom-right ${
              toolRecoil ? 'scale-90' : 'scale-100'
            }`}
            style={{
              transform: `rotate(${toolAimDeg + (toolRecoil ? resolvedConfig.interactionTool.recoilAngleDeg : 0)}deg)`,
            }}
          >
            {/* Tool Sprite Image */}
            <img
              src={resolvedConfig.interactionTool.imageUrl}
              alt={resolvedConfig.interactionTool.name}
              referrerPolicy="no-referrer"
              className="w-full h-full object-contain drop-shadow-[0_8px_16px_rgba(0,0,0,0.7)] select-none"
            />

            {/* Muzzle Flash Effect */}
            {muzzleFlash && (
              <div className="absolute top-2 left-2 w-10 h-10 bg-amber-300 rounded-full blur-sm opacity-90 animate-ping" />
            )}
          </div>
        </div>

        {/* ==================================================================== */}
        {/* START SCREEN MODAL / OVERLAY */}
        {/* ==================================================================== */}
        {gameState === 'READY' && (
          resolvedConfig.screens?.start?.elements && resolvedConfig.screens.start.elements.length > 0 ? (
            <div
              className="absolute inset-0 z-30 pointer-events-auto cursor-default overflow-hidden"
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <StartScreenRenderer
                startConfig={resolvedConfig.screens.start}
                theme={activeTheme}
                gameType="random-target"
                responsive={fallbackResponsive}
                targetDimensions={{
                  width: RANDOM_TARGET_DESIGN_WIDTH,
                  height: RANDOM_TARGET_DESIGN_HEIGHT,
                  isPortrait: false,
                }}
                gameMeta={{
                  duration: resolvedConfig.gameDurationSeconds || 30,
                  gameTitle: activeTheme?.branding?.gameTitle || activeTheme?.branding?.title || 'RANDOM TARGET ARCADE',
                  gameSubtitle: activeTheme?.branding?.subtitle || 'Tap the targets before time runs out!',
                  logoUrl: activeTheme?.branding?.clientLogoUrl || null,
                }}
                onStartGame={handleStartGame}
                onShowLeaderboard={() => setShowLeaderboardModal(true)}
                isSimulation={isSimulation}
                isEventPreview={isEventPreview}
                isEventTest={isEventTest}
                leaderboardData={leaderboardData}
                loadingLeaderboard={loadingLeaderboard}
              />
            </div>
          ) : (
            <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/60 backdrop-blur-sm p-6">
              <div className="w-full max-w-md bg-slate-900/90 border border-amber-500/30 rounded-2xl p-6 shadow-2xl flex flex-col items-center text-center">
                <div className="w-16 h-16 rounded-2xl bg-amber-500/20 border border-amber-400/40 flex items-center justify-center text-amber-400 mb-4 shadow-lg">
                  <Crosshair className="w-8 h-8" />
                </div>

                <h2 className="text-2xl font-black text-white uppercase tracking-wider mb-2">
                  {activeTheme?.branding?.gameTitle || 'RANDOM TARGET ARCADE'}
                </h2>
                <p className="text-sm text-slate-300 mb-6">
                  {activeTheme?.branding?.subtitle || 'Tap the targets before time runs out!'}
                </p>

                {/* Rules Grid */}
                <div className="w-full grid grid-cols-2 gap-3 mb-6">
                  <div className="flex flex-col items-center bg-slate-800/80 border border-emerald-500/30 rounded-xl p-3">
                    <span className="text-xs font-semibold text-emerald-400 mb-1">
                      {resolvedConfig.positiveTarget.name}
                    </span>
                    <span className="text-xl font-black text-white font-mono">
                      +{resolvedConfig.positiveTarget.score}
                    </span>
                    <span className="text-[10px] text-slate-400 mt-0.5">
                      {t('game.tapToScore', undefined, 'Tap to Score')}
                    </span>
                  </div>

                  <div className="flex flex-col items-center bg-slate-800/80 border border-rose-500/30 rounded-xl p-3">
                    <span className="text-xs font-semibold text-rose-400 mb-1">
                      {resolvedConfig.negativeTarget.name}
                    </span>
                    <span className="text-xl font-black text-white font-mono">
                      {resolvedConfig.negativeTarget.score}
                    </span>
                    <span className="text-[10px] text-slate-400 mt-0.5">
                      {t('game.avoidPenalty', undefined, 'Avoid Penalty')}
                    </span>
                  </div>
                </div>

                <div className="w-full flex flex-col gap-2.5">
                  <button
                    type="button"
                    onClick={handleStartGame}
                    className="w-full py-3.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-base uppercase tracking-wider rounded-xl shadow-lg shadow-amber-500/25 transition-all flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Play className="w-5 h-5 fill-current" />
                    {t('game.startGame', undefined, 'Start Game')}
                  </button>

                  {(eventId || publicToken) && !isSimulation && (
                    <button
                      type="button"
                      onClick={() => {
                        fetchLeaderboard();
                        setShowLeaderboardModal(true);
                      }}
                      className="w-full py-2.5 bg-slate-800/80 hover:bg-slate-800 text-slate-200 font-bold text-xs uppercase tracking-wider rounded-xl border border-white/10 transition-all flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <Trophy className="w-4 h-4 text-amber-400" />
                      {t('game.viewLeaderboard', undefined, 'View Leaderboard')}
                    </button>
                  )}
                </div>
              </div>
            </div>
          )
        )}

        {/* ==================================================================== */}
        {/* RESULT SCREEN MODAL / OVERLAY */}
        {/* ==================================================================== */}
        {gameState === 'GAME_OVER' && (
          resolvedConfig.screens?.result?.elements && resolvedConfig.screens.result.elements.length > 0 ? (
            <div
              className="absolute inset-0 z-30 pointer-events-auto cursor-default flex items-center justify-center"
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <ResultScreenRenderer
                resultConfig={resolvedConfig.screens.result}
                layout={activeTheme?.layout}
                targetDimensions={{ width: RANDOM_TARGET_DESIGN_WIDTH, height: RANDOM_TARGET_DESIGN_HEIGHT }}
                stats={{
                  score: stats.score,
                  accuracyPercent: stats.accuracy,
                  timeElapsedSeconds: resolvedConfig.gameDurationSeconds,
                  isVictory: stats.score > 0,
                  gameType: 'random-target',
                }}
                theme={activeTheme}
                leaderboardData={leaderboardData}
                loadingLeaderboard={loadingLeaderboard}
                isEventPreview={isEventPreview}
                isEventTest={isEventTest}
                playerName={playerName}
                onPlayerNameChange={setPlayerName}
                onSubmitScore={handleSubmitScore}
                isSubmittingScore={isSubmittingScore}
                scoreSubmitted={scoreSubmitted}
                playerRank={playerRank}
                submitError={submitError}
                eventId={eventId || publicToken}
                onAction={(action) => {
                  if (action === 'playAgain') {
                    handleStartGame();
                  } else if (action === 'exit') {
                    setGameState('READY');
                  } else if (action === 'leaderboard') {
                    fetchLeaderboard();
                    setShowLeaderboardModal(true);
                  }
                }}
              />
            </div>
          ) : (
            <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/75 backdrop-blur-md p-4">
              <div className="w-full max-w-md bg-slate-900/95 border border-amber-500/40 rounded-2xl p-5 shadow-2xl flex flex-col items-center text-center">
                <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-400/40 flex items-center justify-center text-amber-400 mb-2 shadow-lg">
                  <Trophy className="w-6 h-6" />
                </div>

                <h2 className="text-xl font-black text-white uppercase tracking-wider mb-0.5">
                  {t('game.roundComplete', undefined, 'Round Complete!')}
                </h2>
                <span className="text-xs text-slate-400 mb-3">
                  {isEventTest ? `[${t('game.testMode', undefined, 'TEST MODE')}]` : activeTheme?.name}
                </span>

                {/* Final Score Banner */}
                <div className="w-full bg-slate-800/90 border border-white/10 rounded-xl py-2.5 px-4 mb-3 flex flex-col items-center">
                  <span className="text-[11px] uppercase font-bold text-slate-400 tracking-wider">
                    {t('common.finalScore', undefined, 'FINAL SCORE')}
                  </span>
                  <span className="text-3xl font-black font-mono text-amber-400 tracking-tight my-0.5 tabular-nums">
                    {stats.score}
                  </span>
                </div>

                {/* Stats Breakdown */}
                <div className="w-full grid grid-cols-3 gap-2 mb-3">
                  <div className="bg-slate-800/50 rounded-lg p-2 flex flex-col items-center">
                    <span className="text-[10px] text-slate-400 font-medium">
                      {t('game.hits', undefined, 'Hits')}
                    </span>
                    <span className="text-sm font-bold text-emerald-400 font-mono">
                      {stats.positiveHits}
                    </span>
                  </div>
                  <div className="bg-slate-800/50 rounded-lg p-2 flex flex-col items-center">
                    <span className="text-[10px] text-slate-400 font-medium">
                      {t('game.penalties', undefined, 'Penalties')}
                    </span>
                    <span className="text-sm font-bold text-rose-400 font-mono">
                      {stats.negativeHits}
                    </span>
                  </div>
                  <div className="bg-slate-800/50 rounded-lg p-2 flex flex-col items-center">
                    <span className="text-[10px] text-slate-400 font-medium">
                      {t('game.accuracy', undefined, 'Accuracy')}
                    </span>
                    <span className="text-sm font-bold text-amber-400 font-mono">
                      {stats.accuracy}%
                    </span>
                  </div>
                </div>

                {/* Player Name & Leaderboard Submission Form */}
                {(eventId || publicToken) && !isSimulation && !(isEventPreview && !isEventTest) && (
                  <div className="w-full mb-3">
                    {!scoreSubmitted ? (
                      <form onSubmit={handleSubmitScore} className="w-full flex flex-col gap-2">
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={playerName}
                            onChange={(e) => {
                              setPlayerName(e.target.value);
                              if (submitError) setSubmitError(null);
                            }}
                            placeholder={t('game.enterYourName', undefined, 'Enter your name')}
                            maxLength={25}
                            disabled={isSubmittingScore}
                            className="flex-1 bg-slate-950/90 border border-slate-700 focus:border-amber-400 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none transition-colors"
                          />
                          <button
                            type="submit"
                            disabled={isSubmittingScore || !playerName.trim()}
                            className="px-4 py-2.5 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed text-slate-950 font-black text-xs uppercase tracking-wider rounded-xl transition-all cursor-pointer shrink-0"
                          >
                            {isSubmittingScore
                              ? t('common.saving', undefined, 'Saving...')
                              : t('game.submitScore', undefined, 'Submit Score')}
                          </button>
                        </div>
                        {submitError && (
                          <p className="text-xs text-rose-400 font-medium text-left px-1">
                            {submitError}
                          </p>
                        )}
                      </form>
                    ) : (
                      <div className="w-full bg-emerald-500/15 border border-emerald-500/40 rounded-xl py-2 px-3 flex items-center justify-between text-emerald-300 text-xs font-bold">
                        <span>
                          ✓ {t('game.scoreSubmitted', undefined, 'Score Submitted')} ({playerName.trim()})
                        </span>
                        {playerRank !== null && (
                          <span className="px-2 py-0.5 bg-amber-400 text-slate-950 rounded-md font-black">
                            Rank #{playerRank}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                )}

                <div className="w-full flex gap-2">
                  {(eventId || publicToken) && !isSimulation && (
                    <button
                      type="button"
                      onClick={() => {
                        fetchLeaderboard();
                        setShowLeaderboardModal(true);
                      }}
                      className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs uppercase tracking-wider rounded-xl border border-white/10 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Trophy className="w-4 h-4 text-amber-400" />
                      {t('game.leaderboard', undefined, 'Leaderboard')}
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={handleStartGame}
                    className="flex-1 py-3 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-sm uppercase tracking-wider rounded-xl shadow-lg shadow-amber-500/25 transition-all flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <RotateCcw className="w-4 h-4" />
                    {t('game.playAgain', undefined, 'Play Again')}
                  </button>
                </div>
              </div>
            </div>
          )
        )}

        {/* High Scores Leaderboard Modal */}
        {showLeaderboardModal && (
          <div
            className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 cursor-default"
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-5 text-slate-100 flex flex-col max-h-[85vh] shadow-2xl">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <Trophy className="w-5 h-5 text-amber-400" />
                  <h3 className="font-bold text-base">{t('game.leaderboard', undefined, 'Leaderboard')}</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowLeaderboardModal(false)}
                  className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-200"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto py-3 space-y-1.5 min-h-[160px]">
                {loadingLeaderboard ? (
                  <div className="py-8 text-slate-400 text-xs flex flex-col items-center gap-2">
                    <div className="w-5 h-5 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
                    <span>{t('game.loadingLeaderboard', undefined, 'Loading leaderboard...')}</span>
                  </div>
                ) : leaderboardData.length === 0 ? (
                  <div className="py-8 text-center text-slate-400 text-xs">
                    {t('game.noScoresYet', undefined, 'No scores recorded yet. Be the first!')}
                  </div>
                ) : (
                  leaderboardData.map((entry, idx) => (
                    <div
                      key={entry.id || idx}
                      className="flex items-center justify-between px-3 py-2 bg-slate-800/60 rounded-xl border border-white/5"
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="font-mono font-bold text-xs text-amber-400 w-5">#{idx + 1}</span>
                        <span className="text-sm font-semibold text-white">{entry.player_name || 'Anonymous'}</span>
                      </div>
                      <span className="font-mono font-black text-amber-400 text-sm tabular-nums">{entry.score}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
