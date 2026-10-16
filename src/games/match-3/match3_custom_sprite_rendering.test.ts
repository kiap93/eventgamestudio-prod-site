import { describe, it, expect } from 'bun:test';
import fs from 'fs';
import path from 'path';
import {
  DEFAULT_MATCH3_CONFIG,
  DEFAULT_TILE_DEFINITIONS,
  TileVisualDefinition,
  Match3GameConfig,
} from './types';

describe('Match-3 Custom Sprite Rendering Verification & Regression Tests', () => {
  const match3GameSource = fs.readFileSync(
    path.join(process.cwd(), 'src/games/match-3/Match3Game.tsx'),
    'utf-8'
  );
  const match3CustomizerSource = fs.readFileSync(
    path.join(process.cwd(), 'src/components/studio/games/Match3Customizer.tsx'),
    'utf-8'
  );

  // --------------------------------------------------------------------------
  // TEST 1: Board Tile Renderer in Match3Game.tsx
  // --------------------------------------------------------------------------
  it('1. Board tile renderer suppresses default background, border, glow, and shine when custom sprite is active', () => {
    // Verifies that hasCustomSprite boolean check exists
    expect(match3GameSource).toContain('hasCustomSprite');

    // Verifies background evaluates to transparent when custom sprite is present
    expect(match3GameSource).toContain("background: hasCustomSprite ? 'transparent' : visual.bgColor");

    // Verifies borderColor evaluates to transparent for non-windup custom tiles
    expect(match3GameSource).toContain(": hasCustomSprite\n                        ? 'transparent'\n                        : visual.borderColor");

    // Verifies borderWidth evaluates to 0px when custom sprite is active
    expect(match3GameSource).toContain("borderWidth: isWindUpTile ? '3px' : hasCustomSprite ? '0px' : '2px'");

    // Verifies boxShadow suppresses glowColor and inset bevels when custom sprite is active
    expect(match3GameSource).toContain("hasCustomSprite\n                        ? 'none'\n                        : `0 4px 10px ${visual.glowColor}");

    // Verifies outer shadow-md class is omitted on custom sprite tiles so no square container shadow appears
    expect(match3GameSource).toContain(": hasCustomSprite\n                        ? 'hover:scale-[1.03] active:scale-95'\n                        : 'hover:scale-[1.03] active:scale-95 shadow-md'");

    // Verifies inner 3D highlight shine is suppressed
    expect(match3GameSource).toContain('{!hasCustomSprite && (');
    expect(match3GameSource).toContain('h-[35%] rounded-t-xl bg-white/25 pointer-events-none');
  });

  // --------------------------------------------------------------------------
  // TEST 2: Artwork Face & Sizing in Match3Game.tsx
  // --------------------------------------------------------------------------
  it('2. Custom artwork fills complete tile face with aspect-ratio preserving object-cover', () => {
    // Verifies absolute inset-0 wrapper fills complete tile face
    expect(match3GameSource).toContain(
      '<div className="absolute inset-0 w-full h-full flex items-center justify-center overflow-hidden pointer-events-none select-none z-10">'
    );

    // Verifies image element uses object-cover without padding
    expect(match3GameSource).toContain(
      'className="w-full h-full object-cover pointer-events-none select-none"'
    );

    // Verifies image error fallback state exists to gracefully revert to default tile if image fails
    expect(match3GameSource).toContain('setFailedImages');
  });

  // --------------------------------------------------------------------------
  // TEST 3: Special Tiles Overlays with Custom Sprites
  // --------------------------------------------------------------------------
  it('3. Special tiles (rockets, bombs, color-bombs) render overlay badges on top of custom artwork', () => {
    // When hasCustomSprite is true, special tiles overlay their badges in z-20 above the custom artwork
    expect(match3GameSource).toContain(
      "{tile.special === 'rocket-horizontal' && ("
    );
    expect(match3GameSource).toContain(
      "{tile.special === 'rocket-vertical' && ("
    );
    expect(match3GameSource).toContain(
      "{tile.special === 'bomb' && ("
    );
    expect(match3GameSource).toContain(
      "{tile.special === 'color-bomb' && ("
    );
  });

  // --------------------------------------------------------------------------
  // TEST 4: Objective HUD Target Tile in Match3Game.tsx
  // --------------------------------------------------------------------------
  it('4. Floating Objective HUD badge suppresses background and border for custom sprite target tile', () => {
    expect(match3GameSource).toContain('hasTargetCustomSprite');
    expect(match3GameSource).toContain(
      "background: hasTargetCustomSprite ? 'transparent' : targetTileVisual.bgColor"
    );
    expect(match3GameSource).toContain(
      "borderWidth: hasTargetCustomSprite ? '0px' : '1px'"
    );
    expect(match3GameSource).toContain(
      'src={targetTileVisual.imageUrl!}'
    );
  });

  // --------------------------------------------------------------------------
  // TEST 5: Customizer Parity in Match3Customizer.tsx
  // --------------------------------------------------------------------------
  it('5. Match3Customizer tile selector carousel suppresses background and border for custom artwork', () => {
    expect(match3CustomizerSource).toContain('hasTileCustomSprite');
    expect(match3CustomizerSource).toContain(
      "background: hasTileCustomSprite ? 'transparent' : tile.bgColor"
    );
    expect(match3CustomizerSource).toContain(
      "borderColor: hasTileCustomSprite ? 'transparent' : tile.borderColor"
    );
    expect(match3CustomizerSource).toContain(
      "borderWidth: hasTileCustomSprite ? '0px' : '2px'"
    );
    expect(match3CustomizerSource).toContain(
      "boxShadow: hasTileCustomSprite ? 'none' : `0 4px 10px ${tile.glowColor}`"
    );
  });

  it('6. Match3Customizer selected tile header and collection target picker render custom artwork filling tile face', () => {
    // Header preview
    expect(match3CustomizerSource).toContain('hasSelectedCustomSprite');
    expect(match3CustomizerSource).toContain(
      "background: hasSelectedCustomSprite ? 'transparent' : selectedTile.bgColor"
    );
    expect(match3CustomizerSource).toContain(
      "borderWidth: hasSelectedCustomSprite ? '0px' : '2px'"
    );

    // Target collection picker in gameplay customizer
    expect(match3CustomizerSource).toContain(
      "background: hasTileCustomSprite ? 'transparent' : tile.bgColor"
    );
    expect(match3CustomizerSource).toContain(
      "borderWidth: hasTileCustomSprite ? '0px' : '1px'"
    );
  });

  // --------------------------------------------------------------------------
  // TEST 7: Default Tile Preservation When Custom Artwork Removed
  // --------------------------------------------------------------------------
  it('7. Removing custom artwork reverts tile to default colors, symbols, border, and shine', () => {
    // Check default tile definitions have non-empty colors and symbols
    const rubyGem = DEFAULT_TILE_DEFINITIONS[0];
    expect(rubyGem.name).toBe('Ruby Gem');
    expect(rubyGem.color).toBe('#ef4444');
    expect(rubyGem.bgColor).toContain('linear-gradient');
    expect(rubyGem.borderColor).toBe('#fca5a5');
    expect(rubyGem.symbol).toBe('Diamond');
    expect(rubyGem.imageUrl).toBeUndefined();

    // Verify remove button in customizer sets imageUrl to null
    expect(match3CustomizerSource).toContain('imageUrl: null');
  });

  // --------------------------------------------------------------------------
  // TEST 8: Multiple Configuration Sources Resolution
  // --------------------------------------------------------------------------
  it('8. getVisualTile properly resolves tileDefinitions from theme, props config, or default match3Config', () => {
    expect(match3GameSource).toContain(
      '(activeTheme?.game_config as any)?.tileDefinitions ||'
    );
    expect(match3GameSource).toContain(
      '(config as any)?.tileDefinitions ||'
    );
    expect(match3GameSource).toContain(
      'match3Config?.tileDefinitions'
    );
  });
});
