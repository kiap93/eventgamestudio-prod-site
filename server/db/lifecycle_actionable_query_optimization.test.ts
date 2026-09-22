import assert from 'node:assert';
import { runEventLifecycleMaintenance } from './events.js';
import type { EventRecord } from './types.js';

console.log('\n======================================================');
console.log(' RUNNING LIFECYCLE ACTIONABLE QUERY OPTIMIZATION TESTS');
console.log('======================================================\n');

async function runTests() {
  const capturedQueries: Array<{
    table: string;
    type?: string;
    filters: Array<{ type: string; column: string; value?: any }>;
  }> = [];

  // Track mock Supabase calls
  function createMockSupabase(mockEvents: EventRecord[]) {
    return {
      from(table: string) {
        const queryState: {
          table: string;
          type?: string;
          filters: Array<{ type: string; column: string; value?: any }>;
        } = {
          table,
          filters: [],
        };
        capturedQueries.push(queryState);

        const builder: any = {
          select(cols: string) {
            queryState.type = 'select';
            return builder;
          },
          update(payload: any) {
            queryState.type = 'update';
            return {
              eq(column: string, value: any) {
                return Promise.resolve({ data: null, error: null });
              },
            };
          },
          eq(column: string, value: any) {
            queryState.filters.push({ type: 'eq', column, value });
            return builder;
          },
          neq(column: string, value: any) {
            queryState.filters.push({ type: 'neq', column, value });
            return builder;
          },
          lte(column: string, value: any) {
            queryState.filters.push({ type: 'lte', column, value });
            return builder;
          },
          is(column: string, value: any) {
            queryState.filters.push({ type: 'is', column, value });
            return builder;
          },
          order(column: string, opts?: any) {
            return builder;
          },
          maybeSingle() {
            return Promise.resolve({ data: null, error: null });
          },
          single() {
            return Promise.resolve({ data: null, error: null });
          },
          then(resolve: any) {
            // Apply captured filters to mock data
            let result = [...mockEvents];
            for (const f of queryState.filters) {
              if (f.type === 'eq') {
                result = result.filter((r: any) => r[f.column] === f.value);
              } else if (f.type === 'neq') {
                result = result.filter((r: any) => r[f.column] !== f.value);
              } else if (f.type === 'lte') {
                result = result.filter((r: any) => new Date(r[f.column]).getTime() <= new Date(f.value).getTime());
              } else if (f.type === 'is') {
                result = result.filter((r: any) => r[f.column] === f.value);
              }
            }
            resolve({ data: result, error: null });
          },
        };
        return builder;
      },
      rpc(fn: string, params: any) {
        return Promise.resolve({ data: { success: true }, error: null });
      },
    };
  }

  console.log('--- Test 1: Verifies targeted lifecycle index queries ---');
  const now = new Date('2026-09-15T12:00:00.000Z');

  // Create a mix of events:
  // 1. Far-future event (should be filtered out by lte starts_at horizon)
  // 2. Already completed paid event with cleared test scores (should be filtered out by event_status != COMPLETED)
  // 3. Already expired unpaid event with cleared test scores (should be filtered out by event_status != EXPIRED)
  // 4. Actionable live paid event (should be fetched by paid query)
  // 5. Actionable expired unpaid event (should be fetched by unpaid query)
  // 6. Actionable event requiring test score clearing (should be fetched by test score query)
  const mockEvents: EventRecord[] = [
    {
      id: 'ev-far-future',
      organization_id: 'org-1',
      name: 'Far Future Event',
      slug: 'far-future',
      starts_at: '2026-12-01T00:00:00.000Z',
      expires_at: '2026-12-02T23:59:59.000Z',
      start_date: '2026-12-01',
      end_date: '2026-12-02',
      event_status: 'SCHEDULED',
      status: 'scheduled',
      payment_status: 'PAID',
      test_scores_cleared_at: '2026-09-01T00:00:00.000Z',
    } as any,
    {
      id: 'ev-completed-old',
      organization_id: 'org-1',
      name: 'Completed Old Event',
      slug: 'completed-old',
      starts_at: '2026-08-01T00:00:00.000Z',
      expires_at: '2026-08-02T23:59:59.000Z',
      start_date: '2026-08-01',
      end_date: '2026-08-02',
      event_status: 'COMPLETED',
      status: 'completed',
      payment_status: 'PAID',
      test_scores_cleared_at: '2026-08-01T00:00:00.000Z',
    } as any,
    {
      id: 'ev-expired-old',
      organization_id: 'org-1',
      name: 'Expired Old Event',
      slug: 'expired-old',
      starts_at: '2026-08-10T00:00:00.000Z',
      expires_at: '2026-08-11T23:59:59.000Z',
      start_date: '2026-08-10',
      end_date: '2026-08-11',
      event_status: 'EXPIRED',
      status: 'expired',
      payment_status: 'UNPAID',
      test_scores_cleared_at: '2026-08-10T00:00:00.000Z',
    } as any,
    {
      id: 'ev-live-paid',
      organization_id: 'org-1',
      name: 'Live Paid Event',
      slug: 'live-paid',
      starts_at: '2026-09-15T00:00:00.000Z',
      expires_at: '2026-09-15T23:59:59.000Z',
      start_date: '2026-09-15',
      end_date: '2026-09-15',
      event_status: 'SCHEDULED',
      status: 'scheduled',
      payment_status: 'PAID',
      test_scores_cleared_at: '2026-09-15T00:00:00.000Z',
    } as any,
    {
      id: 'ev-unpaid-needs-expiry',
      organization_id: 'org-1',
      name: 'Unpaid Ended Yesterday',
      slug: 'unpaid-ended',
      starts_at: '2026-09-13T00:00:00.000Z',
      expires_at: '2026-09-14T23:59:59.000Z',
      start_date: '2026-09-13',
      end_date: '2026-09-14',
      event_status: 'SCHEDULED',
      status: 'scheduled',
      payment_status: 'UNPAID',
      test_scores_cleared_at: '2026-09-13T00:00:00.000Z',
    } as any,
    {
      id: 'ev-needs-score-clearing',
      organization_id: 'org-1',
      name: 'Needs Test Score Clearing',
      slug: 'needs-score-clearing',
      starts_at: '2026-09-15T00:00:00.000Z',
      expires_at: '2026-09-16T23:59:59.000Z',
      start_date: '2026-09-15',
      end_date: '2026-09-16',
      event_status: 'SCHEDULED',
      status: 'scheduled',
      payment_status: 'PAID',
      test_scores_cleared_at: null,
    } as any,
  ];

  const mockSupabase = createMockSupabase(mockEvents);
  const testEnv = {
    SUPABASE_URL: 'https://mock.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'mock-key',
    _mockSupabase: mockSupabase,
    __supabaseClient: mockSupabase,
  };

  // Run maintenance
  capturedQueries.length = 0;
  const result = await runEventLifecycleMaintenance(testEnv, now);

  // Assert query count: exactly 3 targeted queries were executed instead of an unconstrained select('*')
  const eventsSelectQueries = capturedQueries.filter((q: any) => q.table === 'events' && q.type === 'select');
  assert.strictEqual(eventsSelectQueries.length, 3, 'Must execute exactly 3 targeted queries on events table for the 3 actionable categories');

  // Verify Query 1: Unpaid actionable
  const q1 = eventsSelectQueries[0];
  assert.ok(q1.filters.some((f) => f.type === 'neq' && f.column === 'payment_status' && f.value === 'PAID'), 'Q1 filters out PAID');
  assert.ok(q1.filters.some((f) => f.type === 'neq' && f.column === 'event_status' && f.value === 'EXPIRED'), 'Q1 filters out EXPIRED');
  assert.ok(q1.filters.some((f) => f.type === 'lte' && f.column === 'starts_at'), 'Q1 enforces starts_at horizon');

  // Verify Query 2: Paid actionable
  const q2 = eventsSelectQueries[1];
  assert.ok(q2.filters.some((f) => f.type === 'eq' && f.column === 'payment_status' && f.value === 'PAID'), 'Q2 targets payment_status = PAID');
  assert.ok(q2.filters.some((f) => f.type === 'neq' && f.column === 'event_status' && f.value === 'COMPLETED'), 'Q2 filters out COMPLETED');
  assert.ok(q2.filters.some((f) => f.type === 'lte' && f.column === 'starts_at'), 'Q2 enforces starts_at horizon');

  // Verify Query 3: Test score clearing
  const q3 = eventsSelectQueries[2];
  assert.ok(q3.filters.some((f) => f.type === 'is' && f.column === 'test_scores_cleared_at' && f.value === null), 'Q3 targets test_scores_cleared_at IS NULL');
  assert.ok(q3.filters.some((f) => f.type === 'lte' && f.column === 'starts_at'), 'Q3 enforces starts_at horizon');

  // Verify results:
  // - ev-far-future should NEVER be touched
  // - ev-completed-old should NEVER be touched
  // - ev-expired-old should NEVER be touched
  // - ev-unpaid-needs-expiry should be transitioned to EXPIRED
  assert.ok(result.expiredEvents.includes('ev-unpaid-needs-expiry'), 'Unpaid past event must be transitioned to EXPIRED');
  assert.ok(!result.expiredEvents.includes('ev-expired-old'), 'Old expired event must not be re-processed');
  assert.ok(!result.completedEvents.includes('ev-completed-old'), 'Old completed event must not be re-processed');
  assert.ok(!result.completedEvents.includes('ev-far-future'), 'Far future event must not be touched');

  console.log('✓ PASS: All 3 targeted queries correctly filter by lifecycle indexes and ignore non-actionable records');
  console.log('======================================================');
  console.log('ALL LIFECYCLE ACTIONABLE QUERY TESTS PASSED!');
  console.log('======================================================\n');
}

runTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
