import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from '../config';
import { GameState, GameStats, GameSettings } from '../../types';
import { ThemeDropItem, ThemeDifficultyStage } from '../../themes/types';
import { Basket } from '../objects/Basket';
import { FallingItem, Durian } from '../objects/Durian';
import { soundManager } from '../systems/SoundManager';
import { getGameSettings } from '../settings';
import { getActiveTheme, getCanonicalAssetThemeId, resolveThemeBaseId, resolveThemeDefaultBgImage, resolveThemeDefaultItemImage } from '../../themes';

export class GameScene extends Phaser.Scene {
  private basket!: Basket;
  private itemsGroup!: Phaser.Physics.Arcade.Group;
  private leafEmitter!: Phaser.GameObjects.Particles.ParticleEmitter;

  private gameState: GameState = 'START';
  private score: number = 0;
  private highScore: number = 0;
  private customGameDuration: number = 20;
  private fallSpeedMultiplier: number = 0.7;
  private timeRemaining: number = 20;
  private timeElapsed: number = 0;

  // Stats counters
  private greenCaught: number = 0;
  private orangeCaught: number = 0;
  private goldenCaught: number = 0;
  private duriansMissed: number = 0;
  private itemsCaughtById: Record<string, number> = {};

  private spawnTimerEvent?: Phaser.Time.TimerEvent;
  private secondTimerEvent?: Phaser.Time.TimerEvent;
  private countdownTimerEvent?: Phaser.Time.TimerEvent;
  private countdownValue: number = 3;

  private redFlashOverlay!: Phaser.GameObjects.Rectangle;
  private bgImage!: Phaser.GameObjects.Image;
  private loadedThemeId: string = 'default';
  private currentDifficultyStageIndex: number = -1;

  // Authoritative Canonical Logical Dimensions (1024x576 Landscape / 576x1024 Portrait)
  private logicalWidth: number = 1024;
  private logicalHeight: number = 576;
  private isPortraitMode: boolean = false;

  // React Callbacks
  public onStatsChange?: (stats: GameStats) => void;
  public onStateChange?: (state: GameState) => void;
  public onCountdownUpdate?: (count: number | string) => void;

  constructor() {
    super('GameScene');
  }

  public init(data?: { designWidth?: number; designHeight?: number; isPortrait?: boolean }) {
    if (data?.designWidth && data?.designHeight) {
      this.logicalWidth = data.designWidth;
      this.logicalHeight = data.designHeight;
      this.isPortraitMode = Boolean(data.isPortrait);
    } else {
      this.logicalWidth = this.scale.width || (GAME_WIDTH ?? 1024);
      this.logicalHeight = this.scale.height || (GAME_HEIGHT ?? 576);
      this.isPortraitMode = this.logicalHeight > this.logicalWidth;
    }
  }

  public getLogicalWidth(): number {
    return this.logicalWidth;
  }

  public getLogicalHeight(): number {
    return this.logicalHeight;
  }

  public isPortrait(): boolean {
    return this.isPortraitMode;
  }

