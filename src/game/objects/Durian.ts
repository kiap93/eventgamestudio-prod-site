import Phaser from 'phaser';
import { DurianType } from '../../types';
import { getActiveTheme, getCanonicalAssetThemeId, resolveThemeDefaultItemImage } from '../../themes';
import { FallingItem } from './FallingItem';
import { ThemeDropItem } from '../../themes/types';

export class Durian extends FallingItem {
  public durianType: DurianType;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    durianType: DurianType,
    scoreValue: number,
    fallSpeed: number,
    customTextureKey?: string,
    itemConfig?: ThemeDropItem
  ) {
    const theme = getActiveTheme();
    const themeId = theme.id;
    const assetThemeId = getCanonicalAssetThemeId(theme);
    const isKnownFestive = assetThemeId === 'christmas' || assetThemeId === 'cny';

    let textureKey = customTextureKey;
    if (!textureKey) {
      if (durianType === 'ORANGE' || durianType === 'BAD') {
        const themeKey = `theme_${themeId}_bad`;
        if (scene.textures.exists(themeKey)) {
          textureKey = themeKey;
        } else if (isKnownFestive) {
          console.error(
            `[ThemeAssets] Missing canonical asset:\ntheme=${assetThemeId}\nassetType=hazardItem\nexpected=${resolveThemeDefaultItemImage(theme, { isHazard: true, isBonus: false })}`
          );
          textureKey = scene.textures.exists('orange_durian') ? 'orange_durian' : 'theme_spike';
        } else if (scene.textures.exists('mask')) {
          textureKey = 'mask';
        } else {
          textureKey = 'orange_durian';
        }
      } else if (durianType === 'GOLDEN' || durianType === 'BONUS') {
        const themeKey = `theme_${themeId}_bonus`;
        if (scene.textures.exists(themeKey)) {
          textureKey = themeKey;
        } else if (isKnownFestive) {
          console.error(
            `[ThemeAssets] Missing canonical asset:\ntheme=${assetThemeId}\nassetType=bonusItem\nexpected=${resolveThemeDefaultItemImage(theme, { isHazard: false, isBonus: true })}`
          );
          textureKey = scene.textures.exists('golden_durian') ? 'golden_durian' : 'theme_star';
        } else if (scene.textures.exists('star')) {
          textureKey = 'star';
        } else {
          textureKey = 'golden_durian';
        }
      } else {
        const themeKey = `theme_${themeId}_good`;
        if (scene.textures.exists(themeKey)) {
          textureKey = themeKey;
        } else if (isKnownFestive) {
          console.error(
            `[ThemeAssets] Missing canonical asset:\ntheme=${assetThemeId}\nassetType=goodItem\nexpected=${resolveThemeDefaultItemImage(theme, { isHazard: false, isBonus: false })}`
          );
          textureKey = scene.textures.exists('green_durian') ? 'green_durian' : 'theme_gold';
        } else if (scene.textures.exists('ticket')) {
          textureKey = 'ticket';
        } else {
          textureKey = 'green_durian';
        }
      }
    }

    const fallbackConfig: ThemeDropItem = itemConfig || {
      id: durianType === 'ORANGE' || durianType === 'BAD' ? 'bad_item' : durianType === 'GOLDEN' || durianType === 'BONUS' ? 'bonus_item' : 'good_item',
      name: durianType,
      points: scoreValue,
      speedMultiplier: 1.0,
      spawnWeight: 50,
      enabled: true,
      isHazard: durianType === 'ORANGE' || durianType === 'BAD',
      isBonus: durianType === 'GOLDEN' || durianType === 'BONUS',
      collisionRadiusRatio: 0.30,
      collisionCenterXRatio: 0.50,
      collisionCenterYRatio: 0.54,
    };

    super(scene, x, y, fallbackConfig, fallSpeed, textureKey);
    this.durianType = durianType;
  }

  public updateDurian() {
    // Rotation handled in preUpdate
  }
}

export { Durian as FallingObject };
export { FallingItem };
