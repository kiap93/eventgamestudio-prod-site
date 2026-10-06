/**
 * Customer Invitation Email Template
 *
 * Designed for inviting prospective business customers to try EventGameStudio.
 * Subject: Invitation to Try EventGameStudio
 * Sender: Mun Jian, EventGameStudio (eventgamestudio@gmail.com)
 */

export const CUSTOMER_INVITATION_SUBJECT = 'Invitation to Try EventGameStudio';
export const SENDER_NAME = 'Mun Jian';
export const SENDER_EMAIL = 'eventgamestudio@gmail.com';
export const SENDER_DISPLAY = 'Mun Jian <eventgamestudio@gmail.com>';
export const PLATFORM_TRY_URL = 'https://eventgamestudio.com';

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export interface CustomerInvitationEmailParams {
  companyName: string;
}

export interface GeneratedEmailTemplate {
  subject: string;
  html: string;
  text: string;
}

export function generateCustomerInvitationEmail(params: CustomerInvitationEmailParams): GeneratedEmailTemplate {
  const rawCompanyName = (params.companyName || '').trim() || 'your team';
  const escapedCompanyName = escapeHtml(rawCompanyName);

  const text = `Dear Sir/Mdm,

We would like to invite ${rawCompanyName} to try EventGameStudio, an interactive game platform designed for corporate events, team activities, brand activations, and other engagement experiences.

You can try the platform directly here:

${PLATFORM_TRY_URL}

We believe EventGameStudio could be a useful addition to your existing event services, allowing you to offer interactive gaming experiences to your clients and potentially create an additional revenue opportunity.

Please feel free to try it first. If you encounter any problems, have any questions, or have suggestions, please let us know — we’d be happy to help.

We would also love to hear your feedback and explore whether EventGameStudio could fit into your upcoming events or client packages.

Best regards,

Mun Jian

EventGameStudio
Email: ${SENDER_EMAIL}`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${CUSTOMER_INVITATION_SUBJECT}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0f172a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #e2e8f0; line-height: 1.6;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #0f172a; padding: 40px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width: 600px; background-color: #1e293b; border: 1px solid #334155; border-radius: 16px; overflow: hidden; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5);">
          <!-- Header Banner -->
          <tr>
            <td style="padding: 32px 36px; background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); border-bottom: 1px solid #334155;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td>
                    <div style="display: inline-block; padding: 6px 14px; background-color: rgba(245, 158, 11, 0.15); border: 1px solid rgba(245, 158, 11, 0.35); border-radius: 9999px; font-size: 11px; font-weight: 700; color: #fbbf24; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 12px;">
                      Interactive Event Games Platform
                    </div>
                    <h1 style="margin: 0; font-size: 22px; font-weight: 800; color: #ffffff; letter-spacing: -0.02em;">
                      EventGame<span style="color: #f59e0b;">Studio</span>
                    </h1>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Main Content -->
          <tr>
            <td style="padding: 36px 36px 28px 36px; font-size: 15px; color: #cbd5e1; line-height: 1.7;">
              <p style="margin: 0 0 18px 0; font-size: 16px; font-weight: 600; color: #f8fafc;">
                Dear Sir/Mdm,
              </p>

              <p style="margin: 0 0 22px 0;">
                We would like to invite <strong style="color: #fbbf24; font-weight: 700;">${escapedCompanyName}</strong> to try <strong>EventGameStudio</strong>, an interactive game platform designed for corporate events, team activities, brand activations, and other engagement experiences.
              </p>

              <!-- CTA Card -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin: 28px 0; background-color: #0f172a; border: 1px solid #334155; border-radius: 12px;">
                <tr>
                  <td style="padding: 24px; text-align: center;">
                    <p style="margin: 0 0 16px 0; font-size: 14px; color: #94a3b8;">
                      You can try the platform directly here:
                    </p>
                    <a href="${PLATFORM_TRY_URL}" target="_blank" rel="noopener noreferrer" style="display: inline-block; padding: 12px 28px; background-color: #f59e0b; color: #0f172a; font-size: 15px; font-weight: 700; text-decoration: none; border-radius: 10px; box-shadow: 0 4px 12px rgba(245, 158, 11, 0.35);">
                      Try EventGameStudio &rarr;
                    </a>
                    <p style="margin: 14px 0 0 0; font-size: 12px; color: #64748b; font-family: monospace;">
                      <a href="${PLATFORM_TRY_URL}" target="_blank" rel="noopener noreferrer" style="color: #94a3b8; text-decoration: underline;">
                        ${PLATFORM_TRY_URL}
                      </a>
                    </p>
                  </td>
                </tr>
              </table>

              <p style="margin: 0 0 20px 0;">
                We believe EventGameStudio could be a useful addition to your existing event services, allowing you to offer interactive gaming experiences to your clients and potentially create an additional revenue opportunity.
              </p>

              <p style="margin: 0 0 20px 0;">
                Please feel free to try it first. If you encounter any problems, have any questions, or have suggestions, please let us know &mdash; we&rsquo;d be happy to help.
              </p>

              <p style="margin: 0 0 28px 0;">
                We would also love to hear your feedback and explore whether EventGameStudio could fit into your upcoming events or client packages.
              </p>

              <!-- Sign-off -->
              <div style="border-top: 1px solid #334155; padding-top: 24px; margin-top: 28px;">
                <p style="margin: 0 0 6px 0; color: #94a3b8;">Best regards,</p>
                <p style="margin: 0 0 4px 0; font-weight: 700; font-size: 16px; color: #f8fafc;">Mun Jian</p>
                <p style="margin: 0 0 4px 0; font-weight: 600; color: #f59e0b;">EventGameStudio</p>
                <p style="margin: 0; color: #94a3b8; font-size: 14px;">
                  Email: <a href="mailto:${SENDER_EMAIL}" style="color: #38bdf8; text-decoration: none;">${SENDER_EMAIL}</a>
                </p>
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 20px 36px; background-color: #0b1120; border-top: 1px solid #1e293b; text-align: center; font-size: 12px; color: #64748b;">
              <p style="margin: 0;">
                &copy; ${new Date().getFullYear()} EventGameStudio. Interactive Event Games &amp; Brand Activations.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return {
    subject: CUSTOMER_INVITATION_SUBJECT,
    html,
    text,
  };
}
