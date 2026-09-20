import { GameSettings } from '../types';

export const SETTINGS_CACHE_KEY = 'catch_brand_settings_cache';
export const LEGACY_SETTINGS_CACHE_KEY = 'durian_catcher_settings_cache';

export const DEFAULT_GAME_SETTINGS: GameSettings = {
  volume: 0.8,
  soundEnabled: true,
  bgmEnabled: true,
  fallSpeedMultiplier: 1.0,
  gameDurationSeconds: 30,
  cameraControlEnabled: true,
};

let activeGameSettings: GameSettings = { ...DEFAULT_GAME_SETTINGS };

/**
 * Converts Supabase/server settings_config JSON object into Phaser GameSettings
 */
export function mapServerSettingsToGameSettings(serverSettings: any): GameSettings {
  if (!serverSettings || typeof serverSettings !== 'object') {
    return { ...DEFAULT_GAME_SETTINGS };
  }

  const parsed = typeof serverSettings === 'string' ? JSON.parse(serverSettings) : serverSettings;

  return {
    volume: typeof parsed.soundVolume === 'number'
      ? Math.max(0, Math.min(1, parsed.soundVolume))
      : (typeof parsed.volume === 'number' ? Math.max(0, Math.min(1, parsed.volume)) : DEFAULT_GAME_SETTINGS.volume),
    soundEnabled: typeof parsed.soundEnabled === 'boolean'
      ? parsed.soundEnabled
      : DEFAULT_GAME_SETTINGS.soundEnabled,
    bgmEnabled: typeof parsed.bgmEnabled === 'boolean'
      ? parsed.bgmEnabled
      : DEFAULT_GAME_SETTINGS.bgmEnabled,
    fallSpeedMultiplier: typeof parsed.baseFallSpeed === 'number'
      ? Math.max(0.4, Math.min(2.5, parsed.baseFallSpeed))
      : (typeof parsed.fallSpeedMultiplier === 'number' ? Math.max(0.4, Math.min(2.5, parsed.fallSpeedMultiplier)) : DEFAULT_GAME_SETTINGS.fallSpeedMultiplier),
    gameDurationSeconds: typeof parsed.durationSeconds === 'number'
      ? Math.max(10, Math.min(180, parsed.durationSeconds))
      : (typeof parsed.gameDurationSeconds === 'number' ? Math.max(10, Math.min(180, parsed.gameDurationSeconds)) : DEFAULT_GAME_SETTINGS.gameDurationSeconds),
    cameraControlEnabled: typeof parsed.cameraControlEnabled === 'boolean'
      ? parsed.cameraControlEnabled
      : DEFAULT_GAME_SETTINGS.cameraControlEnabled,
  };
}

/**
 * Converts Phaser GameSettings into Supabase/server settings_config JSON format
 */
export function mapGameSettingsToServerSettings(settings: GameSettings): any {
  return {
    durationSeconds: settings.gameDurationSeconds,
    baseFallSpeed: settings.fallSpeedMultiplier,
    soundVolume: settings.volume,
    soundEnabled: settings.soundEnabled,
    bgmEnabled: settings.bgmEnabled,
    cameraControlEnabled: settings.cameraControlEnabled,
    spawnRateMultiplier: 1.0,
  };
}

/**
 * Sets current active game settings in memory from the authoritative Supabase backend response.
 */
export function setActiveGameSettings(settings: GameSettings): void {
  activeGameSettings = { ...settings };
  try {
    localStorage.setItem(SETTINGS_CACHE_KEY, JSON.stringify(settings));
  } catch (e) {
    // Non-blocking cache error
  }
}

/**
 * Retrieve current GameSettings. Supabase-loaded settings in memory take highest priority,
 * falling back to local cache or defaults.
 */
export function getGameSettings(): GameSettings {
  if (activeGameSettings) {
    return { ...activeGameSettings };
  }

  try {
    const saved = localStorage.getItem(SETTINGS_CACHE_KEY) || localStorage.getItem(LEGACY_SETTINGS_CACHE_KEY);
    if (!saved) return { ...DEFAULT_GAME_SETTINGS };
    
    const parsed = JSON.parse(saved);
    if (typeof parsed !== 'object' || parsed === null) return { ...DEFAULT_GAME_SETTINGS };

    return mapServerSettingsToGameSettings(parsed);
  } catch (e) {
    return { ...DEFAULT_GAME_SETTINGS };
  }
}

/**
 * Persist GameSettings to memory and temporary local cache.
 */
export function saveGameSettings(settings: GameSettings): void {
  activeGameSettings = { ...settings };
  try {
    localStorage.setItem(SETTINGS_CACHE_KEY, JSON.stringify(settings));
  } catch (e) {
    console.warn('Failed to save settings cache:', e);
  }
}

/**
 * Reset settings to default values.
 */
export function resetGameSettings(): GameSettings {
  const defaults = { ...DEFAULT_GAME_SETTINGS };
  saveGameSettings(defaults);
  return defaults;
}
