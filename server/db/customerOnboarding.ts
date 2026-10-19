import { getSupabaseServerClient, isSupabaseConfigured, isLocalFallbackAllowed } from '../supabase.js';
import { getCustomerCompanyById, listCustomerCompanies } from './customerInvitations.js';
import { getUserByEmail, getUserById, localUsersCache } from './users.js';
import { getOrgMembers, localMembersCache } from './members.js';
import { getOrganizationById, localOrgsCache } from './organizations.js';
import { localInvitationsCache } from './invitations.js';

export interface RecipientOnboardingDetail {
  recipientId: string;
  email: string;
  phone: string | null;
  name: string | null;
  channel: 'email' | 'whatsapp' | 'both';
  invitationStatus: 'never_invited' | 'pending' | 'accepted' | 'expired' | 'revoked';
  invitationId: string | null;
  invitationExpiresAt: string | null;
  whatsappStatus: 'never_sent' | 'initiated' | 'delivered' | 'read' | 'failed';
  whatsappInitiatedAt: string | null;
  isRegistered: boolean;
  registeredUser: {
    id: string;
    email: string;
    name: string | null;
  } | null;
  isOrgMember: boolean;
  orgRole: string | null;
}

export interface CompanyOnboardingStatus {
  companyId: string;
  companyName: string;
  contactPerson: string | null;
  notes: string | null;
  organizationId: string | null;
  organizationName: string | null;
  leadStatus: string;
  recipients: RecipientOnboardingDetail[];
  stages: {
    invited: boolean;
    registered: boolean;
    organizationJoined: boolean;
    themeConfigured: boolean;
    eventCreated: boolean;
    eventCompleted: boolean;
  };
  metrics: {
    totalRecipients: number;
    emailInvitedCount: number;
    whatsappInitiatedCount: number;
    registeredCount: number;
    themesCount: number;
    eventsCount: number;
    completedEventsCount: number;
  };
  currentStage: 'lead' | 'invited' | 'registered' | 'organization_joined' | 'theme_configured' | 'event_created' | 'event_completed';
  progressPercent: number; // 0 to 100
}

export interface OnboardingOverviewStats {
  totalLeads: number;
  totalRecipients: number;
  invitationsDispatched: {
    total: number;
    email: number;
    whatsapp: number;
  };
  conversionFunnel: {
    invited: number;
    registered: number;
    organizationJoined: number;
    themeConfigured: number;
    eventCreated: number;
    eventCompleted: number;
  };
  companies: CompanyOnboardingStatus[];
}

/**
 * Derives comprehensive onboarding status for a single customer company from authoritative database records.
 */
