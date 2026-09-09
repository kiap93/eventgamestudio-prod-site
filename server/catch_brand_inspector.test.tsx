import React from 'react';
import { renderToString } from 'react-dom/server';
import { PropertyInspectorPanel } from '../src/components/studio/games/start-editor/PropertyInspectorPanel';
import { generateDefaultCatchBrandStartScreenElements, generateDefaultMemoryMatchStartScreenElements, generateDefaultReactionStartScreenElements } from '../src/games/shared/startScreenTypes';

const testGames = [
  { type: 'catch-brand', elements: generateDefaultCatchBrandStartScreenElements({ name: 'Catch Test' }) },
  { type: 'memory-match', elements: generateDefaultMemoryMatchStartScreenElements({ name: 'Memory Test' }) },
  { type: 'reaction-tap', elements: generateDefaultReactionStartScreenElements({ name: 'Reaction Test' }) },
];

function flattenElements(list: any[]): any[] {
  const res: any[] = [];
  for (const item of list) {
    res.push(item);
    if (Array.isArray(item.children)) {
      res.push(...flattenElements(item.children));
    }
  }
  return res;
}

for (const g of testGames) {
  console.log(`\n=== Testing Inspector for game: ${g.type} ===`);
  const allElements = flattenElements(g.elements);
  for (const el of allElements) {
    try {
      const html = renderToString(
        <PropertyInspectorPanel
          selectedElement={el}
          selectedIds={[el.id]}
          elements={g.elements}
          startConfig={{ elements: g.elements }}
          theme={{ name: 'Test Theme' }}
          gameType={g.type}
          onUpdateElement={() => {}}
          onUpdateConfig={() => {}}
        />
      );
      console.log(`  ✅ Selected ${el.type} (#${el.id}): ${html.length} chars`);
    } catch (err: any) {
      console.error(`  ❌ Inspector CRASHED on ${el.type} (#${el.id}):`, err.message);
    }
  }
}