  create() {
    const theme = getActiveTheme();
    this.loadedThemeId = theme.id;
    this.customGameDuration = theme.physics_config?.gameDurationSeconds || 20;
    this.fallSpeedMultiplier = theme.physics_config?.fallSpeedMultiplier || 0.7;
    this.timeRemaining = this.customGameDuration;

    // Resolve canonical logical dimensions
    const sceneWidth = this.logicalWidth || this.scale.width;
    const sceneHeight = this.logicalHeight || this.scale.height;
    this.logicalWidth = sceneWidth;
    this.logicalHeight = sceneHeight;
    this.isPortraitMode = sceneHeight > sceneWidth;

    // 0. Initialize Arcade Physics World Bounds strictly to logical coordinate dimensions
    this.physics.world.setBounds(0, 0, sceneWidth, sceneHeight);

    // 1. Background Image (Theme-driven with fallback)
    const assetThemeId = getCanonicalAssetThemeId(theme);
    const isKnownFestive = assetThemeId === 'christmas' || assetThemeId === 'cny';
    const bgKey = `theme_${theme.id}_bg`;
    let bgTexture = 'background';
    if (this.textures.exists(bgKey)) {
      bgTexture = bgKey;
    } else if (this.textures.exists(theme.background_url)) {
      bgTexture = theme.background_url;
    } else if (isKnownFestive) {
      console.error(
        `[ThemeAssets] Missing canonical asset:\ntheme=${assetThemeId}\nassetType=background\nexpected=${resolveThemeDefaultBgImage(theme)}`
      );
    }

    this.bgImage = this.add.image(sceneWidth / 2, sceneHeight / 2, bgTexture).setDepth(0);
    // Cover mode scaling to preserve aspect ratio without stretching or distortion
    const bgFrame = this.textures.getFrame(bgTexture, '__BASE');
    const texW = bgFrame && bgFrame.width > 0 ? bgFrame.width : sceneWidth;
    const texH = bgFrame && bgFrame.height > 0 ? bgFrame.height : sceneHeight;
    const bgScale = Math.max(sceneWidth / texW, sceneHeight / texH);
    this.bgImage.setScale(bgScale);
    this.bgImage.setPosition(sceneWidth / 2, sceneHeight / 2);

    // 2. Ambient Particles Weather Effect
    const particleKey = theme.visuals_config?.particleGood || theme.particles?.good || 'particle_leaf';
    const validParticle = this.textures.exists(particleKey) ? particleKey : 'particle_leaf';

    this.leafEmitter = this.add.particles(0, -20, validParticle, {
      x: { min: 0, max: sceneWidth },
      speedY: { min: 30, max: 80 },
      speedX: { min: -20, max: 20 },
      rotate: { min: 0, max: 360 },
      scale: { start: 0.8, end: 0.4 },
      alpha: { start: 0.7, end: 0.2 },
      lifespan: 8000,
      frequency: 400,
    });
    this.leafEmitter.setDepth(4);

    // 3. Red Flash Overlay for Bad Item Warning
    this.redFlashOverlay = this.add
      .rectangle(sceneWidth / 2, sceneHeight / 2, sceneWidth, sceneHeight, 0xff0000)
      .setDepth(30)
      .setAlpha(0);

    // 4. Create Player Catcher (Basket)
    const catcherKey = `theme_${theme.id}_catcher`;
    this.basket = new Basket(this, sceneWidth / 2, sceneHeight - 70, catcherKey);

    // 5. Falling Objects Group
    this.itemsGroup = this.physics.add.group({
      runChildUpdate: true,
    });

    // 6. Setup Collision Overlap
    this.physics.add.overlap(
      this.basket,
      this.itemsGroup,
      this.handleItemCatch as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback,
      undefined,
      this
    );

    // 7. Load Saved High Score & Settings
    this.loadHighScore();
    const settings = getGameSettings();
    this.applySettings(settings);
    soundManager.applySettings(settings);

    // Set initial state
    this.setGameState('START');
  }

  public refreshTheme() {
    const theme = getActiveTheme();
    if (theme.id !== this.loadedThemeId) {
      this.scene.restart();
    }
  }

  public applySettings(settings: GameSettings) {
    if (settings.gameDurationSeconds) {
      this.customGameDuration = settings.gameDurationSeconds;
    }
    if (settings.fallSpeedMultiplier) {
      this.fallSpeedMultiplier = settings.fallSpeedMultiplier;
    }
    if (this.gameState === 'START') {
      this.timeRemaining = this.customGameDuration;
      this.emitStats();
    }
  }

  update(time: number, delta: number) {
    if (this.gameState === 'PLAYING') {
      this.basket.updateBasket(delta);

      // Check for missed falling objects reaching floor in logical coordinate space
      this.itemsGroup.getChildren().forEach((child) => {
        const item = child as FallingItem;
        if (item && item.active && !item.isCollected) {
          const offscreenThreshold =
            this.logicalHeight + Math.max(30, (item.itemDisplayHeight || item.displayHeight || 64) / 2 + 10);
          if (item.y > offscreenThreshold) {
            this.duriansMissed++;
            item.isCollected = true;
            item.destroy();
            this.emitStats();
          }
        }
      });
    }
  }

