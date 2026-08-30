import { normalizeGameTheme } from '../../src/themes/registry';
import { getMemoryMatchConfig } from '../../src/themes/types';

function resolveMemoryMatchGameDuration(
  activeTheme: any,
  settings?: any,
  config?: any
): number {
  const memoryConfig = getMemoryMatchConfig(activeTheme);
  const hasMemoryGameConfig =
    activeTheme?.game_config &&
    typeof activeTheme.game_config === 'object' &&
    activeTheme.game_config.gameplay &&
    typeof activeTheme.game_config.gameplay.gameDurationSeconds === 'number';

  return hasMemoryGameConfig
    ? memoryConfig.gameplay.gameDurationSeconds
    : (
        activeTheme?.physics_config?.gameDurationSeconds ??
        settings?.gameDurationSeconds ??
        config?.gameDurationSeconds ??
        memoryConfig.gameplay.gameDurationSeconds ??
        45
      );
}

function runTests() {
  console.log('======================================================');
  console.log(' RUNNING MEMORY MATCH DURATION RESOLUTION TESTS');
  console.log('======================================================');

  // Exact GameShell config passed from GAME_REGISTRY['memory-match'].defaultConfig
  const mmRegistryConfig = {
    gameDurationSeconds: 45,
    mismatchDelayMs: 850,
    matchPoints: 100,
    comboPoints: 30,
  };
  const genericSettings = { gameDurationSeconds: 45 };

  // Test A: 20 seconds custom duration in game_config
  console.log('--- Test A: Theme with game_config duration = 20s ---');
  const theme20 = normalizeGameTheme({
    id: 'theme-20',
    game_slug: 'memory-match',
    game_config: {
      gameplay: {
        gameDurationSeconds: 20,
      },
    },
  });
  const duration20 = resolveMemoryMatchGameDuration(theme20, genericSettings, mmRegistryConfig);
  if (duration20 !== 20) {
    throw new Error(`Test A Failed: Expected 20, got ${duration20}`);
  }
  console.log('  ✓ PASS: Theme 20s correctly produces 20s even with registry config = 45s');

  // Test B: 60 seconds custom duration
  console.log('--- Test B: Theme with game_config duration = 60s ---');
  const theme60 = normalizeGameTheme({
    id: 'theme-60',
    game_slug: 'memory-match',
    game_config: {
      gameplay: {
        gameDurationSeconds: 60,
      },
    },
  });
  const duration60 = resolveMemoryMatchGameDuration(theme60, genericSettings, mmRegistryConfig);
  if (duration60 !== 60) {
    throw new Error(`Test B Failed: Expected 60, got ${duration60}`);
  }
  console.log('  ✓ PASS: Theme 60s correctly produces 60s');

  // Test C: 120 seconds custom duration
  console.log('--- Test C: Theme with game_config duration = 120s ---');
  const theme120 = normalizeGameTheme({
    id: 'theme-120',
    game_slug: 'memory-match',
    game_config: {
      gameplay: {
        gameDurationSeconds: 120,
      },
    },
  });
  const duration120 = resolveMemoryMatchGameDuration(theme120, genericSettings, mmRegistryConfig);
  if (duration120 !== 120) {
    throw new Error(`Test C Failed: Expected 120, got ${duration120}`);
  }
  console.log('  ✓ PASS: Theme 120s correctly produces 120s');

  // Test D: Legacy theme with no game_config, but physics_config = 35
  console.log('--- Test D: Legacy theme with physics_config = 35s ---');
  const legacyTheme = {
    id: 'legacy-theme',
    game_slug: 'memory-match',
    physics_config: {
      gameDurationSeconds: 35,
    },
  };
  const legacyDuration = resolveMemoryMatchGameDuration(legacyTheme, undefined, mmRegistryConfig);
  if (legacyDuration !== 35) {
    throw new Error(`Test D Failed: Expected 35, got ${legacyDuration}`);
  }
  console.log('  ✓ PASS: Legacy theme correctly falls back to physics_config 35s');

  // Test E: New theme with no custom duration defaults to registry 45s
  console.log('--- Test E: Blank theme fallback to 45s ---');
  const blankTheme = {
    id: 'blank-theme',
    game_slug: 'memory-match',
  };
  const defaultDuration = resolveMemoryMatchGameDuration(blankTheme, undefined, mmRegistryConfig);
  if (defaultDuration !== 45) {
    throw new Error(`Test E Failed: Expected 45, got ${defaultDuration}`);
  }
  console.log('  ✓ PASS: Blank theme defaults to 45s');

  console.log('======================================================');
  console.log(' ALL MEMORY MATCH DURATION TESTS PASSED!');
  console.log('======================================================');
}

runTests();
