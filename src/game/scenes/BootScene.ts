import Phaser from 'phaser';
import { TextureGenerator } from '../systems/TextureGenerator';
import {
  getActiveTheme,
  getCanonicalAssetThemeId,
  resolveThemeDefaultBgImage,
  resolveThemeDefaultBasketImage,
  resolveThemeDefaultItemImage,
} from '../../themes';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  preload() {
    const theme = getActiveTheme();
    const themeId = theme.id;
    const assetThemeId = getCanonicalAssetThemeId(theme);

    // Suppress individual image load warnings so missing assets degrade gracefully to procedural fallbacks
    this.load.on('loaderror', (fileObj: { key: string; src: string }) => {
      if (process.env.NODE_ENV !== 'production') {
        console.warn(
          `[BootScene] Asset file not found: "${fileObj.key}" (${fileObj.src}). Falling back to procedural generator.`
        );
      }
    });

    // 1. Preload default Catch the Brand theme PNG assets into legacy texture keys
    this.load.image('background', '/assets/games/catch-brand/themes/default/background.png');
    this.load.image('ticket', '/assets/games/catch-brand/themes/default/item_normal_01.png');
    this.load.image('mask', '/assets/games/catch-brand/themes/default/item_hazard_01.png');
    this.load.image('star', '/assets/games/catch-brand/themes/default/item_bonus_01.png');
    this.load.image('basket', '/assets/games/catch-brand/themes/default/basket.png');

    // 2. Resolve canonical paths for active theme assets
    const bgPath = resolveThemeDefaultBgImage(theme);
    const catcherPath = resolveThemeDefaultBasketImage(theme);
    const goodItemPath = resolveThemeDefaultItemImage(theme, { isHazard: false, isBonus: false });
    const hazardItemPath = resolveThemeDefaultItemImage(theme, { isHazard: true, isBonus: false });
    const bonusItemPath = resolveThemeDefaultItemImage(theme, { isHazard: false, isBonus: true });

    // Development diagnostics
    console.log(
      `[ThemeAssets]\nthemeId=${themeId}\nassetThemeId=${assetThemeId}\nbackground=${bgPath}\ncatcher=${catcherPath}\ngoodItem=${goodItemPath}\nhazardItem=${hazardItemPath}\nbonusItem=${bonusItemPath}`
    );

    // Preload active theme image assets
    if (bgPath && !bgPath.startsWith('theme_')) {
      this.load.image(`theme_${themeId}_bg`, bgPath);
    }
    if (catcherPath) {
      this.load.image(`theme_${themeId}_catcher`, catcherPath);
    }
    if (goodItemPath) {
      this.load.image(`theme_${themeId}_good`, goodItemPath);
    }
    if (hazardItemPath) {
      this.load.image(`theme_${themeId}_bad`, hazardItemPath);
    }
    if (bonusItemPath) {
      this.load.image(`theme_${themeId}_bonus`, bonusItemPath);
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
