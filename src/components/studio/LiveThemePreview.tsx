import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { GameTheme, ThemeDropItem, isMemoryMatchTheme, getMemoryMatchConfig } from '../../themes';
import { soundManager } from '../../game/systems/SoundManager';

import { createShuffledDeck } from '../../games/memory-match/cardDeck';
import { MemoryCard } from '../../games/memory-match/types';
import { generateRandomCardPositions, CardPosition } from '../../games/memory-match/memoryMatchBoardLayout';
import {
  GameLayoutConfig,
  LayoutElementKey,
  LAYOUT_ELEMENT_KEYS,
  LAYOUT_ELEMENTS_META,
  DEFAULT_GAME_LAYOUT,
  normalizeGameLayout,
  DESIGN_WIDTH,
  DESIGN_HEIGHT,
  useGameUiScale,
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
  Ticket,
  CheckCircle2,
  Grid3X3,
  ShoppingBag,
  Tent,
  PartyPopper,
  Disc,
} from 'lucide-react';

interface LiveThemePreviewProps {
  theme: GameTheme;
  onTriggerItemDrop?: (item: ThemeDropItem) => void;
  className?: string;
  editableLayout?: boolean;
  selectedElementKey?: LayoutElementKey | null;
  onSelectElementKey?: (key: LayoutElementKey) => void;
  onUpdateLayout?: (newLayout: GameLayoutConfig) => void;
  onPlayLiveGame?: () => void;
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
  onPlayLiveGame,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const uiScale = useGameUiScale(viewportRef);

  const [isPlaying] = useState<boolean>(true);
  const [isInteractive, setIsInteractive] = useState<boolean>(false);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [score, setScore] = useState<number>(0);
  const [timeRemaining, setTimeRemaining] = useState<number>(
    theme.physics_config?.gameDurationSeconds || 20
  );
  const [currentStageName, setCurrentStageName] = useState<string>('Stage 1: Calm');

  const isMemoryMatch = isMemoryMatchTheme(theme);
  const memoryConfig = useMemo(() => getMemoryMatchConfig(theme), [theme]);
  const boardConfig = memoryConfig.board;
  const cardConfig = memoryConfig.card || boardConfig.card;
  const cardBorderRadius = cardConfig?.borderRadius ?? 16;
  const cardWidth = cardConfig?.width ?? 120;
  const cardHeight = cardConfig?.height ?? 120;
  const previewGridAspect = (boardConfig.cols * cardWidth) / (boardConfig.rows * cardHeight);

  // Memory match interactive preview state
  const [memoryDeck, setMemoryDeck] = useState<MemoryCard[]>(() => createShuffledDeck(theme));
  const [randomPositions, setRandomPositions] = useState<CardPosition[]>(() =>
    generateRandomCardPositions(createShuffledDeck(theme).length, boardConfig, cardConfig)
  );
  const [memoryFlippedIndices, setMemoryFlippedIndices] = useState<number[]>([]);
  const [matchedPairCount, setMatchedPairCount] = useState<number>(0);

  // Sync memory deck when theme items or branding change
  useEffect(() => {
    if (isMemoryMatch) {
      const nextDeck = createShuffledDeck(theme);
      setMemoryDeck(nextDeck);
      setRandomPositions(generateRandomCardPositions(nextDeck.length, boardConfig, cardConfig));
      setMemoryFlippedIndices([]);
      setMatchedPairCount(0);
    }
  }, [
    theme,
    isMemoryMatch,
    boardConfig.layoutMode,
    boardConfig.rows,
    boardConfig.cols,
    boardConfig.cardGap,
    boardConfig.randomLayout.minSpacing,
    boardConfig.randomLayout.rotationMin,
    boardConfig.randomLayout.rotationMax,
    cardConfig?.width,
    cardConfig?.height,
    cardConfig?.borderRadius,
    cardConfig?.rotationMode,
    cardConfig?.rotation,
    cardConfig?.rotationRange,
  ]);

