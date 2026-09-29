import {
  getSupabaseServerClient,
  isSupabaseConfigured,
  isLocalFallbackAllowed,
  assertProductionSafe,
  isProductionEnvironment,
} from '../supabase.js';
import {
  OrganizationWalletRecord,
  WalletTransactionRecord,
  WalletBalanceSummary,
  WalletBalanceType,
  WalletTransactionType,
  EventCreditOption,
  EventPaymentQuote,
  CreditEligibilityResult,
  PaymentMode,
  EventPaymentCalculation,
  TopupQuoteResponse,
  PendingTopupOrder,
  TopupOrderRecord,
  TopupOrderStatus,
  TopupTiersInfo,
  WalletAuditRecord,
  WalletAuditEventType,
  OwnerShowcaseRewardRecord,
  UserRewardRecord,
} from './types.js';
import { isUserOrganizationOwner, hasUserClaimedReward } from './rewards.js';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import {
  dispatchNotificationEvent,
  dispatchPaymentFailed,
  dispatchEventPaymentFailed,
  dispatchPaymentLifecycleTransition,
} from '../notifications/dispatcher.js';
import { PricingConfigurationError, AppError } from '../errors.js';

// Business Constants
export const STANDARD_EVENT_PRICE = 1400.00;
export const WELCOME_CREDIT_AMOUNT = 800.00;
export const SHOWCASE_CREDIT_AMOUNT = 300.00;
export const TOPUP_TIER_1_MIN = 6000.00; // RM6,000.00
export const TOPUP_TIER_1_RATE = 0.05; // 5%
export const TOPUP_TIER_2_MIN = 10000.00; // RM10,000.00
export const TOPUP_TIER_2_RATE = 0.07; // 7%
export const MAX_TOPUP_CREDIT_PER_EVENT_PERCENT = 0.20; // 20% of Event Price = RM280 max

/**
 * Convert numeric currency amount to integer cents to prevent JavaScript floating point precision issues.
 */
export function toCents(amount: number): number {
  return Math.round(Number(amount || 0) * 100);
}

/**
 * Convert integer cents back to 2-decimal floating point number.
 */
export function fromCents(cents: number): number {
  return Math.round(cents) / 100;
}

// Local storage fallback paths
const LOCAL_WALLETS_FILE = path.join(process.cwd(), 'uploads', 'wallets.json');
const LOCAL_TRANSACTIONS_FILE = path.join(process.cwd(), 'uploads', 'wallet_transactions.json');
const LOCAL_TOPUP_ORDERS_FILE = path.join(process.cwd(), 'uploads', 'topup_orders.json');
const LOCAL_AUDIT_LOGS_FILE = path.join(process.cwd(), 'uploads', 'wallet_audit_logs.json');
const LOCAL_OWNER_REWARDS_FILE = path.join(process.cwd(), 'uploads', 'owner_showcase_rewards.json');
const LOCAL_USER_REWARDS_FILE = path.join(process.cwd(), 'uploads', 'user_rewards.json');

// In-memory fallback caches
export const localWalletsCache = new Map<string, OrganizationWalletRecord>();
export const localTransactionsCache = new Map<string, WalletTransactionRecord>();
export const localTopupOrdersCache = new Map<string, TopupOrderRecord>();
export const localAuditLogCache = new Map<string, WalletAuditRecord>();
/**
 * STRICT CACHE ONLY:
 * localOwnerShowcaseRewardsCache is an in-memory optimization and local-dev fallback.
 * It must NEVER be used to authorize a reward or bypass the database.
 * Whenever an actual reward decision is made:
 *   CACHE -> optional optimization / test fallback only
 *   DATABASE (public.user_rewards) / ATOMIC RPC -> authoritative decision
 * If the cache conflicts with the database:
 *   DATABASE WINS
 */
export const localOwnerShowcaseRewardsCache = new Map<string, OwnerShowcaseRewardRecord>();
export const localUserRewardsCache = new Map<string, UserRewardRecord>();

function loadLocalStores(): void {
  // Never attempt file I/O or populate local disk caches in production or on Cloudflare Workers
  if (!isLocalFallbackAllowed()) return;
  try {
    if (typeof fs !== 'undefined' && typeof fs.existsSync === 'function') {
      if (fs.existsSync(LOCAL_WALLETS_FILE)) {
        const raw = fs.readFileSync(LOCAL_WALLETS_FILE, 'utf-8');
        const list = JSON.parse(raw) as OrganizationWalletRecord[];
        localWalletsCache.clear();
        for (const w of list) {
          localWalletsCache.set(w.organization_id, w);
        }
      }
      if (fs.existsSync(LOCAL_TRANSACTIONS_FILE)) {
        const raw = fs.readFileSync(LOCAL_TRANSACTIONS_FILE, 'utf-8');
        const list = JSON.parse(raw) as WalletTransactionRecord[];
        localTransactionsCache.clear();
        for (const t of list) {
          localTransactionsCache.set(t.id, t);
        }
      }
      if (fs.existsSync(LOCAL_TOPUP_ORDERS_FILE)) {
        const raw = fs.readFileSync(LOCAL_TOPUP_ORDERS_FILE, 'utf-8');
        const list = JSON.parse(raw) as TopupOrderRecord[];
        localTopupOrdersCache.clear();
        for (const o of list) {
          localTopupOrdersCache.set(o.id, o);
        }
      }
      if (fs.existsSync(LOCAL_AUDIT_LOGS_FILE)) {
        const raw = fs.readFileSync(LOCAL_AUDIT_LOGS_FILE, 'utf-8');
        const list = JSON.parse(raw) as WalletAuditRecord[];
        localAuditLogCache.clear();
        for (const a of list) {
          localAuditLogCache.set(a.id, a);
        }
      }
      if (fs.existsSync(LOCAL_OWNER_REWARDS_FILE)) {
        const raw = fs.readFileSync(LOCAL_OWNER_REWARDS_FILE, 'utf-8');
        const list = JSON.parse(raw) as OwnerShowcaseRewardRecord[];
        localOwnerShowcaseRewardsCache.clear();
        for (const r of list) {
          localOwnerShowcaseRewardsCache.set(r.owner_user_id, r);
        }
      }
      if (fs.existsSync(LOCAL_USER_REWARDS_FILE)) {
        const raw = fs.readFileSync(LOCAL_USER_REWARDS_FILE, 'utf-8');
        const list = JSON.parse(raw) as UserRewardRecord[];
        localUserRewardsCache.clear();
        for (const r of list) {
          localUserRewardsCache.set(`${r.user_id}:${r.reward_type}`, r);
        }
      }
    }
  } catch (err) {
    console.warn('Warning loading local wallet store:', err);
  }
}

function saveLocalStores(): void {
  // Never attempt file I/O or persist local disk caches in production or on Cloudflare Workers
  if (!isLocalFallbackAllowed()) return;
  try {
    if (typeof fs !== 'undefined' && typeof fs.writeFileSync === 'function') {
      const dir = path.dirname(LOCAL_WALLETS_FILE);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(
        LOCAL_WALLETS_FILE,
        JSON.stringify(Array.from(localWalletsCache.values()), null, 2),
        'utf-8'
      );
      fs.writeFileSync(
        LOCAL_TRANSACTIONS_FILE,
        JSON.stringify(Array.from(localTransactionsCache.values()), null, 2),
        'utf-8'
      );
      fs.writeFileSync(
        LOCAL_TOPUP_ORDERS_FILE,
        JSON.stringify(Array.from(localTopupOrdersCache.values()), null, 2),
        'utf-8'
      );
      fs.writeFileSync(
        LOCAL_AUDIT_LOGS_FILE,
        JSON.stringify(Array.from(localAuditLogCache.values()), null, 2),
        'utf-8'
      );
      fs.writeFileSync(
        LOCAL_OWNER_REWARDS_FILE,
        JSON.stringify(Array.from(localOwnerShowcaseRewardsCache.values()), null, 2),
        'utf-8'
      );
      fs.writeFileSync(
        LOCAL_USER_REWARDS_FILE,
        JSON.stringify(Array.from(localUserRewardsCache.values()), null, 2),
        'utf-8'
      );
    }
  } catch (err) {
    console.warn('Warning saving local wallet store:', err);
  }
}

// Initial load of local cache
loadLocalStores();

// In-memory organization mutex lock to prevent concurrent race conditions
const orgLocks = new Map<string, Promise<void>>();
const heldLocksContext = new AsyncLocalStorage<Set<string>>();

export async function withOrganizationLock<T>(
  organizationId: string,
  operation: () => Promise<T>
): Promise<T> {
  if (!organizationId) {
    return await operation();
  }

  const currentLocks = heldLocksContext.getStore();
  const lockKey = `org:${organizationId}`;
  if (currentLocks && currentLocks.has(lockKey)) {
    // Already held in current reentrant call stack
    return await operation();
  }

  // Wait for any existing lock on this organization to finish
  while (orgLocks.has(organizationId)) {
    try {
      await orgLocks.get(organizationId);
    } catch {
      // Ignore errors from previous operation
    }
  }

  let releaseLock: () => void;
  const lockPromise = new Promise<void>((resolve) => {
    releaseLock = resolve;
  });

  orgLocks.set(organizationId, lockPromise);

  const nextLocks = new Set(currentLocks || []);
  nextLocks.add(lockKey);

  return await heldLocksContext.run(nextLocks, async () => {
    try {
      return await operation();
    } finally {
      if (orgLocks.get(organizationId) === lockPromise) {
        orgLocks.delete(organizationId);
      }
      releaseLock!();
    }
  });
}

// In-memory user-level mutex lock for user-scoped reward allocations
const userRewardLocks = new Map<string, Promise<void>>();

export async function withUserRewardLock<T>(
  userId: string,
  operation: () => Promise<T>
): Promise<T> {
  if (!userId) {
    return await operation();
  }

  const currentLocks = heldLocksContext.getStore();
  const lockKey = `user_reward:${userId}`;
  if (currentLocks && currentLocks.has(lockKey)) {
    // Already held in current reentrant call stack
    return await operation();
  }

  while (userRewardLocks.has(userId)) {
    try {
      await userRewardLocks.get(userId);
    } catch {
      // Ignore errors from previous operation
    }
  }

  let releaseLock: () => void;
  const lockPromise = new Promise<void>((resolve) => {
    releaseLock = resolve;
  });

  userRewardLocks.set(userId, lockPromise);

  const nextLocks = new Set(currentLocks || []);
  nextLocks.add(lockKey);

  return await heldLocksContext.run(nextLocks, async () => {
    try {
      return await operation();
    } finally {
      if (userRewardLocks.get(userId) === lockPromise) {
        userRewardLocks.delete(userId);
      }
      releaseLock!();
    }
  });
}

async function resolveOrgOwnerId(orgId: string, env?: Record<string, any>): Promise<string | null> {
  if (!orgId) return null;
  if (isSupabaseConfigured(env)) {
    try {
      const supabase = getSupabaseServerClient(env);
      const { data } = await supabase
        .from('organizations')
        .select('owner_id')
        .eq('id', orgId)
        .maybeSingle();
      return data?.owner_id || null;
    } catch {
      return null;
    }
  } else {
    try {
      const { getOrganizationById } = await import('./organizations.js');
      const org = await getOrganizationById(orgId, env);
      return org?.owner_id || null;
    } catch {
      return null;
    }
  }
}

/**
 * Record a traceable wallet audit event for compliance, reconciliation, and transaction auditing.
 */
export async function recordWalletAuditEvent(
  event: {
    organizationId: string;
    eventType: WalletAuditEventType;
    orderId?: string | null;
    paymentReference?: string | null;
    amount?: number | null;
    currency?: string | null;
    actorId?: string | null;
    metadata?: Record<string, any>;
  },
  env?: Record<string, any>
): Promise<WalletAuditRecord> {
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const auditRecord: WalletAuditRecord = {
    id,
    organization_id: event.organizationId,
    event_type: event.eventType,
    order_id: event.orderId || null,
    payment_reference: event.paymentReference || null,
    amount: event.amount !== undefined && event.amount !== null ? Number(event.amount) : null,
    currency: event.currency || 'MYR',
    actor_id: event.actorId || null,
    metadata: event.metadata || {},
    timestamp: now,
  };

  // Structured log for real-time observability and audit compliance
  console.log(
    `[WALLET AUDIT] [${auditRecord.event_type}] Org: ${auditRecord.organization_id} | Order: ${auditRecord.order_id || 'N/A'} | Ref: ${auditRecord.payment_reference || 'N/A'} | Amount: ${auditRecord.amount !== null ? `${auditRecord.currency || 'MYR'} ${auditRecord.amount.toFixed(2)}` : 'N/A'}`
  );

  // Only persist to local memory cache if local fallback is allowed
  if (isLocalFallbackAllowed(env)) {
    localAuditLogCache.set(id, auditRecord);
    saveLocalStores();
  }

  // If Supabase is configured, write to audit table
  if (isSupabaseConfigured(env)) {
    try {
      const supabase = getSupabaseServerClient(env);
      const { error } = await supabase.from('wallet_audit_logs').insert(auditRecord);
      if (error) {
        console.warn('Warning: wallet audit log insert failed:', error.message);
      }
    } catch (err: any) {
      console.warn('Warning inserting wallet audit log to Supabase:', err.message);
    }
  } else {
    assertProductionSafe('recordWalletAuditEvent', env);
  }

  return auditRecord;
}

/**
 * Retrieve the audit trail history for an organization.
 */
export async function getWalletAuditTrail(
  organizationId: string,
  options?: {
    limit?: number;
    offset?: number;
    eventType?: string;
  } | Record<string, any>,
  env?: Record<string, any>
): Promise<WalletAuditRecord[]> {
  if (!organizationId) return [];

  let queryLimit = 100;
  let queryOffset = 0;
  let filterEventType: string | undefined;
  let effectiveEnv = env;

  if (options) {
    if ('SUPABASE_URL' in options || 'VITE_SUPABASE_URL' in options || 'JWT_SECRET' in options) {
      effectiveEnv = options;
    } else {
      if (typeof options.limit === 'number') queryLimit = options.limit;
      if (typeof options.offset === 'number') queryOffset = options.offset;
      if (typeof options.eventType === 'string') filterEventType = options.eventType;
    }
  }

  if (isSupabaseConfigured(effectiveEnv)) {
    const supabase = getSupabaseServerClient(effectiveEnv);
    let query = supabase
      .from('wallet_audit_logs')
      .select('*')
      .eq('organization_id', organizationId);

    if (filterEventType) {
      query = query.eq('event_type', filterEventType);
    }

    const { data, error } = await query
      .order('timestamp', { ascending: false })
      .range(queryOffset, queryOffset + queryLimit - 1);

    if (error) {
      console.warn('Notice fetching wallet audit trail from database, checking fallback:', error.message);
      if (!isLocalFallbackAllowed(effectiveEnv)) {
        throw new Error(`Database error fetching wallet audit trail: ${error.message}`);
      }
    } else if (data) {
      return data as WalletAuditRecord[];
    }
  }

  assertProductionSafe('getWalletAuditTrail', effectiveEnv);
  let list = Array.from(localAuditLogCache.values())
    .filter((a) => a.organization_id === organizationId);

  if (filterEventType) {
    list = list.filter((a) => a.event_type === filterEventType);
  }

  return list
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(queryOffset, queryOffset + queryLimit);
}

/**
 * Pure calculation function for promotional Top-up Credit.
 * Top-up promotional credit is calculated based on EACH individual top-up transaction.
 *
 * Rules:
 * - Below RM6,000 = 0% Top-up Credit
 * - RM6,000 to RM9,999.99 = 5% Top-up Credit
 * - RM10,000 and above = 7% Top-up Credit
 *
 * Calculations are performed with integer cents arithmetic to avoid floating-point errors.
 */
export function calculateTopupCredit(topupAmount: number): number {
  if (typeof topupAmount !== 'number' || isNaN(topupAmount) || topupAmount <= 0) {
    return 0.00;
  }
  const amountCents = toCents(topupAmount);
  const tier1MinCents = toCents(TOPUP_TIER_1_MIN); // 600,000 cents (RM6,000)
  const tier2MinCents = toCents(TOPUP_TIER_2_MIN); // 1,000,000 cents (RM10,000)

  if (amountCents < tier1MinCents) {
    return 0.00;
  }

  if (amountCents >= tier2MinCents) {
    // 7% rate
    const promoCents = Math.round(amountCents * TOPUP_TIER_2_RATE);
    return fromCents(promoCents);
  }

  // 5% rate for RM6,000 to RM9,999.99
  const promoCents = Math.round(amountCents * TOPUP_TIER_1_RATE);
  return fromCents(promoCents);
}

/**
 * Recompute organization wallet balances strictly from the immutable ledger transactions.
 */
export async function recalculateWalletBalances(
  organizationId: string,
  env?: Record<string, any>
): Promise<WalletBalanceSummary> {
  const isProdDb = isSupabaseConfigured(env);
  const supabase = getSupabaseServerClient(env);

  let transactions: WalletTransactionRecord[] = [];

  if (isProdDb) {
    const { data, error } = await supabase
      .from('wallet_transactions')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('status', 'COMPLETED');

    if (error) {
      if (isLocalFallbackAllowed(env)) {
        transactions = Array.from(localTransactionsCache.values()).filter(
          (t) => t.organization_id === organizationId && t.status === 'COMPLETED'
        );
      } else {
        console.error('Fatal: Supabase query wallet_transactions failed:', error);
        throw new Error(`Failed to fetch wallet transactions from database: ${error.message}`);
      }
    } else {
      transactions = (data || []) as WalletTransactionRecord[];
      if (isLocalFallbackAllowed(env)) {
        const localTxns = Array.from(localTransactionsCache.values()).filter(
          (t) => t.organization_id === organizationId && t.status === 'COMPLETED'
        );
        const existingTxnIds = new Set(transactions.map((t) => t.id));
        for (const localTx of localTxns) {
          if (!existingTxnIds.has(localTx.id)) {
            transactions.push(localTx);
          }
        }
      }
    }
  } else {
    // Development / test fallback when Supabase is not configured
    assertProductionSafe('recalculateWalletBalances', env);
    transactions = Array.from(localTransactionsCache.values()).filter(
      (t) => t.organization_id === organizationId && t.status === 'COMPLETED'
    );
  }

  let paidBalanceCents = 0;
  let welcomeCreditCents = 0;
  let showcaseCreditCents = 0;
  let topupCreditCents = 0;
  let welcomeCreditGranted = false;
  let showcaseCreditGranted = false;

  for (const txn of transactions) {
    const amountCents = toCents(txn.amount);
    if (txn.balance_type === 'PAID_BALANCE') {
      paidBalanceCents += amountCents;
    } else if (txn.balance_type === 'WELCOME_CREDIT') {
      welcomeCreditCents += amountCents;
      if (txn.transaction_type === 'WELCOME_CREDIT') {
        welcomeCreditGranted = true;
      }
    } else if (txn.balance_type === 'SHOWCASE_CREDIT') {
      showcaseCreditCents += amountCents;
      if (txn.transaction_type === 'SHOWCASE_CREDIT') {
        showcaseCreditGranted = true;
      }
    } else if (txn.balance_type === 'TOPUP_CREDIT') {
      topupCreditCents += amountCents;
    }
  }

  // Prevent negative balances due to precision rounding
  const paidBalance = Math.max(0, fromCents(paidBalanceCents));
  const welcomeCredit = Math.max(0, fromCents(welcomeCreditCents));
  const showcaseCredit = Math.max(0, fromCents(showcaseCreditCents));
  const topupCredit = Math.max(0, fromCents(topupCreditCents));

  const now = new Date().toISOString();
  const outstandingBalance = await getOutstandingBalance(organizationId, env);

  const walletRecord: OrganizationWalletRecord = {
    id: localWalletsCache.get(organizationId)?.id || crypto.randomUUID(),
    organization_id: organizationId,
    paid_balance: paidBalance,
    welcome_credit: welcomeCredit,
    showcase_credit: showcaseCredit,
    topup_credit: topupCredit,
    outstanding_balance: outstandingBalance,
    currency: 'MYR',
    welcome_credit_granted: welcomeCreditGranted,
    showcase_credit_granted: showcaseCreditGranted,
    created_at: localWalletsCache.get(organizationId)?.created_at || now,
    updated_at: now,
  };

  if (isProdDb) {
    try {
      const { error: upsertError } = await supabase.from('organization_wallets').upsert(
        {
          organization_id: organizationId,
          paid_balance: paidBalance,
          welcome_credit: welcomeCredit,
          showcase_credit: showcaseCredit,
          topup_credit: topupCredit,
          outstanding_balance: outstandingBalance,
          currency: 'MYR',
          welcome_credit_granted: welcomeCreditGranted,
          showcase_credit_granted: showcaseCreditGranted,
          updated_at: now,
        },
        { onConflict: 'organization_id' }
      );
      if (upsertError) {
        console.error('Fatal: could not upsert organization_wallets cache table:', upsertError.message);
        if (!isLocalFallbackAllowed(env)) {
          throw new Error(`Failed to update organization wallet in database: ${upsertError.message}`);
        }
      }
    } catch (err: any) {
      console.error('Fatal: writing organization_wallets cache to Supabase failed:', err.message);
      if (!isLocalFallbackAllowed(env)) {
        throw new Error(`Failed to update organization wallet in database: ${err.message}`);
      }
    }
    if (isLocalFallbackAllowed(env)) {
      localWalletsCache.set(organizationId, walletRecord);
    }
  } else {
    // Persist locally in dev/test
    localWalletsCache.set(organizationId, walletRecord);
    saveLocalStores();
  }

  const totalBalanceCents = paidBalanceCents + welcomeCreditCents + showcaseCreditCents + topupCreditCents;
  const totalCreditCents = welcomeCreditCents + showcaseCreditCents + topupCreditCents;

  return {
    organization_id: organizationId,
    currency: 'MYR',
    paid_balance: paidBalance,
    welcome_credit: welcomeCredit,
    showcase_credit: showcaseCredit,
    topup_credit: topupCredit,
    outstanding_balance: outstandingBalance,
    total_balance: fromCents(totalBalanceCents),
    total_credit: fromCents(totalCreditCents),
    welcome_credit_granted: welcomeCreditGranted,
    showcase_credit_granted: showcaseCreditGranted,
    can_use_welcome_credit: welcomeCredit > 0,
    can_use_showcase_credit: showcaseCredit > 0,
    updated_at: now,
  };
}

/**
 * Initialize a brand new organization wallet with zero balances.
 * Automatic Welcome Credit is completely disabled.
 */
export async function initializeEmptyWallet(
  organizationId: string,
  env?: Record<string, any>
): Promise<OrganizationWalletRecord> {
  const isProdDb = isSupabaseConfigured(env);
  const now = new Date().toISOString();

  const emptyWallet: OrganizationWalletRecord = {
    id: crypto.randomUUID(),
    organization_id: organizationId,
    paid_balance: 0.0,
    welcome_credit: 0.0,
    showcase_credit: 0.0,
    topup_credit: 0.0,
    outstanding_balance: 0.0,
    currency: 'MYR',
    welcome_credit_granted: false,
    showcase_credit_granted: false,
    created_at: now,
    updated_at: now,
  };

  if (isProdDb) {
    const supabase = getSupabaseServerClient(env);
    const { data, error } = await supabase
      .from('organization_wallets')
      .upsert(
        {
          organization_id: organizationId,
          paid_balance: 0.0,
          welcome_credit: 0.0,
          showcase_credit: 0.0,
          topup_credit: 0.0,
          outstanding_balance: 0.0,
          currency: 'MYR',
          welcome_credit_granted: false,
          showcase_credit_granted: false,
          updated_at: now,
        },
        { onConflict: 'organization_id' }
      )
      .select()
      .maybeSingle();

    if (error) {
      console.error('Failed to initialize organization wallet in Supabase:', error);
    } else if (data) {
      return data as OrganizationWalletRecord;
    }
  }

  localWalletsCache.set(organizationId, emptyWallet);
  saveLocalStores();
  return emptyWallet;
}

/**
 * Get comprehensive wallet balances and credit eligibility for an organization.
 */
export async function getWalletBalance(
  organizationId: string,
  env?: Record<string, any>
): Promise<WalletBalanceSummary> {
  if (!organizationId) {
    throw new Error('Organization ID is required');
  }
  return recalculateWalletBalances(organizationId, env);
}

export async function getPaidBalance(organizationId: string, env?: Record<string, any>): Promise<number> {
  const summary = await getWalletBalance(organizationId, env);
  return summary.paid_balance;
}

export async function getWelcomeCredit(organizationId: string, env?: Record<string, any>): Promise<number> {
  const summary = await getWalletBalance(organizationId, env);
  return summary.welcome_credit;
}

