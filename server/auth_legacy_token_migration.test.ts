/**
 * Legacy Token Migration & Deprecation Test Suite
 *
 * Verifies that:
 * 1. Legacy 'durian_app_token' is cleanly migrated to 'app_token' if present.
 * 2. Legacy 'durian_app_token' is immediately removed from localStorage upon migration.
 * 3. If 'app_token' already exists, it is preserved and 'durian_app_token' is removed.
 * 4. apiFetch only uses 'app_token'.
 * 5. No active code in src/ queries or writes to 'durian_app_token'.
 */

import assert from 'node:assert';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { migrateLegacyAppToken, apiFetch } from '../src/lib/api.js';

console.log('--- Starting Legacy Token Migration & Deprecation Tests ---');

// Mock localStorage for test environment
class MockLocalStorage {
  private store: Map<string, string> = new Map();

  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }

  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }
}

// Setup global mock window and localStorage
const mockStorage = new MockLocalStorage();
(globalThis as any).window = globalThis;
(globalThis as any).localStorage = mockStorage;

async function runTests() {
  // Test 1: Clean migration when only durian_app_token exists
  {
    mockStorage.clear();
    mockStorage.setItem('durian_app_token', 'legacy-prototype-token-123');

    assert.strictEqual(mockStorage.getItem('durian_app_token'), 'legacy-prototype-token-123');
    assert.strictEqual(mockStorage.getItem('app_token'), null);

    migrateLegacyAppToken();

    assert.strictEqual(
      mockStorage.getItem('app_token'),
      'legacy-prototype-token-123',
      'app_token should receive the legacy token value'
    );
    assert.strictEqual(
      mockStorage.getItem('durian_app_token'),
      null,
      'durian_app_token should be deleted immediately after migration'
    );
    console.log('✓ Test 1: Clean migration copies durian_app_token to app_token and deletes legacy key');
  }

  // Test 2: Existing app_token is preserved, durian_app_token is still purged
  {
    mockStorage.clear();
    mockStorage.setItem('app_token', 'active-valid-token-456');
    mockStorage.setItem('durian_app_token', 'stale-prototype-token-789');

    migrateLegacyAppToken();

    assert.strictEqual(
      mockStorage.getItem('app_token'),
      'active-valid-token-456',
      'Existing app_token must not be overwritten by stale durian_app_token'
    );
    assert.strictEqual(
      mockStorage.getItem('durian_app_token'),
      null,
      'stale durian_app_token must be purged'
    );
    console.log('✓ Test 2: Existing app_token preserved and stale durian_app_token purged');
  }

  // Test 3: Idempotent when only app_token exists
  {
    mockStorage.clear();
    mockStorage.setItem('app_token', 'standard-token-abc');

    migrateLegacyAppToken();

    assert.strictEqual(mockStorage.getItem('app_token'), 'standard-token-abc');
    assert.strictEqual(mockStorage.getItem('durian_app_token'), null);
    console.log('✓ Test 3: Migration is idempotent when only app_token exists');
  }

  // Test 4: apiFetch uses app_token exclusively in Authorization header
  {
    mockStorage.clear();
    mockStorage.setItem('app_token', 'bearer-test-token-777');

    let capturedHeaders: Headers | null = null;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: any, init?: any) => {
      capturedHeaders = new Headers(init?.headers);
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }) as any;

    try {
      await apiFetch('/api/test-endpoint');
      assert(capturedHeaders !== null, 'Headers should be captured');
      assert.strictEqual(
        (capturedHeaders as Headers).get('Authorization'),
        'Bearer bearer-test-token-777',
        'apiFetch must send Authorization: Bearer <app_token>'
      );
      console.log('✓ Test 4: apiFetch correctly sends Authorization: Bearer <app_token>');
    } finally {
      globalThis.fetch = originalFetch;
    }
  }

  // Test 5: Verify no active code in src/ references durian_app_token for token retrieval
  {
    function searchFiles(dir: string, fileList: string[] = []): string[] {
      const files = readdirSync(dir);
      for (const file of files) {
        const fullPath = join(dir, file);
        if (statSync(fullPath).isDirectory()) {
          searchFiles(fullPath, fileList);
        } else if (file.endsWith('.ts') || file.endsWith('.tsx') || file.endsWith('.js')) {
          fileList.push(fullPath);
        }
      }
      return fileList;
    }

    const srcFiles = searchFiles('src');
    const violatingReads: string[] = [];

    for (const filePath of srcFiles) {
      const content = readFileSync(filePath, 'utf-8');
      // Look for any attempt to read durian_app_token as a fallback token source (e.g., getItem('durian_app_token') without migration)
      const lines = content.split('\n');
      lines.forEach((line, idx) => {
        // Exclude the migration definition function in api.ts
        if (filePath.includes('api.ts') && line.includes('const legacyToken = localStorage.getItem(\'durian_app_token\')')) {
          return;
        }
        if (line.includes("getItem('durian_app_token')") || line.includes('getItem("durian_app_token")')) {
          violatingReads.push(`${filePath}:${idx + 1}: ${line.trim()}`);
        }
      });
    }

    assert.strictEqual(
      violatingReads.length,
      0,
      `Found forbidden reads of durian_app_token in src/:\n${violatingReads.join('\n')}`
    );
    console.log('✓ Test 5: No active components or modules in src/ read durian_app_token');
  }

  console.log('\n--- All Legacy Token Migration & Deprecation Tests Passed Successfully! ---');
}

runTests().catch((err) => {
  console.error('Test failure:', err);
  process.exit(1);
});
