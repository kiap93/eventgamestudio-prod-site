import Phaser from 'phaser';
import { DurianType } from '../../types';
import { getActiveTheme } from '../../themes';
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

    let textureKey = customTextureKey;
    if (!textureKey) {
      if (durianType === 'ORANGE' || durianType === 'BAD') {
        const themeKey = `theme_${themeId}_bad`;
        textureKey = scene.textures.exists(themeKey)
          ? themeKey
          : scene.textures.exists('mask')
          ? 'mask'
          : 'orange_durian';
      } else if (durianType === 'GOLDEN' || durianType === 'BONUS') {
        const themeKey = `theme_${themeId}_bonus`;
        textureKey = scene.textures.exists(themeKey)
          ? themeKey
          : scene.textures.exists('star')
          ? 'star'
          : 'golden_durian';
      } else {
        const themeKey = `theme_${themeId}_good`;
        textureKey = scene.textures.exists(themeKey)
          ? themeKey
          : scene.textures.exists('ticket')
          ? 'ticket'
          : 'green_durian';
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