  public setHandTargetX(xRatio: number) {
    if (this.gameState === 'PLAYING' && this.basket) {
      const halfBasketW = (this.basket.getBasketWidth?.() || 140) / 2;
      const targetX = halfBasketW + xRatio * (this.logicalWidth - halfBasketW * 2);
      this.basket.setHandTargetX(targetX);
    }
  }

  public startNewGame() {
    this.refreshTheme();
    this.resetStats();
    this.setGameState('COUNTDOWN');
    this.countdownValue = 3;

    if (this.onCountdownUpdate) {
      this.onCountdownUpdate(this.countdownValue);
    }

    soundManager.playCountdownBeep(false);

    this.countdownTimerEvent = this.time.addEvent({
      delay: 1000,
      repeat: 3,
      callback: () => {
        this.countdownValue--;
        if (this.countdownValue > 0) {
          if (this.onCountdownUpdate) this.onCountdownUpdate(this.countdownValue);
          soundManager.playCountdownBeep(false);
        } else if (this.countdownValue === 0) {
          if (this.onCountdownUpdate) this.onCountdownUpdate('GO!');
          soundManager.playCountdownBeep(true);
        } else {
          if (this.onCountdownUpdate) this.onCountdownUpdate('');
          this.beginGameplay();
        }
      },
    });
  }

  public getIsPlaying(): boolean {
    return this.gameState === 'PLAYING';
  }

  private beginGameplay() {
    this.setGameState('PLAYING');
    this.physics.resume();
    soundManager.playStart();
    soundManager.startBgm();

    this.currentDifficultyStageIndex = -1;

    this.secondTimerEvent = this.time.addEvent({
      delay: 1000,
      loop: true,
      callback: () => {
        if (this.gameState !== 'PLAYING') return;

        this.timeRemaining--;
        this.timeElapsed++;
        this.emitStats();

        this.checkDifficultyUpdate();

        if (this.timeRemaining <= 0) {
          this.triggerGameOver();
        }
      },
    });

    const { stage } = this.getCurrentDifficulty();
    this.spawnDropItem(stage);
    this.time.delayedCall(300, () => this.spawnDropItem(stage));

    this.scheduleNextSpawn();
  }

  private getCurrentDifficulty(): { stage: ThemeDifficultyStage; index: number } {
    const theme = getActiveTheme();
    const stages = theme.physics_config?.difficultyStages || [];

    if (stages.length === 0) {
      return {
        stage: {
          timeThreshold: 0,
          spawnInterval: 750,
          speedMin: 350,
          speedMax: 550,
          hazardRatio: 0.25,
          bonusRatio: 0.05,
          stageName: 'Standard Stage',
        },
        index: 0,
      };
    }

    let currentIndex = 0;
    for (let i = stages.length - 1; i >= 0; i--) {
      if (this.timeElapsed >= stages[i].timeThreshold) {
        currentIndex = i;
        break;
      }
    }

    return { stage: stages[currentIndex], index: currentIndex };
  }

  private checkDifficultyUpdate() {
    const { index } = this.getCurrentDifficulty();
    if (index !== this.currentDifficultyStageIndex) {
      this.currentDifficultyStageIndex = index;
      this.scheduleNextSpawn();
    }
  }

  private scheduleNextSpawn() {
    if (this.spawnTimerEvent) {
      this.spawnTimerEvent.destroy();
    }

    if (this.gameState !== 'PLAYING') return;

    const { stage } = this.getCurrentDifficulty();

    this.spawnTimerEvent = this.time.addEvent({
      delay: stage.spawnInterval || 750,
      loop: true,
      callback: () => {
        this.spawnDropItem(stage);
      },
    });
  }

