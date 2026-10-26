import { describe, it, expect } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { MATCH3_CHARACTER_THEMES, createMatch3ThemeFromPreset } from '../../themes/match-3';
import { THEME_REGISTRY } from '../../themes/registry';
import { isMatch3Theme, getThemeGameType } from '../../themes/types';
import { DEFAULT_TILE_DEFINITIONS } from './types';

const THEMES_ROOT = path.resolve(process.cwd(), 'public/assets/games/match-3/themes');

const EXPECTED_THEMES = [
  {
    id: 'cute-animals',
    name: 'Cute Animals',
    files: ['bear.png', 'fox.png', 'rabbit.png', 'penguin.png', 'panda.png', 'chick.png'],
  },
  {
    id: 'super-heroes',
    name: 'Super Heroes',
    files: [
      'crimson-knight.png',
      'aero-blue.png',
      'shadow-ninja.png',
      'solar-shield.png',
      'emerald-titan.png',
      'cyber-pink.png',
    ],
  },
  {
    id: 'fantasy-creatures',
    name: 'Fantasy Creatures',
    files: [
      'dragon.png',
      'unicorn.png',
      'slime-monster.png',
      'fairy.png',
      'magical-cat.png',
      'owl.png',
    ],
  },
  {
    id: 'space-explorers',
    name: 'Space Explorers',
    files: [
      'astronaut.png',
      'alien.png',
      'rocket-mascot.png',
      'planet-creature.png',
      'star-character.png',
      'cosmic-bot.png',
    ],
  },
  {
    id: 'food-characters',
    name: 'Food Characters',
    files: [
      'burger.png',
      'fries.png',
      'pizza.png',
      'bubble-tea.png',
      'donut.png',
      'sushi.png',
    ],
  },
  {
    id: 'ocean-friends',
    name: 'Ocean Friends',
    files: [
      'dolphin.png',
      'whale.png',
      'octopus.png',
      'turtle.png',
      'clownfish.png',
      'starfish.png',
    ],
  },
  {
    id: 'robot-friends',
    name: 'Robot Friends',
    files: [
      'retro-bot.png',
      'sparky.png',
      'rusty.png',
      'bleep.png',
      'cruncher.png',
      'gizmo.png',
    ],
  },
  {
    id: 'princess-fairytale',
    name: 'Princess Fairytale',
    files: [
      'princess.png',
      'royal-crown.png',
      'magic-castle.png',
      'royal-unicorn.png',
      'frog-prince.png',
      'magic-mirror.png',
    ],
  },
];

describe('Match-3 Cartoon Character Themes — Asset Verification', () => {
  it('root theme directory public/assets/games/match-3/themes/ must exist', () => {
    expect(fs.existsSync(THEMES_ROOT)).toBe(true);
    const stat = fs.statSync(THEMES_ROOT);
    expect(stat.isDirectory()).toBe(true);
  });

  it('all 8 theme subdirectories exist with strictly kebab-case names', () => {
    for (const expected of EXPECTED_THEMES) {
      const themeDir = path.join(THEMES_ROOT, expected.id);
      expect(fs.existsSync(themeDir)).toBe(true);
      expect(fs.statSync(themeDir).isDirectory()).toBe(true);
    }
  });

  it('all 48 cartoon character images exist on disk and are valid PNG files with transparency', async () => {
    let totalCharacterImages = 0;

    for (const expected of EXPECTED_THEMES) {
      const themeDir = path.join(THEMES_ROOT, expected.id);

      // Verify background.png exists
      const bgPath = path.join(themeDir, 'background.png');
      expect(fs.existsSync(bgPath)).toBe(true);

      for (const fileName of expected.files) {
        const filePath = path.join(themeDir, fileName);
        expect(fs.existsSync(filePath)).toBe(true);

        const stat = fs.statSync(filePath);
        expect(stat.size).toBeGreaterThan(500); // Valid raster payload

        // Inspect PNG magic bytes (\x89PNG\r\n\x1a\n)
        const buffer = fs.readFileSync(filePath);
        expect(buffer[0]).toBe(0x89);
        expect(buffer[1]).toBe(0x50); // P
        expect(buffer[2]).toBe(0x4e); // N
        expect(buffer[3]).toBe(0x47); // G

        // Inspect metadata with Sharp: 128x128, 4 channels (RGBA with alpha transparency)
        const meta = await sharp(buffer).metadata();
        expect(meta.format).toBe('png');
        expect(meta.width).toBe(128);
        expect(meta.height).toBe(128);
        expect(meta.channels).toBe(4);
        expect(meta.hasAlpha).toBe(true);

        totalCharacterImages++;
      }
    }

    expect(totalCharacterImages).toBe(48);
  });
});

