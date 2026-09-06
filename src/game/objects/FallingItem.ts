import Phaser from 'phaser';
import { ThemeDropItem } from '../../themes/types';
import { getActiveTheme } from '../../themes';
import { getDropItemDisplaySize, DEFAULT_MAX_DROP_ITEM_SIZE } from '../../themes/itemSizing';

export class FallingItem extends Phaser.Physics.Arcade.Sprite {
  public itemConfig: ThemeDropItem;
  public scoreValue: number;
  public fallSpeed: number;
  public isCollected: boolean = false;
  public itemDisplayWidth: number = DEFAULT_MAX_DROP_ITEM_SIZE;
  public itemDisplayHeight: number = DEFAULT_MAX_DROP_ITEM_SIZE;
  private rotSpeed: number;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    itemConfig: ThemeDropItem,
    fallSpeed: number,
    textureKey: string
  ) {
    super(scene, x, y, textureKey);

    this.itemConfig = itemConfig;
    this.scoreValue = itemConfig.points;
    this.fallSpeed = fallSpeed;
    this.isCollected = false;
    this.rotSpeed = Phaser.Math.FloatBetween(-0.04, 0.04);

    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.setDepth(8);
    this.setOrigin(0.5, 0.5);

    // Intrinsic image / texture frame dimensions
    const imgSource = this.texture?.getSourceImage() as HTMLImageElement | HTMLCanvasElement | undefined;
    const naturalWidth =
      imgSource && 'naturalWidth' in imgSource && imgSource.naturalWidth > 0
        ? imgSource.naturalWidth
        : this.frame?.realWidth || this.frame?.width || this.texture?.source[0]?.width || 64;
    const naturalHeight =
      imgSource && 'naturalHeight' in imgSource && imgSource.naturalHeight > 0
        ? imgSource.naturalHeight
        : this.frame?.realHeight || this.frame?.height || this.texture?.source[0]?.height || 64;

    const scaleMultiplier =
      typeof itemConfig.scale === 'number' && itemConfig.scale > 0 ? itemConfig.scale : 1.0;

    // Proportional display size: preserves intrinsic aspect ratio without distortion
    const { width: displayW, height: displayH } = getDropItemDisplaySize(
      naturalWidth,
      naturalHeight,
      DEFAULT_MAX_DROP_ITEM_SIZE,
      scaleMultiplier
    );

    this.itemDisplayWidth = displayW;
    this.itemDisplayHeight = displayH;
    this.setDisplaySize(displayW, displayH);

    const body = this.body as Phaser.Physics.Arcade.Body;
    if (body) {
      body.setVelocityY(this.fallSpeed);
    }
  }

  /**
   * Updates the physics collision body to precisely match the proportional visual dimensions.
   * For non-square items (e.g. 512x128 tickets, 128x256 bottles), the body bounds are scaled
   * proportionally with the visual sprite, preventing oversized or mismatched hitboxes.
   */
  public updateCollisionBody() {
    const body = this.body as Phaser.Physics.Arcade.Body;
    if (!body || !this.texture) return;

    const naturalWidth =
      this.frame?.realWidth || this.frame?.width || this.texture.source[0]?.width || 64;
    const naturalHeight =
      this.frame?.realHeight || this.frame?.height || this.texture.source[0]?.height || 64;

    const aspectRatio = naturalWidth / naturalHeight;
    const isRoughlySquare = aspectRatio >= 0.82 && aspectRatio <= 1.22;

    if (isRoughlySquare && typeof this.itemConfig.collisionRadiusRatio === 'number') {
      const radiusRatio = this.itemConfig.collisionRadiusRatio;
      const centerXRatio = this.itemConfig.collisionCenterXRatio ?? 0.50;
      const centerYRatio = this.itemConfig.collisionCenterYRatio ?? 0.54;

      const radius = naturalWidth * radiusRatio;
      const centerX = naturalWidth * centerXRatio;
      const centerY = naturalHeight * centerYRatio;

      const offsetX = centerX - radius;
      const offsetY = centerY - radius;

      body.setCircle(radius, offsetX, offsetY);
    } else {
      // Non-square assets (tickets, banners, vertical icons) or default items:
      // AABB box in source coordinates automatically scales by (scaleX, scaleY)
      // to match itemDisplayWidth and itemDisplayHeight exactly.
      body.setSize(naturalWidth, naturalHeight, true);
    }
  }

  public override setDisplaySize(width: number, height: number): this {
    super.setDisplaySize(width, height);
    this.itemDisplayWidth = width;
    this.itemDisplayHeight = height;
    this.updateCollisionBody();
    return this;
  }

  preUpdate(time: number, delta: number) {
    super.preUpdate(time, delta);
    this.rotation += this.rotSpeed;
  }

  public collectEffect() {
    const theme = getActiveTheme();
    const isHazard = this.itemConfig.isHazard || this.scoreValue < 0;
    const isBonus = this.itemConfig.isBonus || this.scoreValue >= 50;

    // Floating score text feedback
    const textStr = this.scoreValue > 0 ? `+${this.scoreValue}` : `${this.scoreValue}`;
    const textStyle: Phaser.Types.GameObjects.Text.TextStyle = {
      fontFamily: 'monospace',
      fontSize: '28px',
      color: isHazard ? '#ff3d00' : isBonus ? '#ffd700' : '#00e676',
      stroke: '#000000',
      strokeThickness: 5,
    };

    const floatText = this.scene.add.text(this.x, this.y - 10, textStr, textStyle);
    floatText.setOrigin(0.5);
    floatText.setDepth(20);

    this.scene.tweens.add({
      targets: floatText,
      y: floatText.y - 50,
      alpha: 0,
      scale: 1.3,
      duration: 600,
      ease: 'Power1',
      onComplete: () => {
        floatText.destroy();
      },
    });

    // Particle Burst based on theme
    let particleKey = theme.visuals_config?.particleGood || 'particle_leaf';
    if (isHazard) particleKey = theme.visuals_config?.particleBad || 'particle_spike';
    if (isBonus) particleKey = theme.visuals_config?.particleBonus || 'particle_gold';

    if (!this.scene.textures.exists(particleKey)) {
      particleKey = 'particle_leaf';
    }

    const emitter = this.scene.add.particles(this.x, this.y, particleKey, {
      speed: { min: 80, max: 200 },
      angle: { min: 0, max: 360 },
      scale: { start: 1, end: 0 },
      lifespan: 400,
      quantity: 12,
    });
    emitter.setDepth(15);

    this.scene.time.delayedCall(450, () => {
      emitter.destroy();
    });

    this.destroy();
  }
}
