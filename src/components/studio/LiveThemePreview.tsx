import React, { useEffect, useRef, useState, useCallback } from 'react';
import { GameTheme, ThemeDropItem } from '../../themes/types';
import { soundManager } from '../../game/systems/SoundManager';
import {
  GameLayoutConfig,
  LayoutElementKey,
  LAYOUT_ELEMENT_KEYS,
  LAYOUT_ELEMENTS_META,
  DEFAULT_GAME_LAYOUT,
  normalizeGameLayout,
} from '../../themes/layout';
import {
  Volume2,
  VolumeX,
  RotateCcw,
  Sparkles,
  Gamepad2,
  Flame,
  Star,
  Move,
  Maximize2,
  Eye,
  EyeOff,
  Image as ImageIcon,
  Trophy,
  Timer as TimerIcon,
  Type,
  Megaphone,
} from 'lucide-react';

interface LiveThemePreviewProps {
  theme: GameTheme;
  onTriggerItemDrop?: (item: ThemeDropItem) => void;
  className?: string;
  editableLayout?: boolean;
  selectedElementKey?: LayoutElementKey | null;
  onSelectElementKey?: (key: LayoutElementKey) => void;
  onUpdateLayout?: (newLayout: GameLayoutConfig) => void;
}

interface SimulatedItem {
  id: string;
  config: ThemeDropItem;
  x: number;
  y: number;
  speed: number;
  rotation: number;
  rotSpeed: number;
  radius: number;
  collected: boolean;
}

interface SimulatedParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  alpha: number;
  size: number;
  color: string;
  life: number;
  maxLife: number;
}

interface DragState {
  isDragging: boolean;
  isResizing: boolean;
  elementKey: LayoutElementKey;
  startPointerX: number;
  startPointerY: number;
  startX: number;
  startY: number;
  startWidth: number;
}

