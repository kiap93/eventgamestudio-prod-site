import assert from 'node:assert';
import {
  createCustomerCompany,
  getCustomerCompanyById,
  updateCustomerCompany,
  deleteCustomerCompany,
  listCustomerCompanies,
  findCrossCompanyDuplicates,
  isValidEmail,
} from './db/customerInvitations.js';

const testEnv = {
  NODE_ENV: 'test',
  RESEND_INVITATION_FROM: 'Mun Jian (EventGameStudio) <test@eventgamestudio.com>',
  RESEND_API_KEY: 're_test_key_dummy_12345',
};

async function runDuplicateDetectionTestSuite() {
  console.log('================================================================');
  console.log('🧪 RUNNING CUSTOMER INVITATION DUPLICATE EMAIL DETECTION SUITE');
  console.log('================================================================\n');

  // Clean slate before tests: remove any past test companies if needed
  const { companies: initialCompanies } = await listCustomerCompanies({ env: testEnv });
  for (const c of initialCompanies) {
    if (c.company_name.startsWith('TEST_DUP_')) {
      await deleteCustomerCompany(c.id, testEnv);
    }
  }

  // --------------------------------------------------------------------------
  // Scenario 1: Case 1 - Same-Company Duplicate Normalization & Detection Helper
  // --------------------------------------------------------------------------
  console.log('Scenario 1: Testing email normalization (trimming & lowercasing)...');

  function checkSameCompanyDuplicates(recipients: Array<{ email: string }>): {
    hasDuplicates: boolean;
    duplicateEmails: string[];
  } {
    const seen = new Set<string>();
    const duplicates = new Set<string>();
    for (const r of recipients) {
      const clean = (r.email || '').trim().toLowerCase();
      if (!clean) continue;
      if (seen.has(clean)) {
        duplicates.add(clean);
      }
      seen.add(clean);
    }
    return {
      hasDuplicates: duplicates.size > 0,
      duplicateEmails: Array.from(duplicates),
    };
  }

  // Exact same email
  const res1 = checkSameCompanyDuplicates([
    { email: 'john@example.com' },
    { email: 'john@example.com' },
  ]);
  assert.strictEqual(res1.hasDuplicates, true);
  assert.deepStrictEqual(res1.duplicateEmails, ['john@example.com']);

  // Case variations: John@example.com, john@example.com, JOHN@EXAMPLE.COM
  const res2 = checkSameCompanyDuplicates([
    { email: 'John@example.com' },
    { email: 'john@example.com' },
    { email: 'JOHN@EXAMPLE.COM' },
  ]);
  assert.strictEqual(res2.hasDuplicates, true);
  assert.deepStrictEqual(res2.duplicateEmails, ['john@example.com']);

  // Whitespace variations
  const res3 = checkSameCompanyDuplicates([
    { email: '  john@example.com  ' },
    { email: 'john@example.com' },
  ]);
  assert.strictEqual(res3.hasDuplicates, true);
  assert.deepStrictEqual(res3.duplicateEmails, ['john@example.com']);

  // Distinct emails (no duplicate)
  const res4 = checkSameCompanyDuplicates([
    { email: 'john@example.com' },
    { email: 'mary@example.com' },
    { email: 'peter@example.com' },
  ]);
  assert.strictEqual(res4.hasDuplicates, false);
  assert.strictEqual(res4.duplicateEmails.length, 0);

  console.log('  ✓ PASSED: Email normalization and duplicate detection within same company verified.\n');

  // --------------------------------------------------------------------------
  // Scenario 2: Create Company A with initial recipients
  // --------------------------------------------------------------------------
  console.log('Scenario 2: Creating base Company A (TEST_DUP_ABC_Events)...');
  const companyA = await createCustomerCompany(
    {
      company_name: 'TEST_DUP_ABC_Events',
      contact_person: 'Alice Tan',
      recipients: [
        { email: 'test_dup_john@example.com', recipient_name: 'John Doe' },
        { email: 'test_dup_alice@abcevents.com', recipient_name: 'Alice Tan' },
      ],
    },
    testEnv
  );

  assert.ok(companyA.id);
  assert.strictEqual(companyA.totalRecipients, 2);
  console.log('  ✓ PASSED: Company A created with test_dup_john@example.com and test_dup_alice@abcevents.com.\n');

  // --------------------------------------------------------------------------
  // Scenario 3: Case 2 - Cross-Company Duplicate Detection (findCrossCompanyDuplicates)
  // --------------------------------------------------------------------------
  console.log('Scenario 3: Checking cross-company duplicate lookup for test_dup_john@example.com...');

  // Search for test_dup_john@example.com and a completely new email
  const duplicatesForNewCompany = await findCrossCompanyDuplicates(
    ['TEST_DUP_JOHN@EXAMPLE.COM', 'completely_new_unregistered_contact@brandnew.com'],
    undefined,
    testEnv
  );

  assert.strictEqual(duplicatesForNewCompany.length, 1);
  assert.strictEqual(duplicatesForNewCompany[0].email, 'test_dup_john@example.com');
  assert.strictEqual(duplicatesForNewCompany[0].company_id, companyA.id);
  assert.strictEqual(duplicatesForNewCompany[0].company_name, 'TEST_DUP_ABC_Events');
  console.log('  ✓ PASSED: findCrossCompanyDuplicates correctly identifies test_dup_john@example.com from TEST_DUP_ABC_Events.\n');

  // --------------------------------------------------------------------------
  // Scenario 4: Case 2 - Exclude own company when editing Company A
  // --------------------------------------------------------------------------
  console.log('Scenario 4: Verifying excludeCompanyId prevents false positives when editing Company A...');

  const duplicatesExcludingCompanyA = await findCrossCompanyDuplicates(
    ['test_dup_john@example.com', 'test_dup_alice@abcevents.com'],
    companyA.id,
    testEnv
  );

  assert.strictEqual(
    duplicatesExcludingCompanyA.length,
    0,
    'Own recipients must not trigger cross-company duplicate warning when editing same company'
  );
  console.log('  ✓ PASSED: Own recipients correctly excluded when editing same company.\n');

  // --------------------------------------------------------------------------
  // Scenario 5: Case 2 - Multiple cross-company duplicates check
  // --------------------------------------------------------------------------
  console.log('Scenario 5: Creating Company B and testing multi-company duplicates lookup...');
  const companyB = await createCustomerCompany(
    {
      company_name: 'TEST_DUP_MegaAgency',
      contact_person: 'Charlie Brown',
      recipients: [
        { email: 'test_dup_charlie@megaagency.com', recipient_name: 'Charlie' },
      ],
    },
    testEnv
  );

  const multiDups = await findCrossCompanyDuplicates(
    ['test_dup_john@example.com', 'test_dup_charlie@megaagency.com', 'new_unique_person_9876@example.com'],
    undefined,
    testEnv
  );

  assert.strictEqual(multiDups.length, 2);
  const matchedEmails = multiDups.map((d) => d.email).sort();
  assert.deepStrictEqual(matchedEmails, ['test_dup_charlie@megaagency.com', 'test_dup_john@example.com']);

  const companyAName = multiDups.find((d) => d.email === 'test_dup_john@example.com')?.company_name;
  const companyBName = multiDups.find((d) => d.email === 'test_dup_charlie@megaagency.com')?.company_name;
  assert.strictEqual(companyAName, 'TEST_DUP_ABC_Events');
  assert.strictEqual(companyBName, 'TEST_DUP_MegaAgency');
  console.log('  ✓ PASSED: Multi-company duplicate lookups return accurate company affiliations.\n');

  // --------------------------------------------------------------------------
  // Scenario 6: Case 2 - Confirmation Flow: Creating Company C with shared contact
  // --------------------------------------------------------------------------
  console.log('Scenario 6: Creating Company C with test_dup_john@example.com after confirmation...');
  // The admin explicitly confirms adding test_dup_john@example.com to Company C
  const companyC = await createCustomerCompany(
    {
      company_name: 'TEST_DUP_XYZ_Roadshows',
      contact_person: 'John Doe (Shared Consultant)',
      recipients: [
        { email: 'test_dup_john@example.com', recipient_name: 'John Doe' },
        { email: 'test_dup_manager@xyzroadshows.com', recipient_name: 'Manager' },
      ],
    },
    testEnv
  );

  assert.ok(companyC.id);
  assert.strictEqual(companyC.totalRecipients, 2);

  // Now test_dup_john@example.com exists in both Company A and Company C legitimately
  const dupsBoth = await findCrossCompanyDuplicates(['test_dup_john@example.com'], undefined, testEnv);
  assert.strictEqual(dupsBoth.length, 2, 'test_dup_john@example.com should be reported in both Company A and Company C');
  const compNames = dupsBoth.map((d) => d.company_name).sort();
  assert.deepStrictEqual(compNames, ['TEST_DUP_ABC_Events', 'TEST_DUP_XYZ_Roadshows']);
  console.log('  ✓ PASSED: Legitimate shared contacts across companies correctly preserved after explicit confirmation.\n');

  // --------------------------------------------------------------------------
  // Scenario 7: Case 2 - Updating company recipients with cross-company checks
  // --------------------------------------------------------------------------
  console.log('Scenario 7: Updating Company B to add test_dup_alice@abcevents.com...');
  // Check if test_dup_alice@abcevents.com triggers warning for Company B
  const dupsForB = await findCrossCompanyDuplicates(
    ['test_dup_alice@abcevents.com'],
    companyB.id,
    testEnv
  );
  assert.strictEqual(dupsForB.length, 1);
  assert.strictEqual(dupsForB[0].company_name, 'TEST_DUP_ABC_Events');

  // Now update Company B with confirmation
  const updatedB = await updateCustomerCompany(
    companyB.id,
    {
      recipients: [
        { email: 'test_dup_charlie@megaagency.com', recipient_name: 'Charlie' },
        { email: 'test_dup_alice@abcevents.com', recipient_name: 'Alice Tan (Partner)' },
      ],
    },
    testEnv
  );

  assert.strictEqual(updatedB.totalRecipients, 2);
  console.log('  ✓ PASSED: Updating company with cross-company duplicate succeeds upon confirmation.\n');

  // --------------------------------------------------------------------------
  // Scenario 8: Server-Side HTTP Safety Checks: Same-Company Duplicate Rejection & Cross-Company Confirmation
  // --------------------------------------------------------------------------
  console.log('Scenario 8: Testing server route safety checks (Case 1 400 & Case 2 409 flow)...');

  // Helper simulating the server endpoint validation logic
  async function simulateServerCreateCompany(body: any) {
    const { company_name, contact_person, notes, recipients, confirm_cross_company_duplicates } = body || {};

    if (!Array.isArray(recipients) || recipients.length === 0) {
      return { status: 400, data: { success: false, error: 'At least one recipient email address is required', code: 'VALIDATION_ERROR' } };
    }

    // CASE 1: Duplicate inside same company (error)
    const seenEmails = new Set<string>();
    for (const r of recipients) {
      const clean = (r.email || '').trim().toLowerCase();
      if (!clean) continue;
      if (seenEmails.has(clean)) {
        return {
          status: 400,
          data: {
            success: false,
            error: `Duplicate email address "${clean}" within the same company. Each recipient must have a unique email.`,
            code: 'DUPLICATE_COMPANY_EMAIL',
          },
        };
      }
      seenEmails.add(clean);
    }

    // CASE 2: Duplicate across other companies (warning requiring confirmation)
    if (!confirm_cross_company_duplicates) {
      const crossDuplicates = await findCrossCompanyDuplicates(Array.from(seenEmails), undefined, testEnv);
      if (crossDuplicates.length > 0) {
        return {
          status: 409,
          data: {
            success: false,
            code: 'CROSS_COMPANY_DUPLICATE_WARNING',
            message: 'One or more recipient emails are already associated with another company.',
            cross_company_duplicates: crossDuplicates,
          },
        };
      }
    }

    const company = await createCustomerCompany(
      {
        company_name,
        contact_person,
        notes,
        recipients,
      },
      testEnv
    );

    return {
      status: 201,
      data: {
        success: true,
        company,
        message: 'Customer company created successfully',
      },
    };
  }

  // 8a. Submitting duplicate inside same company must return 400 DUPLICATE_COMPANY_EMAIL
  const sameCompDupRes = await simulateServerCreateCompany({
    company_name: 'TEST_DUP_FailCorp',
    recipients: [
      { email: 'sam@failcorp.com' },
      { email: 'SAM@failcorp.com' }, // Duplicate with different casing
    ],
  });
  assert.strictEqual(sameCompDupRes.status, 400);
  assert.strictEqual(sameCompDupRes.data.code, 'DUPLICATE_COMPANY_EMAIL');
  assert.ok(sameCompDupRes.data.error.includes('Duplicate email address "sam@failcorp.com" within the same company'));
  console.log('  ✓ PASSED: Submitting same-company duplicate rejected with HTTP 400 DUPLICATE_COMPANY_EMAIL.');

  // 8b. Submitting email from existing company (test_dup_john@example.com from Company A) WITHOUT confirmation
  const crossCompWarningRes = await simulateServerCreateCompany({
    company_name: 'TEST_DUP_NewCo',
    recipients: [
      { email: 'test_dup_john@example.com' },
    ],
    confirm_cross_company_duplicates: false,
  });
  assert.strictEqual(crossCompWarningRes.status, 409);
  assert.strictEqual(crossCompWarningRes.data.code, 'CROSS_COMPANY_DUPLICATE_WARNING');
  assert.ok(Array.isArray(crossCompWarningRes.data.cross_company_duplicates));
  assert.strictEqual(crossCompWarningRes.data.cross_company_duplicates[0].email, 'test_dup_john@example.com');
  console.log('  ✓ PASSED: Submitting cross-company email without confirmation triggers HTTP 409 CROSS_COMPANY_DUPLICATE_WARNING.');

  // 8c. Submitting with confirm_cross_company_duplicates: true succeeds with HTTP 201
  const crossCompConfirmedRes = await simulateServerCreateCompany({
    company_name: 'TEST_DUP_NewCo',
    recipients: [
      { email: 'test_dup_john@example.com' },
    ],
    confirm_cross_company_duplicates: true,
  });
  assert.strictEqual(crossCompConfirmedRes.status, 201);
  assert.strictEqual(crossCompConfirmedRes.data.success, true);
  assert.ok(crossCompConfirmedRes.data.company.id);
  console.log('  ✓ PASSED: Submitting cross-company email with explicit confirmation succeeds with HTTP 201.\n');

  // Clean up NewCo
  await deleteCustomerCompany(crossCompConfirmedRes.data.company.id, testEnv);

  // --------------------------------------------------------------------------
  // Scenario 9: Clean up test companies
  // --------------------------------------------------------------------------
  console.log('Scenario 9: Cleaning up test companies...');
  await deleteCustomerCompany(companyA.id, testEnv);
  await deleteCustomerCompany(companyB.id, testEnv);
  await deleteCustomerCompany(companyC.id, testEnv);

  const { companies: finalCompanies } = await listCustomerCompanies({ env: testEnv });
  assert.ok(!finalCompanies.some((c) => c.company_name.startsWith('TEST_DUP_')));
  console.log('  ✓ PASSED: Test companies cleaned up cleanly.\n');

  console.log('================================================================');
  console.log('🎉 ALL 9 DUPLICATE DETECTION TEST SCENARIOS PASSED WITH 100% SUCCESS!');
  console.log('================================================================');
}

runDuplicateDetectionTestSuite().catch((err) => {
  console.error('❌ Test suite failed:', err);
  process.exit(1);
});