export async function getShowcaseCredit(organizationId: string, env?: Record<string, any>): Promise<number> {
  const summary = await getWalletBalance(organizationId, env);
  return summary.showcase_credit;
}

export async function getTopupCredit(organizationId: string, env?: Record<string, any>): Promise<number> {
  const summary = await getWalletBalance(organizationId, env);
  return summary.topup_credit;
}

/**
 * Retrieve the current outstanding balance for an organization.
 *
 * PRODUCTION SAFETY:
 * In production or whenever Supabase is configured:
 * DB read failure -> FAIL CLOSED (throws error, never silently falls back to local cache).
 */
export async function getOutstandingBalance(
  organizationId: string,
  env?: Record<string, any>
): Promise<number> {
  if (!organizationId) return 0.0;

  const isProd = isProductionEnvironment(env) || !isLocalFallbackAllowed(env);

  // In production, require primary database to be configured
  if (isProd && !isSupabaseConfigured(env)) {
    assertProductionSafe('getOutstandingBalance', env);
    throw new Error('Database error querying outstanding balance: Primary database not available in production');
  }

  if (!organizationId) return 0.0;
  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(organizationId);
  if (!isUUID && isLocalFallbackAllowed(env)) {
    const cached = localWalletsCache.get(organizationId);
    return cached?.outstanding_balance ? Math.max(0, fromCents(toCents(Number(cached.outstanding_balance)))) : 0.0;
  }

  if (isSupabaseConfigured(env)) {
    try {
      const supabase = getSupabaseServerClient(env);
      const { data, error } = await supabase
        .from('organization_wallets')
        .select('outstanding_balance')
        .eq('organization_id', organizationId)
        .maybeSingle();

      if (error) {
        if (isLocalFallbackAllowed(env)) {
          const cached = localWalletsCache.get(organizationId);
          return cached?.outstanding_balance ? Math.max(0, fromCents(toCents(Number(cached.outstanding_balance)))) : 0.0;
        }
        console.error('Fatal: Failed to query outstanding_balance from database:', error);
        // DB read fails -> FAIL CLOSED in production or whenever Supabase is configured
        throw new Error(`Database error querying outstanding balance: ${error.message}`);
      }

      if (data && data.outstanding_balance !== undefined && data.outstanding_balance !== null) {
        const balance = Math.max(0, fromCents(toCents(Number(data.outstanding_balance))));
        // Keep local cache in sync only if local fallback is allowed
        if (isLocalFallbackAllowed(env)) {
          const cached = localWalletsCache.get(organizationId);
          if (cached) {
            cached.outstanding_balance = balance;
          }
        }
        return balance;
      }

      // No row found in Supabase: organization has 0.00 outstanding balance
      return 0.0;
    } catch (err: any) {
      console.error('Fatal: Database connection failed querying outstanding balance:', err.message);
      // DB read fails -> FAIL CLOSED. NEVER silently fall back to local cache.
      throw new Error(`Database error querying outstanding balance: ${err.message}`);
    }
  }

  if (isProd) {
    throw new Error('Database error querying outstanding balance: Primary database not available');
  }

  // Development/Test mock fallback strictly when Supabase is not configured
  assertProductionSafe('getOutstandingBalance', env);
  const cached = localWalletsCache.get(organizationId);
  return Math.max(0, fromCents(toCents(cached?.outstanding_balance || 0)));
}

/**
 * Server-authoritatively persist the outstanding balance for an organization.
 *
 * PRODUCTION SAFETY:
 * In production or whenever Supabase is configured:
 * DB write failure -> FAIL CLOSED (throws error, never claims success without DB confirmation).
 * Never update local cache or claim success if Supabase did not confirm it.
 */
export async function setOutstandingBalance(
  organizationId: string,
  amount: number,
  env?: Record<string, any>
): Promise<number> {
  if (!organizationId) {
    throw new Error('Organization ID is required to set outstanding balance');
  }
  const numericAmount = Math.max(0, fromCents(toCents(Number(amount) || 0)));
  const now = new Date().toISOString();
  const isProd = isProductionEnvironment(env) || !isLocalFallbackAllowed(env);

  // In production, require primary database to be configured
  if (isProd && !isSupabaseConfigured(env)) {
    assertProductionSafe('setOutstandingBalance', env);
    throw new Error('Database error updating outstanding balance: Primary database not available in production');
  }

  if (isSupabaseConfigured(env)) {
    try {
      const supabase = getSupabaseServerClient(env);
      const { data, error } = await supabase
        .from('organization_wallets')
        .upsert(
          {
            organization_id: organizationId,
            outstanding_balance: numericAmount,
            updated_at: now,
          },
          { onConflict: 'organization_id' }
        )
        .select('outstanding_balance')
        .maybeSingle();

      if (error) {
        console.error('Fatal: Failed to update outstanding_balance in database:', error);
        // DB write fails -> FAIL CLOSED
        throw new Error(`Database error updating outstanding balance: ${error.message}`);
      }

      if (!data || data.outstanding_balance === undefined || data.outstanding_balance === null) {
        console.error('Fatal: Database did not confirm outstanding_balance update');
        throw new Error('Database did not confirm outstanding balance update');
      }

      const confirmedAmount = fromCents(toCents(Number(data.outstanding_balance)));

      // Never claim success or update cache unless database confirmed the update
      if (isLocalFallbackAllowed(env)) {
        const existing = localWalletsCache.get(organizationId);
        if (existing) {
          existing.outstanding_balance = confirmedAmount;
          existing.updated_at = now;
        } else {
          localWalletsCache.set(organizationId, {
            id: crypto.randomUUID(),
            organization_id: organizationId,
            paid_balance: 0,
            welcome_credit: 0,
            showcase_credit: 0,
            topup_credit: 0,
            outstanding_balance: confirmedAmount,
            currency: 'MYR',
            welcome_credit_granted: false,
            showcase_credit_granted: false,
            created_at: now,
            updated_at: now,
          });
        }
        saveLocalStores();
      }

      return confirmedAmount;
    } catch (err: any) {
      console.error('Fatal: Error writing outstanding_balance to database:', err.message);
      // In production or whenever Supabase is configured: FAIL CLOSED!
      // Never claim outstanding balance was updated successfully if Supabase did not confirm it.
      throw new Error(`Database error updating outstanding balance: ${err.message}`);
    }
  }

  if (isProd) {
    throw new Error('Database error updating outstanding balance: Primary database not available in production');
  }

  // Development/Test mock fallback only when Supabase is not configured
  assertProductionSafe('setOutstandingBalance', env);
  const existing = localWalletsCache.get(organizationId);
  if (existing) {
    existing.outstanding_balance = numericAmount;
    existing.updated_at = now;
  } else {
    localWalletsCache.set(organizationId, {
      id: crypto.randomUUID(),
      organization_id: organizationId,
      paid_balance: 0,
      welcome_credit: 0,
      showcase_credit: 0,
      topup_credit: 0,
      outstanding_balance: numericAmount,
      currency: 'MYR',
      welcome_credit_granted: false,
      showcase_credit_granted: false,
      created_at: now,
      updated_at: now,
    });
  }
  saveLocalStores();
  return numericAmount;
}

/**
 * Add an amount to an organization's existing outstanding balance.
 */
export async function addOutstandingBalance(
  organizationId: string,
  amount: number,
  env?: Record<string, any>
): Promise<number> {
  const current = await getOutstandingBalance(organizationId, env);
  const updated = fromCents(toCents(current) + toCents(Number(amount) || 0));
  return setOutstandingBalance(organizationId, updated, env);
}

/**
 * Administrative helper to reset or manually adjust an organization's outstanding balance.
 *
 * ARCHITECTURAL MANDATE:
 * In the final architecture, payment settlement does NOT call this helper as a secondary step.
 * All payment settlement operations (wallet credit + top-up order status PAID + outstanding balance reduction)
 * MUST be executed atomically inside the single database transaction of `process_topup_order_atomic`.
 */
export async function clearOutstandingBalance(
  organizationId: string,
  amountToClear?: number,
  env?: Record<string, any>
): Promise<number> {
  if (amountToClear === undefined) {
    return setOutstandingBalance(organizationId, 0, env);
  }
  const current = await getOutstandingBalance(organizationId, env);
  const updated = Math.max(0, fromCents(toCents(current) - toCents(Number(amountToClear) || 0)));
  return setOutstandingBalance(organizationId, updated, env);
}

/**
 * Append an immutable transaction record to the ledger.
 *
 * PRODUCTION FINANCIAL SAFETY RULE:
 * When Supabase is configured in production, transactions MUST succeed in the primary
 * database. If Supabase fails, DO NOT pretend the transaction succeeded by writing to a local
 * fallback cache. Return/throw an explicit error so the client is informed and can retry.
 * Local storage is strictly a development/test fallback when Supabase is unconfigured.
 */
async function appendLedgerTransaction(
  txn: Omit<WalletTransactionRecord, 'id' | 'created_at'>,
  env?: Record<string, any>
): Promise<WalletTransactionRecord> {
  const isProdDb = isSupabaseConfigured(env);
  const supabase = getSupabaseServerClient(env);
  const id = crypto.randomUUID();
  const created_at = new Date().toISOString();

  const record: WalletTransactionRecord = {
    id,
    organization_id: txn.organization_id,
    owner_user_id: txn.owner_user_id || null,
    event_id: txn.event_id || null,
    transaction_type: txn.transaction_type,
    balance_type: txn.balance_type,
    amount: Number(txn.amount),
    currency: txn.currency || 'MYR',
    status: txn.status || 'COMPLETED',
    reference_id: txn.reference_id || null,
    description: txn.description,
    metadata: txn.metadata || {},
    created_by: txn.created_by || null,
    created_at,
  };

  if (isProdDb) {
    // Production rule: Write directly to Supabase. If Supabase fails, THROW FATAL ERROR.
    let { data, error } = await supabase
      .from('wallet_transactions')
      .insert(record)
      .select()
      .single();

    // Graceful backward-compatibility fallback if owner_user_id column migration is pending
    if (error && error.code === 'PGRST204' && error.message?.includes('owner_user_id')) {
      const { owner_user_id, ...recordWithoutOwner } = record;
      const retryResult = await supabase
        .from('wallet_transactions')
        .insert(recordWithoutOwner)
        .select()
        .single();
      data = retryResult.data;
      error = retryResult.error;
    }

    if (error) {
      if (
        isLocalFallbackAllowed(env) &&
        (error.code === '22P02' ||
          error.code === '23503' ||
          error.message?.includes('invalid input syntax for type uuid') ||
          error.message?.includes('violates foreign key constraint'))
      ) {
        localTransactionsCache.set(id, record);
        saveLocalStores();
        return record;
      }
      console.error('Fatal: Supabase insert wallet_transactions failed in production:', error);
      throw new Error(`Financial ledger transaction failed: ${error.message}`);
    }
    if (!data) {
      throw new Error('Financial ledger transaction failed: No confirmation received from database');
    }

    const savedRecord = data as WalletTransactionRecord;
    if (isLocalFallbackAllowed(env)) {
      localTransactionsCache.set(savedRecord.id, savedRecord);
    }
    return savedRecord;
  }

  // Development/Test mock fallback only when Supabase is not configured
  assertProductionSafe('appendLedgerTransaction', env);
  localTransactionsCache.set(id, record);
  saveLocalStores();
  return record;
}

/**
 * Top-up funds into the organization wallet.
 * Automatically generates promotional Top-up Credit if the top-up meets tier requirements.
 * Protected by idempotency via referenceId against duplicate webhooks and repeat requests.
 */
export async function createTopup(
  params: {
    organizationId: string;
    amount: number;
    currency?: string;
    referenceId?: string;
    description?: string;
    metadata?: Record<string, any>;
    createdBy?: string;
  },
  env?: Record<string, any>
): Promise<{
  topupTransaction: WalletTransactionRecord;
  promoCreditTransaction: WalletTransactionRecord | null;
  wallet: WalletBalanceSummary;
}> {
  const { organizationId, amount, referenceId, createdBy } = params;

  if (!organizationId) {
    throw new Error('Organization ID is required');
  }
  if (typeof amount !== 'number' || isNaN(amount) || amount <= 0) {
    throw new Error('Top-up amount must be a positive number');
  }

  // Sanitize amount to exact 2 decimal places in cents to prevent floating point anomalies
  const sanitizedAmount = fromCents(toCents(amount));
  if (sanitizedAmount <= 0) {
    throw new Error('Top-up amount must be greater than zero');
  }

  // Idempotency check: if referenceId is provided, check Supabase or local cache
  if (referenceId) {
    let existing: WalletTransactionRecord | undefined = undefined;

    if (isSupabaseConfigured(env)) {
      const supabase = getSupabaseServerClient(env);
      const { data, error } = await supabase
        .from('wallet_transactions')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('reference_id', referenceId)
        .eq('transaction_type', 'TOPUP')
        .eq('status', 'COMPLETED')
        .maybeSingle();

      if (error) {
        console.error('Fatal: Supabase idempotency query failed in production:', error);
        throw new Error(`Financial ledger transaction failed: ${error.message}`);
      }

      if (data) {
        existing = data as WalletTransactionRecord;
        if (isLocalFallbackAllowed(env)) {
          localTransactionsCache.set(existing.id, existing);
        }
      }
    } else {
      assertProductionSafe('createTopup', env);
      existing = Array.from(localTransactionsCache.values()).find(
        (t) =>
          t.organization_id === organizationId &&
          t.reference_id === referenceId &&
          t.transaction_type === 'TOPUP' &&
          t.status === 'COMPLETED'
      );
    }

    if (existing) {
      let promoExisting: WalletTransactionRecord | null = null;
      if (isSupabaseConfigured(env)) {
        const supabase = getSupabaseServerClient(env);
        const { data, error } = await supabase
          .from('wallet_transactions')
          .select('*')
          .eq('organization_id', organizationId)
          .eq('reference_id', `${referenceId}_promo`)
          .eq('transaction_type', 'TOPUP_CREDIT')
          .maybeSingle();

        if (error) {
          console.error('Fatal: Supabase promo idempotency query failed in production:', error);
          throw new Error(`Financial ledger transaction failed: ${error.message}`);
        }

        if (data) {
          promoExisting = data as WalletTransactionRecord;
          if (isLocalFallbackAllowed(env)) {
            localTransactionsCache.set(promoExisting.id, promoExisting);
          }
        }
      } else {
        promoExisting = Array.from(localTransactionsCache.values()).find(
          (t) =>
            t.organization_id === organizationId &&
            (t.reference_id === `${referenceId}_promo` ||
              t.reference_id === existing!.id ||
              t.metadata?.parent_topup_id === existing!.id) &&
            t.transaction_type === 'TOPUP_CREDIT'
        ) || null;
      }

      const currentWallet = await getWalletBalance(organizationId, env);
      return {
        topupTransaction: existing,
        promoCreditTransaction: promoExisting,
        wallet: currentWallet,
      };
    }
  }

  const currency = params.currency || 'MYR';
  const description = params.description || `Wallet Top-up of RM${sanitizedAmount.toFixed(2)}`;

  // 1. Record the paid top-up in the immutable ledger
  const topupTransaction = await appendLedgerTransaction(
    {
      organization_id: organizationId,
      event_id: null,
      transaction_type: 'TOPUP',
      balance_type: 'PAID_BALANCE',
      amount: sanitizedAmount,
      currency,
      status: 'COMPLETED',
      reference_id: referenceId || null,
      description,
      metadata: {
        ...(params.metadata || {}),
        topup_amount: sanitizedAmount,
      },
      created_by: createdBy || null,
    },
    env
  );

  // 2. Calculate promotional Top-up Credit for this individual top-up
  const promoCreditAmount = calculateTopupCredit(sanitizedAmount);
  let promoCreditTransaction: WalletTransactionRecord | null = null;

  if (promoCreditAmount > 0) {
    const tierRate = sanitizedAmount >= TOPUP_TIER_2_MIN ? '7%' : '5%';
    const promoRef = referenceId ? `${referenceId}_promo` : `${topupTransaction.id}_promo`;
    promoCreditTransaction = await appendLedgerTransaction(
      {
        organization_id: organizationId,
        event_id: null,
        transaction_type: 'TOPUP_CREDIT',
        balance_type: 'TOPUP_CREDIT',
        amount: promoCreditAmount,
        currency,
        status: 'COMPLETED',
        reference_id: promoRef,
        description: `Promotional ${tierRate} Top-up Credit on RM${sanitizedAmount.toFixed(2)} deposit`,
        metadata: {
          parent_topup_id: topupTransaction.id,
          qualifying_amount: sanitizedAmount,
          reward_rate: tierRate,
        },
        created_by: createdBy || null,
      },
      env
    );
  }

  // 3. Recalculate balances
  const wallet = await recalculateWalletBalances(organizationId, env);

  // Record audit trail event for WALLET_CREDITED
  await recordWalletAuditEvent(
    {
      organizationId,
      eventType: 'WALLET_CREDITED',
      orderId: (params.metadata?.topup_order_id as string) || null,
      paymentReference: referenceId || null,
      amount: sanitizedAmount,
      currency,
      actorId: createdBy || null,
      metadata: {
        paid_amount: sanitizedAmount,
        promo_credit: promoCreditAmount,
        total_wallet_balance: wallet.total_balance,
        paid_balance: wallet.paid_balance,
        topup_credit: wallet.topup_credit,
      },
    },
    env
  );

  return {
    topupTransaction,
    promoCreditTransaction,
    wallet,
  };
}

/**
 * Grant Welcome Credit (RM800.00) to an organization.
 * 
 * BUSINESS RULES:
 * - Automatic Welcome Credit upon organization creation is DISCONTINUED:
 *   - User creates first organization: ❌ No automatic grant.
 *   - Same user creates another organization: ❌ No automatic grant.
 *   - User is invited as member or accepts invitation: ❌ No automatic grant.
 * - Welcome Credit can ONLY be granted manually by a verified developer admin for promotional campaigns.
 * - Even when manually granted, it is strictly an Account Owner-Level Lifetime Reward (max 1 lifetime per user account).
 */
