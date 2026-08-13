import React, { useEffect, useRef, useState, useCallback } from 'react';
import { GameTheme, ThemeDropItem } from '../../themes/types';
import { soundManager } from '../../game/systems/SoundManager';
import {
  Volume2,
  VolumeX,
  RotateCcw,
  Sparkles,
  Gamepad2,
  Flame,
  Star,
} from 'lucide-react';

interface LiveThemePreviewProps {
  theme: GameTheme;
  onTriggerItemDrop?: (item: ThemeDropItem) => void;
  className?: string;
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

export const LiveThemePreview: React.FC<LiveThemePreviewProps> = ({ theme, className = '' }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [isPlaying] = useState<boolean>(true);
  const [isInteractive, setIsInteractive] = useState<boolean>(false);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [score, setScore] = useState<number>(0);
  const [timeRemaining, setTimeRemaining] = useState<number>(
    theme.physics_config?.gameDurationSeconds || 20
  );
  const [currentStageName, setCurrentStageName] = useState<string>('Stage 1: Calm');

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
        state.timeRemaining = Math.max(
          0,
          (theme.physics_config?.gameDurationSeconds || 20) - state.timeElapsed
        );

        if (state.timeRemaining <= 0) {
          state.timeElapsed = 0;
          state.timeRemaining = theme.physics_config?.gameDurationSeconds || 20;
        }

        const stages = theme.physics_config?.difficultyStages || [];
        let currentStage = stages[0];
        for (let i = stages.length - 1; i >= 0; i--) {
          if (state.timeElapsed >= stages[i].timeThreshold) {
            currentStage = stages[i];
            break;
          }
        }
        if (currentStage?.stageName) {
          setCurrentStageName(currentStage.stageName);
        }

        const spawnInterval = (currentStage?.spawnInterval || 750) / 1000;
        if (now - state.lastSpawnTime > spawnInterval * 1000) {
          state.lastSpawnTime = now;
          const items = (theme.items_config || []).filter((i) => i.enabled);
          if (items.length > 0) {
            const rand = Math.random();
            let chosen: ThemeDropItem | undefined;
            const hazards = items.filter((i) => i.isHazard);
            const bonuses = items.filter((i) => i.isBonus);
            const goods = items.filter((i) => !i.isHazard && !i.isBonus);

            if (hazards.length > 0 && rand < (currentStage?.hazardRatio ?? 0.25)) {
              chosen = hazards[Math.floor(Math.random() * hazards.length)];
            } else if (
              bonuses.length > 0 &&
              rand > 1.0 - (currentStage?.bonusRatio ?? 0.08)
            ) {
              chosen = bonuses[Math.floor(Math.random() * bonuses.length)];
            } else if (goods.length > 0) {
              const totalW = goods.reduce((sum, it) => sum + (it.spawnWeight || 10), 0);
              let r = Math.random() * totalW;
              for (const it of goods) {
                r -= it.spawnWeight || 10;
                if (r <= 0) {
                  chosen = it;
                  break;
                }
              }
              if (!chosen) chosen = goods[0];
            } else {
              chosen = items[Math.floor(Math.random() * items.length)];
            }

            if (chosen) {
              const baseSpeed =
                currentStage?.speedMin && currentStage?.speedMax
                  ? Math.random() * (currentStage.speedMax - currentStage.speedMin) +
                    currentStage.speedMin
                  : 380;
              const fallMult = theme.physics_config?.fallSpeedMultiplier || 0.7;
              const itemSpeedMult = chosen.speedMultiplier || 1.0;

              state.items.push({
                id: `item_${now}_${Math.random()}`,
                config: chosen,
                x: Math.random() * (V_WIDTH - 200) + 100,
                y: -30,
                speed: baseSpeed * fallMult * itemSpeedMult,
                rotation: 0,
                rotSpeed: (Math.random() - 0.5) * 3,
                radius: 26,
                collected: false,
              });
            }
          }
        }

        const basketSpeed = (theme.basket_config?.speed || 600) * 1.2;
        if (!isInteractive) {
          const goodItems = state.items.filter(
            (it) => !it.config.isHazard && it.y < V_HEIGHT - 60 && it.y > 50
          );
          if (goodItems.length > 0) {
            goodItems.sort((a, b) => b.y - a.y);
            state.basketTargetX = goodItems[0].x;
          } else {
            state.basketTargetX = V_WIDTH / 2 + Math.sin(state.timeElapsed * 1.5) * 180;
          }
        }

        const dx = state.basketTargetX - state.basketX;
        const maxStep = basketSpeed * dt;
        if (Math.abs(dx) <= maxStep) {
          state.basketX = state.basketTargetX;
        } else {
          state.basketX += Math.sign(dx) * maxStep;
        }

        const basketW = theme.basket_config?.width || 120;
        state.basketX = Math.max(basketW / 2 + 20, Math.min(V_WIDTH - basketW / 2 - 20, state.basketX));

        const basketY = V_HEIGHT - 70;
        const catchRatio = theme.basket_config?.catchAreaRatio || 0.85;
        const catchWidth = basketW * catchRatio;
        const catchHeight = 28;
        const catchLeft = state.basketX - catchWidth / 2;
        const catchRight = state.basketX + catchWidth / 2;
        const catchTop = basketY - catchHeight / 2;
        const catchBottom = basketY + catchHeight / 2;

        for (let i = state.items.length - 1; i >= 0; i--) {
          const item = state.items[i];
          item.y += item.speed * dt;
          item.rotation += item.rotSpeed * dt;

          if (
            !item.collected &&
            item.y >= catchTop &&
            item.y <= catchBottom &&
            item.x >= catchLeft &&
            item.x <= catchRight
          ) {
            item.collected = true;
            state.caughtCount++;
            state.score += item.config.points;
            state.basketBounce = 1.0;

            const pColor = item.config.isHazard
              ? '#ef4444'
              : item.config.isBonus
              ? '#fbbf24'
              : theme.visuals_config?.accentColor || '#10b981';

            for (let p = 0; p < 12; p++) {
              const angle = Math.random() * Math.PI * 2;
              const spd = Math.random() * 150 + 60;
              state.particles.push({
                x: item.x,
                y: item.y,
                vx: Math.cos(angle) * spd,
                vy: Math.sin(angle) * spd - 60,
                alpha: 1.0,
                size: Math.random() * 5 + 3,
                color: pColor,
                life: 0,
                maxLife: 0.5,
              });
            }

            if (!isMuted) {
              if (item.config.isHazard) {
                soundManager.playOrangeCatch();
              } else if (item.config.isBonus) {
                soundManager.playGoldenCatch();
              } else {
                soundManager.playGreenCatch();
              }
            }

            if (item.config.isHazard) {
              state.redFlashAlpha = 0.4;
            }

            state.items.splice(i, 1);
            continue;
          }

          if (item.y > V_HEIGHT + 40) {
            state.items.splice(i, 1);
          }
        }

        for (let p = state.particles.length - 1; p >= 0; p--) {
          const part = state.particles[p];
          part.x += part.vx * dt;
          part.y += part.vy * dt;
          part.vy += 300 * dt;
          part.life += dt;
          part.alpha = Math.max(0, 1.0 - part.life / part.maxLife);
          if (part.life >= part.maxLife) {
            state.particles.splice(p, 1);
          }
        }

        state.redFlashAlpha = Math.max(0, state.redFlashAlpha - dt * 2.5);
        state.basketBounce = Math.max(0, state.basketBounce - dt * 6.0);

        setScore(state.score);
        setTimeRemaining(Math.ceil(state.timeRemaining));
      }

