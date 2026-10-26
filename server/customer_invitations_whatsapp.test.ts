import { describe, it, expect } from 'bun:test';
import {
  createCustomerCompany,
  generateCustomerWhatsAppInvitation,
} from './db/customerInvitations.js';
import {
  normalizePhoneNumber,
  buildWhatsAppClickToChatUrl,
  buildWhatsAppInvitationMessage,
} from './phoneUtils.js';

describe('Customer Invitations — WhatsApp Link Generation & Workflow', () => {
  it('1. correctly normalizes Malaysian and Singaporean phone numbers', () => {
    const myPhone1 = normalizePhoneNumber('012-345 6789');
    expect(myPhone1.valid).toBe(true);
    expect(myPhone1.normalized).toBe('+60123456789');

    const myPhone2 = normalizePhoneNumber('+601136783717');
    expect(myPhone2.valid).toBe(true);
    expect(myPhone2.normalized).toBe('+601136783717');

    const sgPhone = normalizePhoneNumber('+65 9123 4567');
    expect(sgPhone.valid).toBe(true);
    expect(sgPhone.normalized).toBe('+6591234567');

    const invalid = normalizePhoneNumber('abc-xyz');
    expect(invalid.valid).toBe(false);
  });

  it('2. constructs WhatsApp click-to-chat URL with proper URL encoding', () => {
    const phone = '+60123456789';
    const message = 'Hello Sarah, welcome to EventGameStudio! https://eventgamestudio.com/accept-invite?token=xyz123';
    const waUrl = buildWhatsAppClickToChatUrl(phone, message);

    expect(waUrl.startsWith('https://wa.me/60123456789?text=')).toBe(true);
    expect(waUrl).toContain('Hello%20Sarah');
    expect(waUrl).toContain('xyz123');
  });

  it('3. generates prefilled WhatsApp invitation message with recipient and company', () => {
    const msg = buildWhatsAppInvitationMessage({
      recipientName: 'Sarah Tan',
      companyName: 'Acme Corporation',
      invitationUrl: 'https://eventgamestudio.com/accept-invite?token=test_tok_42',
    });

    expect(msg).toContain('Sarah Tan');
    expect(msg).toContain('Acme Corporation');
    expect(msg).toContain('https://eventgamestudio.com/accept-invite?token=test_tok_42');
    expect(msg).toContain('EventGameStudio');
  });

  it('4. generates full WhatsApp invitation via generateCustomerWhatsAppInvitation', async () => {
    // 1. Create a customer company with recipient having phone
    const company = await createCustomerCompany({
      company_name: 'Tech Events Asia',
      contact_person: 'David Lee',
      recipients: [
        {
          recipient_name: 'David Lee',
          email: 'david.lee@techevents.asia',
          phone: '+60198765432',
          channel: 'both',
        },
      ],
    });

    const recipient = company.recipients[0];
    expect(recipient).toBeDefined();
    expect(recipient.id).toBeDefined();

    // 2. Generate WhatsApp invitation
    const result = await generateCustomerWhatsAppInvitation({
      companyId: company.id,
      recipientId: recipient.id,
      invitedByUserId: 'dev_tester_123',
    });

    expect(result.success).toBe(true);
    expect(result.normalizedPhone).toBe('+60198765432');
    expect(result.whatsappUrl).toContain('wa.me/60198765432');
    expect(result.invitationUrl).toContain('/accept-invite?token=');
    expect(result.messageText).toContain('David Lee');
    expect(result.messageText).toContain('Tech Events Asia');
    expect(result.recipient.whatsapp_status).toBe('initiated');
    // Confirm organization and recipient role: default role must be 'admin' (valid in organization_invitations_role_check)
    expect(result.role).toBe('admin');
    expect(result.organizationId).toBeDefined();
    expect(result.invitationId).toBeDefined();

    // 3. Second call reuses and extends the active invitation (no duplicates on retry)
    const secondResult = await generateCustomerWhatsAppInvitation({
      companyId: company.id,
      recipientId: recipient.id,
      invitedByUserId: 'dev_tester_123',
    });

    expect(secondResult.success).toBe(true);
    expect(secondResult.isExistingReused).toBe(true);
    expect(secondResult.role).toBe('admin');
    expect(secondResult.invitationId).toBe(result.invitationId);
  });

  it('5. rejects WhatsApp invitation generation when recipient has no phone', async () => {
    // Create company with recipient lacking phone
    const company = await createCustomerCompany({
      company_name: 'No Phone Corp',
      recipients: [
        {
          recipient_name: 'Bob Tan',
          email: 'bob@nophone.com',
          channel: 'email',
        },
      ],
    });

    const recipient = company.recipients[0];

    await expect(
      generateCustomerWhatsAppInvitation({
        companyId: company.id,
        recipientId: recipient.id,
      })
    ).rejects.toThrow();
  });

  it('6. safely rejects invalid roles (e.g. member, superadmin, hacker)', async () => {
    const company = await createCustomerCompany({
      company_name: 'Role Security Corp',
      recipients: [
        {
          recipient_name: 'Security Test',
          email: 'security@rolesecurity.com',
          phone: '+60123456789',
        },
      ],
    });
    const recipient = company.recipients[0];

    // 'member' is invalid according to organization_invitations_role_check ('owner', 'admin', 'designer', 'viewer')
    await expect(
      generateCustomerWhatsAppInvitation({
        companyId: company.id,
        recipientId: recipient.id,
        role: 'member' as any,
      })
    ).rejects.toThrow(/Invalid role "member"/);

    // Completely arbitrary string
    await expect(
      generateCustomerWhatsAppInvitation({
        companyId: company.id,
        recipientId: recipient.id,
        role: 'superadmin' as any,
      })
    ).rejects.toThrow(/Invalid role "superadmin"/);
  });

  it('7. clamps owner role to admin to prevent privilege escalation', async () => {
    const company = await createCustomerCompany({
      company_name: 'Escalation Test Corp',
      recipients: [
        {
          recipient_name: 'Owner Attempt',
          email: 'owner.attempt@corp.com',
          phone: '+60176543210',
        },
      ],
    });
    const recipient = company.recipients[0];

    const result = await generateCustomerWhatsAppInvitation({
      companyId: company.id,
      recipientId: recipient.id,
      role: 'owner' as any,
    });

    expect(result.success).toBe(true);
    expect(result.role).toBe('admin'); // Clamped to admin for safety
  });

  it('8. supports valid alternative OrgRoles (designer, viewer)', async () => {
    const company = await createCustomerCompany({
      company_name: 'Design Studio Ltd',
      recipients: [
        {
          recipient_name: 'Designer Dan',
          email: 'dan@designstudio.com',
          phone: '+60187654321',
        },
        {
          recipient_name: 'Viewer Val',
          email: 'val@designstudio.com',
          phone: '+60187654322',
        },
      ],
    });

    const resDesigner = await generateCustomerWhatsAppInvitation({
      companyId: company.id,
      recipientId: company.recipients[0].id,
      role: 'designer',
    });
    expect(resDesigner.success).toBe(true);
    expect(resDesigner.role).toBe('designer');

    const resViewer = await generateCustomerWhatsAppInvitation({
      companyId: company.id,
      recipientId: company.recipients[1].id,
      role: 'viewer',
    });
    expect(resViewer.success).toBe(true);
    expect(resViewer.role).toBe('viewer');
  });

  it('9. verifies database check constraint organization_invitations_role_check simulation', async () => {
    // Simulate Supabase client that enforces the exact production check constraint:
    // CHECK (role IN ('owner', 'admin', 'designer', 'viewer'))
    const VALID_ROLES = ['owner', 'admin', 'designer', 'viewer'];
    let insertedRole: string | null = null;
    const company = await createCustomerCompany({
      company_name: 'DB Constraint Corp',
      recipients: [
        {
          recipient_name: 'Real DB Test',
          email: 'realdb@constraint.com',
          phone: '+60133334444',
        },
      ],
    });

    const mockSupabaseWithConstraint: any = {
      from: (tableName: string) => ({
        select: (cols?: string) => ({
          eq: (field: string, val: any) => ({
            maybeSingle: async () => {
              if (tableName === 'customer_companies') {
                return { data: { ...company, organization_id: 'org-test-mock' }, error: null };
              }
              if (tableName === 'organizations') {
                return { data: { id: 'org-test-mock', name: 'DB Constraint Corp' }, error: null };
              }
              return { data: null, error: null };
            },
            order: () => {
              const res = {
                data: tableName === 'customer_company_recipients' ? company.recipients : [],
                error: null,
              };
              return Object.assign(Promise.resolve(res), {
                limit: () => Promise.resolve(res),
              });
            },
            is: () => ({
              gt: () => ({
                order: () => Promise.resolve({ data: [] }),
              }),
            }),
            select: () => ({
              single: async () => ({ data: { id: 'mock-rec' } }),
            }),
          }),
          ilike: () => ({
            limit: () => ({
              maybeSingle: async () => ({ data: { id: 'org-test-mock', name: 'DB Constraint Corp' } }),
            }),
          }),
        }),
        insert: (payload: any) => {
          if (tableName === 'organization_invitations') {
            insertedRole = payload.role;
            if (!VALID_ROLES.includes(payload.role)) {
              return {
                select: () => ({
                  single: async () => ({
                    data: null,
                    error: {
                      message: 'new row for relation "organization_invitations" violates check constraint "organization_invitations_role_check"',
                      code: '23514',
                    },
                  }),
                }),
              };
            }
          }
          return {
            select: () => ({
              single: async () => ({
                data: { id: 'inv-uuid-mock-123', ...payload },
                error: null,
              }),
            }),
          };
        },
        update: () => ({
          eq: () => ({
            select: () => ({
              single: async () => ({ data: { id: 'mock-rec' }, error: null }),
            }),
            eq: () => Promise.resolve({ data: null, error: null }),
          }),
        }),
      }),
      rpc: async () => ({
        data: { success: true },
        error: null,
      }),
    };

    const envWithSupabase = {
      VITE_SUPABASE_URL: 'https://real-test.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
      __supabaseClient: mockSupabaseWithConstraint,
    };

    // Default invitation should insert 'admin' and succeed without constraint violation
    const res = await generateCustomerWhatsAppInvitation({
      companyId: company.id,
      recipientId: company.recipients[0].id,
      env: envWithSupabase,
    });

    expect(res.success).toBe(true);
    expect(insertedRole).toBe('admin');
    expect(VALID_ROLES).toContain(insertedRole!);
  });
});

