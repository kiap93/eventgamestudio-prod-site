import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
  Volume2,
  VolumeX,
  Pause,
  Play,
  RotateCcw,
  HelpCircle,
  Trophy,
  Sparkles,
  Sliders,
  Square,
  Home,
  Settings,
  Timer,
  Zap,
  Megaphone,
  Medal,
  Crown,
  Award,
  User,
  Send,
  CheckCircle2,
  ListOrdered,
  X,
  Clock,
} from 'lucide-react';
import { GameState, GameStats, GameSettings, EventLeaderboardEntry } from '../types';
import { GAME_DURATION_SECONDS } from '../game/config';
import { GameTheme } from '../themes';
import { normalizeGameLayout, GameLayoutConfig } from '../themes/layout';
import { useResponsiveLayout, getEffectiveGameLayout, ResponsiveLayoutState } from '../themes/responsive';
import { apiFetch } from '../lib/api';
import { StartScreenRenderer } from '../games/shared/StartScreenRenderer';
import { ResultScreenRenderer } from '../games/shared/ResultScreenRenderer';
import { resolveScreenBackground } from '../themes/screenBackground';
import { getStartScreenConfig } from '../games/shared/startScreenResolver';
import { GameControlBar } from './studio/GameControlBar';
import { useLocalization } from '../context/LocalizationContext';

interface ArcadeUIProps {
  gameState: GameState;
  stats: GameStats;
  countdownText: string | number;
  eventId?: string;
  publicToken?: string;
  isEventPreview?: boolean;
  isEventTest?: boolean;
  isMuted: boolean;
  onToggleMute: () => void;
  cameraActive: boolean;
  onToggleCamera: () => void;
  onStartGame: () => void;
  onPauseGame: () => void;
  onResumeGame: () => void;
  onRestartGame: () => void;
  onStopGame: () => void;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
  settings: GameSettings;
  onUpdateSettings: (newSettings: GameSettings) => void;
  onResetSettings: () => void;
  activeTheme: GameTheme;
  onSelectTheme?: (themeId: string) => void;
  responsive?: ResponsiveLayoutState;
}

