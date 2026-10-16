import { test, expect, describe, beforeEach } from 'bun:test';
import {
  verifySvixWebhookSignature,
  sanitizeInboundHtml,
  forwardInboundEmail,
  handleResendInboundWebhookRequest,
  clearIdempotencyCache,
  isMessageAlreadyProcessed,
  markMessageProcessed,
  FORWARD_DESTINATION_EMAIL,
  FORWARD_SUBJECT_PREFIX,
} from './inbound.js';
import { escapeHtml } from './gmail.js';
import crypto from 'crypto';


describe('Resend Inbound Email & Svix Webhook Service', () => {
  beforeEach(() => {
    clearIdempotencyCache();
  });

  describe('1. Svix Webhook Signature Verification', () => {
    const rawSecret = 'whsec_mfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw';
    const msgId = 'msg_test_inbound_123';
    const nowSec = Math.floor(Date.now() / 1000);
    const payload = JSON.stringify({
      type: 'email.received',
      data: {
        email_id: 're_inbound_abc_999',
        from: 'customer@acmeevents.com',
        to: ['invitations@eventgamestudio.com'],
        subject: 'Re: Exclusive Invitation to EventGameStudio',
      },
    });

    function generateValidSvixSignature(body: string, id: string, timestamp: number, secret: string): string {
      const base64Key = secret.startsWith('whsec_') ? secret.slice(6) : secret;
      const keyBytes = Buffer.from(base64Key, 'base64');
      const toSign = `${id}.${timestamp}.${body}`;
      const sig = crypto.createHmac('sha256', keyBytes).update(toSign).digest('base64');
      return `v1,${sig}`;
    }

    test('accepts valid Svix signature', async () => {
      const validSig = generateValidSvixSignature(payload, msgId, nowSec, rawSecret);
      const res = await verifySvixWebhookSignature({
        payload,
        headers: {
          'svix-id': msgId,
          'svix-timestamp': String(nowSec),
          'svix-signature': validSig,
        },
        secret: rawSecret,
      });

      expect(res.valid).toBe(true);
      expect(res.reason).toBeUndefined();
    });

    test('rejects tampered payload', async () => {
      const validSig = generateValidSvixSignature(payload, msgId, nowSec, rawSecret);
      const tamperedPayload = payload + ' ';
      const res = await verifySvixWebhookSignature({
        payload: tamperedPayload,
        headers: {
          'svix-id': msgId,
          'svix-timestamp': String(nowSec),
          'svix-signature': validSig,
        },
        secret: rawSecret,
      });

      expect(res.valid).toBe(false);
      expect(res.reason).toBe('Signature mismatch');
    });

    test('rejects expired timestamp (replay attack prevention)', async () => {
      const expiredTimestamp = nowSec - 600; // 10 minutes ago (> 300s tolerance)
      const validSig = generateValidSvixSignature(payload, msgId, expiredTimestamp, rawSecret);
      const res = await verifySvixWebhookSignature({
        payload,
        headers: {
          'svix-id': msgId,
          'svix-timestamp': String(expiredTimestamp),
          'svix-signature': validSig,
        },
        secret: rawSecret,
        toleranceSeconds: 300,
      });

      expect(res.valid).toBe(false);
      expect(res.reason).toContain('expired');
    });

    test('rejects missing or malformed headers', async () => {
      const resMissingId = await verifySvixWebhookSignature({
        payload,
        headers: {
          'svix-timestamp': String(nowSec),
          'svix-signature': 'v1,someSig',
        },
        secret: rawSecret,
      });
      expect(resMissingId.valid).toBe(false);
      expect(resMissingId.reason).toContain('Missing svix-id');

      const resMissingSig = await verifySvixWebhookSignature({
        payload,
        headers: {
          'svix-id': msgId,
          'svix-timestamp': String(nowSec),
        },
        secret: rawSecret,
      });
      expect(resMissingSig.valid).toBe(false);
      expect(resMissingSig.reason).toContain('Missing svix-signature');
    });
  });

  describe('2. Untrusted HTML Content Sanitization', () => {
    test('strips dangerous script tags', () => {
      const dirty = '<p>Hello!</p><script>alert("xss")</script><p>Can we meet tomorrow?</p>';
      const clean = sanitizeInboundHtml(dirty);
      expect(clean).not.toContain('<script');
      expect(clean).not.toContain('alert');
      expect(clean).toContain('<p>Hello!</p>');
      expect(clean).toContain('<p>Can we meet tomorrow?</p>');
    });

    test('strips style tags and javascript URIs', () => {
      const dirty = '<a href="javascript:stealTokens()">Click here</a><img src="valid.png" onerror="alert(1)" />';
      const clean = sanitizeInboundHtml(dirty);
      expect(clean).not.toContain('javascript:');
      expect(clean).not.toContain('onerror');
      expect(clean).toContain('href="#"');
    });

    test('escapes HTML special characters properly', () => {
      expect(escapeHtml('<script>')).toBe('&lt;script&gt;');
      expect(escapeHtml('"test" & \'val\'')).toBe('&quot;test&quot; &amp; &#039;val&#039;');
    });

  });

  describe('3. Idempotency and Duplicate Forwarding Prevention', () => {
    test('records processed message and skips duplicate forwarding', () => {
      const testMsgId = 'msg_idempotent_test_001';
      expect(isMessageAlreadyProcessed(testMsgId)).toBe(false);

      markMessageProcessed(testMsgId, 're_forward_123');
      expect(isMessageAlreadyProcessed(testMsgId)).toBe(true);
    });
  });

  describe('4. Forwarding to eventgamestudio@gmail.com with Reply-To set to Customer', () => {
    test('forwards inbound message with [EventGameStudio Reply] subject and correct replyTo', async () => {
      let capturedOutgoingRequest: any = null;

      const mockFetch: typeof fetch = async (input, init) => {
        const bodyStr = typeof init?.body === 'string' ? init.body : '';
        capturedOutgoingRequest = JSON.parse(bodyStr || '{}');

        return new Response(
          JSON.stringify({
            id: 're_forwarded_msg_456',
            from: capturedOutgoingRequest.from,
            to: capturedOutgoingRequest.to,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      };

      const result = await forwardInboundEmail({
        email: {
          id: 'inbound_msg_orig_789',
          from: 'sarah.tan@acmefinance.com',
          to: 'invitations@eventgamestudio.com',
          subject: 'Interested in activating a claw machine game for our annual gala',
          text: 'Hi EventGameStudio team,\n\nWe saw your invite and would like to proceed with a 2-day booking.',
          html: '<p>Hi EventGameStudio team,</p><p>We saw your invite and would like to proceed with a 2-day booking.</p>',
        },
        env: {
          RESEND_API_KEY: 're_test_key_for_forwarding',
          RESEND_INVITATION_FROM: 'Mun Jian (EventGameStudio) <invitations@eventgamestudio.com>',
        },
        fetchFn: mockFetch,
      });

      expect(result.success).toBe(true);
      expect(result.forwarded).toBe(true);
      expect(result.forwardMessageId).toBe('re_forwarded_msg_456');

      // Check captured outgoing Resend request
      expect(capturedOutgoingRequest).not.toBeNull();
      // To address must be the Gmail destination
      expect(capturedOutgoingRequest.to).toEqual([FORWARD_DESTINATION_EMAIL]);
      // Subject must have prefix
      expect(capturedOutgoingRequest.subject).toBe(
        `${FORWARD_SUBJECT_PREFIX} Interested in activating a claw machine game for our annual gala`
      );
      // Sender MUST be the branded sender (never untrusted sender to avoid open relay)
      expect(capturedOutgoingRequest.from).toBe('Mun Jian (EventGameStudio) <invitations@eventgamestudio.com>');
      // Reply-To MUST be set to original sender so hitting reply responds to customer
      expect(capturedOutgoingRequest.reply_to).toBe('sarah.tan@acmefinance.com');
      // Body includes original content
      expect(capturedOutgoingRequest.html).toContain('sarah.tan@acmefinance.com');
      expect(capturedOutgoingRequest.html).toContain('annual gala');
    });

    test('subsequent calls for same email ID are marked duplicate and skip resending', async () => {
      let callCount = 0;
      const mockFetch: typeof fetch = async () => {
        callCount++;
        return new Response(JSON.stringify({ id: 're_msg_1' }), { status: 200 });
      };

      const emailData = {
        id: 'dup_msg_111',
        from: 'vip@client.com',
        to: 'invitations@eventgamestudio.com',
        subject: 'Quick question',
        text: 'Hello',
      };

      // First run
      const res1 = await forwardInboundEmail({
        email: emailData,
        env: {
          RESEND_API_KEY: 're_key_123',
          RESEND_INVITATION_FROM: 'EventGameStudio <invitations@eventgamestudio.com>',
        },
        fetchFn: mockFetch,
      });
      expect(res1.forwarded).toBe(true);
      expect(callCount).toBe(1);

      // Second run (duplicate webhook retry)
      const res2 = await forwardInboundEmail({
        email: emailData,
        env: {
          RESEND_API_KEY: 're_key_123',
          RESEND_INVITATION_FROM: 'EventGameStudio <invitations@eventgamestudio.com>',
        },
        fetchFn: mockFetch,
      });
      expect(res2.forwarded).toBe(false);
      expect(res2.duplicate).toBe(true);
      expect(callCount).toBe(1); // Mock was NOT called again
    });
  });

  describe('5. Full handleResendInboundWebhookRequest Dispatcher Flow', () => {
    test('processes email.received event and returns HTTP 200 with forwarded status', async () => {
      const secret = 'whsec_mfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw';
      const nowSec = Math.floor(Date.now() / 1000);
      const emailId = 're_inbound_full_flow_888';

      const payloadObj = {
        type: 'email.received',
        data: {
          email_id: emailId,
          from: 'john.doe@partner.org',
          to: ['invitations@eventgamestudio.com'],
          subject: 'Confirmed our corporate booth activation',
          text: 'Thanks for the invite! Let us connect on WhatsApp or email.',
        },
      };
      const rawBody = JSON.stringify(payloadObj);

      // Calculate Svix signature
      const base64Key = secret.slice(6);
      const toSign = `msg_test_full.${nowSec}.${rawBody}`;
      const sig = crypto.createHmac('sha256', Buffer.from(base64Key, 'base64')).update(toSign).digest('base64');

      const mockFetch: typeof fetch = async () => {
        return new Response(JSON.stringify({ id: 're_fwd_success_999' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      };

      const result = await handleResendInboundWebhookRequest({
        rawBody,
        headers: {
          'svix-id': 'msg_test_full',
          'svix-timestamp': String(nowSec),
          'svix-signature': `v1,${sig}`,
        },
        env: {
          RESEND_API_KEY: 're_test_key_webhook_full',
          RESEND_INVITATION_FROM: 'Mun Jian (EventGameStudio) <invitations@eventgamestudio.com>',
          RESEND_WEBHOOK_SECRET: secret,
        },
        fetchFn: mockFetch,
      });

      expect(result.statusCode).toBe(200);

      expect(result.responseBody.success).toBe(true);
      expect(result.responseBody.eventType).toBe('email.received');
      expect(result.responseBody.forwarded).toBe(true);
    });

    test('rejects webhook with invalid signature when secret is configured', async () => {
      const secret = 'whsec_mfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw';
      const rawBody = JSON.stringify({ type: 'email.received' });

      const result = await handleResendInboundWebhookRequest({
        rawBody,
        headers: {
          'svix-id': 'msg_tampered',
          'svix-timestamp': String(Math.floor(Date.now() / 1000)),
          'svix-signature': 'v1,invalidBase64SignatureHere',
        },
        env: {
          RESEND_WEBHOOK_SECRET: secret,
        },
      });

      expect(result.statusCode).toBe(401);
      expect(result.responseBody.success).toBe(false);
      expect(result.responseBody.error).toContain('verification failed');
    });

    test('allows delivery status events to pass through safely', async () => {
      const rawBody = JSON.stringify({
        type: 'email.delivered',
        data: {
          email_id: 're_msg_sent_111',
          to: ['client@corp.com'],
        },
      });

      const result = await handleResendInboundWebhookRequest({
        rawBody,
        headers: {},
        env: {}, // No secret configured in test -> signature check skipped
      });

      expect(result.statusCode).toBe(200);
      expect(result.responseBody.eventType).toBe('email.delivered');
    });
  });
});
