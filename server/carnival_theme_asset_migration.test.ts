import { test, expect, describe } from 'bun:test';
import fs from 'fs';
import path from 'path';
import { carnivalTheme } from '../src/themes/carnival.js';
import {
  resolveGameAsset,
  resolveThemeDefaultBgImage,
  resolveThemeDefaultBasketImage,
  resolveThemeDefaultItemImage,
  isStaleAssetUrl,
} from '../src/themes/gameAssetResolver.js';
import { normalizeServerThemeAssets } from './db/themes.js';
import worker from '../worker.js';

describe('Carnival Theme Asset Migration to Game-Specific Directory', () => {
  const CANONICAL_DIR = 'public/assets/games/catch-brand/themes/carnival';
  const CANONICAL_URL_PREFIX = '/assets/games/catch-brand/themes/carnival';

  const EXPECTED_FILES = [
    'background.png',
    'basket.png',
    'item_normal_01.png',
    'item_hazard_01.png',
    'item_bonus_01.png',
  ];

  test('1. Canonical directory exists and contains all 5 expected asset files', () => {
    expect(fs.existsSync(CANONICAL_DIR)).toBe(true);

    for (const file of EXPECTED_FILES) {
      const filePath = path.join(CANONICAL_DIR, file);
      expect(fs.existsSync(filePath)).toBe(true);

      const stat = fs.statSync(filePath);
      expect(stat.size).toBeGreaterThan(1000);

      // Verify valid PNG header (\x89PNG\r\n\x1a\n)
      const buffer = fs.readFileSync(filePath);
      expect(buffer[0]).toBe(0x89);
      expect(buffer[1]).toBe(0x50); // 'P'
      expect(buffer[2]).toBe(0x4e); // 'N'
      expect(buffer[3]).toBe(0x47); // 'G'
    }
  });

  test('2. Obsolete and legacy directories do NOT exist on disk', () => {
    const obsoleteDirs = [
      'public/assets/themes/carnival',
    ];

    for (const dir of obsoleteDirs) {
      expect(fs.existsSync(dir)).toBe(false);
    }
  });

  test('3. carnivalTheme definition uses canonical URL prefix for all assets', () => {
    expect(carnivalTheme.background_url).toBe(`${CANONICAL_URL_PREFIX}/background.png`);
    expect(carnivalTheme.basket_config?.imageUrl).toBe(`${CANONICAL_URL_PREFIX}/basket.png`);

    const items = carnivalTheme.items_config || [];
    expect(items.length).toBeGreaterThanOrEqual(3);

    const normalItem = items.find((i: any) => !i.isHazard && !i.isBonus);
    expect(normalItem?.imageUrl).toBe(`${CANONICAL_URL_PREFIX}/item_normal_01.png`);

    const hazardItem = items.find((i: any) => i.isHazard);
    expect(hazardItem?.imageUrl).toBe(`${CANONICAL_URL_PREFIX}/item_hazard_01.png`);

    const bonusItem = items.find((i: any) => i.isBonus);
    expect(bonusItem?.imageUrl).toBe(`${CANONICAL_URL_PREFIX}/item_bonus_01.png`);
  });

  test('4. Runtime asset resolver generates canonical URLs for Carnival assets', () => {
    expect(resolveGameAsset({ gameType: 'catch-brand', themeId: 'carnival', assetType: 'background' }))
      .toBe(`${CANONICAL_URL_PREFIX}/background.png`);
    expect(resolveGameAsset({ gameType: 'catch-brand', themeId: 'carnival', assetType: 'catcher' }))
      .toBe(`${CANONICAL_URL_PREFIX}/basket.png`);
    expect(resolveGameAsset({ gameType: 'catch-brand', themeId: 'carnival', assetType: 'goodItem' }))
      .toBe(`${CANONICAL_URL_PREFIX}/item_normal_01.png`);
    expect(resolveGameAsset({ gameType: 'catch-brand', themeId: 'carnival', assetType: 'hazardItem' }))
      .toBe(`${CANONICAL_URL_PREFIX}/item_hazard_01.png`);
    expect(resolveGameAsset({ gameType: 'catch-brand', themeId: 'carnival', assetType: 'bonusItem' }))
      .toBe(`${CANONICAL_URL_PREFIX}/item_bonus_01.png`);

    // Helper functions
    expect(resolveThemeDefaultBgImage(carnivalTheme))
      .toBe(`${CANONICAL_URL_PREFIX}/background.png`);
    expect(resolveThemeDefaultBasketImage(carnivalTheme))
      .toBe(`${CANONICAL_URL_PREFIX}/basket.png`);
    expect(resolveThemeDefaultItemImage(carnivalTheme, { isHazard: false, isBonus: false }))
      .toBe(`${CANONICAL_URL_PREFIX}/item_normal_01.png`);
    expect(resolveThemeDefaultItemImage(carnivalTheme, { isHazard: true, isBonus: false }))
      .toBe(`${CANONICAL_URL_PREFIX}/item_hazard_01.png`);
    expect(resolveThemeDefaultItemImage(carnivalTheme, { isHazard: false, isBonus: true }))
      .toBe(`${CANONICAL_URL_PREFIX}/item_bonus_01.png`);
  });

  test('5. isStaleAssetUrl flags old carnival paths as stale, canonical paths as valid', () => {
    // Old paths must be flagged as stale
    expect(isStaleAssetUrl('/assets/themes/carnival/background.png')).toBe(true);
    expect(isStaleAssetUrl('assets/themes/carnival/basket.png')).toBe(true);
    expect(isStaleAssetUrl('/assets/games/catch-brand/themes/carnival/background.png')).toBe(true);

    // Canonical path must NOT be flagged as stale
    expect(isStaleAssetUrl(`${CANONICAL_URL_PREFIX}/background.png`)).toBe(false);
    expect(isStaleAssetUrl(`${CANONICAL_URL_PREFIX}/basket.png`)).toBe(false);
    expect(isStaleAssetUrl(`${CANONICAL_URL_PREFIX}/item_normal_01.png`)).toBe(false);
  });

  test('6. Server normalizeServerThemeAssets migrates legacy Carnival paths across all themes', () => {
    const legacyTheme = {
      id: 'custom-org-theme-uuid-1234',
      name: 'Custom Theme Cloned from Old Carnival',
      slug: 'custom-carnival',
      is_system: false,
      organization_id: 'org-1234',
      background_url: '/assets/themes/carnival/background.png',
      basket_config: {
        imageUrl: '/assets/themes/carnival/basket.png',
      },
      items_config: [
        { id: '1', imageUrl: '/assets/themes/carnival/item_normal_01.png', isHazard: false, isBonus: false },
        { id: '2', imageUrl: '/assets/themes/carnival/item_hazard_01.png', isHazard: true, isBonus: false },
        { id: '3', imageUrl: '/assets/themes/carnival/item_bonus_01.png', isHazard: false, isBonus: true },
      ],
    };

    const normalized = normalizeServerThemeAssets(legacyTheme);
    expect(normalized.background_url).toBe(`${CANONICAL_URL_PREFIX}/background.png`);
    expect(normalized.basket_config.imageUrl).toBe(`${CANONICAL_URL_PREFIX}/basket.png`);
    expect(normalized.items_config[0].imageUrl).toBe(`${CANONICAL_URL_PREFIX}/item_normal_01.png`);
    expect(normalized.items_config[1].imageUrl).toBe(`${CANONICAL_URL_PREFIX}/item_hazard_01.png`);
    expect(normalized.items_config[2].imageUrl).toBe(`${CANONICAL_URL_PREFIX}/item_bonus_01.png`);
  });

  test('7. Edge Cloudflare worker redirects legacy Carnival asset URLs to canonical path via 301', async () => {
    const testEnv = {
      NODE_ENV: 'test',
      ASSETS: {
        fetch: async () => new Response('Asset not found', { status: 404 }),
      },
    };

    const legacyUrls = [
      'https://api.eventgamestudio.local/assets/games/catch-brand/themes/carnival/background.png',
      'https://api.eventgamestudio.local/assets/games/catch-brand/themes/carnival/basket.png',
      'https://api.eventgamestudio.local/assets/games/catch-brand/themes/carnival/item_normal_01.png',
      'https://api.eventgamestudio.local/assets/games/catch-brand/themes/carnival/item_hazard_01.png',
    ];

    for (const url of legacyUrls) {
      const filename = url.split('/').pop();
      const req = new Request(url, { method: 'GET' });
      const res = await worker.fetch(req, testEnv);

      expect(res.status).toBe(301);
      const location = res.headers.get('Location') || '';
      expect(location).toContain(`${CANONICAL_URL_PREFIX}/${filename}`);
    }
  });

  test('8. Strict game isolation: Memory Match and Reaction Tap do not use Carnival assets', () => {
    const memoryBg = resolveGameAsset({ gameType: 'memory-match', themeId: 'default', assetType: 'background' });
    expect(memoryBg).toBe('/assets/games/memory-match/themes/default/background.png');
    expect(memoryBg).not.toContain('carnival');

    const reactionBg = resolveGameAsset({ gameType: 'reaction-tap', themeId: 'default', assetType: 'background' });
    expect(reactionBg).toBe('/assets/games/reaction-tap/themes/default/background.png');
    expect(reactionBg).not.toContain('carnival');
  });
});