export async function deriveCompanyOnboardingStatus(
  companyId: string,
  env?: Record<string, any>
): Promise<CompanyOnboardingStatus | null> {
  const company = await getCustomerCompanyById(companyId, env);
  if (!company) return null;

  const supabase = isSupabaseConfigured(env) ? getSupabaseServerClient(env) : null;
  const now = new Date();

  // Resolve linked organization if any
  let orgId = (company as any).organization_id || null;
  let orgName: string | null = null;

  if (orgId) {
    const org = await getOrganizationById(orgId, env);
    if (org) {
      orgName = org.name;
    } else {
      orgId = null;
    }
  }

  // Inspect each recipient's onboarding state
  const recipientsDetail: RecipientOnboardingDetail[] = [];

  let emailInvitedCount = 0;
  let whatsappInitiatedCount = 0;
  let registeredCount = 0;
  let orgMemberCount = 0;

  for (const r of company.recipients || []) {
    const rawR = r as any;
    const phone = rawR.phone || null;
    const channel: 'email' | 'whatsapp' | 'both' = rawR.channel || 'both';
    const whatsappStatus = rawR.whatsapp_status || 'never_sent';
    const whatsappInitiatedAt = rawR.whatsapp_initiated_at || null;

    if (r.last_invitation_status === 'sent' || r.invitation_count > 0) {
      emailInvitedCount++;
    }
    if (whatsappStatus === 'initiated' || whatsappStatus === 'delivered' || whatsappStatus === 'read') {
      whatsappInitiatedCount++;
    }

    // Resolve invitation status
    let invitationStatus: 'never_invited' | 'pending' | 'accepted' | 'expired' | 'revoked' = 'never_invited';
    let invExpiresAt: string | null = null;
    let invId = rawR.invitation_id || null;

    // Check invitation record
    let invRecord: any = null;
    if (invId) {
      if (supabase) {
        const { data } = await supabase
          .from('organization_invitations')
          .select('*')
          .eq('id', invId)
          .maybeSingle();
        invRecord = data;
      } else {
        invRecord = localInvitationsCache.get(invId);
      }
    }

    if (!invRecord) {
      // Look up by email
      if (supabase) {
        const { data } = await supabase
          .from('organization_invitations')
          .select('*')
          .eq('email', r.email.toLowerCase())
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        invRecord = data;
      } else {
        invRecord = Array.from(localInvitationsCache.values())
          .filter((i) => i.email === r.email.toLowerCase())
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
      }
    }

    if (invRecord) {
      invId = invRecord.id;
      invExpiresAt = invRecord.expires_at;

      if (invRecord.accepted_at) {
        invitationStatus = 'accepted';
      } else if (invRecord.invitation_status === 'revoked') {
        invitationStatus = 'revoked';
      } else if (new Date(invRecord.expires_at) < now) {
        invitationStatus = 'expired';
      } else {
        invitationStatus = 'pending';
      }

      if (!orgId && invRecord.organization_id) {
        orgId = invRecord.organization_id;
        const org = await getOrganizationById(orgId, env);
        if (org) orgName = org.name;
      }
    } else if (r.last_invitation_status === 'sent' || whatsappStatus === 'initiated') {
      invitationStatus = 'pending';
    }

    // Check registration in users table
    let registeredUser: any = null;
    if (rawR.accepted_user_id) {
      registeredUser = await getUserById(rawR.accepted_user_id, env);
    }
    if (!registeredUser && invRecord?.accepted_user_id) {
      registeredUser = await getUserById(invRecord.accepted_user_id, env);
    }
    if (!registeredUser) {
      registeredUser = await getUserByEmail(r.email.toLowerCase(), env);
    }

    const isRegistered = Boolean(registeredUser);
    if (isRegistered) {
      registeredCount++;
    }

    // Check organization membership
    let isOrgMember = false;
    let orgRole: string | null = null;

    if (orgId && registeredUser) {
      const members = await getOrgMembers(orgId, env);
      const match = members.find((m) => m.user_id === registeredUser.id);
      if (match) {
        isOrgMember = true;
        orgRole = match.role;
        orgMemberCount++;
      } else {
        const org = await getOrganizationById(orgId, env);
        if (org && org.owner_id === registeredUser.id) {
          isOrgMember = true;
          orgRole = 'owner';
          orgMemberCount++;
        }
      }
    }

    recipientsDetail.push({
      recipientId: r.id,
      email: r.email,
      phone,
      name: r.recipient_name,
      channel,
      invitationStatus,
      invitationId: invId,
      invitationExpiresAt: invExpiresAt,
      whatsappStatus,
      whatsappInitiatedAt,
      isRegistered,
      registeredUser: registeredUser
        ? { id: registeredUser.id, email: registeredUser.email, name: registeredUser.name }
        : null,
      isOrgMember,
      orgRole,
    });
  }

  // Derive organization activity: themes & events count
  let themesCount = 0;
  let eventsCount = 0;
  let completedEventsCount = 0;

  if (orgId) {
    if (supabase) {
      // Count themes
      try {
        const { count: tc } = await supabase
          .from('themes')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', orgId);
        themesCount = tc || 0;
      } catch {
        // fallback
      }

      // Count events
      try {
        const { data: evs } = await supabase
          .from('events')
          .select('id, status, event_status, start_date, end_date')
          .eq('organization_id', orgId);

        if (Array.isArray(evs)) {
          eventsCount = evs.length;
          completedEventsCount = evs.filter((e) => {
            const st = (e.status || e.event_status || '').toUpperCase();
            return st === 'COMPLETED' || st === 'EXPIRED';
          }).length;
        }
      } catch {
        // fallback
      }
    } else {
      // Local fallback
      // In local mode, count from local cache
      themesCount = 1; // standard default theme in local dev
    }
  }

  // Compute Funnel Stages
  const isInvited = emailInvitedCount > 0 || whatsappInitiatedCount > 0;
  const isRegistered = registeredCount > 0;
  const isOrgJoined = orgMemberCount > 0 || (orgId !== null && isRegistered);
  const isThemeConfigured = themesCount > 0;
  const isEventCreated = eventsCount > 0;
  const isEventCompleted = completedEventsCount > 0;

  // Compute Current Stage and Progress
  let currentStage: CompanyOnboardingStatus['currentStage'] = 'lead';
  let progressPercent = 0;

  if (isEventCompleted) {
    currentStage = 'event_completed';
    progressPercent = 100;
  } else if (isEventCreated) {
    currentStage = 'event_created';
    progressPercent = 80;
  } else if (isThemeConfigured) {
    currentStage = 'theme_configured';
    progressPercent = 60;
  } else if (isOrgJoined) {
    currentStage = 'organization_joined';
    progressPercent = 40;
  } else if (isRegistered) {
    currentStage = 'registered';
    progressPercent = 25;
  } else if (isInvited) {
    currentStage = 'invited';
    progressPercent = 10;
  }

  return {
    companyId: company.id,
    companyName: company.company_name,
    contactPerson: company.contact_person,
    notes: company.notes,
    organizationId: orgId,
    organizationName: orgName,
    leadStatus: (company as any).lead_status || 'lead',
    recipients: recipientsDetail,
    stages: {
      invited: isInvited,
      registered: isRegistered,
      organizationJoined: isOrgJoined,
      themeConfigured: isThemeConfigured,
      eventCreated: isEventCreated,
      eventCompleted: isEventCompleted,
    },
    metrics: {
      totalRecipients: (company.recipients || []).length,
      emailInvitedCount,
      whatsappInitiatedCount,
      registeredCount,
      themesCount,
      eventsCount,
      completedEventsCount,
    },
    currentStage,
    progressPercent,
  };
}

