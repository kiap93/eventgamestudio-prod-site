import { getSupabaseServerClient, isSupabaseConfigured } from '../supabase.js';
import {
  OrganizationRecord,
  OrgRole,
  WalletBalanceSummary,
  WalletTransactionRecord,
  EventWithDetails,
} from './types.js';
import { grantWelcomeCredit, getWalletBalance, getWalletTransactions } from './wallet.js';
import { getUserById } from './users.js';
import { getOrgMembers, OrgMemberWithUserDetails } from './members.js';
import { getEventsByOrgId } from './events.js';
import crypto from 'node:crypto';

export interface UserOrganizationMembership {
  id: string; // organization id
  name: string;
  slug: string;
  role: OrgRole;
  logo_url: string | null;
  created_at: string;
}

export interface DeveloperOrganizationListItem {
  id: string;
  name: string;
  slug: string;
  owner_id: string;
  owner_name: string;
  owner_email: string;
  logo_url: string | null;
  member_count: number;
  event_count: number;
  paid_balance: number;
  event_credit_balance: number;
  total_wallet_value: number;
  created_at: string;
}

export interface DeveloperOrganizationDetailResponse {
  organization: OrganizationRecord;
  owner: {
    id: string;
    name: string;
    email: string;
    avatar_url: string | null;
  } | null;
  members: OrgMemberWithUserDetails[];
  wallet: WalletBalanceSummary;
  events: EventWithDetails[];
  recent_transactions: WalletTransactionRecord[];
}

const localOrgsCache = new Map<string, OrganizationRecord>();

export async function getOrganizationById(id: string, env?: Record<string, any>): Promise<OrganizationRecord | null> {
  if (!isSupabaseConfigured(env)) {
    return localOrgsCache.get(id) || null;
  }

  const supabase = getSupabaseServerClient(env);
  const { data, error } = await supabase
    .from('organizations')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    console.error('Error in getOrganizationById:', error);
    return localOrgsCache.get(id) || null;
  }

  return data as OrganizationRecord | null;
}

export async function getOrganizationBySlug(slug: string, env?: Record<string, any>): Promise<OrganizationRecord | null> {
  if (!isSupabaseConfigured(env)) {
    for (const org of localOrgsCache.values()) {
      if (org.slug === slug) return org;
    }
    return null;
  }

  const supabase = getSupabaseServerClient(env);
  const { data, error } = await supabase
    .from('organizations')
    .select('*')
    .eq('slug', slug)
    .maybeSingle();

  if (error) {
    console.error('Error in getOrganizationBySlug:', error);
    for (const org of localOrgsCache.values()) {
      if (org.slug === slug) return org;
    }
    return null;
  }

  return data as OrganizationRecord | null;
}

export async function getUserOrganizations(userId: string, env?: Record<string, any>): Promise<UserOrganizationMembership[]> {
  if (!isSupabaseConfigured(env)) {
    return Array.from(localOrgsCache.values()).map((o) => ({
      id: o.id,
      name: o.name,
      slug: o.slug,
      role: 'owner' as OrgRole,
      logo_url: o.logo_url,
      created_at: o.created_at,
    }));
  }

  const supabase = getSupabaseServerClient(env);
  const { data, error } = await supabase
    .from('organization_members')
    .select(`
      organization_id,
      role,
      created_at,
      organizations (
        id,
        name,
        slug,
        logo_url
      )
    `)
    .eq('user_id', userId);

  if (error) {
    console.error('Error in getUserOrganizations:', error);
    return Array.from(localOrgsCache.values()).map((o) => ({
      id: o.id,
      name: o.name,
      slug: o.slug,
      role: 'owner' as OrgRole,
      logo_url: o.logo_url,
      created_at: o.created_at,
    }));
  }

  if (!data) return [];

  return data.map((item: any) => {
    const org = item.organizations;
    return {
      id: item.organization_id,
      role: item.role as OrgRole,
      name: org ? org.name : 'Unknown Organization',
      slug: org ? org.slug : '',
      logo_url: org ? org.logo_url : null,
      created_at: item.created_at,
    };
  });
}

