import { getSupabaseServerClient, isLocalFallbackAllowed, isSupabaseConfigured } from '../supabase.js';
import { getOrganizationById } from './organizations.js';
import { getMember } from './members.js';
import { localUserRewardsCache, localTransactionsCache } from './wallet.js';
import { UserRewardRecord } from './types.js';

export type PromotionRewardType = 'WELCOME_CREDIT' | 'SHOWCASE_REWARD';

/**
 * Determine authoritatively whether a given user is the actual OWNER of an organization.
 * 
 * Rules:
 * - Checks organization.owner_id === userId
 * - Checks organization_members role === 'owner'
 * - Rejects any member with role 'admin', 'designer', 'viewer', or any other non-owner role.
 * - Never trusts client-supplied role flags or identifiers.
 */
export async function isUserOrganizationOwner(
  userId: string,
  organizationId: string,
  env?: Record<string, any>
): Promise<boolean> {
  if (!userId || !organizationId) return false;

  // 1. Fetch organization record
  const org = await getOrganizationById(organizationId, env);
  if (!org) return false;

  // Direct match against organization.owner_id
  if (org.owner_id === userId) {
    return true;
  }

  // 2. Fetch membership record
  const member = await getMember(organizationId, userId, env);
  if (member && member.role === 'owner') {
    return true;
  }

  // If member role is 'admin', 'designer', 'viewer', or not found, user is NOT owner
  return false;
}

/**
 * Resolve the authoritative owner user ID of an organization.
 */
export async function getAuthoritativeOrgOwnerId(
  organizationId: string,
  env?: Record<string, any>
): Promise<string | null> {
  if (!organizationId) return null;
  const org = await getOrganizationById(organizationId, env);
  return org?.owner_id || null;
}

/**
 * Check whether a user has already claimed a specific promotion in their account lifetime.
 * 
 * Key Principles:
 * - Checks user_id + reward_type (lifetime uniqueness)
 * - Independent tracking for 'WELCOME_CREDIT' and 'SHOWCASE_REWARD'
 * - Checks user_rewards table, completed wallet_transactions, and owner_showcase_rewards
 * - For SHOWCASE_REWARD, recognizes both 'SHOWCASE_REWARD' and legacy 'SHOWCASE_CREDIT'
 * - NEVER uses current wallet balance to determine eligibility (spending credit does not reset eligibility)
 */
export async function hasUserClaimedReward(
  userId: string,
  rewardType: PromotionRewardType | 'SHOWCASE_CREDIT',
  env?: Record<string, any>
): Promise<boolean> {
  if (!userId) return false;

  const isShowcase = rewardType === 'SHOWCASE_REWARD' || rewardType === 'SHOWCASE_CREDIT';
  const rewardTypeFilter = isShowcase
    ? ['SHOWCASE_REWARD', 'SHOWCASE_CREDIT']
    : ['WELCOME_CREDIT'];

  // 1. Check local cache (in-process / test execution)
  for (const rType of rewardTypeFilter) {
    if (localUserRewardsCache.has(`${userId}:${rType}`)) {
      return true;
    }
  }

  const localTxn = Array.from(localTransactionsCache.values()).find(
    (t) =>
      (t.owner_user_id === userId || t.created_by === userId) &&
      (isShowcase
        ? t.transaction_type === 'SHOWCASE_CREDIT'
        : t.transaction_type === 'WELCOME_CREDIT') &&
      t.status === 'COMPLETED'
  );
  if (localTxn) {
    return true;
  }

  // 2. Check Supabase database if configured
  if (isSupabaseConfigured(env)) {
    const supabase = getSupabaseServerClient(env);

    try {
      // Check user_rewards table
      const { data: rewardData, error: rewardErr } = await supabase
        .from('user_rewards')
        .select('id')
        .eq('user_id', userId)
        .in('reward_type', rewardTypeFilter)
        .limit(1)
        .maybeSingle();

      if (rewardErr && !isLocalFallbackAllowed(env)) {
        throw new Error(`Database error checking user_rewards for ${rewardType}: ${rewardErr.message}`);
      }
      if (rewardData) return true;

      // Check wallet_transactions ledger
      const txnType = isShowcase ? 'SHOWCASE_CREDIT' : 'WELCOME_CREDIT';
      const { data: txnData, error: txnErr } = await supabase
        .from('wallet_transactions')
        .select('id')
        .eq('transaction_type', txnType)
        .eq('status', 'COMPLETED')
        .or(`owner_user_id.eq.${userId},created_by.eq.${userId}`)
        .limit(1)
        .maybeSingle();

      if (txnErr && !isLocalFallbackAllowed(env)) {
        throw new Error(`Database error checking wallet_transactions for ${txnType}: ${txnErr.message}`);
      }
      if (txnData) return true;

      // For showcase rewards, also check owner_showcase_rewards
      if (isShowcase) {
        const { data: ownerReward, error: ownerErr } = await supabase
          .from('owner_showcase_rewards')
          .select('owner_user_id')
          .eq('owner_user_id', userId)
          .limit(1)
          .maybeSingle();

        if (ownerErr && !isLocalFallbackAllowed(env)) {
          throw new Error(`Database error checking owner_showcase_rewards: ${ownerErr.message}`);
        }
        if (ownerReward) return true;
      }
    } catch (err: any) {
      if (!isLocalFallbackAllowed(env)) {
        throw err;
      }
    }
  }

  return false;
}

export interface PromotionEligibilityResult {
  eligible: boolean;
  isOwner: boolean;
  alreadyClaimed: boolean;
  reason?: string;
  ownerUserId?: string;
}

/**
 * Evaluate promotion eligibility according to the authoritative business rule:
 * 
 * Promotion eligibility =
 *     authenticated user is the organization OWNER
 *     AND
 *     authenticated user has never claimed this promotion before
 */
export async function evaluatePromotionEligibility(params: {
  userId: string;
  organizationId: string;
  rewardType: PromotionRewardType;
  env?: Record<string, any>;
}): Promise<PromotionEligibilityResult> {
  const { userId, organizationId, rewardType, env } = params;

  if (!userId || !organizationId) {
    return {
      eligible: false,
      isOwner: false,
      alreadyClaimed: false,
      reason: 'Valid authenticated user ID and organization ID are required.',
    };
  }

  // 1. Resolve authoritative owner ID
  const ownerUserId = await getAuthoritativeOrgOwnerId(organizationId, env);
  if (!ownerUserId) {
    return {
      eligible: false,
      isOwner: false,
      alreadyClaimed: false,
      reason: 'Organization owner could not be resolved.',
    };
  }

  // 2. Verify if authenticated user is the OWNER
  const isOwner = await isUserOrganizationOwner(userId, organizationId, env);
  if (!isOwner) {
    return {
      eligible: false,
      isOwner: false,
      alreadyClaimed: false,
      ownerUserId,
      reason: 'Only the organization owner is eligible for this promotion. Organization members cannot receive promotional credits.',
    };
  }

  // 3. Verify lifetime claim status for this owner
  const alreadyClaimed = await hasUserClaimedReward(userId, rewardType, env);
  if (alreadyClaimed) {
    const promoName = rewardType === 'WELCOME_CREDIT' ? 'Welcome Credit' : 'Showcase Reward';
    return {
      eligible: false,
      isOwner: true,
      alreadyClaimed: true,
      ownerUserId,
      reason: `${promoName} has already been claimed by this account owner (one-time lifetime reward limit).`,
    };
  }

  // 4. Fully eligible
  return {
    eligible: true,
    isOwner: true,
    alreadyClaimed: false,
    ownerUserId,
  };
}
