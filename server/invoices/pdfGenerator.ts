/**
 * Pure TypeScript PDF Generator for EventGameStudio Invoices
 *
 * Designed to run seamlessly in both Node.js/Express and Cloudflare Workers (edge V8 isolates)
 * without any external binary dependencies, headless browsers, or native canvas compilation.
 *
 * Produces compliant, standards-based ISO 32000 (PDF 1.4) documents using Standard 14
 * Type 1 Helvetica fonts.
 */

export interface InvoicePdfData {
  invoice_number: string;
  issue_date: string;
  due_date: string;
  status: string;
  currency: string;
  subtotal: number;
  discount_amount: number;
  welcome_credit_amount?: number;
  tax_rate?: number;
  tax_amount?: number;
  total_amount: number;
  amount_paid: number;
  outstanding_balance: number;
  seller_details: {
    company_name?: string;
    registration_number?: string | null;
    tax_number?: string | null;
    email?: string;
    phone?: string;
    address?: string;
    website?: string;
    [key: string]: any;
  };
  customer_details: {
    organization_name?: string;
    contact_email?: string | null;
    contact_name?: string | null;
    country_code?: string | null;
    billing_address?: string | null;
    [key: string]: any;
  };
  event_details: {
    event_name?: string;
    game_name?: string;
    duration_days?: number | null;
    start_date?: string | null;
    end_date?: string | null;
    timezone?: string | null;
    [key: string]: any;
  };
  line_items: Array<{
    description: string;
    quantity: number;
    unit_price: number;
    total_price: number;
  }>;
  notes?: string | null;
}

function escapePdfString(str: string): string {
  if (!str) return '';
  return str
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/[\r\n\t]/g, ' ');
}

function formatCurrencyAmount(amount: number, currency: string): string {
  const symbol = currency === 'MYR' ? 'RM' : currency === 'USD' ? '$' : currency === 'SGD' ? 'S$' : `${currency} `;
  const num = Number(amount) || 0;
  return `${symbol}${num.toFixed(2)}`;
}

/**
 * Builds a vector-rendered PDF document representing the official event invoice.
 * Returns raw bytes as Uint8Array (application/pdf).
 */
