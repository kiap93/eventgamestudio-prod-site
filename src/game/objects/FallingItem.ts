import Phaser from 'phaser';
import { ThemeDropItem } from '../../themes/types';
import { getActiveTheme } from '../../themes';

export class FallingItem extends Phaser.Physics.Arcade.Sprite {
  public itemConfig: ThemeDropItem;
  public scoreValue: number;
  public fallSpeed: number;
  public isCollected: boolean = false;
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

    // Standard display size (66x66 px)
    this.setDisplaySize(66, 66);

    const body = this.body as Phaser.Physics.Arcade.Body;
    if (body) {
      body.setVelocityY(this.fallSpeed);
    }
  }

  /**
   * Fits a centered circular physics body tightly around the inner item core based on item configuration.
   */
  public updateCollisionBody() {
    const body = this.body as Phaser.Physics.Arcade.Body;
    if (!body || !this.texture) return;

    const textureWidth = this.texture.source[0]?.width || 500;
    const textureHeight = this.texture.source[0]?.height || 500;

    const radiusRatio = this.itemConfig.collisionRadiusRatio ?? 0.30;
    const centerXRatio = this.itemConfig.collisionCenterXRatio ?? 0.50;
    const centerYRatio = this.itemConfig.collisionCenterYRatio ?? 0.54;

    const radius = textureWidth * radiusRatio;
    const centerX = textureWidth * centerXRatio;
    const centerY = textureHeight * centerYRatio;

    const offsetX = centerX - radius;
    const offsetY = centerY - radius;

    body.setCircle(radius, offsetX, offsetY);
  }

  public setDisplaySize(width: number, height: number): this {
    super.setDisplaySize(width, height);
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
