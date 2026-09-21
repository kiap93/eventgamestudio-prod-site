import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import {
  GameTheme,
  ThemeDropItem,
  isMemoryMatchTheme,
  isReactionTheme,
  getThemeGameType,
  getMemoryMatchConfig,
  getDropItemDisplaySize,
  DEFAULT_MAX_DROP_ITEM_SIZE,
} from '../../themes';
import { soundManager } from '../../game/systems/SoundManager';
import { MemoryMatchGame } from '../../games/memory-match/MemoryMatchGame';
import { ReactionGame } from '../../games/reaction-time/ReactionGame';
import {
  GameLayoutConfig,
  LayoutElementKey,
  LAYOUT_ELEMENTS_META,
  DEFAULT_GAME_LAYOUT,
  normalizeGameLayout,
  getDefaultUILayout,
  calculateDraggedPosition,
} from '../../themes/layout';
import { useResponsiveLayout, getEffectiveGameLayout } from '../../themes/responsive';
import { GameLayoutHudOverlay } from './GameLayoutHudOverlay';
import { GameControlBar } from './GameControlBar';
import {
  Volume2,
  VolumeX,
  RotateCcw,
  Sparkles,
  Gamepad2,
  Flame,
  Star,
  Smartphone,
  Monitor,
  Maximize2,
  Minimize2,
} from 'lucide-react';

interface LiveThemePreviewProps {
  theme: GameTheme;
  onTriggerItemDrop?: (item: ThemeDropItem) => void;
  className?: string;
  editableLayout?: boolean;
  selectedElementKey?: LayoutElementKey | null;
  onSelectElementKey?: (key: LayoutElementKey) => void;
  onUpdateLayout?: (
    newLayout: GameLayoutConfig | ((prev: GameLayoutConfig) => GameLayoutConfig)
  ) => void;
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
  width: number;
  height: number;
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
  dragOffsetX: number;
  dragOffsetY: number;
  elementWidth: number;
  elementHeight: number;
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

  const [isPlaying] = useState<boolean>(true);
  const [isInteractive, setIsInteractive] = useState<boolean>(false);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [previewOrientation, setPreviewOrientation] = useState<'landscape' | 'portrait'>(() => {
    return theme.layout?.orientation === 'portrait' ? 'portrait' : 'landscape';
  });

  const orientationPreference = theme.layout?.orientation || 'auto';
  const responsive = useResponsiveLayout(viewportRef, orientationPreference, previewOrientation);
  const uiScale = responsive.uiScale;
  const [restartKey, setRestartKey] = useState<number>(0);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  // Automatically sync preview orientation when theme.layout?.orientation changes
  useEffect(() => {
    if (theme.layout?.orientation === 'portrait') {
      setPreviewOrientation('portrait');
    } else if (theme.layout?.orientation === 'landscape') {
      setPreviewOrientation('landscape');
    }
  }, [theme.layout?.orientation]);

  // Fullscreen synchronization with browser Fullscreen API and scroll lock
  useEffect(() => {
    const triggerResponsiveResize = () => {
      requestAnimationFrame(() => {
        window.dispatchEvent(new Event('resize'));
      });
      setTimeout(() => {
        window.dispatchEvent(new Event('resize'));
      }, 100);
      setTimeout(() => {
        window.dispatchEvent(new Event('resize'));
      }, 300);
    };

    const handleFullscreenChange = () => {
      const isFs =
        !!document.fullscreenElement || !!(document as any).webkitFullscreenElement;
      setIsFullscreen(isFs);
      triggerResponsiveResize();
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        const isFs =
          !!document.fullscreenElement || !!(document as any).webkitFullscreenElement;
        if (isFs || isFullscreen) {
          handleCloseFullscreen();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isFullscreen]);

  // Prevent unwanted page scrolling when fullscreen mode is active
  useEffect(() => {
    if (isFullscreen) {
      const originalBodyOverflow = document.body.style.overflow;
      const originalHtmlOverflow = document.documentElement.style.overflow;
      document.body.style.overflow = 'hidden';
      document.documentElement.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalBodyOverflow;
        document.documentElement.style.overflow = originalHtmlOverflow;
      };
    }
  }, [isFullscreen]);

  const handleCloseFullscreen = async () => {
    try {
      if (document.fullscreenElement || (document as any).webkitFullscreenElement) {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        } else if ((document as any).webkitExitFullscreen) {
          await (document as any).webkitExitFullscreen();
        }
      }
    } catch (err) {
      console.warn('Exit fullscreen failed:', err);
    } finally {
      setIsFullscreen(false);
      requestAnimationFrame(() => {
        window.dispatchEvent(new Event('resize'));
      });
      setTimeout(() => {
        window.dispatchEvent(new Event('resize'));
      }, 100);
      setTimeout(() => {
        window.dispatchEvent(new Event('resize'));
      }, 300);
    }
  };

  const handleToggleFullscreen = async () => {
    const isCurrentlyFs =
      !!document.fullscreenElement || !!(document as any).webkitFullscreenElement;

    if (!isCurrentlyFs && !isFullscreen) {
      const elem = containerRef.current || document.documentElement;
      try {
        if (elem.requestFullscreen) {
          await elem.requestFullscreen();
        } else if ((elem as any).webkitRequestFullscreen) {
          await (elem as any).webkitRequestFullscreen();
        } else if (document.documentElement.requestFullscreen) {
          await document.documentElement.requestFullscreen();
        }
      } catch (err) {
        console.warn('Browser requestFullscreen failed, using CSS fullscreen fallback:', err);
      } finally {
        setIsFullscreen(true);
        requestAnimationFrame(() => {
          window.dispatchEvent(new Event('resize'));
        });
        setTimeout(() => {
          window.dispatchEvent(new Event('resize'));
        }, 100);
        setTimeout(() => {
          window.dispatchEvent(new Event('resize'));
        }, 300);
      }
    } else {
      await handleCloseFullscreen();
    }
  };

  const isMemoryMatch = isMemoryMatchTheme(theme);
  const isReaction = isReactionTheme(theme);
  const memoryConfig = useMemo(() => getMemoryMatchConfig(theme), [theme]);
  const resolvedPreviewDuration = isMemoryMatch
    ? (memoryConfig.gameplay.gameDurationSeconds ?? 45)
    : (theme.physics_config?.gameDurationSeconds || 20);

