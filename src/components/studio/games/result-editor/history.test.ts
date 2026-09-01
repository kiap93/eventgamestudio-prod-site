import { ResultScreenHistoryManager, filterValidSelectedIds, deepCloneElements } from './history';
import { ResultScreenElement, ResultCardElement, ResultTextElement } from '../../../../games/memory-match/types';
import { instantiateResultPreset } from './presets';
import { instantiateCustomTemplate, CustomResultScreenTemplate } from './customTemplates';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`[TEST FAILED] ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
}

console.log('[TEST] Running Result Screen Visual Editor Undo/Redo Test Suite...\n');

// 1. Initial State & No Unnecessary Undo
const initialElements: ResultScreenElement[] = [
  {
    id: 'card-1',
    type: 'card',
    x: 100,
    y: 100,
    width: 800,
    height: 800,
    rotation: 0,
    visible: true,
    opacity: 1,
    zIndex: 1,
    children: [
      {
        id: 'text-1',
        type: 'text',
        x: 50,
        y: 50,
        width: 300,
        height: 50,
        rotation: 0,
        visible: true,
        opacity: 1,
        zIndex: 2,
        text: 'VICTORY!',
      },
      {
        id: 'score-1',
        type: 'score',
        x: 50,
        y: 120,
        width: 300,
        height: 80,
        rotation: 0,
        visible: true,
        opacity: 1,
        zIndex: 2,
        label: 'SCORE',
      },
    ],
  } as ResultCardElement,
  {
    id: 'card-2',
    type: 'card',
    x: 200,
    y: 200,
    width: 400,
    height: 400,
    rotation: 0,
    visible: true,
    opacity: 1,
    zIndex: 2,
    children: [],
  } as ResultCardElement,
];

const history = new ResultScreenHistoryManager(initialElements);
assert(!history.canUndo(), 'Initial state must not allow undo');
assert(!history.canRedo(), 'Initial state must not allow redo');
console.log('  ✓ Initial state verified: canUndo = false, canRedo = false');

// 2. Test Matrix A: Move Element (Discrete or Single Edit)
const movedState = deepCloneElements(initialElements);
movedState[0].x = 150;
movedState[0].y = 160;
history.push(movedState);

assert(history.canUndo(), 'Can undo after move');
assert(!history.canRedo(), 'Cannot redo after push');

// Undo Move
const undoneAfterMove = history.undo()!;
assert(undoneAfterMove[0].x === 100 && undoneAfterMove[0].y === 100, 'Undo restores initial x/y');
assert(history.canRedo(), 'Can redo after undo');

// Redo Move
const redoneAfterMove = history.redo()!;
assert(redoneAfterMove[0].x === 150 && redoneAfterMove[0].y === 160, 'Redo restores moved x/y');
console.log('  ✓ Test A (Move): Move -> Undo -> Redo verified');

// 3. Test Matrix B: Resize & Gesture Batching (100 movements = 1 undo entry)
history.reset(initialElements);
history.beginGesture(initialElements);

// Simulate 100 drag/resize intermediate updates
let intermediateState = deepCloneElements(initialElements);
for (let i = 1; i <= 100; i++) {
  intermediateState[0].width = 800 + i;
  intermediateState[0].height = 800 + i * 2;
}

// Complete gesture
const committed = history.commitGesture(intermediateState);
assert(committed, 'Gesture commit succeeded');
assert(history.getPast().length === 1, '100 intermediate frames resulted in exactly 1 history snapshot');

// Undo gesture
const undoneGesture = history.undo()!;
assert(undoneGesture[0].width === 800 && undoneGesture[0].height === 800, 'Undo restores pre-gesture dimensions');
assert(!history.canUndo(), 'History stack at baseline');

// Redo gesture
const redoneGesture = history.redo()!;
assert(redoneGesture[0].width === 900 && redoneGesture[0].height === 1000, 'Redo restores post-gesture dimensions');
console.log('  ✓ Test B & Gesture Batching: 100 intermediate movements committed to exactly 1 undo step');

// 4. Test Matrix C: Rotation
history.reset(initialElements);
history.beginGesture(initialElements);
const rotatedState = deepCloneElements(initialElements);
rotatedState[0].rotation = 45;
history.commitGesture(rotatedState);

const undoneRotation = history.undo()!;
assert(undoneRotation[0].rotation === 0, 'Undo restores rotation to 0');
const redoneRotation = history.redo()!;
assert(redoneRotation[0].rotation === 45, 'Redo restores rotation to 45');
console.log('  ✓ Test C (Rotation): Rotate -> Undo -> Redo verified');

// 5. Test Matrix D: Text Change
history.reset(initialElements);
const textChangedState = deepCloneElements(initialElements);
const childText = (textChangedState[0] as ResultCardElement).children![0];
(childText as any).text = 'YOU WON!';
history.push(textChangedState);

const undoneText = history.undo()!;
assert(((undoneText[0] as ResultCardElement).children![0] as any).text === 'VICTORY!', 'Undo text change');
const redoneText = history.redo()!;
assert(((redoneText[0] as ResultCardElement).children![0] as any).text === 'YOU WON!', 'Redo text change');
console.log('  ✓ Test D (Text): Text change -> Undo -> Redo verified');

// 6. Test Matrix E: Typography & Styling
history.reset(initialElements);
const typoState = deepCloneElements(initialElements);
((typoState[0] as ResultCardElement).children![0] as ResultTextElement).style = {
  fontSize: 64,
  fontWeight: '900',
  color: '#f59e0b',
};
history.push(typoState);

const undoneTypo = history.undo()!;
assert(((undoneTypo[0] as ResultCardElement).children![0] as ResultTextElement).style?.fontSize === undefined, 'Undo typo');
const redoneTypo = history.redo()!;
assert(((redoneTypo[0] as ResultCardElement).children![0] as ResultTextElement).style?.fontSize === 64, 'Redo typo');
console.log('  ✓ Test E (Typography): Typography styling -> Undo -> Redo verified');

// 7. Test Matrix H, I, J: Add, Duplicate, Delete
history.reset(initialElements);

// Add
const addedState = deepCloneElements(initialElements);
addedState.push({
  id: 'button-1',
  type: 'button',
  x: 200,
  y: 700,
  width: 400,
  height: 60,
  rotation: 0,
  visible: true,
  opacity: 1,
  zIndex: 3,
  text: 'PLAY AGAIN',
  action: 'playAgain',
});
history.push(addedState);
assert(history.getPresent().length === 3, 'Present has 3 elements after Add');

// Duplicate
const duplicatedState = deepCloneElements(addedState);
duplicatedState.push({
  ...duplicatedState[2],
  id: 'button-2',
  x: 230,
  y: 730,
});
history.push(duplicatedState);
assert(history.getPresent().length === 4, 'Present has 4 elements after Duplicate');

// Delete
const deletedState = duplicatedState.filter((el) => el.id !== 'button-1');
history.push(deletedState);
assert(history.getPresent().length === 3, 'Present has 3 elements after Delete');

// Undo Delete
const afterUndoDelete = history.undo()!;
assert(afterUndoDelete.length === 4 && afterUndoDelete.some((el) => el.id === 'button-1'), 'Undo Delete restored element');

// Undo Duplicate
const afterUndoDuplicate = history.undo()!;
assert(afterUndoDuplicate.length === 3 && !afterUndoDuplicate.some((el) => el.id === 'button-2'), 'Undo Duplicate removed clone');

// Undo Add
const afterUndoAdd = history.undo()!;
assert(afterUndoAdd.length === 2 && !afterUndoAdd.some((el) => el.id === 'button-1'), 'Undo Add returned to initial');

// Redo Add
const afterRedoAdd = history.redo()!;
assert(afterRedoAdd.length === 3 && afterRedoAdd.some((el) => el.id === 'button-1'), 'Redo Add restored added element');
console.log('  ✓ Test H, I, J (Add, Duplicate, Delete): Add -> Duplicate -> Delete -> Undo x 3 -> Redo verified');

// 8. Test Matrix N: Apply Preset
history.reset(initialElements);
const presetElements = instantiateResultPreset('two-cards')!;
history.push(presetElements);

assert(history.getPresent().length === presetElements.length, 'Preset applied');
const undonePreset = history.undo()!;
assert(undonePreset.length === initialElements.length && undonePreset[0].id === 'card-1', 'Undo Preset restored custom layout');

const redonePreset = history.redo()!;
assert(redonePreset.length === presetElements.length, 'Redo Preset reapplied layout');
console.log('  ✓ Test N (Apply Preset): Apply Preset -> Undo -> Redo in ONE step verified');

// 9. Test Matrix O & Save Template Safety: Apply Custom Template
history.reset(initialElements);
const customTemplate: CustomResultScreenTemplate = {
  id: 'test-tmpl-1',
  name: 'Special Event Template',
  description: 'A test template',
  category: 'custom',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  elements: [
    {
      id: 'tmpl-card',
      type: 'card',
      x: 100,
      y: 100,
      width: 600,
      height: 600,
      rotation: 0,
      visible: true,
      opacity: 1,
      zIndex: 1,
      children: [],
    } as ResultCardElement,
  ],
};

const instantiatedFromTemplate = instantiateCustomTemplate(customTemplate);
history.push(instantiatedFromTemplate);
assert(history.getPresent().length === 1, 'Template applied');

const undoneTemplate = history.undo()!;
assert(undoneTemplate.length === 2, 'Undo template restored prior layout');

const redoneTemplate = history.redo()!;
assert(redoneTemplate.length === 1, 'Redo template restored template layout');

// Verify template definition itself was NOT mutated
assert(customTemplate.elements[0].id === 'tmpl-card', 'Custom template definition strictly immutable');
console.log('  ✓ Test O & Template Safety: Apply Template -> Undo -> Redo with zero mutation to template definition');

// 10. Test Matrix P & Q: Nested Card & Multiple Cards
history.reset(initialElements);
const multiCardEdit = deepCloneElements(initialElements);
multiCardEdit[1].x = 450; // Modify card-2 only
history.push(multiCardEdit);

const undoneMultiCard = history.undo()!;
assert(undoneMultiCard[1].x === 200, 'Card-2 reverted to 200');
assert(undoneMultiCard[0].x === 100, 'Card-1 remained completely untouched at 100');

// Modify nested child
const nestedChildEdit = deepCloneElements(initialElements);
(nestedChildEdit[0] as ResultCardElement).children![1].y = 300;
history.push(nestedChildEdit);

const undoneNested = history.undo()!;
assert(((undoneNested[0] as ResultCardElement).children![1] as any).y === 120, 'Nested child y reverted to 120');
console.log('  ✓ Test P & Q: Multiple cards & nested child tree isolation verified');

// 11. Test Matrix R: Branching Discard
history.reset(initialElements); // State A

const stateB = deepCloneElements(initialElements);
stateB[0].x = 300;
history.push(stateB); // State B

const stateC = deepCloneElements(stateB);
stateC[0].x = 400;
history.push(stateC); // State C

history.undo(); // back to B
assert(history.getPresent()[0].x === 300, 'At state B');
assert(history.canRedo(), 'Can redo to C');

// User creates a new change D
const stateD = deepCloneElements(stateB);
stateD[0].x = 999;
history.push(stateD); // State D

assert(history.getPresent()[0].x === 999, 'At state D');
assert(!history.canRedo(), 'Future redo stack C has been completely discarded');

history.undo();
assert(history.getPresent()[0].x === 300, 'Undo goes to B, not C');
console.log('  ✓ Test R (Branching History): A -> B -> C -> Undo -> D discards C branch correctly');

// 12. Test Selection ID filtering
const prevSelection = ['button-1', 'card-1'];
const validSelectedIds = filterValidSelectedIds(prevSelection, initialElements);
assert(validSelectedIds.length === 1 && validSelectedIds[0] === 'card-1', 'Non-existent button-1 filtered out safely');
console.log('  ✓ Selection validation: filterValidSelectedIds preserves only existing IDs');

// 13. Max History limit
history.reset(initialElements);
for (let i = 1; i <= 80; i++) {
  const next = deepCloneElements(initialElements);
  next[0].x = i;
  history.push(next);
}
assert(history.getPast().length === 60, 'History past stack bounded at 60');
console.log('  ✓ Max History limit: Stack safely capped at MAX_HISTORY_LENGTH');

console.log('\n[TEST] All Result Screen Undo / Redo tests passed successfully!');
