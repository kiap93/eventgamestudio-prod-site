import crypto from 'node:crypto';
import { encryptRefreshToken, decryptRefreshToken } from './encryption.js';
import {
  getGoogleMailSettings,
  saveGoogleMailSettings,
  updateGoogleMailStatus,
} from '../db/googleMailSettings.js';

/**
 * Generates a tamper-proof cryptographically signed OAuth state token.
 */
export function generateOAuthStateToken(
  userId: string,
  env?: Record<string, any>
): string {
  const procEnv = typeof process !== 'undefined' ? process.env : {};
  const secret =
    env?.JWT_SECRET ||
    procEnv.JWT_SECRET ||
    env?.GOOGLE_MAIL_TOKEN_ENCRYPTION_KEY ||
    procEnv.GOOGLE_MAIL_TOKEN_ENCRYPTION_KEY ||
    'egs-gmail-oauth-state-secret-salt';

  const timestamp = Date.now().toString();
  const nonce = crypto.randomBytes(16).toString('hex');
  const payload = `${userId}:${timestamp}:${nonce}`;
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('hex');

  return `${Buffer.from(payload).toString('base64url')}.${sig}`;
}

/**
 * Verifies the OAuth state token and checks that it was issued within the last 15 minutes.
 */
export function verifyOAuthStateToken(
  state: string,
  env?: Record<string, any>
): { valid: boolean; userId?: string; error?: string } {
  if (!state || !state.includes('.')) {
    return { valid: false, error: 'Invalid state format' };
  }

  const [payloadB64, sig] = state.split('.');
  if (!payloadB64 || !sig) {
    return { valid: false, error: 'Malformed state token' };
  }

  const procEnv = typeof process !== 'undefined' ? process.env : {};
  const secret =
    env?.JWT_SECRET ||
    procEnv.JWT_SECRET ||
    env?.GOOGLE_MAIL_TOKEN_ENCRYPTION_KEY ||
    procEnv.GOOGLE_MAIL_TOKEN_ENCRYPTION_KEY ||
    'egs-gmail-oauth-state-secret-salt';

  let payload = '';
  try {
    payload = Buffer.from(payloadB64, 'base64url').toString('utf8');
  } catch {
    return { valid: false, error: 'Invalid base64 payload in state token' };
  }

  const expectedSig = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  if (sig !== expectedSig) {
    return { valid: false, error: 'OAuth state signature mismatch (tampered state token)' };
  }

  const [userId, timestampStr] = payload.split(':');
  const timestamp = parseInt(timestampStr, 10);
  const now = Date.now();

  // 15-minute expiration
  if (isNaN(timestamp) || now - timestamp > 15 * 60 * 1000 || timestamp > now + 60 * 1000) {
    return { valid: false, error: 'OAuth state token has expired. Please try connecting again.' };
  }

  return { valid: true, userId };
}

export interface GoogleMailConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

/**
 * Returns the configured frontend web application URL (e.g. https://eventgamestudio.com)
 * used for post-OAuth redirects to the developer admin UI.
 */
export function getFrontendBaseUrl(env?: Record<string, any>): string {
  const procEnv = typeof process !== 'undefined' ? process.env : {};

  const frontendUrl =
    env?.APP_URL ||
    procEnv.APP_URL ||
    env?.FRONTEND_URL ||
    procEnv.FRONTEND_URL ||
    'https://eventgamestudio.com';

  return frontendUrl.trim().replace(/\/+$/, '');
}

/**
 * Returns the Google Mail OAuth configuration with the dedicated API Worker callback URI.
 */
export function getGoogleMailConfig(env?: Record<string, any>): GoogleMailConfig {
  const procEnv = typeof process !== 'undefined' ? process.env : {};

  const clientId =
    env?.GOOGLE_MAIL_CLIENT_ID ||
    procEnv.GOOGLE_MAIL_CLIENT_ID ||
    env?.GOOGLE_CLIENT_ID ||
    procEnv.GOOGLE_CLIENT_ID ||
    '';

  const clientSecret =
    env?.GOOGLE_MAIL_CLIENT_SECRET ||
    procEnv.GOOGLE_MAIL_CLIENT_SECRET ||
    '';

  let redirectUri =
    env?.GOOGLE_MAIL_REDIRECT_URI ||
    procEnv.GOOGLE_MAIL_REDIRECT_URI ||
    '';

  if (!redirectUri) {
    const apiBaseUrl =
      env?.API_BASE_URL ||
      procEnv.API_BASE_URL ||
      'https://eventgamestudio-api.kiap93-kmj.workers.dev';
    redirectUri = `${apiBaseUrl.trim().replace(/\/+$/, '')}/api/email/google/callback`;
  }

  return {
    clientId,
    clientSecret,
    redirectUri,
  };
}

