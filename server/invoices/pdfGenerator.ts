/**
 * Pure TypeScript ISO 32000 (PDF 1.4) Generator for EventGameStudio Invoices
 *
 * Official B2B Tax Invoice Template:
 * - Pure white background (#FFFFFF) across all pages
 * - Light slate container border (#CBD5E1) and subtle dividers (#E2E8F0)
 * - Corporate dark navy headings (#172B4D)
 * - Slate body typography (#334155) and muted secondary labels (#64748B)
 * - Header: Left company details, Right INVOICE, Invoice No. & compact payment status badge
 * - Bill To panel (#F8FAFC) on left with right-aligned Issue Date & Due Date
 * - "DESCRIPTION OF SERVICES" section with itemized game activation and event breakdown
 * - Dynamic Totals: Total Amount, Payments Received, Balance Due (green for zero balance)
 * - Exact Two-Section Footer:
 *   Left: "Payment verified and settled via platform wallet." / "Thank you for choosing EventGameStudio."
 *   Right: "Interactive Event Gaming Solutions" / "Website: eventgamestudio.com" / "Email: eventgamestudio@gmail.com"
 * - Multi-page pagination support with repeating headers and "Page X of Y"
 *
 * Zero external binary dependencies: runs seamlessly in Cloudflare Workers and Node.js.
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

/**
 * Escapes characters for PDF literal strings while normalizing Unicode punctuation
 * to valid WinAnsi / ASCII representations (e.g. em-dash, quotes, bullets).
 */
export function escapePdfString(str: string): string {
  if (!str) return '';
  return str
    .replace(/[\u2014\u2015]/g, ' - ') // em-dash
    .replace(/[\u2012\u2013]/g, '-')   // en-dash
    .replace(/[\u2018\u2019]/g, "'")   // curly single quotes
    .replace(/[\u201C\u201D]/g, '"')   // curly double quotes
    .replace(/[\u2022\u00B7]/g, ' - ') // bullet / middle dot
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/[\r\n\t]/g, ' ');
}

