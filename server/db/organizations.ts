import {
  getSupabaseServerClient,
  isSupabaseConfigured,
  isLocalFallbackAllowed,
  assertProductionSafe,
} from '../supabase.js';
import {
  OrganizationRecord,
  OrgRole,
  WalletBalanceSummary,
  WalletTransactionRecord,
  EventWithDetails,
} from './types.js';
import { initializeEmptyWallet, getWalletBalance, getWalletTransactions, grantWelcomeCredit } from './wallet.js';
import { getUserById, localUsersCache } from './users.js';
import { getOrgMembers, addMember, OrgMemberWithUserDetails } from './members.js';
import { getEventsByOrgId } from './events.js';
import crypto from 'node:crypto';
export { isValidCountryCode, getCountryByCode, getDefaultTimezoneForCountry } from '../../src/lib/countryUtils.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isUUID(val: string): boolean {
  return typeof val === 'string' && UUID_REGEX.test(val);
}

export const MAX_ORGANIZATIONS_PER_OWNER = 5;

export async function getOwnerOrganizationCount(ownerId: string, env?: Record<string, any>): Promise<number> {
  if (isSupabaseConfigured(env)) {
    const supabase = getSupabaseServerClient(env);
    const { count, error } = await supabase
      .from('organizations')
      .select('id', { count: 'exact', head: true })
      .eq('owner_id', ownerId);

    if (error) {
      console.error('Error counting owner organizations in database:', error);
      if (!isLocalFallbackAllowed(env)) {
        throw new Error(`Failed to count owner organizations: ${error.message}`);
      }
    } else if (typeof count === 'number') {
      return count;
    }
  }

  // Local cache fallback
  return Array.from(localOrgsCache.values()).filter((o) => o.owner_id === ownerId).length;
}

export interface UserOrganizationMembership {
  id: string; // organization id
  name: string;
  slug: string;
  role: OrgRole;
  logo_url: string | null;
  country_code: string | null;
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
  country_code?: string | null;
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

import fs from 'node:fs';
import path from 'node:path';

const LOCAL_ORGS_FILE = path.join(process.cwd(), 'uploads', 'organizations.json');
export const localOrgsCache = new Map<string, OrganizationRecord>();

export function loadLocalOrgs(): void {
  if (!isLocalFallbackAllowed()) return;
  try {
    if (typeof fs !== 'undefined' && typeof fs.existsSync === 'function' && fs.existsSync(LOCAL_ORGS_FILE)) {
      const raw = fs.readFileSync(LOCAL_ORGS_FILE, 'utf-8');
      const list = JSON.parse(raw) as OrganizationRecord[];
      localOrgsCache.clear();
      for (const org of list) {
        localOrgsCache.set(org.id, org);
      }
    }
  } catch (err) {
    console.warn('Warning loading local organizations store:', err);
  }
}

export function saveLocalOrgs(): void {
  if (!isLocalFallbackAllowed()) return;
  try {
    if (typeof fs !== 'undefined' && typeof fs.writeFileSync === 'function') {
      const dir = path.dirname(LOCAL_ORGS_FILE);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(
        LOCAL_ORGS_FILE,
        JSON.stringify(Array.from(localOrgsCache.values()), null, 2),
        'utf-8'
      );
    }
  } catch (err) {
    console.warn('Warning saving local organizations store:', err);
  }
}

// Initial load
loadLocalOrgs();

export async function getOrganizationById(id: string, env?: Record<string, any>): Promise<OrganizationRecord | null> {
  if (!id) return null;
  if (!isUUID(id) && isLocalFallbackAllowed(env)) {
    return localOrgsCache.get(id) || null;
  }

  if (isSupabaseConfigured(env)) {
    const supabase = getSupabaseServerClient(env);
    const { data, error } = await supabase
      .from('organizations')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      if (!isLocalFallbackAllowed(env)) {
        console.error('Error in getOrganizationById:', error);
        throw new Error(`Failed to fetch organization from database: ${error.message}`);
      }
      return localOrgsCache.get(id) || null;
    }

    if (data) return data as OrganizationRecord;
    if (isLocalFallbackAllowed(env)) {
      return localOrgsCache.get(id) || null;
    }
    return null;
  }

