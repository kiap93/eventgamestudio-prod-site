import { describe, it, expect } from 'bun:test';
import { generateInvoicePdf, InvoicePdfData } from './pdfGenerator.js';

describe('Official B2B Invoice PDF Generator (Pure White Redesign)', () => {
  const sampleInvoice: InvoicePdfData = {
    invoice_number: 'INV-2026-00042',
    issue_date: '2026-09-02T10:00:00Z',
    due_date: '2026-09-16T10:00:00Z',
    status: 'paid',
    currency: 'MYR',
    subtotal: 1900.0,
    discount_amount: 800.0,
    welcome_credit_amount: 800.0,
    tax_rate: 0.0,
    tax_amount: 0.0,
    total_amount: 1100.0,
    amount_paid: 1100.0,
    outstanding_balance: 0.0,
    seller_details: {
      company_name: 'Event Game Studio Sdn. Bhd.',
      registration_number: '202601009876 (1509876-V)',
      tax_number: 'W10-2601-98765432',
      email: 'eventgamestudio@gmail.com',
      phone: '+60 11-3678 3717',
      address: 'Level 28, The Exchange 106, Lingkaran TRX, 55188 Kuala Lumpur, Malaysia',
      website: 'https://eventgamestudio.com',
    },
    customer_details: {
      organization_name: 'Acme Corporation Sdn. Bhd.',
      contact_name: 'Sarah Tan',
      contact_email: 'sarah@acme.com',
      country_code: 'MY',
      billing_address: 'Suite 12-05, Menara Shell, 211 Jalan Tun Sambanthan, 50470 Kuala Lumpur',
    },
    event_details: {
      event_name: 'Acme Annual Gala 2026',
      game_name: 'Catch The Brand',
      duration_days: 2,
      start_date: '2026-09-01',
      end_date: '2026-09-02',
      timezone: 'Asia/Singapore',
    },
    line_items: [
      {
        description: 'Catch The Brand — Interactive Event Activation License (2 Calendar Days)',
        quantity: 1,
        unit_price: 1900.0,
        total_price: 1900.0,
      },
      {
        description: 'Applied Promotional Welcome Credit (One-time Owner Bonus)',
        quantity: 1,
        unit_price: -800.0,
        total_price: -800.0,
      },
    ],
  };

  it('1. generates a valid ISO 32000 (PDF 1.4) binary document', () => {
    const bytes = generateInvoicePdf(sampleInvoice);
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBeGreaterThan(1000);

    const pdfString = Buffer.from(bytes).toString('utf-8');
    expect(pdfString.startsWith('%PDF-1.4')).toBe(true);
    expect(pdfString.includes('%%EOF')).toBe(true);
    expect(pdfString.includes('/Type /Catalog')).toBe(true);
    expect(pdfString.includes('/Type /Pages')).toBe(true);
  });

  it('2. paints pure white background (#FFFFFF) on the page canvas', () => {
    const bytes = generateInvoicePdf(sampleInvoice);
    const pdfString = Buffer.from(bytes).toString('utf-8');

    // Color 1.000 1.000 1.000 rg is pure white
    expect(pdfString).toContain('1.000 1.000 1.000 rg');
    // Dark slate background #0b1329 must NOT be present
    expect(pdfString).not.toContain('0.043 0.075 0.161');
  });

  it('3. uses mandatory corporate dark navy (#172B4D) for headings', () => {
    const bytes = generateInvoicePdf(sampleInvoice);
    const pdfString = Buffer.from(bytes).toString('utf-8');

    // 23/255=0.090, 43/255=0.169, 77/255=0.302
    expect(pdfString).toContain('0.090 0.169 0.302 rg');
    expect(pdfString).toContain('EVENTGAMESTUDIO');
    expect(pdfString).toContain('INVOICE');
  });

  it('4. uses slate body text (#334155) and muted labels (#64748B)', () => {
    const bytes = generateInvoicePdf(sampleInvoice);
    const pdfString = Buffer.from(bytes).toString('utf-8');

    // Slate body: 51/255=0.200, 65/255=0.255, 85/255=0.333
    expect(pdfString).toContain('0.200 0.255 0.333 rg');
    // Slate muted: 100/255=0.392, 116/255=0.455, 139/255=0.545
    expect(pdfString).toContain('0.392 0.455 0.545 rg');
  });

  it('5. contains exact latest two-section footer and description of services', () => {
    const bytes = generateInvoicePdf(sampleInvoice);
    const pdfString = Buffer.from(bytes).toString('utf-8');

    // Left footer lines
    expect(pdfString).toContain('Payment verified and settled via platform wallet.');
    expect(pdfString).toContain('Thank you for choosing EventGameStudio.');

    // Right footer lines
    expect(pdfString).toContain('Interactive Event Gaming Solutions');
    expect(pdfString).toContain('Website: eventgamestudio.com');
    expect(pdfString).toContain('Email: eventgamestudio@gmail.com');

    // Section 4 Heading
    expect(pdfString).toContain('DESCRIPTION OF SERVICES');
    expect(pdfString).toContain('BILL TO');
    expect(pdfString).toContain('ISSUE DATE');
    expect(pdfString).toContain('DUE DATE');
  });

  it('6. formats currency symbols correctly (MYR -> RM, SGD -> S$, USD -> $)', () => {
    const myrBytes = generateInvoicePdf({ ...sampleInvoice, currency: 'MYR' });
    const myrString = Buffer.from(myrBytes).toString('utf-8');
    expect(myrString).toContain('RM 1,900.00');

    const sgdBytes = generateInvoicePdf({ ...sampleInvoice, currency: 'SGD' });
    const sgdString = Buffer.from(sgdBytes).toString('utf-8');
    expect(sgdString).toContain('S$1,900.00');

    const usdBytes = generateInvoicePdf({ ...sampleInvoice, currency: 'USD' });
    const usdString = Buffer.from(usdBytes).toString('utf-8');
    expect(usdString).toContain('$1,900.00');
  });

  it('7. cleanly paginates to multiple pages when many line items are present', () => {
    const manyItems = [];
    for (let i = 1; i <= 20; i++) {
      manyItems.push({
        description: `Custom Branded Activation Addon #${i} — Interactive Display Module`,
        quantity: 1,
        unit_price: 150.0,
        total_price: 150.0,
      });
    }

    const multiPageInvoice: InvoicePdfData = {
      ...sampleInvoice,
      line_items: manyItems,
      subtotal: 3000.0,
      total_amount: 3000.0,
      amount_paid: 3000.0,
      outstanding_balance: 0.0,
    };

    const bytes = generateInvoicePdf(multiPageInvoice);
    const pdfString = Buffer.from(bytes).toString('utf-8');

    // Must have /Count 2 or more
    expect(pdfString).toMatch(/\/Count [2-9]/);
    expect(pdfString).toContain('Page 1 of');
    expect(pdfString).toContain('Continued');
  });
});