  /**
   * Spawns a falling item chosen via weighted random selection among configured items
   */
  private spawnDropItem(stage: ThemeDifficultyStage) {
    if (this.gameState !== 'PLAYING') return;

    const theme = getActiveTheme();
    const items = (theme.items_config || []).filter((i) => i.enabled);

    if (items.length === 0) return;

    // Pick item based on weights & difficulty hazard/bonus biases
    const rand = Math.random();
    let selectedItem: ThemeDropItem | undefined;

    const hazards = items.filter((i) => i.isHazard);
    const bonuses = items.filter((i) => i.isBonus);
    const regularGoods = items.filter((i) => !i.isHazard && !i.isBonus);

    if (hazards.length > 0 && rand < (stage.hazardRatio ?? 0.25)) {
      selectedItem = hazards[Math.floor(Math.random() * hazards.length)];
    } else if (bonuses.length > 0 && rand > 1.0 - (stage.bonusRatio ?? 0.08) && this.timeElapsed >= 5) {
      selectedItem = bonuses[Math.floor(Math.random() * bonuses.length)];
    } else if (regularGoods.length > 0) {
      // Weighted selection among regulars
      const totalWeight = regularGoods.reduce((sum, item) => sum + (item.spawnWeight || 10), 0);
      let r = Math.random() * totalWeight;
      for (const item of regularGoods) {
        r -= item.spawnWeight || 10;
        if (r <= 0) {
          selectedItem = item;
          break;
        }
      }
      if (!selectedItem) selectedItem = regularGoods[0];
    } else {
      selectedItem = items[Math.floor(Math.random() * items.length)];
    }

    if (!selectedItem) return;

    // Texture resolution
    const themeId = theme.id;
    const assetThemeId = getCanonicalAssetThemeId(theme);
    const isKnownFestive = assetThemeId === 'christmas' || assetThemeId === 'cny';
    const baseId = theme.base_theme_id || resolveThemeBaseId(theme);

    let textureKey = `theme_${themeId}_item_${selectedItem.id}`;
    if (!this.textures.exists(textureKey)) {
      if (selectedItem.isHazard) {
        if (this.textures.exists(`theme_${themeId}_bad`)) {
          textureKey = `theme_${themeId}_bad`;
        } else if (isKnownFestive) {
          console.error(
            `[ThemeAssets] Missing canonical asset:\ntheme=${assetThemeId}\nassetType=hazardItem\nexpected=${resolveThemeDefaultItemImage(theme, selectedItem)}`
          );
          // Generic procedural emergency fallback only after reporting - never ticket/mask/star
          textureKey = this.textures.exists('orange_durian') ? 'orange_durian' : 'theme_spike';
        } else if (this.textures.exists('mask')) {
          textureKey = 'mask';
        } else {
          textureKey = 'orange_durian';
        }
      } else if (selectedItem.isBonus) {
        if (this.textures.exists(`theme_${themeId}_bonus`)) {
          textureKey = `theme_${themeId}_bonus`;
        } else if (isKnownFestive) {
          console.error(
            `[ThemeAssets] Missing canonical asset:\ntheme=${assetThemeId}\nassetType=bonusItem\nexpected=${resolveThemeDefaultItemImage(theme, selectedItem)}`
          );
          // Generic procedural emergency fallback only after reporting - never ticket/mask/star
          textureKey = this.textures.exists('golden_durian') ? 'golden_durian' : 'theme_star';
        } else if (this.textures.exists('star')) {
          textureKey = 'star';
        } else {
          textureKey = 'golden_durian';
        }
      } else {
        if (this.textures.exists(`theme_${themeId}_good`)) {
          textureKey = `theme_${themeId}_good`;
        } else if (isKnownFestive) {
          console.error(
            `[ThemeAssets] Missing canonical asset:\ntheme=${assetThemeId}\nassetType=goodItem\nexpected=${resolveThemeDefaultItemImage(theme, selectedItem)}`
          );
          // Generic procedural emergency fallback only after reporting - never ticket/mask/star
          textureKey = this.textures.exists('green_durian') ? 'green_durian' : 'theme_gold';
        } else if (this.textures.exists('ticket')) {
          textureKey = 'ticket';
        } else {
          textureKey = 'green_durian';
        }
      }
    }

    const halfBasketW = (this.basket?.getBasketWidth?.() || 140) / 2;
    const minSpawnX = Math.max(60, halfBasketW * 0.7);
    const maxSpawnX = this.logicalWidth - minSpawnX;
    const spawnX = Phaser.Math.Between(minSpawnX, maxSpawnX);

    const baseSpeed = Phaser.Math.Between(stage.speedMin || 350, stage.speedMax || 550);
    // Scale fall speed by height ratio so traversal duration is preserved across aspect ratios
    const heightRatio = this.logicalHeight / 576;
    const fallSpeed = Math.round(
      baseSpeed * this.fallSpeedMultiplier * (selectedItem.speedMultiplier || 1.0) * heightRatio
    );

    const itemSprite = new FallingItem(this, spawnX, -30, selectedItem, fallSpeed, textureKey);
    this.itemsGroup.add(itemSprite);

    if (itemSprite.body) {
      const body = itemSprite.body as Phaser.Physics.Arcade.Body;
      body.setAllowGravity(false);
      body.setVelocityY(fallSpeed);
    }
  }

