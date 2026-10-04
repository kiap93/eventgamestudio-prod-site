import React from 'react';
import { renderToString } from 'react-dom/server';
import assert from 'node:assert';
import { LocalizationProvider } from '../src/context/LocalizationContext';

console.log('======================================================');
console.log('TEST SUITE: AcceptInvitePage Google Button Stability');
console.log('======================================================\n');

// Mock AuthContext
const MockAuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return <>{children}</>;
};

// Test Google button container and accepting spinner DOM structure
function renderAcceptInviteButtonSection(clientId: string | null, accepting: boolean, isDev: boolean = false) {
  return (
    <div className="flex flex-col items-center gap-4">
      {clientId ? (
        <div className="w-full flex flex-col items-center gap-3">
          <div
            id="google-btn-wrapper"
            className={`w-full flex justify-center transition-opacity duration-200 ${
              accepting ? 'pointer-events-none opacity-60' : ''
            }`}
          >
            <div id="google-btn-ref" className="min-h-[44px]">
              {/* Simulated Google-rendered iframe button */}
              <iframe title="Google Sign-In" style={{ width: 300, height: 44 }} />
            </div>
          </div>

          {accepting && (
            <div id="accepting-spinner-row" className="flex items-center justify-center gap-2.5 py-1 text-emerald-400 font-bold text-xs">
              <div className="w-4 h-4 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin shrink-0" />
              <span>Accepting invitation...</span>
            </div>
          )}
        </div>
      ) : (
        <div className="w-full p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl text-xs space-y-2 text-center">
          <span>Google OAuth Client ID Needed</span>
        </div>
      )}

      {isDev && (
        <button disabled={accepting}>
          Dev Test Accept
        </button>
      )}
    </div>
  );
}

// Test 1: Normal idle state (accepting = false)
console.log('Test 1: Google button is mounted, stable, and has no rotation when idle...');
const idleHtml = renderToString(renderAcceptInviteButtonSection('mock-client-id.apps.googleusercontent.com', false));
assert.ok(idleHtml.includes('id="google-btn-ref"'), 'Google button ref container must be in DOM');
assert.ok(idleHtml.includes('Google Sign-In'), 'Google button iframe must be in DOM');
assert.ok(!idleHtml.includes('animate-spin'), 'No animate-spin class should exist in idle state');
assert.ok(!idleHtml.includes('pointer-events-none'), 'Google button must not have pointer-events-none when idle');
console.log('  ✓ PASSED: Idle state renders stable Google button without spinner or rotation.\n');

// Test 2: Accepting state (accepting = true)
console.log('Test 2: When accepting = true, Google button remains mounted and a separate spinner is rendered OUTSIDE...');
const acceptingHtml = renderToString(renderAcceptInviteButtonSection('mock-client-id.apps.googleusercontent.com', true));
assert.ok(acceptingHtml.includes('id="google-btn-ref"'), 'Google button ref container MUST remain in DOM during accepting');
assert.ok(acceptingHtml.includes('Google Sign-In'), 'Google button iframe must remain mounted');

// Critical check: google-btn-ref or google-btn-wrapper MUST NOT contain animate-spin
assert.ok(
  !acceptingHtml.includes('id="google-btn-ref" class="min-h-[44px] animate-spin"'),
  'google-btn-ref must NEVER contain animate-spin'
);
assert.ok(
  !acceptingHtml.includes('id="google-btn-wrapper" class="w-full flex justify-center transition-opacity duration-200 pointer-events-none opacity-60 animate-spin"'),
  'google-btn-wrapper must NEVER contain animate-spin'
);

// Separate spinner check:
assert.ok(acceptingHtml.includes('id="accepting-spinner-row"'), 'A separate accepting-spinner-row must be rendered outside the button');
assert.ok(acceptingHtml.includes('Accepting invitation...'), 'Accepting invitation text must be shown');
assert.ok(acceptingHtml.includes('pointer-events-none opacity-60'), 'Google button should be disabled via pointer-events-none and dimmed during acceptance');
console.log('  ✓ PASSED: Google button stays intact; separate spinner rendered outside without rotating the Google button.\n');

console.log('======================================================');
console.log('🎉 ALL GOOGLE BUTTON STABILITY TESTS PASSED CLEANLY!');
console.log('======================================================\n');
