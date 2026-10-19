import { describe, it, expect, beforeEach } from 'bun:test';
import {
  generateEventInvoice,
  retryEventInvoice,
  isEventEligibleForInvoicing,
  getInvoiceByEventId,
  getInvoiceById,
  resetLocalInvoicesForTesting,
  localInvoicesCache,
  localInvoicePdfs,
} from './invoices.js';
import { localEventsCache } from './events.js';
import { localWalletsCache, localTransactionsCache } from './wallet.js';
import { localUsersCache } from './users.js';
import { localMembersCache } from './members.js';
import { signAppToken } from '../auth.js';
import worker from '../../worker.js';

describe('Phase 4: Developer Admin Invoice Generation & Retry Suite', () => {
  const orgId = '00000000-0000-0000-0000-000000000001';
  const testSecret = 'test-jwt-secret-for-invoice-retry-verification-32bytes!';
  const workerEnv = {
    JWT_SECRET: testSecret,
    DEVELOPER_EMAILS: 'admin@eventgamestudio.com',
    NODE_ENV: 'test',
  };

  beforeEach(() => {
    resetLocalInvoicesForTesting();
    localEventsCache.clear();
    localWalletsCache.clear();
    localTransactionsCache.clear();
    localUsersCache.clear();
    localMembersCache.clear();
  });

  const setupCompletedPaidEvent = (eventId: string, overrides: Record<string, any> = {}) => {
    const event = {
      id: eventId,
      name: 'Annual Tech Gala 2026',
      title: 'Annual Tech Gala 2026',
      organization_id: orgId,
      game_type: 'catch-brand',
      start_date: '2026-01-01',
      end_date: '2026-01-02',
      status: 'completed',
      event_status: 'COMPLETED',
      payment_status: 'PAID',
      event_price: 1400.00,
      event_currency: 'MYR',
      starts_at: '2026-01-01T00:00:00.000Z',
      expires_at: '2026-01-02T23:59:59.999Z',
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-03T00:00:00.000Z',
      ...overrides,
    };
    localEventsCache.set(eventId, event as any);
    return event;
  };

  // Test 1: Completed event with no invoice
  it('generates an invoice on retry for a completed, paid event with no invoice', async () => {
    const eventId = '00000000-0000-0000-0000-000000000010';
    setupCompletedPaidEvent(eventId);

    // Initial check: no invoice exists
    const initialInvoice = await getInvoiceByEventId(eventId);
    expect(initialInvoice).toBeNull();

    const eligibility = isEventEligibleForInvoicing(localEventsCache.get(eventId)!);
    expect(eligibility.eligible).toBe(true);

    // Perform retry
    const result = await retryEventInvoice(eventId, undefined, {
      actorId: 'dev_user_1',
      actorEmail: 'admin@eventgamestudio.com',
      bypassEmail: true,
    });

    expect(result.created).toBe(true);
    expect(result.recovered).toBe(false);
    expect(result.invoice).toBeDefined();
    expect(result.invoice.event_id).toBe(eventId);
    expect(result.invoice.organization_id).toBe(orgId);
    expect(result.invoice.status).toBe('paid');
    expect(result.invoice.total_amount).toBe(1400.00);
    expect(result.invoice.invoice_number).toMatch(/^INV-\d{4}-\d{5}$/);
    expect(result.pdfGenerated).toBe(true);

    // Verify it is queryable by eventId
    const queried = await getInvoiceByEventId(eventId);
    expect(queried).not.toBeNull();
    expect(queried?.id).toBe(result.invoice.id);
  });

  // Test 2: Failed invoice generation followed by successful retry
  it('handles initial failure condition and succeeds upon retry once corrected', async () => {
    const eventId = '00000000-0000-0000-0000-000000000020';
    // Initially missing price
    setupCompletedPaidEvent(eventId, { event_price: null });

    // Retry should fail because price is missing
    await expect(
      retryEventInvoice(eventId, undefined, { actorId: 'dev_1', bypassEmail: true })
    ).rejects.toThrow('authoritative price');

    // Event is preserved intact
    expect(localEventsCache.has(eventId)).toBe(true);
    expect(await getInvoiceByEventId(eventId)).toBeNull();

    // Now fix underlying data (e.g. price restored)
    setupCompletedPaidEvent(eventId, { event_price: 1900.00 });

    // Retry again: should succeed
    const retryResult = await retryEventInvoice(eventId, undefined, {
      actorId: 'dev_1',
      actorEmail: 'admin@eventgamestudio.com',
      bypassEmail: true,
    });

    expect(retryResult.created).toBe(true);
    expect(retryResult.invoice.total_amount).toBe(1900.00);
    const uniqueInvoices2 = new Set(Array.from(localInvoicesCache.values()).map(inv => inv.id));
    expect(uniqueInvoices2.size).toBe(1);
  });

  // Test 3: Repeated retry after success (idempotent, returns existing invoice without duplicate)
  it('is idempotent on repeated retries after success, never duplicating invoices', async () => {
    const eventId = '00000000-0000-0000-0000-000000000030';
    setupCompletedPaidEvent(eventId);

    // First attempt creates
    const firstResult = await retryEventInvoice(eventId, undefined, { bypassEmail: true });
    expect(firstResult.created).toBe(true);
    expect(firstResult.recovered).toBe(false);
    const invoiceNumber = firstResult.invoice.invoice_number;
    const invoiceId = firstResult.invoice.id;

    // Second attempt recovers existing
    const secondResult = await retryEventInvoice(eventId, undefined, { bypassEmail: true });
    expect(secondResult.created).toBe(false);
    expect(secondResult.recovered).toBe(true);
    expect(secondResult.invoice.id).toBe(invoiceId);
    expect(secondResult.invoice.invoice_number).toBe(invoiceNumber);

    // Third attempt also recovers
    const thirdResult = await retryEventInvoice(eventId, undefined, { bypassEmail: true });
    expect(thirdResult.created).toBe(false);
    expect(thirdResult.recovered).toBe(true);
    expect(thirdResult.invoice.id).toBe(invoiceId);
    expect(thirdResult.invoice.invoice_number).toBe(invoiceNumber);

    // Total unique invoices must be strictly 1
    const uniqueInvoices3 = new Set(Array.from(localInvoicesCache.values()).map(inv => inv.id));
    expect(uniqueInvoices3.size).toBe(1);
  });

  // Test 4: Concurrent retry requests (in-flight deduplication & database constraint safety)
  it('safely handles concurrent retry requests without duplicate invoice generation', async () => {
    const eventId = '00000000-0000-0000-0000-000000000040';
    setupCompletedPaidEvent(eventId);

    // Launch 5 simultaneous retries
    const promises = Array.from({ length: 5 }, (_, i) =>
      retryEventInvoice(eventId, undefined, {
        actorId: `dev_concurrent_${i}`,
        actorEmail: `dev${i}@example.com`,
        bypassEmail: true,
      })
    );

    const results = await Promise.all(promises);

    // Every result must have returned an invoice
    expect(results).toHaveLength(5);
    const primaryId = results[0].invoice.id;
    const primaryNumber = results[0].invoice.invoice_number;

    for (const r of results) {
      expect(r.invoice.id).toBe(primaryId);
      expect(r.invoice.invoice_number).toBe(primaryNumber);
      expect(r.invoice.event_id).toBe(eventId);
    }

    // Exactly 1 unique invoice in storage
    const uniqueInvoices4 = new Set(Array.from(localInvoicesCache.values()).map(inv => inv.id));
    expect(uniqueInvoices4.size).toBe(1);
  });

  // Test 5: Timeout after invoice persistence (recovery of persisted record)
  it('recovers cleanly when invoice was persisted but client connection timed out', async () => {
    const eventId = '00000000-0000-0000-0000-000000000050';
    setupCompletedPaidEvent(eventId);

    // Generate and persist
    const initial = await generateEventInvoice(eventId, undefined, { bypassEmail: true });
    expect(initial.invoice.id).toBeDefined();

    // Clear PDF cache to simulate timeout between DB persistence and PDF return
    localInvoicePdfs.delete(initial.invoice.id);
    const stored = localInvoicesCache.get(initial.invoice.id)!;
    stored.pdf_status = 'failed';
    localInvoicesCache.set(initial.invoice.id, stored);

    // Subsequent retry recovers existing invoice and repairs/re-renders PDF
    const recoveredResult = await retryEventInvoice(eventId, undefined, { bypassEmail: true });
    expect(recoveredResult.recovered).toBe(true);
    expect(recoveredResult.invoice.id).toBe(initial.invoice.id);
    expect(recoveredResult.invoice.invoice_number).toBe(initial.invoice.invoice_number);
    expect(recoveredResult.invoice.pdf_status).toBe('generated');
    expect(localInvoicePdfs.has(initial.invoice.id)).toBe(true);
  });

  // Test 6: Invalid event state rejected
  it('rejects invoice generation for unpaid, future, or cancelled events', async () => {
    // Unpaid event
    const unpaidEventId = '00000000-0000-0000-0000-000000000061';
    setupCompletedPaidEvent(unpaidEventId, { payment_status: 'PENDING' });
    const unpaidElig = isEventEligibleForInvoicing(localEventsCache.get(unpaidEventId)!);
    expect(unpaidElig.eligible).toBe(false);
    expect(unpaidElig.reason.toLowerCase()).toMatch(/paid/);

    await expect(retryEventInvoice(unpaidEventId, undefined, { bypassEmail: true })).rejects.toThrow('not eligible');

    // Future event (not yet ended)
    const futureEventId = '00000000-0000-0000-0000-000000000062';
    setupCompletedPaidEvent(futureEventId, { status: 'published', event_status: 'ACTIVE', end_date: '2099-12-31' });
    const futureElig = isEventEligibleForInvoicing(localEventsCache.get(futureEventId)!);
    expect(futureElig.eligible).toBe(false);
    expect(futureElig.reason.toLowerCase()).toContain('ended');

    await expect(retryEventInvoice(futureEventId, undefined, { bypassEmail: true })).rejects.toThrow('not eligible');

    // Cancelled event
    const cancelledEventId = '00000000-0000-0000-0000-000000000063';
    setupCompletedPaidEvent(cancelledEventId, { status: 'cancelled', event_status: 'CANCELLED' });
    const cancelledElig = isEventEligibleForInvoicing(localEventsCache.get(cancelledEventId)!);
    expect(cancelledElig.eligible).toBe(false);
    expect(cancelledElig.reason.toLowerCase()).toContain('cancelled');

    await expect(retryEventInvoice(cancelledEventId, undefined, { bypassEmail: true })).rejects.toThrow('not eligible');
  });

  // Test 7: Cloudflare Worker Parity — Unauthorized non-dev blocked, Developer Admin permitted
  it('worker endpoint enforces Developer Admin access for retry-invoice', async () => {
    const eventId = '00000000-0000-0000-0000-000000000070';
    setupCompletedPaidEvent(eventId);

    // Register a normal member user
    const memberUser = {
      id: '00000000-0000-0000-0000-000000000101',
      email: 'member@company.com',
      name: 'Regular Member',
      is_developer: false,
    };
    localUsersCache.set(memberUser.id, memberUser as any);
    localMembersCache.set('m_1', {
      id: 'm_1',
      organization_id: orgId,
      user_id: memberUser.id,
      role: 'member',
      created_at: new Date().toISOString(),
    } as any);

    const memberToken = await signAppToken(memberUser.id, orgId, 'member', testSecret, workerEnv);

    // 7a. Non-developer user request should receive 403 Forbidden
    const unauthReq = new Request(`https://test.local/api/developer/events/${eventId}/retry-invoice`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${memberToken}`,
      },
    });

    const unauthRes = await worker.fetch(unauthReq, workerEnv as any, {} as any);
    expect(unauthRes.status).toBe(403);
    const unauthBody = await unauthRes.json();
    expect(unauthBody.error).toContain('Developer Admin');

    // 7b. Developer Admin user request should succeed
    const adminUser = {
      id: '00000000-0000-0000-0000-000000000102',
      email: 'admin@eventgamestudio.com',
      name: 'Developer Admin',
      is_developer: true,
    };
    localUsersCache.set(adminUser.id, adminUser as any);

    const adminToken = await signAppToken(adminUser.id, undefined, undefined, testSecret, workerEnv);

    const authReq = new Request(`https://test.local/api/developer/events/${eventId}/retry-invoice`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
    });

    const authRes = await worker.fetch(authReq, workerEnv as any, {} as any);
    expect(authRes.status).toBe(200);
    const authBody = await authRes.json();
    expect(authBody.success).toBe(true);
    expect(authBody.created).toBe(true);
    expect(authBody.invoice).toBeDefined();
    expect(authBody.invoice.event_id).toBe(eventId);

    // 7c. Repeated call via worker recovers existing without duplication
    const repeatReq = new Request(`https://test.local/api/developer/events/${eventId}/retry-invoice`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
    });
    const repeatRes = await worker.fetch(repeatReq, workerEnv as any, {} as any);
    expect(repeatRes.status).toBe(200);
    const repeatBody = await repeatRes.json();
    expect(repeatBody.success).toBe(true);
    expect(repeatBody.recovered).toBe(true);
    expect(repeatBody.created).toBe(false);
  });

  // Test 8: Cloudflare Worker Parity — GET /api/events/:eventId/invoice returns eligibility and can_retry
  it('worker GET /api/events/:eventId/invoice provides eligibility and can_retry info', async () => {
    const eventId = '00000000-0000-0000-0000-000000000080';
    setupCompletedPaidEvent(eventId);

    const adminUser = {
      id: '00000000-0000-0000-0000-000000000103',
      email: 'admin@eventgamestudio.com',
      name: 'Developer Admin',
      is_developer: true,
    };
    localUsersCache.set(adminUser.id, adminUser as any);

    const adminToken = await signAppToken(adminUser.id, undefined, undefined, testSecret, workerEnv);

    const req = new Request(`https://test.local/api/events/${eventId}/invoice`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${adminToken}`,
      },
    });

    const res = await worker.fetch(req, workerEnv as any, {} as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.eligible).toBe(true);
    expect(body.can_retry).toBe(true);
    expect(body.invoice).toBeNull();
  });
});
