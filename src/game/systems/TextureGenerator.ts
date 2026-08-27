import Phaser from 'phaser';
import { GameTheme } from '../../themes/types';
import { resolveThemeBaseId } from '../../themes';

export class TextureGenerator {
  public static generateTextures(scene: Phaser.Scene) {
    this.createGreenDurianTexture(scene);
    this.createOrangeDurianTexture(scene);
    this.createGoldenDurianTexture(scene);
    this.createBasketTexture(scene);
    this.createForestBgSky(scene);
    this.createForestBgTreesBack(scene);
    this.createForestBgTreesFore(scene);
    this.createForestGround(scene);
    this.createParticleTextures(scene);
  }

  /**
   * Generates procedural fallback textures for any theme if image files are not found
   */
  public static generateThemeTextures(scene: Phaser.Scene, theme: GameTheme) {
    const themeId = theme.id;
    const baseId = theme.base_theme_id || resolveThemeBaseId(theme);

    const bgKey = `theme_${themeId}_bg`;
    const catcherKey = `theme_${themeId}_catcher`;
    const goodKey = `theme_${themeId}_good`;
    const badKey = `theme_${themeId}_bad`;
    const bonusKey = `theme_${themeId}_bonus`;

    // 1. Fallback for Good Item
    if (!scene.textures.exists(goodKey)) {
      if (baseId === 'christmas') {
        this.createChristmasGiftTexture(scene, goodKey);
      } else if (baseId === 'chinese-new-year') {
        this.createAngpowTexture(scene, goodKey);
      } else if (baseId === 'halloween') {
        this.createSpookyCandyTexture(scene, goodKey);
      } else if (baseId === 'mango') {
        this.createRipeMangoTexture(scene, goodKey);
      } else {
        // Alias to ticket or carnival good item
        if (scene.textures.exists('ticket')) {
          this.aliasTexture(scene, 'ticket', goodKey);
        } else if (scene.textures.exists('green_durian')) {
          this.aliasTexture(scene, 'green_durian', goodKey);
        } else {
          this.createGreenDurianTexture(scene);
          this.aliasTexture(scene, 'green_durian', goodKey);
        }
      }
    }

    // 2. Fallback for Bad Item
    if (!scene.textures.exists(badKey)) {
      if (baseId === 'christmas') {
        this.createCoalTexture(scene, badKey);
      } else if (baseId === 'chinese-new-year') {
        this.createFirecrackerTexture(scene, badKey);
      } else if (baseId === 'halloween') {
        this.createSpiderTexture(scene, badKey);
      } else if (baseId === 'mango') {
        this.createSourMangoTexture(scene, badKey);
      } else {
        if (scene.textures.exists('mask')) {
          this.aliasTexture(scene, 'mask', badKey);
        } else if (scene.textures.exists('orange_durian')) {
          this.aliasTexture(scene, 'orange_durian', badKey);
        } else {
          this.createOrangeDurianTexture(scene);
          this.aliasTexture(scene, 'orange_durian', badKey);
        }
      }
    }

    // 3. Fallback for Bonus Item
    if (!scene.textures.exists(bonusKey)) {
      if (baseId === 'christmas') {
        this.createStarTexture(scene, bonusKey);
      } else if (baseId === 'chinese-new-year') {
        this.createGoldIngotTexture(scene, bonusKey);
      } else if (baseId === 'halloween') {
        this.createGoldSkullTexture(scene, bonusKey);
      } else if (baseId === 'mango') {
        this.createHoneyMangoTexture(scene, bonusKey);
      } else {
        if (scene.textures.exists('star')) {
          this.aliasTexture(scene, 'star', bonusKey);
        } else if (scene.textures.exists('golden_durian')) {
          this.aliasTexture(scene, 'golden_durian', bonusKey);
        } else {
          this.createGoldenDurianTexture(scene);
          this.aliasTexture(scene, 'golden_durian', bonusKey);
        }
      }
    }

    // 4. Fallback for Catcher
    if (!scene.textures.exists(catcherKey)) {
      if (baseId === 'christmas') {
        this.createSantaSackTexture(scene, catcherKey);
      } else if (baseId === 'chinese-new-year') {
        this.createFortuneBasketTexture(scene, catcherKey);
      } else if (baseId === 'halloween') {
        this.createPumpkinBucketTexture(scene, catcherKey);
      } else if (baseId === 'mango') {
        this.createFruitCrateTexture(scene, catcherKey);
      } else {
        if (scene.textures.exists('basket')) {
          this.aliasTexture(scene, 'basket', catcherKey);
        } else {
          this.createBasketTexture(scene);
          this.aliasTexture(scene, 'basket', catcherKey);
        }
      }
    }

    // 5. Fallback for Background
    if (!scene.textures.exists(bgKey)) {
      if (baseId === 'christmas') {
        this.createChristmasBg(scene, bgKey);
      } else if (baseId === 'chinese-new-year') {
        this.createCnyBg(scene, bgKey);
      } else if (baseId === 'halloween') {
        this.createHalloweenBg(scene, bgKey);
      } else if (baseId === 'mango') {
        this.createMangoBg(scene, bgKey);
      } else {
        if (scene.textures.exists('background')) {
          this.aliasTexture(scene, 'background', bgKey);
        } else {
          this.createDurianBg(scene, bgKey);
        }
      }
    }

    // 6. Item-specific keys fallback
    if (Array.isArray(theme.items_config)) {
      theme.items_config.forEach((item, index) => {
        const itemKey = `theme_${themeId}_item_${item.id || index}`;
        if (!scene.textures.exists(itemKey)) {
          if (item.isHazard) {
            if (scene.textures.exists(badKey)) {
              this.aliasTexture(scene, badKey, itemKey);
            } else if (baseId === 'christmas') {
              this.createCoalTexture(scene, itemKey);
            } else if (baseId === 'chinese-new-year') {
              this.createFirecrackerTexture(scene, itemKey);
            } else if (baseId === 'halloween') {
              this.createSpiderTexture(scene, itemKey);
            } else if (baseId === 'mango') {
              this.createSourMangoTexture(scene, itemKey);
            } else {
              if (scene.textures.exists('mask')) {
                this.aliasTexture(scene, 'mask', itemKey);
              } else {
                this.createOrangeDurianTexture(scene);
                this.aliasTexture(scene, 'orange_durian', itemKey);
              }
            }
          } else if (item.isBonus) {
            if (scene.textures.exists(bonusKey)) {
              this.aliasTexture(scene, bonusKey, itemKey);
            } else if (baseId === 'christmas') {
              this.createStarTexture(scene, itemKey);
            } else if (baseId === 'chinese-new-year') {
              this.createGoldIngotTexture(scene, itemKey);
            } else if (baseId === 'halloween') {
              this.createGoldSkullTexture(scene, itemKey);
            } else if (baseId === 'mango') {
              this.createHoneyMangoTexture(scene, itemKey);
            } else {
              if (scene.textures.exists('star')) {
                this.aliasTexture(scene, 'star', itemKey);
              } else {
                this.createGoldenDurianTexture(scene);
                this.aliasTexture(scene, 'golden_durian', itemKey);
              }
            }
          } else {
            if (scene.textures.exists(goodKey)) {
              this.aliasTexture(scene, goodKey, itemKey);
            } else if (baseId === 'christmas') {
              this.createChristmasGiftTexture(scene, itemKey);
            } else if (baseId === 'chinese-new-year') {
              this.createAngpowTexture(scene, itemKey);
            } else if (baseId === 'halloween') {
              this.createSpookyCandyTexture(scene, itemKey);
            } else if (baseId === 'mango') {
              this.createRipeMangoTexture(scene, itemKey);
            } else {
              if (scene.textures.exists('ticket')) {
                this.aliasTexture(scene, 'ticket', itemKey);
              } else {
                this.createGreenDurianTexture(scene);
                this.aliasTexture(scene, 'green_durian', itemKey);
              }
            }
          }
        }
      });
    }
  }