  private handleItemCatch(basket: Basket, item: FallingItem) {
    if (this.gameState !== 'PLAYING') return;
    if (!item || !item.active || item.isCollected) return;

    item.isCollected = true;
    item.setActive(false);
    item.setVisible(false);
    if (item.body) {
      item.body.enable = false;
    }

    const cfg = item.itemConfig;
    this.score += cfg.points;

    // Update stats counters
    const itemId = cfg.id || 'unknown';
    this.itemsCaughtById[itemId] = (this.itemsCaughtById[itemId] || 0) + 1;

    if (cfg.isHazard || cfg.points < 0) {
      this.orangeCaught++;
      soundManager.playOrangeCatch();
      this.triggerRedFlash();
    } else if (cfg.isBonus || cfg.points >= 50) {
      this.goldenCaught++;
      soundManager.playGoldenCatch();
    } else {
      this.greenCaught++;
      soundManager.playGreenCatch();
    }

    if (this.score > this.highScore) {
      this.highScore = this.score;
      this.saveHighScore();
    }

    this.basket.triggerCatchBounce();
    item.collectEffect();

    this.emitStats();
  }

  private triggerRedFlash() {
    this.tweens.add({
      targets: this.redFlashOverlay,
      alpha: 0.35,
      duration: 100,
      yoyo: true,
      ease: 'Quad.easeInOut',
    });

    this.cameras.main.shake(150, 0.008);
  }

  private triggerGameOver() {
    this.setGameState('GAME_OVER');

    if (this.spawnTimerEvent) this.spawnTimerEvent.destroy();
    if (this.secondTimerEvent) this.secondTimerEvent.destroy();

    this.basket.setVelocityX(0);
    this.itemsGroup.getChildren().forEach((child) => {
      const item = child as FallingItem;
      if (item.body) (item.body as Phaser.Physics.Arcade.Body).velocity.y = 0;
    });

    soundManager.stopBgm();
    soundManager.playGameOver();

    this.emitStats();
  }

  public pauseGame() {
    if (this.gameState === 'PLAYING') {
      this.setGameState('PAUSED');
      this.physics.pause();
    }
  }

  public resumeGame() {
    if (this.gameState === 'PAUSED') {
      this.setGameState('PLAYING');
      this.physics.resume();
    }
  }

  public stopGame() {
    soundManager.stopBgm();
    this.resetStats();
    this.physics.pause();
    this.setGameState('START');
  }

  private resetStats() {
    this.score = 0;
    this.timeRemaining = this.customGameDuration;
    this.timeElapsed = 0;
    this.greenCaught = 0;
    this.orangeCaught = 0;
    this.goldenCaught = 0;
    this.duriansMissed = 0;
    this.itemsCaughtById = {};

    this.itemsGroup.clear(true, true);

    if (this.basket) {
      this.basket.setPosition(this.logicalWidth / 2, this.logicalHeight - 70);
      this.basket.setVelocityX(0);
    }

    if (this.spawnTimerEvent) this.spawnTimerEvent.destroy();
    if (this.secondTimerEvent) this.secondTimerEvent.destroy();
    if (this.countdownTimerEvent) this.countdownTimerEvent.destroy();

    this.emitStats();
  }

