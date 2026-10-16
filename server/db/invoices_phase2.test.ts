import { describe, it, expect, beforeEach } from 'bun:test';
import {
  generateEventInvoice,
  isEventEligibleForInvoicing,
  getInvoiceByEventId,
  getInvoiceById,
  generateInvoiceNumber,
  generateCreditNoteNumber,
  createCreditNote,
  listCreditNotesByInvoice,
  resetLocalInvoicesForTesting,
  localInvoicesCache,
} from './invoices.js';
import { localEventsCache } from './events.js';
import { localWalletsCache, localTransactionsCache } from './wallet.js';
import { DEFAULT_SELLER_INVOICE_SETTINGS } from './platformSettings.js';

describe('Phase 2: Invoice Calculations, Numbering & Persistence', () => {
  beforeEach(() => {
    resetLocalInvoicesForTesting();
    localEventsCache.clear();
    localWalletsCache.clear();
    localTransactionsCache.clear();
  });


  it('rejects invoice generation if event has missing or invalid price', async () => {
    const eventId = 'ev_no_price';
    localEventsCache.set(eventId, {
      id: eventId,
      name: 'Unpriced Event',
      organization_id: 'org_1',
      start_date: '2026-01-01',
      end_date: '2026-01-02',
      status: 'completed',
      event_status: 'COMPLETED',
      payment_status: 'PAID',
      event_price: undefined as any,
      event_currency: 'MYR',
      starts_at: '2026-01-01T00:00:00.000Z',
      expires_at: '2026-01-02T23:59:59.999Z',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as any);

    await expect(generateEventInvoice(eventId)).rejects.toThrow('authoritative price');
  });

  it('rejects invoice generation if event has missing or invalid currency', async () => {
    const eventId = 'ev_no_curr';
    localEventsCache.set(eventId, {
      id: eventId,
      name: 'No Currency Event',
      organization_id: 'org_1',
      start_date: '2026-01-01',
      end_date: '2026-01-02',
      status: 'completed',
      event_status: 'COMPLETED',
      payment_status: 'PAID',
      event_price: 1400.00,
      event_currency: '',
      starts_at: '2026-01-01T00:00:00.000Z',
      expires_at: '2026-01-02T23:59:59.999Z',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as any);

    await expect(generateEventInvoice(eventId)).rejects.toThrow('authoritative price or currency');
  });

  it('rejects invoice generation for cancelled event', async () => {
    const eventId = 'ev_cancelled';
    localEventsCache.set(eventId, {
      id: eventId,
      name: 'Cancelled Event',
      organization_id: 'org_1',
      start_date: '2026-01-01',
      end_date: '2026-01-02',
      status: 'cancelled',
      event_status: 'CANCELLED',
      payment_status: 'REFUNDED',
      event_price: 1400.00,
      event_currency: 'MYR',
      starts_at: '2026-01-01T00:00:00.000Z',
      expires_at: '2026-01-02T23:59:59.999Z',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as any);

    await expect(generateEventInvoice(eventId)).rejects.toThrow('cancelled');
  });

  it('rejects invoice generation if event has not ended yet', async () => {
    const eventId = 'ev_future';
    localEventsCache.set(eventId, {
      id: eventId,
      name: 'Future Event',
      organization_id: 'org_1',
      start_date: '2026-12-01',
      end_date: '2026-12-02',
      status: 'live',
      event_status: 'LIVE',
      payment_status: 'PAID',
      event_price: 1900.00,
      event_currency: 'MYR',
      starts_at: '2026-12-01T00:00:00.000Z',
      expires_at: '2026-12-02T23:59:59.999Z',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as any);

    const check = isEventEligibleForInvoicing(localEventsCache.get(eventId)!, new Date('2026-10-15T00:00:00Z'));
    expect(check.eligible).toBe(false);
    expect(check.reason).toContain('has not ended yet');
  });

  it('calculates full paid event correctly without discounts', async () => {
    const eventId = 'ev_full_paid';
    localEventsCache.set(eventId, {
      id: eventId,
      name: 'Tech Launch 2026',
      organization_id: 'org_1',
      start_date: '2026-09-01',
      end_date: '2026-09-02',
      status: 'completed',
      event_status: 'COMPLETED',
      payment_status: 'PAID',
      payment_mode: 'FULL_PAID',
      event_price: 1900.00,
      paid_amount: 1900.00,
      discount_amount: 0.00,
      event_currency: 'MYR',
      starts_at: '2026-09-01T00:00:00.000Z',
      expires_at: '2026-09-02T23:59:59.999Z',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as any);

    const res = await generateEventInvoice(eventId, undefined, { bypassEmail: true });
    expect(res.created).toBe(true);
    expect(res.invoice.subtotal).toBe(1900.00);
    expect(res.invoice.discount_amount).toBe(0.00);
    expect(res.invoice.total_amount).toBe(1900.00);
    expect(res.invoice.amount_paid).toBe(1900.00);
    expect(res.invoice.outstanding_balance).toBe(0.00);
    expect(res.invoice.status).toBe('paid');
    expect(res.invoice.currency).toBe('MYR');
  });

  it('reconciles Welcome Credit (RM800) and Paid Balance (RM600) accurately', async () => {
    const eventId = 'ev_welcome';
    localEventsCache.set(eventId, {
      id: eventId,
      name: 'First Event Activation',
      organization_id: 'org_owner',
      start_date: '2026-09-01',
      end_date: '2026-09-01',
      status: 'completed',
      event_status: 'COMPLETED',
      payment_status: 'PAID',
      payment_mode: 'WELCOME_CREDIT',
      event_price: 1400.00,
      paid_amount: 600.00,
      discount_amount: 800.00,
      event_currency: 'MYR',
      starts_at: '2026-09-01T00:00:00.000Z',
      expires_at: '2026-09-01T23:59:59.999Z',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as any);

    const res = await generateEventInvoice(eventId, undefined, { bypassEmail: true });
    expect(res.created).toBe(true);
    expect(res.invoice.subtotal).toBe(1400.00);
    expect(res.invoice.discount_amount).toBe(800.00);
    expect(res.invoice.welcome_credit_amount).toBe(800.00);
    expect(res.invoice.total_amount).toBe(600.00);
    expect(res.invoice.amount_paid).toBe(600.00);
    expect(res.invoice.outstanding_balance).toBe(0.00);
    expect(res.invoice.status).toBe('paid');

    // Verify line items include welcome credit deduction
    const creditItem = res.invoice.line_items.find((li) => li.description.includes('Welcome Credit'));
    expect(creditItem).toBeDefined();
    expect(creditItem?.total_price).toBe(-800.00);
  });

  it('preserves foreign currencies (SGD, USD) and prevents cross-currency mixing', async () => {
    const eventId = 'ev_usd';
    localEventsCache.set(eventId, {
      id: eventId,
      name: 'Global Roadshow USD',
      organization_id: 'org_us',
      start_date: '2026-08-01',
      end_date: '2026-08-03',
      status: 'completed',
      event_status: 'COMPLETED',
      payment_status: 'PAID',
      payment_mode: 'FULL_PAID',
      event_price: 550.00,
      paid_amount: 550.00,
      event_currency: 'USD',
      starts_at: '2026-08-01T00:00:00.000Z',
      expires_at: '2026-08-03T23:59:59.999Z',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as any);

    const res = await generateEventInvoice(eventId, undefined, { bypassEmail: true });
    expect(res.invoice.currency).toBe('USD');
    expect(res.invoice.subtotal).toBe(550.00);
    expect(res.invoice.total_amount).toBe(550.00);
  });

  it('is idempotent: secondary call returns existing invoice without duplicate creation', async () => {
    const eventId = 'ev_idemp';
    localEventsCache.set(eventId, {
      id: eventId,
      name: 'Idempotency Event',
      organization_id: 'org_1',
      start_date: '2026-08-01',
      end_date: '2026-08-01',
      status: 'completed',
      event_status: 'COMPLETED',
      payment_status: 'PAID',
      event_price: 1400.00,
      paid_amount: 1400.00,
      event_currency: 'MYR',
      starts_at: '2026-08-01T00:00:00.000Z',
      expires_at: '2026-08-01T23:59:59.999Z',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as any);

    const first = await generateEventInvoice(eventId, undefined, { bypassEmail: true });
    expect(first.created).toBe(true);

    const second = await generateEventInvoice(eventId, undefined, { bypassEmail: true });
    expect(second.created).toBe(false);
    expect(second.invoice.id).toBe(first.invoice.id);
    expect(second.invoice.invoice_number).toBe(first.invoice.invoice_number);
  });

  it('generates sequential invoice and credit note numbers', async () => {
    const num1 = await generateInvoiceNumber(undefined, 2026);
    const num2 = await generateInvoiceNumber(undefined, 2026);
    expect(num1).toMatch(/^INV-2026-\d{5}$/);
    expect(num2).toMatch(/^INV-2026-\d{5}$/);
    expect(num1).not.toBe(num2);

    const cn1 = await generateCreditNoteNumber(undefined, 2026);
    const cn2 = await generateCreditNoteNumber(undefined, 2026);
    expect(cn1).toMatch(/^CN-2026-\d{5}$/);
    expect(cn2).toMatch(/^CN-2026-\d{5}$/);
    expect(cn1).not.toBe(cn2);
  });

  it('creates and lists credit notes linked to an existing invoice', async () => {
    const eventId = 'ev_cn_test';
    localEventsCache.set(eventId, {
      id: eventId,
      name: 'CN Test Event',
      organization_id: 'org_1',
      start_date: '2026-08-01',
      end_date: '2026-08-01',
      status: 'completed',
      event_status: 'COMPLETED',
      payment_status: 'PAID',
      event_price: 1400.00,
      paid_amount: 1400.00,
      event_currency: 'MYR',
      starts_at: '2026-08-01T00:00:00.000Z',
      expires_at: '2026-08-01T23:59:59.999Z',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as any);

    const invResult = await generateEventInvoice(eventId, undefined, { bypassEmail: true });
    const invoice = invResult.invoice;

    const cn = await createCreditNote(invoice.id, 200.00, 'Partial goodwill adjustment');
    expect(cn.invoice_id).toBe(invoice.id);
    expect(cn.amount).toBe(200.00);
    expect(cn.status).toBe('issued');

    const notes = await listCreditNotesByInvoice(invoice.id);
    expect(notes.length).toBe(1);
    expect(notes[0].credit_note_number).toBe(cn.credit_note_number);

    // Cannot issue credit note exceeding invoice total
    await expect(createCreditNote(invoice.id, 99999.00, 'Exceeding amount')).rejects.toThrow('cannot exceed invoice total');
  });
});
