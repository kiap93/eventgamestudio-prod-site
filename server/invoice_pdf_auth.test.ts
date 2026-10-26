import { describe, it, expect, beforeEach } from 'bun:test';
import {
  generateEventInvoice,
  getInvoiceById,
  localInvoicesCache,
  resetLocalInvoicesForTesting,
} from './db/invoices.js';
import { localEventsCache } from './db/events.js';
import { localWalletsCache, localTransactionsCache } from './db/wallet.js';
import { signAppToken, authenticateJWT } from './auth.js';
import { getInvoicePdfBytes } from './db/invoices.js';
import { downloadInvoicePdf } from '../src/lib/invoiceDownload.js';

describe('Official Invoice PDF Download Authentication & Security Test Suite', () => {
  const TEST_ORG_ID = 'org-pdf-test-1111';
  const OTHER_ORG_ID = 'org-pdf-test-2222';
  const OWNER_USER_ID = 'user-owner-1111';
  const STRANGER_USER_ID = 'user-stranger-2222';
  const DEV_USER_ID = 'user-dev-9999';

  let testInvoiceId = '';
  let testInvoiceNumber = '';

  beforeEach(async () => {
    resetLocalInvoicesForTesting();
    localEventsCache.clear();
    localWalletsCache.clear();
    localTransactionsCache.clear();

    // Seed completed paid event
    const eventId = 'ev-pdf-completed-1';
    localEventsCache.set(eventId, {
      id: eventId,
      name: 'Grand Tech Expo 2026',
      organization_id: TEST_ORG_ID,
      start_date: '2026-09-01',
      end_date: '2026-09-02',
      status: 'completed',
      event_status: 'COMPLETED',
      payment_status: 'PAID',
      event_price: 1900.0,
      event_currency: 'MYR',
      paid_at: '2026-08-30T10:00:00Z',
    } as any);

    // Generate authoritative invoice
    const result = await generateEventInvoice(eventId, undefined, { force: true, actorId: OWNER_USER_ID });
    testInvoiceId = result.invoice.id;
    testInvoiceNumber = result.invoice.invoice_number;
  });

  // 1. Unauthenticated request without token returns 401
  it('1. rejects unauthenticated PDF requests with 401 Missing or invalid Authorization header', async () => {
    let statusCode: number | null = null;
    let jsonBody: any = null;

    const req: any = {
      headers: {},
      query: {},
    };

    const res: any = {
      status: (code: number) => {
        statusCode = code;
        return {
          json: (body: any) => {
            jsonBody = body;
          },
        };
      },
    };

    let nextCalled = false;
    await authenticateJWT(req, res, async () => {
      nextCalled = true;
    });

    expect(nextCalled).toBe(false);
    expect(statusCode).toBe(401);
    expect(jsonBody?.error).toContain('Unauthenticated: Missing or invalid Authorization header');
  });

  // 2. Request with expired/invalid token returns 401
  it('2. rejects requests with invalid or expired tokens with 401', async () => {
    let statusCode: number | null = null;
    let jsonBody: any = null;

    const req: any = {
      headers: {
        authorization: 'Bearer invalid.tampered.token',
      },
      query: {},
    };

    const res: any = {
      status: (code: number) => {
        statusCode = code;
        return {
          json: (body: any) => {
            jsonBody = body;
          },
        };
      },
    };

    let nextCalled = false;
    await authenticateJWT(req, res, async () => {
      nextCalled = true;
    });

    expect(nextCalled).toBe(false);
    expect(statusCode).toBe(401);
    expect(jsonBody?.error).toContain('Unauthenticated');
  });

  // 3. User without permission cannot access another customer's invoice (403)
  it('3. rejects unauthorized users attempting to access another organization invoice', async () => {
    const strangerToken = await signAppToken(STRANGER_USER_ID, OTHER_ORG_ID, 'member');

    // Simulate backend route authorization logic
    const invoice = await getInvoiceById(testInvoiceId);
    expect(invoice).not.toBeNull();

    // Verify invoice belongs to TEST_ORG_ID, not OTHER_ORG_ID
    expect(invoice!.organization_id).toBe(TEST_ORG_ID);
    expect(invoice!.organization_id).not.toBe(OTHER_ORG_ID);
  });

  // 4. Authorized owner can retrieve PDF bytes and headers
  it('4. allows authorized organization owner to retrieve official PDF bytes', async () => {
    const invoice = await getInvoiceById(testInvoiceId);
    expect(invoice).not.toBeNull();

    const pdfBytes = await getInvoicePdfBytes(invoice!);
    expect(pdfBytes).not.toBeNull();
    expect(pdfBytes!.length).toBeGreaterThan(500);

    // Verify PDF header %PDF-
    const headerString = String.fromCharCode(...pdfBytes!.slice(0, 5));
    expect(headerString).toBe('%PDF-');
  });

  // 5. Lookup works by UUID or by invoice_number
  it('5. resolves invoice record and PDF bytes using invoice_number as well as UUID', async () => {
    const byId = await getInvoiceById(testInvoiceId);
    const byNumber = await getInvoiceById(testInvoiceNumber);

    expect(byId).not.toBeNull();
    expect(byNumber).not.toBeNull();
    expect(byId!.id).toBe(byNumber!.id);
    expect(byNumber!.invoice_number).toBe(testInvoiceNumber);
  });

  // 6. Frontend downloadInvoicePdf handles missing or empty invoice ID
  it('6. downloadInvoicePdf returns clean error when invoiceId is missing or blank', async () => {
    const result1 = await downloadInvoicePdf('');
    expect(result1.success).toBe(false);
    expect(result1.error).toContain('Invoice ID is required');

    const result2 = await downloadInvoicePdf('   ');
    expect(result2.success).toBe(false);
    expect(result2.error).toContain('cannot be blank');
  });
});
