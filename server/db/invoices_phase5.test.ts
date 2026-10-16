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
  listInvoicesByOrganization,
  listAllInvoicesForDeveloper,
  getInvoicePdfBytes,
  retryInvoicePdf,
  retryInvoiceEmail,
  formatInvoicePdfData,
  resetLocalInvoicesForTesting,
  localInvoicesCache,
} from './invoices.js';
import { localEventsCache } from './events.js';
import { localWalletsCache, localTransactionsCache } from './wallet.js';
import {
  getPlatformInvoiceSettings,
  updatePlatformInvoiceSettings,
  DEFAULT_SELLER_INVOICE_SETTINGS,
} from './platformSettings.js';
import { generateInvoicePdf } from '../invoices/pdfGenerator.js';

describe('Phase 5: End-to-End Comprehensive Invoicing Test Suite', () => {
  beforeEach(() => {
    resetLocalInvoicesForTesting();
    localEventsCache.clear();
    localWalletsCache.clear();
    localTransactionsCache.clear();
  });

  // 1. Event not ended
  it('1. rejects invoicing when event has not reached end date', async () => {
    const eventId = 'ev_ongoing';
    localEventsCache.set(eventId, {
      id: eventId,
      name: 'Ongoing Event',
      organization_id: 'org_test',
      start_date: '2026-10-10',
      end_date: '2026-10-25',
      status: 'live',
      event_status: 'LIVE',
      payment_status: 'PAID',
      event_price: 1900.0,
      event_currency: 'MYR',
    } as any);

    const check = isEventEligibleForInvoicing(localEventsCache.get(eventId)!, new Date('2026-10-15T00:00:00Z'));
    expect(check.eligible).toBe(false);
    expect(check.reason).toContain('has not ended yet');
    await expect(generateEventInvoice(eventId)).rejects.toThrow('has not ended yet');
  });

  // 2. Event unpaid
  it('2. rejects invoicing when event is unpaid', async () => {
    const eventId = 'ev_unpaid';
    localEventsCache.set(eventId, {
      id: eventId,
      name: 'Unpaid Event',
      organization_id: 'org_test',
      start_date: '2026-09-01',
      end_date: '2026-09-02',
      status: 'completed',
      event_status: 'COMPLETED',
      payment_status: 'UNPAID',
      event_price: 1900.0,
      event_currency: 'MYR',
    } as any);

    const check = isEventEligibleForInvoicing(localEventsCache.get(eventId)!);
    expect(check.eligible).toBe(false);
    expect(check.reason).toContain('unpaid');
    await expect(generateEventInvoice(eventId)).rejects.toThrow('unpaid');
  });

  // 3. Cancelled event
  it('3. rejects invoicing when event is explicitly cancelled or refunded', async () => {
    const eventId = 'ev_cancelled';
    localEventsCache.set(eventId, {
      id: eventId,
      name: 'Cancelled Event',
      organization_id: 'org_test',
      start_date: '2026-09-01',
      end_date: '2026-09-02',
      status: 'cancelled',
      event_status: 'CANCELLED',
      payment_status: 'REFUNDED',
      event_price: 1900.0,
      event_currency: 'MYR',
    } as any);

    const check = isEventEligibleForInvoicing(localEventsCache.get(eventId)!);
    expect(check.eligible).toBe(false);
    expect(check.reason).toContain('cancelled');
    await expect(generateEventInvoice(eventId)).rejects.toThrow('cancelled');
  });

  // 4. Zero credit full payment
  it('4. calculates zero-discount full payment accurately with zero balance due', async () => {
    const eventId = 'ev_zero_credit';
    localEventsCache.set(eventId, {
      id: eventId,
      name: 'Full Cash Event',
      organization_id: 'org_test',
      start_date: '2026-09-01',
      end_date: '2026-09-03',
      status: 'completed',
      event_status: 'COMPLETED',
      payment_status: 'PAID',
      event_price: 2200.0,
      paid_amount: 2200.0,
      discount_amount: 0.0,
      event_currency: 'MYR',
    } as any);

    const result = await generateEventInvoice(eventId, undefined, { bypassEmail: true });
    expect(result.created).toBe(true);
    expect(result.invoice.subtotal).toBe(2200.0);
    expect(result.invoice.discount_amount).toBe(0.0);
    expect(result.invoice.total_amount).toBe(2200.0);
    expect(result.invoice.amount_paid).toBe(2200.0);
    expect(result.invoice.outstanding_balance).toBe(0.0);
    expect(result.invoice.status).toBe('paid');
  });

  // 5. Multi-credit reconciliation
  it('5. reconciles Welcome, Showcase, and Top-Up credits with cash remainder', async () => {
    const eventId = 'ev_multi_credit';
    localEventsCache.set(eventId, {
      id: eventId,
      name: 'Multi Credit Mega Activation',
      organization_id: 'org_multi',
      start_date: '2026-09-01',
      end_date: '2026-09-07',
      status: 'completed',
      event_status: 'COMPLETED',
      payment_status: 'PAID',
      event_price: 2800.0,
      paid_amount: 1400.0,
      discount_amount: 1400.0,
      event_currency: 'MYR',
    } as any);

    // Mock wallet transactions for this event
    localTransactionsCache.set('txn_1', {
      id: 'txn_1',
      wallet_id: 'w_1',
      organization_id: 'org_multi',
      amount: -800.0,
      currency: 'MYR',
      type: 'EVENT_CREATION',
      sub_type: 'WELCOME_CREDIT_USAGE',
      reference_id: eventId,
      status: 'SUCCESS',
      created_at: new Date().toISOString(),
    } as any);
    localTransactionsCache.set('txn_2', {
      id: 'txn_2',
      wallet_id: 'w_1',
      organization_id: 'org_multi',
      amount: -300.0,
      currency: 'MYR',
      type: 'EVENT_CREATION',
      sub_type: 'SHOWCASE_CREDIT_USAGE',
      reference_id: eventId,
      status: 'SUCCESS',
      created_at: new Date().toISOString(),
    } as any);
    localTransactionsCache.set('txn_3', {
      id: 'txn_3',
      wallet_id: 'w_1',
      organization_id: 'org_multi',
      amount: -300.0,
      currency: 'MYR',
      type: 'EVENT_CREATION',
      sub_type: 'TOPUP_CREDIT_USAGE',
      reference_id: eventId,
      status: 'SUCCESS',
      created_at: new Date().toISOString(),
    } as any);

    const result = await generateEventInvoice(eventId, undefined, { bypassEmail: true });
    expect(result.created).toBe(true);
    expect(result.invoice.subtotal).toBe(2800.0);
    expect(result.invoice.welcome_credit_amount).toBe(800.0);
    expect(result.invoice.showcase_credit_amount).toBe(300.0);
    expect(result.invoice.topup_credit_amount).toBe(300.0);
    expect(result.invoice.discount_amount).toBe(1400.0);
    expect(result.invoice.total_amount).toBe(1400.0);
    expect(result.invoice.amount_paid).toBe(1400.0);
    expect(result.invoice.outstanding_balance).toBe(0.0);
  });

  // 6. Custom seller profile override
  it('6. applies configured seller profile from platform settings to invoice snapshot', async () => {
    const customSettings = {
      ...DEFAULT_SELLER_INVOICE_SETTINGS,
      company_name: 'Custom Interactive Sdn Bhd',
      registration_number: '202601099999 (123456-X)',
      tax_number: 'SST-W10-99999999',
      tax_id: 'SST-W10-99999999',
    };
    await updatePlatformInvoiceSettings(customSettings);

    const eventId = 'ev_seller_custom';
    localEventsCache.set(eventId, {
      id: eventId,
      name: 'Custom Seller Event',
      organization_id: 'org_test',
      start_date: '2026-09-01',
      end_date: '2026-09-01',
      status: 'completed',
      event_status: 'COMPLETED',
      payment_status: 'PAID',
      event_price: 1400.0,
      paid_amount: 1400.0,
      event_currency: 'MYR',
    } as any);

    const result = await generateEventInvoice(eventId, undefined, { bypassEmail: true });
    expect(result.invoice.seller_details.company_name).toBe('Custom Interactive Sdn Bhd');
    expect(result.invoice.seller_details.registration_number).toBe('202601099999 (123456-X)');
    expect(result.invoice.seller_details.tax_id).toBe('SST-W10-99999999');
  });

  // 7. Number generation format and collision avoidance
  it('7. produces unique sequential numbers matching INV-YYYY-NNNNN pattern', async () => {
    const n1 = await generateInvoiceNumber(undefined, 2026);
    const n2 = await generateInvoiceNumber(undefined, 2026);
    const n3 = await generateInvoiceNumber(undefined, 2026);

    expect(n1).toMatch(/^INV-2026-\d{5}$/);
    expect(n2).toMatch(/^INV-2026-\d{5}$/);
    expect(n3).toMatch(/^INV-2026-\d{5}$/);
    expect(new Set([n1, n2, n3]).size).toBe(3);
  });

  // 8. Idempotency across repeated invocations
  it('8. enforces strict idempotency on duplicate invoice generation requests', async () => {
    const eventId = 'ev_idemp_phase5';
    localEventsCache.set(eventId, {
      id: eventId,
      name: 'Strict Idempotency Event',
      organization_id: 'org_test',
      start_date: '2026-09-01',
      end_date: '2026-09-01',
      status: 'completed',
      event_status: 'COMPLETED',
      payment_status: 'PAID',
      event_price: 1400.0,
      paid_amount: 1400.0,
      event_currency: 'MYR',
    } as any);

    const first = await generateEventInvoice(eventId, undefined, { bypassEmail: true });
    expect(first.created).toBe(true);

    const second = await generateEventInvoice(eventId, undefined, { bypassEmail: true });
    expect(second.created).toBe(false);
    expect(second.invoice.id).toBe(first.invoice.id);
    expect(second.invoice.invoice_number).toBe(first.invoice.invoice_number);
  });

  // 9. PDF generation produces valid PDF bytes
  it('9. generates compliant PDF binary bytes with %PDF header', async () => {
    const eventId = 'ev_pdf_test';
    localEventsCache.set(eventId, {
      id: eventId,
      name: 'PDF Generation Verification',
      organization_id: 'org_test',
      start_date: '2026-09-01',
      end_date: '2026-09-01',
      status: 'completed',
      event_status: 'COMPLETED',
      payment_status: 'PAID',
      event_price: 1400.0,
      paid_amount: 1400.0,
      event_currency: 'MYR',
    } as any);

    const { invoice } = await generateEventInvoice(eventId, undefined, { bypassEmail: true });
    const bytes = await getInvoicePdfBytes(invoice);
    expect(bytes).toBeDefined();
    expect(bytes.length).toBeGreaterThan(100);

    // Verify PDF header magic bytes %PDF
    const header = Buffer.from(bytes.subarray(0, 4)).toString('ascii');
    expect(header).toBe('%PDF');
  });

  // 10. Retry PDF helper functionality
  it('10. allows retrying PDF generation and updates pdf_status to generated', async () => {
    const eventId = 'ev_retry_pdf';
    localEventsCache.set(eventId, {
      id: eventId,
      name: 'Retry PDF Event',
      organization_id: 'org_test',
      start_date: '2026-09-01',
      end_date: '2026-09-01',
      status: 'completed',
      event_status: 'COMPLETED',
      payment_status: 'PAID',
      event_price: 1400.0,
      paid_amount: 1400.0,
      event_currency: 'MYR',
    } as any);

    const { invoice } = await generateEventInvoice(eventId, undefined, { bypassEmail: true });
    // Manually mark pdf_status as failed to test retry
    localInvoicesCache.set(invoice.id, { ...invoice, pdf_status: 'failed' });

    const updated = await retryInvoicePdf(invoice.id);
    expect(updated.pdf_status).toBe('generated');
    expect(updated.pdf_path).toContain(updated.invoice_number);
  });

  // 11. Credit note creation and limit validation
  it('11. creates credit notes and rejects amounts exceeding invoice total', async () => {
    const eventId = 'ev_cn_phase5';
    localEventsCache.set(eventId, {
      id: eventId,
      name: 'Credit Note Event',
      organization_id: 'org_test',
      start_date: '2026-09-01',
      end_date: '2026-09-01',
      status: 'completed',
      event_status: 'COMPLETED',
      payment_status: 'PAID',
      event_price: 1400.0,
      paid_amount: 1400.0,
      event_currency: 'MYR',
    } as any);

    const { invoice } = await generateEventInvoice(eventId, undefined, { bypassEmail: true });
    const cn = await createCreditNote(invoice.id, 500.0, 'Partial refund for unused extra monitor');
    expect(cn.amount).toBe(500.0);
    expect(cn.status).toBe('issued');

    const list = await listCreditNotesByInvoice(invoice.id);
    expect(list.length).toBe(1);
    expect(list[0].id).toBe(cn.id);

    // Rejects exceeding total
    await expect(createCreditNote(invoice.id, 1000.0, 'Excess credit')).rejects.toThrow('exceed');
  });

  // 12. Organization boundary isolation
  it('12. isolates organization invoices without cross-tenant leakage', async () => {
    const evOrgA = 'ev_org_a';
    const evOrgB = 'ev_org_b';

    localEventsCache.set(evOrgA, {
      id: evOrgA,
      name: 'Org A Event',
      organization_id: 'org_AAA',
      start_date: '2026-09-01',
      end_date: '2026-09-01',
      status: 'completed',
      event_status: 'COMPLETED',
      payment_status: 'PAID',
      event_price: 1400.0,
      paid_amount: 1400.0,
      event_currency: 'MYR',
    } as any);

    localEventsCache.set(evOrgB, {
      id: evOrgB,
      name: 'Org B Event',
      organization_id: 'org_BBB',
      start_date: '2026-09-01',
      end_date: '2026-09-01',
      status: 'completed',
      event_status: 'COMPLETED',
      payment_status: 'PAID',
      event_price: 1400.0,
      paid_amount: 1400.0,
      event_currency: 'MYR',
    } as any);

    await generateEventInvoice(evOrgA, undefined, { bypassEmail: true });
    await generateEventInvoice(evOrgB, undefined, { bypassEmail: true });

    const invoicesA = await listInvoicesByOrganization('org_AAA');
    const invoicesB = await listInvoicesByOrganization('org_BBB');

    expect(invoicesA.length).toBe(1);
    expect(invoicesA[0].organization_id).toBe('org_AAA');

    expect(invoicesB.length).toBe(1);
    expect(invoicesB[0].organization_id).toBe('org_BBB');
  });

  // 13. Developer admin pagination & retrieval
  it('13. retrieves all invoices with filtering for developer admins', async () => {
    const ev1 = 'ev_dev_list_1';
    const ev2 = 'ev_dev_list_2';
    localEventsCache.set(ev1, {
      id: ev1,
      name: 'Dev Event 1',
      organization_id: 'org_dev_1',
      start_date: '2026-09-01',
      end_date: '2026-09-01',
      status: 'completed',
      event_status: 'COMPLETED',
      payment_status: 'PAID',
      event_price: 1400.0,
      paid_amount: 1400.0,
      event_currency: 'MYR',
    } as any);
    localEventsCache.set(ev2, {
      id: ev2,
      name: 'Dev Event 2',
      organization_id: 'org_dev_2',
      start_date: '2026-09-01',
      end_date: '2026-09-01',
      status: 'completed',
      event_status: 'COMPLETED',
      payment_status: 'PAID',
      event_price: 1400.0,
      paid_amount: 1400.0,
      event_currency: 'MYR',
    } as any);

    await generateEventInvoice(ev1, undefined, { bypassEmail: true });
    await generateEventInvoice(ev2, undefined, { bypassEmail: true });

    const list = await listAllInvoicesForDeveloper({ page: 1, pageSize: 10 });
    expect(list.data.length).toBeGreaterThanOrEqual(2);
    expect(list.pagination.totalPages).toBeGreaterThanOrEqual(1);
  });
});
