import React from 'react';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { EventPreviewGameView } from '../src/components/events/EventPreviewGameView';
import { PublicEventGameView } from '../src/components/events/PublicEventGameView';
import { canAccessPreviewEvent, shouldShowPreviewHeader, canAccessLiveEvent } from '../src/lib/dateUtils';

console.log('======================================================');
console.log('RUNNING EVENT PREVIEW TESTING OVERLAY & SAFETY TESTS');
console.log('======================================================');

// 1. Check shouldShowPreviewHeader rule
const mockEvent = {
  id: 'ev-test-123',
  name: 'Corporate Annual Tech Day',
  status: 'scheduled',
  event_status: 'SCHEDULED',
  payment_status: 'PAID',
  start_date: '2026-10-01',
  end_date: '2026-10-02',
  public_token: 'token-abc-123',
  game: {
    id: 'game-1',
    name: 'Catch The Brand',
    slug: 'catch-brand',
    game_type: 'catch-brand',
  },
  game_theme: {
    id: 'theme-1',
    name: 'Cyber Neon',
  },
};

assert.strictEqual(canAccessPreviewEvent(mockEvent), true, 'Mock event should be accessible for preview');
assert.strictEqual(shouldShowPreviewHeader(mockEvent), true, 'Preview header should be enabled for accessible preview');
console.log('✓ PASS: shouldShowPreviewHeader is true for valid event');

// 2. Test EventPreviewGameView source code invariants:
// We verify that the component source strictly enforces:
// - Permanent testing overlay id "preview-testing-overlay"
// - Does not hide header in fullscreen (!isFullscreen check removed from showHeader)
// - Passes isEventPreview={true} and isEventTest={true}
// - Does NOT contain live event actions: "Copy Live URL", "Open Live Event", "Pay & Activate"
const previewPath = resolve(process.cwd(), 'src/components/events/EventPreviewGameView.tsx');
const previewSource = readFileSync(previewPath, 'utf-8');

// Verify TESTING - PREVIEW ONLY wording
assert(
  previewSource.includes('TESTING') && previewSource.includes('PREVIEW ONLY'),
  'EventPreviewGameView must prominently contain TESTING and PREVIEW ONLY'
);
assert(
  previewSource.includes('This is a test preview. Scores are not live and this screen cannot be used as the live event.'),
  'EventPreviewGameView must contain the exact safety supporting text'
);
console.log('✓ PASS: TESTING — PREVIEW ONLY banner and safety text are present in EventPreviewGameView');

// Verify fullscreen architecture: showHeader must NOT depend on !isFullscreen
assert(
  !previewSource.includes('shouldShowPreviewHeader(eventData) && !isFullscreen'),
  'EventPreviewGameView must NOT hide the preview header when isFullscreen is true'
);
assert(
  previewSource.includes('const showHeader = shouldShowPreviewHeader(eventData);'),
  'showHeader must be true regardless of fullscreen state'
);
console.log('✓ PASS: Preview testing overlay remains enabled during fullscreen');

// Verify that forbidden live event actions are REMOVED from the preview route
assert(
  !previewSource.includes('Copy Live URL'),
  'EventPreviewGameView must NOT expose "Copy Live URL"'
);
assert(
  !previewSource.includes('Pay & Activate'),
  'EventPreviewGameView must NOT expose "Pay & Activate" modal/button'
);
assert(
  !previewSource.includes('Payment Pending'),
  'EventPreviewGameView must NOT expose "Payment Pending" button/status'
);
assert(
  !previewSource.includes('Open Live Event'),
  'EventPreviewGameView must NOT expose "Open Live Event"'
);
console.log('✓ PASS: No live event action triggers (Copy Live URL, Pay & Activate, etc.) exposed in preview');

// Verify navigation back to Events exists
assert(
  previewSource.includes('Back to Events'),
  'EventPreviewGameView must provide "Back to Events" navigation'
);
console.log('✓ PASS: "Back to Events" navigation is present');

// Verify test flags are strictly passed to GameContainer
assert(
  previewSource.includes('isEventPreview={true}'),
  'EventPreviewGameView must pass isEventPreview={true}'
);
assert(
  previewSource.includes('isEventTest={true}'),
  'EventPreviewGameView must pass isEventTest={true}'
);
console.log('✓ PASS: isEventPreview={true} and isEventTest={true} are strictly passed');

// Verify PublicEventGameView does NOT contain the preview testing overlay
const livePath = resolve(process.cwd(), 'src/components/events/PublicEventGameView.tsx');
const liveSource = readFileSync(livePath, 'utf-8');
assert(
  !liveSource.includes('preview-testing-overlay'),
  'PublicEventGameView must NOT contain preview-testing-overlay'
);
assert(
  !liveSource.includes('TESTING — PREVIEW ONLY') && !liveSource.includes('PREVIEW ONLY'),
  'PublicEventGameView must NOT display the preview testing banner'
);
assert(
  !liveSource.includes('isEventPreview={true}') && !liveSource.includes('isEventTest={true}'),
  'PublicEventGameView must NOT pass isEventPreview={true} nor isEventTest={true}'
);
console.log('✓ PASS: Live public event route (/play/:publicToken) does not enable event preview or test modes');

console.log('======================================================');
console.log('ALL PREVIEW TESTING OVERLAY & SAFETY TESTS PASSED!');
console.log('======================================================');

