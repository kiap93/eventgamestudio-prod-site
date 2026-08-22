import { getSupabaseServerClient, isSupabaseConfigured } from '../supabase.js';
import { OrganizationRecord, OrgRole } from './types.js';
import { grantWelcomeCredit } from './wallet.js';
import crypto from 'node:crypto';

export interface UserOrganizationMembership {
  id: string; // organization id
  name: string;
  slug: string;
  role: OrgRole;
  logo_url: string | null;
  created_at: string;
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