export async function createOrganization(
  params: {
    id?: string;
    name: string;
    owner_id: string;
    logo_url?: string | null;
  },
  env?: Record<string, any>
): Promise<OrganizationRecord> {
  const id = params.id || crypto.randomUUID();
  const now = new Date().toISOString();

  // Generate URL safe slug
  const baseSlug = params.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  const randomSuffix = Array.from(crypto.getRandomValues(new Uint8Array(3)))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  const slug = `${baseSlug || 'org'}-${randomSuffix}`;

  const orgRecord: OrganizationRecord = {
    id,
    name: params.name.trim(),
    slug,
    owner_id: params.owner_id,
    logo_url: params.logo_url || null,
    created_at: now,
    updated_at: now,
  };

  if (!isSupabaseConfigured(env)) {
    localOrgsCache.set(id, orgRecord);
    try {
      await grantWelcomeCredit(
        {
          organizationId: orgRecord.id,
          createdBy: params.owner_id,
          referenceId: `welcome_${orgRecord.id}`,
          metadata: {
            organization_name: orgRecord.name,
            source: 'AUTO_ORGANIZATION_CREATION',
          },
        },
        env
      );
    } catch (grantErr) {
      console.error('Failed to grant welcome credit upon organization creation:', grantErr);
    }
    return orgRecord;
  }

  const supabase = getSupabaseServerClient(env);
  const { data, error } = await supabase
    .from('organizations')
    .insert({
      id,
      name: params.name.trim(),
      slug,
      owner_id: params.owner_id,
      logo_url: params.logo_url || null,
      created_at: now,
      updated_at: now,
    })
    .select()
    .single();

  if (error) {
    console.error('Error in createOrganization:', error);
    localOrgsCache.set(id, orgRecord);
    return orgRecord;
  }

  const organization = data as OrganizationRecord;
  localOrgsCache.set(organization.id, organization);

  // Automatically grant the one-time Welcome Credit to the new Organization's wallet
  try {
    await grantWelcomeCredit(
      {
        organizationId: organization.id,
        createdBy: params.owner_id,
        referenceId: `welcome_${organization.id}`,
        metadata: {
          organization_name: organization.name,
          source: 'AUTO_ORGANIZATION_CREATION',
        },
      },
      env
    );
  } catch (grantErr) {
    console.error('Failed to grant welcome credit upon organization creation:', grantErr);
    // Non-fatal or idempotent; duplicate protection prevents double grants if retried
  }

  return organization;
}

export async function updateOrganization(
  id: string,
  updates: Partial<Pick<OrganizationRecord, 'name' | 'logo_url'>>,
  env?: Record<string, any>
): Promise<OrganizationRecord> {
  const now = new Date().toISOString();

  if (!isSupabaseConfigured(env)) {
    const existing = localOrgsCache.get(id);
    if (existing) {
      const updated = { ...existing, ...updates, updated_at: now };
      localOrgsCache.set(id, updated);
      return updated;
    }
  }

  const supabase = getSupabaseServerClient(env);
  const { data, error } = await supabase
    .from('organizations')
    .update({
      ...updates,
      updated_at: now,
    })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Error in updateOrganization:', error);
    const existing = localOrgsCache.get(id);
    if (existing) {
      const updated = { ...existing, ...updates, updated_at: now };
      localOrgsCache.set(id, updated);
      return updated;
    }
    throw new Error(`Failed to update organization: ${error.message}`);
  }

  return data as OrganizationRecord;
}

export async function deleteOrganization(id: string, env?: Record<string, any>): Promise<void> {
  localOrgsCache.delete(id);

  if (!isSupabaseConfigured(env)) {
    return;
  }

  const supabase = getSupabaseServerClient(env);
  const { error } = await supabase
    .from('organizations')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error in deleteOrganization:', error);
  }
}

/**
 * Retrieve all organizations with aggregated stats for Developer Admin.
 */
