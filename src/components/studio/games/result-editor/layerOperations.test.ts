import assert from 'node:assert';
import {
  canGroupElements,
  canUngroupElements,
  groupElements,
  ungroupElements,
  reorderSiblingLayers,
  toggleElementsLock,
} from './layerOperations';
import {
  ResultScreenElement,
  ResultCardElement,
  ResultGroupElement,
  ResultTextElement,
  ResultScoreElement,
  ResultImageElement,
  ResultButtonElement,
} from '../../../../games/memory-match/types';

export function runLayerOperationsTests() {
  console.log('[TEST] Running Layer Operations & Grouping Test Suite...');

  const sampleElements: ResultScreenElement[] = [
    {
      id: 'txt-1',
      type: 'text',
      x: 100,
      y: 150,
      width: 200,
      height: 50,
      rotation: 0,
      visible: true,
      locked: false,
      opacity: 1,
      zIndex: 1,
      text: 'Title',
    } as ResultTextElement,
    {
      id: 'score-1',
      type: 'score',
      x: 120,
      y: 220,
      width: 180,
      height: 60,
      rotation: 0,
      visible: true,
      locked: false,
      opacity: 1,
      zIndex: 2,
      label: 'SCORE',
    } as ResultScoreElement,
    {
      id: 'img-1',
      type: 'image',
      x: 350,
      y: 150,
      width: 100,
      height: 100,
      rotation: 0,
      visible: true,
      locked: false,
      opacity: 1,
      zIndex: 3,
      imageUrl: 'test.png',
    } as ResultImageElement,
    {
      id: 'btn-1',
      type: 'button',
      x: 100,
      y: 300,
      width: 350,
      height: 60,
      rotation: 0,
      visible: true,
      locked: false,
      opacity: 1,
      zIndex: 4,
      text: 'PLAY',
      action: 'playAgain',
    } as ResultButtonElement,
    {
      id: 'card-1',
      type: 'card',
      x: 500,
      y: 100,
      width: 400,
      height: 600,
      rotation: 0,
      visible: true,
      locked: false,
      opacity: 1,
      zIndex: 5,
      children: [
        {
          id: 'card-txt',
          type: 'text',
          x: 20,
          y: 30,
          width: 360,
          height: 40,
          rotation: 0,
          visible: true,
          locked: false,
          opacity: 1,
          zIndex: 1,
          text: 'Inside Card',
        } as ResultTextElement,
        {
          id: 'card-btn',
          type: 'button',
          x: 40,
          y: 100,
          width: 320,
          height: 50,
          rotation: 0,
          visible: true,
          locked: false,
          opacity: 1,
          zIndex: 2,
          text: 'Card Action',
          action: 'playAgain',
        } as ResultButtonElement,
      ],
    } as ResultCardElement,
  ];

  // Test 1: canGroupElements
  assert.strictEqual(canGroupElements(sampleElements, ['txt-1', 'score-1']), true);
  assert.strictEqual(canGroupElements(sampleElements, ['card-txt', 'card-btn']), true);
  assert.strictEqual(canGroupElements(sampleElements, ['txt-1', 'card-txt']), false);
  assert.strictEqual(canGroupElements(sampleElements, ['txt-1']), false);
  console.log('  ✓ canGroupElements correctly validates siblings');

  // Test 2: group root elements
  const { updatedElements, newGroupId } = groupElements(sampleElements, ['txt-1', 'score-1']);
  assert.ok(newGroupId, 'newGroupId should exist');
  assert.strictEqual(updatedElements.length, sampleElements.length - 1);

  const createdGroup = updatedElements.find((e) => e.id === newGroupId) as ResultGroupElement;
  assert.ok(createdGroup);
  assert.strictEqual(createdGroup.type, 'group');
  assert.strictEqual(createdGroup.x, 100);
  assert.strictEqual(createdGroup.y, 150);
  assert.strictEqual(createdGroup.width, 200);
  assert.strictEqual(createdGroup.height, 130);

  const childTxt = createdGroup.children.find((c) => c.id === 'txt-1')!;
  const childScore = createdGroup.children.find((c) => c.id === 'score-1')!;
  assert.strictEqual(childTxt.x, 0);
  assert.strictEqual(childTxt.y, 0);
  assert.strictEqual(childScore.x, 20);
  assert.strictEqual(childScore.y, 70);
  console.log('  ✓ groups root elements without visual jump (converts to local coordinates)');

  // Test 3: group Card children
  const { updatedElements: cardGroupedTree, newGroupId: cardGroupId } = groupElements(sampleElements, ['card-txt', 'card-btn']);
  const card = cardGroupedTree.find((e) => e.id === 'card-1') as ResultCardElement;
  assert.strictEqual(card.children.length, 1);
  const groupInCard = card.children[0] as ResultGroupElement;
  assert.strictEqual(groupInCard.id, cardGroupId);
  assert.strictEqual(groupInCard.x, 20);
  assert.strictEqual(groupInCard.y, 30);
  console.log('  ✓ groups Card children inside Card container accurately');

  // Test 4: ungroup elements
  assert.strictEqual(canUngroupElements(updatedElements, [newGroupId!]), true);
  const { updatedElements: ungroupedTree, unpackedIds } = ungroupElements(updatedElements, [newGroupId!]);
  assert.ok(unpackedIds.includes('txt-1'));
  assert.ok(unpackedIds.includes('score-1'));
  const restoredTxt = ungroupedTree.find((e) => e.id === 'txt-1')!;
  const restoredScore = ungroupedTree.find((e) => e.id === 'score-1')!;
  assert.strictEqual(restoredTxt.x, 100);
  assert.strictEqual(restoredTxt.y, 150);
  assert.strictEqual(restoredScore.x, 120);
  assert.strictEqual(restoredScore.y, 220);
  console.log('  ✓ ungroups elements and converts coordinates back without visual jump');

  // Test 5: nested groups
  const step1 = groupElements(sampleElements, ['txt-1', 'score-1']);
  const groupAId = step1.newGroupId!;
  const step2 = groupElements(step1.updatedElements, [groupAId, 'img-1']);
  const groupBId = step2.newGroupId!;

  const groupB = step2.updatedElements.find((e) => e.id === groupBId) as ResultGroupElement;
  assert.strictEqual(groupB.children.length, 2);

  const step3 = ungroupElements(step2.updatedElements, [groupBId]);
  const restoredGroupA = step3.updatedElements.find((e) => e.id === groupAId) as ResultGroupElement;
  assert.ok(restoredGroupA);

  const step4 = ungroupElements(step3.updatedElements, [groupAId]);
  assert.strictEqual(step4.updatedElements.find((e) => e.id === 'txt-1')!.x, 100);
  assert.strictEqual(step4.updatedElements.find((e) => e.id === 'score-1')!.y, 220);
  console.log('  ✓ supports nested groups nesting and unpacking seamlessly');

  // Test 6: layer reordering affects only siblings
  const movedFront = reorderSiblingLayers(sampleElements, 'score-1', 'front');
  assert.strictEqual(movedFront[movedFront.length - 1].id, 'score-1');
  const cardAfterFront = movedFront.find((e) => e.id === 'card-1') as ResultCardElement;
  assert.deepStrictEqual(cardAfterFront.children.map((c) => c.id), ['card-txt', 'card-btn']);
  console.log('  ✓ layer ordering affects only siblings under same parent');

  // Test 7: lock / unlock
  const lockedTree = toggleElementsLock(sampleElements, ['txt-1', 'card-txt'], true);
  assert.strictEqual(lockedTree.find((e) => e.id === 'txt-1')!.locked, true);
  const cardLocked = lockedTree.find((e) => e.id === 'card-1') as ResultCardElement;
  assert.strictEqual(cardLocked.children.find((c) => c.id === 'card-txt')!.locked, true);
  assert.strictEqual(cardLocked.children.find((c) => c.id === 'card-btn')!.locked, false);
  console.log('  ✓ lock / unlock toggles state cleanly');

  console.log('[TEST] All Layer Operations & Grouping tests passed!\n');
}

// Auto-run if executed directly
if (process.argv[1]?.includes('layerOperations.test')) {
  runLayerOperationsTests();
}
