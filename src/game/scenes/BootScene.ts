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
    this.load.image('background', '/assets/themes/carnival/background.png');
    this.load.image('ticket', '/assets/themes/carnival/item_normal_01.png');
    this.load.image('mask', '/assets/themes/carnival/item_hazard_01.png');
    this.load.image('star', '/assets/themes/carnival/item_bonus_01.png');
    this.load.image('basket', '/assets/themes/carnival/basket.png');

    // 2. Preload active theme image assets
    const themeId = theme.id;
    const bgPath = theme.background_url || theme.background;
    const catcherPath = theme.basket_config?.imageUrl || theme.catcher;

    if (bgPath && bgPath !== '/assets/themes/carnival/background.png' && !bgPath.startsWith('theme_')) {
      this.load.image(`theme_${themeId}_bg`, bgPath);
    }
    if (catcherPath && catcherPath !== '/assets/themes/carnival/basket.png') {
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

    // Launch main GameScene with canonical design dimensions
    this.scene.start('GameScene', {
      designWidth: this.scale.width,
      designHeight: this.scale.height,
      isPortrait: this.scale.height > this.scale.width,
    });
  }
}
