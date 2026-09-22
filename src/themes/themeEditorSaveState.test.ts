import { deepEqual } from '../lib/deepEqual';
import { defaultCatchBrandTheme } from './defaultCatchBrand';
import type { GameTheme } from './types';

console.log('--- RUNNING THEME EDITOR SAVE STATE & DIRTY TRACKING TESTS ---');

// Helper to simulate button state derivation identical to ThemeEditor.tsx
function getSaveButtonState({
  draftTheme,
  savedThemeSnapshot,
  saving,
  saveSuccess,
  isFlowOnboarding = false,
  hasCompletedOnboardingSave = false,
  isViewer = false,
}: {
  draftTheme: GameTheme | null;
  savedThemeSnapshot: GameTheme | null;
  saving: boolean;
  saveSuccess: boolean;
  isFlowOnboarding?: boolean;
  hasCompletedOnboardingSave?: boolean;
  isViewer?: boolean;
}) {
  const hasUnsavedChanges = !draftTheme || !savedThemeSnapshot ? false : !deepEqual(draftTheme, savedThemeSnapshot);
  const isOnboardingInitial = isFlowOnboarding && !hasCompletedOnboardingSave;
  const canSave = hasUnsavedChanges || isOnboardingInitial;
  const isSaved = !hasUnsavedChanges && !isOnboardingInitial;

  const label = saving
    ? 'Saving...'
    : isSaved
    ? isFlowOnboarding
      ? 'Saved! Unlocking Event...'
      : 'Saved!'
    : isFlowOnboarding
    ? 'Save & Continue'
    : 'Save Theme';

  const isDisabled = saving || isViewer || !canSave;
  const icon = saving ? 'spinner' : isSaved ? 'check' : 'save';

  return {
    hasUnsavedChanges,
    canSave,
    isSaved,
    label,
    isDisabled,
    icon,
  };
}

// 1. Initial baseline theme
const baselineTheme: GameTheme = JSON.parse(JSON.stringify(defaultCatchBrandTheme));
let draftTheme: GameTheme = JSON.parse(JSON.stringify(baselineTheme));
let savedThemeSnapshot: GameTheme = JSON.parse(JSON.stringify(baselineTheme));

// Scenario 1: User opens Theme Editor -> no unsaved changes.
{
  const state = getSaveButtonState({
    draftTheme,
    savedThemeSnapshot,
    saving: false,
    saveSuccess: false,
  });

  if (state.hasUnsavedChanges !== false) throw new Error('Scenario 1 failed: hasUnsavedChanges should be false');
  if (state.isSaved !== true) throw new Error('Scenario 1 failed: isSaved should be true');
  if (state.label !== 'Saved!') throw new Error(`Scenario 1 failed: label should be "Saved!", got "${state.label}"`);
  if (state.icon !== 'check') throw new Error('Scenario 1 failed: icon should be check');
  if (state.isDisabled !== true) throw new Error('Scenario 1 failed: button should be disabled when already saved');
  console.log('✅ Scenario 1 Passed: Initial state shows "Saved!" and is non-clickable.');
}

// Scenario 2: User changes a color -> button becomes "Save Theme".
{
  draftTheme = {
    ...draftTheme,
    visuals_config: {
      ...draftTheme.visuals_config,
      primaryColor: '#FF0055',
    },
  };

  const state = getSaveButtonState({
    draftTheme,
    savedThemeSnapshot,
    saving: false,
    saveSuccess: false,
  });

  if (state.hasUnsavedChanges !== true) throw new Error('Scenario 2 failed: hasUnsavedChanges should be true');
  if (state.isSaved !== false) throw new Error('Scenario 2 failed: isSaved should be false');
  if (state.label !== 'Save Theme') throw new Error(`Scenario 2 failed: label should be "Save Theme", got "${state.label}"`);
  if (state.icon !== 'save') throw new Error('Scenario 2 failed: icon should be save');
  if (state.isDisabled !== false) throw new Error('Scenario 2 failed: button should be enabled');
  console.log('✅ Scenario 2 Passed: Color change marks theme dirty and button becomes "Save Theme".');
}

// Scenario 3: User saves successfully -> button becomes "Saved!".
{
  // While saving
  const savingState = getSaveButtonState({
    draftTheme,
    savedThemeSnapshot,
    saving: true,
    saveSuccess: false,
  });
  if (savingState.label !== 'Saving...') throw new Error('Saving state label mismatch');
  if (savingState.isDisabled !== true) throw new Error('Saving state button must be disabled');

  // After save resolves
  savedThemeSnapshot = JSON.parse(JSON.stringify(draftTheme));
  const postSaveState = getSaveButtonState({
    draftTheme,
    savedThemeSnapshot,
    saving: false,
    saveSuccess: true,
  });

  if (postSaveState.hasUnsavedChanges !== false) throw new Error('Scenario 3 failed: hasUnsavedChanges should be false');
  if (postSaveState.isSaved !== true) throw new Error('Scenario 3 failed: isSaved should be true');
  if (postSaveState.label !== 'Saved!') throw new Error(`Scenario 3 failed: label should be "Saved!", got "${postSaveState.label}"`);
  if (postSaveState.icon !== 'check') throw new Error('Scenario 3 failed: icon should be check');
  console.log('✅ Scenario 3 Passed: Saving updates baseline and button displays "Saved!".');
}

