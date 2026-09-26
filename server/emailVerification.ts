import crypto from 'node:crypto';
import { hashToken } from './auth.js';
import {
  getGoogleMailSettings,
  sendEmailViaGmail,
  getFrontendBaseUrl,
} from './email/index.js';

export interface VerificationTokenData {
  rawToken: string;
  tokenHash: string;
  expiresAt: string;
}

export interface PasswordResetTokenData {
  rawToken: string;
  tokenHash: string;
  expiresAt: string;
}

/**
 * Generates an unguessable 256-bit cryptographically secure verification token.
 * Token expires in 24 hours.
 */
export function generateVerificationToken(expiryHours = 24): VerificationTokenData {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + expiryHours * 60 * 60 * 1000).toISOString();

  return {
    rawToken,
    tokenHash,
    expiresAt,
  };
}

/**
 * Generates an unguessable 256-bit password reset token.
 * Token expires in 1 hour.
 */
export function generatePasswordResetToken(expiryHours = 1): PasswordResetTokenData {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + expiryHours * 60 * 60 * 1000).toISOString();

  return {
    rawToken,
    tokenHash,
    expiresAt,
  };
}

/**
 * Generates email content for Email Verification.
 */
export function generateVerificationEmailTemplate(params: {
  email: string;
  verificationUrl: string;
}): { subject: string; html: string; text: string } {
  const subject = 'Verify your email address - Event Game Studio';

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
    .btn-container { text-align: center; margin: 32px 0; }
    .btn { display: inline-block; background-color: #f59e0b; color: #020617 !important; font-weight: 700; font-size: 15px; padding: 14px 32px; border-radius: 12px; text-decoration: none; transition: background-color 0.2s; }
    .fallback-url { margin-top: 24px; padding: 16px; background-color: #020617; border: 1px solid #1e293b; border-radius: 8px; font-family: monospace; font-size: 12px; word-break: break-all; color: #94a3b8; }
    .footer { padding: 24px 32px; background-color: #090d16; border-top: 1px solid #1e293b; font-size: 12px; color: #64748b; text-align: center; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="brand">Event Game Studio</div>
    </div>
    <div class="content">
      <h1 class="title">Verify your email address</h1>
      <p>Welcome to Event Game Studio! Please verify your email address to complete your registration and activate your account.</p>
      <div class="btn-container">
        <a href="${params.verificationUrl}" class="btn" target="_blank" rel="noopener noreferrer">Verify Email Address</a>
      </div>
      <p>This verification link will expire in 24 hours. If you did not create an account on Event Game Studio, please disregard this email.</p>
      <div class="fallback-url">
        If the button above does not work, copy and paste this link into your browser:<br>
        <a href="${params.verificationUrl}" style="color: #f59e0b; text-decoration: underline;">${params.verificationUrl}</a>
      </div>
    </div>
    <div class="footer">
      &copy; ${new Date().getFullYear()} Event Game Studio. All rights reserved.<br>
      This is an automated system notification.
    </div>
  </div>
</body>
</html>
`.trim();

  const text = `
Event Game Studio - Verify your email address

Welcome to Event Game Studio! Please verify your email address to complete your registration and activate your account.

Click the following link to verify your email address:
${params.verificationUrl}

This verification link will expire in 24 hours. If you did not create an account on Event Game Studio, please disregard this email.
`.trim();

  return { subject, html, text };
}

/**
 * Generates email content for Password Reset.
 */
export function generatePasswordResetEmailTemplate(params: {
  email: string;
  resetUrl: string;
}): { subject: string; html: string; text: string } {
  const subject = 'Reset your password - Event Game Studio';

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
    .btn-container { text-align: center; margin: 32px 0; }
    .btn { display: inline-block; background-color: #f59e0b; color: #020617 !important; font-weight: 700; font-size: 15px; padding: 14px 32px; border-radius: 12px; text-decoration: none; transition: background-color 0.2s; }
    .fallback-url { margin-top: 24px; padding: 16px; background-color: #020617; border: 1px solid #1e293b; border-radius: 8px; font-family: monospace; font-size: 12px; word-break: break-all; color: #94a3b8; }
    .footer { padding: 24px 32px; background-color: #090d16; border-top: 1px solid #1e293b; font-size: 12px; color: #64748b; text-align: center; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="brand">Event Game Studio</div>
    </div>
    <div class="content">
      <h1 class="title">Reset your password</h1>
      <p>We received a request to reset the password for your Event Game Studio account.</p>
      <div class="btn-container">
        <a href="${params.resetUrl}" class="btn" target="_blank" rel="noopener noreferrer">Reset Password</a>
      </div>
      <p>This password reset link will expire in 1 hour. If you did not request this reset, you can safely ignore this email; your password will remain unchanged.</p>
      <div class="fallback-url">
        If the button above does not work, copy and paste this link into your browser:<br>
        <a href="${params.resetUrl}" style="color: #f59e0b; text-decoration: underline;">${params.resetUrl}</a>
      </div>
    </div>
    <div class="footer">
      &copy; ${new Date().getFullYear()} Event Game Studio. All rights reserved.<br>
      This is an automated system notification.
    </div>
  </div>
</body>
</html>
`.trim();

  const text = `
Event Game Studio - Reset your password

We received a request to reset the password for your Event Game Studio account.

Click the following link to choose a new password:
${params.resetUrl}

This link will expire in 1 hour. If you did not request a password reset, you can safely ignore this email.
`.trim();

  return { subject, html, text };
}

/**
 * Dispatches verification email using configured Gmail integration, or logs gracefully in dev/test.
 */
export async function sendVerificationEmail(params: {
  email: string;
  rawToken: string;
  env?: Record<string, any>;
  request?: any;
}): Promise<{ sent: boolean; method: 'gmail' | 'logged' }> {
  const { email, rawToken, env, request } = params;
  const baseUrl = getFrontendBaseUrl(env, request);
  const verificationUrl = `${baseUrl}/verify-email?token=${encodeURIComponent(rawToken)}`;

  try {
    const settings = await getGoogleMailSettings(env);
    if (settings && settings.enabled && settings.refresh_token_encrypted && settings.status !== 'disconnected') {
      const template = generateVerificationEmailTemplate({ email, verificationUrl });
      await sendEmailViaGmail(
        {
          to: email,
          subject: template.subject,
          html: template.html,
          text: template.text,
          fromName: 'EventGameStudio',
        },
        env
      );
      return { sent: true, method: 'gmail' };
    }
  } catch (err: any) {
    console.error(`[Email Verification] Failed to send email via Gmail API to ${email}:`, err?.message || err);
  }

  // Graceful development / non-configured logging fallback
  console.log(`[Email Verification] Verification link for ${email}: ${verificationUrl}`);
  return { sent: true, method: 'logged' };
}

/**
 * Dispatches password reset email using configured Gmail integration, or logs gracefully in dev/test.
 */
export async function sendPasswordResetEmail(params: {
  email: string;
  rawToken: string;
  env?: Record<string, any>;
  request?: any;
}): Promise<{ sent: boolean; method: 'gmail' | 'logged' }> {
  const { email, rawToken, env, request } = params;
  const baseUrl = getFrontendBaseUrl(env, request);
  const resetUrl = `${baseUrl}/reset-password?token=${encodeURIComponent(rawToken)}`;

  try {
    const settings = await getGoogleMailSettings(env);
    if (settings && settings.enabled && settings.refresh_token_encrypted && settings.status !== 'disconnected') {
      const template = generatePasswordResetEmailTemplate({ email, resetUrl });
      await sendEmailViaGmail(
        {
          to: email,
          subject: template.subject,
          html: template.html,
          text: template.text,
          fromName: 'EventGameStudio',
        },
        env
      );
      return { sent: true, method: 'gmail' };
    }
  } catch (err: any) {
    console.error(`[Password Reset] Failed to send email via Gmail API to ${email}:`, err?.message || err);
  }

  // Graceful development / non-configured logging fallback
  console.log(`[Password Reset] Reset link for ${email}: ${resetUrl}`);
  return { sent: true, method: 'logged' };
}
