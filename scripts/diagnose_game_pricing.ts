/**
 * Read-Only Diagnostics Script for Game Pricing
 *
 * Checks database / local cache state for:
 * 1. USD rows currently assigned to MY
 * 2. Duplicate active rows for the same game, country, currency, and duration
 * 3. Overlapping active duration ranges
 * 4. Pricing rows with missing or invalid country/currency values
 *
 * Usage: bun scripts/diagnose_game_pricing.ts
 */

import { getSupabaseServerClient, isSupabaseConfigured } from '../server/supabase.js';
import { localGamePricingCache, doPricingRangesOverlap } from '../server/db/gamePricing.js';

interface PricingDiagnosticResult {
  usdAssignedToMy: any[];
  duplicates: any[];
  overlaps: any[];
  invalidRows: any[];
}

export async function runGamePricingDiagnostics(env: any = process.env): Promise<PricingDiagnosticResult> {
  const result: PricingDiagnosticResult = {
    usdAssignedToMy: [],
    duplicates: [],
    overlaps: [],
    invalidRows: [],
  };

  const supabase = getSupabaseServerClient(env);
  let allRows: any[] = [];

  if (supabase && isSupabaseConfigured(env)) {
    console.log('Connecting to Supabase to run read-only diagnostics...');
    const { data, error } = await supabase.from('game_pricing').select('*');
    if (error) {
      console.error('Error querying game_pricing table:', error);
      throw error;
    }
    allRows = data || [];
  } else {
    console.log('Running diagnostics on local in-memory game pricing cache...');
    for (const [_, tiers] of localGamePricingCache.entries()) {
      allRows.push(...tiers);
    }
  }

  console.log(`Inspecting ${allRows.length} pricing rows across the system...`);

  // 1. USD rows assigned to country_code = 'MY'
  result.usdAssignedToMy = allRows.filter(
    (r) => (r.currency || '').toUpperCase() === 'USD' && (r.country_code || '').toUpperCase() === 'MY'
  );

  // 2. Duplicate active rows for same (game_id, country_code, currency, min_days, max_days)
  const activeRows = allRows.filter((r) => r.is_active);
  const durationMap = new Map<string, any[]>();
  for (const r of activeRows) {
    const key = `${r.game_id}:${(r.country_code || '').toUpperCase()}:${(r.currency || '').toUpperCase()}:${r.min_days}:${r.max_days ?? 'null'}`;
    if (!durationMap.has(key)) durationMap.set(key, []);
    durationMap.get(key)!.push(r);
  }
  for (const [_, list] of durationMap.entries()) {
    if (list.length > 1) {
      result.duplicates.push(...list);
    }
  }

  // 3. Overlapping active duration ranges within same game, country, and currency
  const groupMap = new Map<string, any[]>();
  for (const r of activeRows) {
    const key = `${r.game_id}:${(r.country_code || '').toUpperCase()}:${(r.currency || '').toUpperCase()}`;
    if (!groupMap.has(key)) groupMap.set(key, []);
    groupMap.get(key)!.push(r);
  }

  for (const [_, list] of groupMap.entries()) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        if (doPricingRangesOverlap(a.min_days, a.max_days, b.min_days, b.max_days)) {
          result.overlaps.push({ a, b });
        }
      }
    }
  }

  // 4. Missing or invalid country/currency/price
  result.invalidRows = allRows.filter(
    (r) =>
      !r.country_code ||
      !r.currency ||
      !r.price ||
      Number(r.price) <= 0 ||
      r.min_days < 1 ||
      (r.max_days !== null && r.max_days !== undefined && r.max_days < r.min_days)
  );

  return result;
}

if (import.meta.main) {
  runGamePricingDiagnostics()
    .then((res) => {
      console.log('\n======================================================');
      console.log('GAME PRICING READ-ONLY DIAGNOSTIC SUMMARY');
      console.log('======================================================');
      console.log(`1. USD rows assigned to MY: ${res.usdAssignedToMy.length}`);
      if (res.usdAssignedToMy.length > 0) console.table(res.usdAssignedToMy);

      console.log(`2. Duplicate active tiers (same duration): ${res.duplicates.length}`);
      if (res.duplicates.length > 0) console.table(res.duplicates);

      console.log(`3. Overlapping active duration ranges: ${res.overlaps.length}`);
      if (res.overlaps.length > 0) console.dir(res.overlaps, { depth: 3 });

      console.log(`4. Invalid / incomplete rows: ${res.invalidRows.length}`);
      if (res.invalidRows.length > 0) console.table(res.invalidRows);

      console.log('======================================================\n');
    })
    .catch((err) => {
      console.error('Diagnostics failed:', err);
      process.exit(1);
    });
}
