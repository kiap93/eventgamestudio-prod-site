import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import worker from '../worker';
import { localEventsCache, createEvent, createOrganization, createUser, createTheme } from './db';

console.log('======================================================');
console.log('Running Cloudflare Cron Trigger & Scheduled Verification Tests');
console.log('======================================================');

// --- Section 1: Wrangler Configuration Validation ---
console.log('\n--- Section 1: Wrangler Configs [triggers] Verification ---');

const wranglerFrontendPath = path.resolve(process.cwd(), 'wrangler.toml');
assert.ok(fs.existsSync(wranglerFrontendPath), 'wrangler.toml must exist');
const wranglerFrontendContent = fs.readFileSync(wranglerFrontendPath, 'utf8');

assert.ok(
  wranglerFrontendContent.includes('[triggers]'),
  'wrangler.toml must contain a [triggers] section'
);
assert.ok(
  wranglerFrontendContent.includes('crons ='),
  'wrangler.toml [triggers] must define crons'
);

const wranglerApiPath = path.resolve(process.cwd(), 'wrangler.api.toml');
assert.ok(fs.existsSync(wranglerApiPath), 'wrangler.api.toml must exist');
const wranglerApiContent = fs.readFileSync(wranglerApiPath, 'utf8');

assert.ok(
  wranglerApiContent.includes('[triggers]'),
  'wrangler.api.toml must contain a [triggers] section'
);
assert.ok(
  wranglerApiContent.includes('crons ='),
  'wrangler.api.toml [triggers] must define crons'
);

console.log('  ✓ 1a. wrangler.toml contains [triggers] with crons schedule');
console.log('  ✓ 1b. wrangler.api.toml contains [triggers] with crons schedule');

// --- Section 2: Worker Export & Scheduled Handler ---
console.log('\n--- Section 2: Worker Scheduled Handler Verification ---');

assert.ok(worker, 'Worker default export must exist');
assert.strictEqual(
  typeof worker.scheduled,
  'function',
  'Worker must export a scheduled() function for Cloudflare cron triggers'
);

console.log('  ✓ 2a. worker.scheduled is a callable function');

// --- Section 3: Scheduled Execution & Event Lifecycle Maintenance ---
console.log('\n--- Section 3: Scheduled Cron Execution Logic ---');

const testEnv = {
  NODE_ENV: 'development',
  SUPABASE_URL: 'https://placeholder.supabase.co',
  SUPABASE_ANON_KEY: 'placeholder-anon-key',
  SUPABASE_SERVICE_ROLE_KEY: 'placeholder-service-key',
  JWT_SECRET: '0123456789abcdef0123456789abcdef',
};

const user = await createUser({
  email: `cron-owner-${Date.now()}@example.com`,
  name: 'Cron Owner',
});

const org = await createOrganization({
  name: 'Cron Org',
  owner_id: user.id,
});

const theme = await createTheme({
  name: 'Cron Theme',
  game_id: 'catch-brand',
  organization_id: org.id,
  is_system: false,
});

// Event 1: Unpaid event past end date -> should be cancelled/expired by cron
const pastUnpaidEvent = await createEvent({
  organization_id: org.id,
  game_id: 'catch-brand',
  game_theme_id: theme.id,
  name: 'Past Unpaid Gala',
  start_date: '2026-09-10',
  end_date: '2026-09-11',
  event_price: 1400,
  payment_status: 'UNPAID',
  status: 'draft',
  created_by: user.id,
}, testEnv);

// Mutate dates to past in cache
localEventsCache.set(pastUnpaidEvent.id, {
  ...pastUnpaidEvent,
  start_date: '2026-09-01',
  end_date: '2026-09-02',
  event_date: '2026-09-01',
  expires_at: '2026-09-02T23:59:59.999Z',
});

// Event 2: Paid event past end date -> should transition to completed by cron
const pastPaidEvent = await createEvent({
  organization_id: org.id,
  game_id: 'catch-brand',
  game_theme_id: theme.id,
  name: 'Past Paid Gala',
  start_date: '2026-09-10',
  end_date: '2026-09-11',
  event_price: 1400,
  payment_status: 'PAID',
  status: 'live',
  event_status: 'LIVE',
  created_by: user.id,
}, testEnv);

localEventsCache.set(pastPaidEvent.id, {
  ...pastPaidEvent,
  start_date: '2026-09-01',
  end_date: '2026-09-02',
  event_date: '2026-09-01',
  expires_at: '2026-09-02T23:59:59.999Z',
  payment_status: 'PAID',
});

// Execute the Cloudflare Worker scheduled handler
await worker.scheduled({ cron: '* * * * *', scheduledTime: Date.now() }, testEnv, {});

const updatedUnpaid = localEventsCache.get(pastUnpaidEvent.id);
assert.ok(
  updatedUnpaid?.status === 'cancelled' || updatedUnpaid?.event_status === 'CANCELLED' || updatedUnpaid?.status === 'expired',
  'Unpaid past event must be cancelled or expired by cron'
);
console.log('  ✓ 3a. Past unpaid event expired/cancelled by scheduled cron execution');

const updatedPaid = localEventsCache.get(pastPaidEvent.id);
assert.ok(
  updatedPaid?.status === 'completed' || updatedPaid?.event_status === 'COMPLETED',
  'Paid past event must be completed by cron'
);
console.log('  ✓ 3b. Past paid event completed by scheduled cron execution');

console.log('\n======================================================');
console.log('All Cloudflare Cron tests passed successfully!');
console.log('======================================================');