  const [score, setScore] = useState<number>(0);
  const [timeRemaining, setTimeRemaining] = useState<number>(
    () => resolvedPreviewDuration
  );
  const [currentStageName, setCurrentStageName] = useState<string>('Stage 1: Calm');

  // Dragging and resizing state for layout elements
  const [dragState, setDragState] = useState<DragState | null>(null);

  const gameType = getThemeGameType(theme);
  const defaultLayout = getDefaultUILayout(gameType);

  // Normalized layout
  const layout: GameLayoutConfig = normalizeGameLayout(theme.layout, gameType);

  // Orientation-effective layout respecting responsive orientation
  const effectiveLayout = useMemo(
    () => getEffectiveGameLayout(layout, responsive.isPortrait, gameType),
    [layout, responsive.isPortrait, gameType]
  );

  const isCatchBrand = useMemo(() => {
    if (isMemoryMatch || isReaction) return false;
    // Exclude Durian Catcher explicitly per prompt rules
    if (theme.id === 'durian' || theme.slug === 'durian' || theme.base_theme_id === 'durian') {
      return false;
    }
    return true;
  }, [isMemoryMatch, isReaction, theme.id, theme.slug, theme.base_theme_id]);

  // Dedicated responsive scaling for Catch the Brand simulation stage in Fullscreen
  const catchBrandStageDimensions = useMemo(() => {
    if (!isFullscreen || !isCatchBrand) {
      return {
        stageWidth: responsive.stageWidth,
        stageHeight: responsive.stageHeight,
        scale: responsive.uiScale,
      };
    }

    const logicalGameWidth = responsive.isPortrait ? 576 : 1024;
    const logicalGameHeight = responsive.isPortrait ? 1024 : 576;

    // Viewport client dimensions (flex-1 element between top and bottom bars)
    const vp = viewportRef.current;
    let availableWidth = vp ? vp.clientWidth : window.innerWidth;
    let availableHeight = vp ? vp.clientHeight : window.innerHeight - 96;

    // Account for safe margins inside viewport (16px on mobile, 24px on desktop)
    const safePadX = availableWidth < 640 ? 16 : 24;
    const safePadY = availableHeight < 640 ? 16 : 24;
    const effectiveWidth = Math.max(100, availableWidth - safePadX);
    const effectiveHeight = Math.max(100, availableHeight - safePadY);

    // Uniform scaling formula: min(availableWidth / logicalGameWidth, availableHeight / logicalGameHeight)
    const scale = Math.min(
      effectiveWidth / logicalGameWidth,
      effectiveHeight / logicalGameHeight
    );

    const stageWidth = Math.max(1, Math.floor(logicalGameWidth * scale));
    const stageHeight = Math.max(1, Math.floor(logicalGameHeight * scale));

    return {
      stageWidth,
      stageHeight,
      scale,
    };
  }, [
    isFullscreen,
    isCatchBrand,
    responsive.isPortrait,
    responsive.width,
    responsive.height,
    responsive.stageWidth,
    responsive.stageHeight,
    responsive.uiScale,
  ]);

  // Simulation physics state refs (Catch The Brand)
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
    timeRemaining: resolvedPreviewDuration,
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

      let initW = 56;
      let initH = 56;
      const cachedImg = getOrLoadImage(targetItem.imageUrl);
      if (cachedImg && cachedImg.naturalWidth > 0 && cachedImg.naturalHeight > 0) {
        const dims = getDropItemDisplaySize(
          cachedImg.naturalWidth,
          cachedImg.naturalHeight,
          DEFAULT_MAX_DROP_ITEM_SIZE,
          targetItem.scale
        );
        initW = dims.width;
        initH = dims.height;
      }

      const isPortrait = responsive.isPortrait;
      const designW = responsive.designWidth;

      const newItem: SimulatedItem = {
        id: `sim_${Date.now()}_${Math.random()}`,
        config: targetItem,
        x: Math.random() * (designW - 180) + 90,
        y: -30,
        speed: finalSpeed,
        rotation: 0,
        rotSpeed: (Math.random() - 0.5) * 4,
        radius: Math.max(initW, initH) / 2,
        width: initW,
        height: initH,
        collected: false,
      };