export async function getAllOrganizationsForDeveloper(
  env?: Record<string, any>
): Promise<DeveloperOrganizationListItem[]> {
  const isProdDb = isSupabaseConfigured(env);
  const supabase = getSupabaseServerClient(env);

  let orgs: OrganizationRecord[] = [];

  if (isProdDb) {
    const { data, error } = await supabase
      .from('organizations')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching organizations in getAllOrganizationsForDeveloper:', error);
      orgs = Array.from(localOrgsCache.values());
    } else {
      orgs = (data || []) as OrganizationRecord[];
    }
  } else {
    orgs = Array.from(localOrgsCache.values()).sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }

  if (orgs.length === 0) {
    return [];
  }

  // Pre-fetch owner users
  const ownerIds = Array.from(new Set(orgs.map((o) => o.owner_id).filter(Boolean)));
  const usersMap = new Map<string, { id: string; name: string; email: string }>();

  if (isProdDb && ownerIds.length > 0) {
    try {
      const { data: usersData } = await supabase
        .from('users')
        .select('id, name, email')
        .in('id', ownerIds);
      if (usersData) {
        for (const u of usersData) {
          usersMap.set(u.id, u);
        }
      }
    } catch (uErr) {
      console.warn('Error fetching users in getAllOrganizationsForDeveloper:', uErr);
    }
  }

  // Pre-fetch member counts
  const memberCounts = new Map<string, number>();
  if (isProdDb) {
    try {
      const { data: membersData } = await supabase
        .from('organization_members')
        .select('organization_id');
      if (membersData) {
        for (const m of membersData) {
          memberCounts.set(m.organization_id, (memberCounts.get(m.organization_id) || 0) + 1);
        }
      }
    } catch (mErr) {
      console.warn('Error fetching member counts in getAllOrganizationsForDeveloper:', mErr);
    }
  }

  // Pre-fetch event counts
  const eventCounts = new Map<string, number>();
  if (isProdDb) {
    try {
      const { data: eventsData } = await supabase
        .from('events')
        .select('organization_id');
      if (eventsData) {
        for (const e of eventsData) {
          eventCounts.set(e.organization_id, (eventCounts.get(e.organization_id) || 0) + 1);
        }
      }
    } catch (eErr) {
      console.warn('Error fetching event counts in getAllOrganizationsForDeveloper:', eErr);
    }
  }

  const result: DeveloperOrganizationListItem[] = [];

  for (const org of orgs) {
    let owner = usersMap.get(org.owner_id);
    if (!owner && org.owner_id) {
      try {
        const u = await getUserById(org.owner_id, env);
        if (u) {
          owner = { id: u.id, name: u.name, email: u.email };
          usersMap.set(u.id, owner);
        }
      } catch {
        // ignore
      }
    }

    let wallet: WalletBalanceSummary;
    try {
      wallet = await getWalletBalance(org.id, env);
    } catch (wErr) {
      console.warn(`Could not calculate wallet balance for org ${org.id}:`, wErr);
      wallet = {
        organization_id: org.id,
        currency: 'MYR',
        paid_balance: 0,
        welcome_credit: 0,
        showcase_credit: 0,
        topup_credit: 0,
        total_balance: 0,
        total_credit: 0,
        welcome_credit_granted: false,
        showcase_credit_granted: false,
        can_use_welcome_credit: false,
        can_use_showcase_credit: false,
        updated_at: new Date().toISOString(),
      };
    }

    const memberCount = memberCounts.get(org.id) ?? 1;
    const eventCount = eventCounts.get(org.id) ?? 0;

    result.push({
      id: org.id,
      name: org.name,
      slug: org.slug,
      owner_id: org.owner_id,
      owner_name: owner?.name || 'Unknown Owner',
      owner_email: owner?.email || '',
      logo_url: org.logo_url,
      member_count: memberCount,
      event_count: eventCount,
      paid_balance: wallet.paid_balance,
      event_credit_balance: wallet.total_credit,
      total_wallet_value: wallet.total_balance,
      created_at: org.created_at,
    });
  }

  return result;
}

/**
 * Retrieve comprehensive organization details for Developer Admin.
 */
export async function getOrganizationDetailForDeveloper(
  orgId: string,
  env?: Record<string, any>
): Promise<DeveloperOrganizationDetailResponse | null> {
  const organization = await getOrganizationById(orgId, env);
  if (!organization) {
    return null;
  }

  let owner: { id: string; name: string; email: string; avatar_url: string | null } | null = null;
  if (organization.owner_id) {
    try {
      const ownerUser = await getUserById(organization.owner_id, env);
      if (ownerUser) {
        owner = {
          id: ownerUser.id,
          name: ownerUser.name,
          email: ownerUser.email,
          avatar_url: ownerUser.avatar_url,
        };
      }
    } catch (err) {
      console.warn('Error fetching owner user for dev detail:', err);
    }
  }

  let members: OrgMemberWithUserDetails[] = [];
  try {
    members = await getOrgMembers(orgId, env);
  } catch (err) {
    console.warn('Error fetching org members for dev detail:', err);
  }

  let wallet: WalletBalanceSummary;
  try {
    wallet = await getWalletBalance(orgId, env);
  } catch (err) {
    console.warn('Error fetching wallet balance for dev detail:', err);
    wallet = {
      organization_id: orgId,
      currency: 'MYR',
      paid_balance: 0,
      welcome_credit: 0,
      showcase_credit: 0,
      topup_credit: 0,
      total_balance: 0,
      total_credit: 0,
      welcome_credit_granted: false,
      showcase_credit_granted: false,
      can_use_welcome_credit: false,
      can_use_showcase_credit: false,
      updated_at: new Date().toISOString(),
    };
  }

  let events: EventWithDetails[] = [];
  try {
    events = await getEventsByOrgId(orgId, env);
  } catch (err) {
    console.warn('Error fetching events for dev detail:', err);
  }

  let recent_transactions: WalletTransactionRecord[] = [];
  try {
    const txData = await getWalletTransactions(orgId, { limit: 50 }, env);
    recent_transactions = txData.transactions;
  } catch (err) {
    console.warn('Error fetching transactions for dev detail:', err);
  }

  return {
    organization,
    owner,
    members,
    wallet,
    events,
    recent_transactions,
  };
}
