import React from 'react';
import { renderToString } from 'react-dom/server';
import { StartElementContent } from '../src/games/shared/StartElementContent';
import { generateDefaultCatchBrandStartScreenElements } from '../src/games/shared/startScreenTypes';

const dummyCatchBrandTheme: any = {
  id: 'catch-theme-1',
  name: 'Cyber Catch',
  game_type: 'catch-brand',
};

const elements = generateDefaultCatchBrandStartScreenElements(dummyCatchBrandTheme);
const card = elements[0];
const button = (card as any).children.find((c: any) => c.type === 'button');

console.log('Testing button click without onStartGame passed (as was done in CanvasWorkspace)...');

// In CanvasWorkspace:
// <StartElementContent element={button} parentWidth={1000} parentHeight={1000} isEditor={true} />
// Note: onStartGame was NOT passed, and isSimulation was not passed (only isEditor={true})!

// If a user clicks the button:
const mockEvent = {
  stopPropagation: () => {},
};

// Let's inspect StartElementContent component:
const component = StartElementContent({
  element: button,
  parentWidth: 760,
  parentHeight: 470,
  theme: dummyCatchBrandTheme,
  gameType: 'catch-brand',
  // as CanvasWorkspace was passing:
  // onStartGame: undefined
} as any);

console.log('Button onClick prop:', (component as any).props.onClick);

try {
  // Simulate clicking the button in the editor canvas!
  (component as any).props.onClick(mockEvent);
  console.log('Click succeeded without crash');
} catch (err: any) {
  console.error('💥 CRASHED ON BUTTON CLICK:', err.message);
}