  public resizeLayout(newWidth: number, newHeight: number) {
    const oldWidth = this.logicalWidth || 1024;
    const oldHeight = this.logicalHeight || 576;

    this.logicalWidth = newWidth;
    this.logicalHeight = newHeight;
    this.isPortraitMode = newHeight > newWidth;

    // 1. Update physics world bounds immediately
    if (this.physics?.world) {
      this.physics.world.setBounds(0, 0, newWidth, newHeight);
    }

    if (!this.scene.isActive()) return;

    // 2. Update background image position and cover scale
    if (this.bgImage && this.bgImage.active) {
      const textureKey = this.bgImage.texture.key;
      const bgFrame = this.textures.getFrame(textureKey, '__BASE');
      const texW = bgFrame && bgFrame.width > 0 ? bgFrame.width : newWidth;
      const texH = bgFrame && bgFrame.height > 0 ? bgFrame.height : newHeight;
      const bgScale = Math.max(newWidth / texW, newHeight / texH);
      this.bgImage.setScale(bgScale);
      this.bgImage.setPosition(newWidth / 2, newHeight / 2);
    }

    // 3. Update ambient particles emitter bounds
    if (this.leafEmitter && this.leafEmitter.active) {
      this.leafEmitter.addEmitZone({
        type: 'random',
        source: new Phaser.Geom.Rectangle(0, -20, newWidth, 10),
      });
    }

    // 4. Update red flash overlay
    if (this.redFlashOverlay) {
      this.redFlashOverlay.setPosition(newWidth / 2, newHeight / 2);
      this.redFlashOverlay.setSize(newWidth, newHeight);
    }

    // 5. Update basket position and bounds proportionally
    if (this.basket && this.basket.active) {
      const halfBasketW = (this.basket.getBasketWidth?.() || 140) / 2;
      const ratioX = oldWidth > 0 ? this.basket.x / oldWidth : 0.5;
      const newX = Phaser.Math.Clamp(ratioX * newWidth, halfBasketW, newWidth - halfBasketW);
      const newY = newHeight - 70;
      this.basket.setPosition(newX, newY);
      this.basket.onSceneResize(newWidth, newHeight);
    }

    // 6. Proportional adjustment for active falling items
    if (this.itemsGroup && oldWidth > 0 && oldWidth !== newWidth) {
      const widthRatio = newWidth / oldWidth;
      this.itemsGroup.getChildren().forEach((child) => {
        const item = child as FallingItem;
        if (item && item.active && !item.isCollected) {
          item.x = Phaser.Math.Clamp(item.x * widthRatio, 40, newWidth - 40);
        }
      });
    }
  }

  private setGameState(state: GameState) {
    this.gameState = state;
    if (this.onStateChange) {
      this.onStateChange(state);
    }
  }

  private emitStats() {
    if (this.onStatsChange) {
      this.onStatsChange({
        score: this.score,
        highScore: this.highScore,
        greenCaught: this.greenCaught,
        orangeCaught: this.orangeCaught,
        goldenCaught: this.goldenCaught,
        duriansMissed: this.duriansMissed,
        timeRemaining: this.timeRemaining,
        itemsCaughtById: this.itemsCaughtById,
      });
    }
  }

  public toggleFullscreen(target?: HTMLElement | null) {
    const el = target || this.game.canvas.parentElement?.parentElement;
    if (!el) return;

    if (document.fullscreenElement || (document as any).webkitFullscreenElement) {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    } else {
      if (el.requestFullscreen) {
        el.requestFullscreen();
      }
    }
  }

  private loadHighScore() {
    try {
      const theme = getActiveTheme();
      const key = `catch_brand_high_score_${theme.slug || theme.id}`;
      const legacyKey = `durian_catcher_high_score_${theme.slug || theme.id}`;
      const saved =
        localStorage.getItem(key) ||
        localStorage.getItem(legacyKey) ||
        localStorage.getItem('catch_brand_high_score') ||
        localStorage.getItem('durian_catcher_high_score');
      if (saved) {
        this.highScore = parseInt(saved, 10) || 0;
      }
    } catch {
      this.highScore = 0;
    }
  }

  private saveHighScore() {
    try {
      const theme = getActiveTheme();
      const key = `catch_brand_high_score_${theme.slug || theme.id}`;
      localStorage.setItem(key, this.highScore.toString());
      localStorage.setItem('catch_brand_high_score', this.highScore.toString());
    } catch {
      // Storage unavailable
    }
  }
}
