/**
 * Email Template for Invitation Email Verification
 * Sent via Resend when an invited user chooses "Continue with Email".
 */

export interface InvitationVerificationEmailParams {
  organizationName: string;
  email: string;
  role: string;
  code: string;
  verificationUrl: string;
  expiryMinutes?: number;
}

export function generateInvitationVerificationEmailTemplate(params: {
  organizationName: string;
  email: string;
  role: string;
  code: string;
  verificationUrl: string;
  expiryMinutes?: number;
}): { subject: string; html: string; text: string } {
  const expiry = params.expiryMinutes || 15;
  const roleDisplay = (params.role || 'member').toUpperCase();
  const subject = `Your verification code to join ${params.organizationName} - Event Game Studio`;

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #020617; color: #f8fafc; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 30px auto; background-color: #0f172a; border: 1px solid #1e293b; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5); }
    .header { padding: 32px 32px 24px; text-align: center; border-bottom: 1px solid #1e293b; background: linear-gradient(180deg, rgba(245, 158, 11, 0.08) 0%, rgba(15, 23, 42, 0) 100%); }
    .brand { font-size: 20px; font-weight: 800; color: #f59e0b; text-transform: uppercase; letter-spacing: 0.05em; }
    .content { padding: 32px; font-size: 15px; line-height: 1.6; color: #cbd5e1; }
    .title { font-size: 20px; font-weight: 700; color: #ffffff; margin-top: 0; margin-bottom: 16px; }
    .code-box { text-align: center; margin: 28px 0; }
    .code { display: inline-block; background-color: #020617; border: 2px solid #f59e0b; border-radius: 12px; padding: 14px 28px; font-family: 'Courier New', Courier, monospace; font-size: 32px; font-weight: 800; letter-spacing: 6px; color: #f59e0b; }
    .badge { display: inline-block; background-color: rgba(245, 158, 11, 0.15); border: 1px solid rgba(245, 158, 11, 0.3); color: #f59e0b; font-weight: 700; font-size: 12px; padding: 2px 8px; border-radius: 6px; text-transform: uppercase; }
    .btn-container { text-align: center; margin: 24px 0 12px; }
    .btn { display: inline-block; background-color: #f59e0b; color: #020617 !important; font-weight: 700; font-size: 14px; padding: 12px 28px; border-radius: 10px; text-decoration: none; }
    .fallback-url { margin-top: 24px; padding: 16px; background-color: #020617; border: 1px solid #1e293b; border-radius: 8px; font-family: monospace; font-size: 11px; word-break: break-all; color: #94a3b8; }
    .footer { padding: 24px 32px; background-color: #090d16; border-top: 1px solid #1e293b; font-size: 12px; color: #64748b; text-align: center; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="brand">Event Game Studio</div>
    </div>
    <div class="content">
      <h1 class="title">Verify your email to accept invitation</h1>
      <p>You have been invited to join <strong>${params.organizationName}</strong> as <span class="badge">${roleDisplay}</span> on Event Game Studio.</p>
      <p>To verify ownership of <strong>${params.email}</strong>, enter the 6-digit verification code below on the invitation page:</p>
      
      <div class="code-box">
        <div class="code">${params.code}</div>
      </div>

      <p style="font-size: 13px; color: #94a3b8; text-align: center;">This code will expire in ${expiry} minutes and can only be used once.</p>

      <div class="btn-container">
        <a href="${params.verificationUrl}" class="btn" target="_blank" rel="noopener noreferrer">Verify &amp; Accept Invitation</a>
      </div>

      <div class="fallback-url">
        Or copy and paste this direct verification link into your browser:<br>
        <a href="${params.verificationUrl}" style="color: #f59e0b; text-decoration: underline;">${params.verificationUrl}</a>
      </div>

      <p style="font-size: 12px; color: #64748b; margin-top: 24px;">If you did not expect an invitation to join ${params.organizationName}, you can safely disregard this email.</p>
    </div>
    <div class="footer">
      &copy; ${new Date().getFullYear()} Event Game Studio. All rights reserved.<br>
      Automated invitation delivery via Resend.
    </div>
  </div>
</body>
</html>
`.trim();

  const text = `
Event Game Studio - Invitation Verification Code

You have been invited to join ${params.organizationName} as ${roleDisplay} on Event Game Studio.

Your 6-digit verification code is:
${params.code}

Enter this code on the invitation page to verify ownership of ${params.email} and activate your membership.

This code will expire in ${expiry} minutes and can only be used once.

Direct verification link:
${params.verificationUrl}

If you did not expect an invitation to join ${params.organizationName}, you can safely disregard this email.
`.trim();

  return { subject, html, text };
}