  const handleCardClick = (index: number) => {
    if (!memoryDeck[index] || memoryDeck[index].isMatched || memoryDeck[index].isFlipped) return;
    if (memoryFlippedIndices.length >= 2) return;

    const nextDeck = [...memoryDeck];
    nextDeck[index] = { ...nextDeck[index], isFlipped: true };
    setMemoryDeck(nextDeck);

    const nextFlipped = [...memoryFlippedIndices, index];
    setMemoryFlippedIndices(nextFlipped);

    if (nextFlipped.length === 2) {
      const [firstIdx, secondIdx] = nextFlipped;
      const firstCard = nextDeck[firstIdx];
      const secondCard = nextDeck[secondIdx];

      if (firstCard.pairId === secondCard.pairId) {
        setTimeout(() => {
          setMemoryDeck((prev) =>
            prev.map((c, i) =>
              i === firstIdx || i === secondIdx ? { ...c, isMatched: true } : c
            )
          );
          setScore((s) => s + (firstCard.points || 100));
          setMatchedPairCount((m) => m + 1);
          setMemoryFlippedIndices([]);
        }, 400);
      } else {
        setTimeout(() => {
          setMemoryDeck((prev) =>
            prev.map((c, i) =>
              i === firstIdx || i === secondIdx ? { ...c, isFlipped: false } : c
            )
          );
          setMemoryFlippedIndices([]);
        }, 800);
      }
    }
  };

