/**
 * Dedicated Test Suite: Resend Admin Invitations Service
 *
 * Verifies:
 * 1. Complete Separation of Resend from General System Email (Gmail API).
 * 2. Sender-Domain Authentication & Sender Configuration Validation.
 * 3. Provider Errors Handling (HTTP 400, 401, 403, 422, 429, 500, timeouts).
 * 4. Safe Retries with Bounded Exponential Backoff on transient failures.
 * 5. Invitation Status Handling: A provider rejection must NEVER be reported as delivered.
 * 6. Webhook Delivery & Rejection Processing (bounces, complaints, delivery confirmations).
 * 7. Failed Invitations Clean Retryability without duplicate active invitations.
 */

import assert from 'node:assert';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  sendEmailViaResend,
  validateResendSenderConfig,
  isResendConfigured,
  getResendApiKey,
  getResendInvitationFrom,
  isTransientResendError,
  processResendWebhookPayload,
  isValidEmail,
} from './resend.js';
import {
  createCustomerCompany,
  getCustomerCompanyById,
  sendCompanyInvitations,
  handleCustomerInvitationWebhook,
  listCustomerInvitationLogs,
} from '../db/customerInvitations.js';

let passed = 0;
let failed = 0;

function assertEqual(actual: any, expected: any, testName: string) {
  if (actual === expected) {
    console.log(`  ✓ PASS: ${testName} (got: ${actual})`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${testName} - Expected "${expected}", got "${actual}"`);
    failed++;
    throw new Error(`Assertion failed: ${testName}. Expected "${expected}", got "${actual}"`);
  }
}

function assertTrue(condition: boolean, testName: string) {
  if (condition) {
    console.log(`  ✓ PASS: ${testName}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${testName} - Condition was false`);
    failed++;
    throw new Error(`Assertion failed: ${testName}`);
  }
}

async function runTestSuite() {
  console.log('\n====================================================================');
  console.log(' RUNNING DEDICATED RESEND INVITATION SERVICE & ISOLATION TEST SUITE');
  console.log('====================================================================\n');

  // --------------------------------------------------------------------------
  // TEST GROUP 1: SEPARATION FROM GENERAL SYSTEM EMAIL (GMAIL API)
  // --------------------------------------------------------------------------
  console.log('--- Test Group 1: Separation from General System Email (Gmail) ---');

  const resendTsPath = path.resolve(process.cwd(), 'server/email/resend.ts');
  const resendTsContent = fs.readFileSync(resendTsPath, 'utf8');

  // Verify resend.ts does NOT import or call Gmail API functions
  assertTrue(
    !resendTsContent.includes('sendEmailViaGmail'),
    'resend.ts does not reference or import sendEmailViaGmail'
  );
  assertTrue(
    !resendTsContent.includes('googleMailSettings') && !resendTsContent.includes('getGoogleMailSettings'),
    'resend.ts is completely decoupled from Google Mail settings'
  );

  const customerInvitationsDbPath = path.resolve(process.cwd(), 'server/db/customerInvitations.ts');
  const customerInvitationsDbContent = fs.readFileSync(customerInvitationsDbPath, 'utf8');

  assertTrue(
    !customerInvitationsDbContent.includes('sendEmailViaGmail'),
    'customerInvitations.ts does not use sendEmailViaGmail'
  );
  assertTrue(
    customerInvitationsDbContent.includes('sendEmailViaResend'),
    'customerInvitations.ts strictly uses dedicated sendEmailViaResend'
  );

  // Environment variable isolation
  const procEnv = process.env;
  assertEqual(getResendApiKey({ RESEND_API_KEY: 're_isolated_test_key_123' }), 're_isolated_test_key_123', 'Resend uses dedicated RESEND_API_KEY');
  assertEqual(getResendInvitationFrom({ RESEND_INVITATION_FROM: 'Team <invites@eventgamestudio.com>' }), 'Team <invites@eventgamestudio.com>', 'Resend uses dedicated RESEND_INVITATION_FROM');

  // --------------------------------------------------------------------------
  // TEST GROUP 2: SENDER-DOMAIN AUTHENTICATION & CONFIGURATION VALIDATION
  // --------------------------------------------------------------------------
  console.log('\n--- Test Group 2: Sender-Domain Authentication & Validation ---');

  // 2a. Valid sender address formats
  const validSender1 = validateResendSenderConfig({}, 'Mun Jian (EventGameStudio) <invitations@eventgamestudio.com>');
  assertTrue(validSender1.valid, 'Valid sender with display name and custom domain accepted');
  assertEqual(validSender1.fromAddress, 'Mun Jian (EventGameStudio) <invitations@eventgamestudio.com>', 'Correct from address retained');

  const validSender2 = validateResendSenderConfig({}, 'onboarding@resend.dev');
  assertTrue(validSender2.valid, 'Valid default sender onboarding@resend.dev accepted');

  // 2b. Missing sender configuration
  const missingSender = validateResendSenderConfig({ RESEND_INVITATION_FROM: '', RESEND_FROM_EMAIL: '' }, '');
  assertTrue(!missingSender.valid, 'Missing sender address returns invalid');
  assertTrue(missingSender.error?.includes('RESEND_INVITATION_FROM'), 'Actionable error instructions for RESEND_INVITATION_FROM provided');

  // 2c. Malformed sender addresses / invalid domains
  const invalidEmailSender = validateResendSenderConfig({}, 'Not An Email Address');
  assertTrue(!invalidEmailSender.valid, 'Non-email sender string rejected');

  const missingDomainSender = validateResendSenderConfig({}, 'invitations@localhost');
  assertTrue(!missingDomainSender.valid, 'Domain without dot rejected');

  const emptyDomainSender = validateResendSenderConfig({}, 'invitations@domain.');
  assertTrue(!emptyDomainSender.valid, 'Domain ending with trailing dot rejected');

  // 2d. Provider rejection for unverified sender domain
  const unverifiedDomainFetch = async () => {
    return new Response(
      JSON.stringify({
        statusCode: 403,
        name: 'validation_error',
        message: "The domain 'unverified-brand-domain.com' is not verified in your Resend account. Please verify domain DNS records.",
      }),
      { status: 403, headers: { 'Content-Type': 'application/json' } }
    );
  };

  const domainRejectionResult = await sendEmailViaResend({
    to: 'partner@example.com',
    subject: 'Invitation',
    html: '<p>Hi</p>',
    fromEmail: 'Mun Jian <invitations@unverified-brand-domain.com>',
    env: { RESEND_API_KEY: 're_test_key_403' },
    fetchFn: unverifiedDomainFetch as any,
  });

  assertEqual(domainRejectionResult.success, false, 'Unverified sender domain must fail');
  assertEqual(domainRejectionResult.status, 'failed', 'Status is failed on unverified domain rejection');
  assertEqual(domainRejectionResult.permanentFailure, true, 'Unverified sender domain is classified as permanent failure');
  assertEqual(domainRejectionResult.retryCount, 0, 'Permanent domain rejection does not retry');
  assertTrue(domainRejectionResult.error?.includes('not verified'), 'Error message preserves provider domain verification detail');

  // --------------------------------------------------------------------------
  // TEST GROUP 3: PROVIDER ERROR HANDLING & ERROR CLASSIFICATION
  // --------------------------------------------------------------------------
  console.log('\n--- Test Group 3: Provider Errors (HTTP 400, 401, 403, 422, 429, 500) ---');

  // 3a. Classification helper
  assertTrue(!isTransientResendError(400), '400 is permanent');
  assertTrue(!isTransientResendError(401), '401 is permanent');
  assertTrue(!isTransientResendError(403), '403 is permanent');
  assertTrue(!isTransientResendError(422), '422 is permanent');
  assertTrue(isTransientResendError(429), '429 is transient (rate limit)');
  assertTrue(isTransientResendError(500), '500 is transient');
  assertTrue(isTransientResendError(502), '502 is transient');
  assertTrue(isTransientResendError(503), '503 is transient');
  assertTrue(isTransientResendError(null, new Error('ETIMEDOUT')), 'Timeout error is transient');
  assertTrue(isTransientResendError(null, new Error('The operation was aborted')), 'AbortError is transient');

  // 3b. Provider 401 Unauthorized (Invalid API key)
  const mock401Fetch = async () => {
    return new Response(
      JSON.stringify({ statusCode: 401, message: 'Invalid API key provided' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  };
  const res401 = await sendEmailViaResend({
    to: 'client@example.com',
    subject: 'Invite',
    html: '<p>Test</p>',
    fromEmail: 'onboarding@resend.dev',
    env: { RESEND_API_KEY: 're_invalid_key' },
    fetchFn: mock401Fetch as any,
  });
  assertEqual(res401.success, false, '401 Unauthorized fails');
  assertEqual(res401.permanentFailure, true, '401 is permanent failure');
  assertEqual(res401.retryCount, 0, '401 does not retry');

  // 3c. Provider 422 Unprocessable Entity (Recipient on suppression list / bounced previously)
  const mock422Fetch = async () => {
    return new Response(
      JSON.stringify({
        statusCode: 422,
        name: 'validation_error',
        message: 'The email address client@suppressed.com is on the account suppression list due to previous hard bounce.',
      }),
      { status: 422, headers: { 'Content-Type': 'application/json' } }
    );
  };
  const res422 = await sendEmailViaResend({
    to: 'client@suppressed.com',
    subject: 'Invite',
    html: '<p>Test</p>',
    fromEmail: 'onboarding@resend.dev',
    env: { RESEND_API_KEY: 're_test_key' },
    fetchFn: mock422Fetch as any,
  });
  assertEqual(res422.success, false, '422 Unprocessable fails');
  assertEqual(res422.status, 'failed', 'Status is failed');
  assertEqual(res422.permanentFailure, true, '422 is permanent failure');
  assertTrue(res422.error?.includes('suppression list'), 'Suppression list message returned to admin');

  // 3d. Guard against HTTP 200 with error payload in response
  const mock200WithErrorFetch = async () => {
    return new Response(
      JSON.stringify({
        statusCode: 400,
        error: { message: 'Provider rejected message content' },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  };
  const res200Error = await sendEmailViaResend({
    to: 'client@example.com',
    subject: 'Invite',
    html: '<p>Test</p>',
    fromEmail: 'onboarding@resend.dev',
    env: { RESEND_API_KEY: 're_test_key' },
    fetchFn: mock200WithErrorFetch as any,
  });
  assertEqual(res200Error.success, false, 'HTTP 200 with error body is NOT reported as success');
  assertEqual(res200Error.status, 'failed', 'Status is failed');

  // --------------------------------------------------------------------------
  // TEST GROUP 4: SAFE RETRIES & BOUNDED EXPONENTIAL BACKOFF
  // --------------------------------------------------------------------------
  console.log('\n--- Test Group 4: Safe Retries & Bounded Exponential Backoff ---');

  // 4a. Transient 429 Rate Limit that recovers on attempt 2
  let rateLimitAttempts = 0;
  const mock429ThenSuccessFetch = async () => {
    rateLimitAttempts++;
    if (rateLimitAttempts === 1) {
      return new Response(
        JSON.stringify({ statusCode: 429, message: 'Too many requests. Please slow down.' }),
        {
          status: 429,
          headers: { 'Content-Type': 'application/json', 'retry-after': '1' },
        }
      );
    }
    return new Response(
      JSON.stringify({ id: 're_msg_after_429_recovered' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  };

  const res429Recovered = await sendEmailViaResend({
    to: 'client@example.com',
    subject: 'Invite',
    html: '<p>Test</p>',
    fromEmail: 'onboarding@resend.dev',
    env: { RESEND_API_KEY: 're_test_key' },
    fetchFn: mock429ThenSuccessFetch as any,
    initialBackoffMs: 10, // Short backoff for test speed
    maxRetries: 2,
  });

  assertEqual(res429Recovered.success, true, '429 Rate limit recovers on retry');
  assertEqual(res429Recovered.status, 'sent', 'Status is sent upon recovery');
  assertEqual(res429Recovered.retryCount, 1, 'Retry count recorded as 1');
  assertEqual(res429Recovered.messageId, 're_msg_after_429_recovered', 'Message ID recorded');
  assertEqual(rateLimitAttempts, 2, 'Executed exactly 2 network attempts');

  // 4b. Persistent 503 Server Error that exhausts all retries
  let server503Attempts = 0;
  const mock503PersistentFetch = async () => {
    server503Attempts++;
    return new Response(
      JSON.stringify({ statusCode: 503, message: 'Resend mail service temporarily unavailable' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  };

  const res503Exhausted = await sendEmailViaResend({
    to: 'client@example.com',
    subject: 'Invite',
    html: '<p>Test</p>',
    fromEmail: 'onboarding@resend.dev',
    env: { RESEND_API_KEY: 're_test_key' },
    fetchFn: mock503PersistentFetch as any,
    initialBackoffMs: 10,
    maxRetries: 2,
  });

  assertEqual(res503Exhausted.success, false, '503 exhausts retries and returns false');
  assertEqual(res503Exhausted.status, 'failed', 'Status is failed');
  assertEqual(server503Attempts, 3, 'Total 3 attempts executed (1 initial + 2 retries)');
  assertTrue(res503Exhausted.error?.includes('unavailable'), 'Error captures provider failure');

  // --------------------------------------------------------------------------
  // TEST GROUP 5: INVITATION STATUS HANDLING & PROVIDER REJECTION ISOLATION
  // --------------------------------------------------------------------------
  console.log('\n--- Test Group 5: Invitation Status Handling & Provider Rejection Isolation ---');

  // Create a customer company with 2 recipients
  const company = await createCustomerCompany({
    company_name: 'Starlight Media Group',
    contact_person: 'Alice Chen',
    recipients: [
      { email: 'alice@starlight.com', recipient_name: 'Alice Chen' },
      { email: 'bounced@starlight.com', recipient_name: 'Bounced User' },
    ],
  });

  // 5a. Direct API rejection: A provider rejection must NOT be reported as delivered
  // Simulate provider rejecting the second email (e.g. suppression list or invalid mailbox)
  const selectiveFailureFetch = async (_url: string, options: any) => {
    const body = JSON.parse(options.body);
    const recipient = body.to[0];
    if (recipient === 'bounced@starlight.com') {
      return new Response(
        JSON.stringify({
          statusCode: 422,
          message: 'The recipient bounced@starlight.com was rejected by provider (Recipient address does not exist)',
        }),
        { status: 422, headers: { 'Content-Type': 'application/json' } }
      );
    }
    return new Response(
      JSON.stringify({ id: 're_msg_alice_success_1' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  };

  // We test sendEmailViaResend directly to verify the recipient failure
  const aliceRes = await sendEmailViaResend({
    to: 'alice@starlight.com',
    subject: 'Invitation',
    html: '<p>Hi</p>',
    fromEmail: 'onboarding@resend.dev',
    env: { RESEND_API_KEY: 're_test_key' },
    fetchFn: selectiveFailureFetch as any,
  });
  assertEqual(aliceRes.success, true, 'Alice accepted by provider');
  assertEqual(aliceRes.status, 'sent', 'Alice status is sent (accepted for delivery)');

  const bouncedRes = await sendEmailViaResend({
    to: 'bounced@starlight.com',
    subject: 'Invitation',
    html: '<p>Hi</p>',
    fromEmail: 'onboarding@resend.dev',
    env: { RESEND_API_KEY: 're_test_key' },
    fetchFn: selectiveFailureFetch as any,
  });
  assertEqual(bouncedRes.success, false, 'Provider rejection must return success: false');
  assertEqual(bouncedRes.status, 'failed', 'CRITICAL: Provider rejection must be marked status: "failed", NEVER "delivered"');
  assertTrue(bouncedRes.error?.includes('rejected by provider'), 'Rejection error recorded');

  // 5b. Webhook Processing: Post-Send Rejections (Bounces & Spam Complaints)
  console.log('\n--- Test Group 5b: Webhook Rejection & Delivery Tracking ---');

  // Simulate an email that was initially marked "sent", but later bounced
  const sentMessageId = `re_webhook_test_${Date.now()}`;
  const testCompany2 = await createCustomerCompany({
    company_name: 'Nexus Dynamics',
    recipients: [{ email: 'timothy@nexus.com', recipient_name: 'Timothy' }],
  });

  // Send an invitation with configured test key and mock fetch
  process.env.RESEND_INVITATION_FROM = 'Mun Jian <onboarding@resend.dev>';
  process.env.RESEND_API_KEY = 're_test_key_webhook';
  const mockWebhookFetch = async () =>
    new Response(JSON.stringify({ id: `re_webhook_msg_${Date.now()}` }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  const initialSend = await sendCompanyInvitations(testCompany2.id, {
    confirmReinvite: false,
    fetchFn: mockWebhookFetch,
  });
  assertEqual(initialSend.sent, 1, 'Initial send marked sent');

  const timothyRec = (await getCustomerCompanyById(testCompany2.id))!.recipients[0];
  assertEqual(timothyRec.last_invitation_status, 'sent', 'Recipient status is initially sent');
  assertEqual(timothyRec.invitation_count, 1, 'Invitation count is 1');

  // Retrieve the generated log
  const initialLogs = await listCustomerInvitationLogs(10);
  const timothyLog = initialLogs.find((l) => l.recipient_id === timothyRec.id);
  assertTrue(Boolean(timothyLog), 'Audit log exists for initial invitation');
  const loggedMessageId = timothyLog!.provider_message_id;

  // Now Resend fires a bounce webhook event: `email.bounced`
  const bounceWebhookPayload = {
    type: 'email.bounced',
    created_at: new Date().toISOString(),
    data: {
      id: loggedMessageId,
      email_id: loggedMessageId,
      to: ['timothy@nexus.com'],
      from: 'onboarding@resend.dev',
      subject: 'Invitation to Try EventGameStudio',
      bounce: {
        message: '550 5.1.1 The email account that you tried to reach does not exist.',
        type: 'hard_bounce',
      },
    },
  };

  const processedBounce = processResendWebhookPayload(bounceWebhookPayload);
  assertEqual(processedBounce.deliveryStatus, 'bounced', 'Webhook processed as bounced');
  assertTrue(processedBounce.reason?.includes('550 5.1.1'), 'Bounce reason extracted from payload');

  const webhookResult = await handleCustomerInvitationWebhook(bounceWebhookPayload);
  assertEqual(webhookResult.handled, true, 'Webhook handler matched log record');
  assertEqual(webhookResult.deliveryStatus, 'bounced', 'Delivery status is bounced');

  // Verify recipient record has transitioned from 'sent' to 'failed'
  const updatedCompany2 = await getCustomerCompanyById(testCompany2.id);
  const updatedTimothy = updatedCompany2!.recipients[0];
  assertEqual(updatedTimothy.last_invitation_status, 'failed', 'CRITICAL: Bounced recipient status updated to "failed"');
  assertTrue(updatedTimothy.last_invitation_error?.includes('550 5.1.1'), 'Last invitation error updated with bounce reason');

  // Verify audit log has also transitioned from 'sent' to 'failed'
  const postBounceLogs = await listCustomerInvitationLogs(10);
  const updatedLog = postBounceLogs.find((l) => l.id === timothyLog!.id);
  assertEqual(updatedLog?.status, 'failed', 'CRITICAL: Audit log status transitioned to "failed" post-bounce');
  assertTrue(updatedLog?.error_message?.includes('550 5.1.1'), 'Audit log error_message contains bounce details');

  // 5c. Webhook Processing: Provider Rejection (`email.rejected`)
  const rejectWebhookPayload = {
    type: 'email.rejected',
    created_at: new Date().toISOString(),
    data: {
      id: loggedMessageId,
      to: ['timothy@nexus.com'],
      reject: {
        reason: 'Recipient is on global suppression list',
      },
    },
  };
  const processedReject = processResendWebhookPayload(rejectWebhookPayload);
  assertEqual(processedReject.deliveryStatus, 'bounced', 'Rejection mapped to non-delivered state');
  assertTrue(processedReject.reason?.includes('suppression list'), 'Rejection reason extracted');

  // 5d. Webhook Processing: Delivery Confirmation (`email.delivered`)
  const deliveredWebhookPayload = {
    type: 'email.delivered',
    created_at: new Date().toISOString(),
    data: {
      id: loggedMessageId,
      to: ['timothy@nexus.com'],
    },
  };
  const processedDelivered = processResendWebhookPayload(deliveredWebhookPayload);
  assertEqual(processedDelivered.deliveryStatus, 'delivered', 'Delivery confirmed strictly via email.delivered');

  // --------------------------------------------------------------------------
  // TEST GROUP 6: RETRYABILITY OF FAILED VS SENT INVITATIONS
  // --------------------------------------------------------------------------
  console.log('\n--- Test Group 6: Retryability of Failed vs Sent Invitations ---');

  // A recipient whose last invitation failed (e.g. Timothy after bounce or provider error)
  // should be retryable without REINVITATION_CONFIRMATION_REQUIRED blocking them
  const retryFailedRecipient = await sendCompanyInvitations(testCompany2.id, {
    recipientIds: [updatedTimothy.id],
    confirmReinvite: false, // Notice: confirmReinvite is false!
    fetchFn: mockWebhookFetch,
  });

  assertEqual(retryFailedRecipient.success, true, 'Failed invitation can be retried without re-invite block');
  assertEqual(retryFailedRecipient.sent, 1, 'Retry successfully processed');

  // Now that it has been sent, attempting to re-send AGAIN without confirmReinvite must be blocked
  await assert.rejects(
    async () => {
      await sendCompanyInvitations(testCompany2.id, {
        recipientIds: [updatedTimothy.id],
        confirmReinvite: false,
      });
    },
    (err: any) => {
      assert.strictEqual(err.code, 'REINVITATION_CONFIRMATION_REQUIRED', 'Successfully sent recipient requires explicit confirmation');
      return true;
    },
    'Must require explicit confirmation for already-sent recipients'
  );

  console.log('  ✓ PASS: Failed invitation is retryable, but successful invitation requires explicit confirmation');
  passed++;

  // --------------------------------------------------------------------------
  // SUMMARY
  // --------------------------------------------------------------------------
  console.log('\n====================================================================');
  console.log(` ALL RESEND DEDICATED INVITATION TESTS PASSED! Passed: ${passed}, Failed: ${failed}`);
  console.log('====================================================================\n');
}

await runTestSuite();