export function generateInvoicePdf(data: InvoicePdfData): Uint8Array {
  // Page geometry: Standard A4 (595.28 x 841.89 points)
  const PAGE_WIDTH = 595.28;
  const PAGE_HEIGHT = 841.89;
  const MARGIN_LEFT = 40;
  const MARGIN_RIGHT = 40;
  const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT; // 515.28

  const streams: string[] = [];

  // Helper stream commands
  const rect = (x: number, y: number, w: number, h: number, fill = false, stroke = false) => {
    let cmd = `${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re`;
    if (fill && stroke) cmd += ' B';
    else if (fill) cmd += ' f';
    else if (stroke) cmd += ' S';
    streams.push(cmd);
  };

  const setFillColor = (r: number, g: number, b: number) => {
    streams.push(`${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)} rg`);
  };

  const setStrokeColor = (r: number, g: number, b: number) => {
    streams.push(`${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)} RG`);
  };

  const setLineWidth = (w: number) => {
    streams.push(`${w.toFixed(2)} w`);
  };

  const line = (x1: number, y1: number, x2: number, y2: number) => {
    streams.push(`${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S`);
  };

  const text = (
    str: string,
    x: number,
    y: number,
    font: '/F1' | '/F2' = '/F1',
    size = 10,
    r = 0.95,
    g = 0.96,
    b = 0.98
  ) => {
    setFillColor(r, g, b);
    streams.push(`BT ${font} ${size} Tf ${x.toFixed(2)} ${y.toFixed(2)} Td (${escapePdfString(str)}) Tj ET`);
  };

  // 1. Full Page Background: Deep slate/dark theme
  setFillColor(0.043, 0.075, 0.161); // #0b1329
  rect(0, 0, PAGE_WIDTH, PAGE_HEIGHT, true, false);

  // 2. Top Header Accent Banner (Amber Gradient approximation)
  setFillColor(0.961, 0.620, 0.043); // #f59e0b
  rect(0, PAGE_HEIGHT - 6, PAGE_WIDTH, 6, true, false);

  // 3. Header Card
  const headerY = PAGE_HEIGHT - 75;
  setFillColor(0.059, 0.090, 0.165); // #0f172a
  setStrokeColor(0.118, 0.161, 0.231); // #1e293b
  setLineWidth(1);
  rect(MARGIN_LEFT, headerY - 10, CONTENT_WIDTH, 65, true, true);

  // Brand Name & Subtitle
  text('EVENT GAME STUDIO', MARGIN_LEFT + 15, headerY + 30, '/F2', 16, 0.984, 0.749, 0.141); // #fbbf24
  text('Interactive Event Mini-Games & Brand Activations', MARGIN_LEFT + 15, headerY + 14, '/F1', 9, 0.580, 0.639, 0.722); // #94a3b8
  text('https://eventgamestudio.com', MARGIN_LEFT + 15, headerY + 0, '/F1', 8, 0.392, 0.455, 0.545);

  // INVOICE Title on right side
  text('INVOICE', PAGE_WIDTH - MARGIN_RIGHT - 110, headerY + 28, '/F2', 20, 1.0, 1.0, 1.0);

  // Status Badge
  const statusUpper = (data.status || 'UNPAID').toUpperCase().replace('_', ' ');
  const isPaid = statusUpper === 'PAID' || data.outstanding_balance <= 0;
  if (isPaid) {
    setFillColor(0.063, 0.725, 0.506); // green #10b981
    rect(PAGE_WIDTH - MARGIN_RIGHT - 110, headerY + 6, 95, 16, true, false);
    text('PAID', PAGE_WIDTH - MARGIN_RIGHT - 82, headerY + 11, '/F2', 9, 0.043, 0.075, 0.161);
  } else {
    setFillColor(0.961, 0.620, 0.043); // amber #f59e0b
    rect(PAGE_WIDTH - MARGIN_RIGHT - 110, headerY + 6, 95, 16, true, false);
    text(statusUpper, PAGE_WIDTH - MARGIN_RIGHT - 105, headerY + 11, '/F2', 8, 0.043, 0.075, 0.161);
  }

  // 4. Two-Column Metadata Box: Billed To & Invoice Details
  const infoBoxY = headerY - 130;
  setFillColor(0.059, 0.090, 0.165);
  setStrokeColor(0.118, 0.161, 0.231);
  rect(MARGIN_LEFT, infoBoxY, CONTENT_WIDTH, 110, true, true);

  // Left Column: Customer / Billed To
  const col1X = MARGIN_LEFT + 15;
  text('BILLED TO (CUSTOMER):', col1X, infoBoxY + 92, '/F2', 8, 0.392, 0.455, 0.545);
  text(data.customer_details.organization_name || 'Valued Customer', col1X, infoBoxY + 76, '/F2', 12, 1.0, 1.0, 1.0);
  if (data.customer_details.contact_name) {
    text(`Attn: ${data.customer_details.contact_name}`, col1X, infoBoxY + 60, '/F1', 9, 0.796, 0.835, 0.882);
  }
  if (data.customer_details.contact_email) {
    text(`Email: ${data.customer_details.contact_email}`, col1X, infoBoxY + 46, '/F1', 9, 0.796, 0.835, 0.882);
  }
  const country = data.customer_details.country_code ? `Country: ${data.customer_details.country_code}` : '';
  if (country) {
    text(country, col1X, infoBoxY + 32, '/F1', 8, 0.580, 0.639, 0.722);
  }

  // Divider Line
  setStrokeColor(0.118, 0.161, 0.231);
  line(PAGE_WIDTH / 2, infoBoxY + 10, PAGE_WIDTH / 2, infoBoxY + 100);

  // Right Column: Invoice Reference & Dates
  const col2X = PAGE_WIDTH / 2 + 15;
  text('INVOICE INFORMATION:', col2X, infoBoxY + 92, '/F2', 8, 0.392, 0.455, 0.545);
  text('Invoice Number:', col2X, infoBoxY + 76, '/F1', 9, 0.580, 0.639, 0.722);
  text(data.invoice_number, col2X + 85, infoBoxY + 76, '/F2', 10, 0.984, 0.749, 0.141);

  text('Issue Date:', col2X, infoBoxY + 60, '/F1', 9, 0.580, 0.639, 0.722);
  text(data.issue_date, col2X + 85, infoBoxY + 60, '/F1', 9, 0.95, 0.96, 0.98);

  text('Due Date:', col2X, infoBoxY + 44, '/F1', 9, 0.580, 0.639, 0.722);
  text(data.due_date, col2X + 85, infoBoxY + 44, '/F1', 9, 0.95, 0.96, 0.98);

  text('Currency:', col2X, infoBoxY + 28, '/F1', 9, 0.580, 0.639, 0.722);
  text(data.currency, col2X + 85, infoBoxY + 28, '/F2', 9, 0.95, 0.96, 0.98);

  // 5. Event Context Banner
  const eventBannerY = infoBoxY - 55;
  setFillColor(0.043, 0.086, 0.180);
  setStrokeColor(0.118, 0.161, 0.231);
  rect(MARGIN_LEFT, eventBannerY, CONTENT_WIDTH, 45, true, true);

  text('EVENT ACTIVATION DETAILS:', MARGIN_LEFT + 15, eventBannerY + 30, '/F2', 8, 0.392, 0.455, 0.545);
  const evTitle = data.event_details.event_name ? `Event: "${data.event_details.event_name}"` : 'Event Activation';
  text(evTitle, MARGIN_LEFT + 15, eventBannerY + 14, '/F2', 10, 1.0, 1.0, 1.0);

  const durationText = `${data.event_details.duration_days || 1} Calendar Day(s) (${data.event_details.start_date || 'N/A'} - ${data.event_details.end_date || 'N/A'})`;
  text(durationText, PAGE_WIDTH - MARGIN_RIGHT - 240, eventBannerY + 14, '/F1', 8, 0.796, 0.835, 0.882);

  // 6. Itemized Table
  const tableTopY = eventBannerY - 25;
  // Table Header row
  setFillColor(0.082, 0.125, 0.212); // darker header
  rect(MARGIN_LEFT, tableTopY - 20, CONTENT_WIDTH, 20, true, false);

  text('ITEM / DESCRIPTION', MARGIN_LEFT + 12, tableTopY - 14, '/F2', 8, 0.580, 0.639, 0.722);
  text('QTY', PAGE_WIDTH - MARGIN_RIGHT - 180, tableTopY - 14, '/F2', 8, 0.580, 0.639, 0.722);
  text('UNIT PRICE', PAGE_WIDTH - MARGIN_RIGHT - 120, tableTopY - 14, '/F2', 8, 0.580, 0.639, 0.722);
  text('AMOUNT', PAGE_WIDTH - MARGIN_RIGHT - 50, tableTopY - 14, '/F2', 8, 0.580, 0.639, 0.722);

  let currentY = tableTopY - 45;

  // Render Line Items
  const items = Array.isArray(data.line_items) && data.line_items.length > 0
    ? data.line_items
    : [
        {
          description: `${data.event_details.game_name || 'Interactive Game'} Activation (${data.event_details.duration_days || 1} Day Licensing)`,
          quantity: 1,
          unit_price: data.subtotal,
          total_price: data.subtotal,
        },
      ];

  for (const item of items) {
    setFillColor(0.059, 0.090, 0.165);
    rect(MARGIN_LEFT, currentY - 5, CONTENT_WIDTH, 24, true, false);

    text(item.description, MARGIN_LEFT + 12, currentY + 3, '/F1', 9, 0.95, 0.96, 0.98);
    text(String(item.quantity), PAGE_WIDTH - MARGIN_RIGHT - 175, currentY + 3, '/F1', 9, 0.796, 0.835, 0.882);
    text(formatCurrencyAmount(item.unit_price, data.currency), PAGE_WIDTH - MARGIN_RIGHT - 125, currentY + 3, '/F1', 9, 0.796, 0.835, 0.882);
    text(formatCurrencyAmount(item.total_price, data.currency), PAGE_WIDTH - MARGIN_RIGHT - 55, currentY + 3, '/F2', 9, 1.0, 1.0, 1.0);

    setStrokeColor(0.118, 0.161, 0.231);
    line(MARGIN_LEFT, currentY - 6, PAGE_WIDTH - MARGIN_RIGHT, currentY - 6);
    currentY -= 26;
  }

  // Welcome Credit deduction line if applied
  if (data.welcome_credit_amount && data.welcome_credit_amount > 0) {
    setFillColor(0.059, 0.090, 0.165);
    rect(MARGIN_LEFT, currentY - 5, CONTENT_WIDTH, 24, true, false);

    text('Promotional Welcome Credit Applied (One-time Owner Bonus)', MARGIN_LEFT + 12, currentY + 3, '/F1', 9, 0.165, 0.741, 0.612);
    text('1', PAGE_WIDTH - MARGIN_RIGHT - 175, currentY + 3, '/F1', 9, 0.796, 0.835, 0.882);
    text(`-${formatCurrencyAmount(data.welcome_credit_amount, data.currency)}`, PAGE_WIDTH - MARGIN_RIGHT - 125, currentY + 3, '/F1', 9, 0.165, 0.741, 0.612);
    text(`-${formatCurrencyAmount(data.welcome_credit_amount, data.currency)}`, PAGE_WIDTH - MARGIN_RIGHT - 55, currentY + 3, '/F2', 9, 0.165, 0.741, 0.612);

    setStrokeColor(0.118, 0.161, 0.231);
    line(MARGIN_LEFT, currentY - 6, PAGE_WIDTH - MARGIN_RIGHT, currentY - 6);
    currentY -= 26;
  }

  // 7. Totals & Reconciliation Box
  const totalsY = currentY - 10;
  const totalsBoxWidth = 230;
  const totalsBoxX = PAGE_WIDTH - MARGIN_RIGHT - totalsBoxWidth;

  setFillColor(0.059, 0.090, 0.165);
  setStrokeColor(0.118, 0.161, 0.231);
  rect(totalsBoxX, totalsY - 110, totalsBoxWidth, 120, true, true);

  // Subtotal
  text('Subtotal:', totalsBoxX + 15, totalsY - 5, '/F1', 9, 0.580, 0.639, 0.722);
  text(formatCurrencyAmount(data.subtotal, data.currency), totalsBoxX + 140, totalsY - 5, '/F1', 9, 0.95, 0.96, 0.98);

  // Discounts
  if (data.discount_amount > 0) {
    text('Discounts / Credits:', totalsBoxX + 15, totalsY - 22, '/F1', 9, 0.165, 0.741, 0.612);
    text(`-${formatCurrencyAmount(data.discount_amount, data.currency)}`, totalsBoxX + 140, totalsY - 22, '/F1', 9, 0.165, 0.741, 0.612);
  }

  // Tax
  if (data.tax_amount && data.tax_amount > 0) {
    text(`Tax (${(data.tax_rate ? data.tax_rate * 100 : 0).toFixed(1)}%):`, totalsBoxX + 15, totalsY - 39, '/F1', 9, 0.580, 0.639, 0.722);
    text(formatCurrencyAmount(data.tax_amount, data.currency), totalsBoxX + 140, totalsY - 39, '/F1', 9, 0.95, 0.96, 0.98);
  }

  // Total Amount
  setStrokeColor(0.118, 0.161, 0.231);
  line(totalsBoxX + 10, totalsY - 50, totalsBoxX + totalsBoxWidth - 10, totalsY - 50);

  text('Invoice Total:', totalsBoxX + 15, totalsY - 65, '/F2', 10, 1.0, 1.0, 1.0);
  text(formatCurrencyAmount(data.total_amount, data.currency), totalsBoxX + 135, totalsY - 65, '/F2', 10, 1.0, 1.0, 1.0);

  // Payments Received
  text('Payments Received:', totalsBoxX + 15, totalsY - 82, '/F1', 9, 0.063, 0.725, 0.506);
  text(formatCurrencyAmount(data.amount_paid, data.currency), totalsBoxX + 140, totalsY - 82, '/F2', 9, 0.063, 0.725, 0.506);

  // Balance Due
  const balColor = isPaid ? [0.063, 0.725, 0.506] : [0.961, 0.620, 0.043];
  text('Balance Due:', totalsBoxX + 15, totalsY - 100, '/F2', 11, balColor[0], balColor[1], balColor[2]);
  text(formatCurrencyAmount(data.outstanding_balance, data.currency), totalsBoxX + 130, totalsY - 100, '/F2', 12, balColor[0], balColor[1], balColor[2]);

  // Payment Instructions Box (Left of Totals)
  const instrWidth = CONTENT_WIDTH - totalsBoxWidth - 15;
  const instrX = MARGIN_LEFT;
  setFillColor(0.043, 0.086, 0.180);
  setStrokeColor(0.118, 0.161, 0.231);
  rect(instrX, totalsY - 110, instrWidth, 120, true, true);

  text('PAYMENT & SELLER DETAILS:', instrX + 15, totalsY - 5, '/F2', 8, 0.392, 0.455, 0.545);
  text(data.seller_details.company_name || 'Event Game Studio', instrX + 15, totalsY - 22, '/F2', 9, 1.0, 1.0, 1.0);
  if (data.seller_details.registration_number) {
    text(`Reg No: ${data.seller_details.registration_number}`, instrX + 15, totalsY - 36, '/F1', 8, 0.580, 0.639, 0.722);
  }
  text(`Email: ${data.seller_details.email || 'eventgamestudio@gmail.com'}`, instrX + 15, totalsY - 50, '/F1', 8, 0.580, 0.639, 0.722);
  text(`Support: ${data.seller_details.phone || '+60 11-3678 3717'}`, instrX + 15, totalsY - 64, '/F1', 8, 0.580, 0.639, 0.722);
  text(`Location: ${data.seller_details.address || 'Kuala Lumpur, Malaysia (UTC+8)'}`, instrX + 15, totalsY - 78, '/F1', 8, 0.580, 0.639, 0.722);

  if (isPaid) {
    text('Settlement: This invoice has been verified and settled in full.', instrX + 15, totalsY - 98, '/F2', 8, 0.063, 0.725, 0.506);
  } else {
    text('Settlement: Please remit outstanding balance to your account.', instrX + 15, totalsY - 98, '/F2', 8, 0.961, 0.620, 0.043);
  }

  // 8. Footer
  const footerY = 35;
  setStrokeColor(0.118, 0.161, 0.231);
  line(MARGIN_LEFT, footerY + 18, PAGE_WIDTH - MARGIN_RIGHT, footerY + 18);

  text('Event Game Studio — Interactive Branded Event Mini-Games • https://eventgamestudio.com', MARGIN_LEFT, footerY + 5, '/F1', 8, 0.392, 0.455, 0.545);
  text('Page 1 of 1', PAGE_WIDTH - MARGIN_RIGHT - 45, footerY + 5, '/F1', 8, 0.392, 0.455, 0.545);

  // Assemble Complete PDF 1.4 File Format
  const contentStream = streams.join('\n');
  const streamLength = Buffer.byteLength(contentStream, 'utf-8');

  const pdfObjects: string[] = [
    // 0: unused (standard 0 index)
    '',
    // 1: Catalog
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    // 2: Pages
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    // 3: Page
    `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH.toFixed(2)} ${PAGE_HEIGHT.toFixed(2)}] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>\nendobj\n`,
    // 4: Font F1 (Helvetica Regular)
    '4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\nendobj\n',
    // 5: Font F2 (Helvetica Bold)
    '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>\nendobj\n',
    // 6: Contents Stream
    `6 0 obj\n<< /Length ${streamLength} >>\nstream\n${contentStream}\nendstream\nendobj\n`,
  ];

  // Calculate byte offsets for Xref table
  let pdfContent = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
  const offsets: number[] = [0];

  for (let i = 1; i <= 6; i++) {
    offsets.push(Buffer.byteLength(pdfContent, 'utf-8'));
    pdfContent += pdfObjects[i];
  }

  const startXref = Buffer.byteLength(pdfContent, 'utf-8');
  let xref = 'xref\n0 7\n0000000000 65535 f \n';
  for (let i = 1; i <= 6; i++) {
    xref += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }

  const trailer = `trailer\n<< /Size 7 /Root 1 0 R >>\nstartxref\n${startXref}\n%%EOF\n`;
  pdfContent += xref + trailer;

  return new Uint8Array(Buffer.from(pdfContent, 'utf-8'));
}
