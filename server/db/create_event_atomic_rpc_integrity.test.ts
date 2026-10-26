import { describe, it, expect } from 'bun:test';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';

describe('create_event_atomic RPC Integrity and Ambiguity Prevention', () => {
  const migrationsDir = join(process.cwd(), 'supabase', 'migrations');
  const schemaFile = join(process.cwd(), 'supabase', 'schema.sql');
  const correctiveMigrationFile = join(migrationsDir, '20261025000000_resolve_create_event_atomic_rpc_ambiguity.sql');
  const eventsBackendFile = join(process.cwd(), 'server', 'db', 'events.ts');

  it('corrective migration file exists and is well-formed', () => {
    expect(existsSync(correctiveMigrationFile)).toBe(true);
    const content = readFileSync(correctiveMigrationFile, 'utf8');

    // Must dynamically drop all existing overloads from pg_proc
    expect(content).toContain('pg_proc');
    expect(content).toContain("proname = 'create_event_atomic'");
    expect(content).toContain("EXECUTE 'DROP FUNCTION public.create_event_atomic(' || r.args || ')'");

    // Must explicitly drop historical signatures
    expect(content).toContain('DROP FUNCTION IF EXISTS public.create_event_atomic(');
    expect(content).toContain('VARCHAR');

    // Must create the single canonical function
    expect(content).toContain('CREATE OR REPLACE FUNCTION public.create_event_atomic(');

    // Must grant to service_role and notify PostgREST
    expect(content).toContain('GRANT EXECUTE ON FUNCTION public.create_event_atomic');
    expect(content).toContain('TO service_role');
    expect(content).toContain("NOTIFY pgrst, 'reload schema'");
  });

  it('canonical SQL signature uses TEXT and not VARCHAR in the parameter list', () => {
    const content = readFileSync(correctiveMigrationFile, 'utf8');
    const funcDefMatch = content.match(/CREATE OR REPLACE FUNCTION public\.create_event_atomic\s*\(([\s\S]*?)\)\s*RETURNS/i);
    expect(funcDefMatch).toBeTruthy();
    const paramsList = funcDefMatch![1];

    // Must not contain character varying or varchar in the canonical definition
    expect(paramsList.toLowerCase()).not.toContain('character varying');
    expect(paramsList.toLowerCase()).not.toContain('varchar');

    // Must use TEXT for string parameters
    expect(paramsList).toContain('p_name TEXT');
    expect(paramsList).toContain('p_start_date TEXT');
    expect(paramsList).toContain('p_end_date TEXT');
    expect(paramsList).toContain('p_event_date TEXT');
    expect(paramsList).toContain('p_status TEXT');
    expect(paramsList).toContain('p_event_status TEXT');
    expect(paramsList).toContain('p_payment_status TEXT');
    expect(paramsList).toContain('p_event_currency TEXT');
    expect(paramsList).toContain('p_payment_mode TEXT');
    expect(paramsList).toContain('p_public_token TEXT');
    expect(paramsList).toContain('p_event_timezone TEXT');
    expect(paramsList).toContain('p_cancel_reason TEXT');

    // Must have UUID and NUMERIC parameters
    expect(paramsList).toContain('p_organization_id UUID');
    expect(paramsList).toContain('p_game_id UUID');
    expect(paramsList).toContain('p_game_theme_id UUID');
    expect(paramsList).toContain('p_starts_at TIMESTAMPTZ');
    expect(paramsList).toContain('p_expires_at TIMESTAMPTZ');
    expect(paramsList).toContain('p_event_price NUMERIC');
    expect(paramsList).toContain('p_paid_amount NUMERIC');
    expect(paramsList).toContain('p_discount_amount NUMERIC');
    expect(paramsList).toContain('p_created_by UUID');
    expect(paramsList).toContain('p_event_id UUID');
    expect(paramsList).toContain('p_max_pending_events INT');
    expect(paramsList).toContain('p_skip_pending_limit_check BOOLEAN');
    expect(paramsList).toContain('p_pricing_id UUID');
    expect(paramsList).toContain('p_duration_days INT');
  });

  it('backend rpcParams in server/db/events.ts matches all 26 canonical SQL parameters', () => {
    const backendContent = readFileSync(eventsBackendFile, 'utf8');
    const rpcCallMatch = backendContent.match(/const\s+rpcParams\s*=\s*\{([\s\S]*?)\};/);
    expect(rpcCallMatch).toBeTruthy();
    const rpcParamsBlock = rpcCallMatch![1];

    const expectedParams = [
      'p_organization_id',
      'p_game_theme_id',
      'p_name',
      'p_start_date',
      'p_end_date',
      'p_starts_at',
      'p_expires_at',
      'p_game_id',
      'p_event_date',
      'p_status',
      'p_event_status',
      'p_payment_status',
      'p_cancel_reason',
      'p_event_price',
      'p_event_currency',
      'p_paid_amount',
      'p_discount_amount',
      'p_payment_mode',
      'p_public_token',
      'p_created_by',
      'p_event_id',
      'p_max_pending_events',
      'p_skip_pending_limit_check',
      'p_event_timezone',
      'p_pricing_id',
      'p_duration_days'
    ];

    expect(expectedParams.length).toBe(26);

    for (const param of expectedParams) {
      expect(rpcParamsBlock).toContain(param);
    }
  });

  it('schema.sql contains the drop logic and exactly one create_event_atomic definition', () => {
    const schemaContent = readFileSync(schemaFile, 'utf8');
    const matches = schemaContent.match(/CREATE OR REPLACE FUNCTION public\.create_event_atomic/g);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBe(1);

    // Verify it cleans up overloads first
    expect(schemaContent).toContain("proname = 'create_event_atomic'");
  });

  it('no subsequent migration reintroduces an overloaded or obsolete create_event_atomic', () => {
    const files = readdirSync(migrationsDir).sort();
    const indexOfCorrective = files.indexOf('20261025000000_resolve_create_event_atomic_rpc_ambiguity.sql');
    expect(indexOfCorrective).toBeGreaterThan(-1);

    const subsequentMigrations = files.slice(indexOfCorrective + 1);
    for (const file of subsequentMigrations) {
      if (file.endsWith('.sql')) {
        const sql = readFileSync(join(migrationsDir, file), 'utf8');
        expect(sql).not.toContain('CREATE OR REPLACE FUNCTION public.create_event_atomic');
      }
    }
  });

  it('verifies canonical function preserves all business rules', () => {
    const content = readFileSync(correctiveMigrationFile, 'utf8');

    // Rule 1: Organization lock
    expect(content).toContain('SELECT * INTO v_org');
    expect(content).toContain('FOR UPDATE');

    // Rule 2: Country normalization (NULL preserved)
    expect(content).toContain('v_org_country := NULL');

    // Rule 3: Timezone handling
    expect(content).toContain('v_event_timezone := COALESCE(NULLIF(TRIM(p_event_timezone), \'\'), \'Asia/Singapore\');');

    // Rule 4: Inclusive calendar days calculation
    expect(content).toContain('v_calculated_days := (v_end_date - v_start_date) + 1;');

    // Rule 5: Active game status check
    expect(content).toContain("v_game.status <> 'active'");

    // Rule 6: Pending event limit excluding expired events
    expect(content).toContain("(expires_at AT TIME ZONE COALESCE(NULLIF(TRIM(event_timezone), ''), 'Asia/Singapore'))::date");

    // Rule 7: Skip pending limit flag respected
    expect(content).toContain('IF v_is_pending AND NOT COALESCE(p_skip_pending_limit_check, false) THEN');

    // Rule 8: Token generation loop
    expect(content).toContain("encode(gen_random_bytes(16), 'hex')");

    // Rule 9: Returning event object with all fields
    expect(content).toContain("'success', true");
    expect(content).toContain("'event', to_jsonb(v_event)");
  });
});
