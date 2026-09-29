import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Architectural Verification Test Suite:
 * CATCH THE BRAND START GAME LIFECYCLE & MULTI-CLICK BUG PREVENTION
 *
 * Verifies that:
 * 1. resetStats() safely checks `this.itemsGroup` before calling .clear() to prevent:
 *    "Cannot read properties of undefined (reading 'clear')"
 * 2. GameScene tracks `isSceneCreated` and queues `pendingStartOnCreate` if startNewGame()
 *    is invoked before create() lifecycle finishes.
 * 3. CatchBrandGame uses `pendingStartRef` to queue user clicks while Phaser is booting,
 *    ensuring the game starts immediately on the first click without requiring multiple clicks.
 */
async function runTests() {
  console.log('====================================================');
  console.log('TEST SUITE: START GAME LIFECYCLE VERIFICATION');
  console.log('====================================================\n');

  const gameScenePath = path.resolve('./src/game/scenes/GameScene.ts');
  const gameSceneSource = fs.readFileSync(gameScenePath, 'utf-8');

  const catchBrandPath = path.resolve('./src/games/catch-brand/CatchBrandGame.tsx');
  const catchBrandSource = fs.readFileSync(catchBrandPath, 'utf-8');

  // Test 1: Verify resetStats() in GameScene has safe check for itemsGroup
  console.log('1. Checking itemsGroup safe clearance in GameScene.resetStats()...');
  {
    assert.ok(
      gameSceneSource.includes('if (this.itemsGroup) {\n      this.itemsGroup.clear(true, true);\n    }') ||
      gameSceneSource.includes('if (this.itemsGroup)') && gameSceneSource.includes('.clear(true, true)'),
      'GameScene.resetStats() must guard this.itemsGroup before calling .clear()'
    );

    // Ensure raw unchecked `this.itemsGroup.clear` does NOT exist
    const rawMatches = gameSceneSource.match(/this\.itemsGroup\.clear/g);
    assert.ok(
      rawMatches && rawMatches.length === 1,
      'Exactly one guarded occurrence of this.itemsGroup.clear should exist'
    );

    console.log('  ✓ itemsGroup.clear is safely guarded');
  }

  // Test 2: Verify isSceneCreated and pendingStartOnCreate flags in GameScene
  console.log('2. Checking GameScene lifecycle readiness flags...');
  {
    assert.ok(
      gameSceneSource.includes('isSceneCreated: boolean = false'),
      'GameScene must declare isSceneCreated flag'
    );
    assert.ok(
      gameSceneSource.includes('pendingStartOnCreate: boolean = false'),
      'GameScene must declare pendingStartOnCreate flag'
    );
    assert.ok(
      gameSceneSource.includes('if (!this.isSceneCreated) {\n      this.pendingStartOnCreate = true;'),
      'startNewGame() must queue start if scene is not yet created'
    );
    assert.ok(
      gameSceneSource.includes('if (this.pendingStartOnCreate) {\n      this.pendingStartOnCreate = false;\n      this.startNewGame();'),
      'create() must execute pending start immediately upon scene creation'
    );

    console.log('  ✓ GameScene pending start queue verified');
  }

  // Test 3: Verify CatchBrandGame handles early clicks while Phaser is booting
  console.log('3. Checking CatchBrandGame pendingStartRef handler...');
  {
    assert.ok(
      catchBrandSource.includes('pendingStartRef = useRef<boolean>(false)'),
      'CatchBrandGame must declare pendingStartRef'
    );
    assert.ok(
      catchBrandSource.includes('pendingStartRef.current = true'),
      'handleStartGame must set pendingStartRef if scene is not ready'
    );
    assert.ok(
      catchBrandSource.includes('if (pendingStartRef.current) {\n            pendingStartRef.current = false;\n            scene.startNewGame();'),
      'scene create listener must execute queued start if clicked early'
    );

    console.log('  ✓ CatchBrandGame pendingStartRef verified');
  }

  console.log('\n====================================================');
  console.log('🎉 ALL START GAME LIFECYCLE TESTS PASSED!');
  console.log('====================================================');
}

runTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
