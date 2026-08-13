import Phaser from 'phaser';
import { TextureGenerator } from '../systems/TextureGenerator';
import { getActiveTheme, resolveThemeDefaultItemImage } from '../../themes';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  preload() {
    const theme = getActiveTheme();

    // Suppress individual image load warnings so missing assets degrade gracefully to procedural fallbacks
    this.load.on('loaderror', (fileObj: { key: string; src: string }) => {
      if (process.env.NODE_ENV !== 'production') {
        console.warn(
          `[BootScene] Asset file not found: "${fileObj.key}" (${fileObj.src}). Falling back to procedural generator.`
        );
      }
    });

    // 1. Preload default Durian theme PNG assets into legacy texture keys
    this.load.image('background', '/assets/background.png');
    this.load.image('green_durian', '/assets/durian_green.png');
    this.load.image('orange_durian', '/assets/durian_brown.png');
    this.load.image('golden_durian', '/assets/durian_green.png');
    this.load.image('basket', '/assets/basket.png');

    // 2. Preload active theme image assets
    const themeId = theme.id;
    const bgPath = theme.background_url || theme.background;
    const catcherPath = theme.basket_config?.imageUrl || theme.catcher;

    if (bgPath && bgPath !== '/assets/background.png' && !bgPath.startsWith('theme_')) {
      this.load.image(`theme_${themeId}_bg`, bgPath);
    }
    if (catcherPath && catcherPath !== '/assets/basket.png') {
      this.load.image(`theme_${themeId}_catcher`, catcherPath);
    }

    // Preload item images with theme fallback resolution
    if (Array.isArray(theme.items_config)) {
      theme.items_config.forEach((item, index) => {
        const itemImg = item.imageUrl || resolveThemeDefaultItemImage(theme, item);
        if (itemImg && (itemImg.startsWith('http') || itemImg.startsWith('/assets/') || itemImg.startsWith('data:'))) {
          this.load.image(`theme_${themeId}_item_${item.id || index}`, itemImg);
        }
      });
    }

    // Backward-compat keys
    const firstGood = theme.items_config?.find((i) => !i.isHazard && !i.isBonus);
    const firstBad = theme.items_config?.find((i) => i.isHazard);
    const firstBonus = theme.items_config?.find((i) => i.isBonus);

    const goodUrl = (firstGood && firstGood.imageUrl) || resolveThemeDefaultItemImage(theme, { isHazard: false, isBonus: false });
    const badUrl = (firstBad && firstBad.imageUrl) || resolveThemeDefaultItemImage(theme, { isHazard: true, isBonus: false });
    const bonusUrl = (firstBonus && firstBonus.imageUrl) || resolveThemeDefaultItemImage(theme, { isHazard: false, isBonus: true });

    if (goodUrl && (goodUrl.startsWith('http') || goodUrl.startsWith('/assets/') || goodUrl.startsWith('data:'))) {
      this.load.image(`theme_${themeId}_good`, goodUrl);
    }
    if (badUrl && (badUrl.startsWith('http') || badUrl.startsWith('/assets/') || badUrl.startsWith('data:'))) {
      this.load.image(`theme_${themeId}_bad`, badUrl);
    }
    if (bonusUrl && (bonusUrl.startsWith('http') || bonusUrl.startsWith('/assets/') || bonusUrl.startsWith('data:'))) {
      this.load.image(`theme_${themeId}_bonus`, bonusUrl);
    }
  }

  create() {
    const theme = getActiveTheme();

    // Generate procedural fallback / particle textures if needed
    TextureGenerator.generateTextures(this);
    TextureGenerator.generateThemeTextures(this, theme);

    // Launch main GameScene
    this.scene.start('GameScene');
  }
}
