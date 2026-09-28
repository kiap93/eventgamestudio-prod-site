import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from '../config';
import { getActiveTheme, getCanonicalAssetThemeId, resolveThemeDefaultBasketImage, ThemeBasketConfig } from '../../themes';

export class Basket extends Phaser.Physics.Arcade.Sprite {
  private basketWidth: number = 140;
  private basketHeight: number = 70;
  private isSizeLocked = false;

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

    this.basketWidth = basketConfig.width || 140;
    this.basketHeight = basketConfig.height || 70;
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

    // Set locked initial sprite size
    super.setDisplaySize(this.basketWidth, this.basketHeight);

    // Calculate collision body ONCE during creation
    this.calculateCollisionBodyOnce();

    this.isSizeLocked = true;

    // Input bindings
    if (scene.input.keyboard) {
      this.cursors = scene.input.keyboard.createCursorKeys();
      this.keyA = scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A);
      this.keyD = scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D);
    }

    // Pointer / Touch / Mouse setup
    scene.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      const halfW = Math.max(50, this.basketWidth / 2);
      const maxX = this.getLogicalWidth() - halfW;
      this.targetX = Phaser.Math.Clamp(pointer.x, halfW, maxX);
    });

    scene.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      this.isPointerDown = true;
      const halfW = Math.max(50, this.basketWidth / 2);
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
    return this.scene.scale.width;
  }

  public getLogicalHeight(): number {
    const gameScene = this.scene as any;
    if (gameScene && typeof gameScene.getLogicalHeight === 'function') {
      return gameScene.getLogicalHeight();
    }
    return this.scene.scale.height;
  }

  /**
   * Responds to orientation / dimension changes from the scene
   */
  public onSceneResize(newWidth: number, newHeight: number) {
    const halfW = Math.max(50, this.basketWidth / 2);
    this.targetX = null;
    this.x = Phaser.Math.Clamp(this.x, halfW, newWidth - halfW);
    this.y = newHeight - 70;
  }

  /**
   * Calculates the Arcade Physics body ONCE during construction based on ThemeBasketConfig
   */
  private calculateCollisionBodyOnce() {
    const body = this.body as Phaser.Physics.Arcade.Body;
    if (!body || !this.texture) return;

    const theme = getActiveTheme();
    const basketConfig: Partial<ThemeBasketConfig> = theme.basket_config || {};

    const textureWidth = this.texture.source[0]?.width || 651;
    const textureHeight = this.texture.source[0]?.height || 383;

    const widthRatio = basketConfig.collisionWidthRatio ?? basketConfig.catchAreaRatio ?? 0.7235;
    const heightRatio = basketConfig.collisionHeightRatio ?? 0.13;
    const offsetYRatio = basketConfig.collisionOffsetYRatio ?? 0.3394;

    const bodyWidth = textureWidth * widthRatio;
    const bodyHeight = textureHeight * heightRatio;

    const offsetX = (textureWidth - bodyWidth) / 2;
    const offsetY = textureHeight * offsetYRatio;

    body.setSize(bodyWidth, bodyHeight, false);
    body.setOffset(offsetX, offsetY);
  }

  public override setDisplaySize(width: number, height: number): this {
    if (this.isSizeLocked) {
      return this;
    }
    super.setDisplaySize(width, height);
    return this;
  }

  public override setScale(x?: number, y?: number): this {
    if (this.isSizeLocked) {
      return this;
    }
    super.setScale(x ?? 1, y ?? x ?? 1);
    return this;
  }

  public setHandTargetX(x: number) {
    const halfW = Math.max(50, this.basketWidth / 2);
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

    const halfW = Math.max(50, this.basketWidth / 2);
    const maxX = this.getLogicalWidth() - halfW;
    this.x = Phaser.Math.Clamp(this.x, halfW, maxX);
    this.setAngle(0);
    this.setRotation(0);
  }

  public triggerCatchBounce() {
    const defaultY = this.getLogicalHeight() - 70;
    this.scene.tweens.add({
      targets: this,
      y: defaultY + 4,
      duration: 50,
      yoyo: true,
      ease: 'Quad.easeInOut',
    });
  }
}