export const ArcadeUI: React.FC<ArcadeUIProps> = ({
  gameState,
  stats,
  countdownText,
  eventId,
  publicToken,
  isEventPreview = false,
  isEventTest = false,
  isMuted,
  onToggleMute,
  cameraActive,
  onToggleCamera,
  onStartGame,
  onPauseGame,
  onResumeGame,
  onRestartGame,
  onStopGame,
  videoRef,
  isFullscreen = false,
  onToggleFullscreen,
  settings,
  onUpdateSettings,
  onResetSettings,
  activeTheme,
  responsive: responsiveProp,
}) => {
  const { t } = useLocalization();
  const containerRef = useRef<HTMLDivElement>(null);
  const orientationPreference = activeTheme?.layout?.orientation || 'auto';
  const internalResponsive = useResponsiveLayout(containerRef, orientationPreference);
  const responsive = responsiveProp || internalResponsive;
  const { isPortrait, uiScale, designWidth, designHeight } = responsive;

  const [showGuideModal, setShowGuideModal] = useState(false);
  const [showStopConfirm, setShowStopConfirm] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showLeaderboardModal, setShowLeaderboardModal] = useState(false);

  // High Score / Leaderboard State
  const [playerName, setPlayerName] = useState<string>('');
  const [isSubmittingScore, setIsSubmittingScore] = useState(false);
  const [scoreSubmitted, setScoreSubmitted] = useState(false);
  const [submittedRank, setSubmittedRank] = useState<number | null>(null);
  const [submittedScoreId, setSubmittedScoreId] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string>(() => `cb_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`);
  const [leaderboardScores, setLeaderboardScores] = useState<EventLeaderboardEntry[]>([]);
  const [loadingLeaderboard, setLoadingLeaderboard] = useState(false);
  const [leaderboardError, setLeaderboardError] = useState<string | null>(null);
  const [gameOverTab, setGameOverTab] = useState<'summary' | 'leaderboard'>('summary');
  const [logoLoadError, setLogoLoadError] = useState(false);

  // Handlers to guarantee a clean slate for new game sessions
  const handlePlayAgain = useCallback(() => {
    setPlayerName('');
    try {
      localStorage.removeItem('event_player_name');
    } catch {}
    onRestartGame();
  }, [onRestartGame]);

  const handleStartGame = useCallback(() => {
    setPlayerName('');
    try {
      localStorage.removeItem('event_player_name');
    } catch {}
    onStartGame();
  }, [onStartGame]);

  // Ensure fresh game session starts with empty player name on mount
  useEffect(() => {
    setPlayerName('');
    try {
      localStorage.removeItem('event_player_name');
    } catch {}
  }, []);

  const layout: GameLayoutConfig = useMemo(
    () => getEffectiveGameLayout(normalizeGameLayout(activeTheme?.layout, 'catch-brand'), isPortrait, 'catch-brand'),
    [activeTheme?.layout, isPortrait]
  );

  const goodItem =
    activeTheme?.items_config?.find((i) => !i.isHazard && !i.isBonus) ||
    activeTheme?.items_config?.[0];
  const badItem = activeTheme?.items_config?.find((i) => i.isHazard);

  const fallingItemName =
    activeTheme?.fallingObjectName ||
    goodItem?.name ||
    'Item';

  const badFallingItemName =
    activeTheme?.badFallingObjectName ||
    badItem?.name ||
    'Hazard';

  const gameTitle =
    activeTheme?.branding?.gameTitle ||
    activeTheme?.gameTitle ||
    activeTheme?.name ||
    'CATCH THE BRAND';

  const gameSubtitle =
    activeTheme?.branding?.subtitle ||
    activeTheme?.subtitle ||
    `Catch falling ${fallingItemName.toLowerCase()}s, avoid ${badFallingItemName.toLowerCase()}s, and survive ${settings?.gameDurationSeconds ?? 20} seconds!`;

  const goodItemImg =
    activeTheme?.fallingObject ||
    goodItem?.imageUrl ||
    '/assets/games/catch-brand/themes/default/item_normal_01.png';

  const badItemImg =
    activeTheme?.badFallingObject ||
    badItem?.imageUrl ||
    '/assets/games/catch-brand/themes/default/item_hazard_01.png';

  const catcherImg =
    activeTheme?.basket ||
    activeTheme?.basket_config?.imageUrl ||
    '/assets/games/catch-brand/themes/default/basket.png';

  const hasEventContext = Boolean(publicToken || (eventId && eventId !== 'undefined' && eventId !== 'null'));
  const isOfficialEventFlow = hasEventContext && !isEventPreview;

  // Fetch Event Leaderboard (or load local storage scores in preview mode)
  const fetchEventLeaderboard = async () => {
    if (!hasEventContext) {
      try {
        const raw = localStorage.getItem('arcade_local_leaderboard');
        if (raw) {
          const parsed = JSON.parse(raw) as EventLeaderboardEntry[];
          setLeaderboardScores(Array.isArray(parsed) ? parsed : []);
        } else {
          setLeaderboardScores([]);
        }
      } catch {
        setLeaderboardScores([]);
      }
      return;
    }

    setLoadingLeaderboard(true);
    setLeaderboardError(null);
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
    } catch (err: any) {
      console.warn('Could not load leaderboard:', err);
    } finally {
      setLoadingLeaderboard(false);
    }
  };

  // When game finishes, load the leaderboard
  useEffect(() => {
    if (gameState === 'GAME_OVER') {
      setScoreSubmitted(false);
      setSubmittedRank(null);
      setSubmittedScoreId(null);
      setGameOverTab('summary');
      fetchEventLeaderboard();
    }
  }, [gameState, eventId, publicToken, isEventPreview]);

  // When start screen is active, reset player name for new game and load leaderboard
  useEffect(() => {
    if (gameState === 'START') {
      setPlayerName('');
      setScoreSubmitted(false);
      setSubmittedRank(null);
      setSubmittedScoreId(null);
      try {
        localStorage.removeItem('event_player_name');
      } catch {}
      fetchEventLeaderboard();
    }
  }, [gameState, eventId, publicToken, isEventPreview]);

  // Load leaderboard when modal opens
  useEffect(() => {
    if (showLeaderboardModal) {
      fetchEventLeaderboard();
    }
  }, [showLeaderboardModal, eventId, publicToken, isEventPreview]);

  // Handle high score submission
  const handleSubmitScore = async (nameOrEvent?: React.FormEvent | string) => {
    if (nameOrEvent && typeof nameOrEvent === 'object' && 'preventDefault' in nameOrEvent) {
      nameOrEvent.preventDefault();
    }
    if (isSubmittingScore || scoreSubmitted) return;

    // Strict separation: Studio preview runs without test context NEVER submit official scores
    if (isEventPreview && !isEventTest) {
      return;
    }

    const trimmedName = (typeof nameOrEvent === 'string' && nameOrEvent.trim() ? nameOrEvent.trim() : playerName.trim()) || 'Player';
    setPlayerName(trimmedName);
    setIsSubmittingScore(true);
    setLeaderboardError(null);

    // If running in Studio Preview or without an active Event ID, save locally
    if (!hasEventContext) {
      try {
        const localEntry: EventLeaderboardEntry = {
          id: 'local_' + Date.now(),
          event_id: 'studio-preview',
          player_name: trimmedName,
          score: stats.score,
          metadata: {
            greenCaught: stats.greenCaught,
            orangeCaught: stats.orangeCaught,
            duriansMissed: stats.duriansMissed,
            itemsMissed: stats.itemsMissed ?? stats.duriansMissed,
          },
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
        list.sort((a, b) => {
          if (b.score !== a.score) return b.score - a.score;
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        });
        const rankedList = list.map((item, idx) => ({ ...item, rank: idx + 1 }));
        localStorage.setItem('arcade_local_leaderboard', JSON.stringify(rankedList.slice(0, 50)));

        const myRank = rankedList.findIndex((item) => item.id === localEntry.id) + 1;
        setScoreSubmitted(true);
        setSubmittedRank(myRank > 0 ? myRank : 1);
        setSubmittedScoreId(localEntry.id);
        setLeaderboardScores(rankedList.slice(0, 50));
        setGameOverTab('leaderboard');
      } catch (err: any) {
        console.error('Local score submission error:', err);
        setLeaderboardError('Failed to save score.');
      } finally {
        setIsSubmittingScore(false);
      }
      return;
    }

    const isOrganizerTest = Boolean(isEventTest || isEventPreview);

    // Public players must submit with publicToken; only organizer test sessions can submit via eventId
    if (!publicToken && !isOrganizerTest) {
      setLeaderboardError('Public score submission requires a valid event token.');
      setIsSubmittingScore(false);
      return;
    }

    try {
      const url = (!isOrganizerTest && publicToken)
        ? `/api/public/events/${publicToken}/high-scores`
        : `/api/events/${eventId}/admin/high-scores`;

      const res = await apiFetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          player_name: trimmedName,
          score: stats.score,
          session_id: sessionId,
          metadata: {
            sessionId,
            session_id: sessionId,
            gameType: 'catch-brand',
            greenCaught: stats.greenCaught,
            orangeCaught: stats.orangeCaught,
            goldenCaught: stats.goldenCaught,
            duriansMissed: stats.duriansMissed,
            itemsMissed: stats.itemsMissed ?? stats.duriansMissed,
            itemsCaughtById: stats.itemsCaughtById,
            isEventTest: isOrganizerTest ? true : undefined,
            score_environment: isOrganizerTest ? 'test' : undefined,
          },
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'This event is not accepting scores.');
      }

      const data = await res.json();
      setScoreSubmitted(true);
      setSubmittedRank(data.rank);
      setSubmittedScoreId(data.score?.id || null);

      // Refresh leaderboard list and switch to leaderboard tab
      await fetchEventLeaderboard();
      setGameOverTab('leaderboard');
    } catch (err: any) {
      console.error('Submit score error:', err);
      setLeaderboardError(err.message || 'This event has ended. Your score was not submitted.');
    } finally {
      setIsSubmittingScore(false);
    }
  };

  const handleRequestStop = () => {
    if (gameState === 'PLAYING') {
      onPauseGame();
    }
    setShowStopConfirm(true);
  };

  const clientLogoUrl =
    activeTheme?.branding?.clientLogoUrl ||
    activeTheme?.clientLogo ||
    activeTheme?.branding?.logoUrl ||
    activeTheme?.logo;

  useEffect(() => {
    setLogoLoadError(false);
  }, [clientLogoUrl]);

  // Resolve theme background and start screen background
  const startBg = useMemo(() => {
    const resolvedConfig = getStartScreenConfig(
      activeTheme,
      'catch-brand',
      {
        fallingItemName,
        fallingItemImg: goodItemImg,
        goodItemImg,
        badFallingItemName,
        badFallingItemImg: badItemImg,
        badItemImg,
        catcherImg,
        gameTitle,
        gameSubtitle,
        logoUrl: clientLogoUrl,
      }
    );
    return resolveScreenBackground(resolvedConfig as any, activeTheme);
  }, [activeTheme, fallingItemName, goodItemImg, badFallingItemName, badItemImg, catcherImg, gameTitle, gameSubtitle, clientLogoUrl]);

  const customBgUrl =
    activeTheme?.background_url ||
    activeTheme?.backgroundUrl ||
    activeTheme?.theme_assets?.background ||
    activeTheme?.background;

  const backdropImgUrl = gameState === 'START' && startBg?.backgroundImageUrl
    ? startBg.backgroundImageUrl
    : customBgUrl;

  const backdropBgColor = gameState === 'START' && startBg?.backgroundColor
    ? startBg.backgroundColor
    : activeTheme?.visuals_config?.bgGradientTo || '#07130b';

  const backdropOverlayOpacity = gameState === 'START' && startBg?.hasImage
    ? startBg.backgroundOverlayOpacity
    : 0;

  return (
    <div
      ref={containerRef}
      id="arcade-ui-overlay"
      className="arcade-ui-container absolute inset-0 w-full h-full pointer-events-none select-none overflow-hidden font-mono z-30"
      style={{
        '--game-ui-scale': uiScale,
        '--game-design-width': `${designWidth}px`,
        '--game-design-height': `${designHeight}px`,
      } as React.CSSProperties}
    >
      {/* Optional Start Screen subtle backdrop dimming over active game canvas */}
      {gameState === 'START' && backdropOverlayOpacity > 0 && (
        <div
          className="absolute inset-0 pointer-events-none z-0"
          style={{ backgroundColor: `rgba(0, 0, 0, ${backdropOverlayOpacity})` }}
        />
      )}

      {/* Scaled design canvas (1024x576 in landscape, 576x1024 in portrait) */}
      <div
        className="game-ui-layer pointer-events-none select-none overflow-hidden"
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
          pointerEvents: 'none',
          overflow: 'hidden',
          zIndex: 1,
        }}
      >
        {/* Top Right Persistent Controls */}
        {gameState !== 'PLAYING' && gameState !== 'PAUSED' && gameState !== 'COUNTDOWN' && (
          <div className="absolute top-4 right-4 z-50 pointer-events-auto flex items-center gap-2">
            <button
              onClick={() => setShowSettingsModal(true)}
              className="p-2.5 rounded-xl bg-[#0f2d18]/90 border-2 border-[#d4e157] hover:border-[#ffee58] text-[#ffee58] shadow-lg transition-all"
              title={t('common.settings')}
            >
              <Settings className="w-4 h-4" />
            </button>
            <button
              onClick={onToggleMute}
              className="p-2.5 rounded-xl bg-[#0f2d18]/90 border-2 border-[#d4e157] hover:border-[#ffee58] text-[#ffee58] shadow-lg transition-all"
              title={isMuted ? t('game.soundOn') : t('game.soundOff')}
            >
              {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>
            <button
              onClick={onToggleFullscreen}
              className="p-2.5 rounded-xl bg-[#0f2d18]/90 border-2 border-[#d4e157] hover:border-[#ffee58] text-[#ffee58] shadow-lg transition-all flex items-center justify-center font-black"
              title={isFullscreen ? t('common.exitFullscreen') : t('common.fullscreen')}
            >
              <span className="text-base leading-none font-bold">⛶</span>
            </button>
          </div>
        )}

        {/* ================= IN-GAME DYNAMIC LAYOUT HUD ================= */}
        {(gameState === 'PLAYING' || gameState === 'PAUSED' || gameState === 'COUNTDOWN') && (
          <>
            {/* Top Right In-Game Controls Dock */}
            <GameControlBar
              id="live-arcade-control-bar"
              disabled={gameState === 'COUNTDOWN'}
              isMuted={isMuted}
              isPaused={gameState === 'PAUSED'}
              isFullscreen={isFullscreen}
              settingsTooltip={t('common.settings')}
              onSettingsClick={() => setShowSettingsModal(true)}
              onToggleMute={onToggleMute}
              onPauseResume={gameState === 'PLAYING' ? onPauseGame : onResumeGame}
              onStop={handleRequestStop}
              onToggleFullscreen={onToggleFullscreen}
              className="absolute top-3 right-3 z-50"
            />

            {/* 1. Client Logo Element (Dedicated Second Row below Game Title) */}
            {layout.clientLogo?.visible && clientLogoUrl && !logoLoadError && (
              <div
                style={{
                  position: 'absolute',
                  left: `${layout.clientLogo.x}%`,
                  top: `${layout.clientLogo.y}%`,
                  width: `${layout.clientLogo.width || 18}%`,
                  zIndex: 35,
                }}
                className="pointer-events-none transition-all flex items-center justify-center"
              >
                <img
                  src={clientLogoUrl}
                  alt="Client Logo"
                  style={{
                    maxHeight: isPortrait ? '34px' : '38px',
                    maxWidth: '100%',
                  }}
                  className="w-full object-contain drop-shadow"
                  onError={() => setLogoLoadError(true)}
                />
              </div>
            )}

            {/* 2. Score HUD Element */}
            {layout.scoreHud?.visible && (
              <div
                style={{
                  position: 'absolute',
                  left: `${layout.scoreHud.x}%`,
                  top: `${layout.scoreHud.y}%`,
                  width: `${layout.scoreHud.width || 18}%`,
                  zIndex: 35,
                }}
                className="pointer-events-none transition-all"
              >
                <div className="bg-[#0c2012]/85 backdrop-blur-sm border-2 border-[#b2c833] rounded-2xl px-3.5 py-1.5 shadow-lg text-white flex items-center justify-between">
                  <span className="text-xs sm:text-sm font-mono font-bold text-slate-300 flex items-center gap-1">
                    <Trophy className="w-3.5 h-3.5 text-amber-400" /> {t('game.score')}
                  </span>
                  <span
                    style={{ color: activeTheme.branding?.hudColor || '#c8e038' }}
                    className="text-base sm:text-lg font-mono font-black ml-2"
                  >
                    {stats.score}
                  </span>
                </div>
              </div>
            )}

            {/* 3. Timer Element (Independent dedicated second-row layout avoiding top-right control HUD) */}
            {layout.timer?.visible && (() => {
              const isCollidingWithControlHud = !isPortrait && (layout.timer.x >= 72 && layout.timer.y < 8.5);
              const timerX = isCollidingWithControlHud ? 79.5 : layout.timer.x;
              const timerY = isCollidingWithControlHud ? 10.5 : layout.timer.y;
              const timerWidth = layout.timer.width || 17;

              return (
                <div
                  style={{
                    position: 'absolute',
                    left: `${timerX}%`,
                    top: `${timerY}%`,
                    width: `${timerWidth}%`,
                    zIndex: 35,
                  }}
                  className="pointer-events-none transition-all"
                >
                  <div className="bg-[#0c2012]/85 backdrop-blur-sm border-2 border-[#b2c833] rounded-2xl px-3.5 py-1.5 shadow-lg text-white flex items-center justify-between">
                    <span className="text-xs sm:text-sm font-mono font-bold text-slate-300 flex items-center gap-1">
                      <Timer className="w-3.5 h-3.5 text-teal-400" /> {t('game.time')}
                    </span>
                    <span className="text-base sm:text-lg font-mono font-black text-amber-400 ml-2">
                      {stats.timeRemaining}s
                    </span>
                  </div>
                </div>
              );
            })()}

            {/* 4. Game Title Element */}
            {layout.gameTitle?.visible && (
              <div
                style={{
                  position: 'absolute',
                  left: `${layout.gameTitle.x}%`,
                  top: `${layout.gameTitle.y}%`,
                  width: `${layout.gameTitle.width || 28}%`,
                  zIndex: 35,
                }}
                className="pointer-events-none transition-all"
              >
                <div className="bg-slate-950/80 backdrop-blur-sm border border-slate-700/80 rounded-xl px-3 py-1 shadow-md text-center">
                  <div
                    style={{ color: activeTheme.branding?.accentColor || activeTheme.visuals_config?.accentColor || '#10b981' }}
                    className="font-black text-xs sm:text-sm uppercase tracking-wider truncate"
                  >
                    {activeTheme.branding?.gameTitle || activeTheme.gameTitle || activeTheme.name}
                  </div>
                </div>
              </div>
            )}

            {/* 5. Footer / Sponsor Element */}
            {layout.footerSponsor?.visible && (
              <div
                style={{
                  position: 'absolute',
                  left: `${layout.footerSponsor.x}%`,
                  top: `${layout.footerSponsor.y}%`,
                  width: `${layout.footerSponsor.width || 36}%`,
                  zIndex: 35,
                }}
                className="pointer-events-none transition-all"
              >
                <div className="bg-slate-950/80 backdrop-blur-sm border border-slate-700/80 rounded-full px-3 py-1 shadow-md text-center flex items-center justify-center gap-1.5">
                  <Megaphone className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span className="text-[10px] sm:text-xs text-slate-300 font-sans truncate">
                    {activeTheme.branding?.subtitle || activeTheme.subtitle || 'Official Event Arcade Challenge'}
                  </span>
                </div>
              </div>
            )}
          </>
        )}

        {/* START SCREEN OVERLAY (MOVED OUTSIDE GAME-UI-LAYER FOR AUTHORITATIVE UNIFORM 1024x576 SCALING) */}

        {/* ================= COUNTDOWN OVERLAY ================= */}
        {gameState === 'COUNTDOWN' && (
          <div className="absolute inset-0 bg-slate-950/20 pointer-events-none flex items-center justify-center z-40">
            <div className="text-center animate-ping">
              <span className="text-8xl sm:text-9xl font-black text-transparent bg-clip-text bg-gradient-to-b from-amber-300 to-emerald-400 drop-shadow-[0_0_35px_rgba(16,185,129,0.8)]">
                {countdownText}
              </span>
            </div>
          </div>
        )}

        {/* ================= GAME OVER OVERLAY (DEPRECATED: RENDERED VIA ROOT RESULT SCREEN OVERLAY) ================= */}
        {false && gameState === 'GAME_OVER' && (
          <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm pointer-events-auto flex flex-col items-center justify-center p-2 sm:p-4 text-center z-40 overflow-hidden">
            <div className="game-over-container max-w-md w-full bg-slate-900 border-2 border-amber-500/80 rounded-2xl p-4 sm:p-5 shadow-2xl relative my-auto flex flex-col max-h-[92%] overflow-hidden">
              <div className="flex items-center justify-between mb-2">
                <h2 className="game-over-title text-xl sm:text-2xl font-black text-rose-500 tracking-wider">
                  GAME OVER
                </h2>

                {/* Sub Tab Switcher */}
                <div className="flex items-center gap-1 bg-slate-950 p-0.5 rounded-lg border border-slate-800">
                  <button
                    onClick={() => setGameOverTab('summary')}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all ${
                      gameOverTab === 'summary'
                        ? 'bg-amber-500 text-slate-950 shadow'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Summary
                  </button>
                  <button
                    onClick={() => setGameOverTab('leaderboard')}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all flex items-center gap-1 ${
                      gameOverTab === 'leaderboard'
                        ? 'bg-amber-500 text-slate-950 shadow'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Trophy className="w-3 h-3" /> Board
                  </button>
                </div>
              </div>

              {/* TAB 1: SCORE SUMMARY */}
              {gameOverTab === 'summary' && (
                <div className="flex-1 flex flex-col justify-between overflow-y-auto">
                  <div>
                    {stats.score >= stats.highScore && stats.score > 0 ? (
                      <div className="inline-flex items-center gap-1.5 bg-amber-500/20 border border-amber-400/60 text-amber-300 text-xs px-3 py-0.5 rounded-full font-extrabold mb-2 animate-bounce">
                        <Trophy className="w-3.5 h-3.5 text-amber-400" /> NEW RECORD!
                      </div>
                    ) : (
                      <p className="text-[11px] text-slate-400 mb-2">{settings.gameDurationSeconds ?? 20} Seconds Elapsed!</p>
                    )}

                    <div className="game-over-score-box bg-slate-950 border border-slate-800 rounded-xl p-2.5 sm:p-3 mb-2.5">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-slate-400 text-[10px] font-bold block uppercase">
                          {isEventPreview ? 'TEST SCORE' : 'FINAL SCORE'}
                        </span>
                        {isEventPreview && (
                          <span className="text-[9px] font-bold uppercase tracking-wider text-amber-400/90 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20 font-mono">
                            Preview Test Play
                          </span>
                        )}
                      </div>
                      <span className="text-3xl sm:text-4xl font-black text-emerald-400 tracking-tight">
                        {stats.score}
                      </span>

                      <div className="mt-2 pt-2 border-t border-slate-800/80 flex justify-around text-xs">
                        <div>
                          <span className="text-slate-400 block text-[10px]">{fallingItemName}</span>
                          <span className="text-emerald-400 font-bold text-xs sm:text-sm">+{stats.greenCaught}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[10px]">{badFallingItemName}</span>
                          <span className="text-rose-400 font-bold text-xs sm:text-sm">-{stats.orangeCaught}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[10px]">{t('game.best', undefined, 'BEST')}</span>
                          <span className="text-amber-400 font-bold text-xs sm:text-sm">{stats.highScore}</span>
                        </div>
                      </div>
                    </div>

                    {/* Preview Test Notice vs Official / Test Score Submission Box */}
                    {isEventPreview && !isEventTest ? (
                      <div className="bg-slate-950/90 border border-amber-500/30 rounded-xl p-2.5 sm:p-3 mb-3 text-left">
                        <div className="flex items-center justify-between mb-1">
                          <span className="flex items-center gap-1.5 text-amber-400 font-black text-xs uppercase tracking-wider">
                            <Trophy className="w-3.5 h-3.5" /> {t('game.score')}: {stats.score}
                          </span>
                          <span className="text-[9px] text-amber-300/80 font-mono uppercase bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
                            {t('common.preview')}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-300 leading-snug">
                          {t('game.simulated')}
                        </p>
                      </div>
                    ) : !scoreSubmitted ? (
                      <form onSubmit={handleSubmitScore} className="bg-slate-950/80 border border-slate-800 rounded-xl p-2.5 mb-3 text-left">
                        {isEventTest && (
                          <div className="mb-2 p-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-[10px] text-amber-300">
                            <div className="font-bold flex items-center gap-1">
                              <Trophy className="w-3 h-3 text-amber-400 shrink-0" />
                              <span>{t('game.testMode', undefined, 'PRE-EVENT TEST MODE')}</span>
                            </div>
                            <p className="text-slate-300 mt-0.5">{t('game.testScoresNotice', undefined, 'Test scores are saved for validation and will be cleared when the event starts.')}</p>
                          </div>
                        )}
                        <div className="flex items-center justify-between text-xs text-slate-300 font-bold mb-1.5">
                          <span className="flex items-center gap-1.5 text-amber-400">
                            <Trophy className="w-3.5 h-3.5" /> {isEventTest ? t('game.submitTestScore', undefined, 'Submit Test Score') : t('game.submitScore')}
                          </span>
                          <span className="text-[10px] text-slate-500 font-mono">{isEventTest ? t('game.testLeaderboard', undefined, 'Test Leaderboard') : t('game.leaderboard')}</span>
                        </div>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={playerName}
                            onChange={(e) => setPlayerName(e.target.value)}
                            placeholder={t('game.enterNickname', undefined, 'Enter your nickname...')}
                            maxLength={25}
                            disabled={isSubmittingScore}
                            className="flex-1 bg-slate-900 border border-slate-700 focus:border-amber-400 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-slate-500 outline-none font-mono"
                          />
                          <button
                            type="submit"
                            disabled={isSubmittingScore}
                            className="px-3 py-1.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 disabled:opacity-50 text-slate-950 font-black text-xs rounded-lg transition-all flex items-center gap-1 shrink-0 shadow"
                          >
                            {isSubmittingScore ? t('common.saving') : <><Send className="w-3 h-3" /> {t('common.submit')}</>}
                          </button>
                        </div>
                        {leaderboardError && (
                          <div className="p-2 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-semibold mt-2 text-left">
                            <p className="font-bold text-rose-400">{t('game.submissionNotice', undefined, 'Submission Notice')}</p>
                            <p className="text-[11px] text-rose-300 mt-0.5">{leaderboardError}</p>
                          </div>
                        )}
                      </form>
                    ) : (
                      <div className="bg-emerald-950/60 border border-emerald-500/40 rounded-xl p-2 sm:p-2.5 mb-3 flex items-center justify-between text-left">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-emerald-500/20 border border-emerald-400 flex items-center justify-center shrink-0">
                            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                          </div>
                          <div>
                            <span className="text-emerald-300 font-bold text-xs block">{t('game.scoreRecorded', undefined, 'Score Recorded!')}</span>
                            <span className="text-emerald-400 text-[10px]">{t('game.rankedOnBoard', { rank: submittedRank ?? 1 }, "Ranked #{{rank}} on this Event's Board")}</span>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setGameOverTab('leaderboard')}
                          className="px-2 py-1 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-[11px] rounded-lg transition-all shrink-0 cursor-pointer"
                        >
                          {t('game.viewBoard', undefined, 'View Board')}
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2.5 pt-1">
                    <button
                      onClick={handlePlayAgain}
                      className="flex-1 py-2 sm:py-2.5 px-3 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-sm sm:text-base rounded-xl border-2 border-amber-300 shadow-[0_0_15px_rgba(245,158,11,0.3)] transition-all transform hover:scale-105 active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <RotateCcw className="w-4 h-4 stroke-[3]" /> {t('game.playAgain')}
                    </button>
                    <button
                      onClick={handleRequestStop}
                      className="py-2 sm:py-2.5 px-3 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs sm:text-sm rounded-xl border border-slate-700 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                      title={t('common.menu', undefined, 'Return to Main Menu')}
                    >
                      <Home className="w-3.5 h-3.5" /> {t('common.menu', undefined, 'MENU')}
                    </button>
                  </div>
                </div>
              )}

              {/* TAB 2: EVENT HIGH SCORE BOARD */}
              {gameOverTab === 'leaderboard' && (
                <div className="flex-1 flex flex-col justify-between overflow-hidden">
                  <div className="flex-1 overflow-y-auto max-h-52 sm:max-h-60 pr-1 space-y-1 my-1">
                    {loadingLeaderboard ? (
                      <div className="py-8 text-slate-400 text-xs flex flex-col items-center gap-2">
                        <div className="w-5 h-5 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
                        <span>{t('game.loadingLeaderboard', undefined, 'Loading Leaderboard...')}</span>
                      </div>
                    ) : leaderboardScores.length === 0 ? (
                      <div className="py-8 text-center text-slate-400 text-xs">
                        <Trophy className="w-8 h-8 text-slate-600 mx-auto mb-2 opacity-50" />
                        <p className="font-bold text-slate-300">{t('game.noScoresYetTitle', undefined, 'No Scores Yet!')}</p>
                        <p className="text-[10px] text-slate-500 mt-0.5">{t('game.beFirstToPlay')}</p>
                      </div>
                    ) : (
                      leaderboardScores.map((entry) => {
                        const isCurrentSubmission = submittedScoreId === entry.id;
                        let rankBadge = (
                          <span className="w-5 h-5 rounded-full bg-slate-800 text-slate-400 font-bold text-[10px] flex items-center justify-center shrink-0">
                            {entry.rank}
                          </span>
                        );

                        if (entry.rank === 1) {
                          rankBadge = (
                            <span className="w-5 h-5 rounded-full bg-amber-500/20 border border-amber-400 text-amber-300 font-black text-[10px] flex items-center justify-center shrink-0 shadow-[0_0_8px_rgba(245,158,11,0.4)]">
                              🥇
                            </span>
                          );
                        } else if (entry.rank === 2) {
                          rankBadge = (
                            <span className="w-5 h-5 rounded-full bg-slate-300/20 border border-slate-300 text-slate-200 font-black text-[10px] flex items-center justify-center shrink-0">
                              🥈
                            </span>
                          );
                        } else if (entry.rank === 3) {
                          rankBadge = (
                            <span className="w-5 h-5 rounded-full bg-amber-700/20 border border-amber-600 text-amber-400 font-black text-[10px] flex items-center justify-center shrink-0">
                              🥉
                            </span>
                          );
                        }

                        return (
                          <div
                            key={entry.id}
                            className={`flex items-center justify-between p-2 rounded-lg text-xs font-mono transition-all ${
                              isCurrentSubmission
                                ? 'bg-amber-500/20 border border-amber-400/80 shadow-[0_0_10px_rgba(245,158,11,0.2)]'
                                : 'bg-slate-950/60 border border-slate-800/80'
                            }`}
                          >
                            <div className="flex items-center gap-2 overflow-hidden">
                              {rankBadge}
                              <span className={`truncate font-bold ${isCurrentSubmission ? 'text-amber-300' : 'text-slate-200'}`}>
                                {entry.player_name}
                              </span>
                              {isCurrentSubmission && (
                                <span className="bg-amber-500 text-slate-950 text-[9px] px-1 py-0.2 rounded font-black">
                                  YOU
                                </span>
                              )}
                            </div>
                            <span className="text-emerald-400 font-black text-xs sm:text-sm shrink-0 ml-2">
                              {entry.score.toLocaleString()}
                            </span>
                          </div>
                        );
                      })
                    )}
                  </div>

                  <div className="flex items-center gap-2.5 pt-2 border-t border-slate-800">
                    <button
                      onClick={() => setGameOverTab('summary')}
                      className="py-2 px-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-xl border border-slate-700 transition-all"
                    >
                      ← Back
                    </button>
                    <button
                      onClick={handlePlayAgain}
                      className="flex-1 py-2 sm:py-2.5 px-3 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-xs sm:text-sm rounded-xl border-2 border-amber-300 shadow transition-all flex items-center justify-center gap-1.5"
                    >
                      <RotateCcw className="w-3.5 h-3.5 stroke-[3]" /> PLAY AGAIN
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}


        {/* ================= PAUSE OVERLAY ================= */}
        {gameState === 'PAUSED' && (
          <div className="absolute inset-0 bg-slate-950/50 backdrop-blur-sm pointer-events-auto flex flex-col items-center justify-center p-3 sm:p-6 text-center z-40">
            <div className="pause-container max-w-xs w-full bg-slate-900 border-2 border-slate-700 rounded-2xl p-5 sm:p-6 shadow-2xl my-auto">
              <h2 className="text-2xl font-black text-amber-400 tracking-wider mb-3 sm:mb-4">
                {t('game.pause')}
              </h2>

              <div className="space-y-2.5 sm:space-y-3">
                <button
                  onClick={onResumeGame}
                  className="w-full py-2 sm:py-2.5 px-4 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-lg transition-all flex items-center justify-center gap-2"
                >
                  <Play className="w-4 h-4 fill-slate-950" /> {t('game.resume')}
                </button>

                <button
                  onClick={onRestartGame}
                  className="w-full py-2 sm:py-2.5 px-4 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-bold rounded-lg transition-all flex items-center justify-center gap-2"
                >
                  <RotateCcw className="w-4 h-4" /> {t('common.restart')}
                </button>

                <button
                  onClick={() => setShowSettingsModal(true)}
                  className="w-full py-2 sm:py-2.5 px-4 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-bold rounded-lg transition-all flex items-center justify-center gap-2"
                >
                  <Settings className="w-4 h-4" /> {t('common.settings')}
                </button>

                <button
                  onClick={handleRequestStop}
                  className="w-full py-2 sm:py-2.5 px-4 bg-rose-950/80 hover:bg-rose-900 border border-rose-500/60 text-rose-200 font-bold rounded-lg transition-all flex items-center justify-center gap-2 text-xs sm:text-sm"
                >
                  <Square className="w-4 h-4 fill-rose-300" /> {t('game.quit')} ({t('common.menu')})
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ================= STOP GAME CONFIRMATION MODAL ================= */}
        {showStopConfirm && (
          <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-md pointer-events-auto flex items-center justify-center p-4 z-50">
            <div className="max-w-sm w-full bg-slate-900 border-2 border-rose-500/80 rounded-2xl p-6 shadow-[0_0_30px_rgba(244,63,94,0.3)] text-center relative">
              <div className="w-12 h-12 rounded-full bg-rose-500/20 border border-rose-500/40 text-rose-400 flex items-center justify-center mx-auto mb-3">
                <Square className="w-6 h-6 fill-rose-400" />
              </div>

              <h3 className="text-xl font-black text-rose-400 tracking-wider mb-2">
                {t('game.quit')}?
              </h3>

              <p className="text-xs text-slate-300 mb-6 leading-relaxed">
                {t('common.confirm')} {t('game.quit').toLowerCase()}?
              </p>

              <div className="flex items-center gap-3">
                <button
                  onClick={() => {
                    setShowStopConfirm(false);
                    onStopGame();
                  }}
                  className="flex-1 py-2.5 px-4 bg-rose-600 hover:bg-rose-500 text-white font-black text-sm rounded-xl border border-rose-400 shadow-md transition-all flex items-center justify-center gap-1.5"
                >
                  <Square className="w-4 h-4 fill-white" /> {t('common.confirm')}
                </button>

                <button
                  onClick={() => {
                    setShowStopConfirm(false);
                  }}
                  className="flex-1 py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-sm rounded-xl border border-slate-700 transition-all"
                >
                  {t('common.cancel')}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ================= GUIDE / CONFIGURATION MODAL ================= */}
        {showGuideModal && (
          <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-lg pointer-events-auto flex items-center justify-center p-4 z-50">
            <div className="max-w-lg w-full bg-slate-900 border border-slate-700 rounded-2xl p-6 shadow-2xl max-h-[85vh] overflow-y-auto text-left text-xs text-slate-300">
              <div className="flex items-center justify-between mb-4 border-b border-slate-800 pb-3">
                <h3 className="text-lg font-bold text-amber-400 flex items-center gap-2">
                  <Sliders className="w-5 h-5" /> Game Mechanics & Developer Guide
                </h3>
                <button
                  onClick={() => setShowGuideModal(false)}
                  className="p-1 rounded bg-slate-800 text-slate-400 hover:text-white"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <h4 className="font-bold text-emerald-400 mb-1">🎮 {t('game.howToPlay', undefined, 'How to Play')}</h4>
                  <p>Move the catcher horizontally to catch falling {fallingItemName.toLowerCase()}s (+10 points) while avoiding {badFallingItemName.toLowerCase()}s (-10 points).</p>
                </div>

                <div>
                  <h4 className="font-bold text-amber-400 mb-1">⚡ {t('game.controls', undefined, 'Controls')}</h4>
                  <ul className="list-disc list-inside space-y-1 text-slate-300">
                    <li><strong>{t('game.keyboard', undefined, 'Keyboard:')}</strong> {t('game.keyboardControls', undefined, 'Left/Right arrow keys or A/D keys')}</li>
                    <li><strong>{t('game.mouseTouch', undefined, 'Mouse/Touch:')}</strong> {t('game.mouseTouchControls', undefined, 'Move cursor or drag finger horizontally across screen')}</li>
                  </ul>
                </div>

                <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 space-y-2">
                  <h4 className="font-bold text-teal-400">🎨 {t('game.multiThemeSystem', undefined, 'Multi-Theme System')}</h4>
                  <p>Add new themes cleanly by creating a configuration object in <code className="text-amber-300">src/themes/</code>:</p>
                  <ul className="list-disc list-inside space-y-1 font-mono text-[11px] text-amber-300">
                    <li><code className="text-slate-200">ACTIVE_THEME_ID</code>: Single configuration value in <code className="text-slate-200">src/themes/registry.ts</code>.</li>
                    <li><code className="text-slate-200">GameTheme interface</code>: Define background, catcher, falling items, titles, and custom sounds.</li>
                    <li><code className="text-slate-200">Fallback Protection</code>: Automatically degrades to default Catch The Brand assets if any asset is missing.</li>
                  </ul>
                </div>
              </div>

              <button
                onClick={() => setShowGuideModal(false)}
                className="mt-5 w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-lg"
              >
                {t('common.close', undefined, 'Close')}
              </button>
            </div>
          </div>
        )}

        {/* ================= GAME SETTINGS MODAL ================= */}
        {showSettingsModal && (
          <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-md pointer-events-auto flex items-center justify-center p-3 sm:p-4 z-50">
            <div className="max-w-md w-full bg-slate-900 border-2 border-amber-500/80 rounded-2xl p-5 sm:p-6 shadow-2xl relative my-auto max-h-[90vh] overflow-y-auto text-slate-100">
              {/* Header */}
              <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <Settings className="w-5 h-5 text-amber-400" />
                  <h3 className="text-xl font-black text-amber-400 tracking-wider">
                    {t('common.settings')}
                  </h3>
                </div>
                <button
                  onClick={() => setShowSettingsModal(false)}
                  className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 transition-all"
                  title={t('common.close')}
                >
                  ✕
                </button>
              </div>

              {/* Options */}
              <div className="space-y-4 text-xs sm:text-sm">
                {/* MASTER VOLUME */}
                <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3.5 space-y-2">
                  <div className="flex justify-between items-center font-bold">
                    <span className="text-slate-200 flex items-center gap-2">
                      <Volume2 className="w-4 h-4 text-emerald-400" /> {t('studio.volume')}
                    </span>
                    <span className="text-amber-400 font-mono font-black text-base">
                      {Math.round((settings.volume ?? 1) * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={settings.volume ?? 1}
                    onChange={(e) => onUpdateSettings({ ...settings, volume: parseFloat(e.target.value) })}
                    className="w-full accent-amber-500 cursor-pointer h-2 bg-slate-800 rounded-lg"
                  />
                </div>

                {/* FALL SPEED */}
                <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3.5 space-y-2">
                  <div className="flex justify-between items-center font-bold">
                    <span className="text-slate-200 flex items-center gap-2">
                      <Zap className="w-4 h-4 text-amber-400" /> Fall Speed
                    </span>
                    <span className="text-amber-400 font-mono font-black text-base">
                      {Math.round((settings.fallSpeedMultiplier ?? 0.7) * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0.5"
                    max="1.5"
                    step="0.1"
                    value={settings.fallSpeedMultiplier ?? 0.7}
                    onChange={(e) => onUpdateSettings({ ...settings, fallSpeedMultiplier: parseFloat(e.target.value) })}
                    className="w-full accent-amber-500 cursor-pointer h-2 bg-slate-800 rounded-lg"
                  />
                </div>

                {/* GAME DURATION */}
                <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3.5 space-y-2">
                  <div className="flex justify-between items-center font-bold">
                    <span className="text-slate-200 flex items-center gap-2">
                      <Timer className="w-4 h-4 text-teal-400" /> Game Duration
                    </span>
                    <span className="text-amber-400 font-mono font-black text-base">
                      {settings.gameDurationSeconds ?? 20} SEC
                    </span>
                  </div>
                  <input
                    type="range"
                    min="10"
                    max="120"
                    step="5"
                    value={settings.gameDurationSeconds ?? 20}
                    onChange={(e) => onUpdateSettings({ ...settings, gameDurationSeconds: parseInt(e.target.value, 10) })}
                    className="w-full accent-amber-500 cursor-pointer h-2 bg-slate-800 rounded-lg"
                  />
                </div>
              </div>

              {/* Modal Actions */}
              <div className="mt-5 pt-3 border-t border-slate-800 flex items-center gap-3">
                <button
                  onClick={onResetSettings}
                  className="px-3.5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-bold text-xs rounded-xl border border-slate-700 transition-all cursor-pointer"
                >
                  {t('common.resetDefaults')}
                </button>
                <button
                  onClick={() => setShowSettingsModal(false)}
                  className="flex-1 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-sm rounded-xl border border-amber-300 transition-all shadow-md cursor-pointer"
                >
                  {t('common.done')}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ================= EVENT HIGH SCORE BOARD MODAL ================= */}
        {showLeaderboardModal && (
          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-md pointer-events-auto flex items-center justify-center p-3 sm:p-4 z-50 overflow-hidden">
            <div className="bg-slate-900 border-2 border-amber-500/80 rounded-2xl p-4 sm:p-5 max-w-md w-full shadow-2xl relative flex flex-col max-h-[85vh] animate-in fade-in zoom-in duration-150">
              <div className="flex justify-between items-center pb-2.5 mb-2.5 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-amber-500/20 border border-amber-400/80 flex items-center justify-center">
                    <Trophy className="w-4 h-4 text-amber-400" />
                  </div>
                  <div>
                    <h3 className="text-base sm:text-lg font-black text-transparent bg-clip-text bg-gradient-to-r from-amber-300 to-emerald-400">
                      {t('game.leaderboard')}
                    </h3>
                    <p className="text-[10px] text-slate-400">{t('game.topPlayers')}</p>
                  </div>
                </div>

                <button
                  onClick={() => setShowLeaderboardModal(false)}
                  className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-all cursor-pointer"
                  aria-label={t('common.close')}
                  title={t('common.close')}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Leaderboard List */}
              <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 my-1 max-h-72">
                {loadingLeaderboard ? (
                  <div className="py-12 text-slate-400 text-xs flex flex-col items-center gap-2">
                    <div className="w-6 h-6 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
                    <span>{t('common.loading')}</span>
                  </div>
                ) : leaderboardScores.length === 0 ? (
                  <div className="py-12 text-center text-slate-400 text-xs">
                    <Trophy className="w-10 h-10 text-slate-600 mx-auto mb-2 opacity-50" />
                    <p className="font-bold text-slate-300">{t('game.noScoresYet')}</p>
                    <p className="text-[11px] text-slate-500 mt-1">{t('game.beFirstToPlay')}</p>
                  </div>
                ) : (
                  leaderboardScores.map((entry) => {
                    let rankBadge = (
                      <span className="w-6 h-6 rounded-full bg-slate-800 text-slate-400 font-bold text-xs flex items-center justify-center shrink-0">
                        {entry.rank}
                      </span>
                    );

                    if (entry.rank === 1) {
                      rankBadge = (
                        <span className="w-6 h-6 rounded-full bg-amber-500/20 border border-amber-400 text-amber-300 font-black text-xs flex items-center justify-center shrink-0 shadow-[0_0_10px_rgba(245,158,11,0.4)]">
                          🥇
                        </span>
                      );
                    } else if (entry.rank === 2) {
                      rankBadge = (
                        <span className="w-6 h-6 rounded-full bg-slate-300/20 border border-slate-300 text-slate-200 font-black text-xs flex items-center justify-center shrink-0">
                          🥈
                        </span>
                      );
                    } else if (entry.rank === 3) {
                      rankBadge = (
                        <span className="w-6 h-6 rounded-full bg-amber-700/20 border border-amber-600 text-amber-400 font-black text-xs flex items-center justify-center shrink-0">
                          🥉
                        </span>
                      );
                    }

                    return (
                      <div
                        key={entry.id}
                        className="flex items-center justify-between p-2 sm:p-2.5 rounded-xl bg-slate-950/70 border border-slate-800/90 text-xs font-mono"
                      >
                        <div className="flex items-center gap-2.5 overflow-hidden">
                          {rankBadge}
                          <span className="truncate font-bold text-slate-200">
                            {entry.player_name}
                          </span>
                        </div>
                        <span className="text-emerald-400 font-black text-sm sm:text-base shrink-0 ml-2">
                          {entry.score.toLocaleString()}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Footer */}
              <div className="mt-3 pt-3 border-t border-slate-800 flex items-center justify-between">
                <span className="text-[10px] text-slate-500 font-mono">
                  {leaderboardScores.length} {leaderboardScores.length === 1 ? 'player' : 'players'} recorded
                </span>
                <button
                  onClick={() => setShowLeaderboardModal(false)}
                  className="py-1.5 px-4 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs rounded-lg transition-all shadow"
                >
                  CLOSE
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ================= START SCREEN OVERLAY (AUTHORITATIVE UNIFORM 1024x576 SCALING) ================= */}
      {gameState === 'START' && (
        <div className="absolute inset-0 pointer-events-auto z-40 overflow-hidden">
          <StartScreenRenderer
            theme={activeTheme}
            gameType="catch-brand"
            targetDimensions={{ width: designWidth, height: designHeight }}
            gameMeta={{
              fallingItemName,
              fallingItemImg: goodItemImg,
              goodItemImg,
              badFallingItemName,
              badFallingItemImg: badItemImg,
              badItemImg,
              catcherImg,
              gameTitle,
              gameSubtitle,
              logoUrl: clientLogoUrl,
            }}
            onStartGame={handleStartGame}
            onShowLeaderboard={() => setShowLeaderboardModal(true)}
            onShowGuide={() => setShowGuideModal(true)}
            onOpenSettings={() => setShowSettingsModal(true)}
            isEventPreview={isEventPreview}
            isEventTest={isEventTest}
            leaderboardData={leaderboardScores}
            loadingLeaderboard={loadingLeaderboard}
            leaderboardError={leaderboardError}
          />
        </div>
      )}

      {/* ================= RESULT SCREEN OVERLAY (AUTHORITATIVE UNIFORM 1024x576 SCALING) ================= */}
      {gameState === 'GAME_OVER' && (
        <div className="absolute inset-0 pointer-events-auto z-40 overflow-hidden">
          <ResultScreenRenderer
            resultConfig={
              activeTheme?.screens?.result ||
              (activeTheme?.game_config as any)?.screens?.result ||
              null
            }
            theme={activeTheme}
            layout={activeTheme?.layout}
            targetDimensions={{ width: designWidth, height: designHeight }}
            isPortrait={responsive.isPortrait}
            stats={{
              score: stats.score,
              highScore: stats.highScore,
              timeElapsedSeconds: settings.gameDurationSeconds ?? 20,
              accuracyPercent: (() => {
                const missed = stats.itemsMissed ?? stats.duriansMissed ?? 0;
                const totalAttempts = stats.greenCaught + stats.orangeCaught + stats.goldenCaught + missed;
                return totalAttempts > 0
                  ? Math.round(((stats.greenCaught + stats.orangeCaught + stats.goldenCaught) / totalAttempts) * 100)
                  : 100;
              })(),
              isVictory: true,
              gameType: 'catch-brand',
            }}
            onAction={(action) => {
              if (action === 'playAgain') {
                handlePlayAgain();
              } else if (action === 'exit') {
                onStopGame();
              }
            }}
            leaderboardData={leaderboardScores}
            loadingLeaderboard={loadingLeaderboard}
            leaderboardError={leaderboardError}
            currentPlayerName={playerName}
            scoreSubmitted={scoreSubmitted}
            submittedRank={submittedRank}
            isSubmittingScore={isSubmittingScore}
            submissionError={leaderboardError}
            onSubmitScore={handleSubmitScore}
            isEventPreview={isEventPreview}
            isEventTest={isEventTest}
          />
        </div>
      )}
    </div>
  );
};
