import React, { useState, useRef, useEffect } from 'react';
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
  Palette,
  Check,
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
import { GameTheme, THEME_REGISTRY, getActiveTheme } from '../themes';
import { normalizeGameLayout, GameLayoutConfig, DESIGN_WIDTH, DESIGN_HEIGHT, useGameUiScale } from '../themes/layout';
import { apiFetch } from '../lib/api';

interface ArcadeUIProps {
  gameState: GameState;
  stats: GameStats;
  countdownText: string | number;
  eventId?: string;
  publicToken?: string;
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
  onSelectTheme: (themeId: string) => void;
}

export const ArcadeUI: React.FC<ArcadeUIProps> = ({
  gameState,
  stats,
  countdownText,
  eventId,
  publicToken,
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
  onSelectTheme,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const uiScale = useGameUiScale(containerRef);

  const [showGuideModal, setShowGuideModal] = useState(false);
  const [showStopConfirm, setShowStopConfirm] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showLeaderboardModal, setShowLeaderboardModal] = useState(false);

  // High Score / Leaderboard State
  const [playerName, setPlayerName] = useState<string>(() => {
    return localStorage.getItem('event_player_name') || '';
  });
  const [isSubmittingScore, setIsSubmittingScore] = useState(false);
  const [scoreSubmitted, setScoreSubmitted] = useState(false);
  const [submittedRank, setSubmittedRank] = useState<number | null>(null);
  const [submittedScoreId, setSubmittedScoreId] = useState<string | null>(null);
  const [leaderboardScores, setLeaderboardScores] = useState<EventLeaderboardEntry[]>([]);
  const [loadingLeaderboard, setLoadingLeaderboard] = useState(false);
  const [leaderboardError, setLeaderboardError] = useState<string | null>(null);
  const [gameOverTab, setGameOverTab] = useState<'summary' | 'leaderboard'>('summary');

  const layout: GameLayoutConfig = normalizeGameLayout(activeTheme?.layout);

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
    '/assets/durian_green.png';

  const badItemImg =
    activeTheme?.badFallingObject ||
    badItem?.imageUrl ||
    '/assets/durian_brown.png';

  // Fetch Event Leaderboard
  const fetchEventLeaderboard = async () => {
    if (!publicToken && !eventId) return;
    setLoadingLeaderboard(true);
    setLeaderboardError(null);
    try {
      const url = publicToken
        ? `/api/public/events/${publicToken}/high-scores?limit=50`
        : `/api/events/${eventId}/high-scores?limit=50`;
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
  }, [gameState, eventId, publicToken]);

  // Load leaderboard when modal opens
  useEffect(() => {
    if (showLeaderboardModal) {
      fetchEventLeaderboard();
    }
  }, [showLeaderboardModal, eventId, publicToken]);

  // Handle high score submission
  const handleSubmitScore = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (isSubmittingScore || scoreSubmitted) return;

    const trimmedName = playerName.trim() || 'Player';
    localStorage.setItem('event_player_name', trimmedName);
    setIsSubmittingScore(true);
    setLeaderboardError(null);

    try {
      const url = publicToken
        ? `/api/public/events/${publicToken}/high-scores`
        : `/api/events/${eventId}/high-scores`;

      const res = await apiFetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          player_name: trimmedName,
          score: stats.score,
          metadata: {
            greenCaught: stats.greenCaught,
            orangeCaught: stats.orangeCaught,
            duriansMissed: stats.duriansMissed,
          },
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to submit score');
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
      setLeaderboardError(err.message || 'Failed to save score to leaderboard.');
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

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 w-full h-full pointer-events-none select-none overflow-hidden font-mono z-30"
      style={{ '--game-ui-scale': uiScale } as React.CSSProperties}
    >
      {/* LOGICAL 1024x576 RESPONSIVE UI LAYER */}
      <div
        className="game-ui-layer pointer-events-none select-none overflow-hidden"
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          width: `${DESIGN_WIDTH}px`,
          height: `${DESIGN_HEIGHT}px`,
          minWidth: `${DESIGN_WIDTH}px`,
          minHeight: `${DESIGN_HEIGHT}px`,
          maxWidth: `${DESIGN_WIDTH}px`,
          maxHeight: `${DESIGN_HEIGHT}px`,
          transform: `translate(-50%, -50%) scale(${uiScale})`,
          transformOrigin: 'center center',
        }}
      >
        {/* Top Right Persistent Controls */}
        {gameState !== 'PLAYING' && gameState !== 'PAUSED' && (
          <div className="absolute top-4 right-4 z-50 pointer-events-auto flex items-center gap-2">
            <button
              onClick={() => setShowSettingsModal(true)}
              className="p-2.5 rounded-xl bg-[#0f2d18]/90 border-2 border-[#d4e157] hover:border-[#ffee58] text-[#ffee58] shadow-lg transition-all"
              title="Game Settings & Themes"
            >
              <Settings className="w-4 h-4" />
            </button>
            <button
              onClick={onToggleMute}
              className="p-2.5 rounded-xl bg-[#0f2d18]/90 border-2 border-[#d4e157] hover:border-[#ffee58] text-[#ffee58] shadow-lg transition-all"
              title={isMuted ? 'Unmute Sound' : 'Mute Sound'}
            >
              {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>
            <button
              onClick={onToggleFullscreen}
              className="p-2.5 rounded-xl bg-[#0f2d18]/90 border-2 border-[#d4e157] hover:border-[#ffee58] text-[#ffee58] shadow-lg transition-all flex items-center justify-center font-black"
              title={isFullscreen ? 'Exit Fullscreen (⛶)' : 'Toggle Fullscreen (⛶)'}
            >
              <span className="text-base leading-none font-bold">⛶</span>
            </button>
          </div>
        )}

        {/* ================= IN-GAME DYNAMIC LAYOUT HUD ================= */}
        {(gameState === 'PLAYING' || gameState === 'PAUSED') && (
          <>
            {/* Top Right In-Game Controls Dock */}
            <div className="absolute top-3 right-3 z-50 pointer-events-auto flex items-center gap-1.5 bg-slate-950/85 backdrop-blur-sm p-1.5 rounded-xl border border-slate-700/80 shadow-lg">
              <button
                onClick={() => setShowSettingsModal(true)}
                className="p-1.5 rounded-lg bg-[#0c2012]/90 border border-[#b2c833] text-[#c8e038] hover:bg-[#1a3820] transition-all"
                title="Game Settings & Themes"
              >
                <Settings className="w-3.5 h-3.5" />
              </button>

              <button
                onClick={onToggleMute}
                className="p-1.5 rounded-lg bg-[#0c2012]/90 border border-[#b2c833] text-[#c8e038] hover:bg-[#1a3820] transition-all"
                title={isMuted ? 'Unmute Sound' : 'Mute Sound'}
              >
                {isMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5 text-emerald-400" />}
              </button>

              {gameState === 'PLAYING' ? (
                <button
                  onClick={onPauseGame}
                  className="p-1.5 rounded-lg bg-[#0c2012]/90 border border-[#b2c833] text-[#c8e038] hover:bg-[#1a3820] transition-all"
                  title="Pause Game"
                >
                  <Pause className="w-3.5 h-3.5" />
                </button>
              ) : (
                <button
                  onClick={onResumeGame}
                  className="p-1.5 rounded-lg bg-[#c8e038] text-[#0c2012] border border-[#b2c833] font-bold transition-all"
                  title="Resume Game"
                >
                  <Play className="w-3.5 h-3.5" />
                </button>
              )}

              <button
                onClick={handleRequestStop}
                className="p-1.5 rounded-lg bg-[#0c2012]/90 border border-rose-500/80 text-rose-400 hover:bg-rose-950 transition-all flex items-center justify-center"
                title="Stop Game / Return to Main Menu"
              >
                <Square className="w-3.5 h-3.5 fill-rose-400" />
              </button>

              <button
                onClick={onToggleFullscreen}
                className="p-1.5 rounded-lg bg-[#0c2012]/90 border border-[#b2c833] text-[#c8e038] hover:bg-[#1a3820] transition-all font-mono text-xs font-bold"
                title={isFullscreen ? 'Exit Fullscreen' : 'Toggle Fullscreen'}
              >
                ⛶
              </button>
            </div>

            {/* 1. Client Logo Element */}
            {layout.clientLogo?.visible && clientLogoUrl && (
              <div
                style={{
                  position: 'absolute',
                  left: `${layout.clientLogo.x}%`,
                  top: `${layout.clientLogo.y}%`,
                  width: `${layout.clientLogo.width || 14}%`,
                  zIndex: 35,
                }}
                className="pointer-events-none transition-all flex items-center justify-center"
              >
                <img
                  src={clientLogoUrl}
                  alt="Client Logo"
                  className="max-h-12 w-full object-contain drop-shadow"
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = 'none';
                  }}
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
                    <Trophy className="w-3.5 h-3.5 text-amber-400" /> SCORE
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

            {/* 3. Timer Element */}
            {layout.timer?.visible && (
              <div
                style={{
                  position: 'absolute',
                  left: `${layout.timer.x}%`,
                  top: `${layout.timer.y}%`,
                  width: `${layout.timer.width || 18}%`,
                  zIndex: 35,
                }}
                className="pointer-events-none transition-all"
              >
                <div className="bg-[#0c2012]/85 backdrop-blur-sm border-2 border-[#b2c833] rounded-2xl px-3.5 py-1.5 shadow-lg text-white flex items-center justify-between">
                  <span className="text-xs sm:text-sm font-mono font-bold text-slate-300 flex items-center gap-1">
                    <Timer className="w-3.5 h-3.5 text-teal-400" /> TIME
                  </span>
                  <span className="text-base sm:text-lg font-mono font-black text-amber-400 ml-2">
                    {stats.timeRemaining}s
                  </span>
                </div>
              </div>
            )}

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

        {/* ================= START SCREEN OVERLAY (MAIN MENU DIALOG) ================= */}
        {gameState === 'START' && (
          <div className="absolute inset-0 bg-slate-950/40 backdrop-blur-xs pointer-events-auto flex flex-col items-center justify-center p-2 sm:p-4 text-center z-40 overflow-hidden">
            <div className="start-dialog-container bg-slate-900 border-2 border-amber-500/80 rounded-2xl p-4 sm:p-6 shadow-2xl relative overflow-hidden my-auto">
              <div className="non-essential-deco absolute -top-12 -left-12 w-32 h-32 bg-emerald-500/20 rounded-full blur-2xl pointer-events-none" />
              <div className="non-essential-deco absolute -bottom-12 -right-12 w-32 h-32 bg-amber-500/20 rounded-full blur-2xl pointer-events-none" />

              <div className="start-dialog-grid">
                {/* TOP AREA: Title & Description */}
                <div className="area-top flex flex-col items-center">
                  <div className="non-essential-deco inline-flex items-center gap-1.5 bg-emerald-950 border border-emerald-500/50 text-emerald-400 text-[11px] sm:text-xs px-2.5 py-0.5 sm:px-3 sm:py-1 rounded-full font-bold mb-2 sm:mb-3 uppercase tracking-wider">
                    <Sparkles className="w-3 h-3 sm:w-3.5 sm:h-3.5" /> RETRO ARCADE ENGINE
                  </div>

                  {/* Client Logo if present */}
                  {(activeTheme.clientLogo || activeTheme.logo) && (
                    <img
                      src={activeTheme.clientLogo || activeTheme.logo}
                      alt="Logo"
                      className="max-h-12 mb-2 object-contain"
                    />
                  )}

                  <h1 className="start-dialog-title font-black text-transparent bg-clip-text bg-gradient-to-r from-amber-300 via-emerald-400 to-amber-200 tracking-wider mb-1.5 sm:mb-2 drop-shadow-md">
                    {gameTitle}
                  </h1>
                  <p className="start-dialog-desc text-slate-300 text-xs sm:text-sm mb-2 sm:mb-4 leading-relaxed">
                    {gameSubtitle}
                  </p>
                </div>

                {/* RULES AREA: Good & Bad Item Cards */}
                <div className="area-rules start-dialog-rules grid grid-cols-2 gap-2 sm:gap-3 my-2 sm:my-3">
                  <div className="start-dialog-rule-card bg-emerald-950/60 border border-emerald-500/40 rounded-xl p-2.5 sm:p-3 flex flex-col items-center justify-center">
                    <div className="start-dialog-rule-icon w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-emerald-800/60 border border-emerald-400 flex items-center justify-center p-1 sm:p-1.5 mb-1 overflow-hidden shrink-0">
                      <img src={goodItemImg} alt={fallingItemName} className="w-full h-full object-contain drop-shadow" />
                    </div>
                    <div className="flex flex-col items-center text-center">
                      <span className="text-emerald-300 font-bold text-xs sm:text-sm whitespace-nowrap">{fallingItemName}</span>
                      <span className="text-emerald-400 font-extrabold text-xs sm:text-base whitespace-nowrap">+10 POINTS</span>
                    </div>
                  </div>

                  <div className="start-dialog-rule-card bg-rose-950/60 border border-rose-500/40 rounded-xl p-2.5 sm:p-3 flex flex-col items-center justify-center">
                    <div className="start-dialog-rule-icon w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-rose-800/60 border border-rose-400 flex items-center justify-center p-1 sm:p-1.5 mb-1 overflow-hidden shrink-0">
                      <img src={badItemImg} alt={badFallingItemName} className="w-full h-full object-contain drop-shadow" />
                    </div>
                    <div className="flex flex-col items-center text-center">
                      <span className="text-rose-300 font-bold text-xs sm:text-sm whitespace-nowrap">{badFallingItemName}</span>
                      <span className="text-rose-400 font-extrabold text-xs sm:text-base whitespace-nowrap">-10 POINTS</span>
                    </div>
                  </div>
                </div>

                {/* START AREA */}
                <div className="area-start w-full">
                  <button
                    onClick={onStartGame}
                    className="start-btn w-full py-3 sm:py-3.5 px-5 sm:px-6 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 font-black text-lg sm:text-xl rounded-xl border-2 border-emerald-300 shadow-[0_0_20px_rgba(16,185,129,0.4)] transition-all transform hover:scale-105 active:scale-95 flex items-center justify-center gap-2"
                  >
                    <Play className="w-5 h-5 sm:w-6 sm:h-6 fill-slate-950" /> START GAME
                  </button>
                </div>

                {/* FOOTER AREA */}
                <div className="area-footer start-dialog-footer w-full flex items-center justify-between pt-2 sm:pt-3 border-t border-slate-800 text-slate-400 text-[11px] sm:text-xs gap-2">
                  <span className="flex items-center gap-1 shrink-0">
                    <kbd className="px-1.5 py-0.5 bg-slate-800 border border-slate-700 rounded text-slate-200 text-[10px]">← →</kbd> /
                    <kbd className="px-1.5 py-0.5 bg-slate-800 border border-slate-700 rounded text-slate-200 text-[10px]">A D</kbd>
                  </span>

                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setShowLeaderboardModal(true)}
                      className="text-amber-400 hover:underline flex items-center gap-1 font-bold"
                    >
                      <Trophy className="w-3.5 h-3.5" /> High Scores
                    </button>

                    <button
                      onClick={() => setShowSettingsModal(true)}
                      className="text-amber-400 hover:underline flex items-center gap-1 font-bold"
                    >
                      <Settings className="w-3.5 h-3.5" /> Settings
                    </button>

                    <button
                      onClick={() => setShowGuideModal(true)}
                      className="text-amber-400 hover:underline flex items-center gap-1 font-bold"
                    >
                      <HelpCircle className="w-3.5 h-3.5" /> Guide
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

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

        {/* ================= GAME OVER OVERLAY ================= */}
        {gameState === 'GAME_OVER' && (
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
                      <span className="text-slate-400 text-[10px] font-bold block uppercase mb-0.5">FINAL SCORE</span>
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
                          <span className="text-slate-400 block text-[10px]">BEST</span>
                          <span className="text-amber-400 font-bold text-xs sm:text-sm">{stats.highScore}</span>
                        </div>
                      </div>
                    </div>

                    {/* Nickname Submission Box */}
                    {!scoreSubmitted ? (
                      <form onSubmit={handleSubmitScore} className="bg-slate-950/80 border border-slate-800 rounded-xl p-2.5 mb-3 text-left">
                        <div className="flex items-center justify-between text-xs text-slate-300 font-bold mb-1.5">
                          <span className="flex items-center gap-1.5 text-amber-400">
                            <Trophy className="w-3.5 h-3.5" /> High Score Submission
                          </span>
                          <span className="text-[10px] text-slate-500 font-mono">Leaderboard</span>
                        </div>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={playerName}
                            onChange={(e) => setPlayerName(e.target.value)}
                            placeholder="Enter your nickname..."
                            maxLength={25}
                            disabled={isSubmittingScore}
                            className="flex-1 bg-slate-900 border border-slate-700 focus:border-amber-400 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-slate-500 outline-none font-mono"
                          />
                          <button
                            type="submit"
                            disabled={isSubmittingScore}
                            className="px-3 py-1.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 disabled:opacity-50 text-slate-950 font-black text-xs rounded-lg transition-all flex items-center gap-1 shrink-0 shadow"
                          >
                            {isSubmittingScore ? 'Saving...' : <><Send className="w-3 h-3" /> SUBMIT</>}
                          </button>
                        </div>
                        {leaderboardError && (
                          <p className="text-rose-400 text-[10px] mt-1 text-left">{leaderboardError}</p>
                        )}
                      </form>
                    ) : (
                      <div className="bg-emerald-950/60 border border-emerald-500/40 rounded-xl p-2 sm:p-2.5 mb-3 flex items-center justify-between text-left">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-emerald-500/20 border border-emerald-400 flex items-center justify-center shrink-0">
                            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                          </div>
                          <div>
                            <span className="text-emerald-300 font-bold text-xs block">Score Recorded!</span>
                            <span className="text-emerald-400 text-[10px]">Ranked #{submittedRank ?? 1} on this Event's Board</span>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setGameOverTab('leaderboard')}
                          className="px-2 py-1 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-[11px] rounded-lg transition-all shrink-0"
                        >
                          View Board
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2.5 pt-1">
                    <button
                      onClick={onRestartGame}
                      className="flex-1 py-2 sm:py-2.5 px-3 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-sm sm:text-base rounded-xl border-2 border-amber-300 shadow-[0_0_15px_rgba(245,158,11,0.3)] transition-all transform hover:scale-105 active:scale-95 flex items-center justify-center gap-1.5"
                    >
                      <RotateCcw className="w-4 h-4 stroke-[3]" /> PLAY AGAIN
                    </button>
                    <button
                      onClick={handleRequestStop}
                      className="py-2 sm:py-2.5 px-3 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs sm:text-sm rounded-xl border border-slate-700 transition-all flex items-center justify-center gap-1.5"
                      title="Return to Main Menu"
                    >
                      <Home className="w-3.5 h-3.5" /> MENU
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
                        <span>Loading Leaderboard...</span>
                      </div>
                    ) : leaderboardScores.length === 0 ? (
                      <div className="py-8 text-center text-slate-400 text-xs">
                        <Trophy className="w-8 h-8 text-slate-600 mx-auto mb-2 opacity-50" />
                        <p className="font-bold text-slate-300">No Scores Yet!</p>
                        <p className="text-[10px] text-slate-500 mt-0.5">Be the first to submit a high score!</p>
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
                      onClick={onRestartGame}
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
                GAME PAUSED
              </h2>

              <div className="space-y-2.5 sm:space-y-3">
                <button
                  onClick={onResumeGame}
                  className="w-full py-2 sm:py-2.5 px-4 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-lg transition-all flex items-center justify-center gap-2"
                >
                  <Play className="w-4 h-4 fill-slate-950" /> RESUME
                </button>

                <button
                  onClick={onRestartGame}
                  className="w-full py-2 sm:py-2.5 px-4 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-bold rounded-lg transition-all flex items-center justify-center gap-2"
                >
                  <RotateCcw className="w-4 h-4" /> RESTART
                </button>

                <button
                  onClick={() => setShowSettingsModal(true)}
                  className="w-full py-2 sm:py-2.5 px-4 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-bold rounded-lg transition-all flex items-center justify-center gap-2"
                >
                  <Settings className="w-4 h-4" /> SETTINGS
                </button>

                <button
                  onClick={handleRequestStop}
                  className="w-full py-2 sm:py-2.5 px-4 bg-rose-950/80 hover:bg-rose-900 border border-rose-500/60 text-rose-200 font-bold rounded-lg transition-all flex items-center justify-center gap-2 text-xs sm:text-sm"
                >
                  <Square className="w-4 h-4 fill-rose-300" /> STOP GAME (MAIN MENU)
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
                STOP GAME?
              </h3>

              <p className="text-xs text-slate-300 mb-6 leading-relaxed">
                Are you sure you want to stop the game and return to the main menu? Your current session progress will be lost.
              </p>

              <div className="flex items-center gap-3">
                <button
                  onClick={() => {
                    setShowStopConfirm(false);
                    onStopGame();
                  }}
                  className="flex-1 py-2.5 px-4 bg-rose-600 hover:bg-rose-500 text-white font-black text-sm rounded-xl border border-rose-400 shadow-md transition-all flex items-center justify-center gap-1.5"
                >
                  <Square className="w-4 h-4 fill-white" /> YES, STOP
                </button>

                <button
                  onClick={() => {
                    setShowStopConfirm(false);
                  }}
                  className="flex-1 py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-sm rounded-xl border border-slate-700 transition-all"
                >
                  CANCEL
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
                  <h4 className="font-bold text-emerald-400 mb-1">🎮 How to Play</h4>
                  <p>Move the catcher horizontally to catch falling {fallingItemName.toLowerCase()}s (+10 points) while avoiding {badFallingItemName.toLowerCase()}s (-10 points).</p>
                </div>

                <div>
                  <h4 className="font-bold text-amber-400 mb-1">⚡ Controls</h4>
                  <ul className="list-disc list-inside space-y-1 text-slate-300">
                    <li><strong>Keyboard:</strong> Left/Right arrow keys or A/D keys</li>
                    <li><strong>Mouse/Touch:</strong> Move cursor or drag finger horizontally across screen</li>
                  </ul>
                </div>

                <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 space-y-2">
                  <h4 className="font-bold text-teal-400">🎨 Multi-Theme System</h4>
                  <p>Add new themes cleanly by creating a configuration object in <code className="text-amber-300">src/themes/</code>:</p>
                  <ul className="list-disc list-inside space-y-1 font-mono text-[11px] text-amber-300">
                    <li><code className="text-slate-200">ACTIVE_THEME_ID</code>: Single configuration value in <code className="text-slate-200">src/themes/registry.ts</code>.</li>
                    <li><code className="text-slate-200">GameTheme interface</code>: Define background, catcher, falling items, titles, and custom sounds.</li>
                    <li><code className="text-slate-200">Fallback Protection</code>: Automatically degrades to default Durian assets if any asset is missing.</li>
                  </ul>
                </div>
              </div>

              <button
                onClick={() => setShowGuideModal(false)}
                className="mt-5 w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-lg"
              >
                Close
              </button>
            </div>
          </div>
        )}

        {/* ================= SETTINGS & THEME SELECTOR MODAL ================= */}
        {showSettingsModal && (
          <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-md pointer-events-auto flex items-center justify-center p-3 sm:p-4 z-50">
            <div className="max-w-md w-full bg-slate-900 border-2 border-amber-500/80 rounded-2xl p-5 sm:p-6 shadow-2xl relative my-auto max-h-[90vh] overflow-y-auto text-slate-100">
              {/* Header */}
              <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <Settings className="w-5 h-5 text-amber-400" />
                  <h3 className="text-xl font-black text-amber-400 tracking-wider">
                    SETTINGS & THEMES
                  </h3>
                </div>
                <button
                  onClick={() => setShowSettingsModal(false)}
                  className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 transition-all"
                  title="Close Settings"
                >
                  ✕
                </button>
              </div>

              {/* Options */}
              <div className="space-y-4 text-xs sm:text-sm">
                {/* THEME SELECTOR */}
                <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3.5 space-y-2.5">
                  <div className="flex justify-between items-center font-bold">
                    <span className="text-slate-200 flex items-center gap-2">
                      <Palette className="w-4 h-4 text-amber-400" /> Select Game Theme
                    </span>
                    <span className="text-amber-400 font-mono font-bold text-xs uppercase bg-amber-950 border border-amber-500/40 px-2 py-0.5 rounded-full">
                      {activeTheme.name}
                    </span>
                  </div>

                  <div className="flex gap-3 overflow-x-auto pb-2 mt-2 [scrollbar-width:thin] [scrollbar-color:rgba(100,116,139,0.5)_transparent] [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-track]:bg-slate-950 [&::-webkit-scrollbar-thumb]:bg-slate-700 [&::-webkit-scrollbar-thumb]:rounded-full">
                    {Object.values(THEME_REGISTRY).map((t) => {
                      const isSelected = t.id === activeTheme.id;
                      return (
                        <button
                          key={t.id}
                          onClick={() => onSelectTheme(t.id)}
                          className={`min-w-[240px] sm:min-w-[260px] flex-shrink-0 p-2.5 rounded-lg border text-left transition-all flex items-center justify-between ${
                            isSelected
                              ? 'bg-amber-500/20 border-amber-400 text-amber-200'
                              : 'bg-slate-900/80 border-slate-800 text-slate-300 hover:border-slate-700 hover:bg-slate-800/80'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 overflow-hidden">
                            <div className="w-7 h-7 rounded-full bg-slate-950 border border-slate-700 flex items-center justify-center p-0.5 shrink-0 overflow-hidden">
                              <img src={t.fallingObject} alt={t.name} className="w-full h-full object-contain" />
                            </div>
                            <div className="truncate">
                              <div className="font-bold text-xs leading-tight truncate">{t.name}</div>
                              <div className="text-[10px] text-slate-400 truncate">{t.gameTitle}</div>
                            </div>
                          </div>

                          {isSelected && <Check className="w-4 h-4 text-amber-400 shrink-0 ml-2" />}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* MASTER VOLUME */}
                <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3.5 space-y-2">
                  <div className="flex justify-between items-center font-bold">
                    <span className="text-slate-200 flex items-center gap-2">
                      <Volume2 className="w-4 h-4 text-emerald-400" /> Master Volume
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
                  className="px-3.5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-bold text-xs rounded-xl border border-slate-700 transition-all"
                >
                  Reset Defaults
                </button>
                <button
                  onClick={() => setShowSettingsModal(false)}
                  className="flex-1 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-sm rounded-xl border border-amber-300 transition-all shadow-md"
                >
                  DONE
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
                      EVENT HIGH SCORES
                    </h3>
                    <p className="text-[10px] text-slate-400">Official Leaderboard Rankings</p>
                  </div>
                </div>

                <button
                  onClick={() => setShowLeaderboardModal(false)}
                  className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-all"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Leaderboard List */}
              <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 my-1 max-h-72">
                {loadingLeaderboard ? (
                  <div className="py-12 text-slate-400 text-xs flex flex-col items-center gap-2">
                    <div className="w-6 h-6 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
                    <span>Loading Event Scores...</span>
                  </div>
                ) : leaderboardScores.length === 0 ? (
                  <div className="py-12 text-center text-slate-400 text-xs">
                    <Trophy className="w-10 h-10 text-slate-600 mx-auto mb-2 opacity-50" />
                    <p className="font-bold text-slate-300">No High Scores Recorded Yet</p>
                    <p className="text-[11px] text-slate-500 mt-1">Play a round to get your name on the board!</p>
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
    </div>
  );
};