      simState.current.items.push(newItem);
    },
    [theme, previewOrientation, getOrLoadImage]
  );

  // Reset simulation
  const handleResetSimulation = useCallback(() => {
    setRestartKey((prev) => prev + 1);

    simState.current.items = [];
    simState.current.particles = [];
    simState.current.score = 0;
    simState.current.caughtCount = 0;
    simState.current.timeElapsed = 0;
    simState.current.timeRemaining = resolvedPreviewDuration;
    simState.current.basketX = 512;
    simState.current.basketTargetX = 512;
    simState.current.redFlashAlpha = 0;
    simState.current.basketBounce = 0;

    setScore(0);
    setTimeRemaining(resolvedPreviewDuration);
    setCurrentStageName('Stage 1: Calm');
  }, [resolvedPreviewDuration]);

  // Reset when theme duration changes
  const prevThemeIdRef = useRef(theme.id);
  const prevDurationRef = useRef(resolvedPreviewDuration);
  useEffect(() => {
    if (prevThemeIdRef.current !== theme.id || prevDurationRef.current !== resolvedPreviewDuration) {
      prevThemeIdRef.current = theme.id;
      prevDurationRef.current = resolvedPreviewDuration;
      handleResetSimulation();
    }
  }, [theme.id, resolvedPreviewDuration, handleResetSimulation]);

  // Main 60 FPS Canvas Simulation Loop (Catch The Brand)
  useEffect(() => {
    if (isMemoryMatch || isReaction) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let lastTime = performance.now();

    const isPortrait = responsive.isPortrait;
    const V_WIDTH = responsive.designWidth;
    const V_HEIGHT = responsive.designHeight;
    simState.current.basketX = V_WIDTH / 2;
    simState.current.basketTargetX = V_WIDTH / 2;

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
            state.basketTargetX = (V_WIDTH / 2) + Math.sin(state.timeElapsed * 1.5) * (V_WIDTH * 0.22);
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

            let initW = 56;
            let initH = 56;
            const cachedImg = getOrLoadImage(chosen.imageUrl);
            if (cachedImg && cachedImg.naturalWidth > 0 && cachedImg.naturalHeight > 0) {
              const dims = getDropItemDisplaySize(
                cachedImg.naturalWidth,
                cachedImg.naturalHeight,
                DEFAULT_MAX_DROP_ITEM_SIZE,
                chosen.scale
              );
              initW = dims.width;
              initH = dims.height;
            }

            state.items.push({
              id: `item_${Date.now()}_${Math.random()}`,
              config: chosen,
              x: Math.random() * (V_WIDTH - 200) + 100,
              y: -40,
              speed: finalSpeed,
              rotation: 0,
              rotSpeed: (Math.random() - 0.5) * 3,
              radius: Math.max(initW, initH) / 2,
              width: initW,
              height: initH,
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

          // Check Catch Collision with proportional item bounds
          const itemHalfW = (item.width || 56) / 2;
          const itemHalfH = (item.height || 56) / 2;
          if (!item.collected && item.y + itemHalfH >= basketY - 15 && item.y - itemHalfH <= basketY + 30) {
            if (Math.abs(item.x - state.basketX) <= catchHalfW + itemHalfW) {
              item.collected = true;
              state.basketBounce = 1;

              if (item.config.isHazard) {
                state.score = Math.max(0, state.score + (item.config.points || -50));
                state.redFlashAlpha = 0.45;
                if (!isMuted) soundManager.playOrangeCatch();

                // Hazard explosion particles
                for (let p = 0; p < 18; p++) {
                  const ang = Math.random() * Math.PI * 2;
                  const spd = Math.random() * 220 + 80;
                  state.particles.push({
                    x: item.x,
                    y: item.y,
                    vx: Math.cos(ang) * spd,
                    vy: Math.sin(ang) * spd,
                    alpha: 1,
                    size: Math.random() * 5 + 3,
                    color: '#f43f5e',
                    life: 0,
                    maxLife: 0.6,
                  });
                }
              } else {
                state.score += item.config.points || 100;
                state.caughtCount++;
                if (!isMuted) {
                  if (item.config.isBonus) {
                    soundManager.playGoldenCatch();
                  } else {
                    soundManager.playGreenCatch();
                  }
                }

                // Sparkle particles
                const pColor = item.config.isBonus
                  ? '#fbbf24'
                  : theme.visuals_config?.accentColor || '#10b981';
                for (let p = 0; p < 14; p++) {
                  const ang = Math.random() * Math.PI * 2;
                  const spd = Math.random() * 180 + 60;
                  state.particles.push({
                    x: item.x,
                    y: item.y,
                    vx: Math.cos(ang) * spd,
                    vy: Math.sin(ang) * spd - 40,
                    alpha: 1,
                    size: Math.random() * 4 + 2,
                    color: pColor,
                    life: 0,
                    maxLife: 0.5,
                  });
                }
              }
              setScore(state.score);
            }
          }

          // Off screen removal
          if (item.y > V_HEIGHT + 60 || (item.collected && item.y > basketY + 40)) {
            state.items.splice(i, 1);
          }
        }

        // Update particles
        for (let i = state.particles.length - 1; i >= 0; i--) {
          const p = state.particles[i];
          p.life += dt;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.alpha = Math.max(0, 1 - p.life / p.maxLife);
          if (p.life >= p.maxLife) {
            state.particles.splice(i, 1);
          }
        }
      }

      // -------------------------------------------------------------
      // RENDERING CANVAS (Catch The Brand)
      // -------------------------------------------------------------
      ctx.clearRect(0, 0, V_WIDTH, V_HEIGHT);

      // 1. Background
      const bgImg = getOrLoadImage(theme.background_url);
      if (bgImg) {
        ctx.drawImage(bgImg, 0, 0, V_WIDTH, V_HEIGHT);
      } else {
        const bgGrad = ctx.createLinearGradient(0, 0, V_WIDTH, V_HEIGHT);
        bgGrad.addColorStop(0, theme.visuals_config?.bgGradientFrom || '#0f172a');
        bgGrad.addColorStop(0.5, theme.visuals_config?.bgGradientVia || '#1e1b4b');
        bgGrad.addColorStop(1, theme.visuals_config?.bgGradientTo || '#0f172a');
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, V_WIDTH, V_HEIGHT);
      }

      // Background Darkening Tint
      if (theme.background_url) {
        ctx.fillStyle = 'rgba(15, 23, 42, 0.4)';
        ctx.fillRect(0, 0, V_WIDTH, V_HEIGHT);
      }

      // 2. Hazard Red Flash
      if (state.redFlashAlpha > 0) {
        ctx.fillStyle = `rgba(244, 63, 94, ${state.redFlashAlpha})`;
        ctx.fillRect(0, 0, V_WIDTH, V_HEIGHT);
      }

      // 3. Falling Items
      for (const item of state.items) {
        if (item.collected) continue;
        ctx.save();
        ctx.translate(item.x, item.y);
        ctx.rotate(item.rotation);

        const itemImg = getOrLoadImage(item.config.imageUrl);
        if (itemImg && itemImg.naturalWidth > 0 && itemImg.naturalHeight > 0) {
          const dims = getDropItemDisplaySize(
            itemImg.naturalWidth,
            itemImg.naturalHeight,
            DEFAULT_MAX_DROP_ITEM_SIZE,
            item.config.scale
          );
          item.width = dims.width;
          item.height = dims.height;
          ctx.drawImage(itemImg, -dims.width / 2, -dims.height / 2, dims.width, dims.height);
        } else {
          // Draw high fidelity vector circle
          const fallbackSize = 56;
          item.width = fallbackSize;
          item.height = fallbackSize;
          ctx.beginPath();
          ctx.arc(0, 0, fallbackSize / 2, 0, Math.PI * 2);
          ctx.fillStyle = item.config.isHazard
            ? '#e11d48'
            : item.config.isBonus
            ? '#f59e0b'
            : '#10b981';
          ctx.fill();
          ctx.lineWidth = 3;
          ctx.strokeStyle = '#ffffff';
          ctx.stroke();

          // Text Initial
          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 14px system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(item.config.name.substring(0, 3).toUpperCase(), 0, 0);
        }
        ctx.restore();
      }

      // 4. Particles
      for (const p of state.particles) {
        ctx.save();
        ctx.globalAlpha = p.alpha;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // 5. Basket
      const bW = theme.basket_config?.width || 140;
      const bH = theme.basket_config?.height || 70;
      const bX = state.basketX - bW / 2;
      const bY = V_HEIGHT - 65 - state.basketBounce * 8;

      ctx.save();
      const basketImg = getOrLoadImage(theme.basket_config?.imageUrl);
      if (basketImg) {
        ctx.drawImage(basketImg, bX, bY, bW, bH);
      } else {
        // High quality fallback basket
        const cornerR = 16;
        ctx.beginPath();
        ctx.roundRect(bX, bY, bW, bH, cornerR);
        const bGrad = ctx.createLinearGradient(bX, bY, bX, bY + bH);
        bGrad.addColorStop(0, theme.visuals_config?.accentColor || '#10b981');
        bGrad.addColorStop(1, '#064e3b');
        ctx.fillStyle = bGrad;
        ctx.fill();
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 12px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(theme.basket_config?.label || 'CATCH', state.basketX, bY + bH / 2);
      }
      ctx.restore();

      animationFrameId = requestAnimationFrame(render);
    };

    animationFrameId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [
    isPlaying,
    isInteractive,
    isMuted,
    isMemoryMatch,
    isReaction,
    theme,
    getOrLoadImage,
    previewOrientation,
    responsive.isPortrait,
    responsive.designWidth,
    responsive.designHeight,
  ]);

  // Interactive mouse / touch move on canvas (Catch The Brand)
  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isInteractive || isMemoryMatch || isReaction) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const designW = responsive.designWidth;
    const scaleX = designW / rect.width;
    const clientX = e.clientX - rect.left;
    simState.current.basketTargetX = clientX * scaleX;
  };

  // Dragging and resizing for Layout tab
  const handleElementPointerDown = (
    key: LayoutElementKey,
    isResize: boolean,
    e: React.PointerEvent<HTMLDivElement>
  ) => {
    if (!editableLayout) return;
    e.stopPropagation();
    e.preventDefault();

    const elem = effectiveLayout[key] || defaultLayout[key] || DEFAULT_GAME_LAYOUT[key];
    const meta = LAYOUT_ELEMENTS_META[key];

    const previewRect = viewportRef.current?.getBoundingClientRect();
    if (!previewRect || previewRect.width <= 0 || previewRect.height <= 0) return;

    // Pointer coordinates relative to the preview element as percentages (0-100%)
    const pointerPercentX = ((e.clientX - previewRect.left) / previewRect.width) * 100;
    const pointerPercentY = ((e.clientY - previewRect.top) / previewRect.height) * 100;

    // Measure rendered element dimensions if available
    const targetEl = e.currentTarget as HTMLElement | null;
    const targetRect = targetEl?.getBoundingClientRect();
    const measuredWidth =
      targetRect && previewRect.width > 0
        ? (targetRect.width / previewRect.width) * 100
        : elem.width || meta.defaultWidth;
    const measuredHeight =
      targetRect && previewRect.height > 0 ? (targetRect.height / previewRect.height) * 100 : 8;

    const elemWidth = elem.width || measuredWidth || meta.defaultWidth;
    const elemHeight = measuredHeight || 8;

    // Drag offset relative to the element's position to prevent jump on grab
    const dragOffsetX = pointerPercentX - elem.x;
    const dragOffsetY = pointerPercentY - elem.y;

    setDragState({
      isDragging: !isResize,
      isResizing: isResize,
      elementKey: key,
      startPointerX: e.clientX,
      startPointerY: e.clientY,
      startX: elem.x,
      startY: elem.y,
      startWidth: elem.width || meta.defaultWidth,
      dragOffsetX,
      dragOffsetY,
      elementWidth: elemWidth,
      elementHeight: elemHeight,
    });
    onSelectElementKey?.(key);
  };

  // Shared move handler for container and window pointer events
  const handleMove = (pointerX: number, pointerY: number) => {
    if (!dragState || !viewportRef.current || !editableLayout) return;

    const previewRect = viewportRef.current.getBoundingClientRect();
    if (previewRect.width <= 0 || previewRect.height <= 0) return;

    const key = dragState.elementKey;
    const meta = LAYOUT_ELEMENTS_META[key];
    const isBoard = key === 'memoryCardBoard';

    if (dragState.isDragging) {
      const position = calculateDraggedPosition({
        elementId: key,
        pointerX,
        pointerY,
        previewRect,
        dragOffsetX: dragState.dragOffsetX,
        dragOffsetY: dragState.dragOffsetY,
        elementWidth: dragState.elementWidth,
        elementHeight: dragState.elementHeight,
        isCenterAnchored: isBoard,
      });

      const updater = (prevLayout: GameLayoutConfig): GameLayoutConfig => {
        if (responsive.isPortrait) {
          const currentPortrait = prevLayout.portraitLayout || {};
          const currentElem =
            (currentPortrait as any)[key] ||
            effectiveLayout[key] ||
            defaultLayout[key] ||
            DEFAULT_GAME_LAYOUT[key];
          return {
            ...prevLayout,
            portraitLayout: {
              ...currentPortrait,
              [key]: {
                ...currentElem,
                x: position.x,
                y: position.y,
              },
            },
          };
        }
        const currentElem = prevLayout[key] || defaultLayout[key] || DEFAULT_GAME_LAYOUT[key];
        return {
          ...prevLayout,
          [key]: {
            ...currentElem,
            x: position.x,
            y: position.y,
          },
        };
      };

      onUpdateLayout?.(updater);
    } else if (dragState.isResizing) {
      const deltaXPercent = ((pointerX - dragState.startPointerX) / previewRect.width) * 100;
      const newWidth = Math.max(
        meta.minWidth,
        Math.min(meta.maxWidth, dragState.startWidth + deltaXPercent)
      );

      const updater = (prevLayout: GameLayoutConfig): GameLayoutConfig => {
        if (responsive.isPortrait) {
          const currentPortrait = prevLayout.portraitLayout || {};
          const currentElem =
            (currentPortrait as any)[key] ||
            effectiveLayout[key] ||
            defaultLayout[key] ||
            DEFAULT_GAME_LAYOUT[key];
          return {
            ...prevLayout,
            portraitLayout: {
              ...currentPortrait,
              [key]: {
                ...currentElem,
                width: Math.round(newWidth * 10) / 10,
              },
            },
          };
        }
        const currentElem = prevLayout[key] || defaultLayout[key] || DEFAULT_GAME_LAYOUT[key];
        return {
          ...prevLayout,
          [key]: {
            ...currentElem,
            width: Math.round(newWidth * 10) / 10,
          },
        };
      };

      onUpdateLayout?.(updater);
    }
  };

  // Global pointer listeners to ensure smooth dragging across edges and clean release
  useEffect(() => {
    if (!dragState) return;

    const handleWindowPointerMove = (e: PointerEvent) => {
      handleMove(e.clientX, e.clientY);
    };

    const handleWindowPointerUp = () => {
      setDragState(null);
    };

    window.addEventListener('pointermove', handleWindowPointerMove);
    window.addEventListener('pointerup', handleWindowPointerUp);
    window.addEventListener('pointercancel', handleWindowPointerUp);

    return () => {
      window.removeEventListener('pointermove', handleWindowPointerMove);
      window.removeEventListener('pointerup', handleWindowPointerUp);
      window.removeEventListener('pointercancel', handleWindowPointerUp);
    };
  }, [dragState, editableLayout, defaultLayout, onUpdateLayout]);

  const handleContainerPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragState) return;
    e.preventDefault();
    handleMove(e.clientX, e.clientY);
  };

  const handleContainerPointerUp = (e?: React.PointerEvent<HTMLDivElement>) => {
    if (dragState) {
      e?.preventDefault();
      setDragState(null);
    }
  };

  return (
    <div
      ref={containerRef}
      className={
        isFullscreen
          ? isCatchBrand
            ? 'catch-brand-fullscreen-container fixed inset-0 z-[99999] w-full h-full min-h-[100dvh] max-h-[100dvh] bg-[#07130b] overflow-hidden p-0 m-0 flex flex-col justify-between select-none'
            : 'fixed inset-0 z-[99999] w-full h-full min-h-[100dvh] max-h-[100dvh] bg-[#07130b] overflow-hidden p-0 m-0 flex flex-col justify-between select-none'
          : `bg-slate-900 border border-slate-800 rounded-3xl p-4 sm:p-5 shadow-2xl flex flex-col gap-3 relative overflow-hidden ${className}`
      }
      style={
        isFullscreen
          ? {
              backgroundColor: theme.visuals_config?.bgGradientTo || '#07130b',
              backgroundImage: theme.background_url
                ? `url("${theme.background_url}")`
                : `radial-gradient(circle at 50% 20%, ${
                    theme.visuals_config?.bgGradientFrom || 'rgba(30, 16, 53, 0.6)'
                  } 0%, ${theme.visuals_config?.bgGradientTo || '#07130b'} 100%)`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              backgroundRepeat: 'no-repeat',
            }
          : undefined
      }
    >
      {/* Header bar */}
      {isFullscreen ? (
        isCatchBrand ? (
          /* CATCH THE BRAND DEDICATED FULLSCREEN TOOLBAR (COMPACT & RESPONSIVE) */
          <div className="w-full flex items-center justify-between gap-2 px-3 sm:px-5 py-1.5 bg-slate-950/90 border-b border-slate-800/80 shadow-xl backdrop-blur-md shrink-0 z-30 overflow-x-auto no-scrollbar">
            <div className="flex items-center gap-2 min-w-0 shrink">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
              <span className="text-xs font-bold text-slate-100 tracking-tight truncate max-w-[130px] sm:max-w-[220px]">
                {theme.name || 'Catch The Brand'}
              </span>
              <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/70 border border-emerald-800/70 px-1.5 py-0.5 rounded shrink-0 hidden md:inline-block">
                Catch The Brand • Fullscreen
              </span>
            </div>

            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 whitespace-nowrap">
              {onPlayLiveGame && (
                <button
                  type="button"
                  onClick={onPlayLiveGame}
                  className="px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1 transition-all bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-sm ring-1 ring-emerald-400 active:scale-95 shrink-0"
                  title="Switch to full-page live playable game mode"
                >
                  <Gamepad2 className="w-3 h-3" />
                  <span>Play Live Game</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => setIsInteractive(!isInteractive)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1 transition-all shrink-0 ${
                  isInteractive
                    ? 'bg-amber-500 text-slate-950 shadow-sm ring-1 ring-amber-400'
                    : 'bg-slate-800/90 text-slate-300 hover:bg-slate-700'
                }`}
                title="Toggle between Interactive Player Control and Auto-Attract Simulation"
              >
                <Gamepad2 className="w-3 h-3" />
                <span>{isInteractive ? 'Testing (Interactive)' : 'Auto Demo'}</span>
              </button>

              <button
                type="button"
                onClick={() =>
                  setPreviewOrientation((prev) => (prev === 'landscape' ? 'portrait' : 'landscape'))
                }
                className="px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1 transition-all bg-slate-800/90 text-slate-300 hover:bg-slate-700 hover:text-white border border-slate-700/60 shrink-0"
                title={`Switch preview to ${
                  previewOrientation === 'landscape'
                    ? 'Mobile Portrait (9:16)'
                    : 'Landscape (16:9)'
                }`}
              >
                {previewOrientation === 'landscape' ? (
                  <>
                    <Smartphone className="w-3 h-3 text-amber-400" />
                    <span>Portrait</span>
                  </>
                ) : (
                  <>
                    <Monitor className="w-3 h-3 text-sky-400" />
                    <span>Landscape</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => setIsMuted(!isMuted)}
                className="p-1.5 bg-slate-800/90 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors border border-slate-700/60 shrink-0"
                title={isMuted ? 'Unmute preview sounds' : 'Mute preview sounds'}
              >
                {isMuted ? (
                  <VolumeX className="w-3.5 h-3.5 text-slate-500" />
                ) : (
                  <Volume2 className="w-3.5 h-3.5 text-emerald-400" />
                )}
              </button>

              <button
                type="button"
                onClick={handleResetSimulation}
                className="p-1.5 bg-slate-800/90 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors border border-slate-700/60 shrink-0"
                title="Restart simulation"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                onClick={handleCloseFullscreen}
                className="flex items-center gap-1 px-2.5 py-1 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 hover:text-white border border-rose-500/40 rounded-lg text-[11px] font-bold transition-all shadow-sm active:scale-95 cursor-pointer shrink-0"
                title="Close Fullscreen (Esc)"
              >
                <Minimize2 className="w-3.5 h-3.5 text-rose-400" />
                <span>Close</span>
              </button>
            </div>
          </div>
        ) : (
          /* PRESERVED TOOLBAR FOR OTHER GAMES */
          <div className="w-full flex items-center justify-between gap-3 py-2.5 px-4 sm:px-6 bg-slate-950/85 border-b border-slate-800/80 shadow-xl backdrop-blur-md shrink-0 z-30">
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
              <span className="text-xs sm:text-sm font-black text-slate-100 tracking-tight truncate">
                {theme.name || 'Theme'} • Live Simulation
              </span>
              <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/70 border border-emerald-800/70 px-2 py-0.5 rounded-md hidden sm:inline-block">
                Fullscreen
              </span>
            </div>

            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setIsInteractive(!isInteractive)}
                className={`px-2.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1 transition-all ${
                  isInteractive
                    ? 'bg-amber-500 text-slate-950 shadow-md ring-1 ring-amber-400'
                    : 'bg-slate-800/90 text-slate-300 hover:bg-slate-700'
                }`}
                title="Toggle between Interactive Player Control and Auto-Attract Simulation"
              >
                <Gamepad2 className="w-3.5 h-3.5" />
                <span>{isInteractive ? 'Testing (Interactive)' : 'Auto Demo'}</span>
              </button>

              <button
                type="button"
                onClick={() =>
                  setPreviewOrientation((prev) => (prev === 'landscape' ? 'portrait' : 'landscape'))
                }
                className="px-2.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1 transition-all bg-slate-800/90 text-slate-300 hover:bg-slate-700 hover:text-white border border-slate-700/60"
                title={`Switch preview to ${
                  previewOrientation === 'landscape'
                    ? 'Mobile Portrait (9:16)'
                    : 'Landscape (16:9)'
                }`}
              >
                {previewOrientation === 'landscape' ? (
                  <>
                    <Smartphone className="w-3.5 h-3.5 text-amber-400" />
                    <span className="hidden sm:inline">Portrait</span>
                  </>
                ) : (
                  <>
                    <Monitor className="w-3.5 h-3.5 text-sky-400" />
                    <span className="hidden sm:inline">Landscape</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => setIsMuted(!isMuted)}
                className="p-2 bg-slate-800/90 hover:bg-slate-700 text-slate-300 rounded-xl transition-colors border border-slate-700/60"
                title={isMuted ? 'Unmute preview sounds' : 'Mute preview sounds'}
              >
                {isMuted ? (
                  <VolumeX className="w-3.5 h-3.5 text-slate-500" />
                ) : (
                  <Volume2 className="w-3.5 h-3.5 text-emerald-400" />
                )}
              </button>

              <button
                type="button"
                onClick={handleResetSimulation}
                className="p-2 bg-slate-800/90 hover:bg-slate-700 text-slate-300 rounded-xl transition-colors border border-slate-700/60"
                title="Restart simulation"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                onClick={handleCloseFullscreen}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 hover:text-white border border-rose-500/40 rounded-xl text-xs font-bold transition-all shadow-md active:scale-95 cursor-pointer"
                title="Close Fullscreen (Esc)"
              >
                <Minimize2 className="w-3.5 h-3.5 text-rose-400" />
                <span>Close</span>
              </button>
            </div>
          </div>
        )
      ) : (
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
              onClick={() => setPreviewOrientation((prev) => (prev === 'landscape' ? 'portrait' : 'landscape'))}
              className="px-2 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1 transition-all bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white"
              title={`Switch preview to ${previewOrientation === 'landscape' ? 'Mobile Portrait (9:16)' : 'Landscape (16:9)'}`}
            >
              {previewOrientation === 'landscape' ? (
                <>
                  <Smartphone className="w-3 h-3 text-amber-400" />
                  <span>Portrait</span>
                </>
              ) : (
                <>
                  <Monitor className="w-3 h-3 text-sky-400" />
                  <span>Landscape</span>
                </>
              )}
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

            <button
              onClick={handleToggleFullscreen}
              className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg transition-colors"
              title="Fullscreen"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Main Viewport with Scaled Layout Overlays */}
      <div
        ref={viewportRef}
        onPointerMove={handleContainerPointerMove}
        onPointerUp={handleContainerPointerUp}
        onPointerCancel={handleContainerPointerUp}
        className={
          isFullscreen
            ? isCatchBrand
              ? 'catch-brand-fullscreen-viewport relative flex-1 w-full h-full min-w-0 min-h-0 overflow-hidden select-none flex items-center justify-center p-2 sm:p-3'
              : 'relative flex-1 w-full h-full min-w-0 min-h-0 overflow-hidden select-none flex items-center justify-center'
            : `relative ${
                responsive.isPortrait
                  ? 'aspect-[9/16] max-h-[580px] w-auto mx-auto'
                  : 'aspect-[16/9] w-full'
              } rounded-2xl overflow-hidden bg-slate-950 border border-slate-800 shadow-inner group select-none flex items-center justify-center transition-all`
        }
        style={{
          '--game-ui-scale': responsive.uiScale,
          '--game-design-width': `${responsive.designWidth}px`,
          '--game-design-height': `${responsive.designHeight}px`,
        } as React.CSSProperties}
      >
        {/* Full container backdrop in Fullscreen Mode */}
        {isFullscreen && (
          <div
            className="game-ui-backdrop absolute inset-0 pointer-events-none w-full h-full"
            style={{
              backgroundColor: theme.visuals_config?.bgGradientTo || '#07130b',
              backgroundImage: theme.background_url
                ? `url("${theme.background_url}")`
                : `radial-gradient(circle at 50% 20%, ${
                    theme.visuals_config?.bgGradientFrom || 'rgba(30, 16, 53, 0.6)'
                  } 0%, ${theme.visuals_config?.bgGradientTo || '#07130b'} 100%)`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              backgroundRepeat: 'no-repeat',
            }}
          />
        )}

        {isReaction ? (
          /* REACTION GAME LIVE SIMULATION */
          <ReactionGame
            key={`sim-rx-${theme.id}-${restartKey}-${responsive.isPortrait ? 'portrait' : 'landscape'}`}
            className="w-full h-full relative z-10"
            activeTheme={theme}
            config={theme.game_config}
            isMuted={isMuted}
            isFullscreen={isFullscreen}
            isEventPreview={true}
            isSimulation={false}
            isInteractive={true}
            overrideOrientation={responsive.isPortrait ? 'portrait' : 'landscape'}
            onToggleMute={() => setIsMuted(!isMuted)}
            onToggleFullscreen={handleToggleFullscreen}
          />
        ) : isMemoryMatch ? (
          /* MEMORY MATCH LIVE GAME SIMULATION - TRUE PROPORTIONAL SCALING */
          <MemoryMatchGame
            key={`sim-mm-${theme.id}-${restartKey}-${responsive.isPortrait ? 'portrait' : 'landscape'}`}
            className="w-full h-full relative z-10"
            activeTheme={theme}
            settings={{
              soundEnabled: !isMuted,
              gameDurationSeconds: resolvedPreviewDuration,
              mismatchDelayMs: memoryConfig.gameplay?.mismatchDelayMs ?? 850,
            }}
            isMuted={isMuted}
            isFullscreen={isFullscreen}
            isStudioPreview={true}
            autoDemo={!isInteractive}
            editableLayout={editableLayout}
            selectedElementKey={selectedElementKey}
            onSelectElementKey={onSelectElementKey}
            onElementPointerDown={handleElementPointerDown}
            overrideOrientation={responsive.isPortrait ? 'portrait' : 'landscape'}
            onToggleMute={() => setIsMuted(!isMuted)}
            onToggleFullscreen={handleToggleFullscreen}
          />
        ) : (
          /* CATCH BRAND FALLING CANVAS SIMULATION - CENTERED AND PROPORTIONALLY SCALED */
          <div
            id="catch-brand-simulation-stage"
            className={`game-stage relative overflow-hidden pointer-events-auto shrink-0 shadow-2xl transition-all z-10 ${
              responsive.isPortrait ? 'is-portrait aspect-[9/16]' : 'aspect-[16/9]'
            } ${isFullscreen ? 'rounded-2xl ring-1 ring-white/10' : 'w-full h-full'}`}
            style={
              isFullscreen
                ? {
                    width: `${catchBrandStageDimensions.stageWidth}px`,
                    height: `${catchBrandStageDimensions.stageHeight}px`,
                    maxWidth: '100%',
                    maxHeight: '100%',
                  }
                : {
                    width: '100%',
                    height: '100%',
                  }
            }
          >
            <canvas
              ref={canvasRef}
              width={responsive.designWidth}
              height={responsive.designHeight}
              onPointerMove={handlePointerMove}
              className={`w-full h-full ${
                isInteractive ? 'cursor-ew-resize' : 'cursor-default'
              }`}
            />

            {/* SHARED WYSIWYG GAME HUD OVERLAY FOR CATCH BRAND */}
            <GameLayoutHudOverlay
              layout={effectiveLayout}
              theme={theme}
              gameType={gameType}
              isPortrait={responsive.isPortrait}
              score={score}
              moves={0}
              pairs={0}
              totalPairs={8}
              timeRemaining={timeRemaining}
              editableLayout={editableLayout}
              selectedElementKey={selectedElementKey}
              onSelectElementKey={onSelectElementKey}
              onElementPointerDown={handleElementPointerDown}
            />

            {/* IN-GAME FLOATING CONTROL BAR FOR CATCH THE BRAND LIVE GAME SIMULATION */}
            <GameControlBar
              id="simulation-catch-brand-control-bar"
              disabled={true}
              isMuted={isMuted}
              isPaused={false}
              isFullscreen={isFullscreen}
              className={`absolute z-40 origin-top-right transition-transform ${
                responsive.isPortrait
                  ? 'top-2 right-2 scale-[0.72] sm:scale-[0.82]'
                  : 'top-2 right-2 sm:top-2.5 sm:right-2.5 scale-[0.85] sm:scale-100'
              }`}
            />

            {isInteractive && (
              <div className="absolute bottom-2 inset-x-0 mx-auto w-fit bg-amber-500/90 text-slate-950 px-2.5 py-0.5 rounded-full text-[10px] sm:text-[11px] font-extrabold shadow-lg pointer-events-none animate-bounce z-30">
                Move mouse / finger horizontally across canvas to catch items!
              </div>
            )}
          </div>
        )}
      </div>

      {/* When in Fullscreen: render integrated bottom simulation bar */}
      {isFullscreen ? (
        isCatchBrand ? (
          /* CATCH THE BRAND COMPACT BOTTOM SIMULATION BAR WITH EMBEDDED ITEM DROP TESTER */
          <div className="w-full px-3 sm:px-5 py-1.5 bg-slate-950/90 border-t border-slate-800/80 shadow-xl backdrop-blur-md shrink-0 z-30 flex items-center justify-between gap-2 overflow-x-auto no-scrollbar">
            {/* Quick item drop buttons */}
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-[11px] font-semibold text-slate-400 flex items-center gap-1 shrink-0 mr-1">
                <Sparkles className="w-3 h-3 text-amber-400" />
                <span className="hidden sm:inline">Drop:</span>
              </span>
              {(theme.items_config || []).map((item, idx) => (
                <button
                  key={item.id || idx}
                  onClick={() => dropItemInstantly(item)}
                  className={`px-2 py-0.5 rounded-md text-[11px] font-semibold shrink-0 flex items-center gap-1 border transition-all active:scale-95 ${
                    item.isHazard
                      ? 'bg-rose-500/15 border-rose-500/30 text-rose-300 hover:bg-rose-500/25'
                      : item.isBonus
                      ? 'bg-amber-500/15 border-amber-500/30 text-amber-300 hover:bg-amber-500/25'
                      : 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/25'
                  }`}
                  title={`Drop ${item.name} (${item.points > 0 ? `+${item.points}` : item.points} pts)`}
                >
                  {item.imageUrl ? (
                    <img
                      src={item.imageUrl}
                      alt={item.name}
                      className="w-3.5 h-3.5 object-contain rounded shrink-0"
                      referrerPolicy="no-referrer"
                    />
                  ) : item.isHazard ? (
                    <Flame className="w-3 h-3 text-rose-400 shrink-0" />
                  ) : item.isBonus ? (
                    <Star className="w-3 h-3 text-amber-400 shrink-0" />
                  ) : (
                    <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                  )}
                  <span className="truncate max-w-[80px] sm:max-w-[100px]">{item.name}</span>
                  <span className="text-[10px] opacity-75 font-mono">
                    {item.points > 0 ? `+${item.points}` : item.points}
                  </span>
                </button>
              ))}
            </div>

            {/* Right side: Status and Exit Fullscreen */}
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-[11px] font-mono text-slate-400 hidden md:inline truncate max-w-[200px]">
                {isInteractive ? '🎮 Interactive test' : '🤖 Auto demo'}
              </span>
              <button
                type="button"
                onClick={handleCloseFullscreen}
                className="flex items-center gap-1.5 px-3 py-1 bg-slate-900/95 hover:bg-slate-800 active:scale-95 text-slate-200 hover:text-white border border-slate-700/80 rounded-lg text-xs font-bold transition-all shadow-sm cursor-pointer shrink-0"
                title="Exit Fullscreen Mode (Esc)"
              >
                <Minimize2 className="w-3 h-3 text-amber-400" />
                <span>Exit Fullscreen</span>
                <span className="text-[9px] text-slate-400 font-mono px-1 py-0.2 bg-slate-950 rounded border border-slate-800 hidden sm:inline">
                  ESC
                </span>
              </button>
            </div>
          </div>
        ) : (
          /* PRESERVED BOTTOM BAR FOR OTHER GAMES */
          <div className="w-full px-4 sm:px-6 py-2 bg-slate-950/85 border-t border-slate-800/80 shadow-xl backdrop-blur-md shrink-0 z-30 flex items-center justify-between gap-3">
            {/* Status or instruction message */}
            <div className="flex items-center gap-2 min-w-0 text-xs text-slate-300">
              {isReaction ? (
                <span className="font-mono text-[11px] truncate text-slate-400">
                  ⚡ Click, tap, or press SPACE on canvas to react when lights go out!
                </span>
              ) : isMemoryMatch ? (
                <span className="font-mono text-[11px] truncate text-slate-400">
                  🎴 Click cards to flip and match pairs ({memoryConfig.pairs?.length || 8} pairs configured)
                </span>
              ) : (
                <span className="font-mono text-[11px] truncate text-slate-400">
                  🎮 {isInteractive ? 'Move mouse or touch horizontally to catch items' : 'Auto-attract demo mode active'}
                </span>
              )}
            </div>

            {/* Exit Fullscreen Control */}
            <button
              type="button"
              onClick={handleCloseFullscreen}
              className="flex items-center gap-2 px-4 py-1.5 bg-slate-900/95 hover:bg-slate-800 active:scale-95 text-slate-200 hover:text-white border border-slate-700/80 rounded-xl text-xs font-bold transition-all shadow-md backdrop-blur-md cursor-pointer shrink-0"
              title="Exit Fullscreen Mode (Esc)"
            >
              <Minimize2 className="w-3.5 h-3.5 text-amber-400" />
              <span>Exit Fullscreen</span>
              <span className="text-[10px] text-slate-400 font-mono ml-1 px-1.5 py-0.5 bg-slate-950 rounded border border-slate-800">
                ESC
              </span>
            </button>
          </div>
        )
      ) : (
        <div className="space-y-1.5 pt-1">
          <div className="flex items-center justify-between text-[11px] text-slate-400">
            <span className="font-semibold flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-amber-400" />{' '}
              {isReaction ? 'Reaction Challenge Controls' : isMemoryMatch ? 'Memory Match Card Pairs' : 'Instant Item Drop Tester'}
            </span>
            <span>
              {isReaction
                ? 'Interactive F1 Start Gantry'
                : isMemoryMatch
                ? `${memoryConfig.pairs?.length || 8} configured pairs`
                : 'Click to spawn item'}
            </span>
          </div>

          {isReaction ? (
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              <div className="px-3 py-1.5 rounded-xl text-xs font-mono bg-slate-950/80 border border-slate-800 text-slate-300 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>Click, tap, or press SPACE on canvas to react as soon as lights go out!</span>
              </div>
            </div>
          ) : isMemoryMatch ? (
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
              {(memoryConfig.pairs || []).map((pair, idx) => (
                <div
                  key={pair.id || idx}
                  className="px-2.5 py-1 rounded-xl text-xs font-bold shrink-0 flex items-center gap-1.5 border bg-slate-950/80 border-slate-800 text-slate-300"
                >
                  {pair.imageUrl ? (
                    <img
                      src={pair.imageUrl}
                      alt={pair.name}
                      className="w-4 h-4 object-contain rounded"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <span className="w-2 h-2 rounded-full bg-amber-400" />
                  )}
                  <span className="truncate max-w-[100px]">{pair.name || `Pair ${idx + 1}`}</span>
                  <span className="text-[10px] text-amber-400 font-mono">
                    {pair.points ? `+${pair.points}` : '+100'}
                  </span>
                </div>
              ))}
            </div>
          ) : (
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
                  {item.imageUrl ? (
                    <img
                      src={item.imageUrl}
                      alt={item.name}
                      className="w-3.5 h-3.5 object-contain rounded"
                      referrerPolicy="no-referrer"
                    />
                  ) : item.isHazard ? (
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
          )}
        </div>
      )}
    </div>
  );
};