export async function grantWelcomeCredit(
  params: {
    organizationId: string;
    userId?: string;
    createdBy?: string;
    referenceId?: string;
    metadata?: Record<string, any>;
  },
  env?: Record<string, any>
): Promise<{
  transaction: WalletTransactionRecord | null;
  wallet: WalletBalanceSummary;
  alreadyGranted: boolean;
  notEligible?: boolean;
  message?: string;
}> {
  const { organizationId, createdBy, referenceId, metadata } = params;

  if (!organizationId) {
    throw new Error('Organization ID is required');
  }

  // 1. Authoritative Owner-Only Constraint
  // Welcome Credit is strictly an owner-only, user-level promotion.
  let targetUserId = params.userId;
  if (targetUserId) {
    const isOwner = await isUserOrganizationOwner(targetUserId, organizationId, env);
    if (!isOwner) {
      const currentWallet = await getWalletBalance(organizationId, env);
      return {
        transaction: null,
        wallet: currentWallet,
        alreadyGranted: false,
        notEligible: true,
        message: 'Only the organization owner is eligible for Welcome Credit. Organization members cannot receive this promotion.',
      };
    }
  } else {
    targetUserId = (await resolveOrgOwnerId(organizationId, env)) || createdBy;
    if (targetUserId) {
      const isOwner = await isUserOrganizationOwner(targetUserId, organizationId, env);
      if (!isOwner) {
        const currentWallet = await getWalletBalance(organizationId, env);
        return {
          transaction: null,
          wallet: currentWallet,
          alreadyGranted: false,
          notEligible: true,
          message: 'Only the organization owner is eligible for Welcome Credit. Organization members cannot receive this promotion.',
        };
      }
    }
  }

  if (!targetUserId) {
    const currentWallet = await getWalletBalance(organizationId, env);
    return {
      transaction: null,
      wallet: currentWallet,
      alreadyGranted: false,
      notEligible: true,
      message: 'Valid organization owner user ID is required to evaluate and grant Welcome Credit (Welcome Credit is strictly an owner-level lifetime reward).',
    };
  }

  const lockKey = targetUserId;

  return await withUserRewardLock(lockKey, async () => {
    return await withOrganizationLock(organizationId, async () => {
      let alreadyGranted = false;
      let existingTxn: WalletTransactionRecord | undefined = undefined;

      // 2. Check if user already received Welcome Credit in user_rewards or wallet_transactions
      const alreadyClaimedLifetime = await hasUserClaimedReward(targetUserId, 'WELCOME_CREDIT', env);
      if (alreadyClaimedLifetime) {
        alreadyGranted = true;
      }

      if (isSupabaseConfigured(env)) {
        const supabase = getSupabaseServerClient(env);
        
        // Check user_rewards table
        try {
          const { data: rewardData } = await supabase
            .from('user_rewards')
            .select('*')
            .eq('user_id', targetUserId)
            .eq('reward_type', 'WELCOME_CREDIT')
            .maybeSingle();

          if (rewardData) {
            alreadyGranted = true;
            if (rewardData.transaction_id) {
              const { data: tData } = await supabase
                .from('wallet_transactions')
                .select('*')
                .eq('id', rewardData.transaction_id)
                .maybeSingle();
              if (tData) {
                existingTxn = tData as WalletTransactionRecord;
              }
            }
          }
        } catch {
          // Ignore if table temporarily not migrated
        }

        // Check wallet_transactions across ANY organization for this user
        if (!alreadyGranted) {
          try {
            let { data: txnData, error: txnErr } = await supabase
              .from('wallet_transactions')
              .select('*')
              .eq('transaction_type', 'WELCOME_CREDIT')
              .eq('status', 'COMPLETED')
              .or(`owner_user_id.eq.${targetUserId},created_by.eq.${targetUserId}`)
              .limit(1)
              .maybeSingle();

            if (txnErr) {
              // If owner_user_id column is not yet present, query by created_by
              const fallback = await supabase
                .from('wallet_transactions')
                .select('*')
                .eq('transaction_type', 'WELCOME_CREDIT')
                .eq('status', 'COMPLETED')
                .eq('created_by', targetUserId)
                .limit(1)
                .maybeSingle();
              txnData = fallback.data;
            }

            // Also check if any organization owned by this user already has a welcome credit
            if (!txnData) {
              const { data: userOrgs } = await supabase
                .from('organizations')
                .select('id')
                .eq('owner_id', targetUserId);

              if (userOrgs && userOrgs.length > 0) {
                const orgIds = userOrgs.map((o) => o.id);
                const { data: orgWelcomeTxn } = await supabase
                  .from('wallet_transactions')
                  .select('*')
                  .eq('transaction_type', 'WELCOME_CREDIT')
                  .eq('status', 'COMPLETED')
                  .in('organization_id', orgIds)
                  .limit(1)
                  .maybeSingle();

                if (orgWelcomeTxn) {
                  txnData = orgWelcomeTxn;
                }
              }
            }

            if (txnData) {
              alreadyGranted = true;
              existingTxn = txnData as WalletTransactionRecord;
            }
          } catch {
            // Ignore
          }
        }
      } else {
        // Local cache
        if (localUserRewardsCache.has(`${targetUserId}:WELCOME_CREDIT`)) {
          alreadyGranted = true;
          const userReward = localUserRewardsCache.get(`${targetUserId}:WELCOME_CREDIT`);
          if (userReward?.transaction_id) {
            existingTxn = localTransactionsCache.get(userReward.transaction_id);
          }
        }
        if (!existingTxn) {
          const userTxn = Array.from(localTransactionsCache.values()).find(
            (t) =>
              (t.owner_user_id === targetUserId || t.created_by === targetUserId) &&
              t.transaction_type === 'WELCOME_CREDIT' &&
              t.status === 'COMPLETED'
          );
          if (userTxn) {
            alreadyGranted = true;
            existingTxn = userTxn;
          }
        }
        if (!alreadyGranted) {
          const { localOrgsCache } = await import('./organizations.js');
          const userOrgIds = new Set(
            Array.from(localOrgsCache.values())
              .filter((o) => o.owner_id === targetUserId)
              .map((o) => o.id)
          );
          if (userOrgIds.size > 0) {
            const orgWelcomeTxn = Array.from(localTransactionsCache.values()).find(
              (t) =>
                userOrgIds.has(t.organization_id) &&
                t.transaction_type === 'WELCOME_CREDIT' &&
                t.status === 'COMPLETED'
            );
            if (orgWelcomeTxn) {
              alreadyGranted = true;
              existingTxn = orgWelcomeTxn;
            }
          }
        }
      }

      // Check if this specific organization already has a WELCOME_CREDIT transaction
      if (!alreadyGranted) {
        if (isSupabaseConfigured(env)) {
          const supabase = getSupabaseServerClient(env);
          const { data: orgTxn } = await supabase
            .from('wallet_transactions')
            .select('*')
            .eq('organization_id', organizationId)
            .eq('transaction_type', 'WELCOME_CREDIT')
            .eq('status', 'COMPLETED')
            .maybeSingle();

          if (orgTxn) {
            alreadyGranted = true;
            existingTxn = orgTxn as WalletTransactionRecord;
          }
        } else {
          assertProductionSafe('grantWelcomeCredit', env);
          const orgTxn = Array.from(localTransactionsCache.values()).find(
            (t) =>
              t.organization_id === organizationId &&
              t.transaction_type === 'WELCOME_CREDIT' &&
              t.status === 'COMPLETED'
          );
          if (orgTxn) {
            alreadyGranted = true;
            existingTxn = orgTxn;
          }
        }
      }

      if (alreadyGranted) {
        const currentWallet = await getWalletBalance(organizationId, env);
        return {
          transaction: existingTxn || null,
          wallet: currentWallet,
          alreadyGranted: true,
          notEligible: true,
          message: 'Welcome Credit has already been claimed by this user in their account lifetime (one-time lifetime limit).',
        };
      }

      // 3. Atomically reserve in user_rewards
      const now = new Date().toISOString();
      let userRewardRecord: UserRewardRecord | null = null;

      if (isSupabaseConfigured(env)) {
        const supabase = getSupabaseServerClient(env);
        try {
          const { data: insertReward, error: insertError } = await supabase
            .from('user_rewards')
            .insert({
              user_id: targetUserId,
              reward_type: 'WELCOME_CREDIT',
              organization_id: organizationId,
              amount: WELCOME_CREDIT_AMOUNT,
              created_at: now,
            })
            .select()
            .single();

          if (insertError) {
            if (
              insertError.code === '23505' ||
              insertError.message?.includes('duplicate key') ||
              insertError.message?.includes('ux_user_rewards') ||
              insertError.message?.includes('unique')
            ) {
              const currentWallet = await getWalletBalance(organizationId, env);
              return {
                transaction: existingTxn || null,
                wallet: currentWallet,
                alreadyGranted: true,
                notEligible: true,
                message: 'Welcome Credit has already been claimed by this user in their account lifetime (one-time lifetime limit).',
              };
            }
            if (!isLocalFallbackAllowed(env)) {
              throw new Error(`Failed to record user welcome credit reward: ${insertError.message}`);
            }
          } else if (insertReward) {
            userRewardRecord = insertReward as UserRewardRecord;
          }
        } catch (rewardErr: any) {
          if (!isLocalFallbackAllowed(env)) {
            throw rewardErr;
          }
        }
      } else {
        assertProductionSafe('grantWelcomeCredit', env);
        if (localUserRewardsCache.has(`${targetUserId}:WELCOME_CREDIT`)) {
          const currentWallet = await getWalletBalance(organizationId, env);
          return {
            transaction: existingTxn || null,
            wallet: currentWallet,
            alreadyGranted: true,
            notEligible: true,
            message: 'Welcome Credit has already been claimed by this user in their account lifetime (one-time lifetime limit).',
          };
        }
        userRewardRecord = {
          id: crypto.randomUUID(),
          user_id: targetUserId,
          reward_type: 'WELCOME_CREDIT',
          organization_id: organizationId,
          transaction_id: null,
          amount: WELCOME_CREDIT_AMOUNT,
          created_at: now,
        };
        localUserRewardsCache.set(`${targetUserId}:WELCOME_CREDIT`, userRewardRecord);
        saveLocalStores();
      }

      if (!userRewardRecord) {
        const currentWallet = await getWalletBalance(organizationId, env);
        return {
          transaction: existingTxn || null,
          wallet: currentWallet,
          alreadyGranted: true,
          message: 'Welcome Credit reservation could not be established. Skipping grant.',
        };
      }

      // 4. Append welcome credit transaction to the immutable ledger
      let transaction: WalletTransactionRecord | null = null;
      try {
        transaction = await appendLedgerTransaction(
          {
            organization_id: organizationId,
            owner_user_id: targetUserId,
            event_id: null,
            transaction_type: 'WELCOME_CREDIT',
            balance_type: 'WELCOME_CREDIT',
            amount: WELCOME_CREDIT_AMOUNT,
            currency: 'MYR',
            status: 'COMPLETED',
            reference_id: referenceId || `welcome_${organizationId}`,
            description: `One-time Welcome Credit grant of RM${WELCOME_CREDIT_AMOUNT.toFixed(2)}`,
            metadata: {
              ...(metadata || {}),
              owner_user_id: targetUserId,
              program: 'ORGANIZATION_ONBOARDING_WELCOME',
            },
            created_by: createdBy || targetUserId,
          },
          env
        );
      } catch (appendErr: any) {
        // Rollback user_rewards reservation to prevent inconsistent reward state!
        if (isSupabaseConfigured(env)) {
          try {
            const supabase = getSupabaseServerClient(env);
            if (userRewardRecord?.id) {
              await supabase.from('user_rewards').delete().eq('id', userRewardRecord.id);
            }
          } catch {
            // ignore rollback error
          }
        } else {
          localUserRewardsCache.delete(`${targetUserId}:WELCOME_CREDIT`);
          saveLocalStores();
        }

        if (
          appendErr?.code === '23505' ||
          appendErr?.message?.includes('ux_wallet_txns_user_welcome_credit_unique') ||
          appendErr?.message?.includes('duplicate key')
        ) {
          const currentWallet = await getWalletBalance(organizationId, env);
          return {
            transaction: null,
            wallet: currentWallet,
            alreadyGranted: true,
            message: 'Welcome Credit has already been granted to this user in their account lifetime (one-time lifetime limit).',
          };
        }
        throw appendErr;
      }

      // Link transaction_id in user_rewards if available
      if (userRewardRecord && transaction?.id) {
        userRewardRecord.transaction_id = transaction.id;
        if (isSupabaseConfigured(env)) {
          try {
            const supabase = getSupabaseServerClient(env);
            const { error: rewardUpdateErr } = await supabase
              .from('user_rewards')
              .update({ transaction_id: transaction.id })
              .eq('id', userRewardRecord.id);
            if (rewardUpdateErr) {
              console.warn('Notice updating user_rewards transaction_id:', rewardUpdateErr.message);
            }
          } catch (err: any) {
            console.warn('Error updating user_rewards transaction_id:', err?.message || err);
          }
        } else {
          saveLocalStores();
        }
      }

      const wallet = await recalculateWalletBalances(organizationId, env);

      await dispatchNotificationEvent(
        {
          eventType: 'WELCOME_CREDIT_ADDED',
          organizationId,
          recipientUserId: targetUserId || undefined,
          amount: WELCOME_CREDIT_AMOUNT,
          currency: 'MYR',
        },
        env
      ).catch((err) => console.error('[NOTIFICATION] Failed to dispatch WELCOME_CREDIT_ADDED:', err));

      return {
        transaction,
        wallet,
        alreadyGranted: false,
        message: `Successfully granted RM${WELCOME_CREDIT_AMOUNT.toFixed(2)} Welcome Credit!`,
      };
    });
  });
}

/**
 * Check if a user has already received Welcome Credit in their account lifetime.
 * This is strictly a one-time per user account lifetime limit.
 */
export async function hasUserReceivedWelcomeCredit(
  userId: string,
  env?: Record<string, any>
): Promise<boolean> {
  if (!userId) return false;

  if (isSupabaseConfigured(env)) {
    const supabase = getSupabaseServerClient(env);

    // 1. Check user_rewards table
    const { data: rewardData, error: rewardErr } = await supabase
      .from('user_rewards')
      .select('id')
      .eq('user_id', userId)
      .eq('reward_type', 'WELCOME_CREDIT')
      .maybeSingle();

    if (rewardErr && !isLocalFallbackAllowed(env)) {
      throw new Error(`Database error checking user_rewards for welcome credit: ${rewardErr.message}`);
    }
    if (rewardData) return true;

    // 2. Check wallet_transactions table
    const { data: txnData, error: txnErr } = await supabase
      .from('wallet_transactions')
      .select('id')
      .eq('transaction_type', 'WELCOME_CREDIT')
      .eq('status', 'COMPLETED')
      .or(`owner_user_id.eq.${userId},created_by.eq.${userId}`)
      .limit(1)
      .maybeSingle();

    if (txnErr && !isLocalFallbackAllowed(env)) {
      throw new Error(`Database error checking wallet_transactions for welcome credit: ${txnErr.message}`);
    }
    if (txnData) return true;

    // 3. Check organizations owned by this user
    const { data: userOrgs, error: orgsErr } = await supabase
      .from('organizations')
      .select('id')
      .eq('owner_id', userId);

    if (orgsErr && !isLocalFallbackAllowed(env)) {
      throw new Error(`Database error checking organizations for welcome credit: ${orgsErr.message}`);
    }

    if (userOrgs && userOrgs.length > 0) {
      const orgIds = userOrgs.map((o) => o.id);
      const { data: orgTxn, error: orgTxnErr } = await supabase
        .from('wallet_transactions')
        .select('id')
        .eq('transaction_type', 'WELCOME_CREDIT')
        .eq('status', 'COMPLETED')
        .in('organization_id', orgIds)
        .limit(1)
        .maybeSingle();

      if (orgTxnErr && !isLocalFallbackAllowed(env)) {
        throw new Error(`Database error checking organization transactions for welcome credit: ${orgTxnErr.message}`);
      }
      if (orgTxn) return true;
    }

    return false;
  }

  if (localUserRewardsCache.has(`${userId}:WELCOME_CREDIT`)) {
    return true;
  }

  const existingTxn = Array.from(localTransactionsCache.values()).find(
    (t) =>
      (t.owner_user_id === userId || t.created_by === userId) &&
      t.transaction_type === 'WELCOME_CREDIT' &&
      t.status === 'COMPLETED'
  );

  if (existingTxn) return true;

  const { localOrgsCache } = await import('./organizations.js');
  const userOrgIds = new Set(
    Array.from(localOrgsCache.values())
      .filter((o) => o.owner_id === userId)
      .map((o) => o.id)
  );
  if (userOrgIds.size > 0) {
    const orgWelcomeTxn = Array.from(localTransactionsCache.values()).find(
      (t) =>
        userOrgIds.has(t.organization_id) &&
        t.transaction_type === 'WELCOME_CREDIT' &&
        t.status === 'COMPLETED'
    );
    if (orgWelcomeTxn) return true;
  }

  return false;
}

/**
 * Check if a user/owner has already received Showcase Credit in their account lifetime.
 * This is strictly a one-time per user account lifetime limit.
 * Delegates authoritatively to getShowcaseRewardEligibility with public.user_rewards as the source of truth.
 */
export async function hasUserReceivedShowcaseCredit(
  userId: string,
  env?: Record<string, any>
): Promise<boolean> {
  if (!userId) return false;
  const { getShowcaseRewardEligibility } = await import('./rewards.js');
  const eligibility = await getShowcaseRewardEligibility(userId, env);
  return Boolean(eligibility.alreadyClaimed || eligibility.hasReceivedReward || eligibility.userRewardStatus === 'REWARDED');
}

/**
 * Check if an organization is eligible to use Welcome Credit for an Event.
 * 
 * Rules:
 * - Welcome Credit = RM800.00
 * - Standard Event price = RM1,400.00
 * - Paid balance required = RM600.00 (Customer can top up any amount, but must have at least RM600 paid balance)
 * - Cannot be combined with Showcase Credit or Top-up Credit.
 * - No 20% limit applies to Welcome Credit.
 */
export async function canUseWelcomeCredit(
  organizationId: string,
  eventIdOrPrice?: string | number,
  eventPriceOverrideOrEnv?: number | Record<string, any>,
  envParam?: Record<string, any>
): Promise<CreditEligibilityResult> {
  if (!organizationId) {
    throw new Error('Organization ID is required');
  }

  let eventId: string | undefined = undefined;
  let eventPriceOverride: number | undefined = undefined;
  let env: Record<string, any> | undefined = envParam;

  if (typeof eventIdOrPrice === 'string') {
    eventId = eventIdOrPrice;
  } else if (typeof eventIdOrPrice === 'number') {
    eventPriceOverride = eventIdOrPrice;
  }

  if (typeof eventPriceOverrideOrEnv === 'number') {
    eventPriceOverride = eventPriceOverrideOrEnv;
  } else if (typeof eventPriceOverrideOrEnv === 'object' && eventPriceOverrideOrEnv !== null) {
    env = eventPriceOverrideOrEnv;
  }

  let eventPrice: number | undefined = undefined;
  if (eventId) {
    const { getEventById } = await import('./events.js');
    const ev = await getEventById(eventId, env);
    if (!ev) {
      const err: any = new Error('Event not found.');
      err.status = 404;
      err.code = 'EVENT_NOT_FOUND';
      throw err;
    }
    const snapPrice = Number(ev.event_price);
    const snapCurrency = typeof ev.event_currency === 'string' ? ev.event_currency.trim().toUpperCase() : '';
    if (!snapPrice || isNaN(snapPrice) || snapPrice <= 0 || !snapCurrency) {
      const err: any = new Error('Pricing configuration error: Event is missing a valid authoritative price or currency. Payment cannot proceed.');
      err.status = 503;
      err.statusCode = 503;
      err.code = 'PRICING_CONFIGURATION_ERROR';
      throw err;
    }
    eventPrice = snapPrice;
  } else if (eventPriceOverride && Number(eventPriceOverride) > 0) {
    eventPrice = Number(eventPriceOverride);
  } else {
    // If no specific event or override price is specified, default to authoritative 1-day platform base price (RM1,400.00)
    try {
      const { calculateEventAuthoritativePrice } = await import('./platformSettings.js');
      const pricing = await calculateEventAuthoritativePrice({ start_date: '2026-01-01', end_date: '2026-01-01' }, env);
      eventPrice = pricing.price;
    } catch {
      eventPrice = 1400.00;
    }
  }

  const wallet = await getWalletBalance(organizationId, env);
  const creditAvailable = wallet.welcome_credit;
  const creditAmount = Math.min(creditAvailable, WELCOME_CREDIT_AMOUNT);
  const paidBalanceAvailable = wallet.paid_balance;
  const paidBalanceRequired = Math.max(0, fromCents(toCents(eventPrice) - toCents(WELCOME_CREDIT_AMOUNT)));

  if (creditAvailable < WELCOME_CREDIT_AMOUNT) {
    return {
      eligible: false,
      credit_type: 'WELCOME_CREDIT',
      credit_available: creditAvailable,
      credit_amount: creditAmount,
      paid_balance_available: paidBalanceAvailable,
      paid_balance_required: paidBalanceRequired,
      event_price: eventPrice,
      reason: 'No Welcome Credit is available in your organization wallet.',
    };
  }

  if (paidBalanceAvailable < paidBalanceRequired) {
    return {
      eligible: false,
      credit_type: 'WELCOME_CREDIT',
      credit_available: creditAvailable,
      credit_amount: creditAmount,
      paid_balance_available: paidBalanceAvailable,
      paid_balance_required: paidBalanceRequired,
      event_price: eventPrice,
      reason: `Insufficient Paid Balance. Event price is RM${eventPrice.toFixed(2)}. Welcome Credit covers RM${WELCOME_CREDIT_AMOUNT.toFixed(2)}, requiring at least RM${paidBalanceRequired.toFixed(2)} in Paid Balance, but your current Paid Balance is RM${paidBalanceAvailable.toFixed(2)}.`,
    };
  }

  return {
    eligible: true,
    credit_type: 'WELCOME_CREDIT',
    credit_available: creditAvailable,
    credit_amount: creditAmount,
    paid_balance_available: paidBalanceAvailable,
    paid_balance_required: paidBalanceRequired,
    event_price: eventPrice,
  };
}

/**
 * Consume Welcome Credit (RM800.00) and Paid Balance (RM600.00) for an eligible Event.
 * Uses atomic payment transaction engine to guarantee ACID integrity.
 */
export async function consumeWelcomeCredit(
  params: {
    organizationId: string;
    eventId: string;
    referenceId?: string;
    createdBy?: string;
    description?: string;
    metadata?: Record<string, any>;
  },
  env?: Record<string, any>
): Promise<{
  success: boolean;
  creditTransaction: WalletTransactionRecord;
  paidTransaction: WalletTransactionRecord;
  wallet: WalletBalanceSummary;
}> {
  const { organizationId, eventId, referenceId, createdBy, description, metadata } = params;

  if (!organizationId) {
    throw new Error('Organization ID is required');
  }
  if (!eventId) {
    throw new Error('Event ID is required');
  }

  // Idempotency check: if event or referenceId is already paid with welcome credit, return existing transactions without double-charging
  try {
    const { transactions: orgTxns } = await getWalletTransactions(organizationId, undefined, env);
    const creditTransaction = orgTxns.find(
      (t) => (t.event_id === eventId || (referenceId && t.reference_id === referenceId)) &&
             (t.balance_type === 'WELCOME_CREDIT' || t.transaction_type === 'CREDIT_USAGE')
    );
    const paidTransaction = orgTxns.find(
      (t) => (t.event_id === eventId || (referenceId && t.reference_id === referenceId)) &&
             (t.balance_type === 'PAID_BALANCE' || t.transaction_type === 'EVENT_PAYMENT')
    );
    if (creditTransaction && paidTransaction) {
      const currentWallet = await getWalletBalance(organizationId, env);
      return {
        success: true,
        creditTransaction,
        paidTransaction,
        wallet: currentWallet,
      };
    }
  } catch (e) {
    // Continue with standard payment process
  }

  const currentWallet = await getWalletBalance(organizationId, env);
  if (!currentWallet || currentWallet.welcome_credit <= 0) {
    throw new Error('No Welcome Credit is available in this organization wallet to consume.');
  }

  const { getEventById } = await import('./events.js');
  const ev = await getEventById(eventId, env);
  if (!ev) {
    const err: any = new Error('Event not found.');
    err.status = 404;
    err.code = 'EVENT_NOT_FOUND';
    throw err;
  }
  const snapPrice = Number(ev.event_price);
  const snapCurrency = typeof ev.event_currency === 'string' ? ev.event_currency.trim().toUpperCase() : '';
  if (!snapPrice || isNaN(snapPrice) || snapPrice <= 0 || !snapCurrency) {
    const err: any = new Error('Pricing configuration error: Event is missing a valid authoritative price or currency. Payment cannot proceed.');
    err.status = 503;
    err.statusCode = 503;
    err.code = 'PRICING_CONFIGURATION_ERROR';
    throw err;
  }
  const resolvedEventPrice = snapPrice;

  const result = await processEventPayment(
    {
      organizationId,
      eventId,
      paymentMode: 'WELCOME_CREDIT',
      eventPrice: resolvedEventPrice,
      referenceId,
      createdBy,
      description,
      metadata,
    },
    env
  );

  const creditTransaction = result.transactions.find(
    (t) => t.balance_type === 'WELCOME_CREDIT' || t.transaction_type === 'CREDIT_USAGE'
  );
  const paidTransaction = result.transactions.find(
    (t) => t.balance_type === 'PAID_BALANCE' || t.transaction_type === 'EVENT_PAYMENT'
  );

  if (!creditTransaction || !paidTransaction) {
    throw new Error('Failed to retrieve complete atomic payment transactions');
  }

  return {
    success: true,
    creditTransaction,
    paidTransaction,
    wallet: result.wallet,
  };
}

/**
 * Grant one-time Showcase Credit (RM300.00) after approved Showcase program completion.
 * Strictly enforced to be granted only once per user/owner account lifetime across all organizations.
 */
export async function grantShowcaseCredit(
  params: {
    organizationId: string;
    ownerUserId?: string;
    eventId?: string;
    createdBy?: string;
    referenceId?: string;
    metadata?: Record<string, any>;
  },
  env?: Record<string, any>
): Promise<{
  transaction: WalletTransactionRecord | null;
  wallet: WalletBalanceSummary;
  alreadyGranted: boolean;
  notEligible?: boolean;
  message?: string;
}> {
  const { organizationId, ownerUserId, eventId, createdBy, referenceId, metadata } = params;

  if (!organizationId) {
    throw new Error('Organization ID is required');
  }

  // 1. Resolve target owner user ID (Showcase Reward is strictly an owner-level lifetime reward)
  let targetOwnerId = ownerUserId;
  if (!targetOwnerId) {
    targetOwnerId = (await resolveOrgOwnerId(organizationId, env)) || createdBy;
  }

  if (!targetOwnerId) {
    const currentWallet = await getWalletBalance(organizationId, env);
    return {
      transaction: null as any,
      wallet: currentWallet,
      alreadyGranted: false,
      notEligible: true,
      message: 'Valid owner user ID is required to evaluate and grant Showcase Credit (Showcase Credit is strictly an owner-level lifetime reward).',
    };
  }

  // Enforce Authoritative Organization Owner Check
  const isOwner = await isUserOrganizationOwner(targetOwnerId, organizationId, env);
  if (!isOwner) {
    const currentWallet = await getWalletBalance(organizationId, env);
    return {
      transaction: null as any,
      wallet: currentWallet,
      alreadyGranted: false,
      notEligible: true,
      message: 'Only the organization owner is eligible for Showcase Reward. Organization members cannot receive promotional credits.',
    };
  }

  // 2. Serialize execution per user and per organization to prevent in-process race conditions
  return await withUserRewardLock(targetOwnerId, async () => {
    return await withOrganizationLock(organizationId, async () => {
      // 3. Check owner-level lifetime eligibility first
      const alreadyRewarded = await hasUserReceivedShowcaseCredit(targetOwnerId!, env) || await hasUserClaimedReward(targetOwnerId!, 'SHOWCASE_REWARD', env);
      if (alreadyRewarded) {
        let existingTxn: WalletTransactionRecord | null = null;
        if (isSupabaseConfigured(env)) {
          const supabase = getSupabaseServerClient(env);
          const { data } = await supabase
            .from('wallet_transactions')
            .select('*')
            .eq('transaction_type', 'SHOWCASE_CREDIT')
            .eq('status', 'COMPLETED')
            .or(`owner_user_id.eq.${targetOwnerId},created_by.eq.${targetOwnerId}`)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          if (data) {
            existingTxn = data as WalletTransactionRecord;
          }
        } else {
          existingTxn = Array.from(localTransactionsCache.values()).find(
            (t) =>
              (t.owner_user_id === targetOwnerId || t.created_by === targetOwnerId) &&
              t.transaction_type === 'SHOWCASE_CREDIT' &&
              t.status === 'COMPLETED'
          ) || null;
        }

        const currentWallet = await getWalletBalance(organizationId, env);
        return {
          transaction: existingTxn || ({
            id: crypto.randomUUID(),
            organization_id: organizationId,
            owner_user_id: targetOwnerId,
            event_id: eventId || null,
            transaction_type: 'SHOWCASE_CREDIT',
            balance_type: 'SHOWCASE_CREDIT',
            amount: SHOWCASE_CREDIT_AMOUNT,
            currency: 'MYR',
            status: 'COMPLETED',
            reference_id: referenceId || null,
            description: 'One-time Event Showcase completion reward credit',
            metadata: null,
            created_by: null,
            created_at: new Date().toISOString(),
          } as WalletTransactionRecord),
          wallet: currentWallet,
          alreadyGranted: true,
          message: 'First-event showcase reward credit has already been granted to this owner (one-time lifetime reward).',
        };
      }

      const now = new Date().toISOString();

      if (isSupabaseConfigured(env)) {
        const supabase = getSupabaseServerClient(env);

        // 4. Atomically reserve reward in user_rewards table
        let userRewardRecord: UserRewardRecord | null = null;
        try {
          const { data: insertReward, error: insertError } = await supabase
            .from('user_rewards')
            .insert({
              user_id: targetOwnerId,
              reward_type: 'SHOWCASE_CREDIT',
              organization_id: organizationId,
              amount: SHOWCASE_CREDIT_AMOUNT,
              created_at: now,
            })
            .select()
            .single();

          if (insertError) {
            if (
              insertError.code === '23505' ||
              insertError.message?.includes('duplicate key') ||
              insertError.message?.includes('ux_user_rewards') ||
              insertError.message?.includes('unique')
            ) {
              const currentWallet = await getWalletBalance(organizationId, env);
              return {
                transaction: null as any,
                wallet: currentWallet,
                alreadyGranted: true,
                message: 'First-event showcase reward credit has already been granted to this owner (one-time lifetime reward).',
              };
            }
            if (!isLocalFallbackAllowed(env)) {
              throw new Error(`Failed to record user showcase credit reward reservation: ${insertError.message}`);
            }
          } else if (insertReward) {
            userRewardRecord = insertReward as UserRewardRecord;
          }
        } catch (rewardErr: any) {
          if (!isLocalFallbackAllowed(env)) {
            throw rewardErr;
          }
        }

        if (!userRewardRecord && !isLocalFallbackAllowed(env)) {
          throw new Error('Showcase Credit user reservation failed: database could not confirm reservation.');
        }

        // 5. Append SHOWCASE_CREDIT to immutable wallet transactions ledger
        let transaction: WalletTransactionRecord;
        try {
          transaction = await appendLedgerTransaction(
            {
              organization_id: organizationId,
              owner_user_id: targetOwnerId,
              event_id: eventId || null,
              transaction_type: 'SHOWCASE_CREDIT',
              balance_type: 'SHOWCASE_CREDIT',
              amount: SHOWCASE_CREDIT_AMOUNT,
              currency: 'MYR',
              status: 'COMPLETED',
              reference_id: referenceId || `showcase_${organizationId}`,
              description: `One-time Event Showcase completion reward credit of RM${SHOWCASE_CREDIT_AMOUNT.toFixed(2)}`,
              metadata: {
                ...(metadata || {}),
                program: 'EVENT_SHOWCASE_APPROVED_REWARD',
                event_id: eventId || null,
                owner_user_id: targetOwnerId,
              },
              created_by: createdBy || null,
            },
            env
          );
        } catch (insertErr: any) {
          if (
            insertErr.message?.includes('duplicate key') ||
            insertErr.message?.includes('ux_wallet_txns_owner_showcase_credit_unique') ||
            insertErr.message?.includes('ux_wallet_txns_showcase_credit') ||
            insertErr.code === '23505'
          ) {
            const currentWallet = await getWalletBalance(organizationId, env);
            return {
              transaction: null as any,
              wallet: currentWallet,
              alreadyGranted: true,
              message: 'First-event showcase reward credit has already been granted to this owner (one-time lifetime reward).',
            };
          }
          throw insertErr;
        }

        // 6. Update user_rewards with the transaction_id
        if (userRewardRecord?.id) {
          try {
            const { error: rewardUpdateErr } = await supabase
              .from('user_rewards')
              .update({ transaction_id: transaction.id })
              .eq('id', userRewardRecord.id);
            if (rewardUpdateErr) {
              console.warn('Notice updating user_rewards transaction_id:', rewardUpdateErr.message);
            }
          } catch (err: any) {
            console.warn('Error updating user_rewards transaction_id:', err?.message || err);
          }
        }

        // 7. Upsert into owner_showcase_rewards
        try {
          await supabase
            .from('owner_showcase_rewards')
            .upsert({
              owner_user_id: targetOwnerId,
              organization_id: organizationId,
              event_id: eventId || null,
              showcase_id: metadata?.showcase_id || null,
              transaction_id: transaction.id,
              amount: SHOWCASE_CREDIT_AMOUNT,
              rewarded_at: now,
              created_at: now,
            });
        } catch {
          // non-fatal
        }

        const wallet = await recalculateWalletBalances(organizationId, env);

        return {
          transaction,
          wallet,
          alreadyGranted: false,
          message: `Successfully granted RM${SHOWCASE_CREDIT_AMOUNT.toFixed(2)} Showcase Reward Credit!`,
        };
      } else {
        assertProductionSafe('grantShowcaseCredit', env);

        // Record in user_rewards local cache
        const userRewardRecord: UserRewardRecord = {
          id: crypto.randomUUID(),
          user_id: targetOwnerId,
          reward_type: 'SHOWCASE_CREDIT',
          organization_id: organizationId,
          transaction_id: null,
          amount: SHOWCASE_CREDIT_AMOUNT,
          created_at: now,
        };
        localUserRewardsCache.set(`${targetOwnerId}:SHOWCASE_CREDIT`, userRewardRecord);
        localUserRewardsCache.set(`${targetOwnerId}:SHOWCASE_REWARD`, userRewardRecord);

        // Append to immutable ledger
        const transaction = await appendLedgerTransaction(
          {
            organization_id: organizationId,
            owner_user_id: targetOwnerId,
            event_id: eventId || null,
            transaction_type: 'SHOWCASE_CREDIT',
            balance_type: 'SHOWCASE_CREDIT',
            amount: SHOWCASE_CREDIT_AMOUNT,
            currency: 'MYR',
            status: 'COMPLETED',
            reference_id: referenceId || `showcase_${organizationId}`,
            description: `One-time Event Showcase completion reward credit of RM${SHOWCASE_CREDIT_AMOUNT.toFixed(2)}`,
            metadata: {
              ...(metadata || {}),
              program: 'EVENT_SHOWCASE_APPROVED_REWARD',
              event_id: eventId || null,
              owner_user_id: targetOwnerId,
            },
            created_by: createdBy || null,
          },
          env
        );

        userRewardRecord.transaction_id = transaction.id;

        // Record in owner_showcase_rewards cache
        localOwnerShowcaseRewardsCache.set(targetOwnerId, {
          owner_user_id: targetOwnerId,
          organization_id: organizationId,
          event_id: eventId || '',
          showcase_id: metadata?.showcase_id || '',
          transaction_id: transaction.id,
          amount: SHOWCASE_CREDIT_AMOUNT,
          rewarded_at: now,
          created_at: now,
        });

        saveLocalStores();

        const wallet = await recalculateWalletBalances(organizationId, env);

        return {
          transaction,
          wallet,
          alreadyGranted: false,
          message: `Successfully granted RM${SHOWCASE_CREDIT_AMOUNT.toFixed(2)} Showcase Reward Credit!`,
        };
      }
    });
  });
}