  private static aliasTexture(scene: Phaser.Scene, sourceKey: string, targetKey: string) {
    if (scene.textures.exists(sourceKey) && !scene.textures.exists(targetKey)) {
      const srcTexture = scene.textures.get(sourceKey);
      const srcFrame = srcTexture.get();
      if (srcFrame && srcFrame.source && srcFrame.source.image) {
        const img = srcFrame.source.image as HTMLImageElement | HTMLCanvasElement;
        const canvas = scene.textures.createCanvas(targetKey, srcFrame.width, srcFrame.height);
        if (canvas) {
          canvas.context.drawImage(img, 0, 0);
          canvas.refresh();
        }
      }
    }
  }

  // ================= DURIAN THEME PROCEDURAL TEXTURES =================

  // GREEN DURIAN: Spiky lime green fruit with cute face
  private static createGreenDurianTexture(scene: Phaser.Scene) {
    if (scene.textures.exists('green_durian')) return;

    const canvas = scene.textures.createCanvas('green_durian', 64, 72);
    if (!canvas) return;
    const ctx = canvas.context;

    const cx = 32;
    const cy = 40;
    const rx = 24;
    const ry = 26;

    // Stem
    ctx.fillStyle = '#33691e';
    ctx.fillRect(29, 2, 6, 12);
    ctx.fillStyle = '#558b2f';
    ctx.fillRect(31, 2, 2, 12);

    // Stem Leaf
    ctx.fillStyle = '#7cb342';
    ctx.beginPath();
    ctx.ellipse(37, 8, 8, 4, Math.PI / 4, 0, Math.PI * 2);
    ctx.fill();

    // Spiky Husk Outer Rim
    ctx.fillStyle = '#2e7d32';
    const spikeCount = 22;
    for (let i = 0; i < spikeCount; i++) {
      const angle = (i / spikeCount) * Math.PI * 2;
      const x1 = cx + Math.cos(angle) * (rx - 2);
      const y1 = cy + Math.sin(angle) * (ry - 2);
      const x2 = cx + Math.cos(angle) * (rx + 7);
      const y2 = cy + Math.sin(angle) * (ry + 7);

      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.lineTo(
        cx + Math.cos(angle + 0.18) * (rx - 2),
        cy + Math.sin(angle + 0.18) * (ry - 2)
      );
      ctx.fill();
    }

    // Main Lime Green Body
    ctx.fillStyle = '#7cb342';
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();

    // Inner Lighter Body
    ctx.fillStyle = '#9ccc65';
    ctx.beginPath();
    ctx.ellipse(cx, cy + 1, rx * 0.85, ry * 0.85, 0, 0, Math.PI * 2);
    ctx.fill();

    // Subtle spike texture bumps on body
    ctx.fillStyle = '#aeea00';
    for (let i = 0; i < 14; i++) {
      const angle = (i / 14) * Math.PI * 2;
      const bx = cx + Math.cos(angle) * 16;
      const by = cy + Math.sin(angle) * 17;
      ctx.beginPath();
      ctx.arc(bx, by, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // CUTE SMILEY FACE
    ctx.fillStyle = '#1b5e20';
    ctx.fillRect(cx - 10, cy - 6, 4, 6);
    ctx.fillRect(cx + 6, cy - 6, 4, 6);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(cx - 10, cy - 6, 2, 2);
    ctx.fillRect(cx + 6, cy - 6, 2, 2);

    ctx.fillStyle = 'rgba(255, 128, 171, 0.6)';
    ctx.beginPath();
    ctx.arc(cx - 12, cy + 2, 3.5, 0, Math.PI * 2);
    ctx.arc(cx + 12, cy + 2, 3.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#1b5e20';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(cx, cy + 2, 6, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();

    canvas.refresh();
  }

  // ORANGE / TAN DURIAN
  private static createOrangeDurianTexture(scene: Phaser.Scene) {
    if (scene.textures.exists('orange_durian')) return;

    const canvas = scene.textures.createCanvas('orange_durian', 64, 72);
    if (!canvas) return;
    const ctx = canvas.context;

    const cx = 32;
    const cy = 40;
    const rx = 24;
    const ry = 26;

    // Stem
    ctx.fillStyle = '#4e342e';
    ctx.fillRect(29, 2, 6, 12);
    ctx.fillStyle = '#6d4c41';
    ctx.fillRect(31, 2, 2, 12);

    // Spiky Husk
    ctx.fillStyle = '#795548';
    const spikeCount = 22;
    for (let i = 0; i < spikeCount; i++) {
      const angle = (i / spikeCount) * Math.PI * 2;
      const x1 = cx + Math.cos(angle) * (rx - 2);
      const y1 = cy + Math.sin(angle) * (ry - 2);
      const x2 = cx + Math.cos(angle) * (rx + 7);
      const y2 = cy + Math.sin(angle) * (ry + 7);

      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.lineTo(
        cx + Math.cos(angle + 0.18) * (rx - 2),
        cy + Math.sin(angle + 0.18) * (ry - 2)
      );
      ctx.fill();
    }

    // Main Body
    ctx.fillStyle = '#bcaaa4';
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#d7ccc8';
    ctx.beginPath();
    ctx.ellipse(cx, cy + 1, rx * 0.85, ry * 0.85, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#3e2723';
    ctx.fillRect(cx - 10, cy - 6, 4, 6);
    ctx.fillRect(cx + 6, cy - 6, 4, 6);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(cx - 10, cy - 6, 2, 2);
    ctx.fillRect(cx + 6, cy - 6, 2, 2);

    ctx.strokeStyle = '#3e2723';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(cx, cy + 2, 6, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();

    canvas.refresh();
  }

  // GOLDEN DURIAN
  private static createGoldenDurianTexture(scene: Phaser.Scene) {
    if (scene.textures.exists('golden_durian')) return;

    const canvas = scene.textures.createCanvas('golden_durian', 64, 72);
    if (!canvas) return;
    const ctx = canvas.context;

    const cx = 32;
    const cy = 40;
    const rx = 24;
    const ry = 26;

    ctx.fillStyle = '#ff6f00';
    ctx.fillRect(29, 2, 6, 12);

    ctx.fillStyle = '#ffab00';
    const spikeCount = 22;
    for (let i = 0; i < spikeCount; i++) {
      const angle = (i / spikeCount) * Math.PI * 2;
      const x1 = cx + Math.cos(angle) * (rx - 2);
      const y1 = cy + Math.sin(angle) * (ry - 2);
      const x2 = cx + Math.cos(angle) * (rx + 8);
      const y2 = cy + Math.sin(angle) * (ry + 8);

      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.lineTo(
        cx + Math.cos(angle + 0.18) * (rx - 2),
        cy + Math.sin(angle + 0.18) * (ry - 2)
      );
      ctx.fill();
    }

    ctx.fillStyle = '#ffd54f';
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#fff59d';
    ctx.beginPath();
    ctx.ellipse(cx, cy + 1, rx * 0.85, ry * 0.85, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#bf360c';
    ctx.fillRect(cx - 10, cy - 6, 4, 6);
    ctx.fillRect(cx + 6, cy - 6, 4, 6);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(cx - 10, cy - 6, 2, 2);
    ctx.fillRect(cx + 6, cy - 6, 2, 2);

    ctx.strokeStyle = '#bf360c';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(cx, cy + 2, 6, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();

    canvas.refresh();
  }

  // BASKET
  private static createBasketTexture(scene: Phaser.Scene) {
    if (scene.textures.exists('basket')) return;

    const canvas = scene.textures.createCanvas('basket', 140, 65);
    if (!canvas) return;
    const ctx = canvas.context;

    const w = 140;
    const h = 65;

    ctx.fillStyle = '#261405';
    ctx.beginPath();
    ctx.ellipse(w / 2, 16, 60, 12, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#a1683a';
    ctx.beginPath();
    ctx.moveTo(10, 16);
    ctx.lineTo(w - 10, 16);
    ctx.lineTo(w - 22, h - 4);
    ctx.lineTo(22, h - 4);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = '#5d381e';
    ctx.lineWidth = 3;

    for (let y = 22; y < h - 6; y += 9) {
      ctx.beginPath();
      ctx.moveTo(12 + (y - 16) * 0.22, y);
      ctx.lineTo(w - 12 - (y - 16) * 0.22, y);
      ctx.stroke();
    }

    for (let x = 24; x < w - 20; x += 14) {
      ctx.beginPath();
      ctx.moveTo(x, 16);
      ctx.lineTo(22 + (x - 22) * 0.78, h - 4);
      ctx.stroke();
    }

    ctx.fillStyle = '#c88c52';
    ctx.beginPath();
    ctx.ellipse(w / 2, 16, 62, 7, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#43230d';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.ellipse(w / 2, 16, 62, 7, 0, 0, Math.PI * 2);
    ctx.stroke();

    canvas.refresh();
  }

  // ================= CHRISTMAS PROCEDURAL FALLBACKS =================

  private static createChristmasGiftTexture(scene: Phaser.Scene, key: string) {
    const canvas = scene.textures.createCanvas(key, 64, 64);
    if (!canvas) return;
    const ctx = canvas.context;

    // Red Box
    ctx.fillStyle = '#dc2626';
    ctx.fillRect(8, 16, 48, 44);
    ctx.fillStyle = '#b91c1c';
    ctx.fillRect(8, 16, 48, 10);

    // Gold Ribbon
    ctx.fillStyle = '#facc15';
    ctx.fillRect(28, 16, 8, 44);
    ctx.fillRect(8, 34, 48, 8);

    // Bow
    ctx.fillStyle = '#fde047';
    ctx.beginPath();
    ctx.ellipse(24, 12, 10, 6, -Math.PI / 6, 0, Math.PI * 2);
    ctx.ellipse(40, 12, 10, 6, Math.PI / 6, 0, Math.PI * 2);
    ctx.fill();

    canvas.refresh();
  }

  private static createCoalTexture(scene: Phaser.Scene, key: string) {
    const canvas = scene.textures.createCanvas(key, 64, 64);
    if (!canvas) return;
    const ctx = canvas.context;

    ctx.fillStyle = '#1f2937';
    ctx.beginPath();
    ctx.ellipse(32, 32, 22, 18, Math.PI / 8, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#374151';
    ctx.beginPath();
    ctx.ellipse(28, 28, 12, 8, Math.PI / 6, 0, Math.PI * 2);
    ctx.fill();

    canvas.refresh();
  }

  private static createStarTexture(scene: Phaser.Scene, key: string) {
    const canvas = scene.textures.createCanvas(key, 64, 64);
    if (!canvas) return;
    const ctx = canvas.context;

    ctx.fillStyle = '#facc15';
    ctx.beginPath();
    const cx = 32, cy = 32, spikes = 5, outerR = 24, innerR = 10;
    let rot = Math.PI / 2 * 3;
    const step = Math.PI / spikes;

    ctx.moveTo(cx, cy - outerR);
    for (let i = 0; i < spikes; i++) {
      let x = cx + Math.cos(rot) * outerR;
      let y = cy + Math.sin(rot) * outerR;
      ctx.lineTo(x, y);
      rot += step;

      x = cx + Math.cos(rot) * innerR;
      y = cy + Math.sin(rot) * innerR;
      ctx.lineTo(x, y);
      rot += step;
    }
    ctx.lineTo(cx, cy - outerR);
    ctx.closePath();
    ctx.fill();

    canvas.refresh();
  }

  private static createSantaSackTexture(scene: Phaser.Scene, key: string) {
    const canvas = scene.textures.createCanvas(key, 140, 65);
    if (!canvas) return;
    const ctx = canvas.context;

    ctx.fillStyle = '#991b1b';
    ctx.beginPath();
    ctx.moveTo(10, 20);
    ctx.lineTo(130, 20);
    ctx.lineTo(118, 60);
    ctx.lineTo(22, 60);
    ctx.closePath();
    ctx.fill();

    // White fur trim
    ctx.fillStyle = '#f8fafc';
    ctx.beginPath();
    ctx.ellipse(70, 20, 62, 8, 0, 0, Math.PI * 2);
    ctx.fill();

    canvas.refresh();
  }

  private static createChristmasBg(scene: Phaser.Scene, key: string) {
    const canvas = scene.textures.createCanvas(key, 1024, 576);
    if (!canvas) return;
    const ctx = canvas.context;

    const grad = ctx.createLinearGradient(0, 0, 0, 576);
    grad.addColorStop(0, '#0f172a');
    grad.addColorStop(0.6, '#1e293b');
    grad.addColorStop(1, '#064e3b');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 1024, 576);

    // Snowflakes
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 80; i++) {
      const x = Math.random() * 1024;
      const y = Math.random() * 576;
      ctx.beginPath();
      ctx.arc(x, y, Math.random() * 3 + 1, 0, Math.PI * 2);
      ctx.fill();
    }

    canvas.refresh();
  }

  // ================= CHINESE NEW YEAR PROCEDURAL FALLBACKS =================

  private static createAngpowTexture(scene: Phaser.Scene, key: string) {
    const canvas = scene.textures.createCanvas(key, 64, 72);
    if (!canvas) return;
    const ctx = canvas.context;

    ctx.fillStyle = '#dc2626';
    ctx.fillRect(12, 10, 40, 52);

    ctx.fillStyle = '#eab308';
    ctx.beginPath();
    ctx.arc(32, 36, 12, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#dc2626';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('福', 32, 36);

    canvas.refresh();
  }

  private static createFirecrackerTexture(scene: Phaser.Scene, key: string) {
    const canvas = scene.textures.createCanvas(key, 64, 72);
    if (!canvas) return;
    const ctx = canvas.context;

    ctx.fillStyle = '#b91c1c';
    ctx.fillRect(24, 16, 16, 44);

    ctx.fillStyle = '#eab308';
    ctx.fillRect(24, 16, 16, 6);
    ctx.fillRect(24, 54, 16, 6);

    // Fuse
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(32, 16);
    ctx.lineTo(38, 4);
    ctx.stroke();

    canvas.refresh();
  }

  private static createGoldIngotTexture(scene: Phaser.Scene, key: string) {
    const canvas = scene.textures.createCanvas(key, 64, 64);
    if (!canvas) return;
    const ctx = canvas.context;

    ctx.fillStyle = '#eab308';
    ctx.beginPath();
    ctx.ellipse(32, 38, 22, 12, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#fef08a';
    ctx.beginPath();
    ctx.arc(32, 28, 12, 0, Math.PI * 2);
    ctx.fill();

    canvas.refresh();
  }

  private static createFortuneBasketTexture(scene: Phaser.Scene, key: string) {
    const canvas = scene.textures.createCanvas(key, 140, 65);
    if (!canvas) return;
    const ctx = canvas.context;

    ctx.fillStyle = '#991b1b';
    ctx.beginPath();
    ctx.moveTo(10, 16);
    ctx.lineTo(130, 16);
    ctx.lineTo(118, 60);
    ctx.lineTo(22, 60);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#eab308';
    ctx.fillRect(10, 16, 120, 6);

    canvas.refresh();
  }

  private static createCnyBg(scene: Phaser.Scene, key: string) {
    const canvas = scene.textures.createCanvas(key, 1024, 576);
    if (!canvas) return;
    const ctx = canvas.context;

    const grad = ctx.createLinearGradient(0, 0, 0, 576);
    grad.addColorStop(0, '#450a0a');
    grad.addColorStop(0.5, '#7f1d1d');
    grad.addColorStop(1, '#991b1b');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 1024, 576);

    canvas.refresh();
  }

  // ================= HALLOWEEN PROCEDURAL FALLBACKS =================

  private static createSpookyCandyTexture(scene: Phaser.Scene, key: string) {
    const canvas = scene.textures.createCanvas(key, 64, 64);
    if (!canvas) return;
    const ctx = canvas.context;

    ctx.fillStyle = '#a855f7';
    ctx.beginPath();
    ctx.arc(32, 32, 16, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#f97316';
    ctx.fillRect(20, 28, 24, 8);

    canvas.refresh();
  }

  private static createSpiderTexture(scene: Phaser.Scene, key: string) {
    const canvas = scene.textures.createCanvas(key, 64, 64);
    if (!canvas) return;
    const ctx = canvas.context;

    ctx.fillStyle = '#111827';
    ctx.beginPath();
    ctx.arc(32, 32, 14, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#111827';
    ctx.lineWidth = 3;

    for (let i = -1; i <= 1; i += 0.66) {
      ctx.beginPath();
      ctx.moveTo(32, 32);
      ctx.lineTo(10, 32 + i * 20);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(32, 32);
      ctx.lineTo(54, 32 + i * 20);
      ctx.stroke();
    }

    canvas.refresh();
  }

  private static createGoldSkullTexture(scene: Phaser.Scene, key: string) {
    const canvas = scene.textures.createCanvas(key, 64, 64);
    if (!canvas) return;
    const ctx = canvas.context;

    ctx.fillStyle = '#eab308';
    ctx.beginPath();
    ctx.arc(32, 28, 16, 0, Math.PI * 2);
    ctx.fillRect(24, 36, 16, 12);
    ctx.fill();

    ctx.fillStyle = '#000000';
    ctx.fillRect(26, 26, 4, 6);
    ctx.fillRect(34, 26, 4, 6);

    canvas.refresh();
  }

  private static createPumpkinBucketTexture(scene: Phaser.Scene, key: string) {
    const canvas = scene.textures.createCanvas(key, 140, 65);
    if (!canvas) return;
    const ctx = canvas.context;

    ctx.fillStyle = '#ea580c';
    ctx.beginPath();
    ctx.ellipse(70, 36, 56, 24, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#000000';
    // Jack o lantern eyes
    ctx.beginPath();
    ctx.moveTo(48, 30); ctx.lineTo(56, 38); ctx.lineTo(40, 38); ctx.closePath();
    ctx.moveTo(92, 30); ctx.lineTo(100, 38); ctx.lineTo(84, 38); ctx.closePath();
    ctx.fill();

    canvas.refresh();
  }

  private static createHalloweenBg(scene: Phaser.Scene, key: string) {
    const canvas = scene.textures.createCanvas(key, 1024, 576);
    if (!canvas) return;
    const ctx = canvas.context;

    const grad = ctx.createLinearGradient(0, 0, 0, 576);
    grad.addColorStop(0, '#111827');
    grad.addColorStop(0.6, '#312e81');
    grad.addColorStop(1, '#4c1d95');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 1024, 576);

    // Full moon
    ctx.fillStyle = '#fef08a';
    ctx.beginPath();
    ctx.arc(800, 120, 60, 0, Math.PI * 2);
    ctx.fill();

    canvas.refresh();
  }

  // ================= MANGO PROCEDURAL FALLBACKS =================

  private static createRipeMangoTexture(scene: Phaser.Scene, key: string) {
    const canvas = scene.textures.createCanvas(key, 64, 72);
    if (!canvas) return;
    const ctx = canvas.context;

    ctx.fillStyle = '#eab308';
    ctx.beginPath();
    ctx.ellipse(32, 40, 20, 26, Math.PI / 12, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#f97316';
    ctx.beginPath();
    ctx.ellipse(28, 34, 12, 18, Math.PI / 12, 0, Math.PI * 2);
    ctx.fill();

    canvas.refresh();
  }

  private static createSourMangoTexture(scene: Phaser.Scene, key: string) {
    const canvas = scene.textures.createCanvas(key, 64, 72);
    if (!canvas) return;
    const ctx = canvas.context;

    ctx.fillStyle = '#65a30d';
    ctx.beginPath();
    ctx.ellipse(32, 40, 20, 26, Math.PI / 12, 0, Math.PI * 2);
    ctx.fill();

    canvas.refresh();
  }

  private static createHoneyMangoTexture(scene: Phaser.Scene, key: string) {
    const canvas = scene.textures.createCanvas(key, 64, 72);
    if (!canvas) return;
    const ctx = canvas.context;

    ctx.fillStyle = '#facc15';
    ctx.beginPath();
    ctx.ellipse(32, 40, 22, 28, Math.PI / 12, 0, Math.PI * 2);
    ctx.fill();

    canvas.refresh();
  }

  private static createFruitCrateTexture(scene: Phaser.Scene, key: string) {
    const canvas = scene.textures.createCanvas(key, 140, 65);
    if (!canvas) return;
    const ctx = canvas.context;

    ctx.fillStyle = '#b45309';
    ctx.fillRect(10, 16, 120, 44);

    ctx.fillStyle = '#78350f';
    ctx.fillRect(10, 28, 120, 4);
    ctx.fillRect(10, 42, 120, 4);

    canvas.refresh();
  }

  private static createMangoBg(scene: Phaser.Scene, key: string) {
    const canvas = scene.textures.createCanvas(key, 1024, 576);
    if (!canvas) return;
    const ctx = canvas.context;

    const grad = ctx.createLinearGradient(0, 0, 0, 576);
    grad.addColorStop(0, '#0284c7');
    grad.addColorStop(0.5, '#38bdf8');
    grad.addColorStop(1, '#15803d');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 1024, 576);

    canvas.refresh();
  }

  private static createDurianBg(scene: Phaser.Scene, key: string) {
    const canvas = scene.textures.createCanvas(key, 1024, 576);
    if (!canvas) return;
    const ctx = canvas.context;

    // Tropical Jungle Gradient Sky
    const skyGrad = ctx.createLinearGradient(0, 0, 0, 576);
    skyGrad.addColorStop(0, '#10301d');
    skyGrad.addColorStop(0.35, '#1e4d2b');
    skyGrad.addColorStop(0.7, '#2d6a3f');
    skyGrad.addColorStop(1, '#52796f');
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, 1024, 576);

    // Warm Sunbeam Light Streaks
    ctx.fillStyle = 'rgba(254, 240, 138, 0.08)';
    for (let i = 0; i < 6; i++) {
      ctx.beginPath();
      ctx.moveTo(120 + i * 150, 0);
      ctx.lineTo(200 + i * 150, 0);
      ctx.lineTo(310 + i * 150, 576);
      ctx.lineTo(190 + i * 150, 576);
      ctx.closePath();
      ctx.fill();
    }

    // Distant Rainforest Mountains / Canopy
    ctx.fillStyle = '#173f27';
    for (let x = -20; x <= 1044; x += 45) {
      const radius = 50 + Math.sin(x * 0.04) * 20;
      ctx.beginPath();
      ctx.arc(x, 260, radius, 0, Math.PI * 2);
      ctx.fill();
    }

    // Mid-ground Jungle Tree Trunks
    ctx.fillStyle = '#283618';
    for (let x = 60; x < 1000; x += 80) {
      ctx.fillRect(x, 220, 20, 300);
    }

    // Foreground Lush Vines & Hanging Fronds
    ctx.fillStyle = '#1b4332';
    ctx.beginPath();
    ctx.ellipse(512, -20, 580, 150, 0, 0, Math.PI);
    ctx.fill();

    ctx.fillStyle = '#2d6a4f';
    for (let x = 30; x < 1020; x += 60) {
      ctx.beginPath();
      ctx.arc(x, 70, 40 + Math.sin(x * 0.08) * 15, 0, Math.PI * 2);
      ctx.fill();
    }

    // Bottom Ground / Mossy Riverbed
    ctx.fillStyle = '#132a13';
    ctx.fillRect(0, 500, 1024, 76);
    ctx.fillStyle = '#31572c';
    ctx.fillRect(0, 496, 1024, 10);

    canvas.refresh();
  }

  // ================= FOREST BACKGROUND LAYERS =================

  private static createForestBgSky(scene: Phaser.Scene) {
    if (scene.textures.exists('forest_bg_sky')) return;

    const canvas = scene.textures.createCanvas('forest_bg_sky', 1024, 576);
    if (!canvas) return;
    const ctx = canvas.context;

    const skyGrad = ctx.createLinearGradient(0, 0, 0, 576);
    skyGrad.addColorStop(0, '#1c3d2b');
    skyGrad.addColorStop(0.3, '#2f5a3e');
    skyGrad.addColorStop(0.7, '#4e7b59');
    skyGrad.addColorStop(1, '#78a178');
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, 1024, 576);

    ctx.fillStyle = 'rgba(255, 250, 205, 0.08)';
    for (let i = 0; i < 6; i++) {
      ctx.beginPath();
      ctx.moveTo(150 + i * 160, 0);
      ctx.lineTo(240 + i * 160, 0);
      ctx.lineTo(340 + i * 160, 576);
      ctx.lineTo(210 + i * 160, 576);
      ctx.closePath();
      ctx.fill();
    }

    canvas.refresh();
  }

  private static createForestBgTreesBack(scene: Phaser.Scene) {
    if (scene.textures.exists('forest_bg_trees_back')) return;

    const canvas = scene.textures.createCanvas('forest_bg_trees_back', 1024, 576);
    if (!canvas) return;
    const ctx = canvas.context;

    ctx.fillStyle = '#224e34';
    for (let x = -30; x <= 1060; x += 50) {
      const radius = 55 + Math.sin(x * 0.05) * 20;
      ctx.beginPath();
      ctx.arc(x, 260, radius, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = '#2c4533';
    for (let x = 60; x < 1000; x += 90) {
      ctx.fillRect(x, 240, 22, 280);
    }

    canvas.refresh();
  }

  private static createForestBgTreesFore(scene: Phaser.Scene) {
    if (scene.textures.exists('forest_bg_trees_fore')) return;

    const canvas = scene.textures.createCanvas('forest_bg_trees_fore', 1024, 576);
    if (!canvas) return;
    const ctx = canvas.context;

    ctx.fillStyle = '#4a3319';
    ctx.beginPath();
    ctx.moveTo(-20, 0);
    ctx.lineTo(160, 0);
    ctx.bezierCurveTo(120, 200, 180, 400, 190, 520);
    ctx.lineTo(240, 576);
    ctx.lineTo(-20, 576);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#558b2f';
    ctx.beginPath();
    ctx.moveTo(30, 100);
    ctx.bezierCurveTo(90, 180, 110, 320, 140, 480);
    ctx.lineTo(110, 480);
    ctx.bezierCurveTo(80, 320, 60, 180, 10, 100);
    ctx.fill();

    ctx.fillStyle = '#3e2723';
    ctx.beginPath();
    ctx.moveTo(1044, 0);
    ctx.lineTo(760, 0);
    ctx.bezierCurveTo(790, 220, 750, 420, 710, 520);
    ctx.lineTo(660, 576);
    ctx.lineTo(1044, 576);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#689f38';
    ctx.beginPath();
    ctx.moveTo(760, 180);
    ctx.bezierCurveTo(730, 300, 700, 450, 670, 530);
    ctx.lineTo(710, 540);
    ctx.bezierCurveTo(740, 450, 770, 300, 790, 180);
    ctx.fill();

    ctx.fillStyle = '#2e7d32';
    ctx.beginPath();
    ctx.ellipse(512, -20, 580, 140, 0, 0, Math.PI);
    ctx.fill();

    ctx.fillStyle = '#388e3c';
    for (let x = 40; x < 1000; x += 70) {
      ctx.beginPath();
      ctx.arc(x, 70, 45 + Math.sin(x) * 15, 0, Math.PI * 2);
      ctx.fill();
    }

    canvas.refresh();
  }

  private static createForestGround(scene: Phaser.Scene) {
    if (scene.textures.exists('forest_ground')) return;

    const canvas = scene.textures.createCanvas('forest_ground', 1024, 90);
    if (!canvas) return;
    const ctx = canvas.context;

    ctx.fillStyle = '#3e2723';
    ctx.fillRect(0, 30, 1024, 60);

    ctx.fillStyle = '#558b2f';
    ctx.beginPath();
    ctx.moveTo(0, 30);
    for (let x = 0; x <= 1024; x += 12) {
      const yOffset = (x % 24 === 0) ? -5 : 5;
      ctx.lineTo(x, 25 + yOffset);
    }
    ctx.lineTo(1024, 45);
    ctx.lineTo(0, 45);
    ctx.fill();

    ctx.fillStyle = '#7cb342';
    for (let x = 6; x < 1024; x += 16) {
      ctx.beginPath();
      ctx.moveTo(x, 26);
      ctx.lineTo(x - 3, 12);
      ctx.lineTo(x, 18);
      ctx.lineTo(x + 3, 10);
      ctx.lineTo(x + 2, 26);
      ctx.fill();
    }

    ctx.fillStyle = '#546e7a';
    ctx.fillRect(60, 35, 30, 15);
    ctx.fillRect(840, 38, 35, 14);

    ctx.fillStyle = '#f48fb1';
    for (let x = 110; x < 260; x += 18) {
      ctx.beginPath();
      ctx.arc(x, 20 + Math.sin(x) * 4, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#f50057';
      ctx.fillRect(x - 1, 19 + Math.sin(x) * 4, 2, 2);
      ctx.fillStyle = '#f48fb1';
    }

    ctx.fillStyle = '#ffffff';
    for (let x = 740; x < 880; x += 22) {
      ctx.beginPath();
      ctx.arc(x, 22 + Math.cos(x) * 4, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffeb3b';
      ctx.fillRect(x - 1, 21 + Math.cos(x) * 4, 2, 2);
      ctx.fillStyle = '#ffffff';
    }

    canvas.refresh();
  }

  private static createParticleTextures(scene: Phaser.Scene) {
    if (!scene.textures.exists('particle_leaf')) {
      const canvas = scene.textures.createCanvas('particle_leaf', 12, 12);
      if (canvas) {
        const ctx = canvas.context;
        ctx.fillStyle = '#7cb342';
        ctx.beginPath();
        ctx.ellipse(6, 6, 5, 2.5, Math.PI / 4, 0, Math.PI * 2);
        ctx.fill();
        canvas.refresh();
      }
    }

    if (!scene.textures.exists('particle_spike')) {
      const canvas = scene.textures.createCanvas('particle_spike', 10, 10);
      if (canvas) {
        const ctx = canvas.context;
        ctx.fillStyle = '#bf360c';
        ctx.beginPath();
        ctx.moveTo(5, 0);
        ctx.lineTo(10, 10);
        ctx.lineTo(0, 10);
        ctx.closePath();
        ctx.fill();
        canvas.refresh();
      }
    }

    if (!scene.textures.exists('particle_gold')) {
      const canvas = scene.textures.createCanvas('particle_gold', 10, 10);
      if (canvas) {
        const ctx = canvas.context;
        ctx.fillStyle = '#ffee58';
        ctx.fillRect(4, 0, 2, 10);
        ctx.fillRect(0, 4, 10, 2);
        canvas.refresh();
      }
    }
  }
}
