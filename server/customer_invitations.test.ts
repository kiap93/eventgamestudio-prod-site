import assert from 'node:assert';
import { generateCustomerInvitationEmail, CUSTOMER_INVITATION_SUBJECT } from './email/customerInvitationTemplate.js';
import { isResendConfigured, sendEmailViaResend } from './email/resend.js';
import {
  createCustomerCompany,
  getCustomerCompanyById,
  updateCustomerCompany,
  deleteCustomerCompany,
  listCustomerCompanies,
  sendCompanyInvitations,
  listCustomerInvitationLogs,
  getCustomerInvitationStats,
  isValidEmail,
} from './db/customerInvitations.js';

async function runCustomerInvitationsTestSuite() {
  process.env.RESEND_INVITATION_FROM = 'Mun Jian (EventGameStudio) <onboarding@resend.dev>';

  console.log('====================================================');
  console.log('TEST SUITE: ADMIN CUSTOMER INVITATIONS MANAGEMENT');
  console.log('====================================================\n');

  // --------------------------------------------------------------------------
  // Test 1: Email Template Verification
  // --------------------------------------------------------------------------
  console.log('Test 1: Email template generation, wording, and escaping...');
  const template = generateCustomerInvitationEmail({ companyName: 'Acme & "Sons" <Events>' });

  assert.strictEqual(
    template.subject,
    CUSTOMER_INVITATION_SUBJECT,
    'Subject must match "Invitation to Try EventGameStudio"'
  );
  assert.ok(template.subject === 'Invitation to Try EventGameStudio');

  // Verify dynamic company name escaping in HTML
  assert.ok(
    template.html.includes('Acme &amp; &quot;Sons&quot; &lt;Events&gt;'),
    'HTML must safely escape dynamic company name special characters'
  );
  assert.ok(
    !template.html.includes('Acme & "Sons" <Events>'),
    'Raw unescaped HTML characters must not appear in HTML template'
  );

  // Verify plain text has unescaped clean text
  assert.ok(
    template.text.includes('Acme & "Sons" <Events>'),
    'Plain text must contain readable raw company name'
  );

  // Verify required body paragraphs & wording
  assert.ok(template.text.includes('Dear Sir/Mdm,'), 'Must contain "Dear Sir/Mdm,"');
  assert.ok(
    template.text.includes('interactive game platform designed for corporate events, team activities, brand activations'),
    'Must contain core platform value description'
  );
  assert.ok(
    template.text.includes('https://eventgamestudio.com'),
    'Must include platform direct try link'
  );
  assert.ok(
    template.text.includes('Mun Jian'),
    'Must contain sign-off from Mun Jian'
  );
  assert.ok(
    template.text.includes('eventgamestudio@gmail.com'),
    'Must contain contact email eventgamestudio@gmail.com'
  );
  console.log('  ✓ PASSED: Email template generated with exact wording, dynamic escaping, and plain text alternative.\n');

  // --------------------------------------------------------------------------
  // Test 2: Email validation helper
  // --------------------------------------------------------------------------
  console.log('Test 2: Recipient email address validation...');
  assert.ok(isValidEmail('test@example.com'));
  assert.ok(isValidEmail('sarah.tan@agency.com.my'));
  assert.strictEqual(isValidEmail('invalid-email'), false);
  assert.strictEqual(isValidEmail(''), false);
  assert.strictEqual(isValidEmail('missing@domain'), false);
  console.log('  ✓ PASSED: Email validation helper works accurately.\n');

  // --------------------------------------------------------------------------
  // Test 3: Create Company with Multiple Recipients
  // --------------------------------------------------------------------------
  console.log('Test 3: Creating customer company with multiple recipients...');
  const testCompany = await createCustomerCompany({
    company_name: 'Apex Experiences & Activations',
    contact_person: 'David Lee',
    notes: 'Premium roadshow and exhibition agency',
    recipients: [
      { email: 'david@apexexp.com', recipient_name: 'David Lee' },
      { email: 'operations@apexexp.com', recipient_name: 'Operations Team' },
      { email: 'david@apexexp.com', recipient_name: 'David Duplicate' }, // Duplicate email within same company
    ],
  });

  assert.ok(testCompany.id, 'Created company must have a unique ID');
  assert.strictEqual(testCompany.company_name, 'Apex Experiences & Activations');
  assert.strictEqual(testCompany.contact_person, 'David Lee');
  assert.strictEqual(testCompany.totalRecipients, 2, 'Duplicates within same company must be automatically deduplicated');
  assert.strictEqual(testCompany.neverInvitedCount, 2, 'Recipients must start as never invited');
  assert.strictEqual(testCompany.previouslyInvitedCount, 0);
  assert.strictEqual(testCompany.invitationStatus, 'never_invited');
  console.log('  ✓ PASSED: Company created with multiple recipients and automatic duplicate email deduplication.\n');

  // --------------------------------------------------------------------------
  // Test 4: Validation Failures on Company Creation
  // --------------------------------------------------------------------------
  console.log('Test 4: Validation constraints on company creation...');
  await assert.rejects(
    async () => {
      await createCustomerCompany({
        company_name: '',
        recipients: [{ email: 'valid@example.com' }],
      });
    },
    /Company name is required/,
    'Must reject empty company name'
  );

  await assert.rejects(
    async () => {
      await createCustomerCompany({
        company_name: 'Valid Name',
        recipients: [],
      });
    },
    /At least one recipient email address is required/,
    'Must reject zero recipients'
  );

  await assert.rejects(
    async () => {
      await createCustomerCompany({
        company_name: 'Valid Name',
        recipients: [{ email: 'not-an-email' }],
      });
    },
    /Invalid email address/,
    'Must reject malformed email'
  );
  console.log('  ✓ PASSED: Validation rules strictly enforce non-empty name and valid recipient emails.\n');

  // --------------------------------------------------------------------------
  // Test 5: Re-invitation Detection and Strict Confirmation Requirement
  // --------------------------------------------------------------------------
  console.log('Test 5: Re-invitation detection and strict confirmation requirement...');
  const firstInviteResult = await sendCompanyInvitations(testCompany.id, {
    confirmReinvite: false,
  });

  assert.strictEqual(firstInviteResult.success, true);
  assert.strictEqual(firstInviteResult.total, 2);
  assert.strictEqual(firstInviteResult.sent, 2);

  // Fetch updated company
  const refreshedCompany = await getCustomerCompanyById(testCompany.id);
  assert.ok(refreshedCompany);
  assert.strictEqual(refreshedCompany.neverInvitedCount, 0);
  assert.strictEqual(refreshedCompany.previouslyInvitedCount, 2);
  assert.strictEqual(refreshedCompany.invitationStatus, 'all_invited');
  assert.ok(refreshedCompany.lastInvitedAt != null);

  // Now attempt to invite again WITHOUT explicit confirmation
  await assert.rejects(
    async () => {
      await sendCompanyInvitations(testCompany.id, {
        confirmReinvite: false, // NOT confirmed!
      });
    },
    (err: any) => {
      assert.strictEqual(err.code, 'REINVITATION_CONFIRMATION_REQUIRED');
      assert.ok(Array.isArray(err.previouslyInvited));
      assert.strictEqual(err.previouslyInvited.length, 2);
      return true;
    },
    'Server must reject re-invitation when confirmReinvite is false'
  );
  console.log('  ✓ PASSED: Re-invitation without explicit confirmation is rejected with 409 REINVITATION_CONFIRMATION_REQUIRED.\n');

  // Now send WITH explicit confirmation
  console.log('Test 5b: Re-invitation WITH explicit confirmation...');
  const reInviteResult = await sendCompanyInvitations(testCompany.id, {
    confirmReinvite: true, // EXPLICITLY confirmed!
  });

  assert.strictEqual(reInviteResult.success, true);
  assert.strictEqual(reInviteResult.sent, 2);

  const reRefreshed = await getCustomerCompanyById(testCompany.id);
  assert.ok(reRefreshed);
  for (const r of reRefreshed.recipients) {
    assert.strictEqual(r.invitation_count, 2, 'Invitation count must increment to 2');
  }
  console.log('  ✓ PASSED: Re-invitation succeeds when administrator provides explicit confirmation.\n');

  // --------------------------------------------------------------------------
  // Test 6: Audit Logs Tracking
  // --------------------------------------------------------------------------
  console.log('Test 6: Audit logs recording and retrieval...');
  const logs = await listCustomerInvitationLogs(50);
  assert.ok(logs.length >= 4, 'Must record audit logs for each recipient delivery');
  const companyLogs = logs.filter((l) => l.company_id === testCompany.id);
  assert.strictEqual(companyLogs.length, 4, 'Must have 4 log entries (2 initial + 2 re-invitations)');
  assert.strictEqual(companyLogs[0].subject, CUSTOMER_INVITATION_SUBJECT);
  assert.strictEqual(companyLogs[0].provider, 'resend');
  console.log('  ✓ PASSED: Audit logs properly record recipient, timestamp, status, and provider.\n');

  // --------------------------------------------------------------------------
  // Test 7: Update Company & Add/Remove Recipients
  // --------------------------------------------------------------------------
  console.log('Test 7: Updating company details and recipients...');
  const updatedCompany = await updateCustomerCompany(testCompany.id, {
    company_name: 'Apex Experiences Global',
    notes: 'Updated agency notes',
    recipients: [
      { id: testCompany.recipients[0].id, email: testCompany.recipients[0].email, recipient_name: 'David Lee Senior' },
      { email: 'newcontact@apexexp.com', recipient_name: 'New Contact' }, // Added new recipient
    ],
  });

  assert.strictEqual(updatedCompany.company_name, 'Apex Experiences Global');
  assert.strictEqual(updatedCompany.recipients.length, 2);
  assert.strictEqual(updatedCompany.neverInvitedCount, 1, 'Newly added recipient should be never invited');
  assert.strictEqual(updatedCompany.previouslyInvitedCount, 1, 'Preserved recipient retains previous invitation history');
  assert.strictEqual(updatedCompany.invitationStatus, 'partially_invited');
  console.log('  ✓ PASSED: Company and recipients updated successfully with status transitioning to partially_invited.\n');

  // --------------------------------------------------------------------------
  // Test 8: Search and Status Filtering
  // --------------------------------------------------------------------------
  console.log('Test 8: Search and status filtering...');
  const searchResult = await listCustomerCompanies({ search: 'Apex Experiences' });
  assert.ok(searchResult.companies.some((c) => c.id === testCompany.id));

  const filterPartially = await listCustomerCompanies({ statusFilter: 'partially_invited' });
  assert.ok(filterPartially.companies.some((c) => c.id === testCompany.id));

  const filterNever = await listCustomerCompanies({ statusFilter: 'never_invited' });
  assert.ok(!filterNever.companies.some((c) => c.id === testCompany.id));
  console.log('  ✓ PASSED: Search query and status filters correctly filter companies.\n');

  // --------------------------------------------------------------------------
  // Test 9: Delete Company
  // --------------------------------------------------------------------------
  console.log('Test 9: Deleting customer company...');
  const deleteSuccess = await deleteCustomerCompany(testCompany.id);
  assert.strictEqual(deleteSuccess, true);

  const lookupDeleted = await getCustomerCompanyById(testCompany.id);
  assert.strictEqual(lookupDeleted, null, 'Deleted company must return null');
  console.log('  ✓ PASSED: Company deleted cleanly.\n');

  console.log('====================================================');
  console.log('🎉 ALL CUSTOMER INVITATION TESTS PASSED CLEANLY!');
  console.log('====================================================\n');
}

runCustomerInvitationsTestSuite().catch((err) => {
  console.error('Customer invitation test suite failed:', err);
  process.exit(1);
});