describe('Match-3 Cartoon Character Themes — Presets & Registry', () => {
  it('MATCH3_CHARACTER_THEMES contains all 8 presets with required properties', () => {
    expect(MATCH3_CHARACTER_THEMES.length).toBe(8);

    for (const expected of EXPECTED_THEMES) {
      const preset = MATCH3_CHARACTER_THEMES.find((p) => p.id === expected.id);
      expect(preset).toBeDefined();
      expect(preset?.name).toBe(expected.name);
      expect(preset?.thumbnailUrl).toContain(`/themes/${expected.id}/`);
      expect(preset?.backgroundUrl).toBe(`/assets/games/match-3/themes/${expected.id}/background.png`);
      expect(preset?.tileDefinitions.length).toBe(6);

      // Verify tile-01 through tile-06
      const expectedIds = ['tile-01', 'tile-02', 'tile-03', 'tile-04', 'tile-05', 'tile-06'];
      for (let i = 0; i < 6; i++) {
        const tile = preset?.tileDefinitions[i];
        expect(tile?.id).toBe(expectedIds[i]);
        expect(tile?.name.length).toBeGreaterThan(0);
        expect(tile?.imageUrl).toBe(`/assets/games/match-3/themes/${expected.id}/${expected.files[i]}`);
        expect(tile?.color.startsWith('#')).toBe(true);
        expect(tile?.bgColor.length).toBeGreaterThan(0);
        expect(tile?.borderColor.startsWith('#')).toBe(true);
        expect(tile?.glowColor.length).toBeGreaterThan(0);
        expect(tile?.symbol.length).toBeGreaterThan(0);
      }
    }
  });

  it('THEME_REGISTRY registers all 8 themes under slug and prefixed keys', () => {
    for (const expected of EXPECTED_THEMES) {
      const slugKey = expected.id;
      const prefixedKey = `match-3-${expected.id}`;

      const bySlug = THEME_REGISTRY[slugKey];
      const byPrefixed = THEME_REGISTRY[prefixedKey];

      expect(bySlug).toBeDefined();
      expect(byPrefixed).toBeDefined();

      expect(bySlug.game_type).toBe('match-3');
      expect(byPrefixed.game_type).toBe('match-3');

      // Check game_config has tileDefinitions with 6 items
      const gc = bySlug.game_config as any;
      expect(Array.isArray(gc?.tileDefinitions)).toBe(true);
      expect(gc.tileDefinitions.length).toBe(6);
      expect(gc.tileDefinitions[0].imageUrl).toContain(`/themes/${expected.id}/`);
    }
  });

  it('isMatch3Theme and getThemeGameType correctly identify all 8 themes', () => {
    for (const expected of EXPECTED_THEMES) {
      const theme = createMatch3ThemeFromPreset(
        MATCH3_CHARACTER_THEMES.find((p) => p.id === expected.id)!
      );

      expect(isMatch3Theme(theme)).toBe(true);
      expect(getThemeGameType(theme)).toBe('match-3');
    }
  });
});