export function formatCurrencyAmount(amount: number, currency: string): string {
  const symbol = currency === 'MYR' ? 'RM ' : currency === 'USD' ? '$' : currency === 'SGD' ? 'S$' : `${currency} `;
  const num = Number(amount) || 0;
  return `${symbol}${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function wrapText(text: string, maxChars: number): string[] {
  if (!text) return [];
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    if (!currentLine) {
      currentLine = word;
    } else if ((currentLine + ' ' + word).length <= maxChars) {
      currentLine += ' ' + word;
    } else {
      lines.push(currentLine);
      currentLine = word;
    }
  }
  if (currentLine) {
    lines.push(currentLine);
  }
  return lines;
}

// Multi-page command stream interface
export interface PageContext {
  streams: string[];
  rect: (x: number, y: number, w: number, h: number, fill?: boolean, stroke?: boolean) => void;
  setFillColor: (r: number, g: number, b: number) => void;
  setStrokeColor: (r: number, g: number, b: number) => void;
  setLineWidth: (w: number) => void;
  line: (x1: number, y1: number, x2: number, y2: number) => void;
  text: (
    str: string,
    x: number,
    y: number,
    font?: '/F1' | '/F2',
    size?: number,
    r?: number,
    g?: number,
    b?: number
  ) => void;
  rightText: (
    str: string,
    rightX: number,
    y: number,
    font?: '/F1' | '/F2',
    size?: number,
    r?: number,
    g?: number,
    b?: number
  ) => void;
}

/**
 * Builds a vector-rendered ISO 32000 (PDF 1.4) document for official B2B invoices.
 * Implements a strict, consistent vertical layout tracking system that prevents text collisions,
 * accounts for line heights, padding, margins, section gaps, and wrapped descriptions,
 * while reserving sufficient space for footers and paginating cleanly.
 */
export function generateInvoicePdf(data: InvoicePdfData): Uint8Array {
  // Page geometry: Standard A4 portrait (595.28 x 841.89 points)
  const PAGE_WIDTH = 595.28;
  const PAGE_HEIGHT = 841.89;
  const MARGIN_LEFT = 40;
  const MARGIN_RIGHT = 40;
  const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT; // 515.28

  // Layout Boundaries & Clearance
  const PAGE_TOP_MARGIN = 42;
  const FOOTER_RESERVED_HEIGHT = 65; // Footer occupies y = 18..56
  const MIN_CONTENT_BOTTOM_Y = 75;   // Safe minimum baseline on any content page (19 pt above footer divider)

  // Color constants (RGB normalized 0.0 - 1.0)
  const COLOR_WHITE = [1.0, 1.0, 1.0];
  const COLOR_NAVY_HEADING = [0.090, 0.169, 0.302]; // #172B4D
  const COLOR_SLATE_BODY = [0.200, 0.255, 0.333];   // #334155
  const COLOR_SLATE_MUTED = [0.392, 0.455, 0.545];  // #64748B
  const COLOR_BORDER_SLATE = [0.796, 0.835, 0.882]; // #CBD5E1
  const COLOR_DIVIDER = [0.886, 0.910, 0.941];      // #E2E8F0
  const COLOR_PANEL_BG = [0.973, 0.980, 0.988];     // #F8FAFC
  const COLOR_GREEN_PAID = [0.086, 0.396, 0.204];   // #166534

  // Status colors
  const statusUpper = (data.status || 'UNPAID').toUpperCase().replace('_', ' ');
  const isPaid = statusUpper === 'PAID' || data.outstanding_balance <= 0;
  const isPartiallyPaid = statusUpper === 'PARTIALLY PAID' || (data.amount_paid > 0 && data.outstanding_balance > 0);

  // Exact colors: PAID: light green background #DCFCE7, dark green text #166534
  const STATUS_BG = isPaid
    ? [0.863, 0.988, 0.906] // #DCFCE7
    : isPartiallyPaid
    ? [0.996, 0.953, 0.780] // #FEF3C7
    : [0.996, 0.886, 0.886]; // #FEE2E2

  const STATUS_BORDER = isPaid
    ? [0.733, 0.969, 0.816] // #BBF7D0
    : isPartiallyPaid
    ? [0.992, 0.902, 0.541] // #FDE68A
    : [0.996, 0.792, 0.792]; // #FECACA

  const STATUS_TEXT = isPaid
    ? [0.086, 0.396, 0.204] // #166534
    : isPartiallyPaid
    ? [0.573, 0.251, 0.055] // #92400E
    : [0.600, 0.106, 0.106]; // #991B1B

  function createPageContext(): PageContext {
    const streams: string[] = [];

    const setFillColor = (r: number, g: number, b: number) => {
      streams.push(`${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)} rg`);
    };

    const setStrokeColor = (r: number, g: number, b: number) => {
      streams.push(`${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)} RG`);
    };

    const setLineWidth = (w: number) => {
      streams.push(`${w.toFixed(2)} w`);
    };

    const rect = (x: number, y: number, w: number, h: number, fill = false, stroke = false) => {
      let cmd = `${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re`;
      if (fill && stroke) cmd += ' B';
      else if (fill) cmd += ' f';
      else if (stroke) cmd += ' S';
      streams.push(cmd);
    };

    const line = (x1: number, y1: number, x2: number, y2: number) => {
      streams.push(`${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S`);
    };

    const text = (
      str: string,
      x: number,
      y: number,
      font: '/F1' | '/F2' = '/F1',
      size = 9,
      r = COLOR_SLATE_BODY[0],
      g = COLOR_SLATE_BODY[1],
      b = COLOR_SLATE_BODY[2]
    ) => {
      setFillColor(r, g, b);
      streams.push(`BT ${font} ${size} Tf ${x.toFixed(2)} ${y.toFixed(2)} Td (${escapePdfString(str)}) Tj ET`);
    };

    const rightText = (
      str: string,
      rightX: number,
      y: number,
      font: '/F1' | '/F2' = '/F1',
      size = 9,
      r = COLOR_SLATE_BODY[0],
      g = COLOR_SLATE_BODY[1],
      b = COLOR_SLATE_BODY[2]
    ) => {
      const approxWidth = str.length * (size * 0.52);
      const startX = rightX - approxWidth;
      text(str, startX, y, font, size, r, g, b);
    };

    // Initialize full page pure white background (#FFFFFF)
    setFillColor(COLOR_WHITE[0], COLOR_WHITE[1], COLOR_WHITE[2]);
    rect(0, 0, PAGE_WIDTH, PAGE_HEIGHT, true, false);

    return {
      streams,
      rect,
      setFillColor,
      setStrokeColor,
      setLineWidth,
      line,
      text,
      rightText,
    };
  }

  // Pre-calculate line items
  const rawItems = Array.isArray(data.line_items) && data.line_items.length > 0
    ? [...data.line_items]
    : [
        {
          description: `${data.event_details?.game_name || 'Interactive Game'} Activation License (${data.event_details?.duration_days || 1} Calendar Day License)`,
          quantity: 1,
          unit_price: data.subtotal,
          total_price: data.subtotal,
        },
      ];

  // If welcome credit was applied, ensure it appears as an itemized credit entry
  if (data.welcome_credit_amount && data.welcome_credit_amount > 0) {
    const hasWelcomeCredit = rawItems.some(i => i.description.toLowerCase().includes('welcome credit'));
    if (!hasWelcomeCredit) {
      rawItems.push({
        description: 'Applied Promotional Welcome Credit (One-time Owner Bonus)',
        quantity: 1,
        unit_price: -data.welcome_credit_amount,
        total_price: -data.welcome_credit_amount,
      });
    }
  }

  // Calculate table rows with wrapped descriptions and dynamic heights
  interface PreparedRow {
    titleLines: string[];
    subtitleLines?: string[];
    quantity: string;
    unitPrice: string;
    totalPrice: string;
    isCredit: boolean;
    rowHeight: number;
    titleLineHeight: number;
    subtitleLineHeight: number;
    paddingTop: number;
    paddingBottom: number;
  }

  const preparedRows: PreparedRow[] = rawItems.map((item, index) => {
    const isCredit = item.total_price < 0;
    let subtitle: string | undefined = undefined;

    // Add event activation context to the primary game item
    if (index === 0 && data.event_details?.event_name) {
      const startStr = data.event_details.start_date || '';
      const endStr = data.event_details.end_date || '';
      const dateRange = startStr && endStr ? ` (${startStr} - ${endStr})` : '';
      subtitle = `Event: "${data.event_details.event_name}" - Duration: ${data.event_details.duration_days || 1} Day(s)${dateRange}`;
    }

    const titleLines = wrapText(item.description, 48);
    const subtitleLines = subtitle ? wrapText(subtitle, 56) : undefined;

    const titleLineHeight = 11;
    const subtitleLineHeight = 10;
    const paddingTop = 6;
    const paddingBottom = 6;

    const titleHeight = titleLines.length * titleLineHeight;
    const subtitleHeight = subtitleLines ? (2 + subtitleLines.length * subtitleLineHeight) : 0;
    const rowHeight = paddingTop + titleHeight + subtitleHeight + paddingBottom;

    return {
      titleLines,
      subtitleLines,
      quantity: String(item.quantity || 1),
      unitPrice: formatCurrencyAmount(item.unit_price, data.currency),
      totalPrice: formatCurrencyAmount(item.total_price, data.currency),
      isCredit,
      rowHeight,
      titleLineHeight,
      subtitleLineHeight,
      paddingTop,
      paddingBottom,
    };
  });

  const pages: PageContext[] = [];

  /**
   * Renders the table column header bar.
   * Top line at yTop, text baseline at yTop - 12, bottom line at yTop - 18.
   * Total height: 18 pt.
   */
  const renderTableHeader = (ctx: PageContext, yTop: number) => {
    ctx.setStrokeColor(COLOR_DIVIDER[0], COLOR_DIVIDER[1], COLOR_DIVIDER[2]);
    ctx.setLineWidth(1);
    ctx.line(MARGIN_LEFT, yTop, PAGE_WIDTH - MARGIN_RIGHT, yTop);

    const textBaseline = yTop - 12;
    ctx.text('SERVICE / ITEM', MARGIN_LEFT + 4, textBaseline, '/F2', 8, COLOR_NAVY_HEADING[0], COLOR_NAVY_HEADING[1], COLOR_NAVY_HEADING[2]);
    ctx.rightText('QTY', MARGIN_LEFT + 320, textBaseline, '/F2', 8, COLOR_NAVY_HEADING[0], COLOR_NAVY_HEADING[1], COLOR_NAVY_HEADING[2]);
    ctx.rightText('UNIT PRICE', MARGIN_LEFT + 410, textBaseline, '/F2', 8, COLOR_NAVY_HEADING[0], COLOR_NAVY_HEADING[1], COLOR_NAVY_HEADING[2]);
    ctx.rightText('AMOUNT', PAGE_WIDTH - MARGIN_RIGHT - 4, textBaseline, '/F2', 8, COLOR_NAVY_HEADING[0], COLOR_NAVY_HEADING[1], COLOR_NAVY_HEADING[2]);

    ctx.line(MARGIN_LEFT, yTop - 18, PAGE_WIDTH - MARGIN_RIGHT, yTop - 18);
  };

  // -------------------------------------------------------------
  // PAGE 1 RENDERING
  // -------------------------------------------------------------
  const page1 = createPageContext();
  pages.push(page1);

  // Initialize vertical layout cursor on Page 1
  let cursorY = PAGE_HEIGHT - PAGE_TOP_MARGIN; // 799.89

  // 1. Header Section — Company Details (Left) & Invoice Info (Right)
  const headerTopY = cursorY;

  // Left Column: Company Information
  page1.text('EVENTGAMESTUDIO', MARGIN_LEFT, headerTopY - 14, '/F2', 17, COLOR_NAVY_HEADING[0], COLOR_NAVY_HEADING[1], COLOR_NAVY_HEADING[2]);
  let leftY = headerTopY - 28;

  if (data.seller_details.company_name && data.seller_details.company_name !== 'EVENTGAMESTUDIO') {
    page1.text(data.seller_details.company_name, MARGIN_LEFT, leftY, '/F1', 8.5, COLOR_SLATE_BODY[0], COLOR_SLATE_BODY[1], COLOR_SLATE_BODY[2]);
    leftY -= 11;
  }
  if (data.seller_details.registration_number) {
    page1.text(`Reg No: ${data.seller_details.registration_number}`, MARGIN_LEFT, leftY, '/F1', 8, COLOR_SLATE_MUTED[0], COLOR_SLATE_MUTED[1], COLOR_SLATE_MUTED[2]);
    leftY -= 11;
  }
  if (data.seller_details.tax_number) {
    page1.text(`Tax ID: ${data.seller_details.tax_number}`, MARGIN_LEFT, leftY, '/F1', 8, COLOR_SLATE_MUTED[0], COLOR_SLATE_MUTED[1], COLOR_SLATE_MUTED[2]);
    leftY -= 11;
  }
  if (data.seller_details.address) {
    const addrLines = wrapText(data.seller_details.address, 45);
    for (const line of addrLines.slice(0, 2)) {
      page1.text(line, MARGIN_LEFT, leftY, '/F1', 8, COLOR_SLATE_MUTED[0], COLOR_SLATE_MUTED[1], COLOR_SLATE_MUTED[2]);
      leftY -= 11;
    }
  }

  // Right Column: Invoice Information
  page1.rightText('INVOICE', PAGE_WIDTH - MARGIN_RIGHT, headerTopY - 14, '/F2', 20, COLOR_NAVY_HEADING[0], COLOR_NAVY_HEADING[1], COLOR_NAVY_HEADING[2]);
  page1.rightText('Invoice No.', PAGE_WIDTH - MARGIN_RIGHT, headerTopY - 28, '/F1', 8, COLOR_SLATE_MUTED[0], COLOR_SLATE_MUTED[1], COLOR_SLATE_MUTED[2]);
  page1.rightText(data.invoice_number, PAGE_WIDTH - MARGIN_RIGHT, headerTopY - 40, '/F2', 10, COLOR_NAVY_HEADING[0], COLOR_NAVY_HEADING[1], COLOR_NAVY_HEADING[2]);

  // Payment Status Badge (Right aligned, beneath invoice number)
  const badgeWidth = 68;
  const badgeHeight = 15;
  const badgeX = PAGE_WIDTH - MARGIN_RIGHT - badgeWidth;
  const badgeTopY = headerTopY - 48;
  const badgeBottomY = badgeTopY - badgeHeight;

  page1.setFillColor(STATUS_BG[0], STATUS_BG[1], STATUS_BG[2]);
  page1.setStrokeColor(STATUS_BORDER[0], STATUS_BORDER[1], STATUS_BORDER[2]);
  page1.setLineWidth(1);
  page1.rect(badgeX, badgeBottomY, badgeWidth, badgeHeight, true, true);
  page1.text(statusUpper, badgeX + 7, badgeBottomY + 4, '/F2', 7.5, STATUS_TEXT[0], STATUS_TEXT[1], STATUS_TEXT[2]);

  const rightY = badgeBottomY;

  // Header bottom is the lowest point reached by either left or right column
  const headerBottomY = Math.min(leftY, rightY);
  cursorY = headerBottomY - 12; // Gap before Divider 1

  // Horizontal divider 1
  page1.setStrokeColor(COLOR_BORDER_SLATE[0], COLOR_BORDER_SLATE[1], COLOR_BORDER_SLATE[2]);
  page1.setLineWidth(1);
  page1.line(MARGIN_LEFT, cursorY, PAGE_WIDTH - MARGIN_RIGHT, cursorY);
  cursorY -= 14; // Gap after Divider 1

  // 2. Bill To Panel & Invoice Dates Section
  const billToTopY = cursorY;
  const billToWidth = 310;
  const billToPadding = 10;

  // Measure customer details content height
  const customerOrg = data.customer_details.organization_name || 'Customer Organization';
  const orgLines = wrapText(customerOrg, 38);
  let custDetailsLinesCount = orgLines.length;
  if (data.customer_details.contact_name) custDetailsLinesCount++;
  if (data.customer_details.contact_email) custDetailsLinesCount++;
  if (data.customer_details.country_code) custDetailsLinesCount++;
  if (data.customer_details.billing_address) {
    const custAddrLines = wrapText(data.customer_details.billing_address, 38);
    custDetailsLinesCount += Math.min(custAddrLines.length, 2);
  }

  const panelContentHeight = 12 + 4 + custDetailsLinesCount * 12;
  const panelHeight = Math.max(76, billToPadding * 2 + panelContentHeight);

  // Draw light background panel for BILL TO (#F8FAFC with #E2E8F0 border)
  page1.setFillColor(COLOR_PANEL_BG[0], COLOR_PANEL_BG[1], COLOR_PANEL_BG[2]);
  page1.setStrokeColor(COLOR_DIVIDER[0], COLOR_DIVIDER[1], COLOR_DIVIDER[2]);
  page1.setLineWidth(1);
  page1.rect(MARGIN_LEFT, billToTopY - panelHeight, billToWidth, panelHeight, true, true);

  // Bill To Content
  page1.text('BILL TO', MARGIN_LEFT + billToPadding, billToTopY - billToPadding - 8, '/F2', 7.5, COLOR_SLATE_MUTED[0], COLOR_SLATE_MUTED[1], COLOR_SLATE_MUTED[2]);
  let custY = billToTopY - billToPadding - 21;

  for (const orgLine of orgLines) {
    page1.text(orgLine, MARGIN_LEFT + billToPadding, custY, '/F2', 9.5, COLOR_NAVY_HEADING[0], COLOR_NAVY_HEADING[1], COLOR_NAVY_HEADING[2]);
    custY -= 12;
  }

  if (data.customer_details.contact_name) {
    page1.text(`Attn: ${data.customer_details.contact_name}`, MARGIN_LEFT + billToPadding, custY, '/F1', 8, COLOR_SLATE_BODY[0], COLOR_SLATE_BODY[1], COLOR_SLATE_BODY[2]);
    custY -= 11;
  }
  if (data.customer_details.contact_email) {
    page1.text(data.customer_details.contact_email, MARGIN_LEFT + billToPadding, custY, '/F1', 8, COLOR_SLATE_BODY[0], COLOR_SLATE_BODY[1], COLOR_SLATE_BODY[2]);
    custY -= 11;
  }
  if (data.customer_details.country_code) {
    page1.text(`Country: ${data.customer_details.country_code}`, MARGIN_LEFT + billToPadding, custY, '/F1', 8, COLOR_SLATE_BODY[0], COLOR_SLATE_BODY[1], COLOR_SLATE_BODY[2]);
    custY -= 11;
  }
  if (data.customer_details.billing_address) {
    const custAddrLines = wrapText(data.customer_details.billing_address, 38);
    for (const cal of custAddrLines.slice(0, 2)) {
      page1.text(cal, MARGIN_LEFT + billToPadding, custY, '/F1', 8, COLOR_SLATE_BODY[0], COLOR_SLATE_BODY[1], COLOR_SLATE_BODY[2]);
      custY -= 11;
    }
  }

  // Right Side: Invoice Dates (Right-aligned, aligned with top of Bill To box)
  const issueDateStr = (data.issue_date || '').slice(0, 10);
  const dueDateStr = (data.due_date || '').slice(0, 10);

  page1.rightText('ISSUE DATE', PAGE_WIDTH - MARGIN_RIGHT, billToTopY - 14, '/F2', 7.5, COLOR_SLATE_MUTED[0], COLOR_SLATE_MUTED[1], COLOR_SLATE_MUTED[2]);
  page1.rightText(issueDateStr || '-', PAGE_WIDTH - MARGIN_RIGHT, billToTopY - 27, '/F2', 9.5, COLOR_NAVY_HEADING[0], COLOR_NAVY_HEADING[1], COLOR_NAVY_HEADING[2]);

  page1.rightText('DUE DATE', PAGE_WIDTH - MARGIN_RIGHT, billToTopY - 45, '/F2', 7.5, COLOR_SLATE_MUTED[0], COLOR_SLATE_MUTED[1], COLOR_SLATE_MUTED[2]);
  page1.rightText(dueDateStr || '-', PAGE_WIDTH - MARGIN_RIGHT, billToTopY - 58, '/F2', 9.5, COLOR_NAVY_HEADING[0], COLOR_NAVY_HEADING[1], COLOR_NAVY_HEADING[2]);

  // Advance cursor below Bill To Panel
  cursorY = billToTopY - panelHeight - 12; // Gap before Divider 2

  // Horizontal divider 2
  page1.setStrokeColor(COLOR_BORDER_SLATE[0], COLOR_BORDER_SLATE[1], COLOR_BORDER_SLATE[2]);
  page1.setLineWidth(1);
  page1.line(MARGIN_LEFT, cursorY, PAGE_WIDTH - MARGIN_RIGHT, cursorY);
  cursorY -= 14; // Gap after Divider 2

  // 3. Description of Services Section Heading
  // Explicitly allocate space for the heading and separate it cleanly from the table header
  const servicesHeadingBaseline = cursorY - 7;
  page1.text('DESCRIPTION OF SERVICES', MARGIN_LEFT, servicesHeadingBaseline, '/F2', 8.5, COLOR_NAVY_HEADING[0], COLOR_NAVY_HEADING[1], COLOR_NAVY_HEADING[2]);

  // Vertical separation: advance cursor completely below the heading text before table starts
  cursorY = servicesHeadingBaseline - 14; // 14 pt separation between heading baseline and table top line

  // Render Table Header on Page 1
  renderTableHeader(page1, cursorY);
  cursorY -= 18; // Table header height
  cursorY -= 6;  // Gap before first line item

  // 4. Line Items Rendering with Multi-Line Wrapping & Dynamic Height Tracking
  // Reserve space on Page 1 for Totals (~120 pt) + Footer clearance (~75 pt) = 195 pt
  const bottomThresholdPage1 = 195;
  let currentPage = page1;
  let itemIndex = 0;

  while (itemIndex < preparedRows.length) {
    const row = preparedRows[itemIndex];

    // Check if row fits on current page
    const minThreshold = currentPage === page1 ? bottomThresholdPage1 : MIN_CONTENT_BOTTOM_Y;
    if (cursorY - row.rowHeight < minThreshold) {
      // Create a continuation page
      const newPage = createPageContext();
      pages.push(newPage);
      currentPage = newPage;

      // Continuation Header
      const contHeaderBaseline = PAGE_HEIGHT - PAGE_TOP_MARGIN - 10;
      newPage.text('EVENTGAMESTUDIO', MARGIN_LEFT, contHeaderBaseline, '/F2', 12, COLOR_NAVY_HEADING[0], COLOR_NAVY_HEADING[1], COLOR_NAVY_HEADING[2]);
      newPage.rightText(`Invoice ${data.invoice_number} (Continued)`, PAGE_WIDTH - MARGIN_RIGHT, contHeaderBaseline, '/F1', 9, COLOR_SLATE_MUTED[0], COLOR_SLATE_MUTED[1], COLOR_SLATE_MUTED[2]);

      // Table header on continuation page
      const contTableTop = contHeaderBaseline - 18;
      renderTableHeader(newPage, contTableTop);
      cursorY = contTableTop - 18 - 6;
    }

    // Render Row
    const rowTop = cursorY;
    const firstLineBaseline = rowTop - row.paddingTop - 7;

    // Render First Title Line
    currentPage.text(
      row.titleLines[0],
      MARGIN_LEFT + 4,
      firstLineBaseline,
      '/F2',
      8.5,
      row.isCredit ? STATUS_TEXT[0] : COLOR_NAVY_HEADING[0],
      row.isCredit ? STATUS_TEXT[1] : COLOR_NAVY_HEADING[1],
      row.isCredit ? STATUS_TEXT[2] : COLOR_NAVY_HEADING[2]
    );

    // Render Quantity, Unit Price, Amount (aligned with first title line)
    currentPage.rightText(row.quantity, MARGIN_LEFT + 320, firstLineBaseline, '/F1', 8.5, COLOR_SLATE_BODY[0], COLOR_SLATE_BODY[1], COLOR_SLATE_BODY[2]);
    currentPage.rightText(row.unitPrice, MARGIN_LEFT + 410, firstLineBaseline, '/F1', 8.5, COLOR_SLATE_BODY[0], COLOR_SLATE_BODY[1], COLOR_SLATE_BODY[2]);
    currentPage.rightText(
      row.totalPrice,
      PAGE_WIDTH - MARGIN_RIGHT - 4,
      firstLineBaseline,
      '/F2',
      8.5,
      row.isCredit ? STATUS_TEXT[0] : COLOR_NAVY_HEADING[0],
      row.isCredit ? STATUS_TEXT[1] : COLOR_NAVY_HEADING[1],
      row.isCredit ? STATUS_TEXT[2] : COLOR_NAVY_HEADING[2]
    );

    // Render subsequent wrapped title lines (if any)
    for (let k = 1; k < row.titleLines.length; k++) {
      const lineBaseline = firstLineBaseline - k * row.titleLineHeight;
      currentPage.text(
        row.titleLines[k],
        MARGIN_LEFT + 4,
        lineBaseline,
        '/F2',
        8.5,
        row.isCredit ? STATUS_TEXT[0] : COLOR_NAVY_HEADING[0],
        row.isCredit ? STATUS_TEXT[1] : COLOR_NAVY_HEADING[1],
        row.isCredit ? STATUS_TEXT[2] : COLOR_NAVY_HEADING[2]
      );
    }

    // Render subtitle lines (if any)
    if (row.subtitleLines && row.subtitleLines.length > 0) {
      const subtitleStartBaseline = firstLineBaseline - (row.titleLines.length - 1) * row.titleLineHeight - 12;
      for (let s = 0; s < row.subtitleLines.length; s++) {
        const subBaseline = subtitleStartBaseline - s * row.subtitleLineHeight;
        currentPage.text(
          row.subtitleLines[s],
          MARGIN_LEFT + 4,
          subBaseline,
          '/F1',
          7.5,
          COLOR_SLATE_MUTED[0],
          COLOR_SLATE_MUTED[1],
          COLOR_SLATE_MUTED[2]
        );
      }
    }

    // Row divider line
    const rowBottom = rowTop - row.rowHeight;
    currentPage.setStrokeColor(COLOR_DIVIDER[0], COLOR_DIVIDER[1], COLOR_DIVIDER[2]);
    currentPage.setLineWidth(0.5);
    currentPage.line(MARGIN_LEFT, rowBottom, PAGE_WIDTH - MARGIN_RIGHT, rowBottom);

    cursorY = rowBottom - 2; // Advance cursor for next row
    itemIndex++;
  }

  // -------------------------------------------------------------
  // 5. INVOICE TOTALS & FINANCIAL SUMMARY
  // -------------------------------------------------------------
  const summaryBoxWidth = 240;
  const totalsBoxX = PAGE_WIDTH - MARGIN_RIGHT - summaryBoxWidth;

  // Calculate required summary height dynamically
  let requiredSummaryHeight = 14 + 18 + 16 + 18 + 14; // divider + total + payments + balance + padding
  if (data.subtotal && data.subtotal !== data.total_amount) requiredSummaryHeight += 15;
  if (data.discount_amount > 0) requiredSummaryHeight += 15;

  if (cursorY - requiredSummaryHeight < MIN_CONTENT_BOTTOM_Y) {
    const summaryPage = createPageContext();
    pages.push(summaryPage);
    currentPage = summaryPage;

    // Continuation Header on summary page
    const contHeaderBaseline = PAGE_HEIGHT - PAGE_TOP_MARGIN - 10;
    summaryPage.text('EVENTGAMESTUDIO', MARGIN_LEFT, contHeaderBaseline, '/F2', 12, COLOR_NAVY_HEADING[0], COLOR_NAVY_HEADING[1], COLOR_NAVY_HEADING[2]);
    summaryPage.rightText(`Invoice ${data.invoice_number} (Summary)`, PAGE_WIDTH - MARGIN_RIGHT, contHeaderBaseline, '/F1', 9, COLOR_SLATE_MUTED[0], COLOR_SLATE_MUTED[1], COLOR_SLATE_MUTED[2]);
    cursorY = contHeaderBaseline - 25;
  }

  // Divider above Totals
  cursorY -= 8;
  currentPage.setStrokeColor(COLOR_BORDER_SLATE[0], COLOR_BORDER_SLATE[1], COLOR_BORDER_SLATE[2]);
  currentPage.setLineWidth(1);
  currentPage.line(MARGIN_LEFT, cursorY, PAGE_WIDTH - MARGIN_RIGHT, cursorY);
  cursorY -= 14;

  let sumY = cursorY;

  if (data.subtotal && data.subtotal !== data.total_amount) {
    currentPage.text('Subtotal:', totalsBoxX, sumY, '/F1', 8.5, COLOR_SLATE_MUTED[0], COLOR_SLATE_MUTED[1], COLOR_SLATE_MUTED[2]);
    currentPage.rightText(formatCurrencyAmount(data.subtotal, data.currency), PAGE_WIDTH - MARGIN_RIGHT - 4, sumY, '/F1', 8.5, COLOR_SLATE_BODY[0], COLOR_SLATE_BODY[1], COLOR_SLATE_BODY[2]);
    sumY -= 15;
  }

  if (data.discount_amount > 0) {
    currentPage.text('Applied Credits / Discount:', totalsBoxX, sumY, '/F1', 8.5, STATUS_TEXT[0], STATUS_TEXT[1], STATUS_TEXT[2]);
    currentPage.rightText(`-${formatCurrencyAmount(data.discount_amount, data.currency)}`, PAGE_WIDTH - MARGIN_RIGHT - 4, sumY, '/F2', 8.5, STATUS_TEXT[0], STATUS_TEXT[1], STATUS_TEXT[2]);
    sumY -= 15;
  }

  // Row: Total Amount (prominent corporate dark navy)
  currentPage.text('Total Amount', totalsBoxX, sumY, '/F2', 10.5, COLOR_NAVY_HEADING[0], COLOR_NAVY_HEADING[1], COLOR_NAVY_HEADING[2]);
  currentPage.rightText(formatCurrencyAmount(data.total_amount, data.currency), PAGE_WIDTH - MARGIN_RIGHT - 4, sumY, '/F2', 11, COLOR_NAVY_HEADING[0], COLOR_NAVY_HEADING[1], COLOR_NAVY_HEADING[2]);
  sumY -= 17;

  // Row: Payments Received
  currentPage.text('Payments Received', totalsBoxX, sumY, '/F1', 9, COLOR_SLATE_MUTED[0], COLOR_SLATE_MUTED[1], COLOR_SLATE_MUTED[2]);
  currentPage.rightText(formatCurrencyAmount(data.amount_paid, data.currency), PAGE_WIDTH - MARGIN_RIGHT - 4, sumY, '/F1', 9, COLOR_SLATE_BODY[0], COLOR_SLATE_BODY[1], COLOR_SLATE_BODY[2]);
  sumY -= 16;

  // Row: Balance Due (bold, green for zero balance, alert red otherwise)
  const isZeroBalance = data.outstanding_balance <= 0;
  const balanceColor = isZeroBalance ? COLOR_GREEN_PAID : STATUS_TEXT;

  currentPage.text('Balance Due', totalsBoxX, sumY, '/F2', 10, balanceColor[0], balanceColor[1], balanceColor[2]);
  currentPage.rightText(
    formatCurrencyAmount(data.outstanding_balance, data.currency),
    PAGE_WIDTH - MARGIN_RIGHT - 4,
    sumY,
    '/F2',
    11,
    balanceColor[0],
    balanceColor[1],
    balanceColor[2]
  );

  // -------------------------------------------------------------
  // 6. FOOTER — EXACT LATEST FORMAT (Rendered on every page)
  // -------------------------------------------------------------
  const totalPages = pages.length;
  pages.forEach((p, idx) => {
    const pageNum = idx + 1;
    const footerDividerY = 56;
    const footerTextY = 42;

    // Horizontal divider above footer
    p.setStrokeColor(COLOR_BORDER_SLATE[0], COLOR_BORDER_SLATE[1], COLOR_BORDER_SLATE[2]);
    p.setLineWidth(1);
    p.line(MARGIN_LEFT, footerDividerY, PAGE_WIDTH - MARGIN_RIGHT, footerDividerY);

    // Left Footer Section (Left-aligned both lines)
    p.text('Payment verified and settled via platform wallet.', MARGIN_LEFT, footerTextY, '/F1', 8, COLOR_SLATE_MUTED[0], COLOR_SLATE_MUTED[1], COLOR_SLATE_MUTED[2]);
    p.text('Thank you for choosing EventGameStudio.', MARGIN_LEFT, footerTextY - 11, '/F1', 8, COLOR_SLATE_MUTED[0], COLOR_SLATE_MUTED[1], COLOR_SLATE_MUTED[2]);

    // Right Footer Section (Right-aligned all three lines)
    p.rightText('Interactive Event Gaming Solutions', PAGE_WIDTH - MARGIN_RIGHT, footerTextY, '/F2', 8, COLOR_NAVY_HEADING[0], COLOR_NAVY_HEADING[1], COLOR_NAVY_HEADING[2]);
    p.rightText('Website: eventgamestudio.com', PAGE_WIDTH - MARGIN_RIGHT, footerTextY - 10, '/F1', 7.5, COLOR_SLATE_MUTED[0], COLOR_SLATE_MUTED[1], COLOR_SLATE_MUTED[2]);
    p.rightText('Email: eventgamestudio@gmail.com', PAGE_WIDTH - MARGIN_RIGHT, footerTextY - 20, '/F1', 7.5, COLOR_SLATE_MUTED[0], COLOR_SLATE_MUTED[1], COLOR_SLATE_MUTED[2]);

    // Page indicator (compact centered)
    if (totalPages > 1) {
      p.text(`Page ${pageNum} of ${totalPages}`, MARGIN_LEFT + CONTENT_WIDTH / 2 - 20, footerTextY - 20, '/F1', 7.5, COLOR_SLATE_MUTED[0], COLOR_SLATE_MUTED[1], COLOR_SLATE_MUTED[2]);
    }
  });

  // -------------------------------------------------------------
  // ISO 32000 PDF 1.4 MULTI-PAGE OBJECT ASSEMBLY
  // -------------------------------------------------------------
  const pageObjRefs: string[] = [];
  const pageObjects: string[] = [];
  const streamObjects: string[] = [];

  for (let i = 0; i < totalPages; i++) {
    const pageId = 4 + i * 2 + 1;
    const streamId = 4 + i * 2 + 2;
    pageObjRefs.push(`${pageId} 0 R`);

    const pageContentStream = pages[i].streams.join('\n');
    const streamByteLength = Buffer.byteLength(pageContentStream, 'utf-8');

    pageObjects.push(
      `${pageId} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH.toFixed(2)} ${PAGE_HEIGHT.toFixed(2)}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${streamId} 0 R >>\nendobj\n`
    );

    streamObjects.push(
      `${streamId} 0 obj\n<< /Length ${streamByteLength} >>\nstream\n${pageContentStream}\nendstream\nendobj\n`
    );
  }

  const catalogObj = `1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`;
  const pagesContainerObj = `2 0 obj\n<< /Type /Pages /Kids [${pageObjRefs.join(' ')}] /Count ${totalPages} >>\nendobj\n`;
  const fontF1Obj = `3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\nendobj\n`;
  const fontF2Obj = `4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>\nendobj\n`;

  const allObjects: string[] = [
    '', // index 0 unused
    catalogObj,
    pagesContainerObj,
    fontF1Obj,
    fontF2Obj,
  ];

  for (let i = 0; i < totalPages; i++) {
    allObjects.push(pageObjects[i]);
    allObjects.push(streamObjects[i]);
  }

  const totalObjectCount = 4 + totalPages * 2;
  const offsets: number[] = [0];
  let currentOffset = 0;

  const headerBytes = '%PDF-1.4\n';
  currentOffset += Buffer.byteLength(headerBytes, 'utf-8');

  for (let i = 1; i <= totalObjectCount; i++) {
    offsets.push(currentOffset);
    currentOffset += Buffer.byteLength(allObjects[i], 'utf-8');
  }

  const startXref = currentOffset;
  let xref = `xref\n0 ${totalObjectCount + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= totalObjectCount; i++) {
    const offStr = String(offsets[i]).padStart(10, '0');
    xref += `${offStr} 00000 n \n`;
  }

  const trailer = `trailer\n<< /Size ${totalObjectCount + 1} /Root 1 0 R >>\nstartxref\n${startXref}\n%%EOF\n`;

  const fullPdfString = headerBytes + allObjects.slice(1).join('') + xref + trailer;
  return new TextEncoder().encode(fullPdfString);
}
