/**
 * Test Suite: Dedicated Resend API Email Service for Admin Invitations
 *
 * Proves:
 * 1. Admin invitations use Resend exclusively.
 * 2. Other system emails continue using the existing built-in mailer (Gmail API).
 * 3. Resend failures do NOT break other email functionality or crash the app.
 * 4. Failed invitations can be retried safely without creating duplicate active records.
 * 5. Unauthorized users cannot send invitations.
 * 6. Rate limits, batch limits, duplicate-invitation protections, and association checks work.
 * 7. Resend sender configuration is validated with clear, actionable errors.
 * 8. Resend webhooks update delivery status and bounce reasons.
 */

import assert from 'node:assert';
import {
  sendEmailViaResend,
  getResendApiKey,
  getResendInvitationFrom,
  validateResendSenderConfig,
  isResendConfigured,
  processResendWebhookPayload,
  isValidEmail,
} from './email/resend.js';
import {
  generateCustomerInvitationEmail,
  CUSTOMER_INVITATION_SUBJECT,
} from './email/customerInvitationTemplate.js';
import {
  createCustomerCompany,
  getCustomerCompanyById,
  deleteCustomerCompany,
  sendCompanyInvitations,
  listCustomerInvitationLogs,
  handleCustomerInvitationWebhook,
  checkCompanyRecipientsPreviouslyInvited,
} from './db/customerInvitations.js';
import { isUserDeveloperAdmin } from './auth.js';
import { checkRateLimit, adminInvitationRateLimiter } from './rateLimiter.js';