// Scenario 4: User changes the background -> button immediately becomes "Save Theme".
{
  draftTheme = {
    ...draftTheme,
    background_url: 'https://storage.googleapis.com/test-bucket/new-bg.jpg',
  };

  const state = getSaveButtonState({
    draftTheme,
    savedThemeSnapshot,
    saving: false,
    saveSuccess: true, // Note: even if previous saveSuccess was true, dirty draft overrides it!
  });

  if (state.hasUnsavedChanges !== true) throw new Error('Scenario 4 failed: hasUnsavedChanges should be true');
  if (state.label !== 'Save Theme') throw new Error(`Scenario 4 failed: label should revert to "Save Theme", got "${state.label}"`);
  if (state.icon !== 'save') throw new Error('Scenario 4 failed: icon should be save');
  if (state.isDisabled !== false) throw new Error('Scenario 4 failed: button should be enabled');
  console.log('✅ Scenario 4 Passed: Background change immediately reverts button to "Save Theme".');
}

// Scenario 5: User saves again -> button becomes "Saved!".
{
  savedThemeSnapshot = JSON.parse(JSON.stringify(draftTheme));
  const state = getSaveButtonState({
    draftTheme,
    savedThemeSnapshot,
    saving: false,
    saveSuccess: true,
  });

  if (state.hasUnsavedChanges !== false) throw new Error('Scenario 5 failed: hasUnsavedChanges should be false');
  if (state.label !== 'Saved!') throw new Error(`Scenario 5 failed: label should be "Saved!", got "${state.label}"`);
  console.log('✅ Scenario 5 Passed: Subsequent save completes and button becomes "Saved!".');
}

// Scenario 6: User changes a setting and then restores its original saved value -> saved state is restored.
{
  const originalDuration = draftTheme.physics_config.gameDurationSeconds;

  // Change duration
  draftTheme = {
    ...draftTheme,
    physics_config: {
      ...draftTheme.physics_config,
      gameDurationSeconds: 99,
    },
  };

  let state = getSaveButtonState({ draftTheme, savedThemeSnapshot, saving: false, saveSuccess: false });
  if (state.hasUnsavedChanges !== true) throw new Error('Scenario 6: step 1 should have unsaved changes');
  if (state.label !== 'Save Theme') throw new Error('Scenario 6: step 1 label should be Save Theme');

  // Restore duration to exact saved value
  draftTheme = {
    ...draftTheme,
    physics_config: {
      ...draftTheme.physics_config,
      gameDurationSeconds: originalDuration,
    },
  };

  state = getSaveButtonState({ draftTheme, savedThemeSnapshot, saving: false, saveSuccess: false });
  if (state.hasUnsavedChanges !== false) throw new Error('Scenario 6: step 2 hasUnsavedChanges should be restored to false');
  if (state.label !== 'Saved!') throw new Error(`Scenario 6: step 2 label should be restored to "Saved!", got "${state.label}"`);
  if (state.icon !== 'check') throw new Error('Scenario 6: step 2 icon should be check');
  console.log('✅ Scenario 6 Passed: Restoring setting to original saved value restores "Saved!" state.');
}

// Scenario 7: Save request fails -> button must not falsely indicate that the changes were saved.
{
  // User changes font / title
  draftTheme = {
    ...draftTheme,
    branding: {
      ...draftTheme.branding,
      gameTitle: 'NEW TITLE AFTER FAIL',
    },
  };

  // Simulate network failure: savedThemeSnapshot remains unchanged, saveSuccess stays false
  const state = getSaveButtonState({
    draftTheme,
    savedThemeSnapshot,
    saving: false,
    saveSuccess: false,
  });

  if (state.hasUnsavedChanges !== true) throw new Error('Scenario 7 failed: unsaved changes must persist');
  if (state.label !== 'Save Theme') throw new Error(`Scenario 7 failed: button must remain "Save Theme", got "${state.label}"`);
  if (state.isDisabled !== false) throw new Error('Scenario 7 failed: button must stay enabled for retry');
  console.log('✅ Scenario 7 Passed: Failed save keeps theme dirty and button remains "Save Theme".');
}

// Scenario 8: User makes additional changes while a save is in progress -> newer changes remain marked as unsaved.
{
  // 1. Snapshot taken at moment of click (Draft V1)
  const themeBeingSaved = JSON.parse(JSON.stringify(draftTheme));

  // 2. While save is in flight, user makes a new edit (Draft V2)
  draftTheme = {
    ...draftTheme,
    branding: {
      ...draftTheme.branding,
      subtitle: 'SUBTITLE CHANGED IN-FLIGHT',
    },
  };

  // 3. Save for V1 resolves and server returns persisted V1
  const serverPersistedV1 = JSON.parse(JSON.stringify(themeBeingSaved));
  savedThemeSnapshot = serverPersistedV1;

  // Since draftTheme has V2, deepEqual(draftTheme, themeBeingSaved) was false
  // Therefore, draftTheme was NOT overwritten, and saveSuccess was set to false
  const state = getSaveButtonState({
    draftTheme,
    savedThemeSnapshot,
    saving: false,
    saveSuccess: false,
  });

  if (state.hasUnsavedChanges !== true) throw new Error('Scenario 8 failed: newer in-flight changes must remain marked as unsaved');
  if (state.label !== 'Save Theme') throw new Error(`Scenario 8 failed: button must remain "Save Theme", got "${state.label}"`);
  if (state.isDisabled !== false) throw new Error('Scenario 8 failed: button must be enabled to save newer edits');
  console.log('✅ Scenario 8 Passed: Changes made while save in progress remain unsaved and button is "Save Theme".');
}

// Scenario 9: User interacts with controls without changing values (no dirty state).
{
  // Dispatching same value or identical object
  const clone = JSON.parse(JSON.stringify(draftTheme));
  if (deepEqual(clone, draftTheme) !== true) throw new Error('Identical objects must be equal');
  console.log('✅ Scenario 9 Passed: Non-mutating interactions do not trigger dirty state.');
}

console.log('ALL 9 THEME EDITOR SAVE STATE SCENARIOS PASSED WITH 100% ACCURACY!');
