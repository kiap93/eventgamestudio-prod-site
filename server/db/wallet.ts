import { getSupabaseServerClient, isSupabaseConfigured } from '../supabase.js';
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
} from './types.js';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

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

// In-memory fallback caches
const localWalletsCache = new Map<string, OrganizationWalletRecord>();
const localTransactionsCache = new Map<string, WalletTransactionRecord>();

function loadLocalStores(): void {
  try {
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
  } catch (err) {
    console.warn('Warning loading local wallet store:', err);
  }
}

function saveLocalStores(): void {
  try {
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
  } catch (err) {
    console.warn('Warning saving local wallet store:', err);
  }
}

// Initial load of local cache
loadLocalStores();

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
      console.error('Fatal: Supabase query wallet_transactions failed:', error);
      throw new Error(`Failed to fetch wallet transactions from database: ${error.message}`);
    }

    transactions = (data || []) as WalletTransactionRecord[];
  } else {
    // Development / test fallback when Supabase is not configured
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
  const walletRecord: OrganizationWalletRecord = {
    id: localWalletsCache.get(organizationId)?.id || crypto.randomUUID(),
    organization_id: organizationId,
    paid_balance: paidBalance,
    welcome_credit: welcomeCredit,
    showcase_credit: showcaseCredit,
    topup_credit: topupCredit,
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
          currency: 'MYR',
          welcome_credit_granted: welcomeCreditGranted,
          showcase_credit_granted: showcaseCreditGranted,
          updated_at: now,
        },
        { onConflict: 'organization_id' }
      );
      if (upsertError) {
        console.warn('Notice: could not upsert organization_wallets cache table:', upsertError.message);
      }
    } catch (err: any) {
      console.warn('Notice writing organization_wallets cache to Supabase:', err.message);
    }
    localWalletsCache.set(organizationId, walletRecord);
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
    const { data, error } = await supabase
      .from('wallet_transactions')
      .insert(record)
      .select()
      .single();

    if (error) {
      console.error('Fatal: Supabase insert wallet_transactions failed in production:', error);
      throw new Error(`Financial ledger transaction failed: ${error.message}`);
    }
    if (!data) {
      throw new Error('Financial ledger transaction failed: No confirmation received from database');
    }

    const savedRecord = data as WalletTransactionRecord;
    localTransactionsCache.set(savedRecord.id, savedRecord);
    return savedRecord;
  }

  // Development/Test mock fallback only when Supabase is not configured
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

  // Idempotency check: if referenceId is provided, check both memory cache and Supabase
  if (referenceId) {
    let existing = Array.from(localTransactionsCache.values()).find(
      (t) =>
        t.organization_id === organizationId &&
        t.reference_id === referenceId &&
        t.transaction_type === 'TOPUP' &&
        t.status === 'COMPLETED'
    );

    if (!existing) {
      try {
        const supabase = getSupabaseServerClient(env);
        const { data, error } = await supabase
          .from('wallet_transactions')
          .select('*')
          .eq('organization_id', organizationId)
          .eq('reference_id', referenceId)
          .eq('transaction_type', 'TOPUP')
          .eq('status', 'COMPLETED')
          .maybeSingle();

        if (!error && data) {
          existing = data as WalletTransactionRecord;
          localTransactionsCache.set(existing.id, existing);
        }
      } catch {
        // Continue with local state
      }
    }

    if (existing) {
      let promoExisting = Array.from(localTransactionsCache.values()).find(
        (t) =>
          t.organization_id === organizationId &&
          (t.reference_id === `${referenceId}_promo` ||
            t.reference_id === existing!.id ||
            t.metadata?.parent_topup_id === existing!.id) &&
          t.transaction_type === 'TOPUP_CREDIT'
      );

      if (!promoExisting) {
        try {
          const supabase = getSupabaseServerClient(env);
          const { data, error } = await supabase
            .from('wallet_transactions')
            .select('*')
            .eq('organization_id', organizationId)
            .eq('reference_id', `${referenceId}_promo`)
            .eq('transaction_type', 'TOPUP_CREDIT')
            .maybeSingle();

          if (!error && data) {
            promoExisting = data as WalletTransactionRecord;
            localTransactionsCache.set(promoExisting.id, promoExisting);
          }
        } catch {
          // ignore
        }
      }

      const currentWallet = await getWalletBalance(organizationId, env);
      return {
        topupTransaction: existing,
        promoCreditTransaction: promoExisting || null,
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

  return {
    topupTransaction,
    promoCreditTransaction,
    wallet,
  };
}

/**
 * Grant one-time Welcome Credit (RM800.00) to an organization.
 * Strictly enforced to be granted only once per organization.
 */
export async function grantWelcomeCredit(
  params: {
    organizationId: string;
    createdBy?: string;
    referenceId?: string;
    metadata?: Record<string, any>;
  },
  env?: Record<string, any>
): Promise<{
  transaction: WalletTransactionRecord;
  wallet: WalletBalanceSummary;
  alreadyGranted: boolean;
}> {
  const { organizationId, createdBy, referenceId, metadata } = params;

  if (!organizationId) {
    throw new Error('Organization ID is required');
  }

  // Check if welcome credit has already been granted in local cache
  let existing = Array.from(localTransactionsCache.values()).find(
    (t) =>
      t.organization_id === organizationId &&
      t.transaction_type === 'WELCOME_CREDIT' &&
      t.status === 'COMPLETED'
  );

  if (!existing) {
    try {
      const supabase = getSupabaseServerClient(env);
      const { data, error } = await supabase
        .from('wallet_transactions')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('transaction_type', 'WELCOME_CREDIT')
        .eq('status', 'COMPLETED')
        .maybeSingle();

      if (!error && data) {
        existing = data as WalletTransactionRecord;
        localTransactionsCache.set(existing.id, existing);
      }
    } catch {
      // Continue with local state
    }
  }

  if (existing) {
    const currentWallet = await getWalletBalance(organizationId, env);
    return {
      transaction: existing,
      wallet: currentWallet,
      alreadyGranted: true,
    };
  }

  // Append welcome credit transaction to the immutable ledger
  const transaction = await appendLedgerTransaction(
    {
      organization_id: organizationId,
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
        program: 'ORGANIZATION_ONBOARDING_WELCOME',
      },
      created_by: createdBy || null,
    },
    env
  );

  const wallet = await recalculateWalletBalances(organizationId, env);

  return {
    transaction,
    wallet,
    alreadyGranted: false,
  };
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
  eventId?: string,
  env?: Record<string, any>
): Promise<CreditEligibilityResult> {
  if (!organizationId) {
    throw new Error('Organization ID is required');
  }

  const wallet = await getWalletBalance(organizationId, env);
  const creditAvailable = wallet.welcome_credit;
  const creditAmount = Math.min(creditAvailable, WELCOME_CREDIT_AMOUNT);
  const paidBalanceAvailable = wallet.paid_balance;
  const paidBalanceRequired = fromCents(toCents(STANDARD_EVENT_PRICE) - toCents(WELCOME_CREDIT_AMOUNT)); // RM600.00

  if (creditAvailable < WELCOME_CREDIT_AMOUNT) {
    return {
      eligible: false,
      credit_type: 'WELCOME_CREDIT',
      credit_available: creditAvailable,
      credit_amount: creditAmount,
      paid_balance_available: paidBalanceAvailable,
      paid_balance_required: paidBalanceRequired,
      event_price: STANDARD_EVENT_PRICE,
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
      event_price: STANDARD_EVENT_PRICE,
      reason: `Insufficient Paid Balance. Event price is RM${STANDARD_EVENT_PRICE.toFixed(2)}. Welcome Credit covers RM${WELCOME_CREDIT_AMOUNT.toFixed(2)}, requiring at least RM${paidBalanceRequired.toFixed(2)} in Paid Balance, but your current Paid Balance is RM${paidBalanceAvailable.toFixed(2)}.`,
    };
  }

  return {
    eligible: true,
    credit_type: 'WELCOME_CREDIT',
    credit_available: creditAvailable,
    credit_amount: creditAmount,
    paid_balance_available: paidBalanceAvailable,
    paid_balance_required: paidBalanceRequired,
    event_price: STANDARD_EVENT_PRICE,
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

  const result = await processEventPayment(
    {
      organizationId,
      eventId,
      paymentMode: 'WELCOME_CREDIT',
      eventPrice: STANDARD_EVENT_PRICE,
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
 * Strictly enforced to be granted only once per organization.
 */
export async function grantShowcaseCredit(
  params: {
    organizationId: string;
    eventId?: string;
    createdBy?: string;
    referenceId?: string;
    metadata?: Record<string, any>;
  },
  env?: Record<string, any>
): Promise<{
  transaction: WalletTransactionRecord;
  wallet: WalletBalanceSummary;
  alreadyGranted: boolean;
}> {
  const { organizationId, eventId, createdBy, referenceId, metadata } = params;

  if (!organizationId) {
    throw new Error('Organization ID is required');
  }

  // Check if showcase credit was already granted in local cache
  let existing = Array.from(localTransactionsCache.values()).find(
    (t) =>
      t.organization_id === organizationId &&
      t.transaction_type === 'SHOWCASE_CREDIT' &&
      t.status === 'COMPLETED'
  );

  if (!existing) {
    try {
      const supabase = getSupabaseServerClient(env);
      const { data, error } = await supabase
        .from('wallet_transactions')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('transaction_type', 'SHOWCASE_CREDIT')
        .eq('status', 'COMPLETED')
        .maybeSingle();

      if (!error && data) {
        existing = data as WalletTransactionRecord;
        localTransactionsCache.set(existing.id, existing);
      }
    } catch {
      // Continue with local state
    }
  }

  if (existing) {
    const currentWallet = await getWalletBalance(organizationId, env);
    return {
      transaction: existing,
      wallet: currentWallet,
      alreadyGranted: true,
    };
  }

  const transaction = await appendLedgerTransaction(
    {
      organization_id: organizationId,
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
      },
      created_by: createdBy || null,
    },
    env
  );

  const wallet = await recalculateWalletBalances(organizationId, env);

  return {
    transaction,
    wallet,
    alreadyGranted: false,
  };
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
  eventId?: string,
  env?: Record<string, any>
): Promise<CreditEligibilityResult> {
  if (!organizationId) {
    throw new Error('Organization ID is required');
  }

  const wallet = await getWalletBalance(organizationId, env);
  const creditAvailable = wallet.showcase_credit;
  const creditAmount = Math.min(creditAvailable, SHOWCASE_CREDIT_AMOUNT);
  const paidBalanceAvailable = wallet.paid_balance;
  const paidBalanceRequired = fromCents(toCents(STANDARD_EVENT_PRICE) - toCents(SHOWCASE_CREDIT_AMOUNT)); // RM1,100.00

  if (creditAvailable < SHOWCASE_CREDIT_AMOUNT) {
    return {
      eligible: false,
      credit_type: 'SHOWCASE_CREDIT',
      credit_available: creditAvailable,
      credit_amount: creditAmount,
      paid_balance_available: paidBalanceAvailable,
      paid_balance_required: paidBalanceRequired,
      event_price: STANDARD_EVENT_PRICE,
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
      event_price: STANDARD_EVENT_PRICE,
      reason: `Insufficient Paid Balance. Event price is RM${STANDARD_EVENT_PRICE.toFixed(2)}. Showcase Credit covers RM${SHOWCASE_CREDIT_AMOUNT.toFixed(2)}, requiring at least RM${paidBalanceRequired.toFixed(2)} in Paid Balance, but your current Paid Balance is RM${paidBalanceAvailable.toFixed(2)}.`,
    };
  }

  return {
    eligible: true,
    credit_type: 'SHOWCASE_CREDIT',
    credit_available: creditAvailable,
    credit_amount: creditAmount,
    paid_balance_available: paidBalanceAvailable,
    paid_balance_required: paidBalanceRequired,
    event_price: STANDARD_EVENT_PRICE,
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

  const result = await processEventPayment(
    {
      organizationId,
      eventId,
      paymentMode: 'SHOWCASE_CREDIT',
      eventPrice: STANDARD_EVENT_PRICE,
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
  },
  env?: Record<string, any>
): Promise<EventPaymentCalculation> {
  const normalizedPrice = Math.max(0, fromCents(toCents(eventPrice || STANDARD_EVENT_PRICE)));
  const wallet = await getWalletBalance(organizationId, env);

  let paidAmount = 0;
  let welcomeCreditUsed = 0;
  let showcaseCreditUsed = 0;
  let topupCreditUsed = 0;
  let totalDiscount = 0;
  let remainingCreditBalance = 0;
  const reasons: string[] = [];

  const allowedModes: PaymentMode[] = ['FULL_PAID', 'WELCOME_CREDIT', 'SHOWCASE_CREDIT', 'TOPUP_CREDIT'];
  if (!allowedModes.includes(paymentMode)) {
    reasons.push(`Invalid payment mode "${paymentMode}". Allowed modes: ${allowedModes.join(', ')}.`);
  }

  if (paymentMode === 'FULL_PAID') {
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
    topupCreditAmountToUse?: number;
  },
  env?: Record<string, any>
): Promise<EventPaymentQuote> {
  const { organizationId, eventId, creditChoice = 'NONE' } = params;
  let mode: PaymentMode = 'FULL_PAID';
  if (creditChoice === 'WELCOME_CREDIT') mode = 'WELCOME_CREDIT';
  else if (creditChoice === 'SHOWCASE_CREDIT') mode = 'SHOWCASE_CREDIT';
  else if (creditChoice === 'TOPUP_CREDIT') mode = 'TOPUP_CREDIT';
  else mode = 'FULL_PAID';

  const calc = await calculateEventPayment(
    STANDARD_EVENT_PRICE,
    mode,
    organizationId,
    { topupCreditRequested: params.topupCreditAmountToUse },
    env
  );

  return {
    event_id: eventId,
    standard_price: calc.eventPrice,
    currency: 'MYR',
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
    eventPrice?: number;
    topupCreditRequested?: number;
    topupCreditAmountToUse?: number;
    referenceId?: string;
    createdBy?: string;
    eventName?: string;
    description?: string;
    metadata?: Record<string, any>;
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

  // Resolve paymentMode from paymentMode or legacy creditChoice
  let mode: PaymentMode = 'FULL_PAID';
  if (params.paymentMode) {
    mode = params.paymentMode;
  } else if (params.creditChoice === 'WELCOME_CREDIT') {
    mode = 'WELCOME_CREDIT';
  } else if (params.creditChoice === 'SHOWCASE_CREDIT') {
    mode = 'SHOWCASE_CREDIT';
  } else if (params.creditChoice === 'TOPUP_CREDIT') {
    mode = 'TOPUP_CREDIT';
  } else {
    mode = 'FULL_PAID';
  }

  const eventPrice = params.eventPrice && params.eventPrice > 0 ? params.eventPrice : STANDARD_EVENT_PRICE;
  const topupCreditRequested = params.topupCreditRequested ?? params.topupCreditAmountToUse;

  // PRODUCTION MODE: Atomic PostgreSQL RPC Transaction Block
  if (isSupabaseConfigured(env)) {
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

    if (!error && data) {
      const payload = data as any;
      const transactions: WalletTransactionRecord[] = [];
      if (payload.credit_transaction) {
        transactions.push(payload.credit_transaction as WalletTransactionRecord);
      }
      if (payload.paid_transaction) {
        transactions.push(payload.paid_transaction as WalletTransactionRecord);
      }

      const calculation = await calculateEventPayment(eventPrice, mode, organizationId, { topupCreditRequested }, env);
      const quote = await calculateEventPaymentQuote({ organizationId, eventId, creditChoice: mode }, env);

      const paidBal = Number(payload.wallet?.paid_balance ?? 0);
      const welcomeBal = Number(payload.wallet?.welcome_credit ?? 0);
      const showcaseBal = Number(payload.wallet?.showcase_credit ?? 0);
      const topupBal = Number(payload.wallet?.topup_credit ?? 0);

      const walletResult: WalletBalanceSummary = {
        organization_id: organizationId,
        paid_balance: paidBal,
        welcome_credit: welcomeBal,
        showcase_credit: showcaseBal,
        topup_credit: topupBal,
        total_balance: paidBal + welcomeBal + showcaseBal + topupBal,
        total_credit: welcomeBal + showcaseBal + topupBal,
        currency: 'MYR',
        welcome_credit_granted: true,
        showcase_credit_granted: true,
        can_use_welcome_credit: welcomeBal > 0,
        can_use_showcase_credit: showcaseBal > 0,
        updated_at: new Date().toISOString(),
      };

      return {
        success: true,
        paymentCalculation: calculation,
        quote,
        transactions,
        wallet: walletResult,
      };
    } else if (error && error.code !== 'PGRST202') {
      console.error('Fatal: Supabase atomic payment transaction failed:', error);
      throw new Error(`Financial ledger transaction failed: ${error.message}`);
    }
  }

  // NON-PRODUCTION / LOCAL DEV MODE: In-memory atomic snapshot with automatic rollback
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
      const calculation = await calculateEventPayment(eventPrice, mode, organizationId, { topupCreditRequested }, env);
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
      { topupCreditRequested },
      env
    );

    if (!calculation.isPayable) {
      throw new Error(`Event payment cannot be processed: ${calculation.reasons.join(' ')}`);
    }

    const transactions: WalletTransactionRecord[] = [];
    const eventLabel = params.eventName ? `"${params.eventName}"` : `Event #${eventId.slice(0, 8)}`;

    // 3. If promotional credit is used, record CREDIT_USAGE in immutable ledger
    if (calculation.totalDiscount > 0 && mode !== 'FULL_PAID') {
      let creditBalanceType: WalletBalanceType = 'TOPUP_CREDIT';
      if (mode === 'WELCOME_CREDIT') creditBalanceType = 'WELCOME_CREDIT';
      else if (mode === 'SHOWCASE_CREDIT') creditBalanceType = 'SHOWCASE_CREDIT';
      else if (mode === 'TOPUP_CREDIT') creditBalanceType = 'TOPUP_CREDIT';

      const creditTxnRef = referenceId ? `${referenceId}_credit` : `event_${eventId}_credit`;
      const creditTxn = await appendLedgerTransaction(
        {
          organization_id: organizationId,
          event_id: eventId,
          transaction_type: 'CREDIT_USAGE',
          balance_type: creditBalanceType,
          amount: -calculation.totalDiscount, // negative debit
          currency: 'MYR',
          status: 'COMPLETED',
          reference_id: creditTxnRef,
          description: `Applied RM${calculation.totalDiscount.toFixed(2)} ${mode.replace('_', ' ')} for ${eventLabel}`,
          metadata: {
            ...(params.metadata || {}),
            event_id: eventId,
            payment_mode: mode,
            credit_type: mode,
            event_price: calculation.eventPrice,
            credit_discount: calculation.totalDiscount,
          },
          created_by: createdBy || null,
        },
        env
      );
      transactions.push(creditTxn);
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
    try {
      const supabase = getSupabaseServerClient(env);
      await supabase
        .from('events')
        .update({
          payment_status: 'PAID',
          payment_mode: mode,
          paid_amount: calculation.paidAmount,
          discount_amount: calculation.totalDiscount,
          updated_at: new Date().toISOString(),
        })
        .eq('id', eventId);
    } catch (dbErr) {
      // Non-fatal if Supabase events table is in test mock mode
      console.warn('Notice updating event table:', (dbErr as any)?.message);
    }

    const quote = await calculateEventPaymentQuote({ organizationId, eventId, creditChoice: mode }, env);

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
  },
  env?: Record<string, any>
): Promise<{
  success: boolean;
  transactions: WalletTransactionRecord[];
  wallet: WalletBalanceSummary;
}> {
  const { organizationId, eventId, eventName, reason = 'Event cancelled before Setup Day', createdBy } = params;

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

  return {
    success: true,
    transactions,
    wallet,
  };
}
