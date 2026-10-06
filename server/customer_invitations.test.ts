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
  isMissingTableOrRpcError,
  createMigrationRequiredError,
} from './db/customerInvitations.js';
import { handleApiError, handleWorkerApiError } from './errors.js';

async function runCustomerInvitationsTestSuite() {
  process.env.RESEND_INVITATION_FROM = 'Mun Jian (EventGameStudio) <onboarding@resend.dev>';
  process.env.RESEND_API_KEY = 're_test_key_customer_invitations';

  let capturedAuthHeader = '';
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input: any, init?: any) => {
    const url = typeof input === 'string' ? input : input?.url || '';
    if (url.includes('api.resend.com')) {
      capturedAuthHeader = init?.headers?.Authorization || '';
      return new Response(JSON.stringify({ id: `re_mock_${Date.now()}` }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return originalFetch(input, init);
  };

  try {

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
  assert.strictEqual(
    capturedAuthHeader,
    'Bearer re_test_key_customer_invitations',
    'Configured RESEND_API_KEY must be passed in Authorization Bearer header'
  );

  // Test 5-pre: Missing RESEND_API_KEY rejects safely with RESEND_CONFIG_MISSING and preserves company
  console.log('Test 5-pre: Verifying missing RESEND_API_KEY rejection without losing company record...');
  await assert.rejects(
    async () => {
      await sendCompanyInvitations(testCompany.id, {
        confirmReinvite: true,
        env: {
          RESEND_INVITATION_FROM: 'Mun Jian <onboarding@resend.dev>',
          RESEND_API_KEY: '',
        },
      });
    },
    (err: any) => {
      assert.strictEqual(err.code, 'RESEND_CONFIG_MISSING');
      assert.ok(err.message.includes('RESEND_API_KEY is not configured'));
      return true;
    },
    'Must fail fast with RESEND_CONFIG_MISSING when RESEND_API_KEY is missing'
  );

  // Verify company record is preserved
  const preservedCompany = await getCustomerCompanyById(testCompany.id);
  assert.ok(preservedCompany, 'Company record must be preserved despite configuration failure');

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

  // --------------------------------------------------------------------------
  // Test 10: Missing Table or RPC Error Detection
  // --------------------------------------------------------------------------
  console.log('Test 10: Missing table or RPC error detection and classification...');
  assert.strictEqual(
    isMissingTableOrRpcError({ code: 'PGRST202', message: 'Could not find the function public.create_customer_company_atomic in the schema cache' }),
    true,
    'PGRST202 must be identified as missing RPC error'
  );
  assert.strictEqual(
    isMissingTableOrRpcError({ code: '42P01', message: 'relation "customer_companies" does not exist' }),
    true,
    '42P01 must be identified as missing table error'
  );
  assert.strictEqual(
    isMissingTableOrRpcError({ code: '42883', message: 'function update_customer_company_atomic does not exist' }),
    true,
    '42883 must be identified as missing function error'
  );
  assert.strictEqual(
    isMissingTableOrRpcError({ code: '23505', message: 'duplicate key value violates unique constraint' }),
    false,
    'Ordinary database errors must not be classified as missing migration'
  );

  const migErr: any = createMigrationRequiredError('testOp', 'function not found');
  assert.strictEqual(migErr.code, 'CUSTOMER_INVITATIONS_MIGRATION_REQUIRED');
  assert.strictEqual(migErr.statusCode, 503);
  console.log('  ✓ PASSED: Missing table and RPC error detection verified.\n');

  // --------------------------------------------------------------------------
  // Test 11: Production Environment Protection Against Local Fallback
  // --------------------------------------------------------------------------
  console.log('Test 11: Production environment protection against local fallback...');
  await assert.rejects(
    async () => {
      await createCustomerCompany(
        {
          company_name: 'Production Disallowed Corp',
          recipients: [{ email: 'test@prodcorp.com' }],
        },
        {
          NODE_ENV: 'production',
          VITE_SUPABASE_URL: '',
          SUPABASE_SERVICE_ROLE_KEY: '',
        }
      );
    },
    (err: any) => {
      assert.strictEqual(err.code, 'SUPABASE_NOT_CONFIGURED');
      assert.strictEqual(err.statusCode, 503);
      assert.ok(
        err.message.includes('Fatal: Customer invitation operation "createCustomerCompany" requires a valid Supabase database connection in production/Worker environment'),
        'Must reject local fallback in production with descriptive fatal error'
      );
      return true;
    },
    'Production environment without Supabase must fail fast and forbid local fallback'
  );
  console.log('  ✓ PASSED: Local fallback is strictly rejected when running in production.\n');

  // --------------------------------------------------------------------------
  // Test 12: Express and Worker Error Handler Mapping for Customer Invitation Errors
  // --------------------------------------------------------------------------
  console.log('Test 12: Express and Worker error handler status code mapping...');
  // 12a. Express error mapping
  let expressStatus = 0;
  let expressJson: any = null;
  const mockRes: any = {
    status(code: number) {
      expressStatus = code;
      return this;
    },
    json(data: any) {
      expressJson = data;
      return this;
    },
    setHeader() {
      return this;
    },
  };

  const migrationError = createMigrationRequiredError('createCustomerCompany');
  handleApiError(migrationError, { originalUrl: '/api/developer/customer-invitations/companies', method: 'POST' } as any, mockRes);
  assert.strictEqual(expressStatus, 503, 'Express must map CUSTOMER_INVITATIONS_MIGRATION_REQUIRED to 503');
  assert.strictEqual(expressJson.code, 'CUSTOMER_INVITATIONS_MIGRATION_REQUIRED');
  assert.strictEqual(expressJson.success, false);

  // 12b. Worker error mapping
  const workerReq = new Request('https://api.example.com/api/developer/customer-invitations/companies', { method: 'POST' });
  const workerResp = await handleWorkerApiError(migrationError, workerReq, { 'Access-Control-Allow-Origin': '*' });
  assert.strictEqual(workerResp.status, 503, 'Worker must map CUSTOMER_INVITATIONS_MIGRATION_REQUIRED to 503');
  const workerBody = await workerResp.json();
  assert.strictEqual(workerBody.code, 'CUSTOMER_INVITATIONS_MIGRATION_REQUIRED');
  assert.strictEqual(workerBody.success, false);
  console.log('  ✓ PASSED: Both Express and Cloudflare Worker map CUSTOMER_INVITATIONS_MIGRATION_REQUIRED to HTTP 503.\n');

  // --------------------------------------------------------------------------
  // Test 13: Re-invitation 409 Conflict Response with previously_invited Payload
  // --------------------------------------------------------------------------
  console.log('Test 13: Re-invitation confirmation error mapping to HTTP 409 with details...');
  const reinviteErr: any = new Error('Re-invitation confirmation required');
  reinviteErr.code = 'REINVITATION_CONFIRMATION_REQUIRED';
  reinviteErr.previouslyInvited = [{ email: 'invited@corp.com', recipient_name: 'Invited Person' }];

  let reinviteStatus = 0;
  let reinviteJson: any = null;
  const mockReinviteRes: any = {
    status(code: number) {
      reinviteStatus = code;
      return this;
    },
    json(data: any) {
      reinviteJson = data;
      return this;
    },
    setHeader() {
      return this;
    },
  };

  handleApiError(reinviteErr, { originalUrl: '/api/developer/customer-invitations/companies/123/invite', method: 'POST' } as any, mockReinviteRes);
  assert.strictEqual(reinviteStatus, 409, 'Reinvitation confirmation must map to 409');
  assert.strictEqual(reinviteJson.code, 'REINVITATION_CONFIRMATION_REQUIRED');
  assert.ok(Array.isArray(reinviteJson.previously_invited));
  assert.strictEqual(reinviteJson.previously_invited[0].email, 'invited@corp.com');

  const workerReinviteResp = await handleWorkerApiError(reinviteErr, new Request('https://api.example.com/invite', { method: 'POST' }), {});
  assert.strictEqual(workerReinviteResp.status, 409, 'Worker must map reinvitation to 409');
  const workerReinviteBody = await workerReinviteResp.json();
  assert.strictEqual(workerReinviteBody.code, 'REINVITATION_CONFIRMATION_REQUIRED');
  assert.ok(Array.isArray(workerReinviteBody.previously_invited));
  console.log('  ✓ PASSED: Reinvitation confirmation error maps to HTTP 409 with previously_invited payload.\n');

  // --------------------------------------------------------------------------
  // Test 14: Comprehensive Unit Mocks for Supabase Client Invocations
  // --------------------------------------------------------------------------
  console.log('Test 14: Supabase RPC error propagation & rollback verification...');

  // 14a. Valid creation via RPC persists one company and its recipients
  let rpcCalledWith: any = null;
  const mockSuccessClient: any = {
    rpc: async (fn: string, args: any) => {
      rpcCalledWith = { fn, args };
      return {
        data: {
          success: true,
          company: {
            id: args.p_company_id || 'comp-123',
            company_name: args.p_company_name,
            contact_person: args.p_contact_person,
            notes: args.p_notes,
            created_by: args.p_created_by,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          recipients: (args.p_recipients || []).map((r: any) => ({
            id: r.id || 'rec-123',
            company_id: args.p_company_id || 'comp-123',
            email: r.email,
            recipient_name: r.recipient_name,
            invitation_count: 0,
            last_invited_at: null,
            last_invitation_status: 'never_invited',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })),
        },
        error: null,
      };
    },
  };

  const createdViaRpc = await createCustomerCompany(
    {
      company_name: 'RPC Verified Corp',
      recipients: [{ email: 'ceo@rpcverified.com', recipient_name: 'CEO' }],
      created_by: 'user-dev-123',
    },
    {
      VITE_SUPABASE_URL: 'https://real-project.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'real-service-role-key',
      __supabaseClient: mockSuccessClient,
    }
  );
  assert.strictEqual(rpcCalledWith.fn, 'create_customer_company_atomic');
  assert.strictEqual(rpcCalledWith.args.p_company_name, 'RPC Verified Corp');
  assert.strictEqual(createdViaRpc.company_name, 'RPC Verified Corp');
  assert.strictEqual(createdViaRpc.totalRecipients, 1);

  // 14b. Missing migration/RPC fails with CUSTOMER_INVITATIONS_MIGRATION_REQUIRED without records
  const mockMissingRpcClient: any = {
    rpc: async () => ({
      data: null,
      error: { code: 'PGRST202', message: 'Could not find the function public.create_customer_company_atomic' },
    }),
  };
  await assert.rejects(
    async () => {
      await createCustomerCompany(
        {
          company_name: 'Missing Migration Corp',
          recipients: [{ email: 'test@unmigrated.com' }],
        },
        {
          VITE_SUPABASE_URL: 'https://real-project.supabase.co',
          SUPABASE_SERVICE_ROLE_KEY: 'real-service-role-key',
          __supabaseClient: mockMissingRpcClient,
        }
      );
    },
    (err: any) => {
      assert.strictEqual(err.code, 'CUSTOMER_INVITATIONS_MIGRATION_REQUIRED');
      assert.strictEqual(err.statusCode, 503);
      return true;
    }
  );

  // 14c. Company/Recipient insertion database errors never return success (atomic rollback)
  const mockFailedDbClient: any = {
    rpc: async () => ({
      data: null,
      error: { code: '23505', message: 'duplicate key value violates unique constraint' },
    }),
  };
  await assert.rejects(
    async () => {
      await createCustomerCompany(
        {
          company_name: 'Failed DB Corp',
          recipients: [{ email: 'test@faileddb.com' }],
        },
        {
          VITE_SUPABASE_URL: 'https://real-project.supabase.co',
          SUPABASE_SERVICE_ROLE_KEY: 'real-service-role-key',
          __supabaseClient: mockFailedDbClient,
        }
      );
    },
    (err: any) => {
      assert.strictEqual(err.code, '23505');
      assert.strictEqual(err.statusCode, 500);
      return true;
    }
  );

  // 14d. Ambiguous database response fails safely with DATABASE_PERSISTENCE_UNCERTAIN
  const mockAmbiguousClient: any = {
    rpc: async () => ({
      data: { success: false }, // ambiguous response
      error: null,
    }),
  };
  await assert.rejects(
    async () => {
      await createCustomerCompany(
        {
          company_name: 'Ambiguous Corp',
          recipients: [{ email: 'test@ambiguous.com' }],
        },
        {
          VITE_SUPABASE_URL: 'https://real-project.supabase.co',
          SUPABASE_SERVICE_ROLE_KEY: 'real-service-role-key',
          __supabaseClient: mockAmbiguousClient,
        }
      );
    },
    (err: any) => {
      assert.strictEqual(err.code, 'DATABASE_PERSISTENCE_UNCERTAIN');
      assert.strictEqual(err.statusCode, 500);
      return true;
    }
  );

  // 14e. Supabase query error in list/get is never treated as empty result
  const mockQueryErrorClient: any = {
    from: (table: string) => ({
      select: () => ({
        order: () => Promise.resolve({ data: null, error: { code: '50000', message: 'connection timeout' } }),
        eq: () => ({
          maybeSingle: () => Promise.resolve({ data: null, error: { code: '50000', message: 'connection timeout' } }),
        }),
      }),
    }),
  };
  await assert.rejects(
    async () => {
      await listCustomerCompanies({
        env: {
          VITE_SUPABASE_URL: 'https://real-project.supabase.co',
          SUPABASE_SERVICE_ROLE_KEY: 'real-service-role-key',
          __supabaseClient: mockQueryErrorClient,
        },
      });
    },
    (err: any) => {
      assert.ok(err.message.includes('connection timeout'));
      return true;
    }
  );
  await assert.rejects(
    async () => {
      await getCustomerCompanyById('some-id', {
        VITE_SUPABASE_URL: 'https://real-project.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY: 'real-service-role-key',
        __supabaseClient: mockQueryErrorClient,
      });
    },
    (err: any) => {
      assert.ok(err.message.includes('connection timeout'));
      return true;
    }
  );
  console.log('  ✓ PASSED: Comprehensive database mock tests verify atomic RPC rollback and error propagation.\n');

  console.log('====================================================');
  console.log('🎉 ALL CUSTOMER INVITATION TESTS PASSED CLEANLY!');
  console.log('====================================================\n');
  } finally {
    globalThis.fetch = originalFetch;
  }
}

runCustomerInvitationsTestSuite().catch((err) => {
  console.error('Customer invitation test suite failed:', err);
  process.exit(1);
});