/**
 * Check if an organization is eligible to use Showcase Credit for an Event.
 * 
 * Rules:
 * - Showcase Credit = RM300.00
 * - Standard Event price = RM1,400.00
 * - Paid balance required = RM1,100.00
 * - Cannot be combined with Welcome Credit or Top-up Credit.
 */
export async function canUseShowcaseCredit(
  organizationId: string,
  eventIdOrPrice?: string | number,
  eventPriceOverrideOrEnv?: number | Record<string, any>,
  envParam?: Record<string, any>
): Promise<CreditEligibilityResult> {
  if (!organizationId) {
    throw new Error('Organization ID is required');
  }

  let eventId: string | undefined = undefined;
  let eventPriceOverride: number | undefined = undefined;
  let env: Record<string, any> | undefined = envParam;

  if (typeof eventIdOrPrice === 'string') {
    eventId = eventIdOrPrice;
  } else if (typeof eventIdOrPrice === 'number') {
    eventPriceOverride = eventIdOrPrice;
  }

  if (typeof eventPriceOverrideOrEnv === 'number') {
    eventPriceOverride = eventPriceOverrideOrEnv;
  } else if (typeof eventPriceOverrideOrEnv === 'object' && eventPriceOverrideOrEnv !== null) {
    env = eventPriceOverrideOrEnv;
  }

  let eventPrice: number | undefined = undefined;
  if (eventId) {
    const { getEventById } = await import('./events.js');
    const ev = await getEventById(eventId, env);
    if (!ev) {
      const err: any = new Error('Event not found.');
      err.status = 404;
      err.code = 'EVENT_NOT_FOUND';
      throw err;
    }
    const snapPrice = Number(ev.event_price);
    const snapCurrency = typeof ev.event_currency === 'string' ? ev.event_currency.trim().toUpperCase() : '';
    if (!snapPrice || isNaN(snapPrice) || snapPrice <= 0 || !snapCurrency) {
      const err: any = new Error('Pricing configuration error: Event is missing a valid authoritative price or currency. Payment cannot proceed.');
      err.status = 503;
      err.statusCode = 503;
      err.code = 'PRICING_CONFIGURATION_ERROR';
      throw err;
    }
    eventPrice = snapPrice;
  } else if (eventPriceOverride && Number(eventPriceOverride) > 0) {
    eventPrice = Number(eventPriceOverride);
  } else {
    // If no specific event or override price is specified, default to authoritative 1-day platform base price (RM1,400.00)
    try {
      const { calculateEventAuthoritativePrice } = await import('./platformSettings.js');
      const pricing = await calculateEventAuthoritativePrice({ start_date: '2026-01-01', end_date: '2026-01-01' }, env);
      eventPrice = pricing.price;
    } catch {
      eventPrice = 1400.00;
    }
  }

  const wallet = await getWalletBalance(organizationId, env);
  const creditAvailable = wallet.showcase_credit;
  const creditAmount = Math.min(creditAvailable, SHOWCASE_CREDIT_AMOUNT);
  const paidBalanceAvailable = wallet.paid_balance;
  const paidBalanceRequired = Math.max(0, fromCents(toCents(eventPrice) - toCents(SHOWCASE_CREDIT_AMOUNT)));

  if (creditAvailable < SHOWCASE_CREDIT_AMOUNT) {
    return {
      eligible: false,
      credit_type: 'SHOWCASE_CREDIT',
      credit_available: creditAvailable,
      credit_amount: creditAmount,
      paid_balance_available: paidBalanceAvailable,
      paid_balance_required: paidBalanceRequired,
      event_price: eventPrice,
      reason: 'No Showcase Credit is available in your organization wallet.',
    };
  }

  if (paidBalanceAvailable < paidBalanceRequired) {
    return {
      eligible: false,
      credit_type: 'SHOWCASE_CREDIT',
      credit_available: creditAvailable,
      credit_amount: creditAmount,
      paid_balance_available: paidBalanceAvailable,
      paid_balance_required: paidBalanceRequired,
      event_price: eventPrice,
      reason: `Insufficient Paid Balance. Event price is RM${eventPrice.toFixed(2)}. Showcase Credit covers RM${SHOWCASE_CREDIT_AMOUNT.toFixed(2)}, requiring at least RM${paidBalanceRequired.toFixed(2)} in Paid Balance, but your current Paid Balance is RM${paidBalanceAvailable.toFixed(2)}.`,
    };
  }

  return {
    eligible: true,
    credit_type: 'SHOWCASE_CREDIT',
    credit_available: creditAvailable,
    credit_amount: creditAmount,
    paid_balance_available: paidBalanceAvailable,
    paid_balance_required: paidBalanceRequired,
    event_price: eventPrice,
  };
}

/**
 * Consume Showcase Credit (RM300.00) and Paid Balance (RM1,100.00) for an eligible Event.
 * Uses atomic payment transaction engine to guarantee ACID integrity.
 */
export async function consumeShowcaseCredit(
  params: {
    organizationId: string;
    eventId: string;
    referenceId?: string;
    createdBy?: string;
    description?: string;
    metadata?: Record<string, any>;
  },
  env?: Record<string, any>
): Promise<{
  success: boolean;
  creditTransaction: WalletTransactionRecord;
  paidTransaction: WalletTransactionRecord;
  wallet: WalletBalanceSummary;
}> {
  const { organizationId, eventId, referenceId, createdBy, description, metadata } = params;

  if (!organizationId) {
    throw new Error('Organization ID is required');
  }
  if (!eventId) {
    throw new Error('Event ID is required');
  }

  const { getEventById } = await import('./events.js');
  const ev = await getEventById(eventId, env);
  if (!ev) {
    const err: any = new Error('Event not found.');
    err.status = 404;
    err.code = 'EVENT_NOT_FOUND';
    throw err;
  }
  const snapPrice = Number(ev.event_price);
  const snapCurrency = typeof ev.event_currency === 'string' ? ev.event_currency.trim().toUpperCase() : '';
  if (!snapPrice || isNaN(snapPrice) || snapPrice <= 0 || !snapCurrency) {
    const err: any = new Error('Pricing configuration error: Event is missing a valid authoritative price or currency. Payment cannot proceed.');
    err.status = 503;
    err.statusCode = 503;
    err.code = 'PRICING_CONFIGURATION_ERROR';
    throw err;
  }
  const resolvedEventPrice = snapPrice;

  const result = await processEventPayment(
    {
      organizationId,
      eventId,
      paymentMode: 'SHOWCASE_CREDIT',
      eventPrice: resolvedEventPrice,
      referenceId,
      createdBy,
      description,
      metadata,
    },
    env
  );

  const creditTransaction = result.transactions.find(
    (t) => t.balance_type === 'SHOWCASE_CREDIT' || t.transaction_type === 'CREDIT_USAGE'
  );
  const paidTransaction = result.transactions.find(
    (t) => t.balance_type === 'PAID_BALANCE' || t.transaction_type === 'EVENT_PAYMENT'
  );

  if (!creditTransaction || !paidTransaction) {
    throw new Error('Failed to retrieve complete atomic payment transactions');
  }

  return {
    success: true,
    creditTransaction,
    paidTransaction,
    wallet: result.wallet,
  };
}

/**
 * Calculate Event payment breakdown and validate business rules for paying for an Event.
 * 
 * Rules strictly enforced:
 * 1. An Event can use ONLY ONE payment benefit type (promotional credit types cannot be mixed).
 * 2. Allowed payment modes:
 *    - 'FULL_PAID': Paid 100% via Paid Balance (RM1,400.00). No credits used.
 *    - 'WELCOME_CREDIT': Welcome Credit (RM800.00 max, no 20% limit) + Paid Balance (RM600.00 min).
 *    - 'SHOWCASE_CREDIT': Showcase Credit (RM300.00 max, no 20% limit) + Paid Balance (RM1,100.00 min).
 *    - 'TOPUP_CREDIT': Top-up Credit (max 20% of event price = RM280.00 for RM1,400) + Paid Balance (min RM1,120.00).
 * 3. Never trust frontend-submitted amounts; calculate everything server-side.
 * 4. Top-up 20% cap applies ONLY to Top-up Credit.
 */
export async function calculateEventPayment(
  eventPrice: number,
  paymentMode: PaymentMode,
  organizationId: string,
  options?: {
    topupCreditRequested?: number;
    useWelcomeCredit?: boolean;
    useEventCredit?: boolean;
    useTopupCredit?: boolean;
    welcomeCreditRequested?: number;
  },
  env?: Record<string, any>
): Promise<EventPaymentCalculation> {
  let resolvedPrice = eventPrice !== undefined && eventPrice !== null ? Number(eventPrice) : 0;
  if (!resolvedPrice || isNaN(resolvedPrice) || resolvedPrice <= 0) {
    throw new PricingConfigurationError('Pricing configuration error: Event price is missing or invalid. Authoritative price required.');
  }
  const normalizedPrice = Math.max(0, fromCents(toCents(resolvedPrice)));
  const wallet = await getWalletBalance(organizationId, env);

  let paidAmount = 0;
  let welcomeCreditUsed = 0;
  let showcaseCreditUsed = 0;
  let topupCreditUsed = 0;
  let totalDiscount = 0;
  let remainingCreditBalance = 0;
  const reasons: string[] = [];

  const allowedModes: PaymentMode[] = ['FULL_PAID', 'WELCOME_CREDIT', 'SHOWCASE_CREDIT', 'TOPUP_CREDIT', 'COMBINED_CREDIT'];
  if (!allowedModes.includes(paymentMode)) {
    reasons.push(`Invalid payment mode "${paymentMode}". Allowed modes: ${allowedModes.join(', ')}.`);
  }

  const isExplicitCombined =
    paymentMode === 'COMBINED_CREDIT' ||
    (options && (options.useWelcomeCredit !== undefined || options.useEventCredit !== undefined || options.useTopupCredit !== undefined));

  if (isExplicitCombined) {
    const useWelcome = options?.useWelcomeCredit !== undefined
      ? options.useWelcomeCredit === true
      : (paymentMode === 'WELCOME_CREDIT' || paymentMode === 'COMBINED_CREDIT');
    const useEvent = (options?.useEventCredit !== undefined || options?.useTopupCredit !== undefined)
      ? (options.useEventCredit === true || options.useTopupCredit === true)
      : (paymentMode === 'TOPUP_CREDIT' || paymentMode === 'COMBINED_CREDIT');

    if (useWelcome && wallet.welcome_credit > 0) {
      welcomeCreditUsed = Math.min(wallet.welcome_credit, normalizedPrice);
      if (options?.welcomeCreditRequested !== undefined) {
        welcomeCreditUsed = Math.min(welcomeCreditUsed, Math.max(0, options.welcomeCreditRequested));
      }
      welcomeCreditUsed = fromCents(toCents(welcomeCreditUsed));
    }

    const remainingPriceAfterWelcome = Math.max(0, fromCents(toCents(normalizedPrice) - toCents(welcomeCreditUsed)));
    const maxAllowedEventCredit = fromCents(Math.round(toCents(normalizedPrice) * MAX_TOPUP_CREDIT_PER_EVENT_PERCENT));

    if (useEvent && wallet.topup_credit > 0) {
      const requested = options?.topupCreditRequested !== undefined ? Math.max(0, options.topupCreditRequested) : maxAllowedEventCredit;
      topupCreditUsed = Math.min(wallet.topup_credit, maxAllowedEventCredit, requested, remainingPriceAfterWelcome);
      topupCreditUsed = fromCents(toCents(topupCreditUsed));
    }

    totalDiscount = fromCents(toCents(welcomeCreditUsed) + toCents(topupCreditUsed));
    paidAmount = fromCents(Math.max(0, toCents(normalizedPrice) - toCents(totalDiscount)));
    remainingCreditBalance = fromCents(
      Math.max(0, toCents(wallet.welcome_credit) - toCents(welcomeCreditUsed)) +
      Math.max(0, toCents(wallet.topup_credit) - toCents(topupCreditUsed))
    );

    if (wallet.paid_balance < paidAmount) {
      reasons.push(
        `Insufficient Paid Balance. Required: RM${paidAmount.toFixed(2)}, Available: RM${wallet.paid_balance.toFixed(2)}.`
      );
    }
  } else if (paymentMode === 'FULL_PAID') {
    paidAmount = normalizedPrice;
    welcomeCreditUsed = 0;
    showcaseCreditUsed = 0;
    topupCreditUsed = 0;
    totalDiscount = 0;
    remainingCreditBalance = 0;

    if (wallet.paid_balance < paidAmount) {
      reasons.push(
        `Insufficient Paid Balance. Required: RM${paidAmount.toFixed(2)}, Available: RM${wallet.paid_balance.toFixed(2)}.`
      );
    }
  } else if (paymentMode === 'WELCOME_CREDIT') {
    // Welcome mode: Welcome Credit up to RM800.00 (no 20% cap) + Paid Balance
    showcaseCreditUsed = 0;
    topupCreditUsed = 0;

    if (wallet.welcome_credit <= 0) {
      reasons.push('No Welcome Credit is available in your wallet.');
    } else if (wallet.welcome_credit < WELCOME_CREDIT_AMOUNT) {
      reasons.push(
        `Insufficient Welcome Credit. Required: RM${WELCOME_CREDIT_AMOUNT.toFixed(2)}, Available: RM${wallet.welcome_credit.toFixed(2)}.`
      );
    }

    welcomeCreditUsed = Math.min(wallet.welcome_credit, WELCOME_CREDIT_AMOUNT, normalizedPrice);
    totalDiscount = welcomeCreditUsed;
    paidAmount = fromCents(Math.max(0, toCents(normalizedPrice) - toCents(welcomeCreditUsed)));
    remainingCreditBalance = fromCents(Math.max(0, toCents(wallet.welcome_credit) - toCents(welcomeCreditUsed)));

    if (wallet.paid_balance < paidAmount) {
      reasons.push(
        `Insufficient Paid Balance. Required: RM${paidAmount.toFixed(2)}, Available: RM${wallet.paid_balance.toFixed(2)}.`
      );
    }
  } else if (paymentMode === 'SHOWCASE_CREDIT') {
    // Showcase mode: Showcase Credit up to RM300.00 (no 20% cap) + Paid Balance
    welcomeCreditUsed = 0;
    topupCreditUsed = 0;

    if (wallet.showcase_credit <= 0) {
      reasons.push('No Showcase Credit is available in your wallet.');
    } else if (wallet.showcase_credit < SHOWCASE_CREDIT_AMOUNT) {
      reasons.push(
        `Insufficient Showcase Credit. Required: RM${SHOWCASE_CREDIT_AMOUNT.toFixed(2)}, Available: RM${wallet.showcase_credit.toFixed(2)}.`
      );
    }

    showcaseCreditUsed = Math.min(wallet.showcase_credit, SHOWCASE_CREDIT_AMOUNT, normalizedPrice);
    totalDiscount = showcaseCreditUsed;
    paidAmount = fromCents(Math.max(0, toCents(normalizedPrice) - toCents(showcaseCreditUsed)));
    remainingCreditBalance = fromCents(Math.max(0, toCents(wallet.showcase_credit) - toCents(showcaseCreditUsed)));

    if (wallet.paid_balance < paidAmount) {
      reasons.push(
        `Insufficient Paid Balance. Required: RM${paidAmount.toFixed(2)}, Available: RM${wallet.paid_balance.toFixed(2)}.`
      );
    }
  } else if (paymentMode === 'TOPUP_CREDIT') {
    // Top-up credit mode: Max 20% of event price (RM280 for RM1400)
    welcomeCreditUsed = 0;
    showcaseCreditUsed = 0;

    const maxAllowedCredit = fromCents(Math.round(toCents(normalizedPrice) * MAX_TOPUP_CREDIT_PER_EVENT_PERCENT));

    if (wallet.topup_credit <= 0) {
      reasons.push('No Top-up Credit is available in your wallet.');
    }

    // Customer can choose amount to use, default to max eligible
    const requested = options?.topupCreditRequested !== undefined ? Math.max(0, options.topupCreditRequested) : maxAllowedCredit;
    if (options?.topupCreditRequested !== undefined && options.topupCreditRequested > maxAllowedCredit) {
      reasons.push(`Top-up Credit cannot exceed 20% of the Event price (Max RM${maxAllowedCredit.toFixed(2)}).`);
    }

    topupCreditUsed = Math.min(wallet.topup_credit, maxAllowedCredit, requested);
    topupCreditUsed = fromCents(toCents(topupCreditUsed));
    totalDiscount = topupCreditUsed;
    paidAmount = fromCents(Math.max(0, toCents(normalizedPrice) - toCents(topupCreditUsed)));
    remainingCreditBalance = fromCents(Math.max(0, toCents(wallet.topup_credit) - toCents(topupCreditUsed)));

    if (wallet.paid_balance < paidAmount) {
      reasons.push(
        `Insufficient Paid Balance. Required: RM${paidAmount.toFixed(2)}, Available: RM${wallet.paid_balance.toFixed(2)}.`
      );
    }
  }

  const remainingPaidBalance = fromCents(Math.max(0, toCents(wallet.paid_balance) - toCents(paidAmount)));
  const isPayable = reasons.length === 0 && wallet.paid_balance >= paidAmount;

  return {
    eventPrice: normalizedPrice,
    paymentMode,
    paidAmount,
    welcomeCreditUsed,
    showcaseCreditUsed,
    topupCreditUsed,
    totalDiscount,
    remainingPaidBalance,
    remainingCreditBalance,
    isPayable,
    reasons,
    availableBalances: {
      paid_balance: wallet.paid_balance,
      welcome_credit: wallet.welcome_credit,
      showcase_credit: wallet.showcase_credit,
      topup_credit: wallet.topup_credit,
    },
  };
}

/**
 * Calculate payment quote and validate business rules for paying for an Event.
 * Maintained for backward compatibility, mapped to calculateEventPayment.
 */