export const LiveThemePreview: React.FC<LiveThemePreviewProps> = ({
  theme,
  className = '',
  editableLayout = false,
  selectedElementKey = null,
  onSelectElementKey,
  onUpdateLayout,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);

  const [isPlaying] = useState<boolean>(true);
  const [isInteractive, setIsInteractive] = useState<boolean>(false);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [score, setScore] = useState<number>(0);
  const [timeRemaining, setTimeRemaining] = useState<number>(
    theme.physics_config?.gameDurationSeconds || 20
  );
  const [currentStageName, setCurrentStageName] = useState<string>('Stage 1: Calm');

  // Dragging and resizing state for layout elements
  const [dragState, setDragState] = useState<DragState | null>(null);

  // Normalized layout
  const layout: GameLayoutConfig = normalizeGameLayout(theme.layout);

  // Simulation physics state refs
  const simState = useRef({
    basketX: 512,
    basketTargetX: 512,
    items: [] as SimulatedItem[],
    particles: [] as SimulatedParticle[],
    lastSpawnTime: 0,
    timeElapsed: 0,
    redFlashAlpha: 0,
    basketBounce: 0,
    score: 0,
    caughtCount: 0,
    timeRemaining: theme.physics_config?.gameDurationSeconds || 20,
    cachedImages: new Map<string, HTMLImageElement>(),
  });

  // Preload and cache images for canvas drawing
  const getOrLoadImage = useCallback((url: string | null | undefined): HTMLImageElement | null => {
    if (!url) return null;
    const cache = simState.current.cachedImages;
    if (cache.has(url)) {
      const img = cache.get(url)!;
      return img.complete && img.naturalWidth > 0 ? img : null;
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = url;
    cache.set(url, img);
    return null;
  }, []);

  // Helper to trigger instant item drop from outside or debug button
  const dropItemInstantly = useCallback(
    (customItem?: ThemeDropItem) => {
      const items = (theme.items_config || []).filter((i) => i.enabled);
      const targetItem = customItem || items[Math.floor(Math.random() * items.length)];
      if (!targetItem) return;

      const baseSpeed = 380;
      const speedMult = theme.physics_config?.fallSpeedMultiplier || 0.7;
      const itemSpeedMult = targetItem.speedMultiplier || 1.0;
      const finalSpeed = baseSpeed * speedMult * itemSpeedMult;

      const newItem: SimulatedItem = {
        id: `sim_${Date.now()}_${Math.random()}`,
        config: targetItem,
        x: Math.random() * 800 + 112,
        y: -30,
        speed: finalSpeed,
        rotation: 0,
        rotSpeed: (Math.random() - 0.5) * 4,
        radius: 26,
        collected: false,
      };

      simState.current.items.push(newItem);
    },
    [theme]
  );

  // Reset simulation
  const handleResetSimulation = useCallback(() => {
    simState.current.items = [];
    simState.current.particles = [];
    simState.current.score = 0;
    simState.current.caughtCount = 0;
    simState.current.timeElapsed = 0;
    simState.current.timeRemaining = theme.physics_config?.gameDurationSeconds || 20;
    simState.current.basketX = 512;
    simState.current.basketTargetX = 512;
    simState.current.redFlashAlpha = 0;
    simState.current.basketBounce = 0;

    setScore(0);
    setTimeRemaining(theme.physics_config?.gameDurationSeconds || 20);
    setCurrentStageName('Stage 1: Calm');
  }, [theme]);

  // Reset when theme duration changes
  useEffect(() => {
    handleResetSimulation();
  }, [theme.id, theme.physics_config?.gameDurationSeconds, handleResetSimulation]);

  // Main 60 FPS Canvas Simulation Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let lastTime = performance.now();

    const V_WIDTH = 1024;
    const V_HEIGHT = 576;

    const render = (now: number) => {
      const dt = Math.min((now - lastTime) / 1000, 0.1);
      lastTime = now;

      const state = simState.current;

      if (isPlaying) {
        state.timeElapsed += dt;
        const duration = theme.physics_config?.gameDurationSeconds || 20;
        const remaining = Math.max(0, Math.ceil(duration - state.timeElapsed));
        state.timeRemaining = remaining;
        setTimeRemaining(remaining);

        // Determine stage
        const stages = theme.physics_config?.difficultyStages || [];
        let curStage = stages[0] || { stageName: 'Stage 1: Calm' };
        for (const st of stages) {
          if (state.timeElapsed >= st.timeThreshold) {
            curStage = st;
          }
        }
        setCurrentStageName(curStage.stageName || 'Stage 1');

        // Red flash decay
        if (state.redFlashAlpha > 0) {
          state.redFlashAlpha = Math.max(0, state.redFlashAlpha - dt * 2.5);
        }

        // Basket bounce decay
        if (state.basketBounce > 0) {
          state.basketBounce = Math.max(0, state.basketBounce - dt * 8);
        }

        // AI Basket movement in non-interactive mode
        if (!isInteractive) {
          const nearestGood = state.items
            .filter((i) => !i.collected && !i.config.isHazard && i.y > 100)
            .sort((a, b) => b.y - a.y)[0];

          if (nearestGood) {
            state.basketTargetX = nearestGood.x;
          } else {
            state.basketTargetX = 512 + Math.sin(state.timeElapsed * 1.5) * 220;
          }
        }

        // Smooth basket interpolation
        const basketSpeed = theme.basket_config?.speed || 550;
        const lerpFactor = Math.min(1, (basketSpeed / 60) * dt * 0.15);
        state.basketX += (state.basketTargetX - state.basketX) * lerpFactor;
        state.basketX = Math.max(90, Math.min(V_WIDTH - 90, state.basketX));

        // Spawning logic
        const spawnInterval = curStage.spawnInterval || 800;
        if (now - state.lastSpawnTime > spawnInterval) {
          state.lastSpawnTime = now;
          const enabledItems = (theme.items_config || []).filter((i) => i.enabled);
          if (enabledItems.length > 0) {
            const totalWeight = enabledItems.reduce((acc, item) => acc + (item.spawnWeight || 10), 0);
            let rnd = Math.random() * totalWeight;
            let chosen = enabledItems[0];
            for (const item of enabledItems) {
              rnd -= item.spawnWeight || 10;
              if (rnd <= 0) {
                chosen = item;
                break;
              }
            }

            const baseSpeed = curStage.speedMin || 350;
            const speedVariation = ((curStage.speedMax || 500) - baseSpeed) * Math.random();
            const globalMultiplier = theme.physics_config?.fallSpeedMultiplier || 0.7;
            const itemMult = chosen.speedMultiplier || 1.0;
            const finalSpeed = (baseSpeed + speedVariation) * globalMultiplier * itemMult;

            state.items.push({
              id: `item_${Date.now()}_${Math.random()}`,
              config: chosen,
              x: Math.random() * (V_WIDTH - 200) + 100,
              y: -40,
              speed: finalSpeed,
              rotation: 0,
              rotSpeed: (Math.random() - 0.5) * 3,
              radius: 28,
              collected: false,
            });
          }
        }

        // Update items and collisions
        const basketY = V_HEIGHT - 65;
        const basketW = theme.basket_config?.width || 140;
        const basketH = theme.basket_config?.height || 70;
        const catchRatio = theme.basket_config?.catchAreaRatio || 0.8;
        const catchHalfW = (basketW * catchRatio) / 2;

        for (let i = state.items.length - 1; i >= 0; i--) {
          const item = state.items[i];
          item.y += item.speed * dt;
          item.rotation += item.rotSpeed * dt;

          // Check Catch Collision
          if (
            !item.collected &&
            item.y >= basketY - basketH / 2 - 10 &&
            item.y <= basketY + basketH / 2 &&
            Math.abs(item.x - state.basketX) <= catchHalfW + item.radius * 0.4
          ) {
            item.collected = true;
            state.score = Math.max(0, state.score + item.config.points);
            state.caughtCount++;
            setScore(state.score);
            state.basketBounce = 1.0;

            if (item.config.isHazard) {
              state.redFlashAlpha = 0.45;
              if (!isMuted) soundManager.playOrangeCatch();
            } else if (item.config.isBonus) {
              if (!isMuted) soundManager.playGoldenCatch();
            } else {
              if (!isMuted) soundManager.playGreenCatch();
            }

            // Spawn catch burst particles
            const pCount = item.config.isHazard ? 12 : item.config.isBonus ? 20 : 10;
            const pColor = item.config.isHazard
              ? '#ef4444'
              : item.config.isBonus
              ? '#facc15'
              : theme.visuals_config?.primaryColor || '#10b981';

            for (let p = 0; p < pCount; p++) {
              const angle = Math.random() * Math.PI * 2;
              const speed = Math.random() * 200 + 80;
              state.particles.push({
                x: item.x,
                y: item.y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed - 60,
                alpha: 1,
                size: Math.random() * 5 + 3,
                color: pColor,
                life: 0,
                maxLife: Math.random() * 0.4 + 0.3,
              });
            }
          }

          // Remove out of bounds or collected
          if (item.y > V_HEIGHT + 60 || item.collected) {
            state.items.splice(i, 1);
          }
        }

        // Update particles
        for (let i = state.particles.length - 1; i >= 0; i--) {
          const p = state.particles[i];
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.vy += 350 * dt; // gravity
          p.life += dt;
          p.alpha = Math.max(0, 1 - p.life / p.maxLife);
          if (p.life >= p.maxLife) {
            state.particles.splice(i, 1);
          }
        }
      }

      // ================= DRAWING ROUTINE =================
      ctx.clearRect(0, 0, V_WIDTH, V_HEIGHT);

      // Background
      const bgImg = getOrLoadImage(theme.background_url || theme.background);
      if (bgImg) {
        ctx.drawImage(bgImg, 0, 0, V_WIDTH, V_HEIGHT);
      } else {
        // Fallback gradient background
        const grad = ctx.createLinearGradient(0, 0, 0, V_HEIGHT);
        grad.addColorStop(0, theme.visuals_config?.bgGradientFrom || '#064e3b');
        grad.addColorStop(1, theme.visuals_config?.bgGradientTo || '#022c22');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, V_WIDTH, V_HEIGHT);
      }

      // Draw Items
      for (const item of state.items) {
        ctx.save();
        ctx.translate(item.x, item.y);
        ctx.rotate(item.rotation);

        const itemImg = getOrLoadImage(item.config.imageUrl);
        if (itemImg) {
          const s = item.radius * 2;
          ctx.drawImage(itemImg, -s / 2, -s / 2, s, s);
        } else {
          // Fallback item circle
          ctx.beginPath();
          ctx.arc(0, 0, item.radius, 0, Math.PI * 2);
          ctx.fillStyle = item.config.isHazard
            ? '#ef4444'
            : item.config.isBonus
            ? '#facc15'
            : theme.visuals_config?.primaryColor || '#10b981';
          ctx.fill();
          ctx.lineWidth = 3;
          ctx.strokeStyle = '#ffffff';
          ctx.stroke();
        }

        ctx.restore();
      }

      // Draw Particles
      for (const p of state.particles) {
        ctx.save();
        ctx.globalAlpha = p.alpha;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // Draw Basket / Catcher
      const basketY = V_HEIGHT - 65;
      const basketW = theme.basket_config?.width || 140;
      const basketH = theme.basket_config?.height || 70;
      const bounceScale = 1 + state.basketBounce * 0.18;

      ctx.save();
      ctx.translate(state.basketX, basketY);
      ctx.scale(bounceScale, 2 - bounceScale);

      const basketImg = getOrLoadImage(theme.basket_config?.imageUrl || theme.catcher);
      if (basketImg) {
        ctx.drawImage(basketImg, -basketW / 2, -basketH / 2, basketW, basketH);
      } else {
        // Fallback basket box
        ctx.fillStyle = theme.visuals_config?.secondaryColor || '#f59e0b';
        ctx.beginPath();
        ctx.roundRect(-basketW / 2, -basketH / 2, basketW, basketH, 12);
        ctx.fill();
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();
      }

      ctx.restore();

      // Red Flash
      if (state.redFlashAlpha > 0) {
        ctx.fillStyle = `rgba(239, 68, 68, ${state.redFlashAlpha})`;
        ctx.fillRect(0, 0, V_WIDTH, V_HEIGHT);
      }

      animationFrameId = requestAnimationFrame(render);
    };

    animationFrameId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [isPlaying, isInteractive, isMuted, theme, getOrLoadImage]);

  // Interactive basket movement via pointer
  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isInteractive || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const scaleX = 1024 / rect.width;
    const mouseX = (e.clientX - rect.left) * scaleX;
    simState.current.basketTargetX = mouseX;
  };

  // ================= DRAG & RESIZE HANDLERS FOR LAYOUT ELEMENTS =================
  const handleElementPointerDown = (
    key: LayoutElementKey,
    isResize: boolean,
    e: React.PointerEvent<HTMLDivElement>
  ) => {
    if (!editableLayout) return;
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);

    onSelectElementKey?.(key);

    const elem = layout[key] || DEFAULT_GAME_LAYOUT[key];
    const meta = LAYOUT_ELEMENTS_META[key];

    setDragState({
      isDragging: !isResize,
      isResizing: isResize,
      elementKey: key,
      startPointerX: e.clientX,
      startPointerY: e.clientY,
      startX: elem.x,
      startY: elem.y,
      startWidth: elem.width || meta.defaultWidth,
    });
  };

  const handleContainerPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragState || !viewportRef.current || !editableLayout) return;
    e.preventDefault();

    const rect = viewportRef.current.getBoundingClientRect();
    const deltaXPercent = ((e.clientX - dragState.startPointerX) / rect.width) * 100;
    const deltaYPercent = ((e.clientY - dragState.startPointerY) / rect.height) * 100;

    const key = dragState.elementKey;
    const meta = LAYOUT_ELEMENTS_META[key];
    const currentElem = layout[key] || DEFAULT_GAME_LAYOUT[key];

    if (dragState.isDragging) {
      const elemWidth = currentElem.width || meta.defaultWidth;
      const newX = Math.max(0, Math.min(100 - elemWidth, dragState.startX + deltaXPercent));
      const newY = Math.max(0, Math.min(95, dragState.startY + deltaYPercent));

      const nextLayout: GameLayoutConfig = {
        ...layout,
        [key]: {
          ...currentElem,
          x: Math.round(newX * 10) / 10,
          y: Math.round(newY * 10) / 10,
        },
      };
      onUpdateLayout?.(nextLayout);
    } else if (dragState.isResizing) {
      const newWidth = Math.max(
        meta.minWidth,
        Math.min(meta.maxWidth, dragState.startWidth + deltaXPercent)
      );

      const nextLayout: GameLayoutConfig = {
        ...layout,
        [key]: {
          ...currentElem,
          width: Math.round(newWidth * 10) / 10,
        },
      };
      onUpdateLayout?.(nextLayout);
    }
  };

  const handleContainerPointerUp = (e?: React.PointerEvent<HTMLDivElement>) => {
    if (dragState) {
      e?.preventDefault();
      setDragState(null);
    }
  };

  // Helper to render individual UI element overlay inside the 16:9 canvas
  const renderLayoutElementOverlay = (key: LayoutElementKey) => {
    const meta = LAYOUT_ELEMENTS_META[key];
    const elem = layout[key] || DEFAULT_GAME_LAYOUT[key];
    const isSelected = selectedElementKey === key;
    const isVisible = elem.visible;
    const widthPercent = elem.width || meta.defaultWidth;

    // If not in edit mode and invisible, don't render
    if (!editableLayout && !isVisible) return null;

    const logoUrl =
      theme.branding?.clientLogoUrl ||
      theme.clientLogo ||
      theme.branding?.logoUrl ||
      theme.logo ||
      '/assets/basket.png';

    const getElementContent = () => {
      switch (key) {
        case 'clientLogo':
          return (
            <div className="w-full h-full flex items-center justify-center p-1 pointer-events-none select-none">
              <img
                src={logoUrl}
                alt="Client Logo"
                draggable={false}
                className="max-h-12 w-full object-contain drop-shadow pointer-events-none select-none"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = 'none';
                }}
              />
            </div>
          );
        case 'scoreHud':
          return (
            <div className="w-full bg-slate-950/85 backdrop-blur-sm border border-slate-700/80 rounded-xl px-2.5 py-1.5 shadow-md flex items-center justify-between text-xs font-mono font-black pointer-events-none select-none">
              <span className="text-slate-400 flex items-center gap-1">
                <Trophy className="w-3 h-3 text-amber-400" /> SCORE
              </span>
              <span style={{ color: theme.branding?.hudColor || '#c8e038' }} className="ml-2 text-sm font-bold">
                {score}
              </span>
            </div>
          );
        case 'timer':
          return (
            <div className="w-full bg-slate-950/85 backdrop-blur-sm border border-slate-700/80 rounded-xl px-2.5 py-1.5 shadow-md flex items-center justify-between text-xs font-mono font-black pointer-events-none select-none">
              <span className="text-slate-400 flex items-center gap-1">
                <TimerIcon className="w-3 h-3 text-teal-400" /> TIME
              </span>
              <span className="ml-2 text-sm font-bold text-amber-400">{timeRemaining}s</span>
            </div>
          );
        case 'gameTitle':
          return (
            <div className="w-full bg-slate-950/80 backdrop-blur-sm border border-slate-700/80 rounded-xl px-2.5 py-1 shadow-md text-center pointer-events-none select-none">
              <div
                style={{ color: theme.visuals_config?.accentColor || '#10b981' }}
                className="font-black text-xs uppercase tracking-wider truncate"
              >
                {theme.branding?.gameTitle || theme.gameTitle || theme.name}
              </div>
              <div className="text-[9px] text-slate-400 font-sans truncate">
                {currentStageName}
              </div>
            </div>
          );
        case 'footerSponsor':
          return (
            <div className="w-full bg-slate-950/80 backdrop-blur-sm border border-slate-700/80 rounded-full px-3 py-1 shadow-md text-center flex items-center justify-center gap-1.5 pointer-events-none select-none">
              <Megaphone className="w-3 h-3 text-amber-400 shrink-0" />
              <span className="text-[10px] text-slate-300 font-sans truncate">
                {theme.branding?.subtitle || theme.subtitle || 'Official Event Arcade Challenge'}
              </span>
            </div>
          );
        default:
          return null;
      }
    };

    return (
      <div
        key={key}
        style={{
          position: 'absolute',
          left: `${elem.x}%`,
          top: `${elem.y}%`,
          width: `${widthPercent}%`,
          zIndex: isSelected ? 40 : 20,
          touchAction: 'none',
        }}
        onClick={(e) => {
          if (editableLayout) {
            e.stopPropagation();
            onSelectElementKey?.(key);
          }
        }}
        onPointerDown={(e) => handleElementPointerDown(key, false, e)}
        className={`transition-shadow select-none group/elem ${
          editableLayout
            ? `cursor-move touch-none ${
                isSelected
                  ? 'ring-2 ring-amber-400 ring-offset-2 ring-offset-slate-950 rounded-xl shadow-2xl'
                  : 'hover:ring-1 hover:ring-slate-400/60 rounded-xl'
              } ${!isVisible ? 'opacity-40 border border-dashed border-rose-400/70' : ''}`
            : 'pointer-events-none'
        }`}
      >
        {/* Render Element Body */}
        {getElementContent()}

        {/* Studio Edit Mode Badges and Resize Handles */}
        {editableLayout && isSelected && (
          <>
            {/* Top Selection Label Tag */}
            <div className="absolute -top-5 left-0 bg-amber-500 text-slate-950 px-1.5 py-0.2 rounded text-[9px] font-mono font-black shadow pointer-events-none whitespace-nowrap z-50 flex items-center gap-1">
              <Move className="w-2.5 h-2.5" />
              <span>{meta.shortName}</span>
              <span>({Math.round(elem.x)}%, {Math.round(elem.y)}%)</span>
            </div>

            {/* Right Resize Handle */}
            <div
              onPointerDown={(e) => handleElementPointerDown(key, true, e)}
              className="absolute -right-2 top-1/2 -translate-y-1/2 w-4 h-6 bg-amber-400 hover:bg-amber-300 border border-slate-900 rounded cursor-ew-resize flex items-center justify-center shadow-lg z-50 transition-transform active:scale-110"
              title="Drag to resize width"
            >
              <div className="w-0.5 h-3 bg-slate-950 rounded-full" />
            </div>
          </>
        )}
      </div>
    );
  };

  return (
    <div
      ref={containerRef}
      className={`bg-slate-900 border border-slate-800 rounded-3xl p-4 sm:p-5 shadow-2xl flex flex-col gap-3 relative overflow-hidden ${className}`}
    >
      {/* Header bar */}
      <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
          <h2 className="text-xs font-black tracking-wider uppercase text-slate-200 flex items-center gap-1.5">
            <Gamepad2 className="w-3.5 h-3.5 text-amber-400" />
            {editableLayout ? 'Interactive Layout Simulation' : 'Live Game Simulation'}
          </h2>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setIsInteractive(!isInteractive)}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1 transition-all ${
              isInteractive
                ? 'bg-amber-500 text-slate-950 shadow-md ring-1 ring-amber-400'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
            title="Toggle between Interactive Player Control and Auto-Attract Simulation"
          >
            <Gamepad2 className="w-3 h-3" />
            <span>{isInteractive ? 'Testing (Interactive)' : 'Auto Demo'}</span>
          </button>

          <button
            onClick={() => setIsMuted(!isMuted)}
            className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors"
            title={isMuted ? 'Unmute preview sounds' : 'Mute preview sounds'}
          >
            {isMuted ? (
              <VolumeX className="w-3.5 h-3.5 text-slate-500" />
            ) : (
              <Volume2 className="w-3.5 h-3.5 text-emerald-400" />
            )}
          </button>

          <button
            onClick={handleResetSimulation}
            className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors"
            title="Restart simulation"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Main 16:9 Canvas Viewport with Layout Overlays */}
      <div
        ref={viewportRef}
        onPointerMove={handleContainerPointerMove}
        onPointerUp={handleContainerPointerUp}
        onPointerCancel={handleContainerPointerUp}
        className="relative aspect-[16/9] w-full rounded-2xl overflow-hidden bg-slate-950 border border-slate-800 shadow-inner group select-none"
      >
        <canvas
          ref={canvasRef}
          width={1024}
          height={576}
          onPointerMove={handlePointerMove}
          className={`w-full h-full object-contain ${
            isInteractive ? 'cursor-ew-resize' : 'cursor-default'
          }`}
        />

        {/* RESPONSIVE LAYOUT ELEMENTS OVERLAYS */}
        {LAYOUT_ELEMENT_KEYS.map((k) => renderLayoutElementOverlay(k))}

        {isInteractive && (
          <div className="absolute bottom-2 inset-x-0 mx-auto w-fit bg-amber-500/90 text-slate-950 px-3 py-1 rounded-full text-[11px] font-extrabold shadow-lg pointer-events-none animate-bounce z-30">
            Move mouse / finger horizontally across canvas to catch items!
          </div>
        )}
      </div>

      {/* Quick Drop Item Tester Palette */}
      <div className="space-y-1.5 pt-1">
        <div className="flex items-center justify-between text-[11px] text-slate-400">
          <span className="font-semibold flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-amber-400" /> Instant Item Drop Tester
          </span>
          <span>Click to spawn item</span>
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          {(theme.items_config || []).map((item, idx) => (
            <button
              key={item.id || idx}
              onClick={() => dropItemInstantly(item)}
              className={`px-2.5 py-1 rounded-xl text-xs font-bold shrink-0 flex items-center gap-1.5 border transition-all ${
                item.isHazard
                  ? 'bg-rose-500/10 border-rose-500/30 text-rose-300 hover:bg-rose-500/20'
                  : item.isBonus
                  ? 'bg-amber-500/10 border-amber-500/30 text-amber-300 hover:bg-amber-500/20'
                  : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/20'
              }`}
            >
              {item.isHazard ? (
                <Flame className="w-3 h-3 text-rose-400" />
              ) : item.isBonus ? (
                <Star className="w-3 h-3 text-amber-400" />
              ) : (
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
              )}
              <span className="truncate max-w-[90px]">{item.name}</span>
              <span className="text-[10px] opacity-75">
                ({item.points > 0 ? `+${item.points}` : item.points})
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
