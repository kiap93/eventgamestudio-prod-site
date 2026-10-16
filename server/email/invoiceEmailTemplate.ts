/**
 * Invoice Email Notification Template
 *
 * Dedicated transactional mailer sent to customer organization owners upon
 * automatic invoice generation following event completion.
 */

export interface InvoiceEmailParams {
  invoiceNumber: string;
  customerName?: string | null;
  organizationName: string;
  eventName: string;
  currency: string;
  totalAmount: number;
  amountPaid: number;
  outstandingBalance: number;
  status: string;
  issueDate: string;
  dueDate: string;
  viewUrl: string;
}

export interface GeneratedInvoiceEmail {
  subject: string;
  html: string;
  text: string;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatMoney(amount: number, currency: string): string {
  const symbol = currency === 'MYR' ? 'RM' : currency === 'USD' ? '$' : currency === 'SGD' ? 'S$' : `${currency} `;
  return `${symbol}${amount.toFixed(2)}`;
}

export function generateInvoiceEmail(params: InvoiceEmailParams): GeneratedInvoiceEmail {
  const {
    invoiceNumber,
    customerName,
    organizationName,
    eventName,
    currency,
    totalAmount,
    amountPaid,
    outstandingBalance,
    status,
    issueDate,
    dueDate,
    viewUrl,
  } = params;

  const isPaid = status === 'paid' || outstandingBalance <= 0;
  const statusBadge = isPaid
    ? 'PAID'
    : status === 'partially_paid'
    ? 'PARTIALLY PAID'
    : status === 'overdue'
    ? 'OVERDUE'
    : 'PAYMENT DUE';

  const statusColor = isPaid ? '#10b981' : status === 'partially_paid' ? '#f59e0b' : '#ef4444';

  const subject = isPaid
    ? `Invoice Paid: ${invoiceNumber} - ${eventName} | Event Game Studio`
    : `Invoice Issued: ${invoiceNumber} (${formatMoney(outstandingBalance, currency)} due) - ${eventName} | Event Game Studio`;

  const recipientGreeting = customerName?.trim() ? `Hello ${customerName.trim()},` : `Hello ${organizationName},`;

  const text = `${recipientGreeting}

An invoice has been generated for your event "${eventName}" with Event Game Studio.

Invoice Details:
- Invoice Number: ${invoiceNumber}
- Organization: ${organizationName}
- Event Name: ${eventName}
- Issue Date: ${issueDate}
- Due Date: ${dueDate}
- Total Amount: ${formatMoney(totalAmount, currency)}
- Amount Paid: ${formatMoney(amountPaid, currency)}
- Balance Due: ${formatMoney(outstandingBalance, currency)}
- Status: ${statusBadge}

${
  isPaid
    ? 'Thank you for your payment! This invoice is fully settled.'
    : `Please settle the outstanding balance of ${formatMoney(outstandingBalance, currency)} by ${dueDate}.`
}

View and download your official invoice PDF securely here:
${viewUrl}

If you have any questions regarding this invoice, please contact our support team at eventgamestudio@gmail.com.

Best regards,
Event Game Studio Billing Team
https://eventgamestudio.com
`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0b1329; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #f1f5f9;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #0b1329; padding: 32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width: 600px; background-color: #0f172a; border: 1px solid #1e293b; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.5);">
          <!-- Top Accent Bar -->
          <tr>
            <td style="background: linear-gradient(90deg, #f59e0b, #d97706); height: 4px; line-height: 4px; font-size: 1px;">&nbsp;</td>
          </tr>

          <!-- Header -->
          <tr>
            <td style="padding: 32px 32px 24px; border-bottom: 1px solid #1e293b;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td>
                    <h1 style="margin: 0; font-size: 20px; font-weight: 800; color: #fbbf24; letter-spacing: -0.5px;">
                      EVENT GAME STUDIO
                    </h1>
                    <p style="margin: 4px 0 0; font-size: 12px; color: #94a3b8; font-weight: 500;">
                      Interactive Event Mini-Games &amp; Activations
                    </p>
                  </td>
                  <td align="right" valign="top">
                    <span style="display: inline-block; padding: 4px 12px; border-radius: 9999px; font-size: 11px; font-weight: 800; letter-spacing: 0.5px; background-color: ${statusColor}20; color: ${statusColor}; border: 1px solid ${statusColor}40;">
                      ${statusBadge}
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Content Body -->
          <tr>
            <td style="padding: 32px;">
              <p style="margin: 0 0 16px; font-size: 15px; color: #f8fafc; font-weight: 600;">
                ${escapeHtml(recipientGreeting)}
              </p>
              <p style="margin: 0 0 24px; font-size: 14px; line-height: 1.6; color: #cbd5e1;">
                Your event <strong style="color: #ffffff;">"${escapeHtml(eventName)}"</strong> has concluded, and your official invoice <strong style="color: #fbbf24;">${escapeHtml(invoiceNumber)}</strong> is now available.
              </p>

              <!-- Invoice Summary Card -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #070e1e; border: 1px solid #1e293b; border-radius: 12px; margin-bottom: 24px;">
                <tr>
                  <td style="padding: 20px;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                      <tr>
                        <td style="padding-bottom: 12px; font-size: 12px; color: #64748b; text-transform: uppercase; font-weight: 700; letter-spacing: 0.5px;">
                          Invoice Number
                        </td>
                        <td align="right" style="padding-bottom: 12px; font-size: 13px; font-weight: 700; color: #f8fafc; font-family: monospace;">
                          ${escapeHtml(invoiceNumber)}
                        </td>
                      </tr>
                      <tr>
                        <td style="padding-bottom: 12px; font-size: 12px; color: #64748b; text-transform: uppercase; font-weight: 700; letter-spacing: 0.5px;">
                          Issue Date
                        </td>
                        <td align="right" style="padding-bottom: 12px; font-size: 13px; color: #94a3b8;">
                          ${escapeHtml(issueDate)}
                        </td>
                      </tr>
                      <tr>
                        <td style="padding-bottom: 12px; font-size: 12px; color: #64748b; text-transform: uppercase; font-weight: 700; letter-spacing: 0.5px;">
                          Total Amount
                        </td>
                        <td align="right" style="padding-bottom: 12px; font-size: 13px; font-weight: 600; color: #f8fafc;">
                          ${formatMoney(totalAmount, currency)}
                        </td>
                      </tr>
                      <tr>
                        <td style="padding-bottom: 12px; font-size: 12px; color: #64748b; text-transform: uppercase; font-weight: 700; letter-spacing: 0.5px;">
                          Payments Received
                        </td>
                        <td align="right" style="padding-bottom: 12px; font-size: 13px; font-weight: 600; color: #10b981;">
                          ${formatMoney(amountPaid, currency)}
                        </td>
                      </tr>
                      <tr style="border-top: 1px solid #1e293b;">
                        <td style="padding-top: 12px; font-size: 13px; font-weight: 800; color: #fbbf24;">
                          Balance Due
                        </td>
                        <td align="right" style="padding-top: 12px; font-size: 16px; font-weight: 900; color: ${isPaid ? '#10b981' : '#f59e0b'};">
                          ${formatMoney(outstandingBalance, currency)}
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Action Button -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom: 24px;">
                <tr>
                  <td align="center">
                    <a href="${escapeHtml(viewUrl)}" style="display: inline-block; padding: 14px 28px; background-color: #f59e0b; color: #020617; font-size: 13px; font-weight: 800; text-decoration: none; border-radius: 12px; text-transform: uppercase; letter-spacing: 0.5px; box-shadow: 0 4px 12px rgba(245, 158, 11, 0.3);">
                      View &amp; Download Invoice PDF
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin: 0; font-size: 12px; line-height: 1.6; color: #64748b; text-align: center;">
                ${
                  isPaid
                    ? 'Thank you for choosing Event Game Studio for your interactive activation!'
                    : `Please ensure the remaining balance is settled by ${escapeHtml(dueDate)}.`
                }
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 24px 32px; background-color: #070e1e; border-top: 1px solid #1e293b; text-align: center;">
              <p style="margin: 0 0 6px; font-size: 11px; color: #64748b;">
                Event Game Studio &bull; Kuala Lumpur, Malaysia &bull; eventgamestudio@gmail.com
              </p>
              <p style="margin: 0; font-size: 11px; color: #475569;">
                This is an automated transactional invoice notification. Sensitive documents are protected by secure authentication.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, html, text };
}