export async function calculateEventPaymentQuote(
  params: {
    organizationId: string;
    eventId?: string;
    creditChoice?: EventCreditOption;
    paymentMode?: PaymentMode;
    useWelcomeCredit?: boolean;
    useEventCredit?: boolean;
    useTopupCredit?: boolean;
    welcomeCreditRequested?: number;
    topupCreditRequested?: number;
    topupCreditAmountToUse?: number;
    eventPrice?: number;
  },
  env?: Record<string, any>
): Promise<EventPaymentQuote> {
  const { organizationId, eventId, creditChoice = 'NONE' } = params;
  let mode: PaymentMode = 'FULL_PAID';
  if (params.useWelcomeCredit !== undefined || params.useEventCredit !== undefined || params.useTopupCredit !== undefined) {
    const useWelcome = params.useWelcomeCredit === true;
    const useEvent = params.useEventCredit === true || params.useTopupCredit === true;
    if (useWelcome && useEvent) mode = 'COMBINED_CREDIT';
    else if (useWelcome) mode = 'WELCOME_CREDIT';
    else if (useEvent) mode = 'TOPUP_CREDIT';
    else mode = 'FULL_PAID';
  } else if (params.paymentMode) {
    mode = params.paymentMode;
  } else if (creditChoice === 'WELCOME_CREDIT') mode = 'WELCOME_CREDIT';
  else if (creditChoice === 'SHOWCASE_CREDIT') mode = 'SHOWCASE_CREDIT';
  else if (creditChoice === 'TOPUP_CREDIT') mode = 'TOPUP_CREDIT';
  else if (creditChoice === 'COMBINED_CREDIT') mode = 'COMBINED_CREDIT';
  else mode = 'FULL_PAID';

  let eventPrice: number | undefined = undefined;
  let resolvedCurrency = 'MYR';
  if (eventId) {
    const { getEventById } = await import('./events.js');
    const ev = await getEventById(eventId, env);
    if (!ev) {
      const err: any = new Error('Event not found.');
      err.status = 404;
      err.code = 'EVENT_NOT_FOUND';
      throw err;
    }
    const snapPrice = Number(ev.event_price);
    const snapCurrency = typeof ev.event_currency === 'string' ? ev.event_currency.trim().toUpperCase() : '';
    if (!snapPrice || isNaN(snapPrice) || snapPrice <= 0 || !snapCurrency) {
      throw new PricingConfigurationError('Pricing configuration error: Event is missing a valid authoritative price or currency. Payment cannot proceed.');
    }
    eventPrice = snapPrice;
    resolvedCurrency = snapCurrency;
  } else {
    if (params.eventPrice && Number(params.eventPrice) > 0) {
      eventPrice = Number(params.eventPrice);
    } else {
      throw new PricingConfigurationError('Pricing configuration error: Valid event price is required to calculate payment.');
    }
  }

  const calc = await calculateEventPayment(
    eventPrice,
    mode,
    organizationId,
    {
      topupCreditRequested: params.topupCreditRequested ?? params.topupCreditAmountToUse,
      useWelcomeCredit: params.useWelcomeCredit,
      useEventCredit: params.useEventCredit ?? params.useTopupCredit,
      welcomeCreditRequested: params.welcomeCreditRequested,
    },
    env
  );

  return {
    event_id: eventId,
    event_price: calc.eventPrice,
    standard_price: calc.eventPrice,
    currency: resolvedCurrency,
    credit_choice: creditChoice,
    credit_applied: calc.totalDiscount,
    paid_balance_required: calc.paidAmount,
    total_payable: calc.eventPrice,
    available_balances: calc.availableBalances,
    is_payable: calc.isPayable,
    reasons: calc.reasons,
  };
}

/**
 * Retrieve all ledger transactions for an organization.
 */
export async function getLedgerTransactions(
  organizationId: string,
  env?: Record<string, any>
): Promise<WalletTransactionRecord[]> {
  const isProdDb = isSupabaseConfigured(env);
  const supabase = getSupabaseServerClient(env);

  if (isProdDb) {
    const { data, error } = await supabase
      .from('wallet_transactions')
      .select('*')
      .eq('organization_id', organizationId);

    if (error) {
      console.error('Fatal: Supabase query wallet_transactions failed:', error);
      throw new Error(`Database error fetching ledger transactions: ${error.message}`);
    }

    return (data || []) as WalletTransactionRecord[];
  }

  return Array.from(localTransactionsCache.values()).filter(
    (t) => t.organization_id === organizationId
  );
}

/**
 * Process event payment securely through the immutable transaction ledger.
 */
/**
 * Process event payment atomically with full ACID database transactional guarantees.
 * When Supabase is configured: Invokes PostgreSQL Stored Procedure `process_event_payment_atomic`.
 * All ledger insertions, wallet updates, and event status changes succeed together or rollback completely.
 */
export async function processEventPayment(
  params: {
    organizationId: string;
    eventId: string;
    paymentMode?: PaymentMode;
    creditChoice?: EventCreditOption;
    useWelcomeCredit?: boolean;
    useEventCredit?: boolean;
    useTopupCredit?: boolean;
    welcomeCreditRequested?: number;
    eventPrice?: number;
    topupCreditRequested?: number;
    topupCreditAmountToUse?: number;
    referenceId?: string;
    createdBy?: string;
    eventName?: string;
    description?: string;
    metadata?: Record<string, any>;
    now?: Date;
  },
  env?: Record<string, any>
): Promise<{
  success: boolean;
  paymentCalculation: EventPaymentCalculation;
  quote: EventPaymentQuote;
  transactions: WalletTransactionRecord[];
  wallet: WalletBalanceSummary;
}> {
  const { organizationId, eventId, referenceId, createdBy } = params;

  // Resolve paymentMode from explicit credit options, paymentMode, or legacy creditChoice
  let mode: PaymentMode = 'FULL_PAID';
  if (params.useWelcomeCredit !== undefined || params.useEventCredit !== undefined || params.useTopupCredit !== undefined) {
    const useWelcome = params.useWelcomeCredit === true;
    const useEvent = params.useEventCredit === true || params.useTopupCredit === true;
    if (useWelcome && useEvent) {
      mode = 'COMBINED_CREDIT';
    } else if (useWelcome) {
      mode = 'WELCOME_CREDIT';
    } else if (useEvent) {
      mode = 'TOPUP_CREDIT';
    } else {
      mode = 'FULL_PAID';
    }
  } else if (params.paymentMode) {
    mode = params.paymentMode;
  } else if (params.creditChoice === 'WELCOME_CREDIT') {
    mode = 'WELCOME_CREDIT';
  } else if (params.creditChoice === 'SHOWCASE_CREDIT') {
    mode = 'SHOWCASE_CREDIT';
  } else if (params.creditChoice === 'TOPUP_CREDIT') {
    mode = 'TOPUP_CREDIT';
  } else if (params.creditChoice === 'COMBINED_CREDIT') {
    mode = 'COMBINED_CREDIT';
  } else {
    mode = 'FULL_PAID';
  }

  let eventPrice: number | undefined = undefined;
  let resolvedEventName = params.eventName;
  if (eventId) {
    try {
      const { getEventById } = await import('./events.js');
      const ev = await getEventById(eventId, env);
      if (!ev) {
        const err: any = new Error('Event not found.');
        err.status = 404;
        err.code = 'EVENT_NOT_FOUND';
        throw err;
      }
      const snapPrice = Number(ev.event_price);
      const snapCurrency = typeof ev.event_currency === 'string' ? ev.event_currency.trim().toUpperCase() : '';
      if (!snapPrice || isNaN(snapPrice) || snapPrice <= 0 || !snapCurrency) {
        throw new PricingConfigurationError('Pricing configuration error: Event is missing a valid authoritative price or currency. Payment cannot proceed.');
      }
      eventPrice = snapPrice;
      if (!resolvedEventName) {
        resolvedEventName = ev.name;
      }
    } catch (e: any) {
      if (e?.status && e?.code) throw e;
      throw e;
    }
  } else {
    if (params.eventPrice && Number(params.eventPrice) > 0) {
      eventPrice = Number(params.eventPrice);
    } else {
      throw new PricingConfigurationError('Pricing configuration error: Valid event price is required to execute payment.');
    }
  }
  const topupCreditRequested = params.topupCreditRequested ?? params.topupCreditAmountToUse;

  // Pre-calculate payment calculation and quote before balances are modified
  const prePaymentCalculation = await calculateEventPayment(
    eventPrice,
    mode,
    organizationId,
    {
      topupCreditRequested,
      useWelcomeCredit: params.useWelcomeCredit,
      useEventCredit: params.useEventCredit ?? params.useTopupCredit,
      welcomeCreditRequested: params.welcomeCreditRequested,
    },
    env
  );
  const quote = await calculateEventPaymentQuote({ organizationId, eventId, creditChoice: mode }, env);

  // PRODUCTION MODE: Atomic PostgreSQL RPC Transaction Block
  if (isSupabaseConfigured(env)) {
    // Check if event is already marked as PAID for idempotent replay
    if (eventId) {
      try {
        const { getEventById } = await import('./events.js');
        const ev = await getEventById(eventId, env);
        if (ev && (ev.payment_status === 'PAID' || (ev as any).event_status === 'LIVE')) {
          const currentWallet = await getWalletBalance(organizationId, env);
          const { transactions: orgTxns } = await getWalletTransactions(organizationId, undefined, env);
          const existingTxns = orgTxns.filter((t) => t.event_id === eventId || (referenceId && t.reference_id === referenceId));
          if (existingTxns.length > 0) {
            return {
              success: true,
              transactions: existingTxns,
              wallet: currentWallet,
              paymentCalculation: prePaymentCalculation,
              quote,
            };
          }
        }
      } catch (e) {
        // Proceed to atomic transaction
      }
    }

    const supabase = getSupabaseServerClient(env);
    const { data, error } = await supabase.rpc('process_event_payment_atomic', {
      p_organization_id: organizationId,
      p_event_id: eventId,
      p_payment_mode: mode,
      p_event_price: eventPrice,
      p_topup_credit_requested: topupCreditRequested || 0,
      p_reference_id: referenceId || null,
      p_created_by: createdBy || null,
      p_description: params.description || null,
      p_metadata: params.metadata || {},
    });

    if (error) {
      if (error.message && error.message.includes('Event is already marked as PAID')) {
        const currentWallet = await getWalletBalance(organizationId, env);
        const { transactions: orgTxns } = await getWalletTransactions(organizationId, undefined, env);
        const existingTxns = orgTxns.filter((t) => t.event_id === eventId || (referenceId && t.reference_id === referenceId));
        if (existingTxns.length > 0) {
          return {
            success: true,
            transactions: existingTxns,
            wallet: currentWallet,
            paymentCalculation: prePaymentCalculation,
            quote,
          };
        }
      }
      console.error('Fatal: Supabase atomic payment transaction failed:', error);
      await dispatchEventPaymentFailed(
        {
          organizationId,
          recipientUserId: createdBy || null,
          eventId,
          eventName: resolvedEventName || `Event #${eventId.slice(0, 8)}`,
          amount: eventPrice,
          currency: 'MYR',
          reason: `Financial ledger transaction failed: ${error.message}`,
        },
        env
      ).catch((notifErr) => console.error('[NOTIFICATION] Failed to dispatch EVENT_PAYMENT_FAILED on fatal error:', notifErr));

      if (error.message && error.message.toLowerCase().includes('insufficient')) {
        const match = error.message.match(/available:\s*([0-9.]+),\s*required:\s*([0-9.]+)/i);
        const available = match ? parseFloat(match[1]) : undefined;
        const required = match ? parseFloat(match[2]) : undefined;
        const shortfall = (required !== undefined && available !== undefined) ? Math.max(0, required - available) : undefined;
        const cleanMsg = error.message.replace(/^.*INSUFFICIENT_BALANCE:\s*/i, '').trim() || 'Insufficient balance to complete event payment';
        const insufficientErr = new AppError(
          cleanMsg,
          402,
          'INSUFFICIENT_BALANCE',
          { isOperational: true, metadata: { available, required, shortfall } }
        );
        (insufficientErr as any).available = available;
        (insufficientErr as any).required = required;
        (insufficientErr as any).shortfall = shortfall;
        throw insufficientErr;
      }

      if (error.message && error.message.includes('PRICING_CONFIGURATION_ERROR')) {
        throw new PricingConfigurationError(error.message.replace(/^.*PRICING_CONFIGURATION_ERROR:\s*/, '').trim());
      }

      if (error.message && error.message.toLowerCase().includes('does not belong to your organization')) {
        throw new AppError('Security Error: Event does not belong to your organization', 403, 'FORBIDDEN', { isOperational: true });
      }

      throw new Error(`Financial ledger transaction failed: ${error.message}`);
    }

    if (!data) {
      await dispatchEventPaymentFailed(
        {
          organizationId,
          recipientUserId: createdBy || null,
          eventId,
          eventName: resolvedEventName || `Event #${eventId.slice(0, 8)}`,
          amount: eventPrice,
          currency: 'MYR',
          reason: 'No response received from atomic payment procedure',
        },
        env
      ).catch((notifErr) => console.error('[NOTIFICATION] Failed to dispatch EVENT_PAYMENT_FAILED on empty data:', notifErr));

      throw new Error('Financial ledger transaction failed: No data returned from atomic payment procedure');
    }

    const payload = data as any;
    if (payload.success === false) {
      const isInsufficient = payload.code === 'INSUFFICIENT_BALANCE' || (payload.message && payload.message.toLowerCase().includes('insufficient'));
      if (isInsufficient) {
        await dispatchNotificationEvent(
          {
            eventType: 'INSUFFICIENT_BALANCE',
            organizationId,
            recipientUserId: createdBy || null,
            currentBalance: payload.available ?? 0,
            requiredAmount: payload.required ?? eventPrice,
            currency: 'MYR',
            eventId,
            eventName: resolvedEventName,
          },
          env
        ).catch((err) => console.error('[NOTIFICATION] Failed to dispatch INSUFFICIENT_BALANCE:', err));

        const cleanMsg = payload.message || payload.error || 'Insufficient balance to complete event payment';
        const insufficientErr = new AppError(
          cleanMsg,
          402,
          'INSUFFICIENT_BALANCE',
          { isOperational: true, metadata: { available: payload.available, required: payload.required, shortfall: payload.shortfall } }
        );
        (insufficientErr as any).available = payload.available;
        (insufficientErr as any).required = payload.required;
        (insufficientErr as any).shortfall = payload.shortfall;
        throw insufficientErr;
      }

      await dispatchEventPaymentFailed(
        {
          organizationId,
          recipientUserId: createdBy || null,
          eventId,
          eventName: resolvedEventName || `Event #${eventId.slice(0, 8)}`,
          amount: eventPrice,
          currency: 'MYR',
          reason: payload.message || payload.error || 'Payment failed',
        },
        env
      ).catch((err) => console.error('[NOTIFICATION] Failed to dispatch EVENT_PAYMENT_FAILED:', err));

      const err: any = new Error(payload.error || payload.message || 'Atomic payment transaction rejected by database');
      if (payload.code) err.code = payload.code;
      throw err;
    }

    const transactions: WalletTransactionRecord[] = [];
    if (payload.credit_transaction) {
      transactions.push(payload.credit_transaction as WalletTransactionRecord);
    }
    if (payload.topup_credit_transaction) {
      transactions.push(payload.topup_credit_transaction as WalletTransactionRecord);
    }
    if (payload.paid_transaction) {
      transactions.push(payload.paid_transaction as WalletTransactionRecord);
    }

    const calculation = prePaymentCalculation;

    const paidBal = Number(payload.wallet?.paid_balance ?? 0);
    const welcomeBal = Number(payload.wallet?.welcome_credit ?? 0);
    const showcaseBal = Number(payload.wallet?.showcase_credit ?? 0);
    const topupBal = Number(payload.wallet?.topup_credit ?? 0);

    const outstandingBal = await getOutstandingBalance(organizationId, env);

    const walletResult: WalletBalanceSummary = {
      organization_id: organizationId,
      paid_balance: paidBal,
      welcome_credit: welcomeBal,
      showcase_credit: showcaseBal,
      topup_credit: topupBal,
      outstanding_balance: outstandingBal,
      total_balance: paidBal + welcomeBal + showcaseBal + topupBal,
      total_credit: welcomeBal + showcaseBal + topupBal,
      currency: 'MYR',
      welcome_credit_granted: true,
      showcase_credit_granted: true,
      can_use_welcome_credit: welcomeBal > 0,
      can_use_showcase_credit: showcaseBal > 0,
      updated_at: new Date().toISOString(),
    };

    try {
      const { localEventsCache, getEventById, deriveEventLifecycleStatus } = await import('./events.js');
      let cachedEvent = localEventsCache.get(eventId);
      if (!cachedEvent) {
        cachedEvent = (await getEventById(eventId, env)) || undefined;
      }
      if (cachedEvent) {
        const nextEventStatus = deriveEventLifecycleStatus({ ...cachedEvent, payment_status: 'PAID', cancel_reason: null }, params.now);
        const nextStatus = nextEventStatus === 'LIVE' ? 'live' : (nextEventStatus === 'COMPLETED' ? 'completed' : 'scheduled');
        cachedEvent.status = nextStatus;
        cachedEvent.event_status = nextEventStatus;
        cachedEvent.payment_status = 'PAID';
        cachedEvent.cancel_reason = null;
        cachedEvent.payment_mode = mode;
        cachedEvent.paid_amount = calculation.paidAmount;
        cachedEvent.discount_amount = calculation.totalDiscount;
        localEventsCache.set(eventId, cachedEvent);
      }
    } catch (cacheErr) {
      // ignore
    }

    return {
      success: true,
      paymentCalculation: calculation,
      quote,
      transactions,
      wallet: walletResult,
    };
  }

  // NON-PRODUCTION / LOCAL DEV MODE: In-memory atomic snapshot with automatic rollback
  assertProductionSafe('processEventPayment', env);
  const txnsSnapshot = new Map(localTransactionsCache);
  const walletsSnapshot = new Map(localWalletsCache);

  try {
    // 1. Idempotency & Replay Protection: Check if payment already completed for this event
    const existingTransactions = await getLedgerTransactions(organizationId, env);
    const existingPaymentTxn = existingTransactions.find(
      (t) =>
        t.event_id === eventId &&
        t.transaction_type === 'EVENT_PAYMENT' &&
        t.balance_type === 'PAID_BALANCE' &&
        t.status === 'COMPLETED'
    );

    if (existingPaymentTxn) {
      const pairedCreditTxn = existingTransactions.find(
        (t) =>
          t.event_id === eventId &&
          t.transaction_type === 'CREDIT_USAGE' &&
          t.status === 'COMPLETED'
      );
      const existingTxns = [existingPaymentTxn];
      if (pairedCreditTxn) existingTxns.unshift(pairedCreditTxn);
      const currentWallet = await getWalletBalance(organizationId, env);
      const calculation = await calculateEventPayment(
        eventPrice,
        mode,
        organizationId,
        {
          topupCreditRequested,
          useWelcomeCredit: params.useWelcomeCredit,
          useEventCredit: params.useEventCredit ?? params.useTopupCredit,
          welcomeCreditRequested: params.welcomeCreditRequested,
        },
        env
      );
      const quote = await calculateEventPaymentQuote({ organizationId, eventId, creditChoice: mode }, env);

      return {
        success: true,
        paymentCalculation: calculation,
        quote,
        transactions: existingTxns,
        wallet: currentWallet,
      };
    }

    // 2. Perform rigorous server-side payment calculation and validation
    const calculation = await calculateEventPayment(
      eventPrice,
      mode,
      organizationId,
      {
        topupCreditRequested,
        useWelcomeCredit: params.useWelcomeCredit,
        useEventCredit: params.useEventCredit ?? params.useTopupCredit,
        welcomeCreditRequested: params.welcomeCreditRequested,
      },
      env
    );

    if (!calculation.isPayable) {
      if (calculation.reasons.some((r) => r.toLowerCase().includes('insufficient'))) {
        await dispatchNotificationEvent(
          {
            eventType: 'INSUFFICIENT_BALANCE',
            organizationId,
            recipientUserId: createdBy || null,
            currentBalance: calculation.availableBalances.paid_balance,
            requiredAmount: calculation.paidAmount,
            currency: 'MYR',
            eventId,
            eventName: resolvedEventName,
            metadata: {
              reasons: calculation.reasons,
            },
          },
          env
        ).catch((err) => console.error('[NOTIFICATION] Failed to dispatch INSUFFICIENT_BALANCE:', err));
      }

      await dispatchEventPaymentFailed(
        {
          organizationId,
          recipientUserId: createdBy || null,
          eventId,
          eventName: resolvedEventName || `Event #${eventId.slice(0, 8)}`,
          amount: eventPrice,
          currency: 'MYR',
          reason: calculation.reasons.join('; ') || 'Payment cannot be processed',
          metadata: {
            payment_mode: mode,
            reasons: calculation.reasons,
          },
        },
        env
      ).catch((err) => console.error('[NOTIFICATION] Failed to dispatch EVENT_PAYMENT_FAILED:', err));

      throw new Error(`Event payment cannot be processed: ${calculation.reasons.join(' ')}`);
    }

    const transactions: WalletTransactionRecord[] = [];
    const eventLabel = params.eventName ? `"${params.eventName}"` : `Event #${eventId.slice(0, 8)}`;

    // 3. Record individual CREDIT_USAGE transactions in immutable ledger
    if (calculation.welcomeCreditUsed > 0) {
      const welcomeTxnRef = referenceId ? `${referenceId}_welcome_credit` : (mode === 'WELCOME_CREDIT' && referenceId ? `${referenceId}_credit` : `event_${eventId}_welcome_credit`);
      const welcomeTxn = await appendLedgerTransaction(
        {
          organization_id: organizationId,
          event_id: eventId,
          transaction_type: 'CREDIT_USAGE',
          balance_type: 'WELCOME_CREDIT',
          amount: -calculation.welcomeCreditUsed, // negative debit
          currency: 'MYR',
          status: 'COMPLETED',
          reference_id: welcomeTxnRef,
          description: `Applied RM${calculation.welcomeCreditUsed.toFixed(2)} Welcome Credit for ${eventLabel}`,
          metadata: {
            ...(params.metadata || {}),
            event_id: eventId,
            payment_mode: mode,
            credit_type: 'WELCOME_CREDIT',
            event_price: calculation.eventPrice,
            credit_discount: calculation.welcomeCreditUsed,
          },
          created_by: createdBy || null,
        },
        env
      );
      transactions.push(welcomeTxn);
    }

    if (calculation.topupCreditUsed > 0) {
      const topupTxnRef = referenceId ? `${referenceId}_topup_credit` : (mode === 'TOPUP_CREDIT' && referenceId ? `${referenceId}_credit` : `event_${eventId}_topup_credit`);
      const topupTxn = await appendLedgerTransaction(
        {
          organization_id: organizationId,
          event_id: eventId,
          transaction_type: 'CREDIT_USAGE',
          balance_type: 'TOPUP_CREDIT',
          amount: -calculation.topupCreditUsed, // negative debit
          currency: 'MYR',
          status: 'COMPLETED',
          reference_id: topupTxnRef,
          description: `Applied RM${calculation.topupCreditUsed.toFixed(2)} Event Credit for ${eventLabel}`,
          metadata: {
            ...(params.metadata || {}),
            event_id: eventId,
            payment_mode: mode,
            credit_type: 'TOPUP_CREDIT',
            event_price: calculation.eventPrice,
            credit_discount: calculation.topupCreditUsed,
          },
          created_by: createdBy || null,
        },
        env
      );
      transactions.push(topupTxn);
    }

    if (calculation.showcaseCreditUsed > 0) {
      const showcaseTxnRef = referenceId ? `${referenceId}_showcase_credit` : (mode === 'SHOWCASE_CREDIT' && referenceId ? `${referenceId}_credit` : `event_${eventId}_showcase_credit`);
      const showcaseTxn = await appendLedgerTransaction(
        {
          organization_id: organizationId,
          event_id: eventId,
          transaction_type: 'CREDIT_USAGE',
          balance_type: 'SHOWCASE_CREDIT',
          amount: -calculation.showcaseCreditUsed, // negative debit
          currency: 'MYR',
          status: 'COMPLETED',
          reference_id: showcaseTxnRef,
          description: `Applied RM${calculation.showcaseCreditUsed.toFixed(2)} Showcase Credit for ${eventLabel}`,
          metadata: {
            ...(params.metadata || {}),
            event_id: eventId,
            payment_mode: mode,
            credit_type: 'SHOWCASE_CREDIT',
            event_price: calculation.eventPrice,
            credit_discount: calculation.showcaseCreditUsed,
          },
          created_by: createdBy || null,
        },
        env
      );
      transactions.push(showcaseTxn);
    }

    // 4. Record EVENT_PAYMENT from PAID_BALANCE in immutable ledger
    if (calculation.paidAmount > 0) {
      const paidTxnRef = referenceId ? `${referenceId}_paid` : `event_${eventId}_paid`;
      const paymentTxn = await appendLedgerTransaction(
        {
          organization_id: organizationId,
          event_id: eventId,
          transaction_type: 'EVENT_PAYMENT',
          balance_type: 'PAID_BALANCE',
          amount: -calculation.paidAmount, // negative debit
          currency: 'MYR',
          status: 'COMPLETED',
          reference_id: paidTxnRef,
          description: `Paid RM${calculation.paidAmount.toFixed(2)} from Paid Balance for ${eventLabel}`,
          metadata: {
            ...(params.metadata || {}),
            event_id: eventId,
            payment_mode: mode,
            paid_amount: calculation.paidAmount,
            credit_applied: calculation.totalDiscount,
            total_event_cost: calculation.eventPrice,
          },
          created_by: createdBy || null,
        },
        env
      );
      transactions.push(paymentTxn);
    }

    // 5. Recalculate wallet balances
    const wallet = await recalculateWalletBalances(organizationId, env);

    // 6. Update Event record payment status if event exists in DB
    let targetLifecycle: import('./types.js').EventLifecycleStatus = 'SCHEDULED';
    let targetStatus: import('./types.js').EventStatus = 'scheduled';

    try {
      const { localEventsCache, getEventById, deriveEventLifecycleStatus } = await import('./events.js');
      let targetEv = localEventsCache.get(eventId);
      if (!targetEv) {
        targetEv = (await getEventById(eventId, env)) || undefined;
      }
      if (targetEv) {
        targetLifecycle = deriveEventLifecycleStatus({ ...targetEv, payment_status: 'PAID', cancel_reason: null }, params.now);
        targetStatus = targetLifecycle === 'LIVE' ? 'live' : (targetLifecycle === 'COMPLETED' ? 'completed' : 'scheduled');
        targetEv.status = targetStatus;
        targetEv.event_status = targetLifecycle;
        targetEv.payment_status = 'PAID';
        targetEv.cancel_reason = null;
        targetEv.payment_mode = mode;
        targetEv.paid_amount = calculation.paidAmount;
        targetEv.discount_amount = calculation.totalDiscount;
        localEventsCache.set(eventId, targetEv);
      }
    } catch (cacheErr) {
      // ignore
    }

    try {
      const supabase = getSupabaseServerClient(env);
      const { error: eventUpdateError } = await supabase
        .from('events')
        .update({
          status: targetStatus,
          event_status: targetLifecycle,
          payment_status: 'PAID',
          cancel_reason: null,
          payment_mode: mode,
          paid_amount: calculation.paidAmount,
          discount_amount: calculation.totalDiscount,
          updated_at: new Date().toISOString(),
        })
        .eq('id', eventId);

      if (eventUpdateError) {
        if (!isLocalFallbackAllowed(env) || (!eventUpdateError.message?.includes('Placeholder') && eventUpdateError.code !== 'PGRST000')) {
          console.error('[processEventPayment] Fatal: Database update failure on events table:', eventUpdateError);
          throw new Error(`Database error updating event payment status: ${eventUpdateError.message}`);
        } else {
          console.warn('[processEventPayment] Notice updating event table in local mock fallback:', eventUpdateError.message);
        }
      }
    } catch (dbErr: any) {
      if (dbErr?.message && dbErr.message.includes('Database error updating event payment status')) {
        throw dbErr;
      }
      if (!isLocalFallbackAllowed(env)) {
        throw dbErr;
      }
      console.warn('Notice updating event table:', dbErr?.message || dbErr);
    }

    const quote = await calculateEventPaymentQuote({ organizationId, eventId, creditChoice: mode }, env);

    await dispatchNotificationEvent(
      {
        eventType: 'PAYMENT_SUCCESS',
        organizationId,
        recipientUserId: createdBy || undefined,
        referenceId: referenceId || `event_pay_${eventId}`,
        amount: calculation.eventPrice,
        currency: 'MYR',
        subject: eventLabel || `Event Activation (${eventId.slice(0, 8)})`,
        eventId,
        paymentType: 'EVENT_PAYMENT',
        metadata: {
          event_id: eventId,
          paid_amount: calculation.paidAmount,
          discount_amount: calculation.totalDiscount,
          payment_mode: mode,
        },
      },
      env
    ).catch((err) => console.error('[NOTIFICATION] Failed to dispatch PAYMENT_SUCCESS for event:', err));

    if (wallet.paid_balance < 500) {
      await dispatchNotificationEvent(
        {
          eventType: 'WALLET_LOW_BALANCE',
          organizationId,
          currentBalance: `RM${wallet.paid_balance.toFixed(2)}`,
          currency: 'MYR',
          threshold: 'RM500.00',
        },
        env
      ).catch((err) => console.error('[NOTIFICATION] Failed to dispatch WALLET_LOW_BALANCE:', err));
    }

    return {
      success: true,
      paymentCalculation: calculation,
      quote,
      transactions,
      wallet,
    };
  } catch (err) {
    // Atomic Rollback for local cache on any partial failure
    localTransactionsCache.clear();
    for (const [k, v] of txnsSnapshot.entries()) {
      localTransactionsCache.set(k, v);
    }
    localWalletsCache.clear();
    for (const [k, v] of walletsSnapshot.entries()) {
      localWalletsCache.set(k, v);
    }
    saveLocalStores();
    throw err;
  }
}