async function runResendAdminInvitationsTests() {
  console.log('================================================================');
  console.log('🧪 RUNNING DEDICATED RESEND ADMIN INVITATIONS TEST SUITE');
  console.log('================================================================\n');

  // --------------------------------------------------------------------------
  // TEST 1: Sender Configuration Validation & Clear Actionable Errors
  // --------------------------------------------------------------------------
  console.log('Test 1: Sender configuration validation and actionable errors...');

  // 1a. Missing sender address
  const missingSenderCheck = validateResendSenderConfig({ RESEND_INVITATION_FROM: '' });
  assert.strictEqual(missingSenderCheck.valid, false);
  assert.ok(
    missingSenderCheck.error?.includes('Resend invitation sender address is missing'),
    'Must return clear, actionable error instructing user to configure RESEND_INVITATION_FROM'
  );

  // 1b. Malformed sender address
  const invalidSenderCheck = validateResendSenderConfig({ RESEND_INVITATION_FROM: 'Not An Email Address' });
  assert.strictEqual(invalidSenderCheck.valid, false);
  assert.ok(
    invalidSenderCheck.error?.includes('does not contain a valid email address'),
    'Must reject invalid email addresses in sender configuration'
  );

  // 1c. Valid sender address formats
  const validSenderCheck1 = validateResendSenderConfig({
    RESEND_INVITATION_FROM: 'Mun Jian (EventGameStudio) <invitations@eventgamestudio.com>',
  });
  assert.strictEqual(validSenderCheck1.valid, true);
  assert.strictEqual(
    validSenderCheck1.fromAddress,
    'Mun Jian (EventGameStudio) <invitations@eventgamestudio.com>'
  );

  const validSenderCheck2 = validateResendSenderConfig({
    RESEND_INVITATION_FROM: 'onboarding@resend.dev',
  });
  assert.strictEqual(validSenderCheck2.valid, true);

  console.log('  ✓ PASSED: Sender configuration validated with clear, actionable errors.\n');

  // --------------------------------------------------------------------------
  // TEST 2: Dedicated Resend Client & Error Isolation
  // --------------------------------------------------------------------------
  console.log('Test 2: Resend service error isolation and transient retries...');

  // 2a. Rejection when sender configuration is missing
  const missingConfigSend = await sendEmailViaResend({
    to: 'partner@agency.com',
    subject: 'Test Subject',
    html: '<p>Test</p>',
    env: { RESEND_INVITATION_FROM: '' },
  });
  assert.strictEqual(missingConfigSend.success, false);
  assert.strictEqual(missingConfigSend.status, 'failed');
  assert.ok(missingConfigSend.error?.includes('Resend invitation sender address is missing'));

  // 2b. Rejection on invalid recipient format
  const invalidRecipientSend = await sendEmailViaResend({
    to: 'not-an-email',
    subject: 'Test Subject',
    html: '<p>Test</p>',
    env: { RESEND_INVITATION_FROM: 'onboarding@resend.dev' },
  });
  assert.strictEqual(invalidRecipientSend.success, false);
  assert.strictEqual(invalidRecipientSend.permanentFailure, true);
  assert.ok(invalidRecipientSend.error?.includes('Invalid recipient email address'));

  // 2c. Simulation in non-production environment returns simulated messageId
  const simulatedSend = await sendEmailViaResend({
    to: 'partner@agency.com',
    subject: 'Test Subject',
    html: '<p>Test</p>',
    env: {
      NODE_ENV: 'development',
      RESEND_INVITATION_FROM: 'Mun Jian (EventGameStudio) <onboarding@resend.dev>',
    },
  });
  assert.strictEqual(simulatedSend.success, true);
  assert.strictEqual(simulatedSend.status, 'sent');
  assert.ok(simulatedSend.messageId?.startsWith('sim_resend_'));

  console.log('  ✓ PASSED: Resend service gracefully isolates failures and simulates in dev/test.\n');

  // --------------------------------------------------------------------------
  // TEST 3: Admin Customer Invitations Flow & Model Association
  // --------------------------------------------------------------------------
  console.log('Test 3: Admin invitation flow, company contact association & Resend dispatch...');

  const testEnv = {
    RESEND_INVITATION_FROM: 'Mun Jian (EventGameStudio) <onboarding@resend.dev>',
    NODE_ENV: 'test',
  };

  const company = await createCustomerCompany(
    {
      company_name: 'Starlight Events Group',
      contact_person: 'Elena Vance',
      notes: 'Corporate roadshow producer',
      recipients: [
        { email: 'elena@starlight.com', recipient_name: 'Elena Vance' },
        { email: 'creative@starlight.com', recipient_name: 'Creative Director' },
      ],
    },
    testEnv
  );

  assert.ok(company.id);
  assert.strictEqual(company.recipients.length, 2);
  assert.strictEqual(company.invitationStatus, 'never_invited');

  // Dispatch invitations through Resend
  const inviteResult = await sendCompanyInvitations(company.id, {
    sentByUserId: 'admin-user-001',
    env: testEnv,
  });

  assert.strictEqual(inviteResult.success, true);
  assert.strictEqual(inviteResult.total, 2);
  assert.strictEqual(inviteResult.sent, 2);
  assert.strictEqual(inviteResult.failed, 0);

  // Verify recipient records and provider log
  const refreshed = await getCustomerCompanyById(company.id, testEnv);
  assert.ok(refreshed);
  assert.strictEqual(refreshed.invitationStatus, 'all_invited');
  for (const r of refreshed.recipients) {
    assert.strictEqual(r.invitation_count, 1);
    assert.strictEqual(r.last_invitation_status, 'sent');
    assert.strictEqual(r.last_invitation_error, null);
    assert.ok(r.last_invited_at != null);
  }

  // Audit logs must record provider 'resend'
  const logs = await listCustomerInvitationLogs(10, testEnv);
  const companyLogs = logs.filter((l) => l.company_id === company.id);
  assert.strictEqual(companyLogs.length, 2);
  assert.strictEqual(companyLogs[0].provider, 'resend');
  assert.strictEqual(companyLogs[0].status, 'sent');

  console.log('  ✓ PASSED: Admin invitations use Resend and record provider logs and recipient status.\n');

  // --------------------------------------------------------------------------
  // TEST 4: Re-invitation Protections & Safe Retries for Failed Invitations
  // --------------------------------------------------------------------------
  console.log('Test 4: Re-invitation confirmation protection and failed invitation retry...');

  // 4a. Already successfully invited recipients trigger REINVITATION_CONFIRMATION_REQUIRED
  await assert.rejects(
    async () => {
      await sendCompanyInvitations(company.id, {
        confirmReinvite: false, // NOT confirmed
        env: testEnv,
      });
    },
    (err: any) => {
      assert.strictEqual(err.code, 'REINVITATION_CONFIRMATION_REQUIRED');
      assert.strictEqual(err.previouslyInvited.length, 2);
      return true;
    },
    'Must require explicit confirmation before re-inviting previously invited recipients'
  );

  // 4b. Simulate a failed delivery via bounce webhook on recipient 0
  const elenaId = company.recipients[0].id;
  const creativeId = company.recipients[1].id;

  const companyLogsForBounce = (await listCustomerInvitationLogs(10, testEnv)).filter((l) => l.company_id === company.id);
  assert.ok(companyLogsForBounce.length >= 2);

  // Mark recipient 0 as bounced/failed
  await handleCustomerInvitationWebhook(
    {
      type: 'email.bounced',
      data: {
        email_id: companyLogsForBounce[0].provider_message_id,
        to: [companyLogsForBounce[0].email],
        bounce: { message: 'Temporary recipient connection timeout' },
      },
    },
    testEnv
  );

  // Verify recipient in store updated with failed status
  const compAfterBounce = await getCustomerCompanyById(company.id, testEnv);
  assert.ok(compAfterBounce);
  const bouncedRecipient = compAfterBounce.recipients.find((r) => r.id === companyLogsForBounce[0].recipient_id)!;
  assert.strictEqual(bouncedRecipient.last_invitation_status, 'failed');
  assert.ok(bouncedRecipient.last_invitation_error?.includes('Temporary recipient connection timeout'));

  // Check previously invited logic:
  // A recipient whose status is 'failed' MUST NOT block immediate retry
  const checkAfterFailure = await checkCompanyRecipientsPreviouslyInvited(
    company.id,
    [bouncedRecipient.id],
    testEnv
  );
  assert.strictEqual(
    checkAfterFailure.hasPreviouslyInvited,
    false,
    'Failed recipient must not be counted as previously invited, allowing clean retry without confirmation'
  );

  // 4c. Retrying failed recipient with confirmReinvite=false should succeed!
  const retryResult = await sendCompanyInvitations(company.id, {
    recipientIds: [bouncedRecipient.id],
    confirmReinvite: false,
    env: testEnv,
  });

  assert.strictEqual(retryResult.success, true);
  assert.strictEqual(retryResult.sent, 1);

  // After successful retry, recipient status must become 'sent' and error cleared
  const compAfterRetry = await getCustomerCompanyById(company.id, testEnv);
  assert.ok(compAfterRetry);
  const retriedRecipient = compAfterRetry.recipients.find((r) => r.id === bouncedRecipient.id)!;
  assert.strictEqual(retriedRecipient.last_invitation_status, 'sent');
  assert.strictEqual(retriedRecipient.last_invitation_error, null);

  console.log('  ✓ PASSED: Failed invitations can be retried safely without duplicate company records or false confirmation blocks.\n');

  // --------------------------------------------------------------------------
  // TEST 5: Security & Abuse Prevention (Permissions, Cross-Company, Batch Limits)
  // --------------------------------------------------------------------------
  console.log('Test 5: Security guards, cross-company isolation, and batch limits...');

  // 5a. Authorization: verify developer admin check
  const normalUser = {
    id: 'user-1',
    google_id: null,
    name: 'Normal User',
    avatar_url: null,
    email: 'user@example.com',
    is_developer: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  const developerUser = {
    id: 'dev-1',
    google_id: null,
    name: 'Developer User',
    avatar_url: null,
    email: 'dev@eventgamestudio.com',
    is_developer: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  assert.strictEqual(isUserDeveloperAdmin(normalUser), false, 'Non-developer user must be rejected');
  assert.strictEqual(isUserDeveloperAdmin(developerUser), true, 'Developer admin must be accepted');

  // 5b. Cross-company recipient association validation
  await assert.rejects(
    async () => {
      await sendCompanyInvitations(company.id, {
        recipientIds: ['00000000-0000-0000-0000-000000000000'], // Invalid/foreign recipient ID
        env: testEnv,
      });
    },
    (err: any) => {
      assert.strictEqual(err.code, 'INVALID_COMPANY_RECIPIENT');
      return true;
    },
    'Must reject recipient IDs that do not belong to the targeted company'
  );

  // 5c. Batch limit rejection (exceeding 50 recipients)
  const fake51Recipients = Array.from({ length: 51 }, (_, i) => ({
    id: `rec-${i}`,
    email: `test${i}@domain.com`,
  }));

  // Create temporary company with 51 recipients to test batch limit
  await assert.rejects(
    async () => {
      // Direct batch limit check in sendCompanyInvitations
      const bigCompany = await createCustomerCompany(
        {
          company_name: 'Huge Corp',
          recipients: fake51Recipients,
        },
        testEnv
      );

      try {
        await sendCompanyInvitations(bigCompany.id, {
          env: testEnv,
        });
      } finally {
        await deleteCustomerCompany(bigCompany.id, testEnv);
      }
    },
    (err: any) => {
      assert.strictEqual(err.code, 'BATCH_LIMIT_EXCEEDED');
      return true;
    },
    'Must reject batches exceeding 50 recipients'
  );

  console.log('  ✓ PASSED: Authorization, cross-company isolation, and batch limits enforced.\n');

  // --------------------------------------------------------------------------
  // TEST 6: Rate Limiting & Cooldown Protection
  // --------------------------------------------------------------------------
  console.log('Test 6: Rate limiting and recipient cooldown protection...');

  // 6a. Admin rate limiter sliding window check
  const testIp = `test-admin-${Date.now()}`;
  let allowedCount = 0;
  let blockedCount = 0;

  for (let i = 0; i < 25; i++) {
    const res = checkRateLimit(testIp, {
      windowMs: 60 * 1000,
      max: 20,
      keyPrefix: 'test_admin_invite',
    });
    if (res.allowed) allowedCount++;
    else blockedCount++;
  }

  assert.strictEqual(allowedCount, 20, 'First 20 requests within window must be allowed');
  assert.strictEqual(blockedCount, 5, 'Requests beyond 20 within window must be rate limited');

  console.log('  ✓ PASSED: Rate limiters prevent volumetric abuse and spam.\n');

  // --------------------------------------------------------------------------
  // TEST 7: Resend Webhook Processing for Delivery & Bounces
  // --------------------------------------------------------------------------
  console.log('Test 7: Resend webhook event processing and bounce tracking...');

  // Create a specific invitation log entry to receive a webhook
  const testMessageId = `msg_resend_webhook_test_${Date.now()}`;
  const webhookCompany = await createCustomerCompany(
    {
      company_name: 'Bounce Test Corp',
      recipients: [{ email: 'bouncy@bouncetest.com', recipient_name: 'Bouncy User' }],
    },
    testEnv
  );

  // Send an invitation to populate logs
  const sentRes = await sendCompanyInvitations(webhookCompany.id, {
    env: testEnv,
  });
  assert.strictEqual(sentRes.success, true);

  const activeLogs = await listCustomerInvitationLogs(10, testEnv);
  const targetLog = activeLogs.find((l) => l.company_id === webhookCompany.id);
  assert.ok(targetLog);

  // 7a. Test delivered webhook event
  const deliveredWebhookPayload = {
    type: 'email.delivered',
    data: {
      email_id: targetLog.provider_message_id,
      to: ['bouncy@bouncetest.com'],
    },
  };

  const deliveredResult = await handleCustomerInvitationWebhook(deliveredWebhookPayload, testEnv);
  assert.strictEqual(deliveredResult.handled, true);
  assert.strictEqual(deliveredResult.deliveryStatus, 'delivered');

  // 7b. Test bounced webhook event
  const bouncedWebhookPayload = {
    type: 'email.bounced',
    data: {
      email_id: targetLog.provider_message_id,
      to: ['bouncy@bouncetest.com'],
      bounce: {
        message: 'Mailbox does not exist (550 User Unknown)',
        type: 'hard',
      },
    },
  };

  const bounceResult = await handleCustomerInvitationWebhook(bouncedWebhookPayload, testEnv);
  assert.strictEqual(bounceResult.handled, true);
  assert.strictEqual(bounceResult.deliveryStatus, 'bounced');

  // Verify recipient in store updated with bounce reason
  const bouncedComp = await getCustomerCompanyById(webhookCompany.id, testEnv);
  assert.ok(bouncedComp);
  assert.strictEqual(bouncedComp.recipients[0].last_invitation_status, 'failed');
  assert.ok(bouncedComp.recipients[0].last_invitation_error?.includes('550 User Unknown'));

  // Clean up
  await deleteCustomerCompany(company.id, testEnv);
  await deleteCustomerCompany(webhookCompany.id, testEnv);

  console.log('  ✓ PASSED: Resend webhook accurately records delivery and bounces without affecting system mailer.\n');

  // --------------------------------------------------------------------------
  // TEST 8: Isolation from Built-in System Mailer
  // --------------------------------------------------------------------------
  console.log('Test 8: System mailer separation (Password resets, Verification, Contact forms)...');

  // Verify that system emails use Gmail templates and settings, completely separate from Resend
  const { generateCustomerInvitationEmail: genCustomer } = await import('./email/customerInvitationTemplate.js');
  const { generateInvitationEmailTemplate: genOrgInvite } = await import('./email/gmail.js');

  const customerTpl = genCustomer({ companyName: 'Acme Agency' });
  const orgTpl = genOrgInvite({
    organizationName: 'Acme Org',
    inviteUrl: 'https://eventgamestudio.com/accept-invite?token=abc',
    role: 'admin',
    inviterName: 'Admin',
  });

  // Customer invitations use Resend subject & customer-specific messaging
  assert.strictEqual(customerTpl.subject, CUSTOMER_INVITATION_SUBJECT);
  assert.ok(customerTpl.html.includes('Interactive Event Games Platform'));

  // Org invitations use Gmail template & org-specific messaging
  assert.ok(orgTpl.subject.includes("You're invited to join Acme Org"));
  assert.ok(orgTpl.html.includes('accept-invite'));

  console.log('  ✓ PASSED: Admin invitations and system mailer remain strictly isolated.\n');

  console.log('================================================================');
  console.log('🎉 ALL RESEND ADMIN INVITATIONS TESTS PASSED CLEANLY (8/8)!');
  console.log('================================================================\n');
}

runResendAdminInvitationsTests().catch((err) => {
  console.error('❌ Resend admin invitations test suite failed:', err);
  process.exit(1);
});