  assertProductionSafe('getOrganizationById', env);
  return localOrgsCache.get(id) || null;
}

export async function getOrganizationBySlug(slug: string, env?: Record<string, any>): Promise<OrganizationRecord | null> {
  if (!slug) return null;
  if (isSupabaseConfigured(env)) {
    const supabase = getSupabaseServerClient(env);
    const { data, error } = await supabase
      .from('organizations')
      .select('*')
      .eq('slug', slug)
      .maybeSingle();

    if (error) {
      if (!isLocalFallbackAllowed(env)) {
        console.error('Error in getOrganizationBySlug:', error);
        throw new Error(`Failed to fetch organization from database: ${error.message}`);
      }
      for (const org of localOrgsCache.values()) {
        if (org.slug === slug) return org;
      }
      return null;
    }

    if (data) return data as OrganizationRecord;
    if (isLocalFallbackAllowed(env)) {
      for (const org of localOrgsCache.values()) {
        if (org.slug === slug) return org;
      }
    }
    return null;
  }

  assertProductionSafe('getOrganizationBySlug', env);
  for (const org of localOrgsCache.values()) {
    if (org.slug === slug) return org;
  }
  return null;
}

export async function getUserOrganizations(userId: string, env?: Record<string, any>): Promise<UserOrganizationMembership[]> {
  if (isSupabaseConfigured(env)) {
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
          logo_url,
          country_code
        )
      `)
      .eq('user_id', userId);

    if (error) {
      console.error('Error in getUserOrganizations:', error);
      if (!isLocalFallbackAllowed(env)) {
        throw new Error(`Failed to fetch user organizations from database: ${error.message}`);
      }
    }

    if (data) {
      return data.map((item: any) => {
        const org = item.organizations;
        return {
          id: item.organization_id,
          role: item.role as OrgRole,
          name: org ? org.name : 'Unknown Organization',
          slug: org ? org.slug : '',
          logo_url: org ? org.logo_url : null,
          country_code: org ? (org.country_code ?? null) : null,
          created_at: item.created_at,
        };
      });
    }
    return [];
  }

  assertProductionSafe('getUserOrganizations', env);
  return Array.from(localOrgsCache.values()).map((o) => ({
    id: o.id,
    name: o.name,
    slug: o.slug,
    role: 'owner' as OrgRole,
    logo_url: o.logo_url,
    country_code: o.country_code ?? null,
    created_at: o.created_at,
  }));
}

export interface CreateOrganizationResult extends OrganizationRecord {
  welcome_credit_granted?: boolean;
  welcome_credit_amount?: number;
}

export async function createOrganization(
  params: {
    id?: string;
    name: string;
    owner_id: string;
    logo_url?: string | null;
    country_code?: string | null;
  },
  env?: Record<string, any>
): Promise<CreateOrganizationResult> {
  if (!params.name || !params.name.trim()) {
    throw new Error('Organization name is required and cannot be empty.');
  }
  if (!params.owner_id || !params.owner_id.trim()) {
    throw new Error('Organization owner_id is required.');
  }

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

  const countryCode = params.country_code && params.country_code.trim() ? params.country_code.trim().toUpperCase() : 'MY';

  const orgRecord: OrganizationRecord = {
    id,
    name: params.name.trim(),
    slug,
    owner_id: params.owner_id,
    logo_url: params.logo_url || null,
    country_code: countryCode,
    created_at: now,
    updated_at: now,
  };

  if (!isSupabaseConfigured(env)) {
    assertProductionSafe('createOrganization', env);

    // Enforce owner-level organization limit (Max 5 organizations per user)
    const existingCount = Array.from(localOrgsCache.values()).filter((o) => o.owner_id === params.owner_id).length;
    if (existingCount >= MAX_ORGANIZATIONS_PER_OWNER) {
      const limitErr: any = new Error(
        `Organization limit reached: You can own a maximum of ${MAX_ORGANIZATIONS_PER_OWNER} organizations. Please manage or delete existing organizations before creating a new one.`
      );
      limitErr.code = 'ORGANIZATION_LIMIT_REACHED';
      limitErr.status = 422;
      limitErr.statusCode = 422;
      limitErr.current_count = existingCount;
      limitErr.max_allowed = MAX_ORGANIZATIONS_PER_OWNER;
      throw limitErr;
    }

    localOrgsCache.set(id, orgRecord);
    try {
      await addMember(
        {
          organization_id: orgRecord.id,
          user_id: params.owner_id,
          role: 'owner',
        },
        env
      );
    } catch {
      // ignore
    }
    try {
      await initializeEmptyWallet(orgRecord.id, env);
    } catch (walletErr) {
      console.error('Failed to initialize empty wallet for organization in local cache:', walletErr);
    }

    // Evaluate and grant Welcome Credit for owner on their first organization creation
    let welcomeCreditGranted = false;
    let welcomeCreditAmount = 0;
    try {
      const grantResult = await grantWelcomeCredit(
        {
          organizationId: orgRecord.id,
          userId: params.owner_id,
          createdBy: params.owner_id,
          metadata: {
            source: 'AUTO_ORGANIZATION_CREATION',
            organization_name: orgRecord.name,
            owner_user_id: params.owner_id,
          },
        },
        env
      );
      if (grantResult && !grantResult.alreadyGranted && !grantResult.notEligible && grantResult.wallet?.welcome_credit_granted) {
        welcomeCreditGranted = true;
        welcomeCreditAmount = 800;
      }
    } catch (grantErr) {
      console.warn('Warning evaluating first-organization welcome credit in local fallback:', grantErr);
    }

    saveLocalOrgs();
    return {
      ...orgRecord,
      welcome_credit_granted: welcomeCreditGranted,
      welcome_credit_amount: welcomeCreditAmount,
    };
  }

  const supabase = getSupabaseServerClient(env);

  // Helper to ensure owner user is present in public.users to prevent foreign key issues
  const ensureOwnerInDatabase = async (userId: string) => {
    try {
      const localUser = localUsersCache.get(userId);
      if (localUser) {
        await supabase.from('users').upsert(
          {
            id: localUser.id,
            google_id: localUser.google_id || null,
            email: localUser.email,
            name: localUser.name,
            avatar_url: localUser.avatar_url || null,
            is_developer: localUser.is_developer === true,
            created_at: localUser.created_at || now,
            updated_at: now,
          },
          { onConflict: 'id' }
        );
      }
    } catch (uErr) {
      console.warn('Warning syncing owner user before organization creation:', uErr);
    }
  };

  // 1. Attempt fully atomic creation via PostgreSQL RPC
  try {
    let { data: rpcData, error: rpcError } = await supabase.rpc('create_organization_atomic', {
      p_name: params.name.trim(),
      p_owner_id: params.owner_id,
      p_logo_url: params.logo_url || null,
      p_country_code: countryCode,
      p_org_id: id,
      p_slug: slug,
    });

    // If RPC failed with USER_NOT_FOUND, ensure owner user exists in database and retry RPC once
    if (!rpcError && rpcData && !rpcData.success && rpcData.code === 'USER_NOT_FOUND') {
      await ensureOwnerInDatabase(params.owner_id);
      const retryResult = await supabase.rpc('create_organization_atomic', {
        p_name: params.name.trim(),
        p_owner_id: params.owner_id,
        p_logo_url: params.logo_url || null,
        p_country_code: countryCode,
        p_org_id: id,
        p_slug: slug,
      });
      rpcData = retryResult.data;
      rpcError = retryResult.error;
    }

    // If RPC failed with SLUG_TAKEN, generate a fresh randomized slug and retry RPC once
    if (!rpcError && rpcData && !rpcData.success && rpcData.code === 'SLUG_TAKEN') {
      const retrySuffix = Array.from(crypto.getRandomValues(new Uint8Array(4)))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
      const retrySlug = `${baseSlug || 'org'}-${retrySuffix}`;
      const retryResult = await supabase.rpc('create_organization_atomic', {
        p_name: params.name.trim(),
        p_owner_id: params.owner_id,
        p_logo_url: params.logo_url || null,
        p_country_code: countryCode,
        p_org_id: id,
        p_slug: retrySlug,
      });
      rpcData = retryResult.data;
      rpcError = retryResult.error;
    }

    if (!rpcError && rpcData && rpcData.success && rpcData.organization) {
      const organization: CreateOrganizationResult = {
        ...(rpcData.organization as OrganizationRecord),
        welcome_credit_granted: Boolean(rpcData.welcome_credit_granted),
        welcome_credit_amount: Number(rpcData.welcome_credit_amount || 0),
      };
      localOrgsCache.set(organization.id, organization);
      return organization;
    }

    if (rpcError) {
      console.warn('create_organization_atomic RPC encountered error, falling back to sequential flow:', rpcError.message || rpcError);
    } else if (rpcData && !rpcData.success) {
      console.warn('create_organization_atomic RPC returned unsuccessful response:', rpcData);
      if (rpcData.code === 'ORGANIZATION_LIMIT_REACHED') {
        const limitErr: any = new Error(
          rpcData.message || rpcData.error || `Organization limit reached: You can own a maximum of ${MAX_ORGANIZATIONS_PER_OWNER} organizations.`
        );
        limitErr.status = 422;
        limitErr.statusCode = 422;
        limitErr.code = 'ORGANIZATION_LIMIT_REACHED';
        limitErr.current_count = rpcData.current_count ?? MAX_ORGANIZATIONS_PER_OWNER;
        limitErr.max_allowed = rpcData.max_allowed ?? MAX_ORGANIZATIONS_PER_OWNER;
        throw limitErr;
      }
      if (rpcData.code === 'VALIDATION_ERROR') {
        const valErr: any = new Error(rpcData.error || rpcData.message || 'Validation error');
        valErr.statusCode = 422;
        valErr.code = 'VALIDATION_ERROR';
        throw valErr;
      }
    }
  } catch (rpcCatchErr: any) {
    if (rpcCatchErr.code === 'ORGANIZATION_LIMIT_REACHED' || rpcCatchErr.statusCode === 422) {
      throw rpcCatchErr;
    }
    console.warn('create_organization_atomic RPC unavailable or failed, falling back to sequential flow:', rpcCatchErr?.message || rpcCatchErr);
  }

  // 2. Sequential Fallback
  // Ensure owner user exists in database to prevent foreign key constraint violations
  await ensureOwnerInDatabase(params.owner_id);

  // Pre-check owner-level organization limit in sequential flow
  const { count: dbCount } = await supabase
    .from('organizations')
    .select('id', { count: 'exact', head: true })
    .eq('owner_id', params.owner_id);

  if (typeof dbCount === 'number' && dbCount >= MAX_ORGANIZATIONS_PER_OWNER) {
    const limitErr: any = new Error(
      `Organization limit reached: You can own a maximum of ${MAX_ORGANIZATIONS_PER_OWNER} organizations. Please manage or delete existing organizations before creating a new one.`
    );
    limitErr.code = 'ORGANIZATION_LIMIT_REACHED';
    limitErr.status = 422;
    limitErr.statusCode = 422;
    limitErr.current_count = dbCount;
    limitErr.max_allowed = MAX_ORGANIZATIONS_PER_OWNER;
    throw limitErr;
  }

  let currentSlug = slug;
  let insertResult = await supabase
    .from('organizations')
    .insert({
      id,
      name: params.name.trim(),
      slug: currentSlug,
      owner_id: params.owner_id,
      logo_url: params.logo_url || null,
      country_code: countryCode,
      created_at: now,
      updated_at: now,
    })
    .select()
    .single();

  // If slug collision, retry with a freshly randomized slug
  if (
    insertResult.error &&
    (insertResult.error.code === '23505' ||
      insertResult.error.message?.includes('duplicate key') ||
      insertResult.error.message?.includes('slug'))
  ) {
    const retrySuffix = Array.from(crypto.getRandomValues(new Uint8Array(4)))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    currentSlug = `${baseSlug || 'org'}-${retrySuffix}`;
    insertResult = await supabase
      .from('organizations')
      .insert({
        id,
        name: params.name.trim(),
        slug: currentSlug,
        owner_id: params.owner_id,
        logo_url: params.logo_url || null,
        country_code: countryCode,
        created_at: now,
        updated_at: now,
      })
      .select()
      .single();
  }

  if (insertResult.error) {
    if (
      insertResult.error.message?.includes('Organization limit reached') ||
      insertResult.error.details?.includes('Organization limit reached')
    ) {
      const limitErr: any = new Error(
        `Organization limit reached: You can own a maximum of ${MAX_ORGANIZATIONS_PER_OWNER} organizations. Please manage or delete existing organizations before creating a new one.`
      );
      limitErr.code = 'ORGANIZATION_LIMIT_REACHED';
      limitErr.status = 422;
      limitErr.statusCode = 422;
      limitErr.max_allowed = MAX_ORGANIZATIONS_PER_OWNER;
      throw limitErr;
    }
    console.error('Fatal error in createOrganization sequential fallback:', insertResult.error);
    throw new Error(`Failed to create organization in database: ${insertResult.error.message}`);
  }

  const organization = insertResult.data as OrganizationRecord;
  localOrgsCache.set(organization.id, organization);
  
  // Single, authoritative owner membership creation
  try {
    await addMember(
      {
        organization_id: organization.id,
        user_id: params.owner_id,
        role: 'owner',
      },
      env
    );
  } catch (memErr) {
    console.error('Failed to add owner member during sequential fallback:', memErr);
    if (!isLocalFallbackAllowed(env)) {
      throw memErr;
    }
  }

  // Initialize wallet with 0 balances
  try {
    await initializeEmptyWallet(organization.id, env);
  } catch (walletErr) {
    console.warn('Warning initializing empty wallet during sequential fallback:', walletErr);
  }

  // Attempt Welcome Credit grant for first organization owner
  let welcomeCreditGranted = false;
  let welcomeCreditAmount = 0;
  try {
    const grantResult = await grantWelcomeCredit(
      {
        organizationId: organization.id,
        userId: params.owner_id,
        createdBy: params.owner_id,
        metadata: {
          source: 'AUTO_ORGANIZATION_CREATION',
          organization_name: organization.name,
          owner_user_id: params.owner_id,
        },
      },
      env
    );
    if (grantResult && !grantResult.alreadyGranted && !grantResult.notEligible && grantResult.wallet?.welcome_credit_granted) {
      welcomeCreditGranted = true;
      welcomeCreditAmount = 800;
    }
  } catch (grantErr) {
    console.warn('Warning granting first-org welcome credit during sequential fallback:', grantErr);
  }

  return {
    ...organization,
    welcome_credit_granted: welcomeCreditGranted,
    welcome_credit_amount: welcomeCreditAmount,
  };
}

export async function updateOrganization(
  id: string,
  updates: Partial<Pick<OrganizationRecord, 'name' | 'logo_url' | 'country_code'>>,
  env?: Record<string, any>
): Promise<OrganizationRecord> {
  const now = new Date().toISOString();
  const sanitizedUpdates: Partial<Pick<OrganizationRecord, 'name' | 'logo_url' | 'country_code'>> = {
    ...updates,
  };
  if (sanitizedUpdates.country_code !== undefined) {
    sanitizedUpdates.country_code = sanitizedUpdates.country_code
      ? sanitizedUpdates.country_code.trim().toUpperCase()
      : null;
  }

  if (!isSupabaseConfigured(env)) {
    const existing = localOrgsCache.get(id);
    if (existing) {
      const updated = { ...existing, ...sanitizedUpdates, updated_at: now };
      localOrgsCache.set(id, updated);
      saveLocalOrgs();
      return updated;
    }
  }

  const supabase = getSupabaseServerClient(env);
  const { data, error } = await supabase
    .from('organizations')
    .update({
      ...sanitizedUpdates,
      updated_at: now,
    })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Error in updateOrganization:', error);
    const existing = localOrgsCache.get(id);
    if (existing) {
      const updated = { ...existing, ...sanitizedUpdates, updated_at: now };
      localOrgsCache.set(id, updated);
      saveLocalOrgs();
      return updated;
    }
    throw new Error(`Failed to update organization: ${error.message}`);
  }

  const updatedOrg = data as OrganizationRecord;
  localOrgsCache.set(updatedOrg.id, updatedOrg);
  saveLocalOrgs();
  return updatedOrg;
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
      if (!isLocalFallbackAllowed(env)) {
        throw new Error(`Failed to fetch organizations from database: ${error.message}`);
      }
      orgs = Array.from(localOrgsCache.values());
    } else {
      orgs = (data || []) as OrganizationRecord[];
    }
  } else {
    assertProductionSafe('getAllOrganizationsForDeveloper', env);
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

  // Pre-fetch organization wallets cache if available
  const walletsMap = new Map<string, any>();
  if (isProdDb) {
    try {
      const { data: walletsData } = await supabase
        .from('organization_wallets')
        .select('*');
      if (walletsData) {
        for (const w of walletsData) {
          walletsMap.set(w.organization_id, w);
        }
      }
    } catch (wErr) {
      console.warn('Notice fetching organization_wallets cache in getAllOrganizationsForDeveloper:', wErr);
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
    const cachedWallet = walletsMap.get(org.id);
    if (cachedWallet) {
      const paidBalance = Number(cachedWallet.paid_balance || 0);
      const welcomeCredit = Number(cachedWallet.welcome_credit || 0);
      const showcaseCredit = Number(cachedWallet.showcase_credit || 0);
      const topupCredit = Number(cachedWallet.topup_credit || 0);
      const totalCredit = welcomeCredit + showcaseCredit + topupCredit;
      const totalBalance = paidBalance + totalCredit;
      wallet = {
        organization_id: org.id,
        currency: cachedWallet.currency || 'MYR',
        paid_balance: paidBalance,
        welcome_credit: welcomeCredit,
        showcase_credit: showcaseCredit,
        topup_credit: topupCredit,
        outstanding_balance: Number(cachedWallet.outstanding_balance || 0),
        total_balance: totalBalance,
        total_credit: totalCredit,
        welcome_credit_granted: cachedWallet.welcome_credit_granted || false,
        showcase_credit_granted: cachedWallet.showcase_credit_granted || false,
        can_use_welcome_credit: welcomeCredit > 0,
        can_use_showcase_credit: showcaseCredit > 0,
        updated_at: cachedWallet.updated_at || org.updated_at || new Date().toISOString(),
      };
    } else {
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
          outstanding_balance: 0,
          total_balance: 0,
          total_credit: 0,
          welcome_credit_granted: false,
          showcase_credit_granted: false,
          can_use_welcome_credit: false,
          can_use_showcase_credit: false,
          updated_at: new Date().toISOString(),
        };
      }
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
      country_code: org.country_code ?? null,
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
      outstanding_balance: 0,
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
