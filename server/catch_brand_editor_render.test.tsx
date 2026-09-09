import React from 'react';
import { renderToString } from 'react-dom/server';
import { StartScreenVisualEditorModal } from '../src/components/studio/games/start-editor/StartScreenVisualEditorModal';
import { getStartScreenConfig } from '../src/games/shared/startScreenResolver';

const dummyCatchBrandTheme: any = {
  id: 'catch-theme-1',
  name: 'Cyber Catch',
  game_type: 'catch-brand',
  description: 'Cyber Catch arcade theme',
  game_config: {
    gameplay: { duration: 30 },
  },
};

const startConfig = getStartScreenConfig(dummyCatchBrandTheme, 'catch-brand', {
  duration: 30,
});

console.log('Rendering StartScreenVisualEditorModal for Catch Brand...');
try {
  const html = renderToString(
    <StartScreenVisualEditorModal
      isOpen={true}
      onClose={() => {}}
      startConfig={startConfig}
      theme={dummyCatchBrandTheme}
      gameType="catch-brand"
      onChange={() => {}}
    />
  );
  console.log('✅ Rendered successfully, HTML length:', html.length);
} catch (error) {
  console.error('❌ Render crashed with error:', error);
}
