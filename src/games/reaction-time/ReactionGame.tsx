import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Volume2,
  VolumeX,
  Maximize2,
  Minimize2,
  RotateCcw,
  Zap,
  Award,
  Trophy,
  AlertTriangle,
  Play,
  CheckCircle2,
  Clock,
  Sparkles,
  ChevronRight,
  X,
} from 'lucide-react';
import { GameComponentProps } from '../types';
import {
  ReactionGameConfig,
  ReactionGameState,
  ReactionRoundResult,
  DEFAULT_REACTION_CONFIG,
  getReactionRating,
} from './types';
import { reactionSounds } from './reactionSounds';
import { ResultScreenRenderer } from '../shared/ResultScreenRenderer';
import { StartScreenRenderer } from '../shared/StartScreenRenderer';
import { useResponsiveLayout } from '../../themes/responsive';
import { EventLeaderboardEntry } from '../../types';
import { apiFetch } from '../../lib/api';

export interface ReactionGameProps extends GameComponentProps<ReactionGameConfig> {
  isSimulation?: boolean;
  isInteractive?: boolean;
  className?: string;
}

export const ReactionGame: React.FC<ReactionGameProps> = ({
  activeTheme,
  settings,
  config,
  eventId,
  publicToken,
  isEventPreview = false,
  isEventTest = false,
  overrideOrientation,
  isSimulation = false,
  isInteractive = true,
  isMuted = false,
  isFullscreen = false,
  className = '',
  onToggleFullscreen,
  onToggleMute,
  onGameStateChange,
  onStatsChange,
}) => {
  // Merge authoritative config with defaults
  const reactionConfig: ReactionGameConfig = useMemo(() => {
    const rawConfig = (activeTheme?.game_config as ReactionGameConfig) || config;
    return {
      ...DEFAULT_REACTION_CONFIG,
      ...rawConfig,
      roundsCount: Math.max(1, Math.min(10, rawConfig?.roundsCount ?? DEFAULT_REACTION_CONFIG.roundsCount)),
      lightCount: Math.max(3, Math.min(5, rawConfig?.lightCount ?? DEFAULT_REACTION_CONFIG.lightCount)),
    };
  }, [activeTheme, config]);

  // Sync mute state to sound manager
  useEffect(() => {
    reactionSounds.setMuted(isMuted || !reactionConfig.soundEnabled);
    if (reactionConfig.soundVolume !== undefined) {
      reactionSounds.setVolume(reactionConfig.soundVolume);
    }
  }, [isMuted, reactionConfig.soundEnabled, reactionConfig.soundVolume]);

  // Game state
  const [gameState, setGameState] = useState<ReactionGameState>('IDLE');
  const [currentRound, setCurrentRound] = useState<number>(1);
  const [activeLightsCount, setActiveLightsCount] = useState<number>(0);
  const [roundResults, setRoundResults] = useState<ReactionRoundResult[]>([]);
  const [lastReactionTime, setLastReactionTime] = useState<number | null>(null);
  const [falseStartMessage, setFalseStartMessage] = useState<string>('');
  const [sessionId, setSessionId] = useState<string>(
    () => `rt_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
  );

  // Leaderboard & Result Screen state
  const [playerName, setPlayerName] = useState<string>(() => {
    try {
      return localStorage.getItem('event_player_name') || 'Racer';
    } catch {
      return 'Racer';
    }
  });
  const [scoreSubmitted, setScoreSubmitted] = useState<boolean>(false);
  const [submittedRank, setSubmittedRank] = useState<number | null>(null);
  const [isSubmittingScore, setIsSubmittingScore] = useState<boolean>(false);
  const [leaderboardScores, setLeaderboardScores] = useState<EventLeaderboardEntry[]>([]);
  const [loadingLeaderboard, setLoadingLeaderboard] = useState<boolean>(false);
  const [showLeaderboardModal, setShowLeaderboardModal] = useState<boolean>(false);

  // Ref trackers for microsecond accuracy and event handler stabilization
  const gameStateRef = useRef<ReactionGameState>(gameState);
  gameStateRef.current = gameState;

  const currentRoundRef = useRef<number>(currentRound);
  currentRoundRef.current = currentRound;

  const roundResultsRef = useRef<ReactionRoundResult[]>(roundResults);
  roundResultsRef.current = roundResults;

  const goTimestampRef = useRef<number>(0);
  const lastTriggerTimeRef = useRef<number>(0);
  const sequenceTimersRef = useRef<NodeJS.Timeout[]>([]);
  const randomDelayTimerRef = useRef<NodeJS.Timeout | null>(null);
  const roundAdvanceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const orientationPreference = activeTheme?.layout?.orientation || 'auto';
  const responsive = useResponsiveLayout(containerRef, orientationPreference, overrideOrientation);

  // Fetch leaderboard data
  const fetchLeaderboard = useCallback(async () => {
    if (!eventId && !publicToken) return;
    setLoadingLeaderboard(true);
    try {
      const isOrganizerTest = Boolean(isEventTest || isEventPreview);
      const url = (!isOrganizerTest && publicToken)
        ? `/api/public/events/${publicToken}/high-scores?limit=50`
        : `/api/events/${eventId}/admin/high-scores?limit=50`;
      const res = await apiFetch(url);
      if (res.ok) {
        const data = await res.json();
        setLeaderboardScores(data.scores || []);
      }
    } catch (err) {
      console.warn('Failed to load leaderboard scores:', err);
    } finally {
      setLoadingLeaderboard(false);
    }
  }, [eventId, publicToken]);

  useEffect(() => {
    fetchLeaderboard();
  }, [fetchLeaderboard]);

  // Clear all pending timeouts
  const clearAllTimers = useCallback(() => {
    sequenceTimersRef.current.forEach((t) => clearTimeout(t));
    sequenceTimersRef.current = [];
    if (randomDelayTimerRef.current) {
      clearTimeout(randomDelayTimerRef.current);
      randomDelayTimerRef.current = null;
    }
    if (roundAdvanceTimerRef.current) {
      clearTimeout(roundAdvanceTimerRef.current);
      roundAdvanceTimerRef.current = null;
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearAllTimers();
    };
  }, [clearAllTimers]);

  // Inform parent of state changes
  useEffect(() => {
    if (onGameStateChange) {
      if (gameState === 'FINAL_RESULT') {
        onGameStateChange('GAME_OVER' as any);
      } else if (gameState === 'IDLE') {
        onGameStateChange('IDLE' as any);
      } else {
        onGameStateChange('PLAYING' as any);
      }
    }
  }, [gameState, onGameStateChange]);

  // Calculate statistics
  const stats = useMemo(() => {
    const validRounds = roundResults.filter((r) => !r.falseStart && r.reactionTimeMs > 0);
    if (validRounds.length === 0) {
      return {
        averageMs: 0,
        bestMs: 0,
        worstMs: 0,
        completedRounds: roundResults.length,
        rating: getReactionRating(999),
      };
    }
    const times = validRounds.map((r) => r.reactionTimeMs);
    const sum = times.reduce((a, b) => a + b, 0);
    const avg = Math.round(sum / times.length);
    const best = Math.min(...times);
    const worst = Math.max(...times);
    return {
      averageMs: avg,
      bestMs: best,
      worstMs: worst,
      completedRounds: roundResults.length,
      rating: getReactionRating(avg),
    };
  }, [roundResults]);

  // Update parent stats
  useEffect(() => {
    if (onStatsChange) {
      onStatsChange({
        score: stats.averageMs,
        lives: 0,
        accuracy: stats.averageMs > 0 ? Math.max(0, Math.min(100, Math.round(10000 / stats.averageMs))) : 0,
        itemsCaught: roundResults.length,
        itemsSpawned: reactionConfig.roundsCount,
      });
    }
  }, [stats, onStatsChange, reactionConfig.roundsCount, roundResults.length]);

  // Start the light sequence for a round
  const startRoundSequence = useCallback(() => {
    clearAllTimers();
    setGameState('LIGHT_SEQUENCE');
    setActiveLightsCount(0);
    setLastReactionTime(null);
    setFalseStartMessage('');

    const lightCount = reactionConfig.lightCount;
    const intervalMs = reactionConfig.sequenceIntervalMs || 1000;

    // Schedule each light turning on
    for (let i = 1; i <= lightCount; i++) {
      const timer = setTimeout(() => {
        if (gameStateRef.current !== 'LIGHT_SEQUENCE') return;
        setActiveLightsCount(i);
        reactionSounds.playLightTick(i - 1);

        // When the final light illuminates, transition to RANDOM_WAIT
        if (i === lightCount) {
          setGameState('RANDOM_WAIT');
          const minDelay = reactionConfig.minRandomDelayMs || 1200;
          const maxDelay = reactionConfig.maxRandomDelayMs || 3500;
          const randomWait = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;

          randomDelayTimerRef.current = setTimeout(() => {
            if (gameStateRef.current !== 'RANDOM_WAIT') return;

            // SIGNAL GO!
            goTimestampRef.current = performance.now();
            setGameState('GO');
            if (reactionConfig.lightGoBehavior === 'all-off') {
              setActiveLightsCount(0);
            }
            reactionSounds.playGoChime();
          }, randomWait);
        }
      }, i * intervalMs);

      sequenceTimersRef.current.push(timer);
    }
  }, [reactionConfig, clearAllTimers]);

  // Begin a full new game
  const startNewGame = useCallback(() => {
    reactionSounds.playClick();
    clearAllTimers();
    setCurrentRound(1);
    setRoundResults([]);
    setLastReactionTime(null);
    setScoreSubmitted(false);
    setSubmittedRank(null);
    setSessionId(`rt_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`);
    startRoundSequence();
  }, [clearAllTimers, startRoundSequence]);

  // Advance to next round or finish game
  const advanceAfterRound = useCallback(
    (newResults: ReactionRoundResult[]) => {
      if (currentRoundRef.current >= reactionConfig.roundsCount) {
        // FINISH ALL ROUNDS
        clearAllTimers();
        setGameState('FINAL_RESULT');
        reactionSounds.playCelebration();
      } else {
        // Move to next round after brief display
        roundAdvanceTimerRef.current = setTimeout(() => {
          setCurrentRound((prev) => prev + 1);
          startRoundSequence();
        }, 1200);
      }
    },
    [reactionConfig.roundsCount, clearAllTimers, startRoundSequence]
  );

  // Handle player reaction action (tap, click, Space bar)
  const handleUserTrigger = useCallback(
    (event?: React.SyntheticEvent | KeyboardEvent | TouchEvent | MouseEvent) => {
      const currentState = gameStateRef.current;
      if (currentState === 'FINAL_RESULT') return;

      const nowPerf = performance.now();
      if (nowPerf - lastTriggerTimeRef.current < 60) {
        return; // Deduplicate pointer / touch / click synthetic echoes
      }
      lastTriggerTimeRef.current = nowPerf;

      // 1. In IDLE state, the game must ONLY start via the Start Screen's START REACTION TEST button
      // (Requirement: Do NOT use the parent game's generic onClick={handleUserTrigger} as a workaround)
      if (currentState === 'IDLE') {
        return;
      }
      if (currentState === 'READY') {
        startNewGame();
        return;
      }

      // 2. If clicked during LIGHT_SEQUENCE or RANDOM_WAIT -> FALSE START!
      if (currentState === 'LIGHT_SEQUENCE' || currentState === 'RANDOM_WAIT') {
        clearAllTimers();
        reactionSounds.playFalseStart();
        setGameState('FALSE_START');
        setFalseStartMessage(reactionConfig.falseStartText || 'JUMP START!');

        const falseStartResult: ReactionRoundResult = {
          round: currentRoundRef.current,
          reactionTimeMs: reactionConfig.falseStartRule === 'penalty_1000ms' ? 1000 : 0,
          falseStart: true,
          timestamp: Date.now(),
        };

        if (reactionConfig.falseStartRule === 'retry') {
          // Retry current round after brief notice
          roundAdvanceTimerRef.current = setTimeout(() => {
            startRoundSequence();
          }, 1500);
        } else {
          // Record penalty or advance
          const updated = [...roundResultsRef.current, falseStartResult];
          setRoundResults(updated);
          advanceAfterRound(updated);
        }
        return;
      }

      // 3. If in GO state -> VALID REACTION!
      if (currentState === 'GO') {
        const now = performance.now();
        const triggerTime =
          event &&
          typeof (event as any).timeStamp === 'number' &&
          (event as any).timeStamp > goTimestampRef.current &&
          (event as any).timeStamp - goTimestampRef.current < 30000
            ? (event as any).timeStamp
            : now;
        const reactionMs = Math.max(1, Math.round(triggerTime - goTimestampRef.current));

        reactionSounds.playRoundSuccess();
        setLastReactionTime(reactionMs);
        setGameState('ROUND_RESULT');

        const newRoundResult: ReactionRoundResult = {
          round: currentRoundRef.current,
          reactionTimeMs: reactionMs,
          falseStart: false,
          timestamp: Date.now(),
        };

        const updated = [...roundResultsRef.current, newRoundResult];
        setRoundResults(updated);
        advanceAfterRound(updated);
        return;
      }

      // 4. If in ROUND_RESULT and user taps to skip delay: advance immediately
      if (currentState === 'ROUND_RESULT') {
        if (roundAdvanceTimerRef.current) {
          clearTimeout(roundAdvanceTimerRef.current);
          roundAdvanceTimerRef.current = null;
        }
        if (currentRoundRef.current >= reactionConfig.roundsCount) {
          setGameState('FINAL_RESULT');
          reactionSounds.playCelebration();
        } else {
          setCurrentRound((prev) => prev + 1);
          startRoundSequence();
        }
        return;
      }
    },
    [
      startNewGame,
      clearAllTimers,
      reactionConfig.falseStartText,
      reactionConfig.falseStartRule,
      reactionConfig.roundsCount,
      startRoundSequence,
      advanceAfterRound,
    ]
  );

  // Keyboard controls (Space bar or Enter key)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault();
        handleUserTrigger();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleUserTrigger]);

  // Score submission for leaderboard
  const handleSubmitScore = async (playerNameInput?: string | React.FormEvent) => {
    if (playerNameInput && typeof playerNameInput === 'object' && 'preventDefault' in playerNameInput) {
      playerNameInput.preventDefault();
    }
    if (isEventPreview && !isEventTest) {
      return { success: false, error: 'Preview test scores are not submitted to the leaderboard.' };
    }
    if (isSubmittingScore || scoreSubmitted) return;

    const rawName = typeof playerNameInput === 'string' ? playerNameInput : playerName;
    const trimmedName = rawName.trim() || 'Racer';
    setPlayerName(trimmedName);
    try {
      localStorage.setItem('event_player_name', trimmedName);
    } catch {}
    setIsSubmittingScore(true);

    const scoreVal = stats.averageMs > 0 ? stats.averageMs : 250;

    const isOrganizerTest = Boolean(isEventTest || isEventPreview);
    const metadataPayload = {
      gameType: 'reaction-tap',
      averageReactionTimeMs: scoreVal,
      bestReactionTimeMs: stats.bestMs,
      worstReactionTimeMs: stats.worstMs,
      rounds: roundResults,
      roundsCount: reactionConfig.roundsCount,
      rating: stats.rating.tier,
      sessionId,
      isEventTest: isOrganizerTest ? true : undefined,
      score_environment: isOrganizerTest ? 'test' : undefined,
      is_test: isOrganizerTest ? true : undefined,
    };

    try {
      if (publicToken || (eventId && eventId !== 'undefined' && eventId !== 'null')) {
        const url = (!isOrganizerTest && publicToken)
          ? `/api/public/events/${publicToken}/high-scores`
          : `/api/events/${eventId}/admin/high-scores`;
        const res = await apiFetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            player_name: trimmedName,
            score: scoreVal,
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

      // Local fallback simulation
      const localEntry: EventLeaderboardEntry = {
        id: 'local_' + Date.now(),
        event_id: eventId || 'local',
        player_name: trimmedName,
        score: scoreVal,
        metadata: metadataPayload,
        created_at: new Date().toISOString(),
        rank: 1,
      };

      setScoreSubmitted(true);
      setSubmittedRank(1);
      setLeaderboardScores((prev) => {
        const next = [...prev, localEntry];
        return next.sort((a, b) => a.score - b.score);
      });
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
    const bgUrl = activeTheme?.background_url || activeTheme?.background;
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

  // Light shapes and colors
  const lightShapeClasses =
    reactionConfig.lightShape === 'rounded'
      ? 'rounded-2xl'
      : reactionConfig.lightShape === 'pill'
      ? 'rounded-full h-16 w-10 sm:h-24 sm:w-14'
      : 'rounded-full';

  return (
    <div
      ref={containerRef}
      onClick={handleUserTrigger}
      onTouchStart={(e) => {
        // Prevent accidental double-tap zoom delay
        if (e.cancelable && e.touches.length === 1) {
          handleUserTrigger();
        }
      }}
      className="relative w-full h-full select-none overflow-hidden flex flex-col justify-between items-center cursor-pointer font-sans"
      style={{
        ...bgStyle,
        touchAction: 'manipulation',
        '--game-ui-scale': responsive.uiScale,
        '--game-design-width': `${responsive.designWidth}px`,
        '--game-design-height': `${responsive.designHeight}px`,
      } as React.CSSProperties}
    >
      {/* Dynamic Background Ambiance Glow */}
      <div
        className={`absolute inset-0 pointer-events-none transition-opacity duration-300 ${
          gameState === 'GO'
            ? 'bg-emerald-500/20 opacity-100'
            : gameState === 'FALSE_START'
            ? 'bg-rose-500/30 opacity-100'
            : 'opacity-0'
        }`}
      />

      {/* Top Header / Status Bar */}
      <div
        className="w-full px-4 sm:px-6 pt-3 sm:pt-4 flex items-center justify-between z-20 shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Left: Branding & Round Counter */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-slate-900/80 backdrop-blur-md border border-slate-800 px-3 py-1.5 rounded-xl shadow-lg">
            <Zap className="w-4 h-4 text-amber-400 fill-amber-400" />
            <span className="font-mono font-bold text-xs sm:text-sm tracking-wider text-slate-200 uppercase">
              {activeTheme?.branding?.gameTitle || 'REFLEX SPEED'}
            </span>
          </div>

          <div className="flex items-center gap-1.5 bg-slate-900/80 backdrop-blur-md border border-slate-800 px-3 py-1.5 rounded-xl text-xs font-mono">
            <span className="text-slate-400 font-bold">ROUND</span>
            <span className="text-amber-400 font-black">
              {currentRound}/{reactionConfig.roundsCount}
            </span>
          </div>
        </div>

        {/* Right: Controls & Best Time Chip */}
        <div className="flex items-center gap-2">
          {stats.bestMs > 0 && (
            <div className="hidden sm:flex items-center gap-1.5 bg-emerald-950/70 border border-emerald-500/40 px-3 py-1.5 rounded-xl font-mono text-xs text-emerald-400">
              <Trophy className="w-3.5 h-3.5 text-emerald-400" />
              <span>BEST:</span>
              <span className="font-bold">{stats.bestMs}ms</span>
            </div>
          )}

          {onToggleMute && (
            <button
              onClick={onToggleMute}
              className="p-2 bg-slate-900/80 hover:bg-slate-800 text-slate-300 hover:text-white rounded-xl border border-slate-800 transition-colors"
              title={isMuted ? 'Unmute' : 'Mute'}
            >
              {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>
          )}

          {onToggleFullscreen && (
            <button
              onClick={onToggleFullscreen}
              className="p-2 bg-slate-900/80 hover:bg-slate-800 text-slate-300 hover:text-white rounded-xl border border-slate-800 transition-colors"
              title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
          )}
        </div>
      </div>

      {/* Main Center Stage: Formula 1 Start Lights Gantry & Action Indicators */}
      <div className="flex-1 w-full max-w-3xl flex flex-col items-center justify-center px-4 z-10">
        {/* The Light Gantry Housing */}
        <div className="relative bg-gradient-to-b from-slate-900 via-slate-950 to-black border-2 sm:border-4 border-slate-800 rounded-3xl p-4 sm:p-7 shadow-[0_20px_50px_rgba(0,0,0,0.8)] flex flex-col items-center gap-4 sm:gap-6 w-full max-w-2xl">
          {/* Top Carbon Fiber Mount Detailing */}
          <div className="flex items-center justify-between w-full px-2 border-b border-slate-800/80 pb-2.5">
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-slate-700" />
              <div className="w-2.5 h-2.5 rounded-full bg-slate-700" />
              <div className="w-2.5 h-2.5 rounded-full bg-slate-700" />
            </div>
            <div className="text-[10px] font-mono tracking-widest text-slate-500 uppercase font-black">
              FIA START SYSTEM // LIGHTS
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-slate-700" />
              <div className="w-2.5 h-2.5 rounded-full bg-slate-700" />
              <div className="w-2.5 h-2.5 rounded-full bg-slate-700" />
            </div>
          </div>

          {/* Lights Array */}
          <div className="flex items-center justify-center gap-3 sm:gap-6 w-full py-2 sm:py-4">
            {Array.from({ length: reactionConfig.lightCount }).map((_, idx) => {
              const isLightActive =
                gameState === 'GO'
                  ? reactionConfig.lightGoBehavior === 'all-green'
                  : idx < activeLightsCount;

              const activeColor =
                gameState === 'GO' && reactionConfig.lightGoBehavior === 'all-green'
                  ? reactionConfig.lightGoColor || '#22c55e'
                  : reactionConfig.lightActiveColor || '#ef4444';

              const offColor = reactionConfig.lightOffColor || '#1e293b';

              return (
                <div
                  key={idx}
                  className="flex flex-col items-center gap-2 relative group"
                >
                  {/* Visor / Light Hood */}
                  <div className="w-12 sm:w-20 h-2 sm:h-3.5 bg-slate-800 rounded-t-lg -mb-1 shadow-md border-t border-slate-700" />

                  {/* Bulb Enclosure */}
                  <div
                    className={`w-12 h-12 sm:w-20 sm:h-20 ${lightShapeClasses} flex items-center justify-center p-1.5 border-2 sm:border-4 transition-all duration-100 ${
                      isLightActive
                        ? 'border-white/50'
                        : 'border-slate-800 shadow-inner'
                    }`}
                    style={{
                      backgroundColor: isLightActive ? activeColor : offColor,
                      boxShadow: isLightActive
                        ? `0 0 40px ${activeColor}, 0 0 80px ${activeColor}80, inset 0 0 15px rgba(255,255,255,0.8)`
                        : 'inset 0 4px 8px rgba(0,0,0,0.8)',
                    }}
                  >
                    {/* Inner Lens Reflection */}
                    <div
                      className={`w-full h-full ${lightShapeClasses} transition-opacity duration-100 ${
                        isLightActive
                          ? 'bg-gradient-to-tr from-transparent via-white/30 to-white/70 opacity-100'
                          : 'bg-slate-900/60 opacity-40'
                      }`}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Gantry Subtitle / Status Text */}
          <div className="w-full text-center">
            {gameState === 'IDLE' && (
              <div className="flex flex-col items-center gap-2">
                <span className="text-sm sm:text-base font-bold text-amber-400 tracking-wider uppercase font-mono animate-pulse">
                  {reactionConfig.readyTitle || 'TAP ANYWHERE OR PRESS SPACE TO START'}
                </span>
                <span className="text-xs text-slate-400 max-w-md">
                  {reactionConfig.readyInstructions ||
                    'When all red lights extinguish, click, tap, or press SPACE as fast as you can!'}
                </span>
              </div>
            )}

            {gameState === 'LIGHT_SEQUENCE' && (
              <span className="text-sm sm:text-base font-black text-rose-400 tracking-widest uppercase font-mono">
                GET READY...
              </span>
            )}

            {gameState === 'RANDOM_WAIT' && (
              <span className="text-sm sm:text-base font-black text-amber-400 tracking-widest uppercase font-mono animate-pulse">
                WAIT FOR LIGHTS OUT...
              </span>
            )}

            {gameState === 'GO' && (
              <span className="text-2xl sm:text-4xl font-black text-emerald-400 tracking-widest uppercase font-mono animate-bounce">
                {reactionConfig.goText || 'GO!'}
              </span>
            )}

            {gameState === 'FALSE_START' && (
              <div className="flex flex-col items-center gap-1">
                <div className="flex items-center gap-2 text-rose-400">
                  <AlertTriangle className="w-5 h-5 text-rose-500 animate-bounce" />
                  <span className="text-lg sm:text-2xl font-black tracking-wider uppercase font-mono">
                    {falseStartMessage}
                  </span>
                </div>
                <span className="text-xs text-rose-300/80 font-mono">
                  {reactionConfig.falseStartRule === 'retry'
                    ? 'Restarting round...'
                    : '+1000ms Penalty Added'}
                </span>
              </div>
            )}

            {gameState === 'ROUND_RESULT' && lastReactionTime !== null && (
              <div className="flex flex-col items-center gap-1 animate-in zoom-in-95 duration-150">
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl sm:text-5xl font-black font-mono text-emerald-400">
                    {lastReactionTime}
                  </span>
                  <span className="text-lg font-mono font-bold text-emerald-500">ms</span>
                </div>
                <span className="text-xs font-mono text-slate-400">
                  {getReactionRating(lastReactionTime).tier} — Tap to continue
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Round Progress Tracker Chips */}
        <div className="flex items-center justify-center gap-2 mt-6 flex-wrap">
          {Array.from({ length: reactionConfig.roundsCount }).map((_, idx) => {
            const roundNumber = idx + 1;
            const res = roundResults.find((r) => r.round === roundNumber);
            const isCurrent = currentRound === roundNumber && gameState !== 'FINAL_RESULT';

            return (
              <div
                key={idx}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl border text-xs font-mono transition-all ${
                  res
                    ? res.falseStart
                      ? 'bg-rose-500/20 border-rose-500/50 text-rose-400'
                      : 'bg-slate-900 border-emerald-500/50 text-emerald-300'
                    : isCurrent
                    ? 'bg-amber-400/10 border-amber-400 text-amber-300 ring-2 ring-amber-400/30'
                    : 'bg-slate-950/60 border-slate-800 text-slate-600'
                }`}
              >
                <span className="font-bold">R{roundNumber}:</span>
                <span>{res ? (res.falseStart ? 'JUMP' : `${res.reactionTimeMs}ms`) : '—'}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Bottom Footer Hint */}
      <div className="w-full px-4 pb-4 flex items-center justify-center text-slate-500 text-xs font-mono z-10">
        <span>Click, tap, or press [SPACE] to react</span>
      </div>

      {/* Start Screen Overlay */}
      {gameState === 'IDLE' && (
        <div
          className="absolute inset-0 z-40 pointer-events-auto cursor-default overflow-hidden"
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
        >
          <StartScreenRenderer
            startConfig={reactionConfig.screens?.start}
            theme={activeTheme}
            gameType="reaction-tap"
            responsive={responsive}
            targetDimensions={{
              width: responsive.designWidth,
              height: responsive.designHeight,
              isPortrait: responsive.isPortrait,
            }}
            gameMeta={{
              duration: reactionConfig.roundsCount,
              gameTitle: activeTheme?.branding?.title || activeTheme?.title || 'Reaction Tap',
              gameSubtitle: activeTheme?.branding?.subtitle || activeTheme?.subtitle || 'Test your lightning reflexes with Formula 1 starting lights!',
              logoUrl: activeTheme?.branding?.clientLogoUrl || activeTheme?.clientLogo || activeTheme?.logo || null,
            }}
            onStartGame={startRoundSequence}
            onShowLeaderboard={() => setShowLeaderboardModal(true)}
            isSimulation={isSimulation && !isInteractive}
            isEventPreview={isEventPreview}
            isEventTest={isEventTest}
          />
        </div>
      )}

      {/* Final Victory / Leaderboard Completion Screen */}
      {gameState === 'FINAL_RESULT' && (
        <div
          className="absolute inset-0 z-50 pointer-events-auto cursor-default"
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
        >
          <ResultScreenRenderer
            resultConfig={reactionConfig.screens?.result}
            targetDimensions={{ width: responsive.designWidth, height: responsive.designHeight }}
            isPortrait={responsive.isPortrait}
            stats={{
              score: stats.averageMs,
              averageReactionTimeMs: stats.averageMs,
              bestReactionTimeMs: stats.bestMs,
              worstReactionTimeMs: stats.worstMs,
              rating: stats.rating.tier,
              rounds: roundResults,
              timeElapsedSeconds: Math.round(reactionConfig.roundsCount * 3),
              isVictory: true,
              gameType: 'reaction-time',
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
                startNewGame();
              } else if (action === 'exit') {
                setGameState('IDLE');
              }
            }}
          />
        </div>
      )}

      {/* High Scores Leaderboard Modal */}
      {showLeaderboardModal && (
        <div
          className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 cursor-default"
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
        >
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
                <X className="w-4 h-4" />
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
                    <span className="font-bold text-amber-400">{entry.score} ms</span>
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
  );
};