/**
 * Builds the Google OAuth2 authorization URL to connect the platform sending Gmail account.
 * Requests scope: https://www.googleapis.com/auth/gmail.send
 */
export function buildGoogleAuthUrl(
  state: string,
  customRedirectUri?: string,
  env?: Record<string, any>
): string {
  const config = getGoogleMailConfig(env);
  const redirectUri = customRedirectUri || config.redirectUri;

  if (!config.clientId) {
    throw new Error('GOOGLE_MAIL_CLIENT_ID is not configured');
  }

  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/userinfo.email',
    access_type: 'offline',
    prompt: 'consent', // Forces Google to issue a refresh_token on every connect
    state,
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

/**
 * Exchanges Google authorization code for tokens and retrieves the connected Gmail address.
 */
export async function exchangeGoogleAuthCode(
  code: string,
  customRedirectUri?: string,
  env?: Record<string, any>
): Promise<{
  refreshToken: string;
  accessToken: string;
  email: string;
}> {
  const config = getGoogleMailConfig(env);
  const redirectUri = customRedirectUri || config.redirectUri;

  if (!config.clientId || !config.clientSecret) {
    throw new Error('GOOGLE_MAIL_CLIENT_ID and GOOGLE_MAIL_CLIENT_SECRET must be configured');
  }

  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }).toString(),
  });

  if (!tokenResponse.ok) {
    const errBody = await tokenResponse.text();
    console.error('Google token exchange error response:', tokenResponse.status, errBody);
    throw new Error(`Google OAuth token exchange failed (${tokenResponse.status}): ${errBody}`);
  }

  const tokenData = (await tokenResponse.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    token_type: string;
    id_token?: string;
  };

  if (!tokenData.access_token) {
    throw new Error('Failed to retrieve access token from Google');
  }

  // Fetch the connected email address from Google
  let connectedEmail = '';
  try {
    const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
      },
    });
    if (userInfoRes.ok) {
      const userInfo = (await userInfoRes.json()) as { email?: string };
      if (userInfo.email) {
        connectedEmail = userInfo.email.trim().toLowerCase();
      }
    }
  } catch (err) {
    console.warn('Notice retrieving userinfo, attempting Gmail profile fallback:', err);
  }

  if (!connectedEmail) {
    try {
      const profileRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
        },
      });
      if (profileRes.ok) {
        const profile = (await profileRes.json()) as { emailAddress?: string };
        if (profile.emailAddress) {
          connectedEmail = profile.emailAddress.trim().toLowerCase();
        }
      }
    } catch (err) {
      console.warn('Notice retrieving Gmail profile:', err);
    }
  }

  if (!connectedEmail) {
    throw new Error('Failed to determine connected Gmail address');
  }

  if (!tokenData.refresh_token) {
    // If user previously authorized without prompt=consent, check if we have existing refresh token
    const existing = await getGoogleMailSettings(env);
    if (existing && existing.refresh_token_encrypted) {
      return {
        refreshToken: await decryptRefreshToken(existing.refresh_token_encrypted, undefined, env),
        accessToken: tokenData.access_token,
        email: connectedEmail,
      };
    }
    throw new Error('Google did not return a refresh token. Please re-authorize with prompt=consent.');
  }

  return {
    refreshToken: tokenData.refresh_token,
    accessToken: tokenData.access_token,
    email: connectedEmail,
  };
}

/**
 * Obtains a fresh Google access token using the stored encrypted refresh token.
 */
