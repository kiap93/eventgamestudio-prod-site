/**
 * Invoice Email Notification Template
 *
 * Dedicated transactional mailer sent to customer organization owners upon
 * automatic invoice generation following event completion.
 * Styled in the official pure white B2B corporate palette (#FFFFFF, #172B4D, #334155).
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
  const symbol = currency === 'MYR' ? 'RM ' : currency === 'USD' ? '$' : currency === 'SGD' ? 'S$' : `${currency} `;
  const num = Number(amount) || 0;
  return `${symbol}${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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
  const isPartiallyPaid = status === 'partially_paid' || (amountPaid > 0 && outstandingBalance > 0);

  const statusBadge = isPaid
    ? 'PAID'
    : isPartiallyPaid
    ? 'PARTIALLY PAID'
    : status === 'overdue'
    ? 'OVERDUE'
    : 'UNPAID';

  const badgeBg = isPaid ? '#DCFCE7' : isPartiallyPaid ? '#FEF3C7' : '#FEE2E2';
  const badgeBorder = isPaid ? '#BBF7D0' : isPartiallyPaid ? '#FDE68A' : '#FECACA';
  const badgeText = isPaid ? '#166534' : isPartiallyPaid ? '#92400E' : '#991B1B';

  const subject = isPaid
    ? `Invoice Paid: ${invoiceNumber} - ${eventName} | Event Game Studio`
    : `Invoice Issued: ${invoiceNumber} (${formatMoney(outstandingBalance, currency)} due) - ${eventName} | Event Game Studio`;

  const recipientGreeting = customerName?.trim() ? `Hello ${customerName.trim()},` : `Hello ${organizationName},`;

  const text = `${recipientGreeting}

An official tax invoice has been generated for your event "${eventName}" with Event Game Studio.

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
    ? 'Thank you for choosing EventGameStudio. This invoice has been settled in full.'
    : `Please remit the outstanding balance of ${formatMoney(outstandingBalance, currency)} by ${dueDate}.`
}

View and download your official invoice PDF securely here:
${viewUrl}

If you have any questions regarding this invoice, please contact our support team at eventgamestudio@gmail.com.

Thank you for choosing EventGameStudio.
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
<body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #334155;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f8fafc; padding: 32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width: 600px; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
          <!-- Header -->
          <tr>
            <td style="padding: 32px 32px 24px; border-bottom: 1px solid #e2e8f0; background-color: #ffffff;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td>
                    <h1 style="margin: 0; font-size: 18px; font-weight: 800; color: #172b4d; letter-spacing: -0.3px;">
                      EVENTGAMESTUDIO
                    </h1>
                    <p style="margin: 4px 0 0; font-size: 12px; color: #64748b; font-weight: 500;">
                      Interactive Event Gaming Solutions
                    </p>
                  </td>
                  <td align="right" valign="top">
                    <span style="display: inline-block; padding: 4px 10px; border-radius: 6px; font-size: 10px; font-weight: 700; letter-spacing: 0.5px; background-color: ${badgeBg}; color: ${badgeText}; border: 1px solid ${badgeBorder}; text-transform: uppercase;">
                      ${statusBadge}
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Content Body -->
          <tr>
            <td style="padding: 32px; background-color: #ffffff;">
              <p style="margin: 0 0 16px; font-size: 14px; color: #172b4d; font-weight: 600;">
                ${escapeHtml(recipientGreeting)}
              </p>
              <p style="margin: 0 0 24px; font-size: 13px; line-height: 1.6; color: #334155;">
                Your event <strong style="color: #172b4d;">"${escapeHtml(eventName)}"</strong> has concluded, and your official tax invoice <strong style="color: #172b4d;">${escapeHtml(invoiceNumber)}</strong> is now ready.
              </p>

              <!-- 4-Column Metadata Info Card -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; margin-bottom: 24px;">
                <tr>
                  <td style="padding: 16px;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                      <tr>
                        <td style="padding-bottom: 10px; font-size: 11px; color: #64748b; text-transform: uppercase; font-weight: 700;">
                          Invoice Number
                        </td>
                        <td align="right" style="padding-bottom: 10px; font-size: 12px; font-weight: 700; color: #172b4d; font-family: monospace;">
                          ${escapeHtml(invoiceNumber)}
                        </td>
                      </tr>
                      <tr>
                        <td style="padding-bottom: 10px; font-size: 11px; color: #64748b; text-transform: uppercase; font-weight: 700;">
                          Issue Date
                        </td>
                        <td align="right" style="padding-bottom: 10px; font-size: 12px; color: #334155;">
                          ${escapeHtml(issueDate)}
                        </td>
                      </tr>
                      <tr>
                        <td style="padding-bottom: 10px; font-size: 11px; color: #64748b; text-transform: uppercase; font-weight: 700;">
                          Due Date
                        </td>
                        <td align="right" style="padding-bottom: 10px; font-size: 12px; color: #334155;">
                          ${escapeHtml(dueDate)}
                        </td>
                      </tr>
                      <tr>
                        <td style="padding-bottom: 10px; font-size: 11px; color: #64748b; text-transform: uppercase; font-weight: 700;">
                          Total Amount
                        </td>
                        <td align="right" style="padding-bottom: 10px; font-size: 12px; font-weight: 600; color: #172b4d;">
                          ${formatMoney(totalAmount, currency)}
                        </td>
                      </tr>
                      <tr>
                        <td style="padding-bottom: 10px; font-size: 11px; color: #64748b; text-transform: uppercase; font-weight: 700;">
                          Payments Received
                        </td>
                        <td align="right" style="padding-bottom: 10px; font-size: 12px; font-weight: 600; color: #065f46;">
                          ${formatMoney(amountPaid, currency)}
                        </td>
                      </tr>
                      <tr style="border-top: 1px solid #e2e8f0;">
                        <td style="padding-top: 10px; font-size: 12px; font-weight: 800; color: #172b4d;">
                          Balance Due
                        </td>
                        <td align="right" style="padding-top: 10px; font-size: 14px; font-weight: 900; color: ${isPaid ? '#172b4d' : '#92400e'};">
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
                    <a href="${escapeHtml(viewUrl)}" style="display: inline-block; padding: 12px 24px; background-color: #172b4d; color: #ffffff; font-size: 12px; font-weight: 700; text-decoration: none; border-radius: 8px; text-transform: uppercase; letter-spacing: 0.5px;">
                      View &amp; Download Invoice PDF
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin: 0; font-size: 12px; line-height: 1.6; color: #64748b; text-align: center;">
                ${
                  isPaid
                    ? 'Thank you for choosing EventGameStudio for your interactive activation!'
                    : `Please ensure the remaining balance is settled by ${escapeHtml(dueDate)}.`
                }
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 24px 32px; background-color: #f8fafc; border-top: 1px solid #e2e8f0; text-align: center;">
              <p style="margin: 0 0 6px; font-size: 12px; font-weight: 700; color: #172b4d;">
                Interactive Event Gaming Solutions
              </p>
              <p style="margin: 0 0 4px; font-size: 11px; color: #64748b;">
                Website: eventgamestudio.com &bull; Email: eventgamestudio@gmail.com
              </p>
              <p style="margin: 8px 0 0; font-size: 11px; color: #64748b; border-top: 1px solid #e2e8f0; padding-top: 8px;">
                Payment verified and settled via platform wallet. Thank you for choosing EventGameStudio.
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