  const renderCardIcon = (iconName?: string, className: string = 'w-6 h-6') => {
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
      case 'CheckCircle2':
        return <CheckCircle2 className={className} />;
      case 'Flame':
        return <Flame className={className} />;
      default:
        return <Sparkles className={className} />;
    }
  };

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
      '/logo.png';

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
            <div className="w-full bg-[#0c2012]/85 backdrop-blur-sm border-2 border-[#b2c833] rounded-2xl px-3.5 py-1.5 shadow-lg text-white flex items-center justify-between pointer-events-none select-none">
              <span className="text-xs sm:text-sm font-mono font-bold text-slate-300 flex items-center gap-1">
                <Trophy className="w-3.5 h-3.5 text-amber-400" /> SCORE
              </span>
              <span
                style={{ color: theme.branding?.hudColor || '#c8e038' }}
                className="text-base sm:text-lg font-mono font-black ml-2"
              >
                {score}
              </span>
            </div>
          );
        case 'timer':
          return (
            <div className="w-full bg-[#0c2012]/85 backdrop-blur-sm border-2 border-[#b2c833] rounded-2xl px-3.5 py-1.5 shadow-lg text-white flex items-center justify-between pointer-events-none select-none">
              <span className="text-xs sm:text-sm font-mono font-bold text-slate-300 flex items-center gap-1">
                <TimerIcon className="w-3.5 h-3.5 text-teal-400" /> TIME
              </span>
              <span className="text-base sm:text-lg font-mono font-black text-amber-400 ml-2">
                {timeRemaining}s
              </span>
            </div>
          );
        case 'gameTitle':
          return (
            <div className="w-full bg-slate-950/80 backdrop-blur-sm border border-slate-700/80 rounded-xl px-3 py-1 shadow-md text-center pointer-events-none select-none">
              <div
                style={{ color: theme.branding?.accentColor || theme.visuals_config?.accentColor || '#10b981' }}
                className="font-black text-xs sm:text-sm uppercase tracking-wider truncate"
              >
                {theme.branding?.gameTitle || theme.gameTitle || theme.name}
              </div>
            </div>
          );
        case 'footerSponsor':
          return (
            <div className="w-full bg-slate-950/80 backdrop-blur-sm border border-slate-700/80 rounded-full px-3 py-1 shadow-md text-center flex items-center justify-center gap-1.5 pointer-events-none select-none">
              <Megaphone className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span className="text-[10px] sm:text-xs text-slate-300 font-sans truncate">
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
            ? `cursor-move touch-none pointer-events-auto ${
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
          {onPlayLiveGame && (
            <button
              onClick={onPlayLiveGame}
              className="px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1 transition-all bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-md ring-1 ring-emerald-400 active:scale-95"
              title="Switch to full-page live playable game mode"
            >
              <Gamepad2 className="w-3 h-3" />
              <span>Play Live Game</span>
            </button>
          )}

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

      {/* Main 16:9 Canvas Viewport with Scaled Layout Overlays */}
      <div
        ref={viewportRef}
        onPointerMove={handleContainerPointerMove}
        onPointerUp={handleContainerPointerUp}
        onPointerCancel={handleContainerPointerUp}
        className="relative aspect-[16/9] w-full rounded-2xl overflow-hidden bg-slate-950 border border-slate-800 shadow-inner group select-none flex items-center justify-center"
      >
        {isMemoryMatch ? (
          /* MEMORY MATCH LIVE BOARD PREVIEW */
          <div
            className="w-full h-full relative flex items-center justify-center p-4 overflow-hidden"
            style={{
              backgroundImage: theme.background_url ? `url(${theme.background_url})` : undefined,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              backgroundRepeat: 'no-repeat',
            }}
          >
            {/* Background Gradient Fallback / Tint */}
            <div
              className="absolute inset-0 z-0 pointer-events-none"
              style={{
                background: theme.background_url
                  ? 'rgba(15, 23, 42, 0.65)'
                  : `linear-gradient(135deg, ${theme.visuals_config?.bgGradientFrom || '#0f172a'} 0%, ${theme.visuals_config?.bgGradientVia || '#1e1b4b'} 50%, ${theme.visuals_config?.bgGradientTo || '#0f172a'} 100%)`,
              }}
            />

            {/* Dynamic Interactive Card Board Centered (Grid vs Scattered) */}
            {boardConfig.layoutMode === 'grid' ? (
              <div
                className="relative z-10 w-full max-w-[560px] max-h-[90%] p-2 sm:p-2.5 rounded-2xl bg-slate-950/70 backdrop-blur-md border border-slate-800/80 shadow-2xl overflow-hidden"
                style={{
                  display: 'grid',
                  gridTemplateColumns: `repeat(${boardConfig.cols}, minmax(0, 1fr))`,
                  gridTemplateRows: `repeat(${boardConfig.rows}, minmax(0, 1fr))`,
                  aspectRatio: `${previewGridAspect}`,
                  gap: `${boardConfig.cardGap || 8}px`,
                }}
              >
                {memoryDeck.map((card, idx) => {
                  const isFlipped = card.isFlipped || card.isMatched;
                  const rotationAngle = card.rotation ?? 0;
                  return (
                    <div
                      key={card.id || idx}
                      onClick={() => handleCardClick(idx)}
                      className="relative w-full h-full cursor-pointer perspective-1000 group/card transition-transform active:scale-95"
                      style={{ transform: `rotate(${rotationAngle}deg)` }}
                      title={`Click to flip ${card.name}`}
                    >
                      <div
                        className={`relative w-full h-full duration-300 transition-all [transform-style:preserve-3d] shadow-sm ${
                          isFlipped ? '[transform:rotateY(180deg)]' : ''
                        }`}
                        style={{ borderRadius: `${cardBorderRadius}px` }}
                      >
                        {/* CARD BACK */}
                        <div
                          className="absolute inset-0 w-full h-full flex flex-col items-center justify-center border-2 border-slate-700/80 bg-slate-900 shadow-md group-hover/card:border-amber-500/80 transition-colors overflow-hidden p-1"
                          style={{
                            backfaceVisibility: 'hidden',
                            backgroundColor: theme.visuals_config?.cardBadBg || '#0f172a',
                            borderColor: theme.visuals_config?.cardBadBorder || '#334155',
                            borderRadius: `${cardBorderRadius}px`,
                          }}
                        >
                          {getMemoryMatchConfig(theme).cardBackUrl ? (
                            <img
                              src={getMemoryMatchConfig(theme).cardBackUrl!}
                              alt="Card Back"
                              className="max-h-full max-w-full object-contain filter drop-shadow-sm pointer-events-none"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <>
                              <Grid3X3 className="w-5 h-5 sm:w-6 sm:h-6 text-slate-500 group-hover/card:text-amber-400 transition-colors" />
                              <span className="text-[8px] sm:text-[9px] font-mono text-slate-500 mt-0.5 font-bold">
                                {idx + 1}
                              </span>
                            </>
                          )}
                        </div>

                        {/* CARD FRONT FACE */}
                        <div
                          className="absolute inset-0 w-full h-full flex flex-col items-center justify-between p-1 sm:p-1.5 border-2 shadow-lg"
                          style={{
                            backfaceVisibility: 'hidden',
                            transform: 'rotateY(180deg)',
                            borderRadius: `${cardBorderRadius}px`,
                            backgroundColor: card.isMatched
                              ? theme.visuals_config?.cardGoodBg || 'rgba(6, 78, 59, 0.85)'
                              : card.bgColor || 'rgba(15, 23, 42, 0.95)',
                            borderColor: card.isMatched
                              ? theme.visuals_config?.cardGoodBorder || '#10b981'
                              : card.borderColor || '#f59e0b',
                          }}
                        >
                          {card.isMatched && (
                            <div className="absolute top-1 right-1 w-3.5 h-3.5 rounded-full bg-emerald-500 text-slate-950 flex items-center justify-center shadow">
                              <CheckCircle2 className="w-2.5 h-2.5" />
                            </div>
                          )}
                          <div className="flex-1 w-full flex items-center justify-center p-0.5">
                            {card.imageUrl ? (
                              <img
                                src={card.imageUrl}
                                alt={card.name}
                                className="max-h-[80%] max-w-[80%] object-contain drop-shadow"
                                referrerPolicy="no-referrer"
                              />
                            ) : (
                              <div
                                className="p-1 rounded-lg flex items-center justify-center"
                                style={{ color: card.color || '#fbbf24' }}
                              >
                                {renderCardIcon(card.iconName, 'w-5 h-5 sm:w-7 sm:h-7')}
                              </div>
                            )}
                          </div>
                          <span className="text-[8px] sm:text-[10px] font-bold text-slate-100 text-center tracking-tight truncate max-w-full px-0.5">
                            {card.name}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              /* RANDOM / SCATTERED CARD BOARD */
              <div className="relative z-10 w-full max-w-[560px] h-[340px] sm:h-[420px] max-h-[92%] p-3 rounded-2xl bg-slate-950/70 backdrop-blur-md border border-slate-800/80 shadow-2xl overflow-hidden">
                {memoryDeck.map((card, idx) => {
                  const pos = randomPositions[idx] || { x: 50, y: 50, rotation: 0, widthPercent: 18, heightPercent: 24, zIndex: idx + 1 };
                  const isFlipped = card.isFlipped || card.isMatched;
                  return (
                    <div
                      key={card.id || idx}
                      onClick={() => handleCardClick(idx)}
                      style={{
                        position: 'absolute',
                        left: `${pos.x}%`,
                        top: `${pos.y}%`,
                        width: `${pos.widthPercent}%`,
                        height: `${pos.heightPercent}%`,
                        transform: `translate(-50%, -50%) rotate(${pos.rotation}deg)`,
                        zIndex: isFlipped ? 60 : pos.zIndex,
                      }}
                      className="cursor-pointer perspective-1000 group/card transition-all active:scale-95 duration-200"
                      title={`Click to flip ${card.name}`}
                    >
                      <div
                        className={`relative w-full h-full duration-300 transition-all [transform-style:preserve-3d] shadow-md hover:shadow-xl hover:scale-105 ${
                          isFlipped ? '[transform:rotateY(180deg)]' : ''
                        }`}
                        style={{ borderRadius: `${cardBorderRadius}px` }}
                      >
                        {/* CARD BACK */}
                        <div
                          className="absolute inset-0 w-full h-full flex flex-col items-center justify-center border-2 border-slate-700/80 bg-slate-900 shadow-md group-hover/card:border-amber-500/80 transition-colors overflow-hidden p-1"
                          style={{
                            backfaceVisibility: 'hidden',
                            backgroundColor: theme.visuals_config?.cardBadBg || '#0f172a',
                            borderColor: theme.visuals_config?.cardBadBorder || '#334155',
                            borderRadius: `${cardBorderRadius}px`,
                          }}
                        >
                          {getMemoryMatchConfig(theme).cardBackUrl ? (
                            <img
                              src={getMemoryMatchConfig(theme).cardBackUrl!}
                              alt="Card Back"
                              className="max-h-full max-w-full object-contain filter drop-shadow-sm pointer-events-none"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <>
                              <Grid3X3 className="w-5 h-5 sm:w-6 sm:h-6 text-slate-500 group-hover/card:text-amber-400 transition-colors" />
                              <span className="text-[8px] sm:text-[9px] font-mono text-slate-500 mt-0.5 font-bold">
                                {idx + 1}
                              </span>
                            </>
                          )}
                        </div>

                        {/* CARD FRONT FACE */}
                        <div
                          className="absolute inset-0 w-full h-full flex flex-col items-center justify-between p-1 sm:p-1.5 border-2 shadow-lg"
                          style={{
                            backfaceVisibility: 'hidden',
                            transform: 'rotateY(180deg)',
                            borderRadius: `${cardBorderRadius}px`,
                            backgroundColor: card.isMatched
                              ? theme.visuals_config?.cardGoodBg || 'rgba(6, 78, 59, 0.85)'
                              : card.bgColor || 'rgba(15, 23, 42, 0.95)',
                            borderColor: card.isMatched
                              ? theme.visuals_config?.cardGoodBorder || '#10b981'
                              : card.borderColor || '#f59e0b',
                          }}
                        >
                          {card.isMatched && (
                            <div className="absolute top-1 right-1 w-3.5 h-3.5 rounded-full bg-emerald-500 text-slate-950 flex items-center justify-center shadow">
                              <CheckCircle2 className="w-2.5 h-2.5" />
                            </div>
                          )}
                          <div className="flex-1 w-full flex items-center justify-center p-0.5">
                            {card.imageUrl ? (
                              <img
                                src={card.imageUrl}
                                alt={card.name}
                                className="max-h-[80%] max-w-[80%] object-contain drop-shadow"
                                referrerPolicy="no-referrer"
                              />
                            ) : (
                              <div
                                className="p-1 rounded-lg flex items-center justify-center"
                                style={{ color: card.color || '#fbbf24' }}
                              >
                                {renderCardIcon(card.iconName, 'w-5 h-5 sm:w-7 sm:h-7')}
                              </div>
                            )}
                          </div>
                          <span className="text-[8px] sm:text-[10px] font-bold text-slate-100 text-center tracking-tight truncate max-w-full px-0.5">
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
        ) : (
          /* CATCH BRAND FALLING CANVAS SIMULATION */
          <canvas
            ref={canvasRef}
            width={DESIGN_WIDTH}
            height={DESIGN_HEIGHT}
            onPointerMove={handlePointerMove}
            className={`w-full h-full object-contain ${
              isInteractive ? 'cursor-ew-resize' : 'cursor-default'
            }`}
          />
        )}

        {/* RESPONSIVE SCALED LOGICAL LAYOUT OVERLAYS (1024x576) */}
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
          {LAYOUT_ELEMENT_KEYS.map((k) => renderLayoutElementOverlay(k))}
        </div>

        {isInteractive && !isMemoryMatch && (
          <div className="absolute bottom-2 inset-x-0 mx-auto w-fit bg-amber-500/90 text-slate-950 px-3 py-1 rounded-full text-[11px] font-extrabold shadow-lg pointer-events-none animate-bounce z-30">
            Move mouse / finger horizontally across canvas to catch items!
          </div>
        )}
      </div>

      {/* Quick Drop Item / Card Pair Tester Palette */}
      <div className="space-y-1.5 pt-1">
        <div className="flex items-center justify-between text-[11px] text-slate-400">
          <span className="font-semibold flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-amber-400" />{' '}
            {isMemoryMatch ? 'Memory Match Card Pairs' : 'Instant Item Drop Tester'}
          </span>
          <span>{isMemoryMatch ? 'Configured theme pairs' : 'Click to spawn item'}</span>
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          {(theme.items_config || []).map((item, idx) => (
            <button
              key={item.id || idx}
              onClick={() => {
                if (!isMemoryMatch) {
                  dropItemInstantly(item);
                }
              }}
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