/**
 * Retrieve transaction history ledger for an organization.
 */
export async function getWalletTransactions(
  organizationId: string,
  options?: {
    limit?: number;
    offset?: number;
    balanceType?: WalletBalanceType;
    transactionType?: WalletTransactionType;
    filterGroup?: 'ALL' | 'TOPUP' | 'EVENT_USAGE' | 'CREDITS' | 'REFUNDS' | string;
    startDate?: string;
    endDate?: string;
    search?: string;
  },
  env?: Record<string, any>
): Promise<{
  transactions: WalletTransactionRecord[];
  total: number;
}> {
  if (!organizationId) {
    return { transactions: [], total: 0 };
  }

  const limit = options?.limit || 50;
  const offset = options?.offset || 0;
  const filterGroup = (options?.filterGroup || 'ALL').toUpperCase();

  const isProdDb = isSupabaseConfigured(env);
  const supabase = getSupabaseServerClient(env);

  if (isProdDb) {
    let query = supabase
      .from('wallet_transactions')
      .select('*', { count: 'exact' })
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false });

    if (options?.balanceType) {
      query = query.eq('balance_type', options.balanceType);
    }
    if (options?.transactionType) {
      query = query.eq('transaction_type', options.transactionType);
    }

    if (filterGroup === 'TOPUP' || filterGroup === 'TOPUPS') {
      query = query.eq('transaction_type', 'TOPUP');
    } else if (filterGroup === 'EVENT_USAGE' || filterGroup === 'EVENT_PAYMENT' || filterGroup === 'EVENTS') {
      query = query.in('transaction_type', ['EVENT_PAYMENT', 'CREDIT_USAGE']);
    } else if (filterGroup === 'CREDITS' || filterGroup === 'CREDIT') {
      query = query.in('transaction_type', ['TOPUP_CREDIT', 'WELCOME_CREDIT', 'SHOWCASE_CREDIT']);
    } else if (filterGroup === 'REFUNDS' || filterGroup === 'REFUND') {
      query = query.in('transaction_type', ['REFUND', 'CREDIT_REVERSAL']);
    }

    if (options?.startDate) {
      query = query.gte('created_at', options.startDate);
    }
    if (options?.endDate) {
      query = query.lte('created_at', options.endDate);
    }

    if (options?.search && options.search.trim()) {
      const s = `%${options.search.trim()}%`;
      query = query.or(`description.ilike.${s},reference_id.ilike.${s}`);
    }

    const { data, count, error } = await query.range(offset, offset + limit - 1);

    if (error) {
      console.error('Fatal: Supabase query wallet_transactions failed:', error);
      throw new Error(`Database error querying wallet transactions: ${error.message}`);
    }

    return {
      transactions: (data || []) as WalletTransactionRecord[],
      total: count !== null && count !== undefined ? count : (data?.length || 0),
    };
  }

  // Fallback to local memory / file in dev/test only
  let all = Array.from(localTransactionsCache.values()).filter(
    (t) => t.organization_id === organizationId
  );

  if (options?.balanceType) {
    all = all.filter((t) => t.balance_type === options.balanceType);
  }
  if (options?.transactionType) {
    all = all.filter((t) => t.transaction_type === options.transactionType);
  }

  if (filterGroup === 'TOPUP' || filterGroup === 'TOPUPS') {
    all = all.filter((t) => t.transaction_type === 'TOPUP');
  } else if (filterGroup === 'EVENT_USAGE' || filterGroup === 'EVENT_PAYMENT' || filterGroup === 'EVENTS') {
    all = all.filter((t) => t.transaction_type === 'EVENT_PAYMENT' || t.transaction_type === 'CREDIT_USAGE');
  } else if (filterGroup === 'CREDITS' || filterGroup === 'CREDIT') {
    all = all.filter((t) => ['TOPUP_CREDIT', 'WELCOME_CREDIT', 'SHOWCASE_CREDIT'].includes(t.transaction_type));
  } else if (filterGroup === 'REFUNDS' || filterGroup === 'REFUND') {
    all = all.filter((t) => ['REFUND', 'CREDIT_REVERSAL'].includes(t.transaction_type));
  }

  if (options?.startDate) {
    const startMs = new Date(options.startDate).getTime();
    if (!isNaN(startMs)) {
      all = all.filter((t) => new Date(t.created_at).getTime() >= startMs);
    }
  }
  if (options?.endDate) {
    const endMs = new Date(options.endDate).getTime();
    if (!isNaN(endMs)) {
      all = all.filter((t) => new Date(t.created_at).getTime() <= endMs);
    }
  }

  if (options?.search && options.search.trim()) {
    const query = options.search.trim().toLowerCase();
    all = all.filter((t) => {
      return (
        (t.description && t.description.toLowerCase().includes(query)) ||
        (t.reference_id && t.reference_id.toLowerCase().includes(query)) ||
        (t.id && t.id.toLowerCase().includes(query)) ||
        (t.metadata?.payment_reference && String(t.metadata.payment_reference).toLowerCase().includes(query)) ||
        (t.metadata?.topup_order_id && String(t.metadata.topup_order_id).toLowerCase().includes(query)) ||
        (t.transaction_type && t.transaction_type.toLowerCase().includes(query)) ||
        (t.balance_type && t.balance_type.toLowerCase().includes(query))
      );
    });
  }

  all.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const paged = all.slice(offset, offset + limit);

  return {
    transactions: paged,
    total: all.length,
  };
}

/**
 * Financial Reversal / Refund:
 * Creates an offsetting immutable transaction in the ledger rather than deleting records.
 */
export async function reverseTransaction(
  params: {
    transactionId: string;
    reason: string;
    createdBy?: string;
  },
  env?: Record<string, any>
): Promise<{
  reversalTransaction: WalletTransactionRecord;
  wallet: WalletBalanceSummary;
}> {
  const { transactionId, reason, createdBy } = params;

  // Find target transaction
  let target = localTransactionsCache.get(transactionId);
  if (!target) {
    const supabase = getSupabaseServerClient(env);
    const { data } = await supabase
      .from('wallet_transactions')
      .select('*')
      .eq('id', transactionId)
      .maybeSingle();
    if (data) {
      target = data as WalletTransactionRecord;
    }
  }

  if (!target) {
    throw new Error(`Transaction ${transactionId} not found`);
  }

  const oppositeAmount = -Number(target.amount);
  const reversalType: WalletTransactionType =
    target.balance_type === 'PAID_BALANCE' ? 'REFUND' : 'CREDIT_REVERSAL';

  const reversalTransaction = await appendLedgerTransaction(
    {
      organization_id: target.organization_id,
      event_id: target.event_id,
      transaction_type: reversalType,
      balance_type: target.balance_type,
      amount: oppositeAmount,
      currency: target.currency,
      status: 'COMPLETED',
      reference_id: `reversal_${target.id}`,
      description: `Reversal of transaction #${target.id.slice(0, 8)}: ${reason}`,
      metadata: {
        original_transaction_id: target.id,
        reason,
      },
      created_by: createdBy || null,
    },
    env
  );

  const wallet = await recalculateWalletBalances(target.organization_id, env);

  // Record audit trail event for REFUND_PROCESSED
  await recordWalletAuditEvent(
    {
      organizationId: target.organization_id,
      eventType: 'REFUND_PROCESSED',
      orderId: null,
      paymentReference: `reversal_${target.id}`,
      amount: Math.abs(oppositeAmount),
      currency: target.currency,
      actorId: createdBy || null,
      metadata: {
        original_transaction_id: target.id,
        reason,
        reversal_type: reversalType,
      },
    },
    env
  );

  return {
    reversalTransaction,
    wallet,
  };
}

/**
 * Atomically refund and reverse payment for a cancelled event.
 * Reverses both the PAID_BALANCE deduction (via REFUND) and promotional credit deductions (via CREDIT_REVERSAL).
 */
export async function refundEventPayment(
  params: {
    organizationId: string;
    eventId: string;
    eventName?: string;
    paidAmount?: number;
    discountAmount?: number;
    paymentMode?: PaymentMode;
    reason?: string;
    createdBy?: string;
    now?: Date | string;
  },
  env?: Record<string, any>
): Promise<{
  success: boolean;
  transactions: WalletTransactionRecord[];
  wallet: WalletBalanceSummary;
}> {
  const { organizationId, eventId, eventName, reason = 'Event cancelled before Setup Day', createdBy, now: evalNow } = params;

  return await withOrganizationLock(organizationId, async () => {
    // Verify server-side refund eligibility based on Setup Day
  if (eventId) {
    try {
      const { getEventById, determineEventRefund } = await import('./events.js');
      const ev = await getEventById(eventId, env);
      if (ev) {
        const refundDetermination = determineEventRefund(ev, evalNow ? new Date(evalNow) : undefined);
        if (!refundDetermination.canRefund) {
          const err: any = new Error(`Refund rejected: ${refundDetermination.reason}`);
          err.code = 'REFUND_NOT_ALLOWED';
          err.status = 422;
          throw err;
        }
      }
    } catch (err: any) {
      if (err.code === 'REFUND_NOT_ALLOWED') {
        throw err;
      }
    }
  }

  // 1. Check existing transactions for idempotency
  const existingTransactions = await getLedgerTransactions(organizationId, env);
  const existingRefunds = existingTransactions.filter(
    (t) => t.event_id === eventId && (t.transaction_type === 'REFUND' || t.transaction_type === 'CREDIT_REVERSAL')
  );

  if (existingRefunds.length > 0) {
    const currentWallet = await getWalletBalance(organizationId, env);
    return {
      success: true,
      transactions: existingRefunds,
      wallet: currentWallet,
    };
  }

  // 2. Identify original payment transactions or provided amounts
  let paidToRefund = params.paidAmount ?? 0;
  let discountToReverse = params.discountAmount ?? 0;
  let mode = params.paymentMode ?? 'FULL_PAID';

  if (paidToRefund === 0 && discountToReverse === 0) {
    const origPaymentTxns = existingTransactions.filter((t) => t.event_id === eventId && t.status === 'COMPLETED');
    for (const t of origPaymentTxns) {
      if (t.transaction_type === 'EVENT_PAYMENT' && t.balance_type === 'PAID_BALANCE') {
        paidToRefund += Math.abs(Number(t.amount || 0));
      } else if (t.transaction_type === 'CREDIT_USAGE') {
        discountToReverse += Math.abs(Number(t.amount || 0));
        if (t.balance_type === 'WELCOME_CREDIT') mode = 'WELCOME_CREDIT';
        else if (t.balance_type === 'SHOWCASE_CREDIT') mode = 'SHOWCASE_CREDIT';
        else if (t.balance_type === 'TOPUP_CREDIT') mode = 'TOPUP_CREDIT';
      }
    }
  }

  const transactions: WalletTransactionRecord[] = [];
  const eventLabel = eventName ? `"${eventName}"` : `Event #${eventId.slice(0, 8)}`;

  // 3. Process PAID_BALANCE refund
  if (paidToRefund > 0) {
    const paidRefundTxn = await appendLedgerTransaction(
      {
        organization_id: organizationId,
        event_id: eventId,
        transaction_type: 'REFUND',
        balance_type: 'PAID_BALANCE',
        amount: paidToRefund, // positive credit
        currency: 'MYR',
        status: 'COMPLETED',
        reference_id: `refund_event_${eventId}_paid`,
        description: `Refunded RM${paidToRefund.toFixed(2)} to Paid Balance for cancelled ${eventLabel}`,
        metadata: {
          event_id: eventId,
          reason,
          refunded_paid_amount: paidToRefund,
        },
        created_by: createdBy || null,
      },
      env
    );
    transactions.push(paidRefundTxn);
  }

  // 4. Process Promotional Credit reversal
  if (discountToReverse > 0 && mode !== 'FULL_PAID') {
    let creditBalanceType: WalletBalanceType = 'TOPUP_CREDIT';
    if (mode === 'WELCOME_CREDIT') creditBalanceType = 'WELCOME_CREDIT';
    else if (mode === 'SHOWCASE_CREDIT') creditBalanceType = 'SHOWCASE_CREDIT';
    else if (mode === 'TOPUP_CREDIT') creditBalanceType = 'TOPUP_CREDIT';

    const creditReversalTxn = await appendLedgerTransaction(
      {
        organization_id: organizationId,
        event_id: eventId,
        transaction_type: 'CREDIT_REVERSAL',
        balance_type: creditBalanceType,
        amount: discountToReverse, // positive credit
        currency: 'MYR',
        status: 'COMPLETED',
        reference_id: `reversal_event_${eventId}_credit`,
        description: `Restored RM${discountToReverse.toFixed(2)} ${mode.replace('_', ' ')} for cancelled ${eventLabel}`,
        metadata: {
          event_id: eventId,
          reason,
          reversed_credit_amount: discountToReverse,
          credit_type: mode,
        },
        created_by: createdBy || null,
      },
      env
    );
    transactions.push(creditReversalTxn);
  }

  // 5. Recalculate balances
  const wallet = await recalculateWalletBalances(organizationId, env);

  // Record audit trail event for REFUND_PROCESSED
  await recordWalletAuditEvent(
    {
      organizationId,
      eventType: 'REFUND_PROCESSED',
      orderId: null,
      paymentReference: `refund_event_${eventId}`,
      amount: paidToRefund,
      currency: 'MYR',
      actorId: createdBy || null,
      metadata: {
        event_id: eventId,
        paid_refunded: paidToRefund,
        credit_reversed: discountToReverse,
        payment_mode: mode,
        reason,
      },
    },
    env
  );

    return {
      success: true,
      transactions,
      wallet,
    };
  });
}

/**
 * Top-up Quote and Dynamic Bonus Calculations
 * Computes promotional top-up bonus strictly based on existing business rules:
 * - Below RM6,000: 0% Top-up Credit
 * - RM6,000 to RM9,999.99: 5% Top-up Credit
 * - RM10,000+: 7% Top-up Credit
 */
export async function getTopupQuote(
  params: {
    organizationId: string;
    amount: number;
    currency?: string;
  },
  env?: Record<string, any>
): Promise<TopupQuoteResponse> {
  const { organizationId, amount, currency = 'MYR' } = params;
  const sanitizedAmount = Math.max(0, Number(amount) || 0);
  const currentWallet = await getWalletBalance(organizationId, env);

  const promoCredit = calculateTopupCredit(sanitizedAmount);
  const bonusPercentage = sanitizedAmount > 0 ? (promoCredit / sanitizedAmount) * 100 : 0;
  const totalWalletValue = fromCents(toCents(sanitizedAmount) + toCents(promoCredit));

  const newPaidBalance = fromCents(toCents(currentWallet.paid_balance) + toCents(sanitizedAmount));
  const newTopupCredit = fromCents(toCents(currentWallet.topup_credit) + toCents(promoCredit));
  const newTotalBalance = fromCents(
    toCents(currentWallet.total_balance) + toCents(sanitizedAmount) + toCents(promoCredit)
  );

  return {
    amount: sanitizedAmount,
    currency,
    promo_credit: promoCredit,
    bonus_percentage: Math.round(bonusPercentage * 100) / 100,
    total_wallet_value: totalWalletValue,
    you_pay: sanitizedAmount,
    current_wallet: currentWallet,
    wallet_value_after_topup: {
      paid_balance: newPaidBalance,
      topup_credit: newTopupCredit,
      welcome_credit: currentWallet.welcome_credit,
      showcase_credit: currentWallet.showcase_credit,
      total_balance: newTotalBalance,
    },
    tiers: {
      tier1_min: TOPUP_TIER_1_MIN,
      tier1_rate: TOPUP_TIER_1_RATE,
      tier2_min: TOPUP_TIER_2_MIN,
      tier2_rate: TOPUP_TIER_2_RATE,
      preset_amounts: [1000, 3000, 6000, 10000],
    },
  };
}

// In-memory cache for pending / active top-up orders
const localPendingOrdersCache = new Map<string, PendingTopupOrder>();

/**
 * Creates a new Top Up Order in PENDING status.
 *
 * CRITICAL FINANCIAL LIFECYCLE RULES (PHASE 3):
 * 1. An order is ALWAYS created in PENDING status.
 * 2. Creating an order MUST NEVER modify wallet balances or create ledger records.
 * 3. Exact promotional bonus is computed from the central Wallet Engine (calculateTopupCredit).
 */
export async function createTopupOrder(
  params: {
    organizationId: string;
    userId: string;
    amount: number;
    currency?: string;
    paymentReference?: string;
    paymentMethod?: string;
    notes?: string;
    metadata?: Record<string, any>;
  },
  env?: Record<string, any>
): Promise<TopupOrderRecord> {
  const organizationId = params.organizationId || (params as any).organization_id;
  const userId = params.userId || (params as any).user_id;
  const amount = params.amount !== undefined ? params.amount : (params as any).top_up_amount;
  const { currency = 'MYR', paymentReference, paymentMethod, notes, metadata } = params;

  if (!organizationId) {
    throw new Error('Organization ID is required to create a top-up order');
  }
  if (!userId) {
    throw new Error('User ID is required to create a top-up order');
  }

  const numericAmount = Number(amount);
  if (isNaN(numericAmount) || numericAmount < 0) {
    throw new Error('Top-up amount must be a non-negative number');
  }

  const sanitizedAmount = fromCents(toCents(numericAmount));
  if (sanitizedAmount < 0) {
    throw new Error('Top-up amount must be greater than or equal to zero');
  }

  const sanitizedCurrency = (currency || 'MYR').trim().toUpperCase();
  const wallet = await getWalletBalance(organizationId, env);
  if (wallet.currency && wallet.currency.toUpperCase() !== sanitizedCurrency) {
    throw new Error(`Currency mismatch: Top-up order currency (${sanitizedCurrency}) does not match organization wallet currency (${wallet.currency})`);
  }

  // Calculate promotional credit using the central Wallet Engine
  const expectedCreditAmount = calculateTopupCredit(sanitizedAmount);
  const bonusPercentage = sanitizedAmount > 0 ? (expectedCreditAmount / sanitizedAmount) * 100 : 0;
  const totalWalletValue = fromCents(toCents(sanitizedAmount) + toCents(expectedCreditAmount));

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24-hour expiration window

  const orderRecord: TopupOrderRecord = {
    id,
    organization_id: organizationId,
    user_id: userId,
    currency,
    top_up_amount: sanitizedAmount,
    expected_credit_amount: expectedCreditAmount,
    bonus_percentage: Math.round(bonusPercentage * 100) / 100,
    total_wallet_value: totalWalletValue,
    status: 'PENDING',
    payment_reference: paymentReference || null,
    payment_method: paymentMethod || null,
    notes: notes || null,
    metadata: metadata || {},
    created_at: now,
    updated_at: now,
    expired_at: expiresAt,
    paid_at: null,
    failed_at: null,
    cancelled_at: null,
  };

  // 1. Production Supabase write attempt if available
  if (isSupabaseConfigured(env)) {
    const supabase = getSupabaseServerClient(env);
    const { data, error } = await supabase
      .from('wallet_topup_orders')
      .insert(orderRecord)
      .select()
      .maybeSingle();

    if (error) {
      console.error('Fatal: Supabase insert wallet_topup_orders failed in production:', error);
      throw new Error(`Financial top-up order creation failed: ${error.message}`);
    }

    if (!data) {
      throw new Error('Financial top-up order creation failed: No confirmation received from database');
    }

    const saved = data as TopupOrderRecord;
    localTopupOrdersCache.set(saved.id, saved);
    saveLocalStores();

    // Record TOP_UP_CREATED audit event
    await recordWalletAuditEvent(
      {
        organizationId,
        eventType: 'TOP_UP_CREATED',
        orderId: saved.id,
        paymentReference: paymentReference || null,
        amount: sanitizedAmount,
        currency,
        actorId: userId,
        metadata: {
          expected_credit_amount: expectedCreditAmount,
          bonus_percentage: saved.bonus_percentage,
          total_wallet_value: totalWalletValue,
        },
      },
      env
    );

    await dispatchNotificationEvent(
      {
        eventType: 'PAYMENT_PENDING',
        organizationId,
        recipientUserId: userId,
        referenceId: saved.payment_reference || saved.id,
        amount: sanitizedAmount,
        currency,
        subject: `Wallet Top-Up (${saved.id.slice(0, 8).toUpperCase()})`,
        checkoutUrl: (saved.metadata as any)?.payment_url || `/wallet/top-up?orderId=${saved.id}`,
        metadata: {
          order_id: saved.id,
          amount: sanitizedAmount,
        },
      },
      env
    ).catch((err) => console.error('[NOTIFICATION] Failed to dispatch PAYMENT_PENDING:', err));

    return saved;
  }

  // 2. Local cache persistence (dev/test only)
  assertProductionSafe('createTopupOrder', env);
  localTopupOrdersCache.set(orderRecord.id, orderRecord);
  saveLocalStores();

  // Record TOP_UP_CREATED audit event
  await recordWalletAuditEvent(
    {
      organizationId,
      eventType: 'TOP_UP_CREATED',
      orderId: orderRecord.id,
      paymentReference: paymentReference || null,
      amount: sanitizedAmount,
      currency,
      actorId: userId,
      metadata: {
        expected_credit_amount: expectedCreditAmount,
        bonus_percentage: orderRecord.bonus_percentage,
        total_wallet_value: totalWalletValue,
      },
    },
    env
  );

  await dispatchNotificationEvent(
    {
      eventType: 'PAYMENT_PENDING',
      organizationId,
      recipientUserId: userId,
      referenceId: orderRecord.payment_reference || orderRecord.id,
      amount: sanitizedAmount,
      currency,
      subject: `Wallet Top-Up (${orderRecord.id.slice(0, 8).toUpperCase()})`,
      checkoutUrl: (orderRecord.metadata as any)?.payment_url || `/wallet/top-up?orderId=${orderRecord.id}`,
      metadata: {
        order_id: orderRecord.id,
        amount: sanitizedAmount,
      },
    },
    env
  ).catch((err) => console.error('[NOTIFICATION] Failed to dispatch PAYMENT_PENDING:', err));

  return orderRecord;
}