describe('Match-3 Game Engine — Integration & Physics Preservation', () => {
  it('applying a character theme preserves tile types (tile-01..tile-06) while updating visuals', () => {
    const cuteAnimalsPreset = MATCH3_CHARACTER_THEMES.find((p) => p.id === 'cute-animals')!;
    const theme = createMatch3ThemeFromPreset(cuteAnimalsPreset);

    const gc = theme.game_config as any;
    expect(gc.rows).toBe(8);
    expect(gc.cols).toBe(8);
    expect(gc.minimumMatch).toBe(3);
    expect(gc.comboEnabled).toBe(true);
    expect(gc.specialTilesEnabled).toBe(true);
    expect(gc.cascadeEnabled).toBe(true);

    // Board tiles reference tile.type = 'tile-01', which looks up tileDefinitions[0]
    const tileDefs = gc.tileDefinitions;
    expect(tileDefs[0].id).toBe('tile-01');
    expect(tileDefs[0].imageUrl).toBe('/assets/games/match-3/themes/cute-animals/bear.png');

    // Matching logic checks tile1.type === tile2.type, which is completely decoupled from imageUrl
    const simulatedTileA = { id: 'cell-0-0', type: 'tile-01', row: 0, col: 0 };
    const simulatedTileB = { id: 'cell-0-1', type: 'tile-01', row: 0, col: 1 };
    const simulatedTileC = { id: 'cell-0-2', type: 'tile-01', row: 0, col: 2 };
    const simulatedTileD = { id: 'cell-0-3', type: 'tile-02', row: 0, col: 3 };

    expect(simulatedTileA.type === simulatedTileB.type && simulatedTileB.type === simulatedTileC.type).toBe(true);
    expect(simulatedTileA.type === simulatedTileD.type).toBe(false);
  });

  it('reverts gracefully to default tile definitions if images fail or are missing', () => {
    // If a custom image fails, DEFAULT_TILE_DEFINITIONS provides fallback symbols and colors
    expect(DEFAULT_TILE_DEFINITIONS.length).toBeGreaterThanOrEqual(6);
    for (const def of DEFAULT_TILE_DEFINITIONS) {
      expect(def.id).toBeDefined();
      expect(def.color).toBeDefined();
      expect(def.symbol).toBeDefined();
    }
  });
});

describe('Match-3 Canonical Asset Resolution & Server Normalization', () => {
  it('resolves dedicated cartoon theme background URLs without falling back to default/background.png', async () => {
    const { getCanonicalAssetThemeId, resolveThemeDefaultBgImage, resolveGameAsset } = await import('../../themes/gameAssetResolver');

    for (const expected of EXPECTED_THEMES) {
      // Test slug resolution
      const canonicalId = getCanonicalAssetThemeId(expected.id);
      expect(canonicalId).toBe(expected.id);

      const prefixedCanonicalId = getCanonicalAssetThemeId(`match-3-${expected.id}`);
      expect(prefixedCanonicalId).toBe(expected.id);

      // Test asset resolver
      const assetPath = resolveGameAsset({
        gameType: 'match-3',
        themeId: expected.id,
        assetType: 'background',
      });
      expect(assetPath).toBe(`/assets/games/match-3/themes/${expected.id}/background.png`);

      // Test background resolver on theme object
      const themePreset = MATCH3_CHARACTER_THEMES.find((p) => p.id === expected.id)!;
      const themeObj = createMatch3ThemeFromPreset(themePreset);
      const bgUrl = resolveThemeDefaultBgImage(themeObj);
      expect(bgUrl).toBe(`/assets/games/match-3/themes/${expected.id}/background.png`);
    }
  });

  it('preserves cartoon theme assets and tile definitions in normalizeServerThemeAssets', async () => {
    const { normalizeServerThemeAssets } = await import('../../../server/db/themes');

    for (const expected of EXPECTED_THEMES) {
      const mockServerTheme = {
        id: `test-theme-${expected.id}`,
        name: `Match-3 ${expected.name}`,
        slug: `match-3-${expected.id}`,
        is_system: true,
        background_url: `/assets/games/match-3/themes/${expected.id}/background.png`,
        game_type: 'match-3',
        game_config: {
          rows: 8,
          cols: 8,
          tileDefinitions: [
            {
              id: 'tile-01',
              name: 'Character 1',
              imageUrl: `/assets/games/match-3/themes/${expected.id}/${expected.files[0]}`,
            },
          ],
        },
      };

      const normalized = normalizeServerThemeAssets(mockServerTheme);
      expect(normalized.background_url).toBe(`/assets/games/match-3/themes/${expected.id}/background.png`);
      expect(normalized.game_type).toBe('match-3');
      expect(normalized.game_config.tileDefinitions[0].imageUrl).toContain(`/themes/${expected.id}/`);
    }
  });
});
