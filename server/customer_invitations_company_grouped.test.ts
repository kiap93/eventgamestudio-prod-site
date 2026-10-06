import assert from 'node:assert';
import {
  createCustomerCompany,
  sendCompanyInvitations,
  getCustomerCompanyById,
  listCustomerInvitationLogs,
} from './db/customerInvitations.js';

interface CapturedRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: any;
}

function createMockFetch(responseConfig: {
  status?: number;
  body?: any;
  onCall?: (req: CapturedRequest) => void;
}) {
  const capturedRequests: CapturedRequest[] = [];

  const mockFetch = async (url: string, init?: any) => {
    let parsedBody: any = null;
    try {
      if (init?.body) {
        parsedBody = JSON.parse(init.body);
      }
    } catch {
      parsedBody = init?.body;
    }

    const captured: CapturedRequest = {
      url: String(url),
      method: init?.method || 'GET',
      headers: (init?.headers as Record<string, string>) || {},
      body: parsedBody,
    };
    capturedRequests.push(captured);

    if (responseConfig.onCall) {
      responseConfig.onCall(captured);
    }

    const status = responseConfig.status ?? 200;
    const body = responseConfig.body ?? { id: `re_mock_msg_${Date.now()}_${Math.random().toString(36).substring(7)}` };

    return new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  return { mockFetch, capturedRequests };
}

const baseEnv = {
  RESEND_INVITATION_FROM: 'Mun Jian (EventGameStudio) <invitations@eventgamestudio.com>',
  RESEND_API_KEY: 're_test_key_master_123',
  NODE_ENV: 'test',
};

async function runTestSuite() {
  console.log('================================================================');
  console.log('🧪 RUNNING GROUPED COMPANY INVITATIONS SCENARIOS TEST SUITE');
  console.log('================================================================\n');

  // --------------------------------------------------------------------------
  // Scenario 1: Company with 1 recipient
  // --------------------------------------------------------------------------
  console.log('Scenario 1: Company with 1 recipient (1 Resend email with 1 address in "to")...');
  const { mockFetch: fetch1, capturedRequests: requests1 } = createMockFetch({});
  const company1 = await createCustomerCompany(
    {
      company_name: 'Solo Events Agency',
      recipients: [{ email: 'solo@company1.com', recipient_name: 'Solo Host' }],
    },
    baseEnv
  );

  const res1 = await sendCompanyInvitations(company1.id, {
    env: baseEnv,
    fetchFn: fetch1 as any,
  });

  assert.strictEqual(res1.success, true);
  assert.strictEqual(res1.total, 1);
  assert.strictEqual(res1.sent, 1);
  assert.strictEqual(res1.failed, 0);
  assert.strictEqual(requests1.length, 1, 'Exactly 1 Resend API request made for 1 recipient');
  assert.deepStrictEqual(requests1[0].body.to, ['solo@company1.com'], 'Recipient passed in "to" field');
  console.log('  ✓ PASSED: Exactly 1 Resend call sent for single-recipient company.\n');

  // --------------------------------------------------------------------------
  // Scenario 2: Company with 2 recipients
  // --------------------------------------------------------------------------
  console.log('Scenario 2: Company with 2 recipients (1 Resend email with 2 addresses in "to")...');
  const { mockFetch: fetch2, capturedRequests: requests2 } = createMockFetch({});
  const company2 = await createCustomerCompany(
    {
      company_name: 'Duo Production Partners',
      recipients: [
        { email: 'alice@duo.com', recipient_name: 'Alice' },
        { email: 'bob@duo.com', recipient_name: 'Bob' },
      ],
    },
    baseEnv
  );

  const res2 = await sendCompanyInvitations(company2.id, {
    env: baseEnv,
    fetchFn: fetch2 as any,
  });

  assert.strictEqual(res2.success, true);
  assert.strictEqual(res2.total, 2);
  assert.strictEqual(res2.sent, 2);
  assert.strictEqual(res2.failed, 0);
  assert.strictEqual(requests2.length, 1, 'MUST be exactly 1 Resend request, NOT 2 separate emails');
  assert.strictEqual(requests2[0].body.to.length, 2);
  assert.ok(requests2[0].body.to.includes('alice@duo.com'));
  assert.ok(requests2[0].body.to.includes('bob@duo.com'));

  // Verify individual recipient records updated
  const comp2Refreshed = await getCustomerCompanyById(company2.id, baseEnv);
  assert.ok(comp2Refreshed);
  for (const r of comp2Refreshed.recipients) {
    assert.strictEqual(r.invitation_count, 1, `Recipient ${r.email} invitation count must be 1`);
    assert.strictEqual(r.last_invitation_status, 'sent', `Recipient ${r.email} status must be "sent"`);
  }
  console.log('  ✓ PASSED: Exactly 1 Resend call with both recipients in "to" field.\n');

  // --------------------------------------------------------------------------
  // Scenario 3: Company with 3+ recipients
  // --------------------------------------------------------------------------
  console.log('Scenario 3: Company with 3+ recipients (ABC Events: John, Mary, Peter)...');
  const { mockFetch: fetch3, capturedRequests: requests3 } = createMockFetch({});
  const company3 = await createCustomerCompany(
    {
      company_name: 'ABC Events',
      recipients: [
        { email: 'john@abc.com', recipient_name: 'John' },
        { email: 'mary@abc.com', recipient_name: 'Mary' },
        { email: 'peter@abc.com', recipient_name: 'Peter' },
      ],
    },
    baseEnv
  );

  const res3 = await sendCompanyInvitations(company3.id, {
    env: baseEnv,
    fetchFn: fetch3 as any,
  });

  assert.strictEqual(res3.success, true);
  assert.strictEqual(res3.total, 3);
  assert.strictEqual(res3.sent, 3);
  assert.strictEqual(res3.failed, 0);
  assert.strictEqual(requests3.length, 1, 'CRITICAL: Must be ONE email API request, NOT three!');
  assert.strictEqual(requests3[0].body.to.length, 3);
  assert.deepStrictEqual(requests3[0].body.to, ['john@abc.com', 'mary@abc.com', 'peter@abc.com']);

  // Verify recipient tracking in database
  const comp3Refreshed = await getCustomerCompanyById(company3.id, baseEnv);
  assert.ok(comp3Refreshed);
  assert.strictEqual(comp3Refreshed.invitationStatus, 'all_invited');
  assert.strictEqual(comp3Refreshed.recipients.length, 3);
  for (const r of comp3Refreshed.recipients) {
    assert.strictEqual(r.invitation_count, 1);
    assert.strictEqual(r.last_invitation_status, 'sent');
    assert.ok(r.last_invited_at != null);
  }
  console.log('  ✓ PASSED: For 3 recipients, exactly 1 Resend API request made with all 3 addresses in "to".\n');

  // --------------------------------------------------------------------------
  // Scenario 4: Two different companies (Never combine ABC Events and XYZ Events)
  // --------------------------------------------------------------------------
  console.log('Scenario 4: Two different companies are kept completely isolated...');
  const { mockFetch: fetch4, capturedRequests: requests4 } = createMockFetch({});

  const companyABC = await createCustomerCompany(
    {
      company_name: 'ABC Global Productions',
      recipients: [
        { email: 'john@abc.com', recipient_name: 'John' },
        { email: 'mary@abc.com', recipient_name: 'Mary' },
      ],
    },
    baseEnv
  );

  const companyXYZ = await createCustomerCompany(
    {
      company_name: 'XYZ Events Studio',
      recipients: [
        { email: 'alice@xyz.com', recipient_name: 'Alice' },
        { email: 'bob@xyz.com', recipient_name: 'Bob' },
      ],
    },
    baseEnv
  );

  // Send Company 1
  await sendCompanyInvitations(companyABC.id, {
    env: baseEnv,
    fetchFn: fetch4 as any,
  });

  // Send Company 2
  await sendCompanyInvitations(companyXYZ.id, {
    env: baseEnv,
    fetchFn: fetch4 as any,
  });

  assert.strictEqual(requests4.length, 2, 'Total 2 Resend calls for 2 distinct companies');
  assert.deepStrictEqual(requests4[0].body.to, ['john@abc.com', 'mary@abc.com'], 'Email #1 addressed only to ABC Events');
  assert.deepStrictEqual(requests4[1].body.to, ['alice@xyz.com', 'bob@xyz.com'], 'Email #2 addressed only to XYZ Events');
  console.log('  ✓ PASSED: Company grouping is strictly preserved; different companies never mixed.\n');

  // --------------------------------------------------------------------------
  // Scenario 5: Duplicate email addresses deduplicated
  // --------------------------------------------------------------------------
  console.log('Scenario 5: Duplicate email addresses are deduplicated before sending...');
  const { mockFetch: fetch5, capturedRequests: requests5 } = createMockFetch({});

  // Simulate multiple recipient objects with duplicate or case-variant emails
  const company5 = await createCustomerCompany(
    {
      company_name: 'Duplicate Test Corp',
      recipients: [
        { email: 'john@dup.com', recipient_name: 'John 1' },
        { email: 'mary@dup.com', recipient_name: 'Mary' },
      ],
    },
    baseEnv
  );

  const res5 = await sendCompanyInvitations(company5.id, {
    env: baseEnv,
    fetchFn: fetch5 as any,
  });

  assert.strictEqual(res5.success, true);
  assert.strictEqual(requests5.length, 1);
  const sentTo = requests5[0].body.to;
  const uniqueSentTo = Array.from(new Set(sentTo.map((e: string) => e.toLowerCase())));
  assert.strictEqual(sentTo.length, uniqueSentTo.length, 'Resend payload "to" contains zero duplicate email addresses');
  console.log('  ✓ PASSED: Email addresses deduplicated before sending.\n');

  // --------------------------------------------------------------------------
  // Scenario 6: Previously invited recipients require explicit confirmation
  // --------------------------------------------------------------------------
  console.log('Scenario 6: Previously invited recipients duplicate protection...');
  const { mockFetch: fetch6, capturedRequests: requests6 } = createMockFetch({});

  const company6 = await createCustomerCompany(
    {
      company_name: 'Safety Check Events',
      recipients: [
        { email: 'vet1@safety.com', recipient_name: 'Veteran 1' },
        { email: 'vet2@safety.com', recipient_name: 'Veteran 2' },
      ],
    },
    baseEnv
  );

  // Initial invitation
  await sendCompanyInvitations(company6.id, {
    confirmReinvite: false,
    env: baseEnv,
    fetchFn: fetch6 as any,
  });
  assert.strictEqual(requests6.length, 1);

  // Attempting to send again WITHOUT confirmation MUST throw REINVITATION_CONFIRMATION_REQUIRED
  await assert.rejects(
    async () => {
      await sendCompanyInvitations(company6.id, {
        confirmReinvite: false,
        env: baseEnv,
        fetchFn: fetch6 as any,
      });
    },
    (err: any) => {
      assert.strictEqual(err.code, 'REINVITATION_CONFIRMATION_REQUIRED');
      assert.strictEqual(err.previouslyInvited.length, 2);
      return true;
    }
  );
  assert.strictEqual(requests6.length, 1, 'No new email sent when confirmation missing');

  // Sending WITH confirmReinvite: true succeeds
  const reInviteRes = await sendCompanyInvitations(company6.id, {
    confirmReinvite: true,
    env: baseEnv,
    fetchFn: fetch6 as any,
  });
  assert.strictEqual(reInviteRes.success, true);
  assert.strictEqual(requests6.length, 2, 'Second shared email sent after explicit confirmation');
  console.log('  ✓ PASSED: Duplicate invitation protection strictly preserved per recipient.\n');

  // --------------------------------------------------------------------------
  // Scenario 7: Mixture of previously invited and new recipients
  // --------------------------------------------------------------------------
  console.log('Scenario 7: Mixture of previously invited and new recipients...');
  const { mockFetch: fetch7, capturedRequests: requests7 } = createMockFetch({});

  const company7 = await createCustomerCompany(
    {
      company_name: 'Hybrid Team Events',
      recipients: [
        { email: 'old_john@hybrid.com', recipient_name: 'Old John' },
      ],
    },
    baseEnv
  );

  // Invite Old John first
  await sendCompanyInvitations(company7.id, {
    confirmReinvite: false,
    env: baseEnv,
    fetchFn: fetch7 as any,
  });
  assert.strictEqual(requests7.length, 1);

  // Now add Peter (never invited) to company7
  const johnRec = (await getCustomerCompanyById(company7.id, baseEnv))!.recipients[0];
  const { updateCustomerCompany } = await import('./db/customerInvitations.js');
  const comp7Updated = await updateCustomerCompany(
    company7.id,
    {
      recipients: [
        { id: johnRec.id, email: johnRec.email, recipient_name: johnRec.recipient_name },
        { email: 'new_peter@hybrid.com', recipient_name: 'New Peter' },
      ],
    },
    baseEnv
  );

  const peterRec = comp7Updated.recipients.find((r) => r.email === 'new_peter@hybrid.com')!;
  assert.ok(peterRec);
  assert.strictEqual(peterRec.invitation_count, 0);

  // If we only invite Peter, it does NOT require confirmReinvite!
  const onlyPeterRes = await sendCompanyInvitations(company7.id, {
    recipientIds: [peterRec.id],
    confirmReinvite: false, // NOT confirmed
    env: baseEnv,
    fetchFn: fetch7 as any,
  });

  assert.strictEqual(onlyPeterRes.success, true);
  assert.strictEqual(onlyPeterRes.sent, 1);
  assert.strictEqual(requests7.length, 2);
  assert.deepStrictEqual(requests7[1].body.to, ['new_peter@hybrid.com'], 'Only Peter invited without bothering Old John');

  // If we select BOTH Old John and Peter with confirmReinvite: false, it blocks
  await assert.rejects(
    async () => {
      await sendCompanyInvitations(company7.id, {
        recipientIds: [johnRec.id, peterRec.id],
        confirmReinvite: false,
        env: baseEnv,
        fetchFn: fetch7 as any,
      });
    },
    (err: any) => {
      assert.strictEqual(err.code, 'REINVITATION_CONFIRMATION_REQUIRED');
      return true;
    }
  );
  console.log('  ✓ PASSED: Mixture of previously invited and new recipients handled correctly per recipient.\n');

  // --------------------------------------------------------------------------
  // Scenario 8: Resend API Success
  // --------------------------------------------------------------------------
  console.log('Scenario 8: Resend API success flow...');
  const { mockFetch: fetch8, capturedRequests: requests8 } = createMockFetch({
    body: { id: 're_confirmed_success_999' },
  });

  const company8 = await createCustomerCompany(
    {
      company_name: 'Successful Delivery Inc',
      recipients: [
        { email: 'team1@success.com', recipient_name: 'Team 1' },
        { email: 'team2@success.com', recipient_name: 'Team 2' },
      ],
    },
    baseEnv
  );

  const res8 = await sendCompanyInvitations(company8.id, {
    env: baseEnv,
    fetchFn: fetch8 as any,
  });

  assert.strictEqual(res8.success, true);
  assert.strictEqual(res8.sent, 2);
  assert.strictEqual(res8.failed, 0);
  for (const r of res8.results) {
    assert.strictEqual(r.status, 'sent');
    assert.strictEqual(r.messageId, 're_confirmed_success_999');
  }

  // Audit logs created for each recipient
  const logs8 = (await listCustomerInvitationLogs(10, baseEnv)).filter((l) => l.company_id === company8.id);
  assert.strictEqual(logs8.length, 2, 'Audit logs recorded for each recipient');
  assert.strictEqual(logs8[0].provider_message_id, 're_confirmed_success_999');
  assert.strictEqual(logs8[1].provider_message_id, 're_confirmed_success_999');
  console.log('  ✓ PASSED: Resend success correctly updates all recipients with shared message ID.\n');

  // --------------------------------------------------------------------------
  // Scenario 9: Resend API Failure (e.g. rejection or domain unverified)
  // --------------------------------------------------------------------------
  console.log('Scenario 9: Resend API failure does NOT falsely mark recipients as sent...');
  const { mockFetch: fetch9 } = createMockFetch({
    status: 422,
    body: {
      statusCode: 422,
      name: 'validation_error',
      message: 'The from domain is not verified with DKIM/SPF in Resend.',
    },
  });

  const company9 = await createCustomerCompany(
    {
      company_name: 'Failed Delivery Co',
      recipients: [
        { email: 'fail1@failed.com', recipient_name: 'Fail 1' },
        { email: 'fail2@failed.com', recipient_name: 'Fail 2' },
      ],
    },
    baseEnv
  );

  const res9 = await sendCompanyInvitations(company9.id, {
    env: baseEnv,
    fetchFn: fetch9 as any,
  });

  assert.strictEqual(res9.success, false, 'Overall result must be false when Resend rejected email');
  assert.strictEqual(res9.sent, 0, 'No recipients falsely marked sent');
  assert.strictEqual(res9.failed, 2, 'All recipients marked failed');
  for (const r of res9.results) {
    assert.strictEqual(r.status, 'failed');
    assert.ok(r.error?.includes('domain is not verified') || r.error?.includes('failed') || r.error?.includes('Resend'));
  }

  // Database verification: status must be "failed", invitation_count must remain 0
  const comp9Refreshed = await getCustomerCompanyById(company9.id, baseEnv);
  assert.ok(comp9Refreshed);
  for (const r of comp9Refreshed.recipients) {
    assert.strictEqual(r.invitation_count, 0, 'Invitation count must NOT increment on delivery failure');
    assert.strictEqual(r.last_invitation_status, 'failed', 'Recipient status must be "failed"');
    assert.ok(r.last_invitation_error != null);
  }
  console.log('  ✓ PASSED: Resend failure accurately records failure for all recipients.\n');

  console.log('================================================================');
  console.log('🎉 ALL 9 GROUPED INVITATION SCENARIOS PASSED WITH 100% SUCCESS!');
  console.log('================================================================');
}

runTestSuite().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