/**
 * Returns complete onboarding overview with aggregate funnel metrics across all customer companies.
 */
export async function getOnboardingOverview(
  env?: Record<string, any>
): Promise<OnboardingOverviewStats> {
  const { companies } = await listCustomerCompanies({ env });

  let totalRecipients = 0;
  let totalEmailInvited = 0;
  let totalWhatsappInitiated = 0;

  let countInvited = 0;
  let countRegistered = 0;
  let countOrgJoined = 0;
  let countThemeConfigured = 0;
  let countEventCreated = 0;
  let countEventCompleted = 0;

  const statuses: CompanyOnboardingStatus[] = [];

  for (const c of companies) {
    const status = await deriveCompanyOnboardingStatus(c.id, env);
    if (status) {
      statuses.push(status);
      totalRecipients += status.metrics.totalRecipients;
      totalEmailInvited += status.metrics.emailInvitedCount;
      totalWhatsappInitiated += status.metrics.whatsappInitiatedCount;

      if (status.stages.invited) countInvited++;
      if (status.stages.registered) countRegistered++;
      if (status.stages.organizationJoined) countOrgJoined++;
      if (status.stages.themeConfigured) countThemeConfigured++;
      if (status.stages.eventCreated) countEventCreated++;
      if (status.stages.eventCompleted) countEventCompleted++;
    }
  }

  return {
    totalLeads: companies.length,
    totalRecipients,
    invitationsDispatched: {
      total: totalEmailInvited + totalWhatsappInitiated,
      email: totalEmailInvited,
      whatsapp: totalWhatsappInitiated,
    },
    conversionFunnel: {
      invited: countInvited,
      registered: countRegistered,
      organizationJoined: countOrgJoined,
      themeConfigured: countThemeConfigured,
      eventCreated: countEventCreated,
      eventCompleted: countEventCompleted,
    },
    companies: statuses,
  };
}