      ctx.clearRect(0, 0, V_WIDTH, V_HEIGHT);

      // Background
      const bgUrl = theme.background_url || theme.background;
      const bgImg = getOrLoadImage(bgUrl);
      if (bgImg) {
        ctx.drawImage(bgImg, 0, 0, V_WIDTH, V_HEIGHT);
      } else {
        const grad = ctx.createLinearGradient(0, 0, 0, V_HEIGHT);
        grad.addColorStop(0, theme.visuals_config?.bgGradientFrom || '#091b10');
        grad.addColorStop(0.5, theme.visuals_config?.bgGradientVia || '#0f2f1d');
        grad.addColorStop(1, theme.visuals_config?.bgGradientTo || '#040d07');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, V_WIDTH, V_HEIGHT);
      }

      // Scanline effect
      ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
      for (let y = 0; y < V_HEIGHT; y += 4) {
        ctx.fillRect(0, y, V_WIDTH, 1.5);
      }

      // Falling items
      for (const item of state.items) {
        ctx.save();
        ctx.translate(item.x, item.y);
        ctx.rotate(item.rotation);

        const itemImg = getOrLoadImage(item.config.imageUrl);
        if (itemImg) {
          const sz = item.radius * 2.2;
          ctx.drawImage(itemImg, -sz / 2, -sz / 2, sz, sz);
        } else {
          ctx.beginPath();
          ctx.arc(0, 0, item.radius, 0, Math.PI * 2);
          if (item.config.isHazard) {
            ctx.fillStyle = '#ef4444';
            ctx.shadowColor = '#f87171';
            ctx.shadowBlur = 10;
          } else if (item.config.isBonus) {
            ctx.fillStyle = '#f59e0b';
            ctx.shadowColor = '#fbbf24';
            ctx.shadowBlur = 14;
          } else {
            ctx.fillStyle = theme.visuals_config?.accentColor || '#10b981';
            ctx.shadowColor = theme.visuals_config?.accentColor || '#34d399';
            ctx.shadowBlur = 8;
          }
          ctx.fill();

          ctx.shadowBlur = 0;
          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 12px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(
            item.config.isHazard
              ? '💣'
              : item.config.isBonus
              ? '★'
              : `${item.config.points > 0 ? '+' : ''}${item.config.points}`,
            0,
            0
          );
        }
        ctx.restore();
      }

      // Particles
      for (const p of state.particles) {
        ctx.save();
        ctx.globalAlpha = p.alpha;
        ctx.fillStyle = p.color;
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 6;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // Basket / Catcher
      const basketW = theme.basket_config?.width || 120;
      const basketH = theme.basket_config?.height || 54;
      const basketY = V_HEIGHT - 70;
      const bounceScale = 1.0 + state.basketBounce * 0.15;

      ctx.save();
      ctx.translate(state.basketX, basketY);
      ctx.scale(bounceScale, 1.0 / bounceScale);

      const catcherUrl = theme.basket_config?.imageUrl || theme.catcher;
      const catcherImg = getOrLoadImage(catcherUrl);

      if (catcherImg) {
        ctx.drawImage(catcherImg, -basketW / 2, -basketH / 2, basketW, basketH);
      } else {
        ctx.beginPath();
        ctx.roundRect(-basketW / 2, -basketH / 2, basketW, basketH, [6, 6, 16, 16]);
        ctx.fillStyle = '#d97706';
        ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
        ctx.shadowBlur = 8;
        ctx.fill();

        ctx.beginPath();
        ctx.roundRect(-basketW / 2, -basketH / 2, basketW, 10, [6, 6, 0, 0]);
        ctx.fillStyle = '#fbbf24';
        ctx.fill();

        ctx.shadowBlur = 0;
        ctx.fillStyle = '#78350f';
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(theme.basket_config?.name || 'BASKET', 0, 4);
      }

      const catchRatio = theme.basket_config?.catchAreaRatio || 0.85;
      const catchW = basketW * catchRatio;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-catchW / 2, -basketH / 2 + 2);
      ctx.lineTo(catchW / 2, -basketH / 2 + 2);
      ctx.stroke();

      ctx.restore();

      // Red Flash
      if (state.redFlashAlpha > 0) {
        ctx.fillStyle = `rgba(239, 68, 68, ${state.redFlashAlpha})`;
        ctx.fillRect(0, 0, V_WIDTH, V_HEIGHT);
      }

      // Brand Logo
      const logoUrl = theme.branding?.clientLogoUrl || theme.branding?.logoUrl || theme.clientLogo || theme.logo;
      const logoImg = getOrLoadImage(logoUrl);
      if (logoImg) {
        ctx.drawImage(logoImg, 24, 20, 120, 36);
      }

      animationFrameId = requestAnimationFrame(render);
    };

    animationFrameId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [isPlaying, isInteractive, isMuted, theme, getOrLoadImage]);

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isInteractive || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const scaleX = 1024 / rect.width;
    const mouseX = (e.clientX - rect.left) * scaleX;
    simState.current.basketTargetX = mouseX;
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
            Live Game Simulation
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
            {isMuted ? <VolumeX className="w-3.5 h-3.5 text-slate-500" /> : <Volume2 className="w-3.5 h-3.5 text-emerald-400" />}
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

      {/* Main 16:9 Canvas Viewport */}
      <div className="relative aspect-[16/9] w-full rounded-2xl overflow-hidden bg-slate-950 border border-slate-800 shadow-inner group">
        <canvas
          ref={canvasRef}
          width={1024}
          height={576}
          onPointerMove={handlePointerMove}
          className={`w-full h-full object-contain ${
            isInteractive ? 'cursor-ew-resize' : 'cursor-default'
          }`}
        />

        {/* HUD Overlay Top */}
        <div className="absolute top-2 inset-x-3 flex items-center justify-between pointer-events-none text-xs font-mono font-bold select-none">
          <div className="bg-slate-950/75 backdrop-blur-sm border border-slate-800/80 px-2.5 py-1 rounded-xl flex items-center gap-2">
            <span
              style={{ color: theme.branding?.accentColor || '#10b981' }}
              className="truncate max-w-[130px] font-black"
            >
              {theme.branding?.gameTitle || theme.name}
            </span>
            <span className="text-[10px] text-slate-400 font-sans px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800">
              {currentStageName}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <div className="bg-slate-950/85 backdrop-blur-sm border border-slate-800 px-2.5 py-1 rounded-xl text-slate-200">
              TIME: <span className="text-amber-400 font-black">{timeRemaining}s</span>
            </div>
            <div
              style={{ color: theme.branding?.hudColor || '#c8e038' }}
              className="bg-slate-950/85 backdrop-blur-sm border border-slate-800 px-3 py-1 rounded-xl font-black text-sm"
            >
              SCORE: {score}
            </div>
          </div>
        </div>

        {isInteractive && (
          <div className="absolute bottom-2 inset-x-0 mx-auto w-fit bg-amber-500/90 text-slate-950 px-3 py-1 rounded-full text-[11px] font-extrabold shadow-lg pointer-events-none animate-bounce">
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