export async function getFreshAccessToken(
  env?: Record<string, any>
): Promise<{ accessToken: string; senderEmail: string }> {
  const settings = await getGoogleMailSettings(env);

  if (!settings || !settings.enabled || !settings.refresh_token_encrypted) {
    throw new Error('Gmail integration is not connected. Please connect Gmail in Developer Admin.');
  }

  const config = getGoogleMailConfig(env);
  if (!config.clientId || !config.clientSecret) {
    throw new Error('Server Google Mail client credentials (GOOGLE_MAIL_CLIENT_ID / GOOGLE_MAIL_CLIENT_SECRET) are missing');
  }

  let plainRefreshToken = '';
  try {
    plainRefreshToken = await decryptRefreshToken(settings.refresh_token_encrypted, undefined, env);
  } catch (err: any) {
    await updateGoogleMailStatus('error', `Failed to decrypt refresh token: ${err.message}`, env);
    throw new Error('Failed to decrypt stored Gmail credentials. Please reconnect Gmail.');
  }

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: plainRefreshToken,
      grant_type: 'refresh_token',
    }).toString(),
  });

  if (!tokenRes.ok) {
    const errorBody = await tokenRes.text();
    console.error('Google refresh token error:', tokenRes.status, errorBody);

    // If permanent token failure, mark status as error/reconnect needed
    if (tokenRes.status === 400 || tokenRes.status === 401 || errorBody.includes('invalid_grant')) {
      await updateGoogleMailStatus(
        'error',
        'Google refresh token is invalid or was revoked. Reconnection required.',
        env
      );
      throw new Error('Gmail connection has expired or been revoked. Please reconnect Gmail in Developer Admin.');
    }

    throw new Error(`Failed to refresh Google access token (${tokenRes.status})`);
  }

  const tokenData = (await tokenRes.json()) as { access_token: string };
  if (!tokenData.access_token) {
    throw new Error('Invalid token response received from Google');
  }

  // Clear any previous transient error status on successful token refresh
  if (settings.status === 'error') {
    await updateGoogleMailStatus('connected', null, env);
  }

  return {
    accessToken: tokenData.access_token,
    senderEmail: settings.email_address,
  };
}

/**
 * Sanitizes header values to prevent header injection attacks.
 */
function sanitizeHeader(val: string): string {
  return val.replace(/[\r\n]+/g, ' ').trim();
}

/**
 * Encodes non-ASCII header strings according to RFC 2047 (=?UTF-8?B?...?=).
 */
function encodeMimeHeader(val: string): string {
  const sanitized = sanitizeHeader(val);
  if (/^[\x20-\x7E]*$/.test(sanitized)) {
    return sanitized;
  }
  const base64Val = Buffer.from(sanitized, 'utf-8').toString('base64');
  return `=?UTF-8?B?${base64Val}?=`;
}

/**
 * Encodes a UTF-8 string into URL-safe Base64 without padding (base64url).
 */