/**
 * Retrieve a top-up order by its UUID.
 */
export async function getTopupOrderById(
  orderId: string,
  env?: Record<string, any>
): Promise<TopupOrderRecord | null> {
  if (!orderId) return null;

  if (isSupabaseConfigured(env)) {
    const supabase = getSupabaseServerClient(env);
    const { data, error } = await supabase
      .from('wallet_topup_orders')
      .select('*')
      .eq('id', orderId)
      .maybeSingle();

    if (error) {
      console.error('Error fetching topup order from Supabase:', error);
      if (!isLocalFallbackAllowed(env)) {
        throw new Error(`Failed to fetch top-up order from database: ${error.message}`);
      }
    }

    if (data) {
      const order = data as TopupOrderRecord;
      if (isLocalFallbackAllowed(env)) {
        localTopupOrdersCache.set(order.id, order);
      }
      return order;
    }
    return null;
  }

  // Check local cache in dev/test
  assertProductionSafe('getTopupOrderById', env);
  const cached = localTopupOrdersCache.get(orderId);
  return cached || null;
}

/**
 * Retrieve a top-up order by payment reference or Stripe session ID.
 */
export async function findTopupOrderByReference(
  referenceOrSessionId: string,
  env?: Record<string, any>
): Promise<TopupOrderRecord | null> {
  if (!referenceOrSessionId || typeof referenceOrSessionId !== 'string') return null;
  const cleanId = referenceOrSessionId.trim();
  if (!cleanId || cleanId.length > 120 || !/^[a-zA-Z0-9_-]{1,120}$/.test(cleanId)) return null;

  if (isSupabaseConfigured(env)) {
    const supabase = getSupabaseServerClient(env);

    // 1. Direct payment_reference match
    const { data: byRef } = await supabase
      .from('wallet_topup_orders')
      .select('*')
      .eq('payment_reference', cleanId)
      .maybeSingle();
    if (byRef) return byRef as TopupOrderRecord;

    // 2. Stripe session ID or Payment Intent match (STRIPE_cs_... or STRIPE_pi_...)
    if (cleanId.startsWith('cs_') || cleanId.startsWith('pi_')) {
      const { data: byPrefixedRef } = await supabase
        .from('wallet_topup_orders')
        .select('*')
        .eq('payment_reference', `STRIPE_${cleanId}`)
        .maybeSingle();
      if (byPrefixedRef) return byPrefixedRef as TopupOrderRecord;
    }

    // 3. Metadata check for stripe_session_id, sessionId, checkout_session_id, stripe_payment_intent
    const { data: byMetaSession } = await supabase
      .from('wallet_topup_orders')
      .select('*')
      .filter('metadata->>stripe_session_id', 'eq', cleanId)
      .maybeSingle();
    if (byMetaSession) return byMetaSession as TopupOrderRecord;

    const { data: byMetaId } = await supabase
      .from('wallet_topup_orders')
      .select('*')
      .filter('metadata->>sessionId', 'eq', cleanId)
      .maybeSingle();
    if (byMetaId) return byMetaId as TopupOrderRecord;

    const { data: byMetaCheckout } = await supabase
      .from('wallet_topup_orders')
      .select('*')
      .filter('metadata->>checkout_session_id', 'eq', cleanId)
      .maybeSingle();
    if (byMetaCheckout) return byMetaCheckout as TopupOrderRecord;

    const { data: byMetaPi } = await supabase
      .from('wallet_topup_orders')
      .select('*')
      .filter('metadata->>stripe_payment_intent', 'eq', cleanId)
      .maybeSingle();
    if (byMetaPi) return byMetaPi as TopupOrderRecord;
  }

  // Fallback to local cache in dev/test
  for (const order of localTopupOrdersCache.values()) {
    if (
      order.payment_reference === cleanId ||
      order.payment_reference === `STRIPE_${cleanId}` ||
      order.metadata?.stripe_session_id === cleanId ||
      order.metadata?.sessionId === cleanId ||
      order.metadata?.checkout_session_id === cleanId ||
      order.metadata?.stripe_payment_intent === cleanId ||
      order.metadata?.paymentIntentId === cleanId
    ) {
      return order;
    }
  }

  return null;
}

/**
 * List all top-up orders for an organization.
 */
export async function listTopupOrdersByOrganization(
  organizationId: string,
  env?: Record<string, any>
): Promise<TopupOrderRecord[]> {
  if (!organizationId) return [];

  let orders: TopupOrderRecord[] = [];

  if (isSupabaseConfigured(env)) {
    const supabase = getSupabaseServerClient(env);
    const { data, error } = await supabase
      .from('wallet_topup_orders')
      .select('*')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error listing topup orders from Supabase:', error);
      if (!isLocalFallbackAllowed(env)) {
        throw new Error(`Failed to list top-up orders from database: ${error.message}`);
      }
    }

    if (data) {
      orders = data as TopupOrderRecord[];
      if (isLocalFallbackAllowed(env)) {
        for (const o of orders) {
          localTopupOrdersCache.set(o.id, o);
        }
      }
      return orders;
    }
  }

  assertProductionSafe('listTopupOrdersByOrganization', env);
  orders = Array.from(localTopupOrdersCache.values())
    .filter((o) => o.organization_id === organizationId)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  return orders;
}

// In-memory concurrency lock set for atomic order state changes
const orderProcessingLocks = new Set<string>();

/**
 * Process a top-up order status transition.
 *
 * CRITICAL FINANCIAL RULES (PHASE 3):
 * 1. ONLY status transition to 'PAID' can create wallet ledger entries.
 * 2. 'PENDING', 'FAILED', 'EXPIRED', 'CANCELLED' NEVER create ledger entries.
 * 3. Separate ledger entries are created for Paid Balance (+ RM X) and Top-up Credit (+ RM Y).
 * 4. IDEMPOTENCY: Reprocessing an already PAID order returns the existing state and NEVER duplicates credit.
 * 5. TERMINAL STATES: Once in PAID, FAILED, EXPIRED, or CANCELLED, invalid transitions are strictly rejected.
 */
