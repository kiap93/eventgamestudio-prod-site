import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from '../config';
import {
  getActiveTheme,
  getCanonicalAssetThemeId,
  resolveThemeDefaultBasketImage,
  ThemeBasketConfig,
  calculateCatcherSize,
  calculateCatcherTargetY,
} from '../../themes';

export class Basket extends Phaser.Physics.Arcade.Sprite {
  private basketWidth: number = 140;
  private basketHeight: number = 70;

  private speed: number = 550;
  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
  private keyA?: Phaser.Input.Keyboard.Key;
  private keyD?: Phaser.Input.Keyboard.Key;
  private targetX: number | null = null;
  private isPointerDown: boolean = false;

  constructor(scene: Phaser.Scene, x: number, y: number, textureKey?: string) {
    const theme = getActiveTheme();
    const assetThemeId = getCanonicalAssetThemeId(theme);
    const basketConfig: ThemeBasketConfig = theme.basket_config || {
      name: 'Basket',
      width: 140,
      height: 70,
      speed: 550,
      catchAreaRatio: 0.72,
      collisionWidthRatio: 0.7235,
      collisionHeightRatio: 0.13,
      collisionOffsetYRatio: 0.3394,
    };

    const themeCatcherKey = `theme_${theme.id}_catcher`;
    let keyToUse = 'basket';
    if (textureKey && scene.textures.exists(textureKey)) {
      keyToUse = textureKey;
    } else if (scene.textures.exists(themeCatcherKey)) {
      keyToUse = themeCatcherKey;
    } else {
      if (assetThemeId === 'christmas' || assetThemeId === 'cny') {
        console.error(
          `[ThemeAssets] Missing canonical asset:\ntheme=${assetThemeId}\nassetType=catcher\nexpected=${resolveThemeDefaultBasketImage(theme)}`
        );
      }
      if (scene.textures.exists('basket')) {
        keyToUse = 'basket';
      }
    }

    super(scene, x, y, keyToUse);

    this.speed = basketConfig.speed || 550;

    scene.add.existing(this);
    scene.physics.add.existing(this);

    // Setup Physics & Depth
    this.setCollideWorldBounds(true);
    this.setImmovable(true);
    this.setDepth(10);
    this.setAngle(0);
    this.setRotation(0);
    this.setOrigin(0.5, 0.5);

    // Initial responsive sizing based on scene viewport (preserves intrinsic aspect ratio)
    const logicalW = this.getLogicalWidth();
    const logicalH = this.getLogicalHeight();
    this.applyCatcherSize(logicalW, logicalH);

    // Position correctly at target Y
    const targetY = this.calculateTargetY(logicalH);
    this.setPosition(x, targetY);

    // Input bindings
    if (scene.input.keyboard) {
      this.cursors = scene.input.keyboard.createCursorKeys();
      this.keyA = scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A);
      this.keyD = scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D);
    }

    // Pointer / Touch / Mouse setup
    scene.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      const halfW = this.basketWidth / 2;
      const maxX = this.getLogicalWidth() - halfW;
      this.targetX = Phaser.Math.Clamp(pointer.x, halfW, maxX);
    });

    scene.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      this.isPointerDown = true;
      const halfW = this.basketWidth / 2;
      const maxX = this.getLogicalWidth() - halfW;
      this.targetX = Phaser.Math.Clamp(pointer.x, halfW, maxX);
    });

    scene.input.on('pointerup', () => {
      this.isPointerDown = false;
    });
  }

  public getBasketWidth(): number {
    return this.basketWidth;
  }

  public getBasketHeight(): number {
    return this.basketHeight;
  }

  public getLogicalWidth(): number {
    const gameScene = this.scene as any;
    if (gameScene && typeof gameScene.getLogicalWidth === 'function') {
      return gameScene.getLogicalWidth();
    }
    if (gameScene?.logicalWidth) {
      return gameScene.logicalWidth;
    }
    return this.scene.scale.width;
  }

  public getLogicalHeight(): number {
    const gameScene = this.scene as any;
    if (gameScene && typeof gameScene.getLogicalHeight === 'function') {
      return gameScene.getLogicalHeight();
    }
    if (gameScene?.logicalHeight) {
      return gameScene.logicalHeight;
    }
    return this.scene.scale.height;
  }

  /**
   * Authoritative sizing method that calculates catcher dimensions from
   * original texture aspect ratio and actual game viewport, and synchronizes
   * the Arcade Physics collision body.
   */
  public applyCatcherSize(viewportWidth: number, viewportHeight: number) {
    const theme = getActiveTheme();
    const basketConfig = theme.basket_config || {};

    const { width, height } = calculateCatcherSize(
      viewportWidth,
      viewportHeight,
      this.texture,
      basketConfig
    );

    this.basketWidth = width;
    this.basketHeight = height;

    // Apply display size (sets scaleX and scaleY from frame dimensions)
    super.setDisplaySize(width, height);

    // Synchronize physics body with the visible catcher
    this.updateCollisionBody();
  }

  /**
   * Responds to orientation / dimension changes from the scene
   */
  public onSceneResize(newWidth: number, newHeight: number) {
    this.targetX = null;
    this.applyCatcherSize(newWidth, newHeight);

    const halfW = this.basketWidth / 2;
    this.x = Phaser.Math.Clamp(this.x, halfW, newWidth - halfW);
    this.y = this.calculateTargetY(newHeight);
  }

  /**
   * Calculates the centered target Y position for the catcher based on game height
   */
  public calculateTargetY(gameHeight: number): number {
    const isPortrait = gameHeight > this.getLogicalWidth();
    return calculateCatcherTargetY(gameHeight, this.basketHeight, isPortrait);
  }

  /**
   * Calculates & synchronizes the Arcade Physics collision body based on ThemeBasketConfig ratios.
   * Because Phaser automatically scales body bounds by sprite.scaleX and sprite.scaleY,
   * setting unscaled frame-relative coordinates ensures the on-screen collision area
   * always corresponds exactly to the rendered catcher opening.
   */
  public updateCollisionBody() {
    const body = this.body as Phaser.Physics.Arcade.Body;
    if (!body || !this.texture) return;

    const theme = getActiveTheme();
    const basketConfig: Partial<ThemeBasketConfig> = theme.basket_config || {};

    const frameWidth =
      this.frame?.realWidth || this.frame?.width || this.texture.source[0]?.width || 1;
    const frameHeight =
      this.frame?.realHeight || this.frame?.height || this.texture.source[0]?.height || 1;

    const widthRatio = basketConfig.collisionWidthRatio ?? basketConfig.catchAreaRatio ?? 0.7235;
    const heightRatio = basketConfig.collisionHeightRatio ?? 0.13;
    const offsetYRatio = basketConfig.collisionOffsetYRatio ?? 0.3394;

    const bodyWidth = frameWidth * widthRatio;
    const bodyHeight = frameHeight * heightRatio;

    const offsetX = (frameWidth - bodyWidth) / 2;
    const offsetY = frameHeight * offsetYRatio;

    body.setSize(bodyWidth, bodyHeight, false);
    body.setOffset(offsetX, offsetY);

    // Ensure physics engine bounds update immediately
    body.updateFromGameObject();
  }

  public override setDisplaySize(width: number, height: number): this {
    super.setDisplaySize(width, height);
    this.basketWidth = width;
    this.basketHeight = height;
    this.updateCollisionBody();
    return this;
  }

  public override setScale(x?: number, y?: number): this {
    super.setScale(x ?? 1, y ?? x ?? 1);
    this.basketWidth = Math.round((this.frame?.realWidth || 1) * this.scaleX);
    this.basketHeight = Math.round((this.frame?.realHeight || 1) * this.scaleY);
    this.updateCollisionBody();
    return this;
  }

  public setHandTargetX(x: number) {
    const halfW = this.basketWidth / 2;
    const maxX = this.getLogicalWidth() - halfW;
    this.targetX = Phaser.Math.Clamp(x, halfW, maxX);
  }

  public updateBasket(delta: number) {
    let moveDir = 0;

    if (this.cursors?.left.isDown || this.keyA?.isDown) {
      moveDir = -1;
      this.targetX = null;
    } else if (this.cursors?.right.isDown || this.keyD?.isDown) {
      moveDir = 1;
      this.targetX = null;
    }

    if (moveDir !== 0) {
      this.setVelocityX(moveDir * this.speed);
    } else if (this.targetX !== null) {
      const dx = this.targetX - this.x;
      if (Math.abs(dx) > 3) {
        this.setVelocityX(dx * 12);
      } else {
        this.setVelocityX(0);
        this.x = this.targetX;
      }
    } else {
      this.setVelocityX(0);
    }

    const halfW = this.basketWidth / 2;
    const maxX = this.getLogicalWidth() - halfW;
    this.x = Phaser.Math.Clamp(this.x, halfW, maxX);
    this.setAngle(0);
    this.setRotation(0);
  }

  public triggerCatchBounce() {
    const defaultY = this.calculateTargetY(this.getLogicalHeight());
    this.scene.tweens.add({
      targets: this,
      y: defaultY + 4,
      duration: 50,
      yoyo: true,
      ease: 'Quad.easeInOut',
    });
  }
}