function toBase64Url(str: string): string {
  const base64 = Buffer.from(str, 'utf-8').toString('base64');
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Constructs a compliant RFC 2822 MIME message string.
 */
export function buildMimeEmail(params: {
  from: string;
  fromName?: string;
  to: string;
  subject: string;
  html: string;
  text?: string;
}): string {
  const fromHeader = params.fromName
    ? `${encodeMimeHeader(params.fromName)} <${sanitizeHeader(params.from)}>`
    : sanitizeHeader(params.from);

  const toHeader = sanitizeHeader(params.to);
  const subjectHeader = encodeMimeHeader(params.subject);
  const plainText = params.text || params.html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

  const boundary = `====_EGS_MIME_BOUNDARY_${Date.now().toString(16)}_====`;

  const lines = [
    `From: ${fromHeader}`,
    `To: ${toHeader}`,
    `Subject: ${subjectHeader}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(plainText, 'utf-8').toString('base64'),
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(params.html, 'utf-8').toString('base64'),
    '',
    `--${boundary}--`,
    '',
  ];

  return lines.join('\r\n');
}

/**
 * Sends an email using the official Gmail API (POST https://gmail.googleapis.com/gmail/v1/users/me/messages/send).
 */
export async function sendEmailViaGmail(
  params: {
    to: string;
    subject: string;
    html: string;
    text?: string;
    fromName?: string;
  },
  env?: Record<string, any>
): Promise<{
  messageId: string;
  threadId: string;
  senderEmail: string;
}> {
  // Validate recipient email address
  const recipient = (params.to || '').trim().toLowerCase();
  if (!recipient || !recipient.includes('@') || recipient.length < 5) {
    throw new Error(`Invalid recipient email address: ${params.to}`);
  }

  // Obtain fresh access token and verified sender address
  const { accessToken, senderEmail } = await getFreshAccessToken(env);

  const rawMime = buildMimeEmail({
    from: senderEmail,
    fromName: params.fromName || 'EventGameStudio',
    to: recipient,
    subject: params.subject,
    html: params.html,
    text: params.text,
  });

  const rawBase64Url = toBase64Url(rawMime);

  console.log(`[Gmail API] Sending email to ${recipient} via ${senderEmail}...`);

  const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      raw: rawBase64Url,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error(`[Gmail API] Send failure (${response.status}):`, errorBody);

    let errorDetail = `Gmail API error (${response.status})`;
    try {
      const parsed = JSON.parse(errorBody);
      if (parsed.error?.message) {
        errorDetail = parsed.error.message;
      }
    } catch {
      // keep default error detail
    }

    if (response.status === 401 || response.status === 403) {
      await updateGoogleMailStatus('error', `Gmail send authorization error: ${errorDetail}`, env);
    }

    throw new Error(`Failed to send email via Gmail API: ${errorDetail}`);
  }

  const result = (await response.json()) as { id: string; threadId: string };

  console.log(`[Gmail API] Email successfully delivered to Gmail queue. Message ID: ${result.id}`);

  return {
    messageId: result.id,
    threadId: result.threadId,
    senderEmail,
  };
}

/**
 * Creates clean HTML & Plaintext template for Organization Staff Invitations.
 */
export function generateInvitationEmailTemplate(params: {
  organizationName: string;
  inviteUrl: string;
  role: string;
  inviterName?: string;
}): {
  subject: string;
  html: string;
  text: string;
} {
  const roleDisplay =
    params.role === 'admin'
      ? 'Administrator'
      : params.role === 'designer'
      ? 'Game Designer'
      : 'Viewer';

  const inviterText = params.inviterName
    ? `${params.inviterName} has invited you`
    : 'You have been invited';

  const subject = `You're invited to join ${params.organizationName} on EventGameStudio`;

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #020617; color: #f8fafc; margin: 0; padding: 0; }
    .container { max-width: 580px; margin: 0 auto; padding: 40px 20px; }
    .card { background-color: #0f172a; border: 1px solid #1e293b; border-radius: 16px; padding: 32px; box-shadow: 0 10px 25px rgba(0,0,0,0.5); }
    .logo-badge { display: inline-flex; align-items: center; gap: 8px; background-color: #1e293b; border: 1px solid #334155; padding: 8px 16px; border-radius: 12px; margin-bottom: 24px; font-weight: 700; color: #f59e0b; font-size: 14px; letter-spacing: 0.5px; }
    h1 { font-size: 22px; font-weight: 800; color: #ffffff; margin: 0 0 16px 0; line-height: 1.3; }
    p { font-size: 14px; line-height: 1.6; color: #94a3b8; margin: 0 0 20px 0; }
    .highlight-box { background-color: #1e293b; border-left: 4px solid #f59e0b; padding: 16px; border-radius: 8px; margin: 20px 0; }
    .highlight-label { font-size: 11px; text-transform: uppercase; color: #64748b; font-weight: 700; letter-spacing: 0.5px; margin-bottom: 4px; }
    .highlight-val { font-size: 16px; font-weight: 700; color: #f1f5f9; }
    .btn-container { text-align: center; margin: 32px 0 24px 0; }
    .btn { display: inline-block; background-color: #f59e0b; color: #020617 !important; text-decoration: none; font-weight: 700; font-size: 14px; padding: 14px 32px; border-radius: 12px; box-shadow: 0 4px 12px rgba(245, 158, 11, 0.3); }
    .fallback-url { font-size: 11px; word-break: break-all; color: #64748b; line-height: 1.5; background-color: #020617; padding: 12px; border-radius: 8px; border: 1px solid #1e293b; }
    .footer { text-align: center; margin-top: 32px; font-size: 12px; color: #475569; }
  </style>
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="logo-badge">
        🎮 EVENTGAMESTUDIO
      </div>
      
      <h1>${inviterText}</h1>
      
      <p>
        You have been granted access to collaborate on live interactive arcade games, event themes, and leaderboards on <strong>EventGameStudio</strong>.
      </p>

      <div class="highlight-box">
        <div class="highlight-label">Organization</div>
        <div class="highlight-val">${params.organizationName}</div>
        <div class="highlight-label" style="margin-top: 10px;">Assigned Staff Role</div>
        <div class="highlight-val" style="color: #fbbf24;">${roleDisplay}</div>
      </div>

      <div class="btn-container">
        <a href="${params.inviteUrl}" class="btn" target="_blank">Accept Invitation & Join Team</a>
      </div>

      <p style="font-size: 12px; color: #64748b; margin-top: 24px;">
        If the button above does not work, copy and paste this link into your browser:
      </p>
      <div class="fallback-url">
        ${params.inviteUrl}
      </div>

      <p style="font-size: 11px; color: #475569; margin-top: 20px; border-top: 1px solid #1e293b; padding-top: 16px;">
        * Note: This invitation is valid for 7 days. When accepting, sign in with your matching Google account.
      </p>
    </div>

    <div class="footer">
      EventGameStudio &bull; Interactive Brand Gaming Platform<br>
      Automated transactional email powered by official Gmail API.
    </div>
  </div>
</body>
</html>
`.trim();

  const text = `
You have been invited to join ${params.organizationName} on EventGameStudio!

Role: ${roleDisplay}
${params.inviterName ? `Invited by: ${params.inviterName}` : ''}

To accept your invitation, visit the link below:
${params.inviteUrl}

Note: This invitation link is valid for 7 days. Please sign in with your matching Google account.

EventGameStudio Platform
`.trim();

  return {
    subject,
    html,
    text,
  };
}

/**
 * Creates clean HTML & Plaintext template for Gmail API connection test email.
 */
export function generateTestEmailTemplate(senderEmail: string): {
  subject: string;
  html: string;
  text: string;
} {
  const timestamp = new Date().toUTCString();
  const subject = 'EventGameStudio Gmail API Test';

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #020617; color: #f8fafc; margin: 0; padding: 20px; }
    .card { max-width: 540px; margin: 0 auto; background: #0f172a; border: 1px solid #1e293b; border-radius: 16px; padding: 32px; }
    .badge { display: inline-block; background: #065f46; color: #6ee7b7; font-weight: bold; font-size: 11px; padding: 4px 10px; border-radius: 6px; text-transform: uppercase; margin-bottom: 16px; }
    h1 { font-size: 20px; color: #ffffff; margin: 0 0 12px 0; }
    p { font-size: 14px; line-height: 1.6; color: #94a3b8; margin: 0 0 16px 0; }
    .detail-box { background: #1e293b; padding: 14px; border-radius: 10px; font-family: monospace; font-size: 12px; color: #e2e8f0; }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">Connection Verified</div>
    <h1>EventGameStudio Gmail API Test</h1>
    <p>
      This is a test email from EventGameStudio using the Gmail API.
    </p>
    <div class="detail-box">
      <strong>Sender:</strong> ${senderEmail}<br>
      <strong>Provider:</strong> Google Gmail API (gmail.googleapis.com)<br>
      <strong>Scope:</strong> https://www.googleapis.com/auth/gmail.send<br>
      <strong>Sent At:</strong> ${timestamp}
    </div>
    <p style="margin-top: 20px; font-size: 12px; color: #64748b;">
      Your Gmail sending account is configured and ready for transactional invitation emails.
    </p>
  </div>
</body>
</html>
`.trim();

  const text = `
This is a test email from EventGameStudio using the Gmail API.

Sender: ${senderEmail}
Sent At: ${timestamp}
Provider: Google Gmail API (gmail.googleapis.com)

Your Gmail sending connection is working properly.
`.trim();

  return {
    subject,
    html,
    text,
  };
}
