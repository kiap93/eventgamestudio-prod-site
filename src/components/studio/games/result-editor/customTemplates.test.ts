import assert from 'node:assert';
import {
  saveCustomTemplate,
  getCustomTemplates,
  instantiateCustomTemplate,
  deleteCustomTemplate,
  updateCustomTemplate,
  CUSTOM_TEMPLATES_STORAGE_KEY,
  sanitizeElementsForTemplate,
} from './customTemplates';
import {
  ResultCardElement,
  ResultScreenElement,
  ResultTextElement,
  ResultScoreElement,
  ResultButtonElement,
  ResultImageElement,
} from '../../../../games/memory-match/types';

// Mock localStorage in Node environment
const mockStorage: Record<string, string> = {};
(global as any).window = {
  localStorage: {
    getItem: (key: string) => mockStorage[key] || null,
    setItem: (key: string, value: string) => {
      mockStorage[key] = value;
    },
    removeItem: (key: string) => {
      delete mockStorage[key];
    },
    clear: () => {
      for (const k of Object.keys(mockStorage)) {
        delete mockStorage[k];
      }
    },
  },
};

export function runCustomTemplatesTestSuite() {
  console.log('[TEST] Running Custom Result Screen Templates Test Suite...');

  // Reset storage
  (global as any).window.localStorage.clear();

  // 1. Create a custom Result Screen layout
  const originalCustomElements: ResultScreenElement[] = [
    {
      id: 'card-root-1',
      type: 'card',
      x: 150,
      y: 100,
      width: 700,
      height: 800,
      rotation: 0,
      visible: true,
      locked: false,
      opacity: 0.95,
      zIndex: 1,
      style: {
        backgroundColor: '#0f172a',
        borderWidth: 2,
        borderColor: '#38bdf8',
        borderRadius: 24,
        shadow: true,
        padding: 24,
      },
      children: [
        {
          id: 'title-text-1',
          type: 'text',
          x: 50,
          y: 40,
          width: 600,
          height: 60,
          rotation: 0,
          visible: true,
          locked: false,
          opacity: 1,
          zIndex: 1,
          text: 'CHAMPION OF THE ARENA',
          style: {
            fontSize: 36,
            fontWeight: '900',
            color: '#38bdf8',
            textAlign: 'center',
            letterSpacing: 3,
            textShadow: '0 2px 10px rgba(56, 189, 248, 0.5)',
          },
        } as ResultTextElement,
        {
          id: 'score-elem-1',
          type: 'score',
          x: 100,
          y: 120,
          width: 500,
          height: 140,
          rotation: 0,
          visible: true,
          locked: false,
          opacity: 1,
          zIndex: 2,
          label: 'TOTAL CHAMPION SCORE',
          style: {
            labelColor: '#94a3b8',
            valueColor: '#f59e0b',
            backgroundColor: '#020617',
            borderColor: '#f59e0b',
            borderRadius: 20,
            fontSize: 48,
            textAlign: 'center',
            layout: 'vertical',
          },
        } as ResultScoreElement,
        {
          id: 'badge-image-1',
          type: 'image',
          x: 250,
          y: 280,
          width: 200,
          height: 200,
          rotation: 0,
          visible: true,
          locked: false,
          opacity: 1,
          zIndex: 3,
          imageUrl: 'https://example.com/trophy.png',
          objectFit: 'contain',
          style: {
            borderRadius: 16,
          },
        } as ResultImageElement,
        {
          id: 'btn-replay-1',
          type: 'button',
          x: 100,
          y: 520,
          width: 500,
          height: 70,
          rotation: 0,
          visible: true,
          locked: false,
          opacity: 1,
          zIndex: 4,
          text: 'PLAY AGAIN & BEAT RECORD',
          action: 'playAgain',
          style: {
            backgroundColor: '#38bdf8',
            textColor: '#020617',
            fontSize: 22,
            fontWeight: '900',
            borderRadius: 20,
            shadow: true,
          },
        } as ResultButtonElement,
      ],
    } as ResultCardElement,
  ];

  // 2. Save as Template
  const savedTemplate = saveCustomTemplate(
    'Arena Champion Layout',
    'Custom high-tech neon victory card with trophy emblem and large score',
    originalCustomElements,
    'Arcade'
  );

  assert.ok(savedTemplate.id, 'Saved template must have a generated ID');
  assert.strictEqual(savedTemplate.name, 'Arena Champion Layout');
  assert.strictEqual(savedTemplate.category, 'Arcade');
  assert.strictEqual(savedTemplate.elements.length, 1);
  console.log('  ✓ Step 1 & 2: Custom Result Screen created and saved as template successfully');

  // Verify stored in localStorage
  const storedList = getCustomTemplates();
  assert.strictEqual(storedList.length, 1, 'Should have 1 stored custom template in storage');
  assert.strictEqual(storedList[0].id, savedTemplate.id);
  console.log('  ✓ Verified persistent storage retrieval');

  // 3. Apply / Instantiate Template
  const appliedElements = instantiateCustomTemplate(savedTemplate);
  assert.ok(appliedElements && appliedElements.length === 1);

  // Verify fresh IDs generated on application
  const rootCard = appliedElements[0] as ResultCardElement;
  assert.notStrictEqual(rootCard.id, originalCustomElements[0].id, 'Root card ID must be newly generated');
  assert.notStrictEqual(rootCard.id, savedTemplate.elements[0].id, 'Root card ID must differ from template node');

  const childTitle = rootCard.children![0] as ResultTextElement;
  assert.notStrictEqual(childTitle.id, 'title-text-1', 'Child element ID must be newly generated');
  assert.strictEqual(childTitle.text, 'CHAMPION OF THE ARENA');
  console.log('  ✓ Step 3: Template applied with fresh unique IDs');

  // 4. Modify the applied layout
  childTitle.text = 'MODIFIED TITLE FOR NEW EVENT';
  (rootCard.style as any).backgroundColor = '#ff0055';
  rootCard.x = 220;

  // 5. Verify original template remains completely UNCHANGED (no shared mutable references)
  const templateRootCard = savedTemplate.elements[0] as ResultCardElement;
  const templateTitle = templateRootCard.children![0] as ResultTextElement;

  assert.strictEqual(
    templateTitle.text,
    'CHAMPION OF THE ARENA',
    'Original template title must NOT be affected by mutations to applied layout'
  );
  assert.strictEqual(
    templateRootCard.style?.backgroundColor,
    '#0f172a',
    'Original template card color must NOT be affected by mutations to applied layout'
  );
  assert.strictEqual(
    templateRootCard.x,
    150,
    'Original template coordinates must NOT be affected by mutations to applied layout'
  );
  console.log('  ✓ Step 4 & 5: Applied layout modified; original template verified strictly immutable and isolated');

  // 6. Test Updating Template Metadata
  const updated = updateCustomTemplate(savedTemplate.id, {
    name: 'Arena Champion v2',
    description: 'Updated description',
  });
  assert.ok(updated);
  assert.strictEqual(updated?.name, 'Arena Champion v2');
  console.log('  ✓ Step 6: Template metadata update verified');

  // 7. Test Reload from Storage
  const reloadedList = getCustomTemplates();
  assert.strictEqual(reloadedList.length, 1);
  assert.strictEqual(reloadedList[0].name, 'Arena Champion v2');

  const reloadedApplied = instantiateCustomTemplate(reloadedList[0]);
  const reloadedRoot = reloadedApplied[0] as ResultCardElement;
  const reloadedTitle = reloadedRoot.children![0] as ResultTextElement;

  assert.strictEqual(reloadedTitle.text, 'CHAMPION OF THE ARENA');
  assert.strictEqual(reloadedRoot.style?.backgroundColor, '#0f172a');
  console.log('  ✓ Step 7 & 8: Reloaded template instantiated correctly without state drift');

  // 8. Test Deleting Template
  const deleted = deleteCustomTemplate(savedTemplate.id);
  assert.strictEqual(deleted, true);
  assert.strictEqual(getCustomTemplates().length, 0);
  console.log('  ✓ Template deletion verified');

  console.log('[TEST] All Custom Result Screen Templates tests passed!\n');
}

// Auto-run when executed directly
if (process.argv[1]?.includes('customTemplates.test')) {
  runCustomTemplatesTestSuite();
}