export async function processTopupOrderStatus(
  params: {
    orderId: string;
    newStatus: TopupOrderStatus;
    paymentReference?: string;
    paymentMethod?: string;
    processedBy?: string;
    reason?: string;
    metadata?: Record<string, any>;
    isTrustedSettlement?: boolean;
  },
  env?: Record<string, any>
): Promise<{
  order: TopupOrderRecord;
  alreadyProcessed: boolean;
  ledgerResult?: {
    topupTransaction?: WalletTransactionRecord;
    promoCreditTransaction?: WalletTransactionRecord | null;
    wallet: WalletBalanceSummary;
  };
  wallet?: any;
  message?: string;
}> {
  const { orderId, newStatus, paymentReference, paymentMethod, processedBy, reason, metadata, isTrustedSettlement } = params;

  // STRICT DEFENSE-IN-DEPTH: Transitioning to PAID is ONLY permitted for trusted settlements (webhook or developer reconciliation)
  if (newStatus === 'PAID' && !isTrustedSettlement) {
    throw new Error('Unauthorized: Top-up order status transition to PAID requires trusted settlement verification. Direct manual settlement is strictly forbidden.');
  }

  // Concurrency lock to prevent simultaneous duplicate status settlement race conditions
  if (orderProcessingLocks.has(orderId)) {
    let attempts = 0;
    while (orderProcessingLocks.has(orderId) && attempts < 10) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      attempts++;
    }
  }
  orderProcessingLocks.add(orderId);

  try {
    const order = await getTopupOrderById(orderId, env);
    if (!order) {
      throw new Error(`Top-up order not found: ${orderId}`);
    }

    const now = new Date().toISOString();

    // 1. Production Supabase RPC execution
    if (isSupabaseConfigured(env)) {
      const supabase = getSupabaseServerClient(env);
      const { data, error } = await supabase.rpc('process_topup_order_atomic', {
        p_order_id: orderId,
        p_organization_id: order.organization_id,
        p_status: newStatus,
        p_payment_reference: paymentReference || null,
        p_payment_method: paymentMethod || null,
        p_processed_by: processedBy || null,
        p_reason: reason || null,
        p_metadata: metadata || {},
      });

      if (error) {
        console.error('Fatal: Supabase atomic topup processing failed in production:', error);
        throw new Error(error.message || `Database error processing top-up order`);
      }

      if (!data || !data.success) {
        throw new Error(data?.message || 'Database rejected top-up order processing');
      }

      if (isLocalFallbackAllowed(env)) {
        if (data.order) {
          localTopupOrdersCache.set(data.order.id, data.order);
        }
        if (data.wallet) {
          const existingWallet = localWalletsCache.get(order.organization_id);
          localWalletsCache.set(order.organization_id, {
            ...existingWallet,
            ...data.wallet,
            outstanding_balance: (data.wallet as any).outstanding_balance !== undefined
              ? (data.wallet as any).outstanding_balance
              : (existingWallet?.outstanding_balance !== undefined ? existingWallet.outstanding_balance : 0),
          });
        }
        if (data.topup_transaction) {
          localTransactionsCache.set(data.topup_transaction.id, data.topup_transaction);
        }
        if (data.promo_credit_transaction) {
          localTransactionsCache.set(data.promo_credit_transaction.id, data.promo_credit_transaction);
        }
        saveLocalStores();
      }

      if (newStatus === 'PAID' && !data.is_idempotent_replay) {
        // FINAL ARCHITECTURE:
        // The process_topup_order_atomic RPC handles wallet credit, top-up order status PAID,
        // and outstanding balance reduction in a single ACID database transaction.
        // There is no secondary clearOutstandingBalance() step, guaranteeing that inconsistent
        // financial states (wallet credited while outstanding balance remains) are structurally impossible.
        await recordWalletAuditEvent(
          {
            organizationId: order.organization_id,
            eventType: 'PAYMENT_COMPLETED',
            orderId: order.id,
            paymentReference: paymentReference || order.payment_reference,
            amount: order.top_up_amount,
            currency: order.currency,
            actorId: processedBy || order.user_id,
            metadata: {
              payment_method: paymentMethod || order.payment_method,
              reason,
            },
          },
          env
        );

        const num = Number(order.top_up_amount);
        const curr = (order.currency || 'MYR').toUpperCase() === 'MYR' ? 'RM' : `${(order.currency || 'MYR').toUpperCase()} `;
        const amountStr = `${curr}${num % 1 === 0 ? num.toLocaleString('en-US') : num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

        await dispatchNotificationEvent(
          {
            eventType: 'PAYMENT_SUCCESS',
            organizationId: order.organization_id,
            recipientUserId: order.user_id,
            referenceId: `topup_${order.id}`,
            amount: order.top_up_amount,
            currency: order.currency || 'MYR',
            subject: `Wallet Top-Up (${order.id.slice(0, 8).toUpperCase()})`,
            paymentType: 'TOPUP',
            customTitle: 'Top Up Successful',
            customMessage: `Your wallet top-up of ${amountStr} has been completed successfully.`,
            metadata: {
              order_id: order.id,
              top_up_amount: order.top_up_amount,
              promo_credit: data.promo_credit_transaction ? data.promo_credit_transaction.amount : 0,
            },
          },
          env
        ).catch((err) => console.error('[NOTIFICATION] Failed to dispatch PAYMENT_SUCCESS for top-up in Supabase mode:', err));
      }

      if (['FAILED', 'EXPIRED', 'CANCELLED'].includes(newStatus) && !data.is_idempotent_replay) {
        await dispatchPaymentLifecycleTransition(
          {
            previousStatus: order.status,
            newStatus: newStatus as 'FAILED' | 'EXPIRED' | 'CANCELLED',
            organizationId: order.organization_id,
            recipientUserId: order.user_id,
            referenceId: order.id,
            orderId: order.id,
            amount: order.top_up_amount,
            currency: order.currency || 'MYR',
            subject: `Top-up Order ${order.id.slice(0, 8).toUpperCase()}`,
            reason: reason || (
              newStatus === 'CANCELLED'
                ? 'Checkout was cancelled by user'
                : newStatus === 'EXPIRED'
                ? 'Top-up payment session expired'
                : 'Payment transaction failed'
            ),
            metadata: {
              order_id: order.id,
              reason,
              payment_reference: paymentReference || order.payment_reference,
            },
          },
          env
        ).catch((err) => console.error('[NOTIFICATION] Failed to dispatch payment transition for top-up:', err));
      }

      return {
        order: data.order,
        alreadyProcessed: Boolean(data.is_idempotent_replay),
        ledgerResult: data.wallet ? {
          topupTransaction: data.topup_transaction,
          promoCreditTransaction: data.promo_credit_transaction,
          wallet: data.wallet,
        } : undefined,
        message: data.message,
      };
    }

    // 2. Local State Machine and Idempotency Enforcement (dev/test only)
    assertProductionSafe('processTopupOrderStatus', env);
    // If order is ALREADY 'PAID'
    if (order.status === 'PAID') {
      if (newStatus === 'PAID') {
        const currentWallet = await getWalletBalance(order.organization_id, env);
        return {
          order,
          alreadyProcessed: true,
          ledgerResult: {
            wallet: currentWallet,
          },
          message: 'Top-up order is already marked as PAID and credited (idempotent no-op).',
        };
      }
      throw new Error(`Cannot change status of an already PAID top-up order (${orderId}) to ${newStatus}`);
    }

    // Terminal state protection for non-PAID terminal states
    if (['FAILED', 'EXPIRED', 'CANCELLED'].includes(order.status)) {
      if (order.status === newStatus) {
        return {
          order,
          alreadyProcessed: true,
          message: `Top-up order is already in status ${newStatus}.`,
        };
      }
      throw new Error(`Cannot change status of a ${order.status} top-up order (${orderId}) to ${newStatus}`);
    }

    // 3. Process Status Transitions
    if (newStatus === 'PAID') {
      const wallet = await getWalletBalance(order.organization_id, env);
      if (wallet.currency && order.currency && wallet.currency.toUpperCase() !== order.currency.toUpperCase()) {
        throw new Error(`Currency mismatch: Top-up order currency (${order.currency}) does not match organization wallet currency (${wallet.currency})`);
      }

      // Calculate promo credit based on qualifying tier
      let promoCredit = 0;
      let tierRate = '0%';
      if (order.top_up_amount >= 10000) {
        promoCredit = fromCents(Math.round(toCents(order.top_up_amount) * 0.07));
        tierRate = '7%';
      } else if (order.top_up_amount >= 6000) {
        promoCredit = fromCents(Math.round(toCents(order.top_up_amount) * 0.05));
        tierRate = '5%';
      }

      // Extract included outstanding balance to deduct atomically
      const includedOutstanding = Math.max(
        Number(order.included_outstanding_amount || 0),
        Number(order.metadata?.included_outstanding_amount || 0),
        Number(metadata?.included_outstanding_amount || 0)
      );

      // A. Update Order State to PAID
      order.status = 'PAID';
      order.paid_at = now;
      order.updated_at = now;
      if (paymentReference) order.payment_reference = paymentReference;
      if (paymentMethod) order.payment_method = paymentMethod;
      if (reason) order.notes = reason;
      if (metadata) {
        order.metadata = { ...(order.metadata || {}), ...metadata };
      }

      localTopupOrdersCache.set(order.id, order);

      // B. Create separate ledger entries
      // 1) PAID_BALANCE (+ RM top_up_amount)
      const topupTxn: WalletTransactionRecord = {
        id: `txn_topup_${order.id}`,
        organization_id: order.organization_id,
        event_id: null,
        transaction_type: 'TOPUP',
        balance_type: 'PAID_BALANCE',
        amount: order.top_up_amount,
        currency: order.currency || 'MYR',
        status: 'COMPLETED',
        reference_id: `topup_order_${order.id}`,
        description: `Top-up Order ${order.id.slice(0, 8).toUpperCase()}`,
        metadata: {
          topup_order_id: order.id,
          payment_reference: order.payment_reference,
          payment_method: order.payment_method,
          reason,
          ...(order.metadata || {}),
        },
        created_by: processedBy || order.user_id,
        created_at: now,
      };
      localTransactionsCache.set(topupTxn.id, topupTxn);

      // 2) TOPUP_CREDIT (+ RM promoCredit) if tier qualifies
      let promoTxn: WalletTransactionRecord | null = null;
      if (promoCredit > 0) {
        promoTxn = {
          id: `txn_topup_${order.id}_promo`,
          organization_id: order.organization_id,
          event_id: null,
          transaction_type: 'TOPUP_CREDIT',
          balance_type: 'TOPUP_CREDIT',
          amount: promoCredit,
          currency: order.currency || 'MYR',
          status: 'COMPLETED',
          reference_id: `topup_order_${order.id}_promo`,
          description: `Promotional ${tierRate} Top-up Credit on RM${order.top_up_amount.toFixed(2)} deposit`,
          metadata: {
            parent_topup_id: topupTxn.id,
            topup_order_id: order.id,
            qualifying_amount: order.top_up_amount,
            reward_rate: tierRate,
            ...(order.metadata || {}),
          },
          created_by: processedBy || order.user_id,
          created_at: now,
        };
        localTransactionsCache.set(promoTxn.id, promoTxn);
      }

      // C. ATOMIC UPDATE: Credit paid_balance and topup_credit while simultaneously deducting outstanding_balance
      const currentWallet: OrganizationWalletRecord = localWalletsCache.get(order.organization_id) || {
        id: crypto.randomUUID(),
        organization_id: order.organization_id,
        paid_balance: 0,
        welcome_credit: 0,
        showcase_credit: 0,
        topup_credit: 0,
        outstanding_balance: 0,
        currency: order.currency || 'MYR',
        welcome_credit_granted: false,
        showcase_credit_granted: false,
        created_at: now,
        updated_at: now,
      };

      const newPaidBalance = fromCents(toCents(currentWallet.paid_balance) + toCents(order.top_up_amount));
      const newTopupCredit = fromCents(toCents(currentWallet.topup_credit) + toCents(promoCredit));
      const currentOutstandingCents = toCents(currentWallet.outstanding_balance || 0);
      const includedOutstandingCents = toCents(includedOutstanding);
      const newOutstandingBalance = fromCents(Math.max(0, currentOutstandingCents - includedOutstandingCents));

      const updatedWallet: OrganizationWalletRecord = {
        ...currentWallet,
        paid_balance: newPaidBalance,
        topup_credit: newTopupCredit,
        outstanding_balance: newOutstandingBalance,
        updated_at: now,
      };

      localWalletsCache.set(order.organization_id, updatedWallet);
      saveLocalStores();

      // Record PAYMENT_COMPLETED audit event
      await recordWalletAuditEvent(
        {
          organizationId: order.organization_id,
          eventType: 'PAYMENT_COMPLETED',
          orderId: order.id,
          paymentReference: order.payment_reference || paymentReference,
          amount: order.top_up_amount,
          currency: order.currency,
          actorId: processedBy || order.user_id,
          metadata: {
            payment_method: order.payment_method,
            reason,
          },
        },
        env
      );

      const walletSummary = await getWalletBalance(order.organization_id, env);

      const num = Number(order.top_up_amount);
      const curr = (order.currency || 'MYR').toUpperCase() === 'MYR' ? 'RM' : `${(order.currency || 'MYR').toUpperCase()} `;
      const amountStr = `${curr}${num % 1 === 0 ? num.toLocaleString('en-US') : num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

      await dispatchNotificationEvent(
        {
          eventType: 'PAYMENT_SUCCESS',
          organizationId: order.organization_id,
          recipientUserId: order.user_id,
          referenceId: `topup_${order.id}`,
          amount: order.top_up_amount,
          currency: order.currency || 'MYR',
          subject: `Wallet Top-Up (${order.id.slice(0, 8).toUpperCase()})`,
          paymentType: 'TOPUP',
          customTitle: 'Top Up Successful',
          customMessage: `Your wallet top-up of ${amountStr} has been completed successfully.`,
          metadata: {
            order_id: order.id,
            top_up_amount: order.top_up_amount,
            promo_credit: promoCredit,
          },
        },
        env
      ).catch((err) => console.error('[NOTIFICATION] Failed to dispatch PAYMENT_SUCCESS for top-up:', err));

      return {
        order,
        alreadyProcessed: false,
        ledgerResult: {
          topupTransaction: topupTxn,
          promoCreditTransaction: promoTxn,
          wallet: walletSummary,
        },
        wallet: walletSummary,
        message: `Top-up order successfully marked as PAID. Wallet credited with RM${order.top_up_amount.toFixed(2)} cash balance and RM${promoCredit.toFixed(2)} promotional credits.`,
      };
    }

    if (newStatus === 'FAILED') {
      order.status = 'FAILED';
      order.failed_at = now;
      order.updated_at = now;
      if (reason) order.notes = reason;
      if (paymentReference) order.payment_reference = paymentReference;

      localTopupOrdersCache.set(order.id, order);
      saveLocalStores();

      await dispatchPaymentLifecycleTransition(
        {
          previousStatus: order.status,
          newStatus: 'FAILED',
          organizationId: order.organization_id,
          recipientUserId: order.user_id,
          referenceId: order.id,
          orderId: order.id,
          amount: order.top_up_amount,
          currency: order.currency || 'MYR',
          subject: `Top-up Order ${order.id.slice(0, 8).toUpperCase()}`,
          reason: reason || 'Payment transaction failed',
          metadata: {
            order_id: order.id,
            reason,
            payment_reference: paymentReference,
          },
        },
        env
      ).catch((err) => console.error('[NOTIFICATION] Failed to dispatch PAYMENT_FAILED for top-up in local fallback:', err));

      return {
        order,
        alreadyProcessed: false,
        message: 'Top-up order marked as FAILED. No funds or credits were added to the wallet.',
      };
    }

    if (newStatus === 'CANCELLED') {
      order.status = 'CANCELLED';
      order.cancelled_at = now;
      order.updated_at = now;
      if (reason) order.notes = reason;

      localTopupOrdersCache.set(order.id, order);
      saveLocalStores();

      await dispatchPaymentLifecycleTransition(
        {
          previousStatus: 'PENDING',
          newStatus: 'CANCELLED',
          organizationId: order.organization_id,
          recipientUserId: order.user_id,
          referenceId: order.id,
          orderId: order.id,
          amount: order.top_up_amount,
          currency: order.currency || 'MYR',
          subject: `Top-up Order ${order.id.slice(0, 8).toUpperCase()}`,
          reason: reason || 'Top-up checkout was cancelled by user',
          metadata: {
            order_id: order.id,
            reason,
            payment_reference: paymentReference,
          },
        },
        env
      ).catch((err) => console.error('[NOTIFICATION] Failed to dispatch CANCELLED notification for top-up in local fallback:', err));

      return {
        order,
        alreadyProcessed: false,
        message: 'Top-up order marked as CANCELLED. No funds or credits were added to the wallet.',
      };
    }

    if (newStatus === 'EXPIRED') {
      order.status = 'EXPIRED';
      order.expired_at = now;
      order.updated_at = now;
      if (reason) order.notes = reason;

      localTopupOrdersCache.set(order.id, order);
      saveLocalStores();

      await dispatchPaymentLifecycleTransition(
        {
          previousStatus: 'PENDING',
          newStatus: 'EXPIRED',
          organizationId: order.organization_id,
          recipientUserId: order.user_id,
          referenceId: order.id,
          orderId: order.id,
          amount: order.top_up_amount,
          currency: order.currency || 'MYR',
          subject: `Top-up Order ${order.id.slice(0, 8).toUpperCase()}`,
          reason: reason || 'Top-up payment session expired',
          metadata: {
            order_id: order.id,
            reason,
            payment_reference: paymentReference,
          },
        },
        env
      ).catch((err) => console.error('[NOTIFICATION] Failed to dispatch EXPIRED notification for top-up in local fallback:', err));

      return {
        order,
        alreadyProcessed: false,
        message: 'Top-up order marked as EXPIRED. No funds or credits were added to the wallet.',
      };
    }

    throw new Error(`Unsupported top-up order status transition: ${newStatus}`);
  } finally {
    orderProcessingLocks.delete(orderId);
  }
}

/**
 * Developer / Super Admin Manual Payment Reconciliation.
 * Allows a privileged developer/super-admin to reconcile a payment for a Top-up Order.
 *
 * CRITICAL SECURITY & BUSINESS RULES:
 * 1. Strictly requires explicit reconciliation reason and verified external payment reference.
 * 2. Settles the order atomically with isTrustedSettlement = true.
 * 3. Never allows arbitrary unrecorded balance creation; bounds credit strictly to order's top_up_amount and promotional tier.
 * 4. Strictly idempotent (no duplicate credit if already PAID).
 * 5. Logs an ADMIN_RECONCILIATION audit event.
 */
export async function reconcileTopupOrder(
  params: {
    orderId: string;
    paymentReference: string;
    paymentMethod?: string;
    reconciledBy: string;
    reason: string;
    metadata?: Record<string, any>;
  },
  env?: Record<string, any>
): Promise<{
  order: TopupOrderRecord;
  alreadyProcessed: boolean;
  ledgerResult?: {
    topupTransaction?: WalletTransactionRecord;
    promoCreditTransaction?: WalletTransactionRecord | null;
    wallet: WalletBalanceSummary;
  };
  message?: string;
}> {
  const { orderId, paymentReference, paymentMethod, reconciledBy, reason, metadata } = params;

  if (!orderId) {
    throw new Error('Order ID is required for reconciliation');
  }
  if (!paymentReference || typeof paymentReference !== 'string' || paymentReference.trim().length === 0) {
    throw new Error('Valid external payment reference is required for reconciliation');
  }
  if (!reason || typeof reason !== 'string' || reason.trim().length < 5) {
    throw new Error('Explicit reconciliation reason (minimum 5 characters) is required');
  }
  if (!reconciledBy) {
    throw new Error('Reconciling developer user ID is required');
  }

  const order = await getTopupOrderById(orderId, env);
  if (!order) {
    throw new Error(`Top-up order not found: ${orderId}`);
  }

  // If already PAID, return idempotent result without double crediting
  if (order.status === 'PAID') {
    const currentWallet = await getWalletBalance(order.organization_id, env);
    return {
      order,
      alreadyProcessed: true,
      ledgerResult: { wallet: currentWallet },
      message: 'Top-up order was already marked as PAID (idempotent reconciliation no-op).',
    };
  }

  // If in terminal non-PAID state
  if (['FAILED', 'EXPIRED', 'CANCELLED'].includes(order.status)) {
    throw new Error(`Cannot reconcile top-up order in terminal status '${order.status}' without restoring order state`);
  }

  // Execute atomic settlement with isTrustedSettlement = true
  const settlementResult = await processTopupOrderStatus(
    {
      orderId,
      newStatus: 'PAID',
      paymentReference: paymentReference.trim(),
      paymentMethod: paymentMethod || 'MANUAL_RECONCILIATION',
      processedBy: reconciledBy,
      reason: `Manual Admin Reconciliation: ${reason.trim()}`,
      metadata: {
        reconciliation: true,
        reconciled_by: reconciledBy,
        reconciliation_reason: reason.trim(),
        ...(metadata || {}),
      },
      isTrustedSettlement: true,
    },
    env
  );

  // Record ADMIN_RECONCILIATION audit event
  await recordWalletAuditEvent(
    {
      organizationId: order.organization_id,
      eventType: 'ADMIN_RECONCILIATION',
      orderId: order.id,
      paymentReference: paymentReference.trim(),
      amount: order.top_up_amount,
      currency: order.currency,
      actorId: reconciledBy,
      metadata: {
        reason: reason.trim(),
        previous_status: 'PENDING',
        new_status: 'PAID',
        is_idempotent: settlementResult.alreadyProcessed,
      },
    },
    env
  );

  return settlementResult;
}

/**
 * Prepare a pending top-up order (Phase 2 & Phase 3 compatible).
 * Prepares the order in PENDING status without crediting any balance or calling payment providers.
 */
export async function preparePendingTopupOrder(
  params: {
    organizationId: string;
    amount: number;
    currency?: string;
    createdBy?: string;
    notes?: string;
  },
  env?: Record<string, any>
): Promise<{
  order: TopupOrderRecord;
  quote: TopupQuoteResponse;
  message: string;
}> {
  const { organizationId, amount, currency = 'MYR', createdBy = '00000000-0000-0000-0000-000000000000', notes } = params;
  if (!organizationId) {
    throw new Error('Organization ID is required');
  }
  const sanitizedAmount = Number(amount);
  if (isNaN(sanitizedAmount) || sanitizedAmount <= 0) {
    throw new Error('Top-up amount must be a positive number greater than 0');
  }

  const quote = await getTopupQuote({ organizationId, amount: sanitizedAmount, currency }, env);

  const order = await createTopupOrder(
    {
      organizationId,
      userId: createdBy,
      amount: sanitizedAmount,
      currency,
      notes: notes || 'Top-up Order Created (Awaiting Payment)',
    },
    env
  );

  return {
    order,
    quote,
    message: 'Pending top-up order created successfully in PENDING status. Wallet balance has not been credited.',
  };
}

export async function getPendingTopupOrder(orderId: string, env?: Record<string, any>): Promise<TopupOrderRecord | null> {
  return getTopupOrderById(orderId, env);
}

/**
 * Attaches checkout session information (Stripe Checkout Session ID, checkout URL, payment reference, and expiry)
 * to a wallet top-up order.
 */
export async function attachCheckoutSessionToTopupOrder(
  orderId: string,
  sessionInfo: {
    sessionId: string;
    checkoutUrl: string;
    paymentReference?: string;
    paymentMethod?: string;
    expiresAt?: string;
    totalDue?: number;
    includedOutstandingAmount?: number;
    payableAmount?: number;
    extraMetadata?: Record<string, any>;
  },
  env?: Record<string, any>
): Promise<TopupOrderRecord | null> {
  const now = new Date().toISOString();

  if (isSupabaseConfigured(env)) {
    const supabase = getSupabaseServerClient(env);
    const { data: existingData, error: fetchError } = await supabase
      .from('wallet_topup_orders')
      .select('*')
      .eq('id', orderId)
      .maybeSingle();

    if (fetchError) {
      console.error('Fatal: Failed to fetch topup order from Supabase:', fetchError);
      throw new Error(`Database error fetching topup order: ${fetchError.message}`);
    }

    if (!existingData) {
      console.warn(`[attachCheckoutSessionToTopupOrder] Order ${orderId} not found in Supabase`);
      return null;
    }

    const currentMetadata = (existingData.metadata && typeof existingData.metadata === 'object') ? existingData.metadata : {};
    const mergedMetadata = {
      ...currentMetadata,
      checkout_in_progress: false,
      checkout_claim_id: null,
      stripe_session_id: sessionInfo.sessionId,
      sessionId: sessionInfo.sessionId,
      checkout_url: sessionInfo.checkoutUrl,
      checkout_expires_at: sessionInfo.expiresAt,
      ...(sessionInfo.totalDue !== undefined ? { total_due: sessionInfo.totalDue } : {}),
      ...(sessionInfo.includedOutstandingAmount !== undefined ? { included_outstanding_amount: sessionInfo.includedOutstandingAmount } : {}),
      ...(sessionInfo.payableAmount !== undefined ? { payable_amount: sessionInfo.payableAmount } : {}),
      ...(sessionInfo.extraMetadata || {}),
    };

    const updatePayload: any = {
      metadata: mergedMetadata,
      updated_at: now,
    };

    if (sessionInfo.totalDue !== undefined && sessionInfo.totalDue > 0) {
      updatePayload.top_up_amount = sessionInfo.totalDue;
    }
    if (sessionInfo.totalDue !== undefined) {
      updatePayload.total_due = sessionInfo.totalDue;
    }
    if (sessionInfo.includedOutstandingAmount !== undefined) {
      updatePayload.included_outstanding_amount = sessionInfo.includedOutstandingAmount;
    }
    if (sessionInfo.payableAmount !== undefined) {
      updatePayload.payable_amount = sessionInfo.payableAmount;
    }
    if (sessionInfo.paymentReference) {
      updatePayload.payment_reference = sessionInfo.paymentReference;
    }
    if (sessionInfo.paymentMethod) {
      updatePayload.payment_method = sessionInfo.paymentMethod;
    }
    if (sessionInfo.expiresAt) {
      updatePayload.expired_at = sessionInfo.expiresAt;
    }

    const { data: updatedData, error: updateError } = await supabase
      .from('wallet_topup_orders')
      .update(updatePayload)
      .eq('id', orderId)
      .select('*')
      .maybeSingle();

    if (updateError) {
      console.error('Fatal: Failed to attach checkout session in database:', updateError);
      throw new Error(`Database error attaching checkout session to order: ${updateError.message}`);
    }

    if (updatedData) {
      const updatedOrder = updatedData as TopupOrderRecord;
      if (isLocalFallbackAllowed(env)) {
        localTopupOrdersCache.set(updatedOrder.id, updatedOrder);
      }
      return updatedOrder;
    }
  }

  // Fallback to local memory / JSON cache
  const cachedOrder = localTopupOrdersCache.get(orderId);
  if (cachedOrder) {
    const currentMetadata = (cachedOrder.metadata && typeof cachedOrder.metadata === 'object') ? cachedOrder.metadata : {};
    cachedOrder.metadata = {
      ...currentMetadata,
      checkout_in_progress: false,
      checkout_claim_id: null,
      stripe_session_id: sessionInfo.sessionId,
      sessionId: sessionInfo.sessionId,
      checkout_url: sessionInfo.checkoutUrl,
      checkout_expires_at: sessionInfo.expiresAt,
      ...(sessionInfo.totalDue !== undefined ? { total_due: sessionInfo.totalDue } : {}),
      ...(sessionInfo.includedOutstandingAmount !== undefined ? { included_outstanding_amount: sessionInfo.includedOutstandingAmount } : {}),
      ...(sessionInfo.payableAmount !== undefined ? { payable_amount: sessionInfo.payableAmount } : {}),
      ...(sessionInfo.extraMetadata || {}),
    };
    if (sessionInfo.totalDue !== undefined && sessionInfo.totalDue > 0) {
      cachedOrder.top_up_amount = sessionInfo.totalDue;
    }
    if (sessionInfo.totalDue !== undefined) {
      cachedOrder.total_due = sessionInfo.totalDue;
    }
    if (sessionInfo.includedOutstandingAmount !== undefined) {
      cachedOrder.included_outstanding_amount = sessionInfo.includedOutstandingAmount;
    }
    if (sessionInfo.payableAmount !== undefined) {
      cachedOrder.payable_amount = sessionInfo.payableAmount;
    }
    if (sessionInfo.paymentReference) {
      cachedOrder.payment_reference = sessionInfo.paymentReference;
    }
    if (sessionInfo.paymentMethod) {
      cachedOrder.payment_method = sessionInfo.paymentMethod;
    }
    if (sessionInfo.expiresAt) {
      cachedOrder.expired_at = sessionInfo.expiresAt;
    }
    cachedOrder.updated_at = now;
    localTopupOrdersCache.set(orderId, cachedOrder);
    saveLocalStores();
    return cachedOrder;
  }

  return null;
}

/**
 * Cancels the active checkout session of a PENDING top-up order.
 * The order remains in PENDING status, allowing a fresh checkout session to be created.
 */
export async function cancelActiveCheckoutSession(
  orderId: string,
  reason: string = 'Checkout session cancelled by user',
  env?: Record<string, any>
): Promise<TopupOrderRecord | null> {
  const order = await getTopupOrderById(orderId, env);
  if (!order || order.status !== 'PENDING') {
    return null;
  }

  const now = new Date().toISOString();
  const currentMetadata = (order.metadata && typeof order.metadata === 'object') ? order.metadata : {};
  const updatedMetadata = {
    ...currentMetadata,
    checkout_cancelled: true,
    session_status: 'cancelled',
    cancelled_at: now,
    cancel_reason: reason,
  };

  if (isSupabaseConfigured(env)) {
    const supabase = getSupabaseServerClient(env);
    const { data, error } = await supabase
      .from('wallet_topup_orders')
      .update({
        metadata: updatedMetadata,
        updated_at: now,
      })
      .eq('id', orderId)
      .select('*')
      .maybeSingle();

    if (!error && data) {
      const updatedOrder = data as TopupOrderRecord;
      localTopupOrdersCache.set(updatedOrder.id, updatedOrder);
      return updatedOrder;
    }
  }

  // Local fallback
  order.metadata = updatedMetadata;
  order.updated_at = now;
  localTopupOrdersCache.set(order.id, order);
  saveLocalStores();
  return order;
}

/**
 * Expire the active checkout session of a PENDING top-up order.
 * Sets the expiration timestamp to the past. The order remains PENDING.
 */
export async function expireActiveCheckoutSession(
  orderId: string,
  env?: Record<string, any>
): Promise<TopupOrderRecord | null> {
  const order = await getTopupOrderById(orderId, env);
  if (!order || order.status !== 'PENDING') {
    return null;
  }

  const expiredTimestamp = new Date(Date.now() - 3600000).toISOString();
  const now = new Date().toISOString();
  const currentMetadata = (order.metadata && typeof order.metadata === 'object') ? order.metadata : {};
  const updatedMetadata = {
    ...currentMetadata,
    checkout_expires_at: expiredTimestamp,
    session_status: 'expired',
  };

  if (isSupabaseConfigured(env)) {
    const supabase = getSupabaseServerClient(env);
    const { data, error } = await supabase
      .from('wallet_topup_orders')
      .update({
        expired_at: expiredTimestamp,
        metadata: updatedMetadata,
        updated_at: now,
      })
      .eq('id', orderId)
      .select('*')
      .maybeSingle();

    if (!error && data) {
      const updatedOrder = data as TopupOrderRecord;
      localTopupOrdersCache.set(updatedOrder.id, updatedOrder);
      return updatedOrder;
    }
  }

  // Local fallback
  order.expired_at = expiredTimestamp;
  order.metadata = updatedMetadata;
  order.updated_at = now;
  localTopupOrdersCache.set(order.id, order);
  saveLocalStores();
  return order;
}

export interface CheckoutSessionClaimResult {
  success: boolean;
  claimed: boolean;
  attempt?: number;
  claimId?: string;
  inProgress?: boolean;
  waitRequired?: boolean;
  alreadyHasSession?: boolean;
  sessionId?: string;
  checkoutUrl?: string;
  expiresAt?: string;
  order?: TopupOrderRecord;
  message?: string;
  error?: string;
}

/**
 * Atomically claims checkout session creation for a PENDING top-up order.
 *
 * Distributed Concurrency Guarantee:
 * When multiple distributed worker instances (e.g. Cloudflare Workers / containers) receive simultaneous
 * checkout requests for the same order, this function performs an exclusive row lock:
 * 1. Exactly ONE worker instance acquires the claim (claimed = true) and receives a strictly monotonic
 *    checkout attempt sequence number for Stripe idempotency.
 * 2. If an active, non-expired checkout session already exists, it is immediately returned for reuse.
 * 3. Subsequent workers receive waitRequired = true and inProgress = true so they can wait and re-read
 *    the authoritative session once created, completely preventing duplicate Stripe Checkout Sessions.
 */
export async function claimCheckoutSessionCreation(
  orderId: string,
  options: {
    claimId?: string;
    timeoutSeconds?: number;
  } = {},
  env?: Record<string, any>
): Promise<CheckoutSessionClaimResult> {
  const claimId = options.claimId || `claim_${crypto.randomUUID()}`;
  const timeoutSeconds = options.timeoutSeconds || 30;
  const now = new Date();
  const nowIso = now.toISOString();

  if (isSupabaseConfigured(env)) {
    const supabase = getSupabaseServerClient(env);
    // 1. Try atomic PostgreSQL RPC if provisioned
    try {
      const { data, error } = await supabase.rpc('claim_checkout_session_creation', {
        p_order_id: orderId,
        p_claim_id: claimId,
        p_timeout_seconds: timeoutSeconds,
      });

      if (!error && data) {
        return {
          success: Boolean(data.success),
          claimed: Boolean(data.claimed),
          attempt: data.attempt,
          claimId: data.claim_id || claimId,
          inProgress: Boolean(data.in_progress),
          waitRequired: Boolean(data.wait_required),
          alreadyHasSession: Boolean(data.already_has_session),
          sessionId: data.session_id,
          checkoutUrl: data.checkout_url,
          expiresAt: data.expires_at,
          order: data.order as TopupOrderRecord,
          message: data.message,
          error: data.error,
        };
      }

      if (error && error.code !== 'PGRST202' && error.code !== '42883') {
        console.error('Fatal: Failed to claim checkout session creation via RPC:', error);
        if (isProductionEnvironment(env)) {
          throw new Error(`Financial database error claiming checkout session: ${error.message}`);
        }
      }
    } catch (rpcErr: any) {
      if (isProductionEnvironment(env) && !rpcErr.message?.includes('PGRST202') && !rpcErr.message?.includes('42883')) {
        throw rpcErr;
      }
    }

    // Direct database query & conditional update with optimistic/row lock pattern
    const { data: existingOrder, error: fetchErr } = await supabase
      .from('wallet_topup_orders')
      .select('*')
      .eq('id', orderId)
      .maybeSingle();

    if (fetchErr) {
      console.error('Fatal: Failed to fetch order for checkout claim:', fetchErr);
      throw new Error(`Database error fetching order: ${fetchErr.message}`);
    }
    if (!existingOrder) {
      return { success: false, claimed: false, error: 'order_not_found', message: 'Order not found' };
    }
    if (existingOrder.status !== 'PENDING') {
      return { success: false, claimed: false, error: 'order_not_pending', message: `Order is in status ${existingOrder.status}` };
    }

    const metadata = (existingOrder.metadata && typeof existingOrder.metadata === 'object') ? existingOrder.metadata : {};
    const existingSessionId = metadata.stripe_session_id || metadata.sessionId;
    const existingCheckoutUrl = metadata.checkout_url;
    const existingExpiresAt = metadata.checkout_expires_at || existingOrder.expired_at;
    const isCancelled = Boolean(metadata.checkout_cancelled) || Boolean(metadata.cancelled_at) || metadata.session_status === 'cancelled';

    if (existingSessionId && !isCancelled) {
      let isExpired = false;
      if (existingExpiresAt && new Date(existingExpiresAt).getTime() <= Date.now()) {
        isExpired = true;
      }
      if (!isExpired) {
        return {
          success: true,
          claimed: false,
          alreadyHasSession: true,
          sessionId: existingSessionId,
          checkoutUrl: existingCheckoutUrl,
          expiresAt: existingExpiresAt,
          order: existingOrder as TopupOrderRecord,
          message: 'Active checkout session already exists on order',
        };
      }
    }

    const inProgress = Boolean(metadata.checkout_in_progress);
    const claimedAt = metadata.checkout_claimed_at ? new Date(metadata.checkout_claimed_at).getTime() : 0;
    const claimedBy = metadata.checkout_claim_id;
    const currentAttempt = Number(metadata.checkout_attempt) || 0;

    if (inProgress && claimedAt && (Date.now() - claimedAt) < timeoutSeconds * 1000) {
      if (claimedBy === claimId) {
        return {
          success: true,
          claimed: true,
          attempt: currentAttempt,
          claimId,
          order: existingOrder as TopupOrderRecord,
        };
      }
      return {
        success: true,
        claimed: false,
        inProgress: true,
        waitRequired: true,
        attempt: currentAttempt,
        order: existingOrder as TopupOrderRecord,
        message: 'Checkout session creation in progress by another worker',
      };
    }

    const newAttempt = currentAttempt + 1;
    const updatedMetadata = {
      ...metadata,
      checkout_in_progress: true,
      checkout_claim_id: claimId,
      checkout_claimed_at: nowIso,
      checkout_attempt: newAttempt,
    };

    const { data: updatedOrder, error: updateErr } = await supabase
      .from('wallet_topup_orders')
      .update({
        metadata: updatedMetadata,
        updated_at: nowIso,
      })
      .eq('id', orderId)
      .select('*')
      .maybeSingle();

    if (updateErr) {
      console.error('Fatal: Failed to acquire checkout claim in database:', updateErr);
      throw new Error(`Database error acquiring checkout claim: ${updateErr.message}`);
    }

    return {
      success: true,
      claimed: true,
      attempt: newAttempt,
      claimId,
      order: (updatedOrder || existingOrder) as TopupOrderRecord,
      message: 'Checkout creation claim acquired',
    };
  }

  // Local memory / dev fallback
  const cached = localTopupOrdersCache.get(orderId);
  if (!cached) {
    return { success: false, claimed: false, error: 'order_not_found', message: 'Order not found' };
  }
  if (cached.status !== 'PENDING') {
    return { success: false, claimed: false, error: 'order_not_pending', message: `Order is in status ${cached.status}` };
  }

  const meta = (cached.metadata && typeof cached.metadata === 'object') ? cached.metadata : {};
  const existingSessionId = meta.stripe_session_id || meta.sessionId;
  const existingCheckoutUrl = meta.checkout_url;
  const existingExpiresAt = meta.checkout_expires_at || cached.expired_at;
  const isCancelled = Boolean(meta.checkout_cancelled) || Boolean(meta.cancelled_at) || meta.session_status === 'cancelled';

  if (existingSessionId && !isCancelled) {
    let isExpired = false;
    if (existingExpiresAt && new Date(existingExpiresAt).getTime() <= Date.now()) {
      isExpired = true;
    }
    if (!isExpired) {
      return {
        success: true,
        claimed: false,
        alreadyHasSession: true,
        sessionId: existingSessionId,
        checkoutUrl: existingCheckoutUrl,
        expiresAt: existingExpiresAt,
        order: cached,
        message: 'Active checkout session already exists on order',
      };
    }
  }

  const inProg = Boolean(meta.checkout_in_progress);
  const claimedAt = meta.checkout_claimed_at ? new Date(meta.checkout_claimed_at).getTime() : 0;
  const claimedBy = meta.checkout_claim_id;
  const currentAttempt = Number(meta.checkout_attempt) || 0;

  if (inProg && claimedAt && (Date.now() - claimedAt) < timeoutSeconds * 1000) {
    if (claimedBy === claimId) {
      return {
        success: true,
        claimed: true,
        attempt: currentAttempt,
        claimId,
        order: cached,
      };
    }
    return {
      success: true,
      claimed: false,
      inProgress: true,
      waitRequired: true,
      attempt: currentAttempt,
      order: cached,
      message: 'Checkout session creation in progress by another worker',
    };
  }

  const newAttempt = currentAttempt + 1;
  cached.metadata = {
    ...meta,
    checkout_in_progress: true,
    checkout_claim_id: claimId,
    checkout_claimed_at: nowIso,
    checkout_attempt: newAttempt,
  };
  cached.updated_at = nowIso;
  localTopupOrdersCache.set(orderId, cached);

  return {
    success: true,
    claimed: true,
    attempt: newAttempt,
    claimId,
    order: cached,
    message: 'Checkout creation claim acquired',
  };
}

/**
 * Releases a checkout session creation claim (e.g. if Stripe call failed).
 */
export async function releaseCheckoutSessionClaim(
  orderId: string,
  claimId?: string,
  env?: Record<string, any>
): Promise<boolean> {
  const nowIso = new Date().toISOString();

  if (isSupabaseConfigured(env)) {
    const supabase = getSupabaseServerClient(env);
    try {
      const { data, error } = await supabase.rpc('release_checkout_session_claim', {
        p_order_id: orderId,
        p_claim_id: claimId || null,
      });
      if (!error && data) {
        return Boolean(data.success);
      }
    } catch {
      // RPC fallback
    }

    const { data: existing } = await supabase
      .from('wallet_topup_orders')
      .select('metadata')
      .eq('id', orderId)
      .maybeSingle();

    if (existing) {
      const meta = existing.metadata || {};
      if (!claimId || meta.checkout_claim_id === claimId) {
        const { error: releaseErr } = await supabase
          .from('wallet_topup_orders')
          .update({
            metadata: {
              ...meta,
              checkout_in_progress: false,
              checkout_claim_id: null,
            },
            updated_at: nowIso,
          })
          .eq('id', orderId);
        if (releaseErr) {
          console.warn('Notice releasing checkout claim on order:', releaseErr.message);
        }
      }
    }
    return true;
  }

  const cached = localTopupOrdersCache.get(orderId);
  if (cached) {
    const meta = cached.metadata || {};
    if (!claimId || meta.checkout_claim_id === claimId) {
      cached.metadata = {
        ...meta,
        checkout_in_progress: false,
        checkout_claim_id: null,
      };
      cached.updated_at = nowIso;
      localTopupOrdersCache.set(orderId, cached);
    }
  }
  return true;
}

